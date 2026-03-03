import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // undefined = loading, null = logged out, object = logged in
  const [user, setUser] = useState(undefined)
  const [displayName, setDisplayName] = useState(null)
  const [teamName, setTeamName] = useState(null)
  const [photoUrl, setPhotoUrl] = useState(null)
  const [needsSetup, setNeedsSetup] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userRef = doc(db, 'users', firebaseUser.uid)
          const snap = await getDoc(userRef)
          if (snap.exists() && snap.data().displayName) {
            const data = snap.data()
            setDisplayName(data.displayName)
            setTeamName(data.teamName || null)
            setPhotoUrl(data.photoUrl || null)
            setNeedsSetup(false)
          } else {
            setDisplayName(null)
            setTeamName(null)
            setPhotoUrl(null)
            setNeedsSetup(true)
          }
        } catch (err) {
          console.warn('Could not load user doc:', err.message)
          setDisplayName(null)
          setTeamName(null)
          setPhotoUrl(null)
          setNeedsSetup(true)
        }
      } else {
        setDisplayName(null)
        setTeamName(null)
        setPhotoUrl(null)
        setNeedsSetup(false)
      }
      setUser(firebaseUser ?? null)
    })
    return unsubscribe
  }, [])

  // Used by SetupName.jsx (first login, email users)
  async function saveDisplayName(name) {
    if (!user) return
    const userRef = doc(db, 'users', user.uid)
    await setDoc(userRef, { displayName: name }, { merge: true })
    setDisplayName(name)
    setNeedsSetup(false)
  }

  // Used by Settings.jsx — updates all profile fields
  async function saveProfile({ displayName: name, teamName: team, photoUrl: photo }) {
    if (!user) return
    const userRef = doc(db, 'users', user.uid)
    await setDoc(userRef, { displayName: name, teamName: team, photoUrl: photo }, { merge: true })
    setDisplayName(name)
    setTeamName(team)
    setPhotoUrl(photo)
  }

  const isAdmin = user?.uid === import.meta.env.VITE_ADMIN_UID

  return (
    <AuthContext.Provider value={{ user, displayName, teamName, photoUrl, isAdmin, needsSetup, saveDisplayName, saveProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
