"""
sync_scores.py — Live PGA Tour scoring sync for FantasyGolfV2

Fetches the ESPN leaderboard for all tournaments with status='live' in Firestore,
calculates estimated payouts, and writes back to each player's Firestore doc.

Each tournament doc must have:
  - espnEventId: string  (e.g. "401580360")
  - purse:       number  (e.g. 20000000)
  - status:      "live"

Each player doc at tournaments/{slug}/players/{name} will be updated with:
  - liveEarnings:    int     estimated payout in dollars
  - currentPosition: string  e.g. "T2", "1", "CUT"
  - currentScore:    string  e.g. "-12", "E", "+3", "CUT"

Automated season flow (runs every hour via GitHub Actions):
  1. auto_go_live: flips open → live for any tournament whose lockDate has passed
  2. Sync scores for all 'live' tournaments
  3. auto_finalize: flips live → locked when ESPN marks the event complete

Usage:
  python sync_scores.py                                      # sync all 'live' tournaments
  python sync_scores.py --slug masters-2026                  # sync one tournament by slug
  python sync_scores.py --check-names --slug masters-2026    # compare ESPN vs Firestore names

  # Dry-run (NO Firebase credentials needed — just prints what would be written):
  python sync_scores.py --dry-run --event-id 401580360 --purse 20000000

  # Dry-run using an existing tournament's stored event ID + purse:
  python sync_scores.py --dry-run --slug masters-2026

Firebase credentials (pick one):
  1. Set FIREBASE_SERVICE_ACCOUNT env var to the JSON content of your service account key
  2. Place service-account.json in the scripts/ directory
  3. Use Application Default Credentials (gcloud auth application-default login)
  (Not needed when using --dry-run with --event-id and --purse)
"""

import argparse
import json
import os
import sys
import traceback
import unicodedata
from datetime import datetime, timezone

import requests
from google.cloud.firestore_v1 import FieldFilter

from pga_payout_table import get_payout


# ---------------------------------------------------------------------------
# Name normalization
# ---------------------------------------------------------------------------

# Characters that don't decompose via Unicode NFD and need explicit substitution
# so that ESPN names like "Nicolai Højgaard" → "Nicolai Hojgaard"
_CHAR_MAP = str.maketrans({
    'ø': 'o', 'Ø': 'O',
    'æ': 'ae', 'Æ': 'Ae',
    'ð': 'd', 'Ð': 'D',
    'þ': 'th', 'Þ': 'Th',
    'ß': 'ss',
    'ł': 'l', 'Ł': 'L',
})


def normalize_name(name: str) -> str:
    """
    Normalize an ESPN player name to match our CSV-based Firestore doc IDs.

    ESPN uses proper diacritics (e.g. "Nicolai Højgaard", "Ludvig Åberg") but
    our uploaded CSVs use plain ASCII ("Nicolai Hojgaard", "Ludvig Aberg").
    This function strips/replaces diacritics so the names match.

    Handles:
      ø → o   (Højgaard → Hojgaard)
      Å/å → A/a  (Åberg → Aberg)
      é → e, ü → u, ñ → n, etc.  (most diacritics via NFD decomposition)
    """
    # Step 1: explicit substitutions for chars that don't NFD-decompose to ASCII
    name = name.translate(_CHAR_MAP)
    # Step 2: NFD decompose then drop all combining/accent marks
    nfd = unicodedata.normalize('NFD', name)
    return ''.join(c for c in nfd if unicodedata.category(c) != 'Mn')


# ---------------------------------------------------------------------------
# Firebase init (imported lazily so --dry-run needs only `requests`)
# ---------------------------------------------------------------------------

def init_firebase():
    import firebase_admin
    from firebase_admin import credentials, firestore

    service_account_env = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    local_key = os.path.join(os.path.dirname(__file__), "service-account.json")

    if service_account_env:
        cred = credentials.Certificate(json.loads(service_account_env))
    elif os.path.exists(local_key):
        cred = credentials.Certificate(local_key)
    else:
        # Fall back to Application Default Credentials
        cred = credentials.ApplicationDefault()

    firebase_admin.initialize_app(cred)
    return firestore.client()


# ---------------------------------------------------------------------------
# ESPN helpers
# ---------------------------------------------------------------------------

# The scoreboard endpoint (with ?event=) is the reliable source for both
# active and recently completed tournaments. The /leaderboard endpoint
# is frequently unavailable or returns 404 and is not used.
SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard"
SCOREBOARD_EVENT_URL = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?event={event_id}"


