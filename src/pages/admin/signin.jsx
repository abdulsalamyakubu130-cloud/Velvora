import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/src/context/auth-context'
import {
  ADMIN_BASE_PATH,
  ADMIN_PANEL_PASSWORD,
  ADMIN_PANEL_SESSION_KEY,
  ADMIN_SIGNOUT_PATH,
  isAdminUser,
} from '@/lib/admin/config'

export default function AdminSignInPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, isLoading, user, signInWithPassword, signOut } = useAuth()
  const [pending, setPending] = useState(false)
  const [email, setEmail] = useState('velvora278@gmail.com')
  const [accountPassword, setAccountPassword] = useState('')
  const [panelPassword, setPanelPassword] = useState('')
  const [feedback, setFeedback] = useState('')

  const fromState = typeof location.state?.from === 'string' ? location.state.from : ''
  const redirectTo = fromState.startsWith(ADMIN_BASE_PATH) ? fromState : ADMIN_BASE_PATH

  const hasControlRoomPassword =
    typeof window !== 'undefined' &&
    window.sessionStorage.getItem(ADMIN_PANEL_SESSION_KEY) === ADMIN_PANEL_PASSWORD

  if (isAuthenticated && isAdminUser(user) && hasControlRoomPassword) {
    return <Navigate to={redirectTo} replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setPending(true)
    setFeedback('')

    if (!ADMIN_PANEL_PASSWORD) {
      setPending(false)
      setFeedback('Control room password is not configured.')
      return
    }

    if (panelPassword.trim() !== ADMIN_PANEL_PASSWORD.trim()) {
      setPending(false)
      setFeedback('Incorrect control room password.')
      return
    }

    const { data, error } = await signInWithPassword(email.trim(), accountPassword)
    if (error) {
      setPending(false)
      setFeedback(error.message || 'Admin sign in failed.')
      return
    }

    const signedInUser = data?.user || data?.session?.user || null
    if (!isAdminUser(signedInUser)) {
      await signOut()
      setPending(false)
      setFeedback('Access denied. This account is not an admin.')
      return
    }

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(ADMIN_PANEL_SESSION_KEY, ADMIN_PANEL_PASSWORD)
    }

    setPending(false)
    setEmail('')
    setAccountPassword('')
    setPanelPassword('')
    navigate(redirectTo, { replace: true })
  }

  if (isLoading) {
    return (
      <section className="surface mx-auto w-full max-w-md p-6">
        <p className="text-sm text-muted">Checking admin session...</p>
      </section>
    )
  }

  return (
    <section className="surface mx-auto w-full max-w-md p-6">
      <h1 className="font-brand text-2xl font-semibold">Control Room Sign In</h1>
      <p className="mt-2 text-sm text-muted">Use admin account credentials plus control room password.</p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <input
          className="input"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Admin email"
          autoComplete="email"
          required
        />
        <input
          className="input"
          type="password"
          value={accountPassword}
          onChange={(event) => setAccountPassword(event.target.value)}
          placeholder="Account password"
          autoComplete="current-password"
          required
        />
        <input
          className="input"
          type="password"
          value={panelPassword}
          onChange={(event) => setPanelPassword(event.target.value)}
          placeholder="Control room password"
          autoComplete="off"
          required
        />
        <button
          className="btn-primary w-full"
          type="submit"
          disabled={pending}
        >
          {pending ? 'Signing in...' : 'Sign in to control room'}
        </button>
      </form>

      {feedback ? <p className="mt-3 text-sm text-muted">{feedback}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-muted"
          onClick={() => navigate(ADMIN_SIGNOUT_PATH)}
        >
          Sign out control room
        </button>
      </div>
    </section>
  )
}
