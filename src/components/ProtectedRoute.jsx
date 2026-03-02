import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { user, needsSetup } = useAuth()

  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (user === null) {
    return <Navigate to="/login" replace />
  }

  if (needsSetup) {
    return <Navigate to="/setup" replace />
  }

  return children
}
