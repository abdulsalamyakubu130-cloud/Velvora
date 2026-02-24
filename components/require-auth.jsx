import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/src/context/auth-context'

export default function RequireAuth({ children }) {
  const location = useLocation()
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <section className="surface mx-auto w-full max-w-xl p-6 text-center">
        <p className="text-sm text-muted">Checking account session...</p>
      </section>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />
  }

  return children
}