def fetch_current_event_id() -> str | None:
    """Return the ESPN event ID for the currently active PGA Tour event."""
    try:
        data = requests.get(SCOREBOARD_URL, timeout=10).json()
        events = data.get("events", [])
        if events:
            return events[0]["id"]
    except Exception as e:
        print(f"[warn] Could not fetch scoreboard: {e}")
    return None


def fetch_competition(event_id: str) -> tuple[list[dict], bool, str]:
    """
    Fetch ESPN scoreboard for event_id.

    Returns:
        competitors: raw ESPN competitor list (empty list on error)
        is_complete: True if ESPN reports the tournament as finished
        event_name:  display name from ESPN (fallback: "Event {event_id}")
    """
    url = SCOREBOARD_EVENT_URL.format(event_id=event_id)
    try:
        data = requests.get(url, timeout=10).json()
        events = data.get("events", [])
        if not events:
            print(f"[warn] ESPN returned no events for event {event_id}")
            return [], False, f"Event {event_id}"

        event = events[0]
        competitions = event.get("competitions", [])
        if not competitions:
            print(f"[warn] ESPN returned no competitions for event {event_id}")
            return [], False, event.get("name") or f"Event {event_id}"

        competition = competitions[0]

        competitors = competition.get("competitors", [])
        event_name = event.get("name") or f"Event {event_id}"

        # Completed flag lives on both the event and the competition
        is_complete = (
            event.get("status", {}).get("type", {}).get("completed", False)
            or competition.get("status", {}).get("type", {}).get("completed", False)
        )

        return competitors, is_complete, event_name
    except Exception as e:
        print(f"[error] Could not fetch scoreboard for event {event_id}: {e}")
        return [], False, f"Event {event_id}"


def get_rounds_played(competitor: dict) -> int:
    """Number of completed rounds for this player based on their linescores."""
    linescores = competitor.get("linescores", [])
    periods = {ls.get("period", 0) for ls in linescores}
    return max(periods, default=0)


# ---------------------------------------------------------------------------
# Payout calculation
# ---------------------------------------------------------------------------

def build_payout_map(competitors: list[dict], purse: float) -> dict[str, dict]:
    """
    Given the ESPN scoreboard competitor list and purse, return:
        player_name -> { liveEarnings, currentPosition, currentScore }

    Position comes from ESPN's `order` field (their authoritative ranking).
    Ties are detected by grouping consecutive players with identical scores.
    Cut players are identified by having played fewer rounds than the field max
    (e.g. 2 rounds when the leaders are on round 3 or 4).
    """
    if not competitors:
        return {}

    # Determine how far into the tournament the field is
    max_rounds = max(get_rounds_played(c) for c in competitors)

    # Sort by ESPN's order field — this is the authoritative leaderboard ranking
    sorted_comps = sorted(competitors, key=lambda c: c.get("order", 9999))

    result: dict[str, dict] = {}
    i = 0

    while i < len(sorted_comps):
        comp = sorted_comps[i]
        name = normalize_name(comp["athlete"]["displayName"])
        score = comp.get("score", "")
        rounds = get_rounds_played(comp)

        # Cut: played fewer rounds than the field maximum once the cut has happened
        # (max_rounds > 2 means rounds 3/4 are underway, so a 2-round player is out)
        is_cut = max_rounds > 2 and rounds < max_rounds

        if is_cut:
            result[name] = {
                "liveEarnings": 0,
                "currentPosition": "CUT",
                "currentScore": score,
            }
            i += 1
            continue

        # Find the full tie group: consecutive active players sharing the same score
        j = i
        while j < len(sorted_comps):
            nxt = sorted_comps[j]
            nxt_rounds = get_rounds_played(nxt)
            nxt_cut = max_rounds > 2 and nxt_rounds < max_rounds
            if nxt_cut or nxt.get("score", "") != score:
                break
            j += 1

        tied_count = j - i
        pos_num = i + 1
        payout = get_payout(pos_num, tied_count, purse)
        pos_str = f"T{pos_num}" if tied_count > 1 else str(pos_num)

        for k in range(i, j):
            c = sorted_comps[k]
            result[normalize_name(c["athlete"]["displayName"])] = {
                "liveEarnings": payout,
                "currentPosition": pos_str,
                "currentScore": score,
            }

        i = j

    return result


# ---------------------------------------------------------------------------
# Firestore writes
# ---------------------------------------------------------------------------

BATCH_LIMIT = 499  # Firestore batch limit is 500 ops


