// Pure aggregation helpers for the Season Stats page.
// All inputs come from Firestore reads done in the page component.

function rankWithTies(values) {
  // values: array of {key, score}. Returns Map<key, rank> with standard competition ranking (1,2,2,4).
  const sorted = [...values].sort((a, b) => b.score - a.score)
  const out = new Map()
  let lastScore = null
  let lastRank = 0
  sorted.forEach((v, i) => {
    const rank = v.score === lastScore ? lastRank : i + 1
    out.set(v.key, rank)
    lastScore = v.score
    lastRank = rank
  })
  return out
}

// tournaments: [{ id, name, players: { golferName: { price, earnings } } }]
// picks: [{ tournamentId, userId, golfer_ids: [...] }]
// users:  [{ uid, displayName, teamName, photoUrl }]
export function computeSeasonStats({ tournaments, picks, users }) {
  const effEarnings = p => (p?.earnings ?? 0) > 0 ? p.earnings : (p?.liveEarnings ?? 0)
  const toDate = ts => ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null)

  // Score any tournament that has at least one earnings (final or live) > 0
  const scoredTournaments = tournaments.filter(t =>
    Object.values(t.players || {}).some(p => effEarnings(p) > 0)
  )

  // Newest 2 scored tournaments are the "hot" window
  const recentScoredIds = new Set(
    [...scoredTournaments]
      .sort((a, b) => (toDate(b.startDate) ?? 0) - (toDate(a.startDate) ?? 0))
      .slice(0, 2)
      .map(t => t.id)
  )

  const picksByTournament = new Map()
  for (const p of picks) {
    if (!picksByTournament.has(p.tournamentId)) picksByTournament.set(p.tournamentId, [])
    picksByTournament.get(p.tournamentId).push(p)
  }

  // Per user accumulators
  const perUser = new Map()
  for (const u of users) {
    perUser.set(u.uid, {
      uid: u.uid,
      displayName: u.displayName || 'Unknown',
      teamName: u.teamName || '',
      photoUrl: u.photoUrl || '',
      totalEarnings: 0,
      tournamentsPlayed: 0,
      bestFinish: null,            // { rank, tournamentName, tournamentId, earnings }
      wins: 0,
      finishes: [],                // [{ tournamentId, tournamentName, rank, earnings }]
      golferTotals: new Map(),     // name -> { earnings, picks }
      valuePicks: new Map(),       // name -> { ratios: [...], earningsTotal, priceTotal, picks }
    })
  }

  for (const t of scoredTournaments) {
    const tPicks = picksByTournament.get(t.id) || []
    if (tPicks.length === 0) continue

    // Compute each user's earnings for this tournament
    const scores = tPicks.map(p => {
      const earnings = (p.golfer_ids || []).reduce((s, name) => {
        const meta = t.players?.[name]
        return s + effEarnings(meta)
      }, 0)
      return { key: p.userId, score: earnings, pick: p }
    })

    const rankMap = rankWithTies(scores)

    for (const s of scores) {
      const u = perUser.get(s.key)
      if (!u) continue
      const rank = rankMap.get(s.key)
      u.totalEarnings += s.score
      u.tournamentsPlayed += 1
      if (rank === 1) u.wins += 1
      if (u.bestFinish === null || rank < u.bestFinish.rank) {
        u.bestFinish = { rank, tournamentName: t.name, tournamentId: t.id, earnings: s.score }
      }
      u.finishes.push({
        tournamentId: t.id,
        tournamentName: t.name,
        rank,
        earnings: s.score,
        totalPlayers: scores.length,
      })

      for (const name of s.pick.golfer_ids || []) {
        const meta = t.players?.[name]
        const earnings = effEarnings(meta)
        const price = meta?.price ?? 0

        const gt = u.golferTotals.get(name) || { earnings: 0, picks: 0 }
        gt.earnings += earnings
        gt.picks += 1
        u.golferTotals.set(name, gt)

        if (price > 0) {
          const vp = u.valuePicks.get(name) || { ratios: [], earningsTotal: 0, priceTotal: 0, picks: 0 }
          vp.ratios.push(earnings / price)
          vp.earningsTotal += earnings
          vp.priceTotal += price
          vp.picks += 1
          u.valuePicks.set(name, vp)
        }
      }
    }
  }

  // Finalize per user
  const finalized = [...perUser.values()].map(u => {
    const topGolfers = [...u.golferTotals.entries()]
      .map(([name, v]) => ({ name, earnings: v.earnings, picks: v.picks }))
      .sort((a, b) => b.earnings - a.earnings)
      .slice(0, 3)

    let bestValue = null
    for (const [name, v] of u.valuePicks.entries()) {
      const avgRatio = v.ratios.reduce((s, r) => s + r, 0) / v.ratios.length
      if (avgRatio <= 0) continue
      if (!bestValue || avgRatio > bestValue.ratio) {
        bestValue = {
          name,
          ratio: avgRatio,
          picks: v.picks,
          earnings: v.earningsTotal,
          avgPrice: v.priceTotal / v.picks,
        }
      }
    }

    const avgFinish = u.finishes.length
      ? u.finishes.reduce((s, f) => s + f.rank, 0) / u.finishes.length
      : null

    return {
      uid: u.uid,
      displayName: u.displayName,
      teamName: u.teamName,
      photoUrl: u.photoUrl,
      totalEarnings: u.totalEarnings,
      tournamentsPlayed: u.tournamentsPlayed,
      wins: u.wins,
      bestFinish: u.bestFinish,
      avgFinish,
      finishes: u.finishes.sort((a, b) => a.rank - b.rank),
      topGolfers,
      bestValue,
    }
  })

  finalized.sort((a, b) => b.totalEarnings - a.totalEarnings)

  // Player-level aggregates across the whole league
  const golferAgg = new Map() // name -> { earnings, picks, ratios:[], earningsHits, bestSingle:{earnings,tournamentName} }
  for (const t of scoredTournaments) {
    const tPicks = picksByTournament.get(t.id) || []
    for (const p of tPicks) {
      for (const name of p.golfer_ids || []) {
        const meta = t.players?.[name]
        const earnings = effEarnings(meta)
        const price = meta?.price ?? 0

        const g = golferAgg.get(name) || {
          name,
          earnings: 0,
          picks: 0,
          ratios: [],
          earningsHits: 0,
          bestSingle: null,
          totalPrice: 0,
          recentEarnings: 0,
          recentPicks: 0,
        }
        g.earnings += earnings
        g.picks += 1
        g.totalPrice += price
        if (earnings > 0) g.earningsHits += 1
        if (price > 0) g.ratios.push(earnings / price)
        if (!g.bestSingle || earnings > g.bestSingle.earnings) {
          g.bestSingle = { earnings, tournamentName: t.name, tournamentId: t.id }
        }
        if (recentScoredIds.has(t.id)) {
          g.recentEarnings += earnings
          g.recentPicks += 1
        }
        golferAgg.set(name, g)
      }
    }
  }

  const golfers = [...golferAgg.values()].map(g => ({
    name: g.name,
    earnings: g.earnings,
    picks: g.picks,
    avgPrice: g.picks > 0 ? g.totalPrice / g.picks : 0,
    bestSingle: g.bestSingle,
    earnRate: g.picks > 0 ? g.earningsHits / g.picks : 0,
    avgRatio: g.ratios.length > 0 ? g.ratios.reduce((s, r) => s + r, 0) / g.ratios.length : 0,
    recentEarnings: g.recentEarnings,
    recentPicks: g.recentPicks,
  }))

  const recentTournamentNames = [...scoredTournaments]
    .filter(t => recentScoredIds.has(t.id))
    .sort((a, b) => (toDate(b.startDate) ?? 0) - (toDate(a.startDate) ?? 0))
    .map(t => t.name)

  return {
    users: finalized,
    golfers,
    recentTournamentNames,
    scoredTournamentCount: scoredTournaments.length,
    totalTournamentCount: tournaments.length,
  }
}
