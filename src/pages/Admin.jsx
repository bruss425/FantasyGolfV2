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
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

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
      })

      setNewName('')
      setNewBudget('')
      setNewSlug('')
      setNewLocation('')
      setNewStartDate('')
      setNewLockDate('')
      setImageFile(null)
      setImagePreview(null)
      await loadTournaments()
    } catch (err) {
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function toggleStatus(tournament) {
    const next = tournament.status === 'open' ? 'locked' : 'open'
    await updateDoc(doc(db, 'tournaments', tournament.id), { status: next })
    setTournaments(prev =>
      prev.map(t => (t.id === tournament.id ? { ...t, status: next } : t))
    )
  }

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

  function statusLabel(status) {
    return status === 'open'
      ? <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Open</span>
      : <span className="text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">Locked</span>
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
            <div className="space-y-2">
              {tournaments.map(t => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    {t.imageUrl && (
                      <img src={t.imageUrl} alt={t.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-800 text-sm">{t.name}</p>
                        {statusLabel(t.status)}
                      </div>
                      <p className="text-xs text-gray-400">{t.id} · ${t.budget?.toLocaleString()}{t.location ? ` · ${t.location}` : ''}</p>
                    </div>
                  </div>
                  <button onClick={() => toggleStatus(t)}
                    className={`text-xs font-semibold px-3 py-1 rounded-full transition shrink-0 ${
                      t.status === 'open' ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}>
                    {t.status === 'open' ? 'Lock' : 'Unlock'}
                  </button>
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
