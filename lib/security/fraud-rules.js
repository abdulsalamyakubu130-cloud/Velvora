function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '')
}

export function assessSignupFraud({ email, phone, password, username }) {
  const normalizedEmail = normalizeText(email)
  const normalizedUsername = normalizeText(username)
  const emailLocal = normalizedEmail.split('@')[0] || ''
  const phoneDigits = digitsOnly(phone)
  const reasons = []

  if (/^(test|fake|bot|admin|support|temp|demo)[0-9._-]*$/.test(emailLocal)) {
    reasons.push('email_alias_pattern')
  }

  if (/^[0-9]{7,}$/.test(emailLocal)) {
    reasons.push('email_local_numeric')
  }

  if (/(.)\1{5,}/.test(normalizedUsername) || /(.)\1{5,}/.test(emailLocal)) {
    reasons.push('repeating_characters')
  }

  if (/^(\d)\1{7,}$/.test(phoneDigits)) {
    reasons.push('repeating_phone_digits')
  }

  if (emailLocal && password && password.toLowerCase().includes(emailLocal)) {
    reasons.push('password_contains_email')
  }

  if (phoneDigits && password && password.includes(phoneDigits.slice(-6))) {
    reasons.push('password_contains_phone')
  }

  const blockedReasons = new Set([
    'email_alias_pattern',
    'email_local_numeric',
    'repeating_characters',
    'repeating_phone_digits',
  ])

  const blocked = reasons.some((reason) => blockedReasons.has(reason))

  if (!blocked) {
    return { blocked: false, reasons: [], message: '' }
  }

  return {
    blocked: true,
    reasons,
    message: 'Signup blocked by anti-fraud checks. Use your real email, phone number, and identity details.',
  }
}
