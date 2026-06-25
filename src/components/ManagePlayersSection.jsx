import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { getHeadshotUrl } from '../data/players'
import PlayerCombobox from './PlayerCombobox'

const INPUT = 'w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500'

function PlayerRow({ tournamentId, player, onChanged }) {
  const [price, setPrice] = useState(player.price ?? 0)
  const [earnings, setEarnings] = useState(player.earnings ?? 0)
  const [saving, setSaving] = useState(false)
  const [imgOk, setImgOk] = useState(true)

  useEffect(() => {
    setPrice(player.price ?? 0)
    setEarnings(player.earnings ?? 0)
  }, [player.price, player.earnings])

  const dirty = Number(price) !== (player.price ?? 0) || Number(earnings) !== (player.earnings ?? 0)
  const isWD = player.currentPosition === 'WD'
  const isCut = player.currentPosition === 'CUT' || player.currentPosition === 'MDF'

  async function save() {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'tournaments', tournamentId, 'players', player.name), {
        price: Number(price) || 0,
        earnings: Number(earnings) || 0,
      })
      onChanged?.()
    } finally {
      setSaving(false)
    }
  }

  async function markWD() {
    if (!confirm(`Mark ${player.name} as WD? Earnings will be set to 0.`)) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'tournaments', tournamentId, 'players', player.name), {
        earnings: 0,
        liveEarnings: 0,
        currentPosition: 'WD',
      })
      onChanged?.()
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!confirm(`Delete ${player.name} from this tournament? This cannot be undone.`)) return
    setSaving(true)
    try {
      await deleteDoc(doc(db, 'tournaments', tournamentId, 'players', player.name))
      onChanged?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-b-0">
      <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 shrink-0">
        {imgOk && (
          <img src={getHeadshotUrl(player.name)} alt=""
            className="w-full h-full object-cover object-top"
            onError={() => setImgOk(false)} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 truncate">{player.name}</p>
        {(isWD || isCut) && (
          <p className={`text-xs ${isWD ? 'text-red-600' : 'text-gray-500'}`}>{player.currentPosition}</p>
        )}
      </div>
      <div className="shrink-0">
        <label className="block text-xs text-gray-400">Price</label>
        <input type="number" value={price} onChange={e => setPrice(e.target.value)}
          className={`${INPUT} w-24 tabular-nums`} />
      </div>
      <div className="shrink-0">
        <label className="block text-xs text-gray-400">Earnings</label>
        <input type="number" value={earnings} onChange={e => setEarnings(e.target.value)}
          className={`${INPUT} w-28 tabular-nums`} />
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button onClick={save} disabled={!dirty || saving}
          className="text-xs font-semibold px-2 py-1 rounded bg-green-600 text-white hover:bg-green-500 disabled:bg-gray-300">
          Save
        </button>
        <button onClick={markWD} disabled={saving}
          className="text-xs font-semibold px-2 py-1 rounded bg-amber-500 text-white hover:bg-amber-400 disabled:opacity-50">
          WD
        </button>
        <button onClick={remove} disabled={saving}
          className="text-xs font-semibold px-2 py-1 rounded bg-red-600 text-white hover:bg-red-500 disabled:opacity-50">
          Delete
        </button>
      </div>
    </div>
  )
}

export default function ManagePlayersSection({ tournaments }) {
  const [tournamentId, setTournamentId] = useState('')
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [addPrice, setAddPrice] = useState('')
  const [pendingAdd, setPendingAdd] = useState(null) // name selected from combobox
  const [addStatus, setAddStatus] = useState('')

  async function loadPlayers(id) {
    if (!id) { setPlayers([]); return }
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'tournaments', id, 'players'))
      const list = snap.docs.map(d => ({ name: d.id, ...d.data() }))
      list.sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
      setPlayers(list)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadPlayers(tournamentId) }, [tournamentId])

  const existingNames = useMemo(() => players.map(p => p.name), [players])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return players
    return players.filter(p => p.name.toLowerCase().includes(q))
  }, [players, search])

  const zeroPrice = useMemo(() => players.filter(p => (p.price ?? 0) <= 0), [players])

  async function addPlayer() {
    if (!pendingAdd || !tournamentId) return
    const priceNum = Number(addPrice) || 0
    if (priceNum <= 0) { setAddStatus('Enter a price first.'); return }
    setAddStatus('Adding...')
    await setDoc(doc(db, 'tournaments', tournamentId, 'players', pendingAdd), {
      price: priceNum,
      earnings: 0,
    })
    setAddStatus(`Added ${pendingAdd} ($${priceNum.toLocaleString()}).`)
    setPendingAdd(null)
    setAddPrice('')
    loadPlayers(tournamentId)
  }

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h2 className="font-semibold text-gray-800 mb-1">Manage Players</h2>
      <p className="text-xs text-gray-400 mb-4">Add, edit, mark WD, or delete players for a tournament.</p>

      <div className="mb-3">
        <label className="block text-sm text-gray-600 mb-1">Select Tournament</label>
        <select value={tournamentId} onChange={e => setTournamentId(e.target.value)} className={INPUT}>
          <option value="">-- Choose tournament --</option>
          {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {tournamentId && (
        <>
          {/* Add player */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">Add Player</p>
            {pendingAdd ? (
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm text-gray-800 truncate">{pendingAdd}</span>
                <input type="number" placeholder="Price"
                  value={addPrice} onChange={e => setAddPrice(e.target.value)}
                  className={`${INPUT} w-28`} />
                <button onClick={addPlayer}
                  className="text-xs font-semibold px-3 py-2 rounded bg-green-600 text-white hover:bg-green-500">
                  Add
                </button>
                <button onClick={() => { setPendingAdd(null); setAddPrice('') }}
                  className="text-xs font-semibold px-3 py-2 rounded bg-gray-200 text-gray-700 hover:bg-gray-300">
                  Cancel
                </button>
              </div>
            ) : (
              <PlayerCombobox
                onSelect={setPendingAdd}
                excludeNames={existingNames}
                placeholder="Search to add a player..."
              />
            )}
            {addStatus && <p className="text-xs text-gray-500 mt-2">{addStatus}</p>}
          </div>

          {/* Warning for zero-price */}
          {zeroPrice.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2 mb-3">
              {zeroPrice.length} player{zeroPrice.length === 1 ? '' : 's'} with no price — these are hidden from picks.
            </div>
          )}

          {/* Filter */}
          <input
            type="text"
            placeholder={`Filter ${players.length} players...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`${INPUT} mb-2`}
          />

          {loading ? (
            <p className="text-sm text-gray-500 py-4">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No players match.</p>
          ) : (
            <div className="max-h-[600px] overflow-y-auto pr-1">
              {filtered.map(p => (
                <PlayerRow key={p.name} tournamentId={tournamentId} player={p}
                  onChanged={() => loadPlayers(tournamentId)} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
