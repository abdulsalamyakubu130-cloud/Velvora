import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    if (!supabase) {
      setIsLoading(false)
      return undefined
    }

    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session ?? null)
      setIsLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null)
      setIsLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function signInWithPassword(email, password) {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return { error: new Error('Authentication service is not configured.') }
    return supabase.auth.signInWithPassword({ email, password })
  }

  async function signUpWithPassword({ phone, email, password, username }) {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return { error: new Error('Authentication service is not configured.') }

    const [{ data: emailRows, error: emailLookupError }, { data: phoneRows, error: phoneLookupError }] =
      await Promise.all([
        supabase.from('users').select('id').eq('email', email).limit(1),
        supabase.from('users').select('id').eq('phone_number', phone).limit(1),
      ])

    if (!emailLookupError && emailRows?.length) {
      return { data: null, error: new Error('This email is already used by another account.') }
    }

    if (!phoneLookupError && phoneRows?.length) {
      return { data: null, error: new Error('This phone number is already used by another account.') }
    }

    return supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: import.meta.env.VITE_AUTH_REDIRECT_URL || undefined,
        data: {
          phone,
          username,
          country: 'Nigeria',
        },
      },
    })
  }

  async function verifyEmailOtp(email, token) {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return { error: new Error('Authentication service is not configured.') }
    const signupVerification = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'signup',
    })

    if (!signupVerification.error) return signupVerification

    // Fallback to generic email OTP type in case provider/template flow returns that type.
    return supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    })
  }

  async function resendSignupEmailCode(email) {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return { error: new Error('Authentication service is not configured.') }
    return supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: import.meta.env.VITE_AUTH_REDIRECT_URL || undefined,
      },
    })
  }

  async function sendPasswordResetEmail(email) {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return { error: new Error('Authentication service is not configured.') }
    return supabase.auth.resetPasswordForEmail(email, {
      redirectTo: import.meta.env.VITE_AUTH_REDIRECT_URL || undefined,
    })
  }

  async function updatePassword(password) {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return { error: new Error('Authentication service is not configured.') }
    return supabase.auth.updateUser({ password })
  }

  async function signOut() {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return { error: new Error('Authentication service is not configured.') }
    return supabase.auth.signOut()
  }

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      isAuthenticated: Boolean(session),
      isLoading,
      isConfigured: isSupabaseConfigured,
      signInWithPassword,
      signUpWithPassword,
      verifyEmailOtp,
      resendSignupEmailCode,
      sendPasswordResetEmail,
      updatePassword,
      signOut,
    }),
    [session, isLoading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.')
  }
  return context
}