def write_live_scores(db, slug: str, payout_map: dict[str, dict]):
    """Write liveEarnings / currentPosition / currentScore to each player doc."""
    batch = db.batch()
    count = 0

    for name, data in payout_map.items():
        ref = db.document(f"tournaments/{slug}/players/{name}")
        batch.set(ref, data, merge=True)
        count += 1
        if count % BATCH_LIMIT == 0:
            batch.commit()
            batch = db.batch()

    if count % BATCH_LIMIT != 0:
        batch.commit()

    # Stamp liveUpdatedAt on the tournament doc
    db.document(f"tournaments/{slug}").set(
        {"liveUpdatedAt": datetime.now(timezone.utc)},
        merge=True,
    )

    return count


# ---------------------------------------------------------------------------
# Automated season flow helpers
# ---------------------------------------------------------------------------

def auto_go_live(db) -> list[str]:
    """
    Find all 'open' tournaments whose lockDate has passed and flip them to 'live'.
    Returns the list of slugs that were flipped.

    This runs at the top of every scheduled sync so picks get locked automatically
    when the tournament starts — no manual "Go Live" click needed.
    """
    now = datetime.now(timezone.utc)
    open_docs = (
        db.collection("tournaments")
        .where(filter=FieldFilter("status", "==", "open"))
        .stream()
    )
    flipped = []

    for snap in open_docs:
        t = snap.to_dict()
        lock_date = t.get("lockDate")
        if lock_date is None:
            continue
        # Firestore returns DatetimeWithNanoseconds (subclass of datetime, UTC-aware)
        if lock_date <= now:
            db.document(f"tournaments/{snap.id}").update({"status": "live"})
            print(f"[auto-live] '{snap.id}' lockDate passed — status set to 'live'")
            flipped.append(snap.id)

    return flipped


# ---------------------------------------------------------------------------
# Name verification helper
# ---------------------------------------------------------------------------

def check_names(db, slug: str, event_id: str):
    """
    Compare ESPN player names against existing Firestore player docs.
    Prints any mismatches so you can fix the CSV before the tournament.
    """
    print(f"\nChecking names for {slug} (ESPN event {event_id})...\n")

    competitors, _, _ = fetch_competition(event_id)
    max_rounds = max((get_rounds_played(c) for c in competitors), default=0)
    espn_names = {
        normalize_name(c["athlete"]["displayName"]) for c in competitors
        if not (max_rounds > 2 and get_rounds_played(c) < max_rounds)
    }

    players_ref = db.collection(f"tournaments/{slug}/players")
    fs_names = {doc.id for doc in players_ref.stream()}

    matched = espn_names & fs_names
    only_espn = espn_names - fs_names
    only_fs = fs_names - espn_names

    print(f"  Matched:           {len(matched)}")
    print(f"  Only in ESPN:      {len(only_espn)}")
    print(f"  Only in Firestore: {len(only_fs)}")

    if only_espn:
        print("\nESPN names NOT in Firestore (live scores won't link):")
        for n in sorted(only_espn):
            print(f"  - {n}")

    if only_fs:
        print("\nFirestore names NOT in ESPN (may be correct, just not playing):")
        for n in sorted(only_fs):
            print(f"  - {n}")

    if not only_espn:
        print("\nAll ESPN names matched Firestore docs.")


# ---------------------------------------------------------------------------
# Dry run (no Firestore writes)
# ---------------------------------------------------------------------------

