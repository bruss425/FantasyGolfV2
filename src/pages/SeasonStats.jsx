import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import { getHeadshotUrl } from '../data/players'
import Avatar from '../components/Avatar'
import { computeSeasonStats } from '../lib/seasonStats'

function fmt(n) {
  if (!n || n === 0) return '$0'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${n.toLocaleString()}`
}

function ordinal(n) {
  if (n == null) return '—'
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

const MEDALS = {
  1: 'bg-yellow-400 text-yellow-900',
  2: 'bg-slate-400 text-slate-900',
  3: 'bg-amber-600 text-white',
}

function GolferTile({ name, sublabel, accent }) {
  const [imgOk, setImgOk] = useState(true)
  return (
    <div className="flex flex-col items-center text-center min-w-0">
      <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-700 mb-1.5 ring-2 ring-gray-800">
        {imgOk ? (
          <img
            src={getHeadshotUrl(name)}
            alt={name}
            className="w-full h-full object-cover object-top"
            onError={() => setImgOk(false)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
            {name.split(' ').map(w => w[0]).join('').slice(0, 2)}
          </div>
        )}
      </div>
      <p className="text-xs text-white font-semibold truncate w-full leading-tight">{name}</p>
      {sublabel && (
        <p className={`text-xs tabular-nums mt-0.5 ${accent || 'text-emerald-400'}`}>{sublabel}</p>
      )}
    </div>
  )
}

function MeStatBlock({ label, value, sub }) {
  return (
    <div className="bg-gray-800/60 border border-gray-700/60 rounded-2xl p-3 text-center">
      <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">{label}</p>
      <p className="text-white text-xl font-black mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function UserDetail({ stats }) {
  if (stats.tournamentsPlayed === 0) {
    return <p className="text-xs text-gray-500 italic">No scored tournaments yet for this player.</p>
  }
  return (
    <div className="space-y-4">
      {/* Top 3 golfers */}
      <div>
        <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Top Golfers</p>
        {stats.topGolfers.length === 0 ? (
          <p className="text-xs text-gray-600">No earnings yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {stats.topGolfers.map(g => (
              <GolferTile key={g.name} name={g.name} sublabel={fmt(g.earnings)} />
            ))}
          </div>
        )}
      </div>

      {/* Best value */}
      {stats.bestValue && (
        <div>
          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Best Value</p>
          <div className="bg-gradient-to-r from-emerald-900/40 to-gray-800/60 border border-emerald-700/40 rounded-2xl p-3 flex items-center gap-3">
            <GolferTile
              name={stats.bestValue.name}
              sublabel={`${stats.bestValue.ratio.toFixed(2)}× value`}
              accent="text-emerald-300 font-bold"
            />
            <div className="flex-1 text-xs text-gray-400 space-y-0.5">
              <p>Avg price: <span className="text-white tabular-nums">{fmt(stats.bestValue.avgPrice)}</span></p>
              <p>Total earnings: <span className="text-emerald-400 tabular-nums">{fmt(stats.bestValue.earnings)}</span></p>
              <p>Picked: <span className="text-white">{stats.bestValue.picks}×</span></p>
            </div>
          </div>
        </div>
      )}

      {/* Finish history */}
      <div>
        <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Tournament Finishes</p>
        <div className="space-y-1.5">
          {stats.finishes.map(f => (
            <Link
              key={f.tournamentId}
              to={`/leaderboard/${f.tournamentId}`}
              className="flex items-center justify-between gap-3 bg-gray-800/50 border border-gray-700/50 rounded-xl px-3 py-2 hover:border-gray-500 transition"
            >
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{f.tournamentName}</p>
                <p className="text-xs text-gray-500">{ordinal(f.rank)} of {f.totalPlayers}</p>
              </div>
              <p className={`text-sm font-bold tabular-nums shrink-0 ${f.earnings > 0 ? 'text-emerald-400' : 'text-gray-500'}`}>
                {fmt(f.earnings)}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function SeasonStats() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [raw, setRaw] = useState({ tournaments: [], picks: [], users: [] })
  const [expanded, setExpanded] = useState(null) // uid
  const [tab, setTab] = useState('teams') // 'teams' | 'players'

  useEffect(() => {
    async function load() {
      const tSnap = await getDocs(collection(db, 'tournaments'))
      const allTournaments = tSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const completedTournaments = allTournaments.filter(
        t => t.status === 'locked' || t.status === 'live'
      )

      const [playersSnaps, picksSnap, usersSnap] = await Promise.all([
        Promise.all(completedTournaments.map(t => getDocs(collection(db, 'tournaments', t.id, 'players')))),
        getDocs(collection(db, 'picks')),
        getDocs(collection(db, 'users')),
      ])

      const tournamentsWithPlayers = completedTournaments.map((t, i) => {
        const players = {}
        playersSnaps[i].docs.forEach(d => { players[d.id] = d.data() })
        return { ...t, players }
      })

      const includedIds = new Set(completedTournaments.map(t => t.id))
      const picks = picksSnap.docs
        .map(d => d.data())
        .filter(p => includedIds.has(p.tournamentId))

      const users = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() }))

      setRaw({ tournaments: tournamentsWithPlayers, picks, users })
      setLoading(false)
    }
    load()
  }, [])

  const stats = useMemo(() => computeSeasonStats(raw), [raw])
  const me = stats.users.find(u => u.uid === user?.uid)
  const myRank = me ? stats.users.findIndex(u => u.uid === me.uid) + 1 : null

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <p className="text-gray-500 text-sm">Loading season stats...</p>
      </div>
    )
  }

  const hasData = stats.scoredTournamentCount > 0

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="bg-gradient-to-b from-green-900 to-gray-950 px-4 pt-5 pb-12">
        <div className="max-w-2xl mx-auto">
          <Link to="/" className="inline-flex items-center gap-1 text-green-400 hover:text-white text-sm mb-5 transition">
            ← Home
          </Link>
          <p className="text-green-400 text-xs font-bold uppercase tracking-widest mb-2">Season Stats</p>
          <h1 className="text-white text-2xl font-black">Riganti Fantasy Golf 2026</h1>
          {hasData && (
            <p className="text-green-300/70 text-sm mt-2">
              Across {stats.scoredTournamentCount} completed tournament{stats.scoredTournamentCount === 1 ? '' : 's'}
            </p>
          )}
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 -mt-6 pb-12 space-y-6">
        {!hasData ? (
          <div className="bg-gray-800 rounded-2xl border border-gray-700 p-10 text-center">
            <p className="text-gray-400">No completed tournaments yet.</p>
            <p className="text-xs text-gray-600 mt-2">Stats will appear after the first event's earnings are uploaded.</p>
          </div>
        ) : (
          <>
            {/* Tab switcher */}
            <div className="flex gap-1 bg-gray-800/80 border border-gray-700/60 rounded-2xl p-1">
              {[
                { key: 'teams', label: 'Teams' },
                { key: 'players', label: 'Players' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
                    tab === key ? 'bg-emerald-500 text-white shadow' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === 'players' && (
              <PlayersView golfers={stats.golfers} recentTournamentNames={stats.recentTournamentNames || []} />
            )}
            {tab === 'teams' && <>

            {/* Your spotlight */}
            {me && (
              <section className="bg-gradient-to-br from-emerald-950/60 to-gray-900/80 border border-emerald-700/40 rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-4">
                  <Avatar photoUrl={me.photoUrl} displayName={me.displayName} size="lg" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-emerald-400 font-bold uppercase tracking-wider">Your Season</p>
                    <p className="font-black text-white text-lg leading-tight truncate">
                      {me.teamName || me.displayName}
                    </p>
                    {me.teamName && <p className="text-xs text-gray-400 truncate">{me.displayName}</p>}
                  </div>
                  {myRank && (
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">Rank</p>
                      <p className="text-white text-2xl font-black tabular-nums">{ordinal(myRank)}</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <MeStatBlock label="Total Earnings" value={fmt(me.totalEarnings)} />
                  <MeStatBlock
                    label="Best Finish"
                    value={me.bestFinish ? ordinal(me.bestFinish.rank) : '—'}
                    sub={me.bestFinish?.tournamentName}
                  />
                  <MeStatBlock label="Wins" value={me.wins} />
                  <MeStatBlock
                    label="Avg Finish"
                    value={me.avgFinish ? me.avgFinish.toFixed(1) : '—'}
                    sub={`${me.tournamentsPlayed} played`}
                  />
                </div>

                <UserDetail stats={me} />
              </section>
            )}

            {/* League leaderboard */}
            <section>
              <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-3">League</p>
              <div className="space-y-2">
                {stats.users.map((u, i) => {
                  const rank = i + 1
                  const medal = MEDALS[rank]
                  const isMe = u.uid === user?.uid
                  const isOpen = expanded === u.uid

                  return (
                    <div
                      key={u.uid}
                      className={`rounded-2xl border overflow-hidden transition ${
                        isMe ? 'bg-emerald-950/40 border-emerald-700/40' : 'bg-gray-800/70 border-gray-700/50'
                      }`}
                    >
                      <button
                        onClick={() => setExpanded(isOpen ? null : u.uid)}
                        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-800/40 transition"
                      >
                        <div className="w-8 shrink-0 flex justify-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black ${
                            medal || 'bg-gray-700 text-gray-300'
                          }`}>
                            {rank}
                          </div>
                        </div>
                        <Avatar photoUrl={u.photoUrl} displayName={u.displayName} size="md" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-black text-white leading-tight truncate">
                              {u.teamName || u.displayName}
                            </p>
                            {isMe && (
                              <span className="text-xs text-emerald-400 font-semibold px-2 py-0.5 bg-emerald-400/10 rounded-full shrink-0">you</span>
                            )}
                          </div>
                          {u.teamName && <p className="text-xs text-gray-400 truncate">{u.displayName}</p>}
                          <p className="text-xs text-gray-500 mt-0.5">
                            Best: {u.bestFinish ? ordinal(u.bestFinish.rank) : '—'}
                            {u.wins > 0 && <span className="text-yellow-400"> · {u.wins} win{u.wins === 1 ? '' : 's'}</span>}
                            <span className="text-gray-600"> · {u.tournamentsPlayed} played</span>
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`font-black text-lg tabular-nums ${u.totalEarnings > 0 ? 'text-emerald-400' : 'text-gray-500'}`}>
                            {fmt(u.totalEarnings)}
                          </p>
                          <p className="text-xs text-gray-600">{isOpen ? 'Hide ▲' : 'Details ▼'}</p>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="border-t border-gray-700/60 px-4 py-4 bg-gray-900/40">
                          <UserDetail stats={u} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
            </>}
          </>
        )}
      </main>
    </div>
  )
}

