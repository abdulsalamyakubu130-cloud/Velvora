import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { maxVerificationTier, normalizeVerificationTier } from '@/lib/utils'
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { useAuth } from '@/src/context/auth-context'
import { useI18n } from '@/src/context/i18n-context'

const usernamePattern = /^[a-zA-Z0-9._-]{3,30}$/

export default function SettingsPage() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { language, setLanguage, availableLanguages } = useI18n()
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileFeedback, setProfileFeedback] = useState('')
  const [passwordFeedback, setPasswordFeedback] = useState('')
  const [updatingPassword, setUpdatingPassword] = useState(false)
  const [kycPending, setKycPending] = useState(false)
  const [kycFeedback, setKycFeedback] = useState('')
  const [kycTier, setKycTier] = useState('none')
  const [kycRequestTier, setKycRequestTier] = useState('basic')
  const [kycRequestStatus, setKycRequestStatus] = useState('')
  const [deletePending, setDeletePending] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteFeedback, setDeleteFeedback] = useState('')

  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [country, setCountry] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    async function loadProfile() {
      if (!user?.id) {
        setLoadingProfile(false)
        return
      }

      setLoadingProfile(true)
      const supabase = getSupabaseBrowserClient()
      if (!supabase || !isSupabaseConfigured) {
        setFullName(user.user_metadata?.full_name || '')
        setUsername(user.user_metadata?.username || user.email?.split('@')[0] || '')
        setBio(user.user_metadata?.bio || '')
        setCountry(user.user_metadata?.country || 'Nigeria')
        setLoadingProfile(false)
        return
      }

      const [{ data, error }, { data: approvedKycRow }] = await Promise.all([
        supabase
          .from('users')
          .select('full_name, username, bio, country, is_verified, verification_tier')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('kyc_verifications')
          .select('tier_requested')
          .eq('user_id', user.id)
          .eq('status', 'approved')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      const approvedTier = normalizeVerificationTier(approvedKycRow?.tier_requested)

      if (error || !data) {
        setFullName(user.user_metadata?.full_name || '')
        setUsername(user.user_metadata?.username || user.email?.split('@')[0] || '')
        setBio(user.user_metadata?.bio || '')
        setCountry(user.user_metadata?.country || 'Nigeria')
        setKycTier(maxVerificationTier(normalizeVerificationTier(user.user_metadata?.verification_tier), approvedTier))
      } else {
        setFullName(data.full_name || '')
        setUsername(data.username || '')
        setBio(data.bio || '')
        setCountry(data.country || user.user_metadata?.country || 'Nigeria')
        setKycTier(maxVerificationTier(normalizeVerificationTier(data.verification_tier, data.is_verified), approvedTier))
      }

      const { data: latestKyc } = await supabase
        .from('kyc_verifications')
        .select('tier_requested, status, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestKyc?.status) {
        setKycRequestStatus(`${latestKyc.status} (${latestKyc.tier_requested})`)
      } else {
        setKycRequestStatus('')
      }

      setLoadingProfile(false)
    }

    loadProfile()
  }, [user?.id, user?.email, user?.user_metadata])

  async function handleSaveProfile(event) {
    event.preventDefault()
    setProfileFeedback('')

    const trimmedUsername = username.trim()
    if (!usernamePattern.test(trimmedUsername)) {
      setProfileFeedback(
        'Username must be 3-30 characters and only use letters, numbers, dot, underscore, or hyphen.',
      )
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase || !user?.id) {
      setProfileFeedback('You need to be signed in to save settings.')
      return
    }

    setSavingProfile(true)

    const { data: usernameOwner, error: usernameLookupError } = await supabase
      .from('users')
      .select('id')
      .eq('username', trimmedUsername)
      .neq('id', user.id)
      .maybeSingle()

    if (!usernameLookupError && usernameOwner?.id) {
      setSavingProfile(false)
      setProfileFeedback('That username is already taken. Choose a different one.')
      return
    }

    const profilePayload = {
      id: user.id,
      full_name: fullName.trim(),
      username: trimmedUsername,
      bio: bio.trim(),
      country: country.trim(),
      email: user.email || null,
      phone_number: user.phone || null,
    }

    const { data: savedProfile, error: profileError } = await supabase.from('users').upsert(
      profilePayload,
      { onConflict: 'id' },
    )
      .select('full_name, username, bio, country')
      .maybeSingle()

    if (profileError) {
      setSavingProfile(false)
      const message = String(profileError.message || '')
      const details = String(profileError.details || '')
      const isUsernameConflict =
        profileError.code === '23505' ||
        message.toLowerCase().includes('username') ||
        details.toLowerCase().includes('username')

      if (isUsernameConflict) {
        setProfileFeedback('That username is already taken. Choose a different one.')
      } else {
        setProfileFeedback(message || 'Failed to save profile settings.')
      }
      return
    }

    setSavingProfile(false)

    if (savedProfile) {
      setFullName(savedProfile.full_name || '')
      setUsername(savedProfile.username || trimmedUsername)
      setBio(savedProfile.bio || '')
      setCountry(savedProfile.country || '')
    } else {
      setUsername(trimmedUsername)
    }

    setProfileFeedback('Settings saved successfully.')
  }

  async function handleChangePassword(event) {
    event.preventDefault()
    setPasswordFeedback('')

    if (newPassword.length < 8) {
      setPasswordFeedback('New password must be at least 8 characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordFeedback('Password confirmation does not match.')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setPasswordFeedback('Unable to connect to auth service right now.')
      return
    }

    setUpdatingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setUpdatingPassword(false)

    if (error) {
      setPasswordFeedback(error.message || 'Failed to update password.')
      return
    }

    setNewPassword('')
    setConfirmPassword('')
    setPasswordFeedback('Password updated successfully.')
  }

  async function handleRequestKyc(event) {
    event.preventDefault()
    setKycFeedback('')

    const supabase = getSupabaseBrowserClient()
    if (!supabase || !user?.id) {
      setKycFeedback('You need to be signed in to request verification.')
      return
    }

    if (kycTier !== 'none' && kycRequestTier === 'basic') {
      setKycFeedback('Your account is already verified at basic level or higher.')
      return
    }

    setKycPending(true)
    const { data: existingRequest, error: existingRequestError } = await supabase
      .from('kyc_verifications')
      .select('status, tier_requested')
      .eq('user_id', user.id)
      .eq('tier_requested', kycRequestTier)
      .maybeSingle()

    if (existingRequestError) {
      setKycPending(false)
      setKycFeedback(existingRequestError.message || 'Failed to check existing verification requests.')
      return
    }

    if (existingRequest?.status === 'pending') {
      setKycPending(false)
      setKycRequestStatus(`pending (${existingRequest.tier_requested})`)
      setKycFeedback('You already have a pending verification request for this tier.')
      return
    }

    if (existingRequest?.status === 'approved') {
      setKycPending(false)
      setKycTier((currentTier) => maxVerificationTier(currentTier, existingRequest.tier_requested))
      setKycRequestStatus(`approved (${existingRequest.tier_requested})`)
      setKycFeedback('This verification tier has already been approved on your account.')
      return
    }

    if (existingRequest?.status === 'rejected') {
      setKycPending(false)
      setKycRequestStatus(`rejected (${existingRequest.tier_requested})`)
      setKycFeedback('This tier was previously rejected. Contact admin or request a different tier.')
      return
    }

    const { error } = await supabase.from('kyc_verifications').insert({
      user_id: user.id,
      tier_requested: kycRequestTier,
      status: 'pending',
    })
    setKycPending(false)

    if (error) {
      if (error.code === '23505') {
        setKycFeedback('A verification request for this tier already exists.')
      } else {
        const message = String(error.message || '')
        const isRlsError = message.toLowerCase().includes('row-level security')
        setKycFeedback(
          isRlsError
            ? 'Permission blocked by KYC policy. Ask admin to verify kyc_insert_own policy in Supabase.'
            : message || 'Failed to submit verification request.',
        )
      }
      return
    }

    setKycRequestStatus(`pending (${kycRequestTier})`)
    setKycFeedback('Verification request submitted. Admin review is pending.')
  }

  async function handleDeleteAccount(event) {
    event.preventDefault()
    setDeleteFeedback('')

    if (deleteConfirmText.trim() !== 'DELETE') {
      setDeleteFeedback('Type DELETE in uppercase to confirm account deletion.')
      return
    }

    const confirmed = window.confirm('Delete account permanently? This removes your profile and posts.')
    if (!confirmed) return

    const supabase = getSupabaseBrowserClient()
    if (!supabase || !user?.id) {
      setDeleteFeedback('You need to be signed in to delete your account.')
      return
    }

    setDeletePending(true)

    const { error: deleteError } = await supabase.from('users').delete().eq('id', user.id)
    if (deleteError) {
      setDeletePending(false)
      const message = String(deleteError.message || '')
      const isPolicyIssue =
        message.toLowerCase().includes('row-level security') ||
        message.toLowerCase().includes('permission denied')

      if (isPolicyIssue) {
        setDeleteFeedback('Account deletion is blocked by database policy. Ask admin to enable users self-delete policy.')
      } else {
        setDeleteFeedback(message || 'Failed to delete account.')
      }
      return
    }

    await signOut()
    setDeletePending(false)
    setDeleteConfirmText('')
    navigate('/auth', { replace: true })
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <header className="surface p-5">
        <h1 className="font-brand text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted">Manage your account, language, and security preferences.</p>
      </header>

      <section className="surface p-5">
        <h2 className="text-lg font-semibold text-ink">Account</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Email</p>
            <p className="text-sm text-ink">{user?.email || user?.user_metadata?.email || 'Not set'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Phone</p>
            <p className="text-sm text-ink">{user?.phone || 'Not set'}</p>
          </div>
        </div>
      </section>

      <section className="surface p-5">
        <h2 className="text-lg font-semibold text-ink">Profile</h2>
        {loadingProfile ? (
          <p className="mt-3 text-sm text-muted">Loading profile settings...</p>
        ) : (
          <form onSubmit={handleSaveProfile} className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className="input"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Full name"
              />
              <input
                className="input"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Username"
                required
              />
            </div>
            <textarea
              className="input min-h-24"
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              placeholder="Bio"
            />
            <input
              className="input"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              placeholder="Country"
            />
            <button className="btn-primary" type="submit" disabled={savingProfile}>
              {savingProfile ? 'Saving...' : 'Save profile settings'}
            </button>
            {profileFeedback ? <p className="text-sm text-muted">{profileFeedback}</p> : null}
          </form>
        )}
      </section>

      <section className="surface p-5">
        <h2 className="text-lg font-semibold text-ink">Language</h2>
        <div className="mt-3 max-w-xs">
          <select
            className="input"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            {availableLanguages.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="surface p-5">
        <h2 className="text-lg font-semibold text-ink">Seller Verification (KYC)</h2>
        <p className="mt-2 text-sm text-muted">
          Current tier: {kycTier === 'enhanced' ? 'Enhanced' : kycTier === 'basic' ? 'Basic' : 'Unverified'}
        </p>
        {kycRequestStatus ? <p className="mt-1 text-xs text-muted">Latest request: {kycRequestStatus}</p> : null}
        <form onSubmit={handleRequestKyc} className="mt-3 space-y-3">
          <select
            className="input max-w-xs"
            value={kycRequestTier}
            onChange={(event) => setKycRequestTier(event.target.value)}
          >
            <option value="basic">Basic verification</option>
            <option value="enhanced">Enhanced verification</option>
          </select>
          <button className="btn-primary" type="submit" disabled={kycPending}>
            {kycPending ? 'Submitting...' : 'Request verification'}
          </button>
          {kycFeedback ? <p className="text-sm text-muted">{kycFeedback}</p> : null}
          {kycTier === 'none' ? (
            <p className="text-xs text-muted">Unverified sellers can publish up to 3 active listings.</p>
          ) : null}
        </form>
      </section>

      <section className="surface p-5">
        <h2 className="text-lg font-semibold text-ink">Security</h2>
        <form onSubmit={handleChangePassword} className="mt-3 space-y-3">
          <input
            className="input"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="New password"
            minLength={8}
            required
          />
          <input
            className="input"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm new password"
            minLength={8}
            required
          />
          <button className="btn-primary" type="submit" disabled={updatingPassword}>
            {updatingPassword ? 'Updating...' : 'Update password'}
          </button>
          {passwordFeedback ? <p className="text-sm text-muted">{passwordFeedback}</p> : null}
        </form>
      </section>

      <section className="surface border-red-200 p-5">
        <h2 className="text-lg font-semibold text-red-700">Danger Zone</h2>
        <p className="mt-2 text-sm text-muted">
          Delete account permanently. This action cannot be undone.
        </p>

        <form onSubmit={handleDeleteAccount} className="mt-3 space-y-3">
          <input
            className="input"
            value={deleteConfirmText}
            onChange={(event) => setDeleteConfirmText(event.target.value)}
            placeholder='Type "DELETE" to confirm'
            required
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={deletePending}
          >
            {deletePending ? 'Deleting...' : 'Delete account'}
          </button>
          {deleteFeedback ? <p className="text-sm text-muted">{deleteFeedback}</p> : null}
        </form>
      </section>
    </div>
  )
}

