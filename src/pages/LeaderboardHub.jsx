import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import { getHeadshotUrl } from '../data/players'
import Avatar from '../components/Avatar'

function fmt(n) {
  if (!n || n === 0) return '$0'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${n.toLocaleString()}`
}

function toDate(ts) {
  if (!ts) return null
  return ts?.toDate ? ts.toDate() : new Date(ts)
}

function formatDate(ts) {
  const date = toDate(ts)
  if (!date) return null
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function startCountdown(startDate) {
  const date = toDate(startDate)
  if (!date) return null
  const diff = date - new Date()
  if (diff <= 0) return null
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Starts today'
  if (days === 1) return 'Starts tomorrow'
  return `Starts in ${days} days`
}

const MEDALS = {
  1: { bg: 'bg-yellow-400', text: 'text-yellow-900' },
  2: { bg: 'bg-slate-400',  text: 'text-slate-900'  },
  3: { bg: 'bg-amber-600',  text: 'text-white'       },
}

function GolferRow({ golfer }) {
  const [imgOk, setImgOk] = useState(true)
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 min-w-0">
        <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-700 shrink-0">
          {imgOk && (
            <img src={getHeadshotUrl(golfer.name)} alt={golfer.name}
              className="w-full h-full object-cover object-top"
              onError={() => setImgOk(false)} />
          )}
        </div>
        <span className="text-xs text-gray-400 truncate">{golfer.name}</span>
      </div>
      <span className={`text-xs font-semibold shrink-0 tabular-nums ${golfer.earnings > 0 ? 'text-emerald-400' : 'text-gray-600'}`}>
        {golfer.earnings > 0 ? fmt(golfer.earnings) : '—'}
      </span>
    </div>
  )
}

function LeaderboardEntries({ entries, isLocked, user }) {
  const submitted = entries.filter(e => e.hasPicks).length

  let rankCounter = 0
  const ranked = entries.map(e => ({ ...e, rank: e.hasPicks ? ++rankCounter : null }))

  return (
    <div>
      {!isLocked && (
        <div className="flex items-center justify-between mb-3 px-1">
          <p className="text-xs text-gray-500">
            <span className="text-white font-bold">{submitted}</span>/{entries.length} picks submitted
          </p>
          <p className="text-xs text-gray-600">Picks hidden until lock</p>
        </div>
      )}
      <div className="space-y-2">
        {ranked.map(entry => {
          const isMe = entry.userId === user?.uid
          const medal = entry.rank ? MEDALS[entry.rank] : null
          return (
            <div key={entry.id} className={`rounded-2xl border overflow-hidden ${
              !entry.hasPicks
                ? 'bg-gray-900/40 border-gray-800/60 opacity-60'
                : medal
                  ? `bg-gray-800 ${medal.border ?? 'border-gray-600'}`
                  : isMe
                    ? 'bg-emerald-950/60 border-emerald-700/40'
                    : 'bg-gray-800/70 border-gray-700/50'
            }`}>
              <div className="flex items-center gap-3 px-4 py-3.5">
                {/* Rank badge */}
                <div className="w-8 shrink-0 flex justify-center">
                  {isLocked && entry.rank ? (
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black ${
                      medal ? `${medal.bg} ${medal.text}` : 'bg-gray-700 text-gray-300'
                    }`}>{entry.rank}</div>
                  ) : !isLocked && entry.hasPicks ? (
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                      <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-gray-700" />
                  )}
                </div>

                <Avatar photoUrl={entry.photoUrl} displayName={entry.displayName} size="md" />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-black text-white leading-tight truncate">
                      {entry.teamName || entry.displayName}
                    </p>
                    {isMe && (
                      <span className="text-xs text-emerald-400 font-semibold px-2 py-0.5 bg-emerald-400/10 rounded-full shrink-0">you</span>
                    )}
                  </div>
                  {entry.teamName && (
                    <p className="text-xs text-gray-400 truncate">{entry.displayName}</p>
                  )}
                  {!entry.hasPicks && (
                    <p className="text-xs text-gray-600 italic mt-0.5">Picks not submitted yet</p>
                  )}
                </div>

                {isLocked && entry.hasPicks && (
                  <p className={`font-black text-xl tabular-nums shrink-0 ${entry.totalEarnings > 0 ? 'text-emerald-400' : 'text-gray-500'}`}>
                    {fmt(entry.totalEarnings)}
                  </p>
                )}
              </div>

              {isLocked && entry.hasPicks && (
                <div className="border-t border-gray-700/60 px-4 py-2.5 grid grid-cols-2 gap-x-8 gap-y-1.5">
                  {entry.golferDetails.slice().sort((a, b) => b.earnings - a.earnings).map((g, i) => (
                    <GolferRow key={i} golfer={g} />
                  ))}
                </div>
              )}

              {!isLocked && entry.hasPicks && (
                <div className="border-t border-gray-700/40 px-4 py-2 text-xs text-gray-600">
                  5 golfers selected · revealed at lock
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function LeaderboardHub() {
  const { user } = useAuth()
  const [tournaments, setTournaments] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('current')

  // Scored leaderboard for current tab
  const [entries, setEntries] = useState([])
  const [scoresLoading, setScoresLoading] = useState(false)

  useEffect(() => {
    async function load() {
      const snap = await getDocs(collection(db, 'tournaments'))
      setTournaments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }
    load()
  }, [])

  const { current, upcoming, previous } = useMemo(() => {
    const now = new Date()
    const current = [], upcoming = [], previous = []
    for (const t of tournaments) {
      if (t.status === 'locked') {
        previous.push(t)
      } else {
        const start = toDate(t.startDate)
        if (start && start > now) upcoming.push(t)
        else current.push(t)
      }
    }
    current.sort((a, b) => (toDate(b.startDate) ?? 0) - (toDate(a.startDate) ?? 0))
    upcoming.sort((a, b) => (toDate(a.startDate) ?? 0) - (toDate(b.startDate) ?? 0))
    previous.sort((a, b) => (toDate(b.startDate) ?? 0) - (toDate(a.startDate) ?? 0))
    return { current, upcoming, previous }
  }, [tournaments])

  const activeTournament = current[0] ?? null

  // Load scores whenever the current tab is active and we have a tournament
  useEffect(() => {
    if (tab !== 'current' || !activeTournament) {
      setEntries([])
      return
    }
    setScoresLoading(true)

    async function loadScores() {
      const t = activeTournament
      const [playersSnap, picksSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, 'tournaments', t.id, 'players')),
        getDocs(query(collection(db, 'picks'), where('tournamentId', '==', t.id))),
        getDocs(collection(db, 'users')),
      ])

      const earningsMap = {}
      playersSnap.docs.forEach(d => { earningsMap[d.id] = d.data().earnings ?? 0 })

      const picksMap = {}
      picksSnap.docs.forEach(d => { picksMap[d.data().userId] = d })

      const allUsers = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() }))

      const scored = allUsers.map(u => {
        const pickDoc = picksMap[u.uid]
        if (!pickDoc) {
          return {
            id: u.uid,
            userId: u.uid,
            displayName: u.displayName || 'Unknown',
            teamName: u.teamName || '',
            photoUrl: u.photoUrl || '',
            hasPicks: false,
            golferDetails: [],
            totalEarnings: 0,
          }
        }
        const data = pickDoc.data()
        const golferDetails = data.golfer_ids.map(name => ({ name, earnings: earningsMap[name] ?? 0 }))
        return {
          id: pickDoc.id,
          userId: u.uid,
          displayName: u.displayName || 'Unknown',
          teamName: u.teamName || '',
          photoUrl: u.photoUrl || '',
          hasPicks: true,
          golferDetails,
          totalEarnings: golferDetails.reduce((s, g) => s + g.earnings, 0),
        }
      })

      scored.sort((a, b) => {
        if (a.hasPicks !== b.hasPicks) return a.hasPicks ? -1 : 1
        if (t.status === 'locked') return b.totalEarnings - a.totalEarnings
        return a.displayName.localeCompare(b.displayName)
      })

      setEntries(scored)
      setScoresLoading(false)
    }

    loadScores()
  }, [tab, activeTournament?.id])

  const tabs = [
    { key: 'current',  label: 'This Week' },
    { key: 'upcoming', label: 'Upcoming'  },
    { key: 'previous', label: 'Previous'  },
  ]

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="bg-gradient-to-b from-green-900 to-gray-950 px-4 pt-5 pb-12">
        <div className="max-w-2xl mx-auto">
          <Link to="/" className="inline-flex items-center gap-1 text-green-400 hover:text-white text-sm mb-5 transition">
            ← Home
          </Link>
          <p className="text-green-400 text-xs font-bold uppercase tracking-widest mb-2">Leaderboard</p>
          <h1 className="text-white text-2xl font-black">Riganti Fantasy Golf 2026</h1>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 -mt-6 pb-12">
        {/* Tab switcher */}
        <div className="flex gap-1 bg-gray-800/80 border border-gray-700/60 rounded-2xl p-1 mb-5">
          {tabs.map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
                tab === key ? 'bg-emerald-500 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── This Week tab ── */}
        {tab === 'current' && (
          <>
            {!activeTournament ? (
              <div className="bg-gray-800 rounded-2xl border border-gray-700 p-10 text-center">
                <p className="text-gray-400">No active tournament right now.</p>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  {activeTournament.imageUrl && (
                    <div className="aspect-video w-full overflow-hidden rounded-t-2xl">
                      <img src={activeTournament.imageUrl} alt={activeTournament.name} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className={`px-4 py-3 bg-gray-800 border border-gray-700 flex items-center justify-between ${activeTournament.imageUrl ? 'rounded-b-2xl border-t-0' : 'rounded-2xl'}`}>
                    <div>
                      <p className="font-bold text-white">{activeTournament.name}</p>
                      {activeTournament.location && <p className="text-xs text-gray-400">{activeTournament.location}</p>}
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                      activeTournament.status === 'locked'
                        ? 'bg-red-500/10 text-red-400 border-red-500/30'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    }`}>
                      {activeTournament.status === 'locked' ? 'LOCKED' : 'OPEN'}
                    </span>
                  </div>
                </div>

                {scoresLoading ? (
                  <p className="text-center text-gray-500 text-sm py-8">Loading scores...</p>
                ) : (
                  <LeaderboardEntries entries={entries} isLocked={activeTournament.status === 'locked'} user={user} />
                )}

                {activeTournament.status !== 'locked' && (
                  <p className="text-xs text-gray-600 text-center mt-4">
                    Scores revealed when picks lock.
                  </p>
                )}
              </>
            )}
          </>
        )}

        {/* ── Upcoming tab ── */}
        {tab === 'upcoming' && (
          <div className="space-y-3">
            {upcoming.length === 0 ? (
              <div className="bg-gray-800 rounded-2xl border border-gray-700 p-10 text-center">
                <p className="text-gray-400">No upcoming tournaments.</p>
              </div>
            ) : upcoming.map(t => {
              const countdown = startCountdown(t.startDate)
              return (
                <div key={t.id} className="bg-gray-800/60 border border-gray-700/50 rounded-2xl overflow-hidden">
                  {t.imageUrl && (
                    <div className="aspect-video w-full overflow-hidden">
                      <img src={t.imageUrl} alt={t.name} className="w-full h-full object-cover opacity-80" />
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-bold text-white">{t.name}</h3>
                      {countdown && (
                        <span className="shrink-0 text-xs font-semibold text-blue-400 bg-blue-400/10 border border-blue-400/20 px-2.5 py-1 rounded-full">
                          {countdown}
                        </span>
                      )}
                    </div>
                    {t.location && <p className="text-xs text-gray-400 mb-1">{t.location}</p>}
                    {t.startDate && <p className="text-xs text-gray-500">{formatDate(t.startDate)}</p>}
                    <p className="text-xs text-gray-500 mt-1">Budget: ${t.budget?.toLocaleString()}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Previous tab ── */}
        {tab === 'previous' && (
          <div className="space-y-2">
            {previous.length === 0 ? (
              <div className="bg-gray-800 rounded-2xl border border-gray-700 p-10 text-center">
                <p className="text-gray-400">No previous tournaments yet.</p>
              </div>
            ) : previous.map(t => (
              <Link key={t.id} to={`/leaderboard/${t.id}`}
                className="flex items-center gap-3 bg-gray-800/60 border border-gray-700/50 rounded-2xl p-4 hover:border-gray-500 transition group">
                {t.imageUrl && (
                  <img src={t.imageUrl} alt={t.name} className="w-14 h-10 rounded-lg object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white text-sm truncate">{t.name}</p>
                  <p className="text-xs text-gray-500">{t.location || formatDate(t.startDate) || t.id}</p>
                </div>
                <span className="text-xs text-gray-500 group-hover:text-emerald-400 transition shrink-0">View →</span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
