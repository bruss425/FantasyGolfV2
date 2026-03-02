import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'

const INPUT = 'w-full bg-gray-900 border border-gray-700 text-white placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent'

export default function Settings() {
  const { user, displayName, teamName, photoUrl, saveProfile } = useAuth()

  const [name, setName] = useState('')
  const [team, setTeam] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Pre-fill from context once loaded
  useEffect(() => {
    if (displayName) setName(displayName)
    if (teamName) setTeam(teamName)
  }, [displayName, teamName])

  function handlePhotoChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Display name is required.'); return }
    setSaving(true)
    setError('')
    try {
      let photo = photoUrl || ''
      if (photoFile) {
        const storageRef = ref(storage, `user-avatars/${user.uid}`)
        const snapshot = await uploadBytes(storageRef, photoFile)
        photo = await getDownloadURL(snapshot.ref)
      }
      await saveProfile({ displayName: name.trim(), teamName: team.trim(), photoUrl: photo })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const previewSrc = photoPreview || photoUrl
  const initials = (name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="bg-gradient-to-b from-green-900 to-gray-950 px-4 pt-5 pb-12">
        <div className="max-w-md mx-auto">
          <Link to="/" className="inline-flex items-center gap-1 text-green-400 hover:text-white text-sm mb-5 transition">
            ← Back
          </Link>
          <p className="text-green-400 text-xs font-bold uppercase tracking-widest mb-2">Account</p>
          <h1 className="text-white text-2xl font-black">Settings</h1>
        </div>
      </div>

      <main className="max-w-md mx-auto px-4 -mt-6 pb-12">
        <form onSubmit={handleSave} className="space-y-5">

          {/* Profile picture */}
          <div className="flex flex-col items-center gap-3 bg-gray-800/60 border border-gray-700/50 rounded-2xl p-6">
            <label className="relative cursor-pointer group">
              {previewSrc ? (
                <img
                  src={previewSrc}
                  alt="Profile"
                  className="w-24 h-24 rounded-full object-cover ring-2 ring-emerald-500/40"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-emerald-800 flex items-center justify-center text-3xl font-black text-emerald-200 ring-2 ring-emerald-500/40">
                  {initials}
                </div>
              )}
              {/* Camera overlay */}
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                </svg>
              </div>
              <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
            </label>
            <p className="text-xs text-gray-500">Tap to change profile photo</p>
          </div>

          {/* Fields */}
          <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Display Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ben Russell"
                className={INPUT}
              />
              <p className="text-xs text-gray-600 mt-1">Shown on the leaderboard alongside your team name</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Team Nickname
              </label>
              <input
                type="text"
                value={team}
                onChange={e => setTeam(e.target.value)}
                placeholder="The Albatross Eagles"
                className={INPUT}
              />
              <p className="text-xs text-gray-600 mt-1">Your fantasy team name — shown prominently on the leaderboard</p>
            </div>
          </div>

          {error && <p className="text-sm text-red-400 text-center">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold py-3 rounded-2xl transition"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </main>

      {/* Success toast */}
      {saved && (
        <div className="toast-enter fixed top-6 left-1/2 z-50 pointer-events-none">
          <div className="bg-emerald-500 text-white text-sm font-bold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 whitespace-nowrap">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Profile saved!
          </div>
        </div>
      )}
    </div>
  )
}