function PlayerRow({ rank, name, primary, secondary }) {
  const [imgOk, setImgOk] = useState(true)
  return (
    <div className="flex items-center gap-3 bg-gray-800/60 border border-gray-700/50 rounded-xl px-3 py-2.5">
      <div className="w-6 text-center text-xs font-bold text-gray-500 shrink-0 tabular-nums">{rank}</div>
      <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-700 shrink-0">
        {imgOk ? (
          <img src={getHeadshotUrl(name)} alt={name}
            className="w-full h-full object-cover object-top"
            onError={() => setImgOk(false)} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
            {name.split(' ').map(w => w[0]).join('').slice(0, 2)}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-semibold truncate">{name}</p>
        {secondary && <p className="text-xs text-gray-500 truncate">{secondary}</p>}
      </div>
      <p className="text-sm font-bold tabular-nums text-emerald-400 shrink-0">{primary}</p>
    </div>
  )
}

function PlayerSection({ title, subtitle, rows }) {
  if (rows.length === 0) return null
  return (
    <section>
      <div className="mb-2">
        <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">{title}</p>
        {subtitle && <p className="text-xs text-gray-600 mt-0.5">{subtitle}</p>}
      </div>
      <div className="space-y-1.5">{rows}</div>
    </section>
  )
}

function PlayersView({ golfers, recentTournamentNames }) {
  const [pairTab, setPairTab] = useState('earners') // mobile-only

  if (!golfers || golfers.length === 0) {
    return (
      <div className="bg-gray-800 rounded-2xl border border-gray-700 p-10 text-center">
        <p className="text-gray-400">No player data yet.</p>
      </div>
    )
  }

  const topEarners = [...golfers]
    .filter(g => g.earnings > 0)
    .sort((a, b) => b.earnings - a.earnings)
    .slice(0, 10)

  const bestValue = [...golfers]
    .filter(g => g.picks >= 2 && g.avgRatio > 0)
    .sort((a, b) => b.avgRatio - a.avgRatio)
    .slice(0, 10)

  const mostPicked = [...golfers]
    .sort((a, b) => b.picks - a.picks)
    .slice(0, 10)

  const biggestPaydays = [...golfers]
    .filter(g => g.bestSingle && g.bestSingle.earnings > 0)
    .sort((a, b) => b.bestSingle.earnings - a.bestSingle.earnings)
    .slice(0, 10)

  const earnRate = [...golfers]
    .filter(g => g.picks >= 2)
    .sort((a, b) => b.earnRate - a.earnRate)
    .slice(0, 10)

  const hotPlayers = [...golfers]
    .filter(g => g.recentEarnings > 0)
    .sort((a, b) => b.recentEarnings - a.recentEarnings)
    .slice(0, 10)

  const earnersSection = (
    <PlayerSection
      title="Top Earners"
      subtitle="Total season earnings"
      rows={topEarners.map((g, i) => (
        <PlayerRow key={g.name} rank={i + 1} name={g.name}
          primary={fmt(g.earnings)}
          secondary={`Picked ${g.picks}× · avg ${fmt(g.avgPrice)}`} />
      ))}
    />
  )
  const valueSection = (
    <PlayerSection
      title="Best Value"
      subtitle="Avg earnings ÷ price (min 2 picks)"
      rows={bestValue.map((g, i) => (
        <PlayerRow key={g.name} rank={i + 1} name={g.name}
          primary={`${g.avgRatio.toFixed(2)}×`}
          secondary={`${fmt(g.earnings)} on ${g.picks} picks · avg ${fmt(g.avgPrice)}`} />
      ))}
    />
  )

  return (
    <div className="space-y-6">
      {/* Side-by-side on md+, sub-toggle on mobile */}
      <div className="hidden md:grid md:grid-cols-2 md:gap-6">
        {earnersSection}
        {valueSection}
      </div>

      <div className="md:hidden">
        <div className="flex gap-1 bg-gray-800/80 border border-gray-700/60 rounded-2xl p-1 mb-4">
          {[
            { key: 'earners', label: 'Top Earners' },
            { key: 'value', label: 'Best Value' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setPairTab(key)}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
                pairTab === key ? 'bg-emerald-500 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {pairTab === 'earners' ? earnersSection : valueSection}
      </div>

      <PlayerSection
        title="🔥 Hot Players"
        subtitle={recentTournamentNames.length > 0
          ? `Earnings in last ${recentTournamentNames.length} event${recentTournamentNames.length === 1 ? '' : 's'}: ${recentTournamentNames.join(', ')}`
          : 'Earnings in the most recent events'}
        rows={hotPlayers.map((g, i) => (
          <PlayerRow key={g.name} rank={i + 1} name={g.name}
            primary={fmt(g.recentEarnings)}
            secondary={`${g.recentPicks} recent pick${g.recentPicks === 1 ? '' : 's'} · ${fmt(g.earnings)} season`} />
        ))}
      />

      <PlayerSection
        title="Biggest Single Payday"
        subtitle="Highest one-event earnings"
        rows={biggestPaydays.map((g, i) => (
          <PlayerRow key={g.name} rank={i + 1} name={g.name}
            primary={fmt(g.bestSingle.earnings)}
            secondary={g.bestSingle.tournamentName} />
        ))}
      />

      <PlayerSection
        title="Most Picked"
        subtitle="Popularity across the league"
        rows={mostPicked.map((g, i) => (
          <PlayerRow key={g.name} rank={i + 1} name={g.name}
            primary={`${g.picks}×`}
            secondary={`${fmt(g.earnings)} earned · avg ${fmt(g.avgPrice)}`} />
        ))}
      />

      <PlayerSection
        title="Earning Rate"
        subtitle="% of picks that produced earnings (min 2 picks)"
        rows={earnRate.map((g, i) => (
          <PlayerRow key={g.name} rank={i + 1} name={g.name}
            primary={`${Math.round(g.earnRate * 100)}%`}
            secondary={`${g.picks} picks · ${fmt(g.earnings)} earned`} />
        ))}
      />
    </div>
  )
}
