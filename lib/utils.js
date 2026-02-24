const currencyByLocation = [
  { includes: ['ghana', 'accra'], currency: 'GHS', locale: 'en-GH' },
  { includes: ['nigeria', 'lagos', 'abuja'], currency: 'NGN', locale: 'en-NG' },
  { includes: ['kenya', 'nairobi', 'mombasa'], currency: 'KES', locale: 'en-KE' },
  { includes: ['south africa', 'johannesburg', 'cape town'], currency: 'ZAR', locale: 'en-ZA' },
  { includes: ['united kingdom', 'uk', 'london', 'manchester'], currency: 'GBP', locale: 'en-GB' },
  { includes: ['united states', 'usa', 'new york', 'los angeles'], currency: 'USD', locale: 'en-US' },
]

const currencyConfigFallback = { currency: 'NGN', locale: 'en-NG' }

// Approximate conversion table (USD value of one unit of currency).
const usdPerCurrencyUnit = {
  USD: 1,
  GBP: 1.27,
  EUR: 1.08,
  NGN: 1 / 1600,
  GHS: 1 / 15.5,
  KES: 1 / 129,
  ZAR: 1 / 18.8,
}

const localeRegionToCountry = {
  NG: 'Nigeria',
  GH: 'Ghana',
  KE: 'Kenya',
  ZA: 'South Africa',
  GB: 'United Kingdom',
  US: 'United States',
}

const phonePrefixToCountry = [
  { prefix: '+234', country: 'Nigeria' },
  { prefix: '+233', country: 'Ghana' },
  { prefix: '+254', country: 'Kenya' },
  { prefix: '+27', country: 'South Africa' },
  { prefix: '+44', country: 'United Kingdom' },
  { prefix: '+1', country: 'United States' },
]

const timeZoneHints = [
  { includes: ['lagos'], country: 'Nigeria' },
  { includes: ['accra'], country: 'Ghana' },
  { includes: ['nairobi'], country: 'Kenya' },
  { includes: ['johannesburg'], country: 'South Africa' },
  { includes: ['london'], country: 'United Kingdom' },
  { includes: ['new_york', 'chicago', 'los_angeles'], country: 'United States' },
]

function getCurrencyConfig(locationOrCountry) {
  const normalized = String(locationOrCountry ?? '').toLowerCase()
  const matched = currencyByLocation.find((item) => item.includes.some((needle) => normalized.includes(needle)))
  return matched ?? currencyConfigFallback
}

function getCountryFromPhone(phone) {
  const normalized = String(phone ?? '').trim()
  const matched = phonePrefixToCountry.find((item) => normalized.startsWith(item.prefix))
  return matched?.country || ''
}

function getCountryFromBrowser() {
  if (typeof window === 'undefined') return ''

  const locale = window.navigator?.language || ''
  const region = locale.split('-')[1]?.toUpperCase()
  if (region && localeRegionToCountry[region]) {
    return localeRegionToCountry[region]
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  const normalizedTimeZone = timeZone.toLowerCase()
  const matched = timeZoneHints.find((item) =>
    item.includes.some((needle) => normalizedTimeZone.includes(needle)),
  )

  return matched?.country || ''
}

function toSafeAmount(value) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : 0
}

function convertCurrencyAmount(value, sourceCurrency, targetCurrency) {
  if (sourceCurrency === targetCurrency) return value

  const sourceRate = usdPerCurrencyUnit[sourceCurrency]
  const targetRate = usdPerCurrencyUnit[targetCurrency]
  if (!sourceRate || !targetRate) return value

  const usdAmount = value * sourceRate
  return usdAmount / targetRate
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeProfileHandle(value) {
  return String(value || '').trim().replace(/^@+/, '')
}

export function normalizeVerificationTier(verificationTier, isVerified = false) {
  const normalizedTier = String(verificationTier || '').trim().toLowerCase()
  if (normalizedTier === 'enhanced' || normalizedTier === 'basic') return normalizedTier
  return isVerified ? 'basic' : 'none'
}

export function maxVerificationTier(firstTier = 'none', secondTier = 'none') {
  const rank = { none: 0, basic: 1, enhanced: 2 }
  const first = normalizeVerificationTier(firstTier, false)
  const second = normalizeVerificationTier(secondTier, false)
  return rank[first] >= rank[second] ? first : second
}

export function buildProfilePath(target) {
  const id = String(target?.id || '').trim()
  if (uuidPattern.test(id)) {
    return `/profile/${encodeURIComponent(id)}`
  }

  const username = normalizeProfileHandle(target?.username ?? target)
  if (username) {
    return `/profile/${encodeURIComponent(username)}`
  }

  return '/profile'
}

export function resolveViewerLocation(user) {
  const metadata = user?.user_metadata || {}
  const explicitLocation = metadata.country || metadata.location || user?.country || ''
  const normalizedExplicit = String(explicitLocation || '').trim().toLowerCase()
  const hasExplicitCountry = Boolean(normalizedExplicit) && normalizedExplicit !== 'not set'

  // Email-first signup stores phone in metadata, so check both places.
  const phoneCountry = getCountryFromPhone(user?.phone || metadata.phone || metadata.phone_number)
  if (phoneCountry) return phoneCountry

  if (hasExplicitCountry) return explicitLocation

  const browserCountry = getCountryFromBrowser()
  if (browserCountry) return browserCountry

  return 'Nigeria'
}

export function getCurrencyCode(locationOrCountry = '') {
  return getCurrencyConfig(locationOrCountry).currency
}

export function convertToViewerCurrency(value, viewerLocationOrCountry = '', itemLocationOrCountry = '') {
  const safeAmount = toSafeAmount(value)
  const sourceCurrency = getCurrencyConfig(itemLocationOrCountry).currency
  const targetCurrency = getCurrencyConfig(viewerLocationOrCountry).currency
  return convertCurrencyAmount(safeAmount, sourceCurrency, targetCurrency)
}

export function formatMoneyForViewer(value, viewerLocationOrCountry = '', itemLocationOrCountry = '') {
  const safeAmount = convertToViewerCurrency(value, viewerLocationOrCountry, itemLocationOrCountry)
  const { locale, currency } = getCurrencyConfig(viewerLocationOrCountry)

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(safeAmount)
}

export function formatMoney(value, locationOrCountry = '') {
  return formatMoneyForViewer(value, locationOrCountry, locationOrCountry)
}

export function timeAgo(value) {
  const now = new Date()
  const date = new Date(value)
  const diffMs = now.getTime() - date.getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diffMs < hour) return `${Math.max(1, Math.floor(diffMs / minute))}m ago`
  if (diffMs < day) return `${Math.max(1, Math.floor(diffMs / hour))}h ago`
  return `${Math.max(1, Math.floor(diffMs / day))}d ago`
}
