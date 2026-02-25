import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { buildProfilePath } from '@/lib/utils'
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { runWithMissingColumnFallback } from '@/lib/supabase/query-compat'
import { getProfilePictureValue, resolveProfilePictureUrl } from '@/lib/utils/media-url'
import { useAuth } from '@/src/context/auth-context'
import { useI18n } from '@/src/context/i18n-context'
import { useTheme } from '@/src/context/theme-context'

const navLinks = [
  { href: '/explore', key: 'topbar.nav.explore' },
  { href: '/notifications', key: 'topbar.nav.notifications' },
  { href: '/messages', key: 'topbar.nav.messages' },
]

export default function TopBar({ unreadMessageCount = 0 }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { pathname } = location
  const { isAuthenticated, isLoading, user, signOut } = useAuth()
  const { t, language, setLanguage, availableLanguages } = useI18n()
  const { isDark, toggleTheme } = useTheme()
  const [localProfilePicture, setLocalProfilePicture] = useState('')
  const [remoteProfilePicture, setRemoteProfilePicture] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const presenceChannelRef = useRef(null)
  const showBack = pathname !== '/'
  const profileHref = buildProfilePath({
    id: user?.id,
    username:
      user?.user_metadata?.username ||
      user?.email?.split('@')[0] ||
      user?.phone?.replace(/[^\d]/g, '') ||
      'profile',
  })
  const profileAvatar = resolveProfilePictureUrl(
    localProfilePicture ||
      remoteProfilePicture ||
      user?.user_metadata?.profile_picture_url ||
      user?.user_metadata?.avatar_url ||
      '',
  )

  useEffect(() => {
    if (!user?.id) {
      setLocalProfilePicture('')
      setRemoteProfilePicture('')
      return
    }

    try {
      const key = `velvora:local-profile-picture:${user.id}`
      const localPicture = window.localStorage.getItem(key) || ''
      setLocalProfilePicture(localPicture)
    } catch {
      setLocalProfilePicture('')
    }
  }, [user?.id])

  useEffect(() => {
    let cancelled = false

    async function loadRemoteProfilePicture() {
      if (!isSupabaseConfigured || !user?.id) {
        if (!cancelled) setRemoteProfilePicture('')
        return
      }

      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        if (!cancelled) setRemoteProfilePicture('')
        return
      }

      const { data } = await runWithMissingColumnFallback(
        () =>
          supabase
            .from('users')
            .select('id, profile_picture_url, avatar_url')
            .eq('id', user.id)
            .maybeSingle(),
        () =>
          supabase
            .from('users')
            .select('id, avatar_url')
            .eq('id', user.id)
            .maybeSingle(),
      )

      if (cancelled) return
      setRemoteProfilePicture(getProfilePictureValue(data))
    }

    loadRemoteProfilePicture()
    return () => {
      cancelled = true
    }
  }, [user?.id, user?.user_metadata?.profile_picture_url, user?.user_metadata?.avatar_url])

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    setSearchQuery(searchParams.get('q') || '')
  }, [location.search])

  useEffect(() => {
    if (!isSupabaseConfigured || !user?.id) return undefined

    const supabase = getSupabaseBrowserClient()
    if (!supabase) return undefined

    const presenceKey = String(user.id)
    const channel = supabase
      .channel('online-users', { config: { presence: { key: presenceKey } } })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.track({ user_id: presenceKey, online_at: new Date().toISOString() })
        }
      })

    presenceChannelRef.current = channel

    return () => {
      presenceChannelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [user?.id])

  function handleBack() {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }

    navigate('/')
  }

  function handleRefresh() {
    window.location.reload()
  }

  async function handleSearchSubmit(event) {
    event.preventDefault()
    const query = searchQuery.trim()
    const normalizedQuery = query.replace(/^@+/, '')
    const escapedQuery = normalizedQuery.replace(/[%_]/g, '').trim()
    const canBeUsername = /^[a-zA-Z0-9._-]{3,30}$/.test(normalizedQuery)

    if (escapedQuery && isSupabaseConfigured) {
      const supabase = getSupabaseBrowserClient()
      if (supabase) {
        const { data: exactUsernameUser } = await supabase
          .from('users')
          .select('username')
          .eq('username', normalizedQuery)
          .maybeSingle()
        if (exactUsernameUser?.username) {
          navigate(`/profile/${encodeURIComponent(exactUsernameUser.username)}`)
          return
        }

        if (canBeUsername) {
          const { data: similarUsers } = await supabase
            .from('users')
            .select('username')
            .ilike('username', `%${escapedQuery}%`)
            .limit(2)

          if ((similarUsers || []).length === 1) {
            navigate(`/profile/${encodeURIComponent(similarUsers[0].username)}`)
            return
          }
        }

        const { data: fullNameUsers } = await supabase
          .from('users')
          .select('username')
          .ilike('full_name', `%${escapedQuery}%`)
          .limit(2)

        if ((fullNameUsers || []).length === 1) {
          navigate(`/profile/${encodeURIComponent(fullNameUsers[0].username)}`)
          return
        }
      }
    }

    const searchParams = new URLSearchParams()
    if (query) {
      searchParams.set('q', query)
    }
    const suffix = searchParams.toString()
    navigate(suffix ? `/explore?${suffix}` : '/explore')
  }

  async function handleSignOut() {
    await signOut()
    navigate('/auth')
  }

  function isNavActive(href) {
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-2 px-3 md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          {showBack ? (
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-ink transition hover:border-accent hover:text-accent"
              aria-label={t('topbar.back')}
            >
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
                <path d="M12.5 4.5L7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M7.5 10h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-ink transition hover:border-accent hover:text-accent"
            aria-label="Refresh page"
            title="Refresh"
          >
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
              <path
                d="M16 10a6 6 0 1 1-1.3-3.8"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M16 4.5v3.8h-3.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-2.5 py-1.5"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
              V
            </span>
            <span className="hidden font-brand text-lg font-semibold tracking-tight text-ink sm:inline">Velvora</span>
          </Link>
        </div>

        <div className="hidden min-w-0 flex-1 items-center gap-2 md:flex">
          <form onSubmit={handleSearchSubmit} className="flex max-w-md flex-1 items-center gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-3 inline-flex items-center text-muted">
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
                  <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M13 13l3.6 3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </span>
              <input
                className="input pl-8"
                placeholder={t('topbar.search_placeholder')}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                aria-label={t('topbar.search_placeholder')}
              />
            </div>
            <button type="submit" className="btn-muted h-10 px-3 text-xs">
              Enter
            </button>
          </form>
          <nav className="hidden items-center gap-1 rounded-full border border-line bg-white p-1 lg:flex">
            {navLinks.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={clsx(
                  'relative rounded-full px-3 py-1.5 text-xs font-semibold transition',
                  isNavActive(item.href)
                    ? 'bg-accent text-white'
                    : 'text-muted hover:bg-accentSoft hover:text-accentStrong',
                )}
              >
                {t(item.key)}
                {item.href === '/messages' && unreadMessageCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-[#d93025] px-1 text-[10px] font-bold leading-4 text-white">
                    {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-ink transition hover:border-accent hover:text-accent"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? (
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
                <circle cx="10" cy="10" r="3.1" stroke="currentColor" strokeWidth="1.6" />
                <path d="M10 2.8v2.2M10 15v2.2M2.8 10H5M15 10h2.2M4.8 4.8l1.6 1.6M13.6 13.6l1.6 1.6M15.2 4.8l-1.6 1.6M6.4 13.6l-1.6 1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
                <path
                  d="M14.6 12.8a6.1 6.1 0 0 1-7.4-7.4 6.5 6.5 0 1 0 7.4 7.4z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
          <label className="sr-only" htmlFor="language-select">
            {t('language.label')}
          </label>
          <select
            id="language-select"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            className="hidden h-9 rounded-full border border-line bg-white px-2.5 text-xs font-semibold text-ink outline-none sm:block"
          >
            {availableLanguages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
          <Link to="/sell" className="btn-muted hidden md:inline-flex">
            {t('topbar.create_post')}
          </Link>
          {isLoading ? (
            <span className="text-xs text-muted">{t('topbar.loading')}</span>
          ) : isAuthenticated ? (
            <>
              <button type="button" onClick={handleSignOut} className="btn-muted h-9 px-3 text-xs sm:hidden">
                Logout
              </button>
              <Link to="/settings" className="btn-muted hidden sm:inline-flex">
                {t('topbar.settings')}
              </Link>
              <button type="button" onClick={handleSignOut} className="btn-muted hidden sm:inline-flex">
                {t('topbar.sign_out')}
              </button>
              <Link
                to={profileHref}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-2 py-1.5"
              >
                <img
                  src={profileAvatar}
                  alt={t('topbar.profile')}
                  className="h-7 w-7 rounded-full object-cover"
                  onError={(event) => {
                    event.currentTarget.src = '/placeholders/avatar-anya.svg'
                  }}
                />
                <span className="hidden text-xs font-semibold text-ink lg:inline">{t('topbar.profile')}</span>
              </Link>
            </>
          ) : (
            <Link to="/auth" className="btn-primary shrink-0 px-3 sm:px-4">
              <span className="text-xs sm:hidden">Sign up</span>
              <span className="hidden sm:inline">{t('topbar.login_signup')}</span>
            </Link>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-3 pb-3 md:hidden">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-3 inline-flex items-center text-muted">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
                <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
                <path d="M13 13l3.6 3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </span>
            <input
              className="input pl-8 text-base"
              placeholder={t('topbar.search_placeholder')}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              aria-label={t('topbar.search_placeholder')}
              inputMode="search"
              style={{ fontSize: '16px' }}
            />
          </div>
          <button type="submit" className="btn-muted h-10 px-3 text-xs">
            Enter
          </button>
        </form>
      </div>
    </header>
  )
}
