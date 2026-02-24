const disposableDomains = new Set([
  '10minutemail.com',
  '10minutemail.net',
  '20minutemail.com',
  'dispostable.com',
  'fakeinbox.com',
  'getairmail.com',
  'guerrillamail.com',
  'maildrop.cc',
  'mailinator.com',
  'mintemail.com',
  'sharklasers.com',
  'tempmail.com',
  'tempmail.dev',
  'temp-mail.org',
  'trashmail.com',
  'yopmail.com',
])

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function getEmailDomain(email) {
  const normalized = normalizeEmail(email)
  const parts = normalized.split('@')
  if (parts.length !== 2) return ''
  return parts[1]
}

export function validateEmailForAuth(email) {
  const normalized = normalizeEmail(email)
  const domain = getEmailDomain(normalized)
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

  if (!emailPattern.test(normalized)) {
    return {
      allowed: false,
      normalizedEmail: normalized,
      reason: 'invalid_format',
      message: 'Please use a valid email address.',
    }
  }

  if (disposableDomains.has(domain)) {
    return {
      allowed: false,
      normalizedEmail: normalized,
      reason: 'banned_domain',
      message:
        'Temporary or disposable emails are not allowed. This email domain is banned on Velvora.',
    }
  }

  return {
    allowed: true,
    normalizedEmail: normalized,
    reason: null,
    message: '',
  }
}
