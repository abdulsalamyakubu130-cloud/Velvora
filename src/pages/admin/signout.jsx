import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/src/context/auth-context'
import { ADMIN_PANEL_SESSION_KEY, ADMIN_SIGNIN_PATH } from '@/lib/admin/config'

export default function AdminSignOutPage() {
  const { signOut } = useAuth()
  const [pending, setPending] = useState(true)
  const [message, setMessage] = useState('Signing you out of control room...')

  useEffect(() => {
    let active = true

    async function runSignOut() {
      try {
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(ADMIN_PANEL_SESSION_KEY)
        }
        await signOut()
        if (!active) return
        setMessage('Signed out successfully.')
      } catch {
        if (!active) return
        setMessage('Sign out completed. You can sign in again.')
      } finally {
        if (active) setPending(false)
      }
    }

    runSignOut()
    return () => {
      active = false
    }
  }, [signOut])

  return (
    <section className="surface mx-auto w-full max-w-md p-6">
      <h1 className="font-brand text-2xl font-semibold">Control Room Sign Out</h1>
      <p className="mt-2 text-sm text-muted">{message}</p>
      <div className="mt-4">
        <Link to={ADMIN_SIGNIN_PATH} className={`btn-primary ${pending ? 'pointer-events-none opacity-70' : ''}`}>
          {pending ? 'Please wait...' : 'Go to control room sign in'}
        </Link>
      </div>
    </section>
  )
}
