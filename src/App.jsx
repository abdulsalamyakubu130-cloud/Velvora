import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom'
import TopBar from '@/components/top-bar'
import MobileNav from '@/components/mobile-nav'
import RequireAuth from '@/components/require-auth'
import RequireAdmin from '@/components/require-admin'
import { AuthProvider, useAuth } from '@/src/context/auth-context'
import { I18nProvider, useI18n } from '@/src/context/i18n-context'
import { ThemeProvider } from '@/src/context/theme-context'
import { useUnreadMessageCount } from '@/src/hooks/use-unread-message-count'
import { ADMIN_BASE_PATH, ADMIN_SIGNIN_PATH, ADMIN_SIGNOUT_PATH, isAdminPath } from '@/lib/admin/config'

const HomePage = lazy(() => import('@/src/pages/home'))
const ExplorePage = lazy(() => import('@/src/pages/explore'))
const FollowingPage = lazy(() => import('@/src/pages/following'))
const SavedPage = lazy(() => import('@/src/pages/saved'))
const CategoriesPage = lazy(() => import('@/src/pages/categories'))
const SellPage = lazy(() => import('@/src/pages/sell'))
const MessagesPage = lazy(() => import('@/src/pages/messages'))
const NotificationsPage = lazy(() => import('@/src/pages/notifications'))
const SafetyPage = lazy(() => import('@/src/pages/safety'))
const GuidelinesPage = lazy(() => import('@/src/pages/guidelines'))
const MonetizationPage = lazy(() => import('@/src/pages/monetization'))
const AuthPage = lazy(() => import('@/src/pages/auth'))
const ModerationPage = lazy(() => import('@/src/pages/admin/moderation'))
const AdminSignInPage = lazy(() => import('@/src/pages/admin/signin'))
const AdminSignOutPage = lazy(() => import('@/src/pages/admin/signout'))
const ProfilePage = lazy(() => import('@/src/pages/profile'))
const SettingsPage = lazy(() => import('@/src/pages/settings'))

function NotFoundPage() {
  const { t } = useI18n()

  return (
    <section className="surface mx-auto w-full max-w-xl p-6 text-center">
      <h1 className="font-brand text-2xl font-semibold">{t('app.not_found.title')}</h1>
      <p className="mt-2 text-sm text-muted">{t('app.not_found.subtitle')}</p>
      <Link to="/" className="btn-primary mt-4">
        {t('app.not_found.back')}
      </Link>
    </section>
  )
}

function AdminTopBar() {
  const { user } = useAuth()
  const profileName = user?.user_metadata?.username || user?.email || 'Admin'

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-3 md:px-6">
        <div className="flex items-center gap-2">
          <Link to="/" className="btn-muted">
            Back to site
          </Link>
          <div>
            <p className="font-brand text-lg font-semibold text-ink">Admin Console</p>
            <p className="text-xs text-muted">{profileName}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link to={ADMIN_BASE_PATH} className="btn-muted">
            Dashboard
          </Link>
          <Link to={ADMIN_SIGNOUT_PATH} className="btn-muted">
            Sign out
          </Link>
        </div>
      </div>
    </header>
  )
}

function RouteFallback() {
  return <p className="text-sm text-muted">Loading...</p>
}

function InitialPreloader() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-canvas">
      <div className="flex flex-col items-center gap-4">
        <div className="relative inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-line bg-panel p-2 shadow-soft">
          <img src="/favicon.svg" alt="Velvora logo" className="h-full w-full object-contain" />
          <div className="pointer-events-none absolute inset-0 animate-spin rounded-2xl border-2 border-transparent border-t-accent/80" />
        </div>
        <p className="text-sm font-semibold text-ink">Velvora</p>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-accentSoft">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-accent" />
        </div>
        <p className="text-xs font-semibold text-muted">Buy. Sell. Connect.</p>
      </div>
    </div>
  )
}

function AppLayout() {
  const { pathname } = useLocation()
  const isAdminArea = isAdminPath(pathname)
  const [showPreloader, setShowPreloader] = useState(true)
  const unreadMessageCount = useUnreadMessageCount({ enabled: !isAdminArea })

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setShowPreloader(false)
    }, 1100)
    return () => window.clearTimeout(timeoutId)
  }, [])

  if (showPreloader) {
    return <InitialPreloader />
  }

  return (
    <>
      <div className="ambient-bg" aria-hidden="true" />
      {isAdminArea ? <AdminTopBar /> : <TopBar unreadMessageCount={unreadMessageCount} />}
      <main
        className={
          isAdminArea
            ? 'mx-auto w-full max-w-6xl px-3 pb-10 pt-6 md:px-6'
            : 'mx-auto w-full max-w-7xl px-3 pb-24 pt-6 md:px-6 md:pb-10'
        }
      >
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route
              path="/following"
              element={
                <RequireAuth>
                  <FollowingPage />
                </RequireAuth>
              }
            />
            <Route
              path="/saved"
              element={
                <RequireAuth>
                  <SavedPage />
                </RequireAuth>
              }
            />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route
              path="/sell"
              element={
                <RequireAuth>
                  <SellPage />
                </RequireAuth>
              }
            />
            <Route
              path="/messages"
              element={
                <RequireAuth>
                  <MessagesPage />
                </RequireAuth>
              }
            />
            <Route
              path="/notifications"
              element={
                <RequireAuth>
                  <NotificationsPage />
                </RequireAuth>
              }
            />
            <Route path="/safety" element={<SafetyPage />} />
            <Route path="/guidelines" element={<GuidelinesPage />} />
            <Route path="/monetization" element={<MonetizationPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path={ADMIN_SIGNIN_PATH} element={<AdminSignInPage />} />
            <Route path={ADMIN_SIGNOUT_PATH} element={<AdminSignOutPage />} />
            <Route
              path={ADMIN_BASE_PATH}
              element={
                <RequireAdmin>
                  <ModerationPage />
                </RequireAdmin>
              }
            />
            <Route
              path={`${ADMIN_BASE_PATH}/moderation`}
              element={
                <RequireAdmin>
                  <ModerationPage />
                </RequireAdmin>
              }
            />
            <Route
              path="/profile/:username"
              element={<ProfilePage />}
            />
            <Route
              path="/settings"
              element={
                <RequireAuth>
                  <SettingsPage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
      {!isAdminArea ? <MobileNav unreadMessageCount={unreadMessageCount} /> : null}
    </>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppLayout />
          </BrowserRouter>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}



