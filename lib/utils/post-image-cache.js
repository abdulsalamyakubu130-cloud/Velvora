const STORAGE_KEY = 'velvora:local-post-images'
const MEMORY_KEY = '__velvoraLocalPostImages'

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isLocalImageValue(value) {
  return typeof value === 'string' && (value.startsWith('data:') || value.startsWith('blob:'))
}

function getMemoryMap() {
  if (typeof window === 'undefined') return {}
  const existing = window[MEMORY_KEY]
  if (isObject(existing)) return existing
  window[MEMORY_KEY] = {}
  return window[MEMORY_KEY]
}

function readStorageMap() {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return isObject(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function readLocalPostImageMap() {
  const storageMap = readStorageMap()
  const memoryMap = getMemoryMap()
  return { ...storageMap, ...memoryMap }
}

export function readLocalPostImage(postId) {
  if (!postId) return ''
  const imageMap = readLocalPostImageMap()
  const value = String(imageMap[postId] || '')
  return isLocalImageValue(value) ? value : ''
}

export function persistLocalPostImage(postId, imageUrl) {
  if (!postId || !isLocalImageValue(imageUrl) || typeof window === 'undefined') return false

  const memoryMap = getMemoryMap()
  memoryMap[postId] = imageUrl

  try {
    const storageMap = readStorageMap()
    storageMap[postId] = imageUrl
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storageMap))
    return true
  } catch {
    return true
  }
}

