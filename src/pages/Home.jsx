import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'

function toDate(ts) {
  if (!ts) return null
  return ts?.toDate ? ts.toDate() : new Date(ts)
}

function lockCountdown(lockDate) {
  const date = toDate(lockDate)
  if (!date) return null
  const diff = date - new Date()
  if (diff <= 0) return 'Picks closed'
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return 'Locks in <1h'
  if (hours < 24) return `Locks in ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Locks tomorrow'
  return `${days} days to lock`
}

function formatDate(ts) {
  const date = toDate(ts)
  if (!date) return null
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function TournamentCard({ t, isUpcoming }) {
  const countdown = lockCountdown(t.lockDate)
  const startLabel = formatDate(t.startDate)

  return (
    <div className={`rounded-2xl border overflow-hidden transition ${
      isUpcoming
        ? 'bg-gray-800/40 border-gray-700/40'
        : t.status === 'open'
          ? 'bg-gray-800 border-gray-700'
          : 'bg-gray-800/60 border-gray-700/40'
    }`}>
      {/* Cover image */}
      {t.imageUrl && (
        <div className="aspect-video w-full overflow-hidden">
          <img src={t.imageUrl} alt={t.name} className="w-full h-full object-cover" />
        </div>
      )}

      <div className="p-4">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className={`font-black text-base leading-tight ${isUpcoming ? 'text-gray-300' : 'text-white'}`}>
            {t.name}
          </h3>
          <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${
            t.status === 'locked'
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : isUpcoming
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
          }`}>
            {t.status === 'locked' ? 'FINAL' : isUpcoming ? 'UPCOMING' : 'OPEN'}
          </span>
        </div>

        {/* Meta */}
        <div className="space-y-1 mb-3">
          {t.location && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {t.location}
            </div>
          )}
          {startLabel && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {startLabel}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Budget: ${t.budget?.toLocaleString()}
          </div>
        </div>

        {/* Countdown pill — open tournaments only */}
        {!isUpcoming && t.status === 'open' && countdown && (
          <div className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-1 rounded-full">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {countdown}
          </div>
        )}

        {/* Actions */}
        {!isUpcoming && (
          <div className="flex gap-2">
            <Link
              to={`/tournament/${t.id}`}
              className="flex-1 text-center text-sm font-bold py-2 rounded-xl transition bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {t.status === 'open' ? 'Make Picks' : 'View Picks'}
            </Link>
            <Link
              to={`/leaderboard/${t.id}`}
              className="flex-1 text-center text-sm font-bold py-2 rounded-xl transition bg-gray-700 hover:bg-gray-600 text-gray-200"
            >
              Leaderboard
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Home() {
  const { displayName, isAdmin } = useAuth()
  const [tournaments, setTournaments] = useState([])
  const [loading, setLoading] = useState(true)

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

    const byStartDesc = (a, b) => (toDate(b.startDate) ?? 0) - (toDate(a.startDate) ?? 0)
    const byStartAsc  = (a, b) => (toDate(a.startDate) ?? 0) - (toDate(b.startDate) ?? 0)

    current.sort(byStartDesc)
    upcoming.sort(byStartAsc)
    previous.sort(byStartDesc)

    return { current, upcoming, previous }
  }, [tournaments])

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="bg-gradient-to-b from-green-900 to-gray-950 px-4 pt-5 pb-10">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-400 text-xs font-bold uppercase tracking-widest mb-1">Fantasy Golf</p>
              <h1 className="text-white text-xl font-black">Riganti Fantasy Golf League 2026</h1>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Link to="/admin" className="text-xs bg-yellow-400 text-yellow-900 font-bold px-3 py-1.5 rounded-full hover:bg-yellow-300 transition">
                  Admin
                </Link>
              )}
              <Link to="/settings" className="text-gray-400 hover:text-white transition p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </Link>
              <button onClick={() => signOut(auth)} className="text-xs text-gray-400 hover:text-white transition">
                Sign out
              </button>
            </div>
          </div>
          <p className="text-green-300/70 text-sm mt-2">Welcome back, {displayName}</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 -mt-6 pb-12 space-y-8">
        {loading ? (
          <div className="text-center py-12 text-gray-600 text-sm">Loading tournaments...</div>
        ) : (
          <>
            {/* This Week */}
            {current.length > 0 && (
              <section>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-3">This Week</p>
                <div className="space-y-3">
                  {current.map(t => <TournamentCard key={t.id} t={t} isUpcoming={false} />)}
                </div>
              </section>
            )}

            {/* Upcoming */}
            {upcoming.length > 0 && (
              <section>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-3">Upcoming</p>
                <div className="space-y-3">
                  {upcoming.map(t => <TournamentCard key={t.id} t={t} isUpcoming={true} />)}
                </div>
              </section>
            )}

            {/* Previous */}
            {previous.length > 0 && (
              <section>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-3">Previous</p>
                <div className="space-y-3">
                  {previous.map(t => <TournamentCard key={t.id} t={t} isUpcoming={false} />)}
                </div>
              </section>
            )}

            {tournaments.length === 0 && (
              <div className="text-center py-16">
                <p className="text-gray-600 text-sm">No tournaments yet. Check back soon!</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