def dry_run_tournament(event_id: str, purse: float):
    """
    Fetch ESPN leaderboard and print a formatted preview of what would be
    written to Firestore. No Firebase credentials required.
    """
    print(f"\nFetching leaderboard for event {event_id} (purse ${purse:,.0f})...")
    competitors, is_complete, event_name = fetch_competition(event_id)
    if not competitors:
        print("No competitors returned. The tournament may not be live yet.")
        return

    payout_map = build_payout_map(competitors, purse)

    active = sorted(
        [(n, d) for n, d in payout_map.items() if d["currentPosition"] not in ("CUT", "WD", "MDF")],
        key=lambda x: x[1]["liveEarnings"],
        reverse=True,
    )
    cut = [(n, d) for n, d in payout_map.items() if d["currentPosition"] in ("CUT", "WD", "MDF")]

    print(f"\n{'─' * 62}")
    print(f"  DRY RUN — {event_name}")
    status_str = "COMPLETE" if is_complete else "IN PROGRESS"
    print(f"  Purse ${purse:,.0f}  |  {len(active)} active  |  {len(cut)} cut/WD  |  {status_str}")
    print(f"{'─' * 62}")
    print(f"  {'Pos':<6}  {'Player':<28}  {'Score':<6}  {'Est. Payout':>12}")
    print(f"  {'─'*6}  {'─'*28}  {'─'*6}  {'─'*12}")

    for name, d in active[:25]:
        payout = f"${d['liveEarnings']:>11,.0f}"
        print(f"  {d['currentPosition']:<6}  {name:<28}  {d['currentScore']:<6}  {payout}")

    if len(active) > 25:
        print(f"  ... and {len(active) - 25} more")

    if cut:
        print(f"\n  CUT / WD ({len(cut)} players): " + ", ".join(n for n, _ in cut[:8]) +
              (f" + {len(cut) - 8} more" if len(cut) > 8 else ""))

    print(f"{'─' * 62}")
    print(f"  Total players: {len(payout_map)}  |  No Firestore writes made.\n")
    if is_complete:
        print("  NOTE: ESPN marks this event as COMPLETE — auto_finalize would set status='locked'.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def sync_tournament(db, slug: str, event_id: str, purse: float):
    print(f"[{slug}] Fetching leaderboard (event {event_id}, purse ${purse:,.0f})...")
    competitors, is_complete, _ = fetch_competition(event_id)
    if not competitors:
        print(f"[{slug}] No competitors returned — skipping.")
        return

    payout_map = build_payout_map(competitors, purse)
    count = write_live_scores(db, slug, payout_map)
    print(f"[{slug}] Updated {count} players. liveUpdatedAt stamped.")

    # Auto-finalize: if ESPN says the event is done, lock the tournament
    if is_complete:
        db.document(f"tournaments/{slug}").update({"status": "locked"})
        print(f"[{slug}] ESPN reports event complete — status set to 'locked'.")


def main():
    parser = argparse.ArgumentParser(description="Sync live PGA Tour scores to Firestore")
    parser.add_argument("--check-names", action="store_true",
                        help="Compare ESPN names vs Firestore and exit (no writes)")
    parser.add_argument("--slug", type=str, default=None,
                        help="Sync a specific tournament slug (bypasses status='live' filter)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Fetch ESPN data and print results without writing to Firestore")
    parser.add_argument("--event-id", type=str, default=None,
                        help="ESPN event ID — use with --dry-run to skip Firestore entirely")
    parser.add_argument("--purse", type=float, default=None,
                        help="Prize purse in dollars — use with --dry-run and --event-id")
    args = parser.parse_args()

    # ── Fully standalone dry run (no Firebase needed) ──────────────────────
    if args.dry_run and args.event_id and args.purse:
        dry_run_tournament(args.event_id, args.purse)
        return

    # All other modes need Firebase
    db = init_firebase()

    if args.slug:
        t_ref = db.document(f"tournaments/{args.slug}")
        t = t_ref.get().to_dict()
        if not t:
            print(f"Tournament '{args.slug}' not found in Firestore.")
            sys.exit(1)

        event_id = args.event_id or t.get("espnEventId")
        purse = args.purse or t.get("purse", 0)

        if not event_id:
            print(f"Tournament '{args.slug}' has no espnEventId set.")
            sys.exit(1)
        if not purse:
            print(f"Tournament '{args.slug}' has no purse set.")
            sys.exit(1)

        if args.check_names:
            check_names(db, args.slug, event_id)
        elif args.dry_run:
            dry_run_tournament(event_id, purse)
        else:
            sync_tournament(db, args.slug, event_id, purse)
        return

    if args.dry_run:
        print("For a standalone dry run, provide --event-id and --purse.")
        print("Example: python sync_scores.py --dry-run --event-id 401580360 --purse 20000000")
        sys.exit(1)

    # ── Automated season flow ───────────────────────────────────────────────
    # Step 1: flip any open tournaments whose lockDate has now passed
    try:
        auto_go_live(db)
    except Exception:
        print("[error] auto_go_live failed:")
        traceback.print_exc()

    # Step 2: sync scores (and auto-finalize) for all live tournaments
    live_docs = (
        db.collection("tournaments")
        .where(filter=FieldFilter("status", "==", "live"))
        .stream()
    )
    live_list = [(doc.id, doc.to_dict()) for doc in live_docs]

    if not live_list:
        print("No tournaments with status='live' found. Nothing to sync.")
        return

    errors = []
    for slug, t in live_list:
        event_id = t.get("espnEventId")
        purse = t.get("purse", 0)

        if not event_id or not purse:
            print(f"[{slug}] Skipping — missing espnEventId or purse in Firestore doc.")
            continue

        if args.check_names:
            try:
                check_names(db, slug, event_id)
            except Exception:
                print(f"[{slug}] check_names failed:")
                traceback.print_exc()
                errors.append(slug)
        else:
            try:
                sync_tournament(db, slug, event_id, purse)
            except Exception:
                print(f"[{slug}] sync_tournament failed:")
                traceback.print_exc()
                errors.append(slug)

    if errors:
        print(f"\n[error] Failed to sync {len(errors)} tournament(s): {', '.join(errors)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
