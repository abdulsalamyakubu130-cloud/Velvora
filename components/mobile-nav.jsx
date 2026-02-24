import { Link, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { useI18n } from '@/src/context/i18n-context'

const links = [
  { href: '/', key: 'mobile.home' },
  { href: '/explore', key: 'mobile.explore' },
  { href: '/categories', key: 'left.categories' },
  { href: '/following', key: 'left.following' },
  { href: '/saved', key: 'left.saved' },
  { href: '/notifications', key: 'mobile.alerts' },
  { href: '/sell', key: 'mobile.post' },
  { href: '/messages', key: 'mobile.chat' },
  { href: '/settings', key: 'left.settings' },
]

export default function MobileNav() {
  const { pathname } = useLocation()
  const { t } = useI18n()

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 lg:hidden"
    >
      <div className="mx-auto max-w-2xl overflow-x-auto rounded-2xl border border-line bg-white/95 p-2 shadow-soft backdrop-blur">
        <div className="flex min-w-max gap-2">
          {links.map((link) => {
            const active = pathname === link.href
            return (
              <Link
                key={link.href}
                to={link.href}
                className={clsx(
                  'min-w-[88px] rounded-xl px-2 py-2 text-center text-xs font-semibold transition',
                  active ? 'bg-accent text-white' : 'text-muted hover:bg-accentSoft hover:text-accentStrong',
                )}
              >
                {t(link.key)}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
