import { useCallback, useEffect, useMemo, useState } from 'react'
import { normalizeVerificationTier } from '@/lib/utils'
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { runWithMissingColumnFallback } from '@/lib/supabase/query-compat'
import { getBoostTierPriority } from '@/lib/monetization/boost-plans'
import { mockPosts } from '@/lib/data/mock-data'
import { extractListingImageUrls, getProfilePictureValue, resolveProfilePictureUrl } from '@/lib/utils/media-url'
import { useAuth } from '@/src/context/auth-context'

const FEED_LIMIT = 24
const FEED_CACHE_TTL_MS = 30 * 1000
const feedCache = new Map()

const fallbackImageByCategory = {
  fashion: '/placeholders/listing-fashion.svg',
  tech: '/placeholders/listing-tech.svg',
  home: '/placeholders/listing-home.svg',
  beauty: '/placeholders/listing-lifestyle.svg',
  art: '/placeholders/listing-home.svg',
  fitness: '/placeholders/listing-lifestyle.svg',
}

function fallbackImageForPost(post) {
  const categoryName = String(post.category_name || '').toLowerCase()
  if (categoryName.includes('fashion')) return fallbackImageByCategory.fashion
  if (categoryName.includes('tech')) return fallbackImageByCategory.tech
  if (categoryName.includes('home')) return fallbackImageByCategory.home
  if (categoryName.includes('beauty')) return fallbackImageByCategory.beauty
  if (categoryName.includes('art')) return fallbackImageByCategory.art
  if (categoryName.includes('fitness')) return fallbackImageByCategory.fitness
  return '/placeholders/listing-home.svg'
}

function buildFallbackPost(mockPost, index) {
  const fallbackId = `mock-post-${index + 1}`
  const fallbackUserId = `mock-user-${index + 1}`
  const categoryName = String(mockPost?.category_name || 'General').trim() || 'General'
  const userRow = mockPost?.user || {}
  const resolvedProfilePicture = resolveProfilePictureUrl(getProfilePictureValue(userRow), '')
  const resolvedAvatar = resolveProfilePictureUrl(userRow.avatar_url || '', '')
  const imageUrls = extractListingImageUrls(mockPost?.images, [])
  const verificationTier = normalizeVerificationTier(userRow.verification_tier, userRow.is_verified)

  return {
    id: mockPost?.id || fallbackId,
    user_id: mockPost?.user_id || userRow?.id || fallbackUserId,
    title: String(mockPost?.title || 'Marketplace listing'),
    description: String(mockPost?.description || ''),
    price: Number(mockPost?.price || 0),
    category_id: String(mockPost?.category_id || ''),
    category_name: categoryName,
    condition: mockPost?.condition === 'new' ? 'new' : 'used',
    location: String(mockPost?.location || 'Marketplace'),
    is_available: mockPost?.is_available !== false,
    is_negotiable: Boolean(mockPost?.is_negotiable),
    created_at: mockPost?.created_at || new Date().toISOString(),
    likes_count: Number(mockPost?.likes_count || 0),
    comments_count: Number(mockPost?.comments_count || 0),
    is_liked_by_me: false,
    is_boosted: false,
    boost_tier: '',
    boost_ends_at: null,
    boost_priority: 0,
    images: imageUrls.length ? imageUrls : [fallbackImageForPost({ category_name: categoryName })],
    user: {
      id: userRow?.id || fallbackUserId,
      username: String(userRow?.username || `seller_${index + 1}`),
      full_name: String(userRow?.full_name || 'Marketplace Seller'),
      bio: String(userRow?.bio || ''),
      country: String(userRow?.country || 'Nigeria'),
      profile_picture_url: resolvedProfilePicture || resolvedAvatar,
      avatar_url: resolvedAvatar || resolvedProfilePicture,
      is_verified: verificationTier !== 'none',
      verification_tier: verificationTier,
      followers: Number(userRow?.followers || 0),
      following: Number(userRow?.following || 0),
      is_following: Boolean(userRow?.is_following),
      follows_you: Boolean(userRow?.follows_you),
      accepts_message_requests: Boolean(userRow?.accepts_message_requests),
    },
  }
}

