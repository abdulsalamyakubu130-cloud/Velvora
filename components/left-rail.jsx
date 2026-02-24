import { Link, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { buildProfilePath } from '@/lib/utils'
import { useAuth } from '@/src/context/auth-context'
import { useI18n } from '@/src/context/i18n-context'

const baseNavItems = [
  { href: '/', key: 'left.feed' },
  { href: '/explore', key: 'left.explore' },
  { href: '/following', key: 'left.following' },
  { href: '/saved', key: 'left.saved' },
  { href: '/categories', key: 'left.categories' },
  { href: '/sell', key: 'left.create_post' },
  { href: '/messages', key: 'left.messages' },
  { href: '/notifications', key: 'left.notifications' },
  { href: '/safety', key: 'left.trust_safety' },
  { href: '/monetization', key: 'left.monetization' },
  { href: '/settings', key: 'left.settings' },
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
  const navItems = [...baseNavItems, { href: profileHref, key: 'left.my_profile' }]

  return (
    <aside className="surface hidden h-fit animate-rise p-4 lg:block">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{t('left.navigation')}</h2>
      <nav className="space-y-1">
        {navItems.map((item) => {
          const isProfileLink = item.key === 'left.my_profile'
          const isActive = isProfileLink ? pathname.startsWith('/profile/') : pathname === item.href
          return (
            <Link
              key={item.href}
              to={item.href}
              className={clsx(
                'block rounded-xl px-3 py-2 text-sm font-semibold transition',
                isActive
                  ? 'bg-accent text-white'
                  : 'text-muted hover:bg-accentSoft hover:text-accentStrong',
              )}
            >
              {t(item.key)}
            </Link>
          )
        })}
      </nav>

      <div className="mt-5 rounded-xl border border-line bg-accentSoft p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-accentStrong">{t('left.categories_title')}</p>
        <p className="mt-1 text-sm text-muted">{t('left.categories_value')}</p>
      </div>
    </aside>
  )
}
