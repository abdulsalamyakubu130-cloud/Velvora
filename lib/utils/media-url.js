const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
const PROFILE_PICTURE_BUCKET = String(
  import.meta.env.VITE_SUPABASE_PROFILE_PICTURE_BUCKET || import.meta.env.VITE_SUPABASE_AVATAR_BUCKET || 'avatars',
).trim()
const LISTING_BUCKET = String(import.meta.env.VITE_SUPABASE_LISTING_BUCKET || 'listing-images').trim()
const PROFILE_PICTURE_BUCKET_CANDIDATES = Array.from(
  new Set(
    [
      PROFILE_PICTURE_BUCKET,
      'avatars',
      'avatar',
      'profile',
      'profile-avatars',
      'profile-pictures',
      'profile_pictures',
    ].filter(Boolean),
  ),
)
const LISTING_BUCKET_CANDIDATES = Array.from(
  new Set([LISTING_BUCKET, 'listing-images', 'post-images', 'posts', 'images'].filter(Boolean)),
)

function isExternalUrl(value) {
  return /^https?:\/\//i.test(value)
}

function isDirectClientUrl(value) {
  return value.startsWith('data:') || value.startsWith('blob:') || value.startsWith('/')
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').trim()
}

function normalizeSupabaseObjectUrl(value, bucketCandidates, defaultBucket) {
  if (!SUPABASE_URL) return ''

  let parsedValue
  let parsedSupabaseBase
  try {
    parsedValue = new URL(String(value || ''))
    parsedSupabaseBase = new URL(SUPABASE_URL)
  } catch {
    return ''
  }

  if (parsedValue.origin !== parsedSupabaseBase.origin) return ''

  const cleanPath = normalizePath(parsedValue.pathname)
  const segments = cleanPath.split('/').filter(Boolean)
  if (segments.length < 6) return ''

  // Accept legacy signed/authenticated object URLs and normalize them to public URLs.
  // /storage/v1/object/{public|sign|authenticated}/{bucket}/{path}
  if (segments[0] !== 'storage' || segments[1] !== 'v1' || segments[2] !== 'object') return ''
  if (!['public', 'sign', 'authenticated'].includes(segments[3])) return ''

  const bucket = segments[4]
  const path = segments.slice(5).join('/')
  if (!bucket || !path) return ''

  const allowedBuckets = new Set([...(bucketCandidates || []), defaultBucket].filter(Boolean))
  if (allowedBuckets.size && !allowedBuckets.has(bucket)) return ''

  return buildSupabasePublicUrl(bucket, path)
}

function buildSupabasePublicUrl(bucket, path) {
  const cleanPath = normalizePath(path)
  if (!SUPABASE_URL || !bucket || !cleanPath) return ''
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${cleanPath}`
}

function resolveStoragePublicUrl(rawValue, bucketCandidates, defaultBucket, fallback) {
  const value = String(rawValue || '').trim()
  if (!value) return fallback
  if (isExternalUrl(value)) {
    const normalizedSupabaseUrl = normalizeSupabaseObjectUrl(value, bucketCandidates, defaultBucket)
    return normalizedSupabaseUrl || value
  }
  if (isDirectClientUrl(value)) return value

  const normalizedValue = normalizePath(value)
  const cleanValue = normalizedValue.split('?')[0].split('#')[0]
  const cleanSegments = cleanValue.split('/').filter(Boolean)
  if (cleanSegments.length >= 6 && cleanSegments[0] === 'storage' && cleanSegments[1] === 'v1' && cleanSegments[2] === 'object') {
    const mode = cleanSegments[3]
    const bucket = cleanSegments[4]
    const path = cleanSegments.slice(5).join('/')
    if (['public', 'sign', 'authenticated'].includes(mode) && bucket && path) {
      return buildSupabasePublicUrl(bucket, path) || fallback
    }
  }

  if (cleanSegments.length >= 3 && cleanSegments[0] === 'public') {
    const bucket = cleanSegments[1]
    const path = cleanSegments.slice(2).join('/')
    return buildSupabasePublicUrl(bucket, path) || fallback
  }

  if (normalizedValue.startsWith('storage/v1/object/public/')) {
    return SUPABASE_URL ? `${SUPABASE_URL}/${normalizedValue}` : fallback
  }
  if (normalizedValue.startsWith('object/public/')) {
    return SUPABASE_URL ? `${SUPABASE_URL}/storage/v1/${normalizedValue}` : fallback
  }

  if (normalizedValue.startsWith('supabase://')) {
    const remainder = normalizedValue.replace(/^supabase:\/\//, '')
    const [bucket, ...pathParts] = remainder.split('/')
    const path = pathParts.join('/')
    return buildSupabasePublicUrl(bucket, path) || fallback
  }

  const [firstSegment, ...rest] = normalizedValue.split('/')
  if (bucketCandidates.includes(firstSegment) && rest.length) {
    const bucketPath = rest.join('/')
    return buildSupabasePublicUrl(firstSegment, bucketPath) || fallback
  }

  return buildSupabasePublicUrl(defaultBucket, normalizedValue) || fallback
}

export function resolveAvatarUrl(rawValue, fallback = '/placeholders/avatar-anya.svg') {
  return resolveStoragePublicUrl(rawValue, PROFILE_PICTURE_BUCKET_CANDIDATES, PROFILE_PICTURE_BUCKET, fallback)
}

export function resolveProfilePictureUrl(rawValue, fallback = '/placeholders/avatar-anya.svg') {
  return resolveAvatarUrl(rawValue, fallback)
}

export function getProfilePictureValue(source) {
  if (!source || typeof source !== 'object') return ''
  const profilePictureUrl = String(source.profile_picture_url || '').trim()
  const avatarUrl = String(source.avatar_url || '').trim()

  const normalizedProfileLower = profilePictureUrl.toLowerCase()
  const profileIsLocalOnly =
    normalizedProfileLower.startsWith('blob:') ||
    normalizedProfileLower.startsWith('data:') ||
    normalizedProfileLower.startsWith('/placeholders/')
  const profileIsInvalidLiteral = normalizedProfileLower === 'null' || normalizedProfileLower === 'undefined'
  const profileLooksSignedSupabase = normalizedProfileLower.includes('/storage/v1/object/sign/')
  const avatarLooksSignedSupabase = avatarUrl.toLowerCase().includes('/storage/v1/object/sign/')

  if ((!profilePictureUrl || profileIsLocalOnly || profileIsInvalidLiteral) && avatarUrl) {
    return avatarUrl
  }

  if (profileLooksSignedSupabase && avatarUrl && !avatarLooksSignedSupabase) {
    return avatarUrl
  }

  return profilePictureUrl || avatarUrl
}

export function resolveListingImageUrl(rawValue, fallback = '/placeholders/listing-home.svg') {
  return resolveStoragePublicUrl(rawValue, LISTING_BUCKET_CANDIDATES, LISTING_BUCKET, fallback)
}
