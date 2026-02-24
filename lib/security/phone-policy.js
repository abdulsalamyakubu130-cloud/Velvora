function normalizePhone(rawPhone) {
  return String(rawPhone || '').trim().replace(/\s+/g, '')
}

export function validatePhoneForAuth(rawPhone) {
  const normalizedPhone = normalizePhone(rawPhone)
  const e164Pattern = /^\+[1-9]\d{7,14}$/

  if (!e164Pattern.test(normalizedPhone)) {
    return {
      allowed: false,
      normalizedPhone,
      message:
        'Use a valid active phone number in international format, for example +233501234567.',
    }
  }

  return {
    allowed: true,
    normalizedPhone,
    message: '',
  }
}
