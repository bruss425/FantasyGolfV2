import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { doc, getDoc, collection, getDocs, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import BudgetBar from '../components/BudgetBar'
import Cart from '../components/Cart'
import PlayerCard from '../components/PlayerCard'

function fmt(n) {
  if (!n || n === 0) return '$0'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${n.toLocaleString()}`
}

export default function Tournament() {
  const { id } = useParams()
  const { user } = useAuth()

  const [tournament, setTournament] = useState(null)
  const [players, setPlayers] = useState([])
  const [picks, setPicks] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const totalSpent = useMemo(() => picks.reduce((s, p) => s + p.price, 0), [picks])
  const totalEarnings = useMemo(() => picks.reduce((s, p) => s + (p.earnings ?? 0), 0), [picks])
  const isLocked = tournament?.status === 'locked'
  const canSubmit = picks.length === 5 && totalSpent <= (tournament?.budget ?? 0)
  const hasEarnings = picks.some(p => (p.earnings ?? 0) > 0)

  useEffect(() => {
    async function load() {
      const [tSnap, playersSnap, pickSnap] = await Promise.all([
        getDoc(doc(db, 'tournaments', id)),
        getDocs(collection(db, 'tournaments', id, 'players')),
        getDoc(doc(db, 'picks', `${id}--${user.uid}`)),
      ])

      if (!tSnap.exists()) { setLoading(false); return }

      const t = { id: tSnap.id, ...tSnap.data() }
      setTournament(t)

      const playerList = playersSnap.docs.map(d => ({ id: d.id, name: d.id, ...d.data() }))
      setPlayers(playerList)

      if (pickSnap.exists()) {
        const { golfer_ids } = pickSnap.data()
        const pickedPlayers = golfer_ids
          .map(name => playerList.find(p => p.name === name))
          .filter(Boolean)
        setPicks(pickedPlayers)
      }

      setLoading(false)
    }
    load()
  }, [id, user.uid])

  function canAdd(player) {
    if (picks.some(p => p.id === player.id)) return false
    if (picks.length >= 5) return false
    if (totalSpent + player.price > (tournament?.budget ?? 0)) return false
    return true
  }

  function togglePick(player) {
    if (picks.some(p => p.id === player.id)) {
      setPicks(prev => prev.filter(p => p.id !== player.id))
    } else if (canAdd(player)) {
      setPicks(prev => [...prev, player])
    }
  }

  async function handleSubmit() {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    try {
      await setDoc(doc(db, 'picks', `${id}--${user.uid}`), {
        golfer_ids: picks.map(p => p.name),
        total_spent: totalSpent,
        tournamentId: id,
        userId: user.uid,
        timestamp: new Date(),
      })
      setSubmitted(true)
      setTimeout(() => setSubmitted(false), 3000)
    } finally {
      setSubmitting(false)
    }
  }

  const filteredPlayers = useMemo(() => {
    const q = search.toLowerCase()
    return players
      .filter(p => p.name.toLowerCase().includes(q))
      .sort((a, b) => b.price - a.price)
  }, [players, search])

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

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Sticky header */}
      <div className="sticky top-0 z-10">
        <div className="bg-gradient-to-b from-green-900 to-gray-900 px-4 py-3.5 flex items-center gap-3">
          <Link to="/" className="text-green-400 hover:text-white text-sm transition shrink-0">
            ← Back
          </Link>
          <h1 className="font-black text-white flex-1 truncate">{tournament.name}</h1>
          {isLocked ? (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 shrink-0">
              LOCKED
            </span>
          ) : (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
              OPEN
            </span>
          )}
        </div>
        {!isLocked && <BudgetBar totalSpent={totalSpent} budget={tournament.budget} />}
      </div>

      <main className="max-w-3xl mx-auto px-3 pt-4 pb-40">
        {isLocked ? (
          /* ── Locked view: your picks ── */
          <div>
            {hasEarnings && (
              <div className="bg-gradient-to-r from-emerald-900/50 to-green-900/20 border border-emerald-700/40 rounded-2xl p-5 mb-5">
                <p className="text-xs text-emerald-400 font-bold uppercase tracking-widest mb-1">
                  Your Total Earnings
                </p>
                <p className="text-4xl font-black text-white tabular-nums">{fmt(totalEarnings)}</p>
              </div>
            )}

            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-3 px-1">
              Your Picks
            </p>

            {picks.length === 0 ? (
              <div className="bg-gray-800 rounded-2xl border border-gray-700 p-8 text-center">
                <p className="text-gray-500">No picks submitted for this tournament.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {picks
                  .slice()
                  .sort((a, b) => (b.earnings ?? 0) - (a.earnings ?? 0))
                  .map(p => (
                    <PlayerCard
                      key={p.id}
                      player={p}
                      isSelected={true}
                      canAdd={false}
                      onToggle={() => {}}
                      readOnly={true}
                      showEarnings={hasEarnings}
                    />
                  ))}
              </div>
            )}
          </div>
        ) : (
          /* ── Open view: pick your team ── */
          <>
            {/* Search */}
            <div className="relative mb-4">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search players..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            {/* Stats bar */}
            <div className="flex items-center gap-3 mb-4 text-xs text-gray-500">
              <span>{filteredPlayers.length} players</span>
              <span>·</span>
              <span>Budget: ${tournament.budget?.toLocaleString()}</span>
              <span>·</span>
              <span>{picks.length}/5 selected</span>
            </div>

            {/* Player grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredPlayers.map(player => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  isSelected={picks.some(p => p.id === player.id)}
                  canAdd={canAdd(player)}
                  onToggle={togglePick}
                  readOnly={false}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {!isLocked && (
        <Cart
          picks={picks}
          onRemove={togglePick}
          canSubmit={canSubmit}
          onSubmit={handleSubmit}
          submitting={submitting}
        />
      )}

      {/* Success toast */}
      {submitted && (
        <div className="toast-enter fixed top-6 left-1/2 z-50 pointer-events-none">
          <div className="bg-emerald-500 text-white text-sm font-bold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 whitespace-nowrap">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Picks saved successfully!
          </div>
        </div>
      )}
    </div>
  )
}
