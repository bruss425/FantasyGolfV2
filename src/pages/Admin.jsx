import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  collection,
  getDocs,
  setDoc,
  updateDoc,
  doc,
  writeBatch,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import { useCSVReader } from 'react-papaparse'

const INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500'

/** Convert a Firestore Timestamp or Date to a datetime-local input value (local time). */
function toDatetimeLocal(ts) {
  if (!ts) return ''
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function Admin() {
  const { displayName } = useAuth()
  const { CSVReader } = useCSVReader()
  const { CSVReader: EarningsCSVReader } = useCSVReader()

  const [tournaments, setTournaments] = useState([])

  // Create tournament form
  const [newName, setNewName] = useState('')
  const [newBudget, setNewBudget] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [newLocation, setNewLocation] = useState('')
  const [newStartDate, setNewStartDate] = useState('')
  const [newLockDate, setNewLockDate] = useState('')
  const [newEspnEventId, setNewEspnEventId] = useState('')
  const [newPurse, setNewPurse] = useState('')
  const [espnVerifying, setEspnVerifying] = useState(false)
  const [espnVerified, setEspnVerified] = useState(null)
  const [espnVerifyError, setEspnVerifyError] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Edit tournament
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [editVerifying, setEditVerifying] = useState(false)
  const [editVerified, setEditVerified] = useState(null)
  const [editVerifyError, setEditVerifyError] = useState('')

  // CSV upload
  const [uploadTournamentId, setUploadTournamentId] = useState('')
  const [uploadStatus, setUploadStatus] = useState('')

  // Earnings upload
  const [earningsTournamentId, setEarningsTournamentId] = useState('')
  const [earningsStatus, setEarningsStatus] = useState('')

  useEffect(() => { loadTournaments() }, [])

  async function loadTournaments() {
    const snap = await getDocs(collection(db, 'tournaments'))
    setTournaments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  function handleImageChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  // ── ESPN Verify (shared logic) ──────────────────────────────────────────
  async function runVerify(id, setVerifying, setVerified, setVerifyError) {
    if (!id?.trim()) return
    setVerifying(true)
    setVerified(null)
    setVerifyError('')

    function parseEventInfo(event) {
      if (!event) return null
      const name = event.name || event.shortName
      if (!name) return null
      const rawDate = event.competitions?.[0]?.startDate || event.date
      const startDate = rawDate
        ? new Date(rawDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
        : null
      return { name, startDate }
    }

    try {
      let info = null

      // Try 1: leaderboard — only available once the tournament is live
      const lbRes = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/golf/pga/leaderboard?event=${id}`
      ).catch(() => null)
      if (lbRes?.ok) {
        info = parseEventInfo((await lbRes.json())?.events?.[0])
      }

      // Try 2: scoreboard — shows the current week's event and often the next one
      if (!info) {
        const sbRes = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard`
        ).catch(() => null)
        if (sbRes?.ok) {
          const sbData = await sbRes.json()
          const match = (sbData?.events ?? []).find(e => String(e.id) === String(id))
          if (match) info = parseEventInfo(match)
        }
      }

      setVerified({ ...info, confirmed: !!info })
    } catch {
      setVerifyError('Network error — check your connection and try again.')
    } finally {
      setVerifying(false)
    }
  }

  function verifyEspnEvent() {
    runVerify(newEspnEventId, setEspnVerifying, setEspnVerified, setEspnVerifyError)
  }

  function verifyEspnEditEvent() {
    runVerify(editForm.espnEventId, setEditVerifying, setEditVerified, setEditVerifyError)
  }

  // ── ESPN verify result badge (reused in create + edit) ──────────────────
  function EspnVerifyResult({ verified, verifyError }) {
    if (verified?.confirmed) return (
      <div className="mt-2 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <span className="font-semibold">{verified.name}</span>
        {verified.startDate && <span className="text-green-600">· {verified.startDate}</span>}
      </div>
    )
    if (verified && !verified.confirmed) return (
      <div className="mt-2 flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <span>ID saved but not yet confirmed — ESPN's event data isn't published this far in advance. Try again closer to the tournament, or proceed and it will confirm automatically when the event goes live.</span>
      </div>
    )
    if (verifyError) return <p className="mt-1.5 text-sm text-red-600">{verifyError}</p>
    return null
  }

  // ── Create tournament ────────────────────────────────────────────────────
  async function handleCreate(e) {
    e.preventDefault()
    setCreateError('')
    if (!newSlug || !newName || !newBudget) {
      setCreateError('Name, slug, and budget are required.')
      return
    }
    setCreating(true)
    try {
      let imageUrl = ''
      if (imageFile) {
        const storageRef = ref(storage, `tournament-covers/${newSlug}`)
        const snapshot = await uploadBytes(storageRef, imageFile)
        imageUrl = await getDownloadURL(snapshot.ref)
      }

      await setDoc(doc(db, 'tournaments', newSlug), {
        name: newName,
        budget: parseFloat(newBudget),
        status: 'open',
        location: newLocation || '',
        startDate: newStartDate ? new Date(newStartDate) : null,
        lockDate: newLockDate ? new Date(newLockDate) : null,
        imageUrl,
        espnEventId: newEspnEventId || '',
        purse: newPurse ? parseFloat(newPurse) : 0,
      })

      setNewName(''); setNewBudget(''); setNewSlug(''); setNewLocation('')
      setNewStartDate(''); setNewLockDate(''); setNewEspnEventId(''); setNewPurse('')
      setEspnVerified(null); setEspnVerifyError('')
      setImageFile(null); setImagePreview(null)
      await loadTournaments()
    } catch (err) {
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }

  // ── Edit tournament ──────────────────────────────────────────────────────
  function startEdit(t) {
    setEditingId(t.id)
    setEditForm({
      name: t.name || '',
      budget: t.budget?.toString() || '',
      location: t.location || '',
      startDate: toDatetimeLocal(t.startDate),
      lockDate: toDatetimeLocal(t.lockDate),
      espnEventId: t.espnEventId || '',
      purse: t.purse?.toString() || '',
    })
    setEditVerified(null)
    setEditVerifyError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditForm({})
    setEditVerified(null)
    setEditVerifyError('')
  }

  async function handleEditSave() {
    setEditSaving(true)
    try {
      await updateDoc(doc(db, 'tournaments', editingId), {
        name: editForm.name,
        budget: parseFloat(editForm.budget) || 0,
        location: editForm.location || '',
        startDate: editForm.startDate ? new Date(editForm.startDate) : null,
        lockDate: editForm.lockDate ? new Date(editForm.lockDate) : null,
        espnEventId: editForm.espnEventId || '',
        purse: editForm.purse ? parseFloat(editForm.purse) : 0,
      })
      setEditingId(null)
      setEditForm({})
      await loadTournaments()
    } catch (err) {
      alert(`Save failed: ${err.message}`)
    } finally {
      setEditSaving(false)
    }
  }

  // ── Status controls ──────────────────────────────────────────────────────
  async function setStatus(tournament, next) {
    await updateDoc(doc(db, 'tournaments', tournament.id), { status: next })
    setTournaments(prev =>
      prev.map(t => (t.id === tournament.id ? { ...t, status: next } : t))
    )
  }

  // ── CSV handlers ─────────────────────────────────────────────────────────
  async function handleCSVUpload(results) {
    if (!uploadTournamentId) { setUploadStatus('Select a tournament first.'); return }
    setUploadStatus('Uploading...')
    try {
      const rows = results.data
      const headers = rows[0].map(h => h.trim())
      const nameIdx = headers.findIndex(h => h.toLowerCase() === 'name')
      const priceIdx = headers.findIndex(h => h.toLowerCase() === 'price')
      if (nameIdx === -1 || priceIdx === -1) { setUploadStatus('CSV must have "Name" and "Price" columns.'); return }

      const batch = writeBatch(db)
      let count = 0
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (!row || row.length < 2) continue
        const name = row[nameIdx]?.trim()
        const price = parseFloat(row[priceIdx]?.toString().replace(/[$,]/g, '').trim())
        if (!name || isNaN(price)) continue
        batch.set(doc(db, 'tournaments', uploadTournamentId, 'players', name), { price, earnings: 0 })
        count++
      }
      await batch.commit()
      setUploadStatus(`Uploaded ${count} players successfully.`)
    } catch (err) {
      setUploadStatus(`Error: ${err.message}`)
    }
  }

  async function handleEarningsUpload(results) {
    if (!earningsTournamentId) { setEarningsStatus('Select a tournament first.'); return }
    setEarningsStatus('Uploading...')
    try {
      const rows = results.data
      const headers = rows[0].map(h => h.trim())
      const nameIdx = headers.findIndex(h => h.toLowerCase() === 'name')
      const earningsIdx = headers.findIndex(h => h.toLowerCase() === 'earnings')
      if (nameIdx === -1 || earningsIdx === -1) { setEarningsStatus('CSV must have "Name" and "Earnings" columns.'); return }

      const batch = writeBatch(db)
      let count = 0
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (!row || row.length < 2) continue
        const name = row[nameIdx]?.trim()
        const earnings = parseFloat(row[earningsIdx]?.toString().replace(/[$,]/g, '').trim())
        if (!name || isNaN(earnings)) continue
        batch.set(doc(db, 'tournaments', earningsTournamentId, 'players', name), { earnings }, { merge: true })
        count++
      }
      await batch.commit()
      setEarningsStatus(`Updated earnings for ${count} players.`)
    } catch (err) {
      setEarningsStatus(`Error: ${err.message}`)
    }
  }

  // ── Labels / actions ─────────────────────────────────────────────────────
  function statusLabel(status) {
    if (status === 'open')
      return <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Open</span>
    if (status === 'live')
      return <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">Live</span>
    return <span className="text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">Final</span>
  }

  function statusActions(t) {
    if (t.status === 'open') return (
      <button onClick={() => setStatus(t, 'live')}
        className="text-xs font-semibold px-3 py-1 rounded-full transition bg-blue-100 text-blue-700 hover:bg-blue-200">
        Go Live
      </button>
    )
    if (t.status === 'live') return (
      <button onClick={() => setStatus(t, 'locked')}
        className="text-xs font-semibold px-3 py-1 rounded-full transition bg-red-100 text-red-700 hover:bg-red-200">
        Mark Final
      </button>
    )
    return (
      <button onClick={() => setStatus(t, 'open')}
        className="text-xs font-semibold px-3 py-1 rounded-full transition bg-gray-100 text-gray-700 hover:bg-gray-200">
        Reopen
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-yellow-400 px-4 py-4 flex items-center gap-3">
        <Link to="/" className="text-yellow-900 hover:text-yellow-700 text-sm font-medium">← Back</Link>
        <h1 className="font-bold text-yellow-900 text-xl">Admin Panel</h1>
        <span className="text-xs text-yellow-800 ml-auto">{displayName}</span>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">

        {/* ── Create Tournament ── */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Create Tournament</h2>
          <form onSubmit={handleCreate} className="space-y-3">

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-sm text-gray-600 mb-1">Tournament Name</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="The Masters 2026" className={INPUT} />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Slug</label>
                <input type="text" value={newSlug}
                  onChange={e => setNewSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  placeholder="masters-2026" className={INPUT} />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Budget ($)</label>
                <input type="number" value={newBudget} onChange={e => setNewBudget(e.target.value)}
                  placeholder="50000" className={INPUT} />
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-gray-600 mb-1">Location</label>
                <input type="text" value={newLocation} onChange={e => setNewLocation(e.target.value)}
                  placeholder="Augusta National, Augusta, GA" className={INPUT} />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Start Date</label>
                <input type="datetime-local" value={newStartDate} onChange={e => setNewStartDate(e.target.value)}
                  className={INPUT} />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Picks Lock Date</label>
                <input type="datetime-local" value={newLockDate} onChange={e => setNewLockDate(e.target.value)}
                  className={INPUT} />
              </div>
              <div className="col-span-2">
                <div className="flex items-baseline justify-between mb-1">
                  <label className="block text-sm text-gray-600">ESPN Event ID</label>
                  <a
                    href="https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Find current event ID ↗
                  </a>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newEspnEventId}
                    onChange={e => {
                      setNewEspnEventId(e.target.value)
                      setEspnVerified(null)
                      setEspnVerifyError('')
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); verifyEspnEvent() } }}
                    placeholder="401580360"
                    className={`flex-1 ${INPUT}`}
                  />
                  <button
                    type="button"
                    onClick={verifyEspnEvent}
                    disabled={!newEspnEventId.trim() || espnVerifying}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition whitespace-nowrap"
                  >
                    {espnVerifying ? 'Checking…' : 'Verify'}
                  </button>
                </div>
                <EspnVerifyResult verified={espnVerified} verifyError={espnVerifyError} />
                <p className="mt-1.5 text-xs text-gray-400 leading-relaxed">
                  Open the <span className="font-medium text-gray-500">"Find current event ID"</span> link above during tournament week — the ID is the <code className="bg-gray-100 px-1 rounded">id</code> field on the first event in the JSON. For future events use{' '}
                  <a href="https://site.api.espn.com/apis/site/v2/sports/golf/pga/schedule" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">the schedule endpoint</a>{' '}
                  and find the event's <code className="bg-gray-100 px-1 rounded">id</code> there. Paste it in and hit Verify to confirm.
                </p>
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-gray-600 mb-1">Prize Purse ($)</label>
                <input type="number" value={newPurse} onChange={e => setNewPurse(e.target.value)}
                  placeholder="20000000" className={INPUT} />
              </div>
            </div>

            {/* Cover image */}
            <div>
              <label className="block text-sm text-gray-600 mb-1">Cover Image</label>
              {imagePreview && (
                <img src={imagePreview} alt="Preview" className="w-full h-32 object-cover rounded-lg mb-2" />
              )}
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg p-4 cursor-pointer hover:border-green-400 transition">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm text-gray-500">{imageFile ? imageFile.name : 'Click to upload cover image'}</span>
                <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
              </label>
            </div>

            {createError && <p className="text-sm text-red-600">{createError}</p>}
            <button type="submit" disabled={creating}
              className="w-full bg-green-700 hover:bg-green-800 text-white font-semibold py-2 rounded-lg transition disabled:opacity-50">
              {creating ? 'Creating...' : 'Create Tournament'}
            </button>
          </form>
        </section>

        {/* ── Manage Tournaments ── */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Manage Tournaments</h2>
          {tournaments.length === 0 ? (
            <p className="text-sm text-gray-400">No tournaments yet.</p>
          ) : (
            <div className="space-y-1">
              {tournaments.map(t => (
                <div key={t.id}>
                  {/* Tournament row */}
                  <div className="flex items-center justify-between py-2 border-b border-gray-50">
                    <div className="flex items-center gap-3 min-w-0">
                      {t.imageUrl && (
                        <img src={t.imageUrl} alt={t.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-800 text-sm truncate">{t.name}</p>
                          {statusLabel(t.status)}
                        </div>
                        <p className="text-xs text-gray-400 truncate">
                          {t.id} · ${t.budget?.toLocaleString()}
                          {t.location ? ` · ${t.location}` : ''}
                          {t.espnEventId ? ` · ESPN: ${t.espnEventId}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <button
                        onClick={() => editingId === t.id ? cancelEdit() : startEdit(t)}
                        className="text-xs font-semibold px-3 py-1 rounded-full transition bg-gray-100 text-gray-600 hover:bg-gray-200"
                      >
                        {editingId === t.id ? 'Cancel' : 'Edit'}
                      </button>
                      {statusActions(t)}
                    </div>
                  </div>

                  {/* Inline edit form */}
                  {editingId === t.id && (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mt-1 mb-2 space-y-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Edit Tournament</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <label className="block text-sm text-gray-600 mb-1">Tournament Name</label>
                          <input type="text" value={editForm.name}
                            onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                            className={INPUT} />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">Budget ($)</label>
                          <input type="number" value={editForm.budget}
                            onChange={e => setEditForm(f => ({ ...f, budget: e.target.value }))}
                            className={INPUT} />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">Prize Purse ($)</label>
                          <input type="number" value={editForm.purse}
                            onChange={e => setEditForm(f => ({ ...f, purse: e.target.value }))}
                            className={INPUT} />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-sm text-gray-600 mb-1">Location</label>
                          <input type="text" value={editForm.location}
                            onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))}
                            className={INPUT} />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">Start Date</label>
                          <input type="datetime-local" value={editForm.startDate}
                            onChange={e => setEditForm(f => ({ ...f, startDate: e.target.value }))}
                            className={INPUT} />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">Picks Lock Date</label>
                          <input type="datetime-local" value={editForm.lockDate}
                            onChange={e => setEditForm(f => ({ ...f, lockDate: e.target.value }))}
                            className={INPUT} />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-sm text-gray-600 mb-1">ESPN Event ID</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={editForm.espnEventId}
                              onChange={e => {
                                setEditForm(f => ({ ...f, espnEventId: e.target.value }))
                                setEditVerified(null)
                                setEditVerifyError('')
                              }}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); verifyEspnEditEvent() } }}
                              placeholder="401580360"
                              className={`flex-1 ${INPUT}`}
                            />
                            <button
                              type="button"
                              onClick={verifyEspnEditEvent}
                              disabled={!editForm.espnEventId?.trim() || editVerifying}
                              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition whitespace-nowrap"
                            >
                              {editVerifying ? 'Checking…' : 'Verify'}
                            </button>
                          </div>
                          <EspnVerifyResult verified={editVerified} verifyError={editVerifyError} />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={handleEditSave}
                          disabled={editSaving}
                          className="flex-1 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold py-2 rounded-lg transition disabled:opacity-50"
                        >
                          {editSaving ? 'Saving…' : 'Save Changes'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-300 transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Upload Players CSV ── */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Upload Players (CSV)</h2>
          <div className="mb-3">
            <label className="block text-sm text-gray-600 mb-1">Select Tournament</label>
            <select value={uploadTournamentId} onChange={e => setUploadTournamentId(e.target.value)} className={INPUT}>
              <option value="">-- Choose tournament --</option>
              {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            Columns: <code className="bg-gray-100 px-1 rounded">Name</code> and <code className="bg-gray-100 px-1 rounded">Price</code>
          </p>
          <CSVReader onUploadAccepted={handleCSVUpload}>
            {({ getRootProps, acceptedFile }) => (
              <div {...getRootProps()} className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-green-400 transition">
                {acceptedFile ? <p className="text-sm text-gray-700">{acceptedFile.name}</p> : <p className="text-sm text-gray-400">Drag & drop CSV or click to select</p>}
              </div>
            )}
          </CSVReader>
          {uploadStatus && (
            <p className={`mt-3 text-sm ${uploadStatus.startsWith('Error') || uploadStatus.startsWith('Select') ? 'text-red-600' : 'text-green-700'}`}>{uploadStatus}</p>
          )}
        </section>

        {/* ── Upload Earnings CSV ── */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-800 mb-1">Upload Earnings (CSV)</h2>
          <p className="text-xs text-gray-400 mb-4">Sunday results — only updates earnings, prices unchanged.</p>
          <div className="mb-3">
            <label className="block text-sm text-gray-600 mb-1">Select Tournament</label>
            <select value={earningsTournamentId} onChange={e => setEarningsTournamentId(e.target.value)} className={INPUT}>
              <option value="">-- Choose tournament --</option>
              {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            Columns: <code className="bg-gray-100 px-1 rounded">Name</code> and <code className="bg-gray-100 px-1 rounded">Earnings</code>
          </p>
          <EarningsCSVReader onUploadAccepted={handleEarningsUpload}>
            {({ getRootProps, acceptedFile }) => (
              <div {...getRootProps()} className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-green-400 transition">
                {acceptedFile ? <p className="text-sm text-gray-700">{acceptedFile.name}</p> : <p className="text-sm text-gray-400">Drag & drop earnings CSV or click to select</p>}
              </div>
            )}
          </EarningsCSVReader>
          {earningsStatus && (
            <p className={`mt-3 text-sm ${earningsStatus.startsWith('Error') || earningsStatus.startsWith('Select') ? 'text-red-600' : 'text-green-700'}`}>{earningsStatus}</p>
          )}
        </section>

      </main>
    </div>
  )
}
