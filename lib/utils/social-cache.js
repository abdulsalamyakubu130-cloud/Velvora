const SOCIAL_CACHE_KEY = 'velvora:local-social-cache'

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readSocialCache() {
  if (typeof window === 'undefined') return { follows: [], followsByUsername: [], likes: [], savedPosts: [] }

  try {
    const raw = window.localStorage.getItem(SOCIAL_CACHE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    const follows = Array.isArray(parsed?.follows) ? parsed.follows.filter(Boolean) : []
    const followsByUsername = Array.isArray(parsed?.followsByUsername) ? parsed.followsByUsername.filter(Boolean) : []
    const likes = Array.isArray(parsed?.likes) ? parsed.likes.filter(Boolean) : []
    const savedPosts = Array.isArray(parsed?.savedPosts) ? parsed.savedPosts.filter(Boolean) : []
    return { follows, followsByUsername, likes, savedPosts }
  } catch {
    return { follows: [], followsByUsername: [], likes: [], savedPosts: [] }
  }
}

function writeSocialCache(cache) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SOCIAL_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Ignore localStorage failures.
  }
}

function edgeKey(leftId, rightId) {
  return `${leftId}|${rightId}`
}

function parseEdge(edge) {
  const parts = String(edge || '').split('|')
  if (parts.length !== 2) return null
  const [left, right] = parts
  if (!left || !right) return null
  return { left, right }
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase()
}

export function setLocalFollow(followerId, followingId, isFollowing) {
  if (!followerId || !followingId) return
  const cache = readSocialCache()
  const key = edgeKey(followerId, followingId)
  const nextSet = new Set(cache.follows)
  if (isFollowing) {
    nextSet.add(key)
  } else {
    nextSet.delete(key)
  }
  writeSocialCache({ ...cache, follows: Array.from(nextSet) })
}

export function setLocalFollowByUsername(followerUsername, followingUsername, isFollowing) {
  const follower = normalizeUsername(followerUsername)
  const following = normalizeUsername(followingUsername)
  if (!follower || !following) return

  const cache = readSocialCache()
  const key = edgeKey(follower, following)
  const nextSet = new Set(cache.followsByUsername)
  if (isFollowing) {
    nextSet.add(key)
  } else {
    nextSet.delete(key)
  }
  writeSocialCache({ ...cache, followsByUsername: Array.from(nextSet) })
}

export function listLocalFollowEdges() {
  const cache = readSocialCache()
  return cache.follows
    .map(parseEdge)
    .filter(Boolean)
    .map((edge) => ({ followerId: edge.left, followingId: edge.right }))
}

export function listLocalFollowUsernameEdges() {
  const cache = readSocialCache()
  return cache.followsByUsername
    .map(parseEdge)
    .filter(Boolean)
    .map((edge) => ({ followerUsername: edge.left, followingUsername: edge.right }))
}

export function isLocalFollowing(followerId, followingId) {
  if (!followerId || !followingId) return false
  const cache = readSocialCache()
  const key = edgeKey(followerId, followingId)
  return cache.follows.includes(key)
}

export function isLocalFollowingByUsername(followerUsername, followingUsername) {
  const follower = normalizeUsername(followerUsername)
  const following = normalizeUsername(followingUsername)
  if (!follower || !following) return false
  const cache = readSocialCache()
  return cache.followsByUsername.includes(edgeKey(follower, following))
}

export function getLocalFollowingIds(followerId) {
  if (!followerId) return []
  return listLocalFollowEdges()
    .filter((edge) => edge.followerId === followerId)
    .map((edge) => edge.followingId)
}

export function getLocalFollowingUsernames(followerUsername) {
  const follower = normalizeUsername(followerUsername)
  if (!follower) return []
  return listLocalFollowUsernameEdges()
    .filter((edge) => edge.followerUsername === follower)
    .map((edge) => edge.followingUsername)
}

export function setLocalLike(userId, postId, isLiked) {
  if (!userId || !postId) return
  const cache = readSocialCache()
  const key = edgeKey(userId, postId)
  const nextSet = new Set(cache.likes)
  if (isLiked) {
    nextSet.add(key)
  } else {
    nextSet.delete(key)
  }
  writeSocialCache({ ...cache, likes: Array.from(nextSet) })
}

export function isLocalLiked(userId, postId) {
  if (!userId || !postId) return false
  const cache = readSocialCache()
  return cache.likes.includes(edgeKey(userId, postId))
}

export function setLocalSavedPost(userId, postId, isSaved) {
  if (!userId || !postId) return
  const cache = readSocialCache()
  const key = edgeKey(userId, postId)
  const nextSet = new Set(cache.savedPosts)
  if (isSaved) {
    nextSet.add(key)
  } else {
    nextSet.delete(key)
  }
  writeSocialCache({ ...cache, savedPosts: Array.from(nextSet) })

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('velvora:saved-posts-changed'))
  }
}

export function isLocalSavedPost(userId, postId) {
  if (!userId || !postId) return false
  const cache = readSocialCache()
  return cache.savedPosts.includes(edgeKey(userId, postId))
}

export function listLocalSavedPostIds(userId) {
  if (!userId) return []
  const cache = readSocialCache()
  const ids = []
  for (const edge of cache.savedPosts) {
    const parsed = parseEdge(edge)
    if (!parsed || parsed.left !== userId) continue
    ids.push(parsed.right)
  }
  return ids
}

export function countLocalLikesForPost(postId) {
  if (!postId) return 0
  const cache = readSocialCache()
  let count = 0
  for (const edge of cache.likes) {
    const parsed = parseEdge(edge)
    if (parsed && parsed.right === postId) {
      count += 1
    }
  }
  return count
}

export function countLocalCommentsForPost(postId) {
  if (!postId || typeof window === 'undefined') return 0
  try {
    const raw = window.localStorage.getItem(`velvora:post-comments:${postId}`)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.length : 0
  } catch {
    return 0
  }
}
