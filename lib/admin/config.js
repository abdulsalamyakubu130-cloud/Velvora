export const ADMIN_BASE_PATH = (() => {
  const raw = String(import.meta.env.VITE_ADMIN_PATH || '/control-room').trim()
  if (!raw) return '/control-room'
  const normalized = raw.startsWith('/') ? raw : `/${raw}`
  if (normalized !== '/' && normalized.endsWith('/')) return normalized.slice(0, -1)
  return normalized
})()

export const ADMIN_SIGNIN_PATH = `${ADMIN_BASE_PATH}/signin`
export const ADMIN_SIGNOUT_PATH = `${ADMIN_BASE_PATH}/signout`
export const ADMIN_PANEL_PASSWORD = String(import.meta.env.VITE_ADMIN_PANEL_PASSWORD || 'enemzysmart2244')
export const ADMIN_PANEL_SESSION_KEY = 'velvora:control-room:panel-password'

export function normalizeEmails(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

export function hasAdminRole(user) {
  const roleCandidates = [user?.app_metadata?.role, user?.user_metadata?.role, user?.role]
  return roleCandidates.includes('admin')
}

export function hasAllowlistedEmail(user) {
  const allowlist = normalizeEmails(import.meta.env.VITE_ADMIN_EMAILS)
  const email = String(user?.email || '').toLowerCase().trim()
  if (!email) return false

  const [emailLocalPart = ''] = email.split('@')

  return allowlist.some((entry) => {
    if (!entry) return false
    if (entry === email) return true

    // Tolerant mode for common .env mistakes where only local-part is provided.
    if (!entry.includes('@')) {
      if (entry === emailLocalPart) return true

      // Accept values like "username.com" by matching the left side.
      const inferredLocalPart = entry.split('.')[0]
      if (inferredLocalPart && inferredLocalPart === emailLocalPart) return true
    }

    return false
  })
}

export function isAdminUser(user) {
  return hasAdminRole(user) || hasAllowlistedEmail(user)
}

export function isAdminPath(pathname) {
  return pathname === ADMIN_BASE_PATH || pathname.startsWith(`${ADMIN_BASE_PATH}/`)
}
