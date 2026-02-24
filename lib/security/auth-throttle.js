const STORAGE_KEY = 'velvora:auth-throttle'

const throttleConfig = {
  signin: { windowMs: 10 * 60 * 1000, maxAttempts: 6, blockMs: 15 * 60 * 1000 },
  signup: { windowMs: 30 * 60 * 1000, maxAttempts: 3, blockMs: 45 * 60 * 1000 },
  verify: { windowMs: 15 * 60 * 1000, maxAttempts: 8, blockMs: 30 * 60 * 1000 },
  resend: { windowMs: 10 * 60 * 1000, maxAttempts: 4, blockMs: 30 * 60 * 1000 },
}

function getNow() {
  return Date.now()
}

function loadStore() {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveStore(store) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Ignore storage failures.
  }
}

function getEntry(store, action) {
  const current = store[action]
  if (!current) return { attempts: [], blockedUntil: 0 }
  return {
    attempts: Array.isArray(current.attempts) ? current.attempts : [],
    blockedUntil: Number(current.blockedUntil) || 0,
  }
}

function normalizeAttempts(entry, action) {
  const now = getNow()
  const config = throttleConfig[action]
  const validAttempts = entry.attempts.filter((timestamp) => now - timestamp <= config.windowMs)
  return { attempts: validAttempts, blockedUntil: entry.blockedUntil }
}

export function getThrottleState(action) {
  const config = throttleConfig[action]
  if (!config) return { allowed: true, retryAfterMs: 0, remaining: Infinity }

  const now = getNow()
  const store = loadStore()
  const currentEntry = normalizeAttempts(getEntry(store, action), action)

  if (currentEntry.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterMs: currentEntry.blockedUntil - now,
      remaining: 0,
    }
  }

  if (currentEntry.attempts.length >= config.maxAttempts) {
    return {
      allowed: false,
      retryAfterMs: config.blockMs,
      remaining: 0,
    }
  }

  return {
    allowed: true,
    retryAfterMs: 0,
    remaining: Math.max(0, config.maxAttempts - currentEntry.attempts.length),
  }
}

export function recordAuthAttempt(action, success) {
  const config = throttleConfig[action]
  if (!config) return

  const now = getNow()
  const store = loadStore()
  const currentEntry = normalizeAttempts(getEntry(store, action), action)

  if (success) {
    store[action] = { attempts: [], blockedUntil: 0 }
    saveStore(store)
    return
  }

  const attempts = [...currentEntry.attempts, now]
  const shouldBlock = attempts.length >= config.maxAttempts

  store[action] = {
    attempts,
    blockedUntil: shouldBlock ? now + config.blockMs : 0,
  }
  saveStore(store)
}

export function formatRetryTime(retryAfterMs) {
  const totalSeconds = Math.ceil(retryAfterMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes <= 0) return `${seconds}s`
  if (seconds === 0) return `${minutes}m`
  return `${minutes}m ${seconds}s`
}
