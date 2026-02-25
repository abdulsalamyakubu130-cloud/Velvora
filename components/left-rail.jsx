import { Link, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { buildProfilePath } from '@/lib/utils'
import { useAuth } from '@/src/context/auth-context'
import { useI18n } from '@/src/context/i18n-context'

function HomeIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path d="M3.5 8.4L10 3l6.5 5.4v7.1a1 1 0 0 1-1 1h-3.7v-4.1h-3.6v4.1H4.5a1 1 0 0 1-1-1V8.4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function ExploreIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <circle cx="10" cy="10" r="6.8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12.9 7.2L11 11l-3.8 1.9L9 9l3.9-1.8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function FollowingIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <circle cx="7.3" cy="7.2" r="2.3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="13.4" cy="8.2" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.8 15.6c.5-2.1 2.2-3.5 4.4-3.5 2.2 0 3.9 1.4 4.4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12.1 14.8c.4-1.5 1.6-2.5 3.2-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function SavedIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path d="M6 3.5h8a1.3 1.3 0 0 1 1.3 1.3v11l-5.3-3-5.3 3v-11A1.3 1.3 0 0 1 6 3.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function CategoriesIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <rect x="3.3" y="3.3" width="5.7" height="5.7" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="3.3" width="5.7" height="5.7" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3.3" y="11" width="5.7" height="5.7" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="11" width="5.7" height="5.7" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function PostIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <rect x="3.2" y="3.2" width="13.6" height="13.6" rx="2.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6.7v6.6M6.7 10h6.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function ChatIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path d="M4 5.2h12a1.2 1.2 0 0 1 1.2 1.2v6.8a1.2 1.2 0 0 1-1.2 1.2H8.6L5 17.2v-2.8H4a1.2 1.2 0 0 1-1.2-1.2V6.4A1.2 1.2 0 0 1 4 5.2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6.8 8.9h6.4M6.8 11.2h4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function AlertsIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path d="M10 3.8a3.3 3.3 0 0 0-3.3 3.3v1.2c0 .8-.2 1.5-.7 2.1l-1.4 1.9h10.8L14 10.4c-.5-.6-.7-1.3-.7-2.1V7.1A3.3 3.3 0 0 0 10 3.8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 14.8a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function SafetyIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path d="M10 2.8l6.3 2.6v4.8c0 3.4-2.2 6.4-6.3 7-4.1-.6-6.3-3.6-6.3-7V5.4L10 2.8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7.7 10.1l1.5 1.5 3.3-3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MonetizationIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <rect x="3.3" y="5.6" width="13.4" height="9.2" rx="1.8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="10.2" r="2.1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.4 8.1h.1M14.5 12.3h.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function SettingsIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 3.6v1.5M10 14.9v1.5M3.6 10h1.5M14.9 10h1.5M5.5 5.5l1.1 1.1M13.4 13.4l1.1 1.1M14.5 5.5l-1.1 1.1M6.6 13.4l-1.1 1.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ProfileIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <circle cx="10" cy="7.2" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.6 15.6c.6-2.4 2.7-4 5.4-4s4.8 1.6 5.4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

const baseNavItems = [
  { href: '/', key: 'left.feed', icon: HomeIcon },
  { href: '/explore', key: 'left.explore', icon: ExploreIcon },
  { href: '/following', key: 'left.following', icon: FollowingIcon },
  { href: '/saved', key: 'left.saved', icon: SavedIcon },
  { href: '/categories', key: 'left.categories', icon: CategoriesIcon },
  { href: '/sell', key: 'left.create_post', icon: PostIcon, emphasized: true },
  { href: '/messages', key: 'left.messages', icon: ChatIcon },
  { href: '/notifications', key: 'left.notifications', icon: AlertsIcon },
  { href: '/safety', key: 'left.trust_safety', icon: SafetyIcon },
  { href: '/monetization', key: 'left.monetization', icon: MonetizationIcon },
  { href: '/settings', key: 'left.settings', icon: SettingsIcon },
]

export default function LeftRail() {
  const { pathname } = useLocation()
  const { isAuthenticated, user } = useAuth()
  const { t } = useI18n()
  const profileHref = isAuthenticated
    ? buildProfilePath({
        id: user?.id,
        username:
          user?.user_metadata?.username ||
          user?.email?.split('@')[0] ||
          user?.phone?.replace(/[^\d]/g, '') ||
          'profile',
      })
    : '/auth'
  const navItems = [...baseNavItems, { href: profileHref, key: 'left.my_profile', icon: ProfileIcon }]

  return (
    <aside className="surface hidden h-fit animate-rise p-4 lg:block">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{t('left.navigation')}</h2>
      <nav className="space-y-1.5">
        {navItems.map((item) => {
          const isProfileLink = item.key === 'left.my_profile'
          const isActive = isProfileLink ? pathname.startsWith('/profile/') : pathname === item.href
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              to={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={clsx(
                'group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition',
                isActive
                  ? 'bg-accent text-white shadow-soft'
                  : item.emphasized
                    ? 'border border-accent/20 bg-accentSoft/70 text-accentStrong hover:border-accent/35'
                    : 'text-muted hover:bg-accentSoft/70 hover:text-accentStrong',
              )}
            >
              <span
                className={clsx(
                  'inline-flex h-8 w-8 items-center justify-center rounded-full transition',
                  isActive
                    ? 'bg-white/20 text-white'
                    : item.emphasized
                      ? 'bg-white text-accentStrong'
                      : 'bg-white text-accentStrong group-hover:bg-white',
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="truncate">{t(item.key)}</span>
            </Link>
          )
        })}
      </nav>

      <div className="mt-5 rounded-2xl border border-accent/20 bg-gradient-to-br from-accentSoft to-white p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-accentStrong">{t('left.categories_title')}</p>
        <p className="mt-1 text-sm text-muted">{t('left.categories_value')}</p>
      </div>
    </aside>
  )
}
