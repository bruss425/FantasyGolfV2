import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'
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

const MEDALS = {
  1: { bg: 'bg-yellow-400', text: 'text-yellow-900', border: 'border-yellow-400/40' },
  2: { bg: 'bg-slate-400',  text: 'text-slate-900',  border: 'border-slate-400/40'  },
  3: { bg: 'bg-amber-600',  text: 'text-white',       border: 'border-amber-600/40'  },
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

export default function Leaderboard() {
  const { id } = useParams()
  const { user } = useAuth()
  const [tournament, setTournament] = useState(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [tSnap, playersSnap, picksSnap, usersSnap] = await Promise.all([
        getDoc(doc(db, 'tournaments', id)),
        getDocs(collection(db, 'tournaments', id, 'players')),
        getDocs(query(collection(db, 'picks'), where('tournamentId', '==', id))),
        getDocs(collection(db, 'users')),
      ])

      if (!tSnap.exists()) { setLoading(false); return }
      const t = { id: tSnap.id, ...tSnap.data() }
      setTournament(t)

      // Build earnings map
      const earningsMap = {}
      playersSnap.docs.forEach(d => { earningsMap[d.id] = d.data().earnings ?? 0 })

      // Build picks map keyed by userId
      const picksMap = {}
      picksSnap.docs.forEach(d => { picksMap[d.data().userId] = d })

      // Build one entry per league member
      const allUsers = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() }))

      const entries = allUsers.map(u => {
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
        const golferDetails = data.golfer_ids.map(name => ({
          name,
          earnings: earningsMap[name] ?? 0,
        }))
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

      // Sort: picks-submitted first, then by earnings (locked) or alphabetical (open)
      entries.sort((a, b) => {
        if (a.hasPicks !== b.hasPicks) return a.hasPicks ? -1 : 1
        if (t.status === 'locked') return b.totalEarnings - a.totalEarnings
        return a.displayName.localeCompare(b.displayName)
      })

      setEntries(entries)
      setLoading(false)
    }
    load()
  }, [id])

  const isLocked = tournament?.status === 'locked'

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    )
  }

  if (!tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <p className="text-red-400">Tournament not found.</p>
      </div>
    )
  }

  // Assign rank only to entries with picks
  let rankCounter = 0
  const ranked = entries.map(e => ({
    ...e,
    rank: e.hasPicks ? ++rankCounter : null,
  }))

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Hero header */}
      <div className="bg-gradient-to-b from-green-900 to-gray-950 px-4 pt-5 pb-12">
        <div className="max-w-2xl mx-auto">
          <Link to="/leaderboard" className="inline-flex items-center gap-1 text-green-400 hover:text-white text-sm mb-6 transition">
            ← Leaderboard
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-green-400 text-xs font-bold uppercase tracking-widest mb-2">Leaderboard</p>
              <h1 className="text-white text-2xl font-black leading-tight">{tournament.name}</h1>
              {tournament.location && (
                <p className="text-gray-400 text-sm mt-1">{tournament.location}</p>
              )}
            </div>
            <span className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border mt-1 ${
              isLocked ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
            }`}>
              {isLocked ? 'LOCKED' : 'OPEN'}
            </span>
          </div>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 -mt-6 pb-12">
        {/* Submission count when open */}
        {!isLocked && (
          <div className="flex items-center justify-between mb-4 px-1">
            <p className="text-xs text-gray-500">
              <span className="text-white font-bold">{entries.filter(e => e.hasPicks).length}</span>
              /{entries.length} picks submitted
            </p>
            <p className="text-xs text-gray-600">Picks hidden until lock</p>
          </div>
        )}

        <div className="space-y-2">
          {ranked.map(entry => {
            const isMe = entry.userId === user?.uid
            const medal = entry.rank ? MEDALS[entry.rank] : null

            return (
              <div
                key={entry.id}
                className={`rounded-2xl border overflow-hidden transition ${
                  !entry.hasPicks
                    ? 'bg-gray-900/40 border-gray-800/60 opacity-60'
                    : medal
                      ? `bg-gray-800 ${medal.border}`
                      : isMe
                        ? 'bg-emerald-950/60 border-emerald-700/40'
                        : 'bg-gray-800/80 border-gray-700/50'
                }`}
              >
                {/* Main row */}
                <div className="flex items-center gap-3 px-4 py-3.5">
                  {/* Rank badge */}
                  <div className="w-8 shrink-0 flex justify-center">
                    {isLocked && entry.rank ? (
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black ${
                        medal ? `${medal.bg} ${medal.text}` : 'bg-gray-700 text-gray-300'
                      }`}>
                        {entry.rank}
                      </div>
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

                  {/* Avatar */}
                  <Avatar photoUrl={entry.photoUrl} displayName={entry.displayName} size="md" />

                  {/* Name block */}
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

                  {/* Earnings */}
                  {isLocked && entry.hasPicks && (
                    <p className={`font-black text-xl tabular-nums shrink-0 ${entry.totalEarnings > 0 ? 'text-emerald-400' : 'text-gray-500'}`}>
                      {fmt(entry.totalEarnings)}
                    </p>
                  )}
                </div>

                {/* Golfer breakdown — locked + has picks */}
                {isLocked && entry.hasPicks && (
                  <div className="border-t border-gray-700/60 px-4 py-2.5 grid grid-cols-2 gap-x-8 gap-y-1.5">
                    {entry.golferDetails
                      .slice()
                      .sort((a, b) => b.earnings - a.earnings)
                      .map((g, i) => <GolferRow key={i} golfer={g} />)}
                  </div>
                )}

                {/* Open + has picks: show hidden message */}
                {!isLocked && entry.hasPicks && (
                  <div className="border-t border-gray-700/40 px-4 py-2 text-xs text-gray-600">
                    5 golfers selected · revealed at lock
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
