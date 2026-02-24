import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/src/context/auth-context'
import {
  ADMIN_PANEL_PASSWORD,
  ADMIN_PANEL_SESSION_KEY,
  ADMIN_SIGNIN_PATH,
  isAdminUser,
} from '@/lib/admin/config'

export default function RequireAdmin({ children }) {
  const location = useLocation()
  const { isAuthenticated, isLoading, user } = useAuth()
  const isAdmin = isAdminUser(user)

  if (isLoading) {
    return (
      <section className="surface mx-auto w-full max-w-xl p-6 text-center">
        <p className="text-sm text-muted">Checking admin access...</p>
      </section>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to={ADMIN_SIGNIN_PATH} replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />
  }

  if (!isAdmin) {
    return (
      <section className="surface mx-auto w-full max-w-xl p-6 text-center">
        <h1 className="font-brand text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted">The page you requested does not exist.</p>
      </section>
    )
  }

  const hasControlRoomPassword =
    typeof window !== 'undefined' &&
    window.sessionStorage.getItem(ADMIN_PANEL_SESSION_KEY) === ADMIN_PANEL_PASSWORD

  if (!hasControlRoomPassword) {
    return <Navigate to={ADMIN_SIGNIN_PATH} replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />
  }

  return children
}