function resolveFeedErrorMessage(nextError) {
  const rawMessage = String(nextError?.message || nextError || '').trim()
  const normalizedMessage = rawMessage.toLowerCase()

  if (
    normalizedMessage.includes('failed to fetch') ||
    normalizedMessage.includes('networkerror') ||
    normalizedMessage.includes('network request failed') ||
    normalizedMessage.includes('load failed')
  ) {
    return 'Cannot connect to the marketplace server. Check your internet or DNS, then retry.'
  }

  if (
    normalizedMessage.includes('name could not be resolved') ||
    normalizedMessage.includes('getaddrinfo') ||
    normalizedMessage.includes('dns')
  ) {
    return 'DNS could not resolve the Supabase host. Try switching DNS to 1.1.1.1 or 8.8.8.8.'
  }

  return rawMessage || 'Unable to load the marketplace feed right now.'
}

export function useLivePosts({ onlyFollowing = false } = {}) {
  const { user: authUser } = useAuth()
  const cacheKey = `${onlyFollowing ? 'following' : 'all'}:${authUser?.id || 'anon'}`
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fallbackPosts = useMemo(() => {
    if (onlyFollowing) return []
    return mockPosts.map((post, index) => buildFallbackPost(post, index))
  }, [onlyFollowing])

  const offlineFeedMessage = onlyFollowing
    ? authUser?.id
      ? 'Following feed is temporarily unavailable. Please retry shortly.'
      : 'Sign in to view posts from sellers you follow.'
    : 'Live feed is unavailable right now. Showing sample listings.'

  const fetchPosts = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!isSupabaseConfigured) {
      setPosts(fallbackPosts)
      setError(offlineFeedMessage)
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setPosts(fallbackPosts)
      setError(offlineFeedMessage)
      return
    }

    if (!silent && !force) {
      const cachedFeed = feedCache.get(cacheKey)
      const isFresh = cachedFeed && Date.now() - cachedFeed.fetchedAt < FEED_CACHE_TTL_MS
      if (isFresh) {
        setError('')
        setPosts(cachedFeed.posts)
        return
      }
    }

    if (!silent) {
      setLoading(true)
    }

    try {
      let followingIds = []
      if (onlyFollowing) {
        if (!authUser?.id) {
          setPosts([])
          setError('Sign in to view posts from sellers you follow.')
          return
        }

        const { data: followingRows } = await supabase
          .from('followers')
          .select('following_id')
          .eq('follower_id', authUser.id)

        followingIds = Array.from(
          new Set((followingRows || []).map((row) => row.following_id).filter(Boolean)),
        )

        if (!followingIds.length) {
          setPosts([])
          return
        }
      }

      let postsQuery = supabase
        .from('posts')
        .select(
          `
            id,
            user_id,
            title,
            description,
            price,
            category_id,
            condition,
            location,
            is_available,
            is_negotiable,
            created_at,
            categories(name)
          `,
        )
        .order('created_at', { ascending: false })
        .limit(FEED_LIMIT)

      if (onlyFollowing && followingIds.length) {
        postsQuery = postsQuery.in('user_id', followingIds)
      }

      const { data: postRows, error: postsError } = await postsQuery
      if (postsError || !postRows) {
        setPosts(fallbackPosts)
        const resolvedError = resolveFeedErrorMessage(postsError)
        setError(onlyFollowing ? resolvedError : `${resolvedError} Showing sample listings.`)
        return
      }

      if (!postRows.length) {
        setError('')
        setPosts([])
        return
      }

      const postIds = postRows.map((row) => row.id)
      const userIds = Array.from(new Set(postRows.map((row) => row.user_id).filter(Boolean)))

      const [
        { data: userRows },
        { data: imageRows },
        { data: likeRows },
        { data: commentRows },
        { data: likedByMeRows },
        { data: relationRows },
        { data: followsYouRows },
        { data: boostRows },
      ] = await Promise.all([
        userIds.length
          ? runWithMissingColumnFallback(
              () =>
                supabase
                  .from('users')
                  .select('id, username, full_name, bio, country, avatar_url, profile_picture_url, is_verified, verification_tier')
                  .in('id', userIds),
              () =>
                supabase
                  .from('users')
                  .select('id, username, full_name, bio, country, avatar_url, is_verified, verification_tier')
                  .in('id', userIds),
            )
          : Promise.resolve({ data: [] }),
        postIds.length
          ? supabase.from('post_images').select('post_id, image_url, sort_order').in('post_id', postIds)
          : Promise.resolve({ data: [] }),
        postIds.length ? supabase.from('likes').select('post_id').in('post_id', postIds) : Promise.resolve({ data: [] }),
        postIds.length ? supabase.from('comments').select('post_id').in('post_id', postIds) : Promise.resolve({ data: [] }),
        authUser?.id && postIds.length
          ? supabase.from('likes').select('post_id').eq('user_id', authUser.id).in('post_id', postIds)
          : Promise.resolve({ data: [] }),
        authUser?.id && userIds.length
          ? supabase.from('followers').select('following_id').eq('follower_id', authUser.id).in('following_id', userIds)
          : Promise.resolve({ data: [] }),
        authUser?.id && userIds.length
          ? supabase.from('followers').select('follower_id').eq('following_id', authUser.id).in('follower_id', userIds)
          : Promise.resolve({ data: [] }),
        postIds.length
          ? supabase
              .from('post_boost_orders')
              .select('post_id, boost_tier, ends_at')
              .in('post_id', postIds)
              .eq('status', 'active')
              .gt('ends_at', new Date().toISOString())
          : Promise.resolve({ data: [] }),
      ])

      const usersById = new Map((userRows || []).map((row) => [row.id, row]))
      const imagesByPostId = new Map()
      for (const row of imageRows || []) {
        if (!imagesByPostId.has(row.post_id)) imagesByPostId.set(row.post_id, [])
        imagesByPostId.get(row.post_id).push(row)
      }

      const likesByPostId = {}
      for (const row of likeRows || []) {
        likesByPostId[row.post_id] = (likesByPostId[row.post_id] || 0) + 1
      }

      const commentsByPostId = {}
      for (const row of commentRows || []) {
        commentsByPostId[row.post_id] = (commentsByPostId[row.post_id] || 0) + 1
      }

      const likedByMeSet = new Set((likedByMeRows || []).map((row) => row.post_id))
      const followingSet = new Set((relationRows || []).map((row) => row.following_id))
      const followsYouSet = new Set((followsYouRows || []).map((row) => row.follower_id))
      const boostsByPostId = new Map()
      for (const row of boostRows || []) {
        if (!row?.post_id) continue
        const nextPriority = getBoostTierPriority(row.boost_tier)
        if (!nextPriority) continue
        const nextEndsAtUnix = new Date(row.ends_at || 0).getTime() || 0
        const currentBestBoost = boostsByPostId.get(row.post_id)
        if (!currentBestBoost) {
          boostsByPostId.set(row.post_id, {
            tier: row.boost_tier,
            ends_at: row.ends_at,
            priority: nextPriority,
            endsAtUnix: nextEndsAtUnix,
          })
          continue
        }

        const shouldReplaceCurrent =
          nextPriority > currentBestBoost.priority ||
          (nextPriority === currentBestBoost.priority && nextEndsAtUnix > currentBestBoost.endsAtUnix)

        if (shouldReplaceCurrent) {
          boostsByPostId.set(row.post_id, {
            tier: row.boost_tier,
            ends_at: row.ends_at,
            priority: nextPriority,
            endsAtUnix: nextEndsAtUnix,
          })
        }
      }

      const mappedPosts = postRows.map((row) => {
        const userRow = usersById.get(row.user_id) || {}
        const boostMeta = boostsByPostId.get(row.id)
        const isMyPost = Boolean(authUser?.id) && row.user_id === authUser.id
        const resolvedProfilePicture = resolveProfilePictureUrl(userRow.profile_picture_url || '', '')
        const resolvedAvatar = resolveProfilePictureUrl(userRow.avatar_url || '', '')
        const fallbackProfilePicture = isMyPost
          ? resolveProfilePictureUrl(authUser?.user_metadata?.profile_picture_url || authUser?.user_metadata?.avatar_url || '', '')
          : ''
        const finalProfilePicture = resolvedProfilePicture || resolvedAvatar || fallbackProfilePicture
        const sortedImages = [...(imagesByPostId.get(row.id) || [])].sort((a, b) => a.sort_order - b.sort_order)
        const imageUrls = []
        for (const imageRow of sortedImages) {
          imageUrls.push(...extractListingImageUrls(imageRow.image_url, []))
        }
        const uniqueImageUrls = Array.from(new Set(imageUrls))
        const categoryName = Array.isArray(row.categories)
          ? row.categories[0]?.name || 'General'
          : row.categories?.name || 'General'

        return {
          id: row.id,
          user_id: row.user_id,
          title: row.title,
          description: row.description || '',
          price: Number(row.price || 0),
          category_id: row.category_id,
          category_name: categoryName,
          condition: row.condition || 'used',
          location: row.location || '',
          is_available: Boolean(row.is_available),
          is_negotiable: Boolean(row.is_negotiable),
          created_at: row.created_at,
          likes_count: likesByPostId[row.id] || 0,
          comments_count: commentsByPostId[row.id] || 0,
          is_liked_by_me: likedByMeSet.has(row.id),
          is_boosted: Boolean(boostMeta),
          boost_tier: boostMeta?.tier || '',
          boost_ends_at: boostMeta?.ends_at || null,
          boost_priority: boostMeta?.priority || 0,
          images: uniqueImageUrls.length ? uniqueImageUrls : [fallbackImageForPost({ category_name: categoryName })],
          user: {
            id: row.user_id,
            username: userRow.username || `user_${String(row.user_id || '').slice(0, 8)}`,
            full_name: userRow.full_name || 'Marketplace Seller',
            bio: userRow.bio || '',
            country: userRow.country || 'Nigeria',
            profile_picture_url: finalProfilePicture,
            avatar_url: resolvedAvatar || finalProfilePicture,
            is_verified: Boolean(userRow.is_verified),
            verification_tier: normalizeVerificationTier(userRow.verification_tier, userRow.is_verified),
            followers: 0,
            following: 0,
            is_following: followingSet.has(row.user_id),
            follows_you: followsYouSet.has(row.user_id),
            accepts_message_requests: false,
          },
        }
      })

      const sortedPosts = [...mappedPosts].sort((leftPost, rightPost) => {
        const priorityDelta = (rightPost.boost_priority || 0) - (leftPost.boost_priority || 0)
        if (priorityDelta !== 0) return priorityDelta

        const rightBoostEndsAt = new Date(rightPost.boost_ends_at || 0).getTime() || 0
        const leftBoostEndsAt = new Date(leftPost.boost_ends_at || 0).getTime() || 0
        if (rightBoostEndsAt !== leftBoostEndsAt) return rightBoostEndsAt - leftBoostEndsAt

        return new Date(rightPost.created_at).getTime() - new Date(leftPost.created_at).getTime()
      })

      setPosts(sortedPosts)
      setError('')
      feedCache.set(cacheKey, { posts: sortedPosts, fetchedAt: Date.now() })
    } catch (nextError) {
      setPosts(fallbackPosts)
      const resolvedError = resolveFeedErrorMessage(nextError)
      setError(onlyFollowing ? resolvedError : `${resolvedError} Showing sample listings.`)
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [authUser?.id, cacheKey, fallbackPosts, offlineFeedMessage, onlyFollowing])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return undefined

    let refreshTimeout = null
    const queueRefresh = () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout)
      }
      refreshTimeout = setTimeout(() => {
        fetchPosts({ silent: true, force: true })
      }, 250)
    }

    const channel = supabase
      .channel(`live-posts:${onlyFollowing ? 'following' : 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_images' }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_boost_orders' }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, queueRefresh)
      .subscribe()

    return () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout)
      }
      supabase.removeChannel(channel)
    }
  }, [fetchPosts, onlyFollowing])

  useEffect(() => {
    const cachedFeed = feedCache.get(cacheKey)
    if (!cachedFeed) return
    if (Date.now() - cachedFeed.fetchedAt >= FEED_CACHE_TTL_MS) return
    setError('')
    setPosts(cachedFeed.posts)
  }, [cacheKey])

  return { posts, loading, error, refresh: fetchPosts }
}
