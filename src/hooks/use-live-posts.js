import { useCallback, useEffect, useMemo, useState } from 'react'
import { normalizeVerificationTier } from '@/lib/utils'
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { runWithMissingColumnFallback } from '@/lib/supabase/query-compat'
import { getProfilePictureValue, resolveListingImageUrl, resolveProfilePictureUrl } from '@/lib/utils/media-url'
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

export function useLivePosts({ onlyFollowing = false } = {}) {
  const { user: authUser } = useAuth()
  const cacheKey = `${onlyFollowing ? 'following' : 'all'}:${authUser?.id || 'anon'}`
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(false)

  const fallbackPosts = useMemo(() => [], [])

  const fetchPosts = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!isSupabaseConfigured) {
      setPosts(fallbackPosts)
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setPosts(fallbackPosts)
      return
    }

    if (!silent && !force) {
      const cachedFeed = feedCache.get(cacheKey)
      const isFresh = cachedFeed && Date.now() - cachedFeed.fetchedAt < FEED_CACHE_TTL_MS
      if (isFresh) {
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
        return
      }

      if (!postRows.length) {
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

      const mappedPosts = postRows.map((row) => {
        const userRow = usersById.get(row.user_id) || {}
        const isMyPost = Boolean(authUser?.id) && row.user_id === authUser.id
        const resolvedProfilePicture = resolveProfilePictureUrl(userRow.profile_picture_url || '', '')
        const resolvedAvatar = resolveProfilePictureUrl(userRow.avatar_url || '', '')
        const fallbackProfilePicture = isMyPost
          ? resolveProfilePictureUrl(authUser?.user_metadata?.profile_picture_url || authUser?.user_metadata?.avatar_url || '', '')
          : ''
        const finalProfilePicture = resolvedProfilePicture || resolvedAvatar || fallbackProfilePicture
        const sortedImages = [...(imagesByPostId.get(row.id) || [])].sort((a, b) => a.sort_order - b.sort_order)
        const imageUrls = sortedImages
          .map((imageRow) => resolveListingImageUrl(imageRow.image_url || '', ''))
          .filter(Boolean)
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
          images: imageUrls.length ? imageUrls : [fallbackImageForPost({ category_name: categoryName })],
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

      setPosts(mappedPosts)
      feedCache.set(cacheKey, { posts: mappedPosts, fetchedAt: Date.now() })
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [authUser?.id, cacheKey, fallbackPosts, onlyFollowing])

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
    setPosts(cachedFeed.posts)
  }, [cacheKey])

  return { posts, loading, refresh: fetchPosts }
}
