import { Link, useLocation } from 'react-router-dom'
import clsx from 'clsx'
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

function AlertsIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path d="M10 3.8a3.3 3.3 0 0 0-3.3 3.3v1.2c0 .8-.2 1.5-.7 2.1l-1.4 1.9h10.8L14 10.4c-.5-.6-.7-1.3-.7-2.1V7.1A3.3 3.3 0 0 0 10 3.8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 14.8a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

function SettingsIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 3.6v1.5M10 14.9v1.5M3.6 10h1.5M14.9 10h1.5M5.5 5.5l1.1 1.1M13.4 13.4l1.1 1.1M14.5 5.5l-1.1 1.1M6.6 13.4l-1.1 1.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

const links = [
  { href: '/', key: 'mobile.home', icon: HomeIcon },
  { href: '/explore', key: 'mobile.explore', icon: ExploreIcon },
  { href: '/categories', key: 'left.categories', icon: CategoriesIcon },
  { href: '/following', key: 'left.following', icon: FollowingIcon },
  { href: '/saved', key: 'left.saved', icon: SavedIcon },
  { href: '/notifications', key: 'mobile.alerts', icon: AlertsIcon },
  { href: '/sell', key: 'mobile.post', icon: PostIcon },
  { href: '/messages', key: 'mobile.chat', icon: ChatIcon },
  { href: '/settings', key: 'left.settings', icon: SettingsIcon },
]

export default function MobileNav({ unreadMessageCount = 0 }) {
  const { pathname } = useLocation()
  const { t } = useI18n()

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-50 px-2 pb-[calc(env(safe-area-inset-bottom)+0.45rem)] pt-1.5 lg:hidden"
    >
      <div className="mx-auto max-w-3xl rounded-2xl border border-line/90 bg-white/95 p-1.5 shadow-[0_14px_30px_-22px_rgba(8,56,28,0.65)] backdrop-blur-xl">
        <div className="flex gap-1 overflow-x-auto px-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {links.map((link) => {
            const active = pathname === link.href
            const Icon = link.icon
            const showUnreadBadge = link.href === '/messages' && unreadMessageCount > 0 && !active

            return (
              <Link
                key={link.href}
                to={link.href}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'group relative flex min-h-[54px] min-w-[74px] shrink-0 flex-col items-center justify-center rounded-xl px-2 py-1 text-center transition',
                  active
                    ? 'bg-accentSoft text-accentStrong'
                    : 'text-muted hover:bg-accentSoft/80 hover:text-accentStrong',
                )}
              >
                <span
                  className={clsx(
                    'inline-flex h-6 w-6 items-center justify-center rounded-full transition',
                    active
                      ? 'bg-accent text-white'
                      : 'bg-accentSoft/70 text-accentStrong group-hover:bg-white group-hover:text-accent',
                  )}
                >
                  <Icon className="h-[15px] w-[15px]" />
                </span>
                <span className="mt-1 w-full truncate text-[10px] font-semibold leading-4">{t(link.key)}</span>

                {active ? (
                  <span className="absolute bottom-0.5 h-0.5 w-6 rounded-full bg-accent" aria-hidden="true" />
                ) : null}

                {showUnreadBadge ? (
                  <span className="absolute right-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-[#d93025] px-1 text-[10px] font-bold leading-4 text-white">
                    {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                  </span>
                ) : null}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
