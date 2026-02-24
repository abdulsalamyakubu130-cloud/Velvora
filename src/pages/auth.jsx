import { useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/src/context/auth-context'
import { validateEmailForAuth } from '@/lib/security/email-policy'
import { validatePhoneForAuth } from '@/lib/security/phone-policy'
import { formatRetryTime, getThrottleState, recordAuthAttempt } from '@/lib/security/auth-throttle'
import { assessSignupFraud } from '@/lib/security/fraud-rules'
import { useI18n } from '@/src/context/i18n-context'

const COUNTRY_DIAL_CODES = [
  { code: '+234', label: 'Nigeria (+234)' },
  { code: '+1', label: 'United States (+1)' },
  { code: '+44', label: 'United Kingdom (+44)' },
  { code: '+233', label: 'Ghana (+233)' },
  { code: '+254', label: 'Kenya (+254)' },
  { code: '+27', label: 'South Africa (+27)' },
  { code: '+91', label: 'India (+91)' },
  { code: '+971', label: 'UAE (+971)' },
]

function normalizeLocalPhone(rawPhone) {
  return String(rawPhone || '').replace(/[^\d]/g, '')
}

function buildInternationalPhone(dialCode, localPhone) {
  const normalizedDialCode = String(dialCode || '').trim()
  const localDigits = normalizeLocalPhone(localPhone).replace(/^0+/, '')
  return `${normalizedDialCode}${localDigits}`
}

export default function AuthPage() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [dialCode, setDialCode] = useState('+234')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [recoveryPassword, setRecoveryPassword] = useState('')
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [otpPending, setOtpPending] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [pending, setPending] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useI18n()
  const {
    isAuthenticated,
    isConfigured,
    signInWithPassword,
    signUpWithPassword,
    verifyEmailOtp,
    resendSignupEmailCode,
    sendPasswordResetEmail,
    updatePassword,
  } = useAuth()
  const redirectTo = location.state?.from || '/'
  const isRecoveryMode = useMemo(() => {
    const query = new URLSearchParams(location.search)
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''))
    return query.get('type') === 'recovery' || hash.get('type') === 'recovery'
  }, [location.hash, location.search])

  if (isAuthenticated && !isRecoveryMode) {
    return <Navigate to={redirectTo} replace />
  }

  function switchMode(nextMode) {
    setMode(nextMode)
    setFeedback('')
    setPending(false)
    setOtpPending(false)
    setOtpCode('')
    setSignupEmail('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const authAction = mode === 'signup' ? 'signup' : 'signin'
    const throttle = getThrottleState(authAction)
    if (!throttle.allowed) {
      setFeedback(`Too many attempts. Try again in ${formatRetryTime(throttle.retryAfterMs)}.`)
      return
    }

    const shouldUsePhone = mode === 'signup'
    const shouldUseEmail = true

    const composedPhone = shouldUsePhone ? buildInternationalPhone(dialCode, phone) : ''
    const phonePolicy = shouldUsePhone ? validatePhoneForAuth(composedPhone) : null
    const emailPolicy = shouldUseEmail
      ? validateEmailForAuth(email)
      : {
          allowed: true,
          normalizedEmail: '',
          message: '',
        }

    if (!isConfigured) {
      setFeedback(t('auth.configure_supabase'))
      return
    }

    if (!emailPolicy.allowed) {
      setFeedback(emailPolicy.message)
      return
    }

    if (mode === 'signup' && !phonePolicy?.allowed) {
      setFeedback(phonePolicy.message)
      return
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setFeedback('Passwords do not match.')
      return
    }

    setPending(true)
    setFeedback('')

    if (mode === 'signup') {
      const normalizedEmail = emailPolicy.normalizedEmail
      const generatedUsername = `${normalizedEmail.split('@')[0]}_${Date.now().toString().slice(-6)}`
      const riskAssessment = assessSignupFraud({
        email: normalizedEmail,
        phone: phonePolicy.normalizedPhone,
        password,
        username: generatedUsername,
      })

      if (riskAssessment.blocked) {
        setPending(false)
        recordAuthAttempt('signup', false)
        setFeedback(riskAssessment.message)
        return
      }
      const { data, error } = await signUpWithPassword({
        phone: phonePolicy.normalizedPhone,
        email: normalizedEmail,
        password,
        username: generatedUsername,
      })
      setPending(false)

      if (error) {
        recordAuthAttempt(authAction, false)
        setFeedback(error.message)
        return
      }

      recordAuthAttempt(authAction, true)
      setSignupEmail(normalizedEmail)
      setOtpPending(true)
      setFeedback(
        data?.session
          ? 'Email verification appears disabled. Enable email confirmation to enforce code verification.'
          : 'Account created. Enter the verification code sent to your email.',
      )
      return
    }

    const { error } = await signInWithPassword(emailPolicy.normalizedEmail, password)

    setPending(false)

    if (error) {
      recordAuthAttempt(authAction, false)
      setFeedback(error.message)
      return
    }

    recordAuthAttempt(authAction, true)
    navigate(redirectTo, { replace: true })
  }

  async function handleVerifyOtp(event) {
    event.preventDefault()
    const throttle = getThrottleState('verify')
    if (!throttle.allowed) {
      setFeedback(`Too many code attempts. Try again in ${formatRetryTime(throttle.retryAfterMs)}.`)
      return
    }

    if (!otpCode.trim()) {
      setFeedback('Enter the email verification code.')
      return
    }

    setPending(true)
    setFeedback('')

    const { error: verifyError } = await verifyEmailOtp(signupEmail, otpCode.trim())
    if (verifyError) {
      setPending(false)
      recordAuthAttempt('verify', false)
      setFeedback(verifyError.message)
      return
    }

    recordAuthAttempt('verify', true)
    const { error: signInError } = await signInWithPassword(signupEmail, password)
    setPending(false)

    if (signInError) {
      setFeedback('Email verified. Please sign in with your email and password.')
      return
    }

    navigate(redirectTo, { replace: true })
  }

  async function handleResendCode() {
    const throttle = getThrottleState('resend')
    if (!throttle.allowed) {
      setFeedback(`Too many resend requests. Try again in ${formatRetryTime(throttle.retryAfterMs)}.`)
      return
    }

    if (!signupEmail) {
      setFeedback('Sign up first, then request a new verification code.')
      return
    }

    setPending(true)
    setFeedback('')
    const { error } = await resendSignupEmailCode(signupEmail)
    setPending(false)

    if (error) {
      recordAuthAttempt('resend', false)
      setFeedback(error.message)
      return
    }

    recordAuthAttempt('resend', true)
    setFeedback(`A new verification email was sent to ${signupEmail}.`)
  }

  async function handleForgotPassword() {
    if (!isConfigured) {
      setFeedback(t('auth.configure_supabase'))
      return
    }

    const emailPolicy = validateEmailForAuth(email)
    if (!emailPolicy.allowed) {
      setFeedback(emailPolicy.message)
      return
    }

    setPending(true)
    setFeedback('')
    const { error } = await sendPasswordResetEmail(emailPolicy.normalizedEmail)
    setPending(false)

    if (error) {
      setFeedback(error.message || 'Failed to send password reset email.')
      return
    }

    setFeedback(`Password reset email sent to ${emailPolicy.normalizedEmail}. Check your inbox and spam folder.`)
  }

  async function handleRecoveryPasswordSubmit(event) {
    event.preventDefault()
    setFeedback('')

    if (recoveryPassword.length < 8) {
      setFeedback('New password must be at least 8 characters.')
      return
    }

    if (recoveryPassword !== recoveryConfirmPassword) {
      setFeedback('Password confirmation does not match.')
      return
    }

    setPending(true)
    const { error } = await updatePassword(recoveryPassword)
    setPending(false)

    if (error) {
      setFeedback(error.message || 'Failed to reset password. Open the latest reset email link and try again.')
      return
    }

    setRecoveryPassword('')
    setRecoveryConfirmPassword('')
    setFeedback('Password reset successful. You can now sign in with your new password.')
    navigate('/auth', { replace: true })
  }

  if (isRecoveryMode) {
    return (
      <div className="mx-auto w-full max-w-md animate-rise">
        <section className="surface p-5 sm:p-6">
          <h1 className="font-brand text-2xl font-semibold">Reset Password</h1>
          <p className="mt-1 text-sm text-muted">Enter a new password for your account.</p>

          <form onSubmit={handleRecoveryPasswordSubmit} className="mt-4 space-y-3">
            <input
              className="input"
              type="password"
              value={recoveryPassword}
              onChange={(event) => setRecoveryPassword(event.target.value)}
              placeholder="New password"
              minLength={8}
              required
            />
            <input
              className="input"
              type="password"
              value={recoveryConfirmPassword}
              onChange={(event) => setRecoveryConfirmPassword(event.target.value)}
              placeholder="Confirm new password"
              minLength={8}
              required
            />
            <button className="btn-primary w-full" type="submit" disabled={pending}>
              {pending ? 'Updating...' : 'Update password'}
            </button>
          </form>

          <p className="mt-3 text-sm text-muted">{feedback}</p>
        </section>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-md animate-rise">
      <section className="surface p-5 sm:p-6">
        <h1 className="font-brand text-2xl font-semibold">{t('auth.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('auth.subtitle')}</p>

        <div className="mt-4 grid grid-cols-2 rounded-full border border-line bg-white p-1">
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className={`rounded-full px-2 py-2 text-xs font-semibold transition sm:px-3 sm:text-sm ${
              mode === 'signin' ? 'bg-accent text-white' : 'text-muted hover:text-accent'
            }`}
          >
            <span className="whitespace-nowrap">{t('auth.sign_in')}</span>
          </button>
          <button
            type="button"
            onClick={() => switchMode('signup')}
            className={`rounded-full px-2 py-2 text-xs font-semibold transition sm:px-3 sm:text-sm ${
              mode === 'signup' ? 'bg-accent text-white' : 'text-muted hover:text-accent'
            }`}
          >
            <span className="sm:hidden">Sign up</span>
            <span className="hidden whitespace-nowrap sm:inline">{t('auth.create_account')}</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          {mode === 'signup' ? (
            <div className="grid grid-cols-[minmax(0,180px),minmax(0,1fr)] gap-2">
              <select className="input" value={dialCode} onChange={(event) => setDialCode(event.target.value)}>
                {COUNTRY_DIAL_CODES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
              <input
                className="input"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Phone number"
                required={mode === 'signup'}
              />
            </div>
          ) : null}

          <input
            className="input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t('auth.email_placeholder')}
            required
          />
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t('auth.password_placeholder')}
            required
            minLength={8}
          />
          {mode === 'signup' ? (
            <input
              className="input"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder={t('auth.confirm_password_placeholder')}
              required
              minLength={8}
            />
          ) : null}
          <button className="btn-primary w-full" type="submit" disabled={pending}>
            {pending ? t('auth.please_wait') : mode === 'signin' ? t('auth.submit_signin') : t('auth.submit_signup')}
          </button>
          {mode === 'signin' ? (
            <button type="button" className="btn-muted w-full" onClick={handleForgotPassword} disabled={pending}>
              Forgot password?
            </button>
          ) : null}
        </form>

        {mode === 'signup' && otpPending ? (
          <form onSubmit={handleVerifyOtp} className="mt-4 space-y-3 rounded-xl border border-line bg-accentSoft/50 p-3">
            <p className="text-xs text-muted">
              {t('auth.verify_line', { target: signupEmail })}
            </p>
            <input
              className="input"
              value={otpCode}
              onChange={(event) => setOtpCode(event.target.value)}
              placeholder={t('auth.otp_placeholder')}
              required
            />
            <button className="btn-primary w-full" type="submit" disabled={pending}>
              {pending ? t('auth.verifying') : t('auth.verify_button')}
            </button>
            <button type="button" className="btn-muted w-full" onClick={handleResendCode} disabled={pending}>
              Resend code
            </button>
            <p className="text-xs text-muted">
              If no code appears, check spam and ensure your email template includes the verification code token.
            </p>
          </form>
        ) : null}

        <p className="mt-3 text-sm text-muted">{feedback}</p>
        {mode === 'signup' ? <p className="mt-2 text-xs text-muted">{t('auth.requirement')}</p> : null}
        <p className="mt-3 text-xs text-muted">
          {t('auth.guidelines_prefix')}{' '}
          <Link className="underline" to="/guidelines">{t('auth.guidelines_link')}</Link>.
        </p>
      </section>
    </div>
  )
}
