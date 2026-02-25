import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  buildProfilePath,
  convertToViewerCurrency,
  formatMoneyForViewer,
  maxVerificationTier,
  normalizeVerificationTier,
  resolveViewerLocation,
} from '@/lib/utils'
import { useAuth } from '@/src/context/auth-context'
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { runWithMissingColumnFallback } from '@/lib/supabase/query-compat'
import { getProfilePictureValue, resolveListingImageUrl, resolveProfilePictureUrl } from '@/lib/utils/media-url'
import { useI18n } from '@/src/context/i18n-context'
import VerifiedBadge from '@/components/verified-badge'

const PROFILE_PICTURE_BUCKET =
  import.meta.env.VITE_SUPABASE_PROFILE_PICTURE_BUCKET || import.meta.env.VITE_SUPABASE_AVATAR_BUCKET || 'avatars'
const PROFILE_PICTURE_BUCKET_CANDIDATES = Array.from(
  new Set([
    PROFILE_PICTURE_BUCKET,
    'avatars',
    'avatar',
    'profile',
    'profile-avatars',
    'profile-pictures',
    'profile_pictures',
  ]),
)
const PROFILE_SELECT =
  'id, username, full_name, bio, country, avatar_url, profile_picture_url, is_verified, verification_tier'
const PROFILE_SELECT_FALLBACK = 'id, username, full_name, bio, country, avatar_url, is_verified, verification_tier'
const RELATION_USER_SELECT = 'id, username, full_name, avatar_url, profile_picture_url, is_verified, verification_tier'
const RELATION_USER_SELECT_FALLBACK = 'id, username, full_name, avatar_url, is_verified, verification_tier'
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value) {
  return uuidPattern.test(String(value || ''))
}

function isMissingTableError(error, tableName) {
  const message = String(error?.message || '').toLowerCase()
  return (
    error?.code === 'PGRST205' ||
    message.includes(`public.${String(tableName || '').toLowerCase()}`) && message.includes('schema cache') ||
    message.includes(`relation "public.${String(tableName || '').toLowerCase()}" does not exist`) ||
    message.includes(`relation "${String(tableName || '').toLowerCase()}" does not exist`)
  )
}

function isMissingFunctionError(error, functionName) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes(`function public.${String(functionName || '').toLowerCase()}`) || message.includes('could not find the function')
}

function buildPostEditForm(post) {
  return {
    title: post?.title || '',
    description: post?.description || '',
    price: String(post?.price ?? ''),
    location: post?.location || '',
    condition: post?.condition === 'new' ? 'new' : 'used',
    is_available: Boolean(post?.is_available),
    is_negotiable: Boolean(post?.is_negotiable),
  }
}

function normalizeProfileHandle(value) {
  const raw = String(value || '')
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    decoded = raw
  }
  return decoded.trim().replace(/^@+/, '')
}

export default function ProfilePage() {
  const [statusFilter, setStatusFilter] = useState('available')
  const [isFollowing, setIsFollowing] = useState(false)
  const [messageRequestStatus, setMessageRequestStatus] = useState('none')
  const [messageRequestConversationId, setMessageRequestConversationId] = useState('')
  const [requestFeedback, setRequestFeedback] = useState('')
  const [reportReason, setReportReason] = useState('scam')
  const [reportPending, setReportPending] = useState(false)
  const [reportFeedback, setReportFeedback] = useState('')
  const [blockPending, setBlockPending] = useState(false)
  const [blockFeedback, setBlockFeedback] = useState('')
  const [followFeedback, setFollowFeedback] = useState('')
  const [deletePendingPostId, setDeletePendingPostId] = useState('')
  const [deleteAllPending, setDeleteAllPending] = useState(false)
  const [deleteFeedback, setDeleteFeedback] = useState('')
  const [editingPostId, setEditingPostId] = useState('')
  const [editPending, setEditPending] = useState(false)
  const [editFeedback, setEditFeedback] = useState('')
  const [editForm, setEditForm] = useState(() => buildPostEditForm(null))
  const [deletedPostIds, setDeletedPostIds] = useState([])
  const [isBlocked, setIsBlocked] = useState(false)
  const [isUserOnline, setIsUserOnline] = useState(false)
  const [targetUserId, setTargetUserId] = useState('')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarFeedback, setAvatarFeedback] = useState('')
  const [avatarOverrideUrl, setAvatarOverrideUrl] = useState('')
  const [liveUser, setLiveUser] = useState(null)
  const [livePosts, setLivePosts] = useState([])
  const [followerUsers, setFollowerUsers] = useState([])
  const [followingUsers, setFollowingUsers] = useState([])
  const [relationUsersLoading, setRelationUsersLoading] = useState(false)
  const [activeRelationList, setActiveRelationList] = useState('')
  const [relationPendingUserId, setRelationPendingUserId] = useState('')
  const [relationFeedback, setRelationFeedback] = useState('')
  const [loadingLiveProfile, setLoadingLiveProfile] = useState(false)
  const [selfApprovedTier, setSelfApprovedTier] = useState('none')
  const { username: rawUsername = '' } = useParams()
  const { user: authUser } = useAuth()
  const { t } = useI18n()
  const username = normalizeProfileHandle(rawUsername)
  const authUsername =
    authUser?.user_metadata?.username ||
    authUser?.email?.split('@')[0] ||
    authUser?.phone?.replace(/[^\d]/g, '') ||
    ''
  const normalizedAuthUsername = normalizeProfileHandle(authUsername)
  const normalizedAuthId = String(authUser?.id || '').toLowerCase()
  const normalizedRouteHandle = String(username || '').toLowerCase()
  const isOwnUsernameRoute = Boolean(normalizedAuthUsername) && normalizedRouteHandle === normalizedAuthUsername.toLowerCase()
  const isOwnIdRoute = Boolean(normalizedAuthId) && normalizedRouteHandle === normalizedAuthId
  const isMyProfileRoute = isOwnUsernameRoute || isOwnIdRoute
  const fallbackVerificationTier = maxVerificationTier(
    normalizeVerificationTier(authUser?.user_metadata?.verification_tier, authUser?.user_metadata?.is_verified),
    selfApprovedTier,
  )
  const fallbackUser = isMyProfileRoute
    ? {
        id: authUser?.id || 'current-user',
        username: normalizedAuthUsername,
        full_name: authUser?.user_metadata?.full_name || normalizedAuthUsername,
        bio:
          authUser?.user_metadata?.bio ||
          'This is your profile. Add your first listing to start building your public storefront.',
        country: authUser?.user_metadata?.country || 'Nigeria',
        profile_picture_url:
          authUser?.user_metadata?.profile_picture_url ||
          authUser?.user_metadata?.avatar_url ||
          '/placeholders/avatar-anya.svg',
        avatar_url:
          authUser?.user_metadata?.profile_picture_url ||
          authUser?.user_metadata?.avatar_url ||
          '/placeholders/avatar-anya.svg',
        is_verified: fallbackVerificationTier !== 'none',
        verification_tier: fallbackVerificationTier,
        followers: 0,
        following: 0,
        is_following: false,
        follows_you: false,
        accepts_message_requests: false,
      }
    : null
  const hasLiveProfile = Boolean(liveUser)
  const user = liveUser || fallbackUser
  const userProfilePicture = getProfilePictureValue(user)
  const isOwnProfile = Boolean(authUser?.id && user?.id && String(authUser.id) === String(user.id))
  const userPosts = hasLiveProfile ? livePosts : []
  const viewerLocation = resolveViewerLocation(authUser)
  const canInteract = Boolean(authUser?.id)
  const localProfilePictureKey = useMemo(() => {
    if (!authUser?.id) return ''
    return `velvora:local-profile-picture:${authUser.id}`
  }, [authUser?.id])

  const refreshLiveProfile = useCallback(async () => {
    if (!username || !isSupabaseConfigured) {
      setLiveUser(null)
      setLivePosts([])
      setFollowerUsers([])
      setFollowingUsers([])
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setLiveUser(null)
      setLivePosts([])
      setFollowerUsers([])
      setFollowingUsers([])
      return
    }

    setLoadingLiveProfile(true)

    const selectProfilesWithFallback = async (buildQuery) =>
      runWithMissingColumnFallback(
        () => buildQuery(PROFILE_SELECT),
        () => buildQuery(PROFILE_SELECT_FALLBACK),
      )

    let profileRow = null

    const { data: byUsername } = await selectProfilesWithFallback((selectClause) =>
      supabase.from('users').select(selectClause).eq('username', username).maybeSingle(),
    )

    profileRow = byUsername || null

    if (!profileRow && isUuid(username)) {
      const { data: byIdFromRoute } = await selectProfilesWithFallback((selectClause) =>
        supabase.from('users').select(selectClause).eq('id', username).maybeSingle(),
      )
      profileRow = byIdFromRoute || null
    }

    if (!profileRow) {
      const escapedQuery = username.replace(/[%_]/g, '').trim()
      if (escapedQuery) {
        const [{ data: usernameMatches }, { data: fullNameMatches }] = await Promise.all([
          selectProfilesWithFallback((selectClause) =>
            supabase.from('users').select(selectClause).ilike('username', `%${escapedQuery}%`).limit(2),
          ),
          selectProfilesWithFallback((selectClause) =>
            supabase.from('users').select(selectClause).ilike('full_name', `%${escapedQuery}%`).limit(2),
          ),
        ])

        if ((usernameMatches || []).length === 1) {
          profileRow = usernameMatches[0]
        } else if ((fullNameMatches || []).length === 1) {
          profileRow = fullNameMatches[0]
        }
      }
    }

    if (!profileRow && isMyProfileRoute && authUser?.id) {
      const { data: byId } = await selectProfilesWithFallback((selectClause) =>
        supabase.from('users').select(selectClause).eq('id', authUser.id).maybeSingle(),
      )
      profileRow = byId || null
    }

    if (!profileRow && isMyProfileRoute && authUser?.id) {
        profileRow = {
          id: authUser.id,
          username: normalizedAuthUsername || `user_${String(authUser.id).slice(0, 8)}`,
          full_name: authUser?.user_metadata?.full_name || normalizedAuthUsername || 'Marketplace Seller',
          bio: authUser?.user_metadata?.bio || '',
          country: authUser?.user_metadata?.country || 'Nigeria',
          profile_picture_url:
            authUser?.user_metadata?.profile_picture_url ||
            authUser?.user_metadata?.avatar_url ||
            '',
          avatar_url: authUser?.user_metadata?.avatar_url || '',
          is_verified: Boolean(authUser?.user_metadata?.is_verified),
          verification_tier: normalizeVerificationTier(
            authUser?.user_metadata?.verification_tier,
            authUser?.user_metadata?.is_verified,
          ),
      }
    }

    // Fallback for environments where social rows exist but users row is missing for that account.
    if (!profileRow && isUuid(username)) {
      const [{ data: userPostsRows }, { data: userFollowerRows }, { data: userCommentRows }, { data: userLikeRows }] =
        await Promise.all([
          supabase.from('posts').select('id').eq('user_id', username).limit(1),
          supabase.from('followers').select('id').or(`follower_id.eq.${username},following_id.eq.${username}`).limit(1),
          supabase.from('comments').select('id').eq('user_id', username).limit(1),
          supabase.from('likes').select('id').eq('user_id', username).limit(1),
        ])

      const hasAnyActivity =
        Boolean((userPostsRows || []).length) ||
        Boolean((userFollowerRows || []).length) ||
        Boolean((userCommentRows || []).length) ||
        Boolean((userLikeRows || []).length)

      if (hasAnyActivity) {
        profileRow = {
          id: username,
          username: `user_${String(username).slice(0, 8)}`,
          full_name: 'Marketplace Seller',
          bio: '',
          country: 'Nigeria',
          avatar_url: '',
          is_verified: false,
          verification_tier: 'none',
        }
      }
    }

    if (!profileRow) {
      setLiveUser(null)
      setLivePosts([])
      setFollowerUsers([])
      setFollowingUsers([])
      setLoadingLiveProfile(false)
      return
    }

    const [
      { count: followersCount },
      { count: followingCount },
      { data: postsRows },
      { data: approvedKycRow },
    ] = await Promise.all([
      supabase.from('followers').select('id', { head: true, count: 'exact' }).eq('following_id', profileRow.id),
      supabase.from('followers').select('id', { head: true, count: 'exact' }).eq('follower_id', profileRow.id),
      supabase
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
        .eq('user_id', profileRow.id)
        .order('created_at', { ascending: false }),
      isMyProfileRoute && authUser?.id
        ? supabase
            .from('kyc_verifications')
            .select('tier_requested')
            .eq('user_id', authUser.id)
            .eq('status', 'approved')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const followersTotal = Number.isFinite(Number(followersCount)) ? Number(followersCount) : 0
    const followingTotal = Number.isFinite(Number(followingCount)) ? Number(followingCount) : 0

    let isFollowingRow = null
    let followsYouRow = null
    if (authUser?.id && !isMyProfileRoute) {
      const [{ data: followingData }, { data: followsYouData }] = await Promise.all([
        supabase
          .from('followers')
          .select('id')
          .eq('follower_id', authUser.id)
          .eq('following_id', profileRow.id)
          .limit(1),
        supabase
          .from('followers')
          .select('id')
          .eq('follower_id', profileRow.id)
          .eq('following_id', authUser.id)
          .limit(1),
      ])
      isFollowingRow = followingData?.[0] || null
      followsYouRow = followsYouData?.[0] || null
    }

    const rawPosts = postsRows || []
    const postIds = rawPosts.map((post) => post.id)

    const [{ data: imageRows }, { data: likeRows }, { data: commentRows }] = await Promise.all([
      postIds.length
        ? supabase.from('post_images').select('post_id, image_url, sort_order').in('post_id', postIds)
        : Promise.resolve({ data: [] }),
      postIds.length ? supabase.from('likes').select('post_id').in('post_id', postIds) : Promise.resolve({ data: [] }),
      postIds.length ? supabase.from('comments').select('post_id').in('post_id', postIds) : Promise.resolve({ data: [] }),
    ])

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

    const storedTier = normalizeVerificationTier(profileRow.verification_tier, profileRow.is_verified)
    const approvedTier = normalizeVerificationTier(approvedKycRow?.tier_requested)
    const effectiveTier = maxVerificationTier(storedTier, approvedTier)
    const isVerified = effectiveTier !== 'none'
    const resolvedProfilePicture = resolveProfilePictureUrl(profileRow.profile_picture_url || '', '')
    const resolvedAvatar = resolveProfilePictureUrl(profileRow.avatar_url || '', '')
    const fallbackProfilePicture = isMyProfileRoute
      ? resolveProfilePictureUrl(authUser?.user_metadata?.profile_picture_url || authUser?.user_metadata?.avatar_url || '', '')
      : ''
    const finalProfilePicture = resolvedProfilePicture || resolvedAvatar || fallbackProfilePicture

    const nextUser = {
      ...profileRow,
      is_verified: isVerified,
      verification_tier: effectiveTier,
      country: profileRow.country || 'Nigeria',
      profile_picture_url: finalProfilePicture,
      avatar_url: resolvedAvatar || finalProfilePicture,
      followers: followersTotal,
      following: followingTotal,
      is_following: Boolean(isFollowingRow),
      follows_you: Boolean(followsYouRow),
      accepts_message_requests: false,
    }

    const nextPosts = rawPosts.map((post) => {
      const sortedImages = [...(imagesByPostId.get(post.id) || [])].sort((a, b) => a.sort_order - b.sort_order)
      const imageUrls = sortedImages.map((row) => resolveListingImageUrl(row.image_url || '', '')).filter(Boolean)
      const categoryName = Array.isArray(post.categories)
        ? post.categories[0]?.name || 'General'
        : post.categories?.name || 'General'
      return {
        id: post.id,
        user_id: post.user_id,
        title: post.title,
        description: post.description || '',
        price: Number(post.price || 0),
        category_id: post.category_id,
        category_name: categoryName,
        condition: post.condition || 'used',
        location: post.location || '',
        is_available: Boolean(post.is_available),
        is_negotiable: Boolean(post.is_negotiable),
        created_at: post.created_at,
        likes_count: likesByPostId[post.id] || 0,
        comments_count: commentsByPostId[post.id] || 0,
        images: imageUrls.length ? imageUrls : ['/placeholders/listing-home.svg'],
        user: nextUser,
      }
    })

    setLiveUser(nextUser)
    setLivePosts(nextPosts)
    setIsFollowing(Boolean(nextUser.is_following))
    setTargetUserId(!isMyProfileRoute ? profileRow.id : '')
    setLoadingLiveProfile(false)
  }, [authUser?.id, authUser?.user_metadata, isMyProfileRoute, normalizedAuthUsername, username])

  useEffect(() => {
    refreshLiveProfile()
  }, [refreshLiveProfile])

  useEffect(() => {
    if (!isSupabaseConfigured || !isUuid(user?.id)) return undefined
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return undefined

    const channel = supabase
      .channel(`profile-live:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts', filter: `user_id=eq.${user.id}` }, refreshLiveProfile)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'followers', filter: `following_id=eq.${user.id}` },
        refreshLiveProfile,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'followers', filter: `follower_id=eq.${user.id}` },
        refreshLiveProfile,
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users', filter: `id=eq.${user.id}` }, refreshLiveProfile)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [refreshLiveProfile, user?.id])

  useEffect(() => {
    setIsFollowing(Boolean(user?.is_following))
  }, [user?.is_following])

  useEffect(() => {
    if (!isSupabaseConfigured || !isUuid(user?.id)) {
      setIsUserOnline(Boolean(isMyProfileRoute && authUser?.id))
      return undefined
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setIsUserOnline(Boolean(isMyProfileRoute && authUser?.id))
      return undefined
    }

    const currentUserId = String(authUser?.id || '')
    const targetUserId = String(user.id || '')
    const presenceKey = currentUserId || `guest-${Math.random().toString(36).slice(2, 10)}`
    const isViewingOwnProfile = Boolean(isMyProfileRoute && currentUserId && currentUserId === targetUserId)

    // Do not wait for presence sync to mark your own profile online.
    if (isViewingOwnProfile) {
      setIsUserOnline(true)
    }

    const channel = supabase
      .channel('online-users', { config: { presence: { key: presenceKey } } })
      .on('presence', { event: 'sync' }, () => {
        if (isViewingOwnProfile) {
          setIsUserOnline(true)
          return
        }
        const presenceState = channel.presenceState()
        const targetIsOnline = Boolean(presenceState[targetUserId]?.length)
        setIsUserOnline(targetIsOnline)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && currentUserId) {
          channel.track({ user_id: currentUserId, online_at: new Date().toISOString() })
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [authUser?.id, isMyProfileRoute, user?.id])

  useEffect(() => {
    if (isMyProfileRoute && localProfilePictureKey) {
      try {
        const localPicture = window.localStorage.getItem(localProfilePictureKey)
        if (localPicture) {
          setAvatarOverrideUrl(localPicture)
          return
        }
      } catch {
        // Ignore localStorage failures and continue with remote value.
      }
    }

    setAvatarOverrideUrl(userProfilePicture)
  }, [isMyProfileRoute, localProfilePictureKey, userProfilePicture, username])

  useEffect(() => {
    setDeletedPostIds([])
    setDeleteFeedback('')
    setDeletePendingPostId('')
    setDeleteAllPending(false)
    setEditingPostId('')
    setEditPending(false)
    setEditFeedback('')
    setEditForm(buildPostEditForm(null))
    setActiveRelationList('')
    setRelationPendingUserId('')
    setRelationFeedback('')
    setFollowerUsers([])
    setFollowingUsers([])
    setRelationUsersLoading(false)
  }, [username])

  const blockStorageKey = useMemo(() => {
    if (!authUser?.id || !username) return ''
    return `velvora:block:${authUser.id}:${username.toLowerCase()}`
  }, [authUser?.id, username])
  const reportsStorageKey = useMemo(() => {
    if (!authUser?.id) return ''
    return `velvora:reports:${authUser.id}`
  }, [authUser?.id])

  useEffect(() => {
    let cancelled = false

    async function loadSelfApprovedTier() {
      if (!isMyProfileRoute || !authUser?.id || !isSupabaseConfigured) {
        setSelfApprovedTier('none')
        return
      }

      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        setSelfApprovedTier('none')
        return
      }

      const { data } = await supabase
        .from('kyc_verifications')
        .select('tier_requested')
        .eq('user_id', authUser.id)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cancelled) return
      setSelfApprovedTier(normalizeVerificationTier(data?.tier_requested))
    }

    loadSelfApprovedTier()
    return () => {
      cancelled = true
    }
  }, [authUser?.id, isMyProfileRoute])

  useEffect(() => {
    if (!blockStorageKey || isMyProfileRoute) {
      setIsBlocked(false)
      return
    }

    try {
      const raw = window.localStorage.getItem(blockStorageKey)
      const parsed = raw ? JSON.parse(raw) : null
      setIsBlocked(Boolean(parsed?.blocked))
    } catch {
      setIsBlocked(false)
    }
  }, [blockStorageKey, isMyProfileRoute])

  useEffect(() => {
    if (!user || isMyProfileRoute || !authUser?.id) {
      setTargetUserId('')
      return
    }

    let cancelled = false

    async function resolveTargetUserId() {
      const directId = String(user.id || '')

      if (uuidPattern.test(directId)) {
        if (!cancelled) setTargetUserId(directId)
        return
      }

      if (!isSupabaseConfigured) {
        if (!cancelled) setTargetUserId('')
        return
      }

      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        if (!cancelled) setTargetUserId('')
        return
      }

      const { data, error } = await supabase.from('users').select('id').eq('username', user.username).maybeSingle()
      if (cancelled) return

      if (!error && data?.id) {
        setTargetUserId(data.id)
      } else {
        setTargetUserId('')
      }
    }

    resolveTargetUserId()
    return () => {
      cancelled = true
    }
  }, [user, isMyProfileRoute, authUser?.id])

  useEffect(() => {
    if (isMyProfileRoute || !authUser?.id || !targetUserId || !isSupabaseConfigured) {
      setMessageRequestStatus('none')
      setMessageRequestConversationId('')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setMessageRequestStatus('none')
      setMessageRequestConversationId('')
      return
    }

    let cancelled = false

    async function loadMessageRequestStatus() {
      const { data, error } = await supabase
        .from('message_requests')
        .select('status, conversation_id')
        .eq('requester_id', authUser.id)
        .eq('target_user_id', targetUserId)
        .maybeSingle()

      if (cancelled) return

      if (error) {
        if (isMissingTableError(error, 'message_requests')) {
          setMessageRequestStatus('none')
          setMessageRequestConversationId('')
          return
        }
        setRequestFeedback(error.message || 'Failed to load message request status.')
        return
      }

      const nextStatus = data?.status === 'accepted' || data?.status === 'pending' || data?.status === 'rejected' ? data.status : 'none'
      setMessageRequestStatus(nextStatus)
      setMessageRequestConversationId(data?.conversation_id || '')
    }

    loadMessageRequestStatus()

    const channel = supabase
      .channel(`profile-message-request:${authUser.id}:${targetUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_requests',
          filter: `requester_id=eq.${authUser.id}`,
        },
        loadMessageRequestStatus,
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [authUser?.id, isMyProfileRoute, targetUserId])

  useEffect(() => {
    if (isMyProfileRoute || !authUser?.id) return
    if (!isSupabaseConfigured || !targetUserId) return

    let cancelled = false

    async function syncBlockedStatus() {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return

      const { data } = await supabase
        .from('blocked_users')
        .select('id')
        .eq('blocker_id', authUser.id)
        .eq('blocked_id', targetUserId)
        .limit(1)

      if (cancelled) return
      if (data?.length) setIsBlocked(true)
    }

    syncBlockedStatus()
    return () => {
      cancelled = true
    }
  }, [isMyProfileRoute, authUser?.id, targetUserId])

  if (loadingLiveProfile && !user) {
    return (
      <section className="surface mx-auto w-full max-w-xl p-6 text-center">
        <h1 className="font-brand text-2xl font-semibold">Loading profile...</h1>
      </section>
    )
  }

  if (!user) {
    return (
      <section className="surface mx-auto w-full max-w-xl p-6 text-center">
        <h1 className="font-brand text-2xl font-semibold">{t('profile.not_found_title')}</h1>
        <p className="mt-2 text-sm text-muted">{t('profile.not_found_subtitle')}</p>
        <Link to="/" className="btn-primary mt-4">
          {t('profile.back_to_feed')}
        </Link>
      </section>
    )
  }

  const filteredPosts = userPosts.filter((post) => {
    if (deletedPostIds.includes(post.id)) return false
    return statusFilter === 'available' ? post.is_available : !post.is_available
  })

  const totalValue = filteredPosts.reduce(
    (sum, post) => sum + convertToViewerCurrency(post.price, viewerLocation, post.location),
    0,
  )
  const showFollowBack = Boolean(user.follows_you) && !isFollowing
  const canMessageDirectly = !isBlocked && isFollowing && Boolean(user.follows_you)
  const canMessageByAcceptedRequest = messageRequestStatus === 'accepted'
  const canOpenMessage = !isBlocked && (canMessageDirectly || canMessageByAcceptedRequest)
  const hasRequestConversation = Boolean(messageRequestConversationId)
  const requestChatHref = `/messages?user=${encodeURIComponent(user.username)}`
  const verificationTier = normalizeVerificationTier(user.verification_tier, user.is_verified)
  const verificationLabel =
    verificationTier === 'enhanced' ? 'Verified Pro seller' : verificationTier === 'basic' ? 'Verified seller' : 'Unverified seller'
  const unverifiedListingCount = userPosts.filter((post) => post.is_available).length
  const profileAvatar = resolveProfilePictureUrl(avatarOverrideUrl || userProfilePicture)
  const reportReasonOptions = [
    { value: 'scam', label: 'Scam or fraud' },
    { value: 'rules_violation', label: 'Not following community rules' },
    { value: 'impersonation', label: 'Impersonation' },
  ]
  const relationUsers = activeRelationList === 'followers' ? followerUsers : followingUsers
  const relationListTitle = activeRelationList === 'followers' ? 'Followers' : 'Following'

  async function handleMessageRequest() {
    if (isOwnProfile || isBlocked) return
    if (!canInteract) {
      setRequestFeedback('Sign in to send a message request.')
      return
    }

    if (!isSupabaseConfigured || !targetUserId) {
      setRequestFeedback('Message requests are unavailable right now.')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setRequestFeedback('Unable to connect right now. Try again.')
      return
    }

    setRequestFeedback('')

    const { data, error } = await supabase.rpc('create_message_request', {
      target_user_id_input: targetUserId,
      request_text: null,
    })

    if (error) {
      setRequestFeedback(
        isMissingTableError(error, 'message_requests') || isMissingFunctionError(error, 'create_message_request')
          ? 'Message requests are not enabled yet. Run supabase/message_requests_notifications.sql and refresh.'
          : error.message || 'Failed to send message request.',
      )
      return
    }

    const responseRow = Array.isArray(data) ? data[0] : data
    const nextStatus = responseRow?.status || 'pending'
    setMessageRequestStatus(nextStatus)
    setMessageRequestConversationId(responseRow?.conversation_id || '')

    setRequestFeedback(
      nextStatus === 'accepted'
        ? 'Message request accepted. You can now message this profile.'
        : 'Message request sent. Open chat to track request status.',
    )
  }

  async function handleFollowToggle() {
    if (isOwnProfile || isBlocked) return
    if (!canInteract) {
      setFollowFeedback('Sign in to follow this profile.')
      return
    }
    setFollowFeedback('')

    let resolvedTargetUserId = targetUserId
    if (!isUuid(resolvedTargetUserId) && isSupabaseConfigured && user?.username) {
      const supabase = getSupabaseBrowserClient()
      if (supabase) {
        const { data } = await supabase.from('users').select('id').eq('username', user.username).maybeSingle()
        if (data?.id) {
          resolvedTargetUserId = data.id
          setTargetUserId(data.id)
        }
      }
    }

    if (!isUuid(resolvedTargetUserId)) {
      setFollowFeedback('Unable to follow this profile right now. Refresh and try again.')
      return
    }

    if (!isSupabaseConfigured || !authUser?.id) {
      setFollowFeedback('Unable to sync follow status right now. Check your Supabase setup.')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setFollowFeedback('Unable to connect to Supabase right now.')
      return
    }

    const nextIsFollowing = !isFollowing

    if (nextIsFollowing) {
      const { error } = await supabase.from('followers').insert({
        follower_id: authUser.id,
        following_id: resolvedTargetUserId,
      })

      if (error && error.code !== '23505') {
        setFollowFeedback(
          isMissingTableError(error, 'followers')
            ? 'Followers table is missing. Run supabase/social_sync_fix.sql in Supabase SQL Editor, then refresh.'
            : error.message || 'Failed to follow this profile.',
        )
        return
      }
    } else {
      const { error } = await supabase
        .from('followers')
        .delete()
        .eq('follower_id', authUser.id)
        .eq('following_id', resolvedTargetUserId)

      if (error) {
        setFollowFeedback(
          isMissingTableError(error, 'followers')
            ? 'Followers table is missing. Run supabase/social_sync_fix.sql in Supabase SQL Editor, then refresh.'
            : error.message || 'Failed to unfollow this profile.',
        )
        return
      }
    }

    setIsFollowing(nextIsFollowing)
    setLiveUser((currentUser) => {
      if (!currentUser) return currentUser
      const nextFollowers = Math.max(0, Number(currentUser.followers || 0) + (nextIsFollowing ? 1 : -1))
      return { ...currentUser, followers: nextFollowers, is_following: nextIsFollowing }
    })
    setFollowFeedback('Following updated.')
    refreshLiveProfile()
  }

  async function loadRelationUsers(listType) {
    if (!isUuid(user?.id) || !isSupabaseConfigured) {
      if (listType === 'followers') setFollowerUsers([])
      if (listType === 'following') setFollowingUsers([])
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      if (listType === 'followers') setFollowerUsers([])
      if (listType === 'following') setFollowingUsers([])
      return
    }

    setRelationUsersLoading(true)

    const relationSelectField = listType === 'followers' ? 'follower_id' : 'following_id'
    const relationFilterField = listType === 'followers' ? 'following_id' : 'follower_id'
    const { data: relationRows, error: relationRowsError } = await supabase
      .from('followers')
      .select(relationSelectField)
      .eq(relationFilterField, user.id)
      .order('created_at', { ascending: false })
      .limit(200)

    if (relationRowsError) {
      setRelationUsersLoading(false)
      setRelationFeedback(
        isMissingTableError(relationRowsError, 'followers')
          ? 'Followers list is unavailable. Run supabase/social_sync_fix.sql and refresh.'
          : relationRowsError.message || 'Failed to load relation list.',
      )
      return
    }

    const relationIds = Array.from(new Set((relationRows || []).map((row) => row[relationSelectField]).filter(Boolean)))
    if (!relationIds.length) {
      if (listType === 'followers') setFollowerUsers([])
      if (listType === 'following') setFollowingUsers([])
      setRelationUsersLoading(false)
      return
    }

    const { data: relationUsersRows, error: relationUsersError } = await runWithMissingColumnFallback(
      () =>
        supabase
          .from('users')
          .select(RELATION_USER_SELECT)
          .in('id', relationIds),
      () =>
        supabase
          .from('users')
          .select(RELATION_USER_SELECT_FALLBACK)
          .in('id', relationIds),
    )

    if (relationUsersError) {
      setRelationUsersLoading(false)
      setRelationFeedback(relationUsersError.message || 'Failed to load relation user profiles.')
      return
    }

    const relationUsersById = new Map((relationUsersRows || []).map((row) => [row.id, row]))
    const nextRelationUsers = relationIds.map((id) => {
      const relationUserRow = relationUsersById.get(id) || {}
      const resolvedProfilePicture = resolveProfilePictureUrl(relationUserRow.profile_picture_url || '', '')
      const resolvedAvatar = resolveProfilePictureUrl(relationUserRow.avatar_url || '', '')
      const finalProfilePicture = resolvedProfilePicture || resolvedAvatar
      return {
        id,
        username: relationUserRow.username || `user_${String(id || '').slice(0, 8)}`,
        full_name: relationUserRow.full_name || relationUserRow.username || 'Marketplace user',
        profile_picture_url: finalProfilePicture,
        avatar_url: resolvedAvatar || finalProfilePicture,
        is_verified: Boolean(relationUserRow.is_verified),
        verification_tier: normalizeVerificationTier(relationUserRow.verification_tier, relationUserRow.is_verified),
      }
    })

    if (listType === 'followers') setFollowerUsers(nextRelationUsers)
    if (listType === 'following') setFollowingUsers(nextRelationUsers)
    setRelationUsersLoading(false)
  }

  function handleRelationListToggle(listType) {
    setRelationFeedback('')
    const isOpening = activeRelationList !== listType
    setActiveRelationList(isOpening ? listType : '')
    if (isOpening) {
      loadRelationUsers(listType)
    }
  }

  function handleStartEditPost(post) {
    if (!isOwnProfile || !post?.id || deletePendingPostId || deleteAllPending || editPending) return
    setEditFeedback('')
    setEditingPostId(post.id)
    setEditForm(buildPostEditForm(post))
  }

  function handleCancelEditPost() {
    if (editPending) return
    setEditingPostId('')
    setEditFeedback('')
    setEditForm(buildPostEditForm(null))
  }

  function updateEditValue(key, value) {
    setEditForm((currentForm) => ({ ...currentForm, [key]: value }))
  }

  async function handleEditPostSubmit(event) {
    event.preventDefault()
    if (!isOwnProfile || !editingPostId) return

    const nextTitle = editForm.title.trim()
    const nextDescription = editForm.description.trim()
    const nextLocation = editForm.location.trim()
    const parsedPrice = Number(editForm.price)
    const nextCondition = editForm.condition === 'new' ? 'new' : 'used'

    if (!nextTitle || !nextDescription || !nextLocation) {
      setEditFeedback('Title, description, and location are required.')
      return
    }

    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setEditFeedback('Price must be a valid number greater than or equal to 0.')
      return
    }

    setEditPending(true)
    setEditFeedback('')

    const payload = {
      title: nextTitle,
      description: nextDescription,
      price: parsedPrice,
      location: nextLocation,
      condition: nextCondition,
      is_available: Boolean(editForm.is_available),
      is_negotiable: Boolean(editForm.is_negotiable),
    }

    if (!isSupabaseConfigured || !authUser?.id || !isUuid(editingPostId)) {
      setLivePosts((currentPosts) =>
        currentPosts.map((post) => (post.id === editingPostId ? { ...post, ...payload } : post)),
      )
      setEditPending(false)
      setEditingPostId('')
      setEditForm(buildPostEditForm(null))
      setEditFeedback('Post updated locally in demo mode.')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setEditPending(false)
      setEditFeedback('Unable to connect to Supabase right now.')
      return
    }

    const { error } = await supabase
      .from('posts')
      .update(payload)
      .eq('id', editingPostId)
      .eq('user_id', authUser.id)

    setEditPending(false)

    if (error) {
      setEditFeedback(error.message || 'Failed to update post.')
      return
    }

    setLivePosts((currentPosts) =>
      currentPosts.map((post) => (post.id === editingPostId ? { ...post, ...payload } : post)),
    )
    setEditingPostId('')
    setEditForm(buildPostEditForm(null))
    setEditFeedback('Post updated successfully.')
    refreshLiveProfile()
  }

  function markPostDeletedLocally(postId) {
    setDeletedPostIds((currentIds) => (currentIds.includes(postId) ? currentIds : [...currentIds, postId]))
    setLivePosts((currentPosts) => currentPosts.filter((post) => post.id !== postId))
  }

  function markAllPostsDeletedLocally(postIds) {
    if (!postIds.length) return
    setDeletedPostIds((currentIds) => Array.from(new Set([...currentIds, ...postIds])))
    setLivePosts((currentPosts) => currentPosts.filter((post) => !postIds.includes(post.id)))
  }

  async function handleDeletePost(postId) {
    if (!isOwnProfile || !postId || deletePendingPostId || deleteAllPending || editPending) return

    const confirmed = window.confirm('Delete this post permanently?')
    if (!confirmed) return

    setDeletePendingPostId(postId)
    setDeleteFeedback('')

    if (!isSupabaseConfigured || !isUuid(postId) || !authUser?.id) {
      markPostDeletedLocally(postId)
      setDeletePendingPostId('')
      setDeleteFeedback('Post deleted locally in demo mode.')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setDeletePendingPostId('')
      setDeleteFeedback('Unable to connect to Supabase right now.')
      return
    }

    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)
      .eq('user_id', authUser.id)

    setDeletePendingPostId('')

    if (error) {
      setDeleteFeedback(error.message || 'Failed to delete post.')
      return
    }

    markPostDeletedLocally(postId)
    setDeleteFeedback('Post deleted successfully.')
    refreshLiveProfile()
  }

  async function handleDeleteAllPosts() {
    if (!isOwnProfile || deletePendingPostId || deleteAllPending || editPending) return

    const allPostIds = userPosts.map((post) => post.id).filter(Boolean)
    if (!allPostIds.length) {
      setDeleteFeedback('No posts to delete.')
      return
    }

    const confirmed = window.confirm('Delete ALL your posts permanently? This cannot be undone.')
    if (!confirmed) return

    setDeleteAllPending(true)
    setDeleteFeedback('')

    if (!isSupabaseConfigured || !authUser?.id || !allPostIds.every((postId) => isUuid(postId))) {
      markAllPostsDeletedLocally(allPostIds)
      setDeleteAllPending(false)
      setDeleteFeedback('All posts deleted locally in demo mode.')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setDeleteAllPending(false)
      setDeleteFeedback('Unable to connect to Supabase right now.')
      return
    }

    const { error } = await supabase.from('posts').delete().eq('user_id', authUser.id)
    setDeleteAllPending(false)

    if (error) {
      setDeleteFeedback(error.message || 'Failed to delete all posts.')
      return
    }

    markAllPostsDeletedLocally(allPostIds)
    setDeleteFeedback('All posts deleted successfully.')
    refreshLiveProfile()
  }

  function persistBlockedLocally(blocked) {
    if (!blockStorageKey) return

    try {
      window.localStorage.setItem(
        blockStorageKey,
        JSON.stringify({
          blocked,
          username: user.username,
          updated_at: new Date().toISOString(),
        }),
      )
    } catch {
      // Ignore localStorage errors and keep in-memory state.
    }
  }

  function persistReportLocally(reasonText) {
    if (!reportsStorageKey) return

    try {
      const raw = window.localStorage.getItem(reportsStorageKey)
      const current = raw ? JSON.parse(raw) : []
      const next = Array.isArray(current) ? current : []
      next.push({
        username: user.username,
        reason: reasonText,
        created_at: new Date().toISOString(),
      })
      window.localStorage.setItem(reportsStorageKey, JSON.stringify(next))
    } catch {
      // Ignore localStorage errors and keep in-memory feedback.
    }
  }

  async function handleBlockUser() {
    if (isOwnProfile || isBlocked || !authUser?.id) return

    setBlockPending(true)
    setBlockFeedback('')

    if (!isSupabaseConfigured || !targetUserId) {
      setIsBlocked(true)
      persistBlockedLocally(true)
      setBlockPending(false)
      setBlockFeedback('User blocked locally in demo mode.')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setBlockPending(false)
      setBlockFeedback('Unable to connect to Supabase right now.')
      return
    }

    const { error } = await supabase.from('blocked_users').insert({
      blocker_id: authUser.id,
      blocked_id: targetUserId,
    })

    setBlockPending(false)

    if (error) {
      if (error.code === '23505') {
        setIsBlocked(true)
        persistBlockedLocally(true)
        setBlockFeedback('This user is already blocked.')
        return
      }

      setBlockFeedback(error.message || 'Failed to block this user.')
      return
    }

    setIsBlocked(true)
    persistBlockedLocally(true)
    setBlockFeedback('User blocked successfully.')
  }

  async function handleReportUser() {
    if (isOwnProfile || !authUser?.id) return

    const selectedReason = reportReasonOptions.find((option) => option.value === reportReason)
    const reasonText = selectedReason?.label || 'User reported'

    setReportPending(true)
    setReportFeedback('')

    if (!isSupabaseConfigured || !targetUserId) {
      persistReportLocally(reasonText)
      setReportPending(false)
      setReportFeedback('Report saved locally in demo mode.')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setReportPending(false)
      setReportFeedback('Unable to connect to Supabase right now.')
      return
    }

    const { error } = await supabase.from('reports').insert({
      reported_by: authUser.id,
      user_id: targetUserId,
      reason: reasonText,
    })

    setReportPending(false)

    if (error) {
      setReportFeedback(error.message || 'Failed to submit report.')
      return
    }

    persistReportLocally(reasonText)
    setReportFeedback('Report submitted. Our moderation team will review it.')
  }

  async function handleAvatarUpload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return
    if (!isOwnProfile) return

    if (!isSupabaseConfigured) {
      setAvatarFeedback('Configure Supabase first to upload a profile picture.')
      return
    }

    if (!file.type.startsWith('image/')) {
      setAvatarFeedback('Please select an image file.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setAvatarFeedback('Image is too large. Max size is 5MB.')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase || !authUser?.id) {
      setAvatarFeedback('Sign in again before uploading your profile picture.')
      return
    }

    setAvatarUploading(true)
    setAvatarFeedback('')

    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const filePath = `${authUser.id}/${Date.now()}.${extension}`

    let uploadedBucket = ''
    let uploadError = null

    for (const bucket of PROFILE_PICTURE_BUCKET_CANDIDATES) {
      const { error } = await supabase.storage.from(bucket).upload(filePath, file, {
        upsert: true,
        contentType: file.type,
      })

      if (!error) {
        uploadedBucket = bucket
        break
      }

      uploadError = error
      const message = String(error.message || '').toLowerCase()
      const isBucketMissing = message.includes('bucket not found')
      const isRlsPolicyError =
        message.includes('row-level security') ||
        message.includes('violates row-level security') ||
        message.includes('new row violates')

      // Keep trying fallback buckets if one bucket is missing or has policy mismatch.
      if (!isBucketMissing && !isRlsPolicyError) break
    }

    if (!uploadedBucket) {
      setAvatarUploading(false)
      const details = uploadError?.message ? ` (${uploadError.message})` : ''
      setAvatarFeedback(
        `Profile picture upload failed${details}. Ensure your profile pictures bucket exists and run supabase/storage_avatars.sql. The image was not saved globally.`,
      )
      return
    }

    const { data: publicData } = supabase.storage.from(uploadedBucket).getPublicUrl(filePath)
    const nextProfilePictureUrl = publicData.publicUrl

    const pictureUpdatePayload = {
      profile_picture_url: nextProfilePictureUrl,
      avatar_url: nextProfilePictureUrl,
    }
    const pictureUpdateFallbackPayload = { avatar_url: nextProfilePictureUrl }
    const updateResult = await runWithMissingColumnFallback(
      () =>
        supabase
          .from('users')
          .update(pictureUpdatePayload)
          .eq('id', authUser.id)
          .select('id')
          .maybeSingle(),
      () =>
        supabase
          .from('users')
          .update(pictureUpdateFallbackPayload)
          .eq('id', authUser.id)
          .select('id')
          .maybeSingle(),
    )

    let profileUpdateError = updateResult.error || null

    // If user row is missing, create it with a guaranteed-unique fallback username.
    if (!profileUpdateError && !updateResult.data) {
      const baseUsername = String(user?.username || authUser?.user_metadata?.username || '')
        .trim()
        .replace(/\s+/g, '')
        .slice(0, 30)
      const uniqueFallbackUsername = `user_${String(authUser.id || '').slice(0, 8)}`
      const usernameToUse = baseUsername || uniqueFallbackUsername
      const insertPayload = {
        id: authUser.id,
        username: usernameToUse,
        full_name: String(user?.full_name || authUser?.user_metadata?.full_name || '').trim(),
        bio: String(user?.bio || '').trim(),
        country: String(user?.country || authUser?.user_metadata?.country || 'Nigeria').trim() || 'Nigeria',
        email: authUser?.email || null,
        phone_number: authUser?.phone || null,
        profile_picture_url: nextProfilePictureUrl,
        avatar_url: nextProfilePictureUrl,
      }

      const insertResult = await runWithMissingColumnFallback(
        () => supabase.from('users').upsert(insertPayload, { onConflict: 'id' }),
        () => {
          const fallbackPayload = { ...insertPayload }
          delete fallbackPayload.profile_picture_url
          return supabase.from('users').upsert(fallbackPayload, { onConflict: 'id' })
        },
      )
      profileUpdateError = insertResult.error || null
    }

    setAvatarUploading(false)

    if (profileUpdateError) {
      setAvatarFeedback('Profile picture uploaded but profile update failed. Refresh and try again.')
      return
    }

    setAvatarOverrideUrl(nextProfilePictureUrl)
    if (localProfilePictureKey) {
      try {
        window.localStorage.removeItem(localProfilePictureKey)
      } catch {
        // Ignore localStorage cleanup failures.
      }
    }
    setAvatarFeedback('Profile picture updated successfully.')
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <section className="surface p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <img
            src={profileAvatar}
            alt={user.full_name}
            className="h-24 w-24 rounded-2xl object-cover ring-2 ring-accent/20"
            onError={(event) => {
              event.currentTarget.src = '/placeholders/avatar-anya.svg'
            }}
          />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-brand text-3xl font-semibold text-ink">{user.full_name}</h1>
              <VerifiedBadge tier={verificationTier} className="text-[11px]" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-muted">@{user.username}</p>
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${isUserOnline ? 'bg-emerald-500' : 'bg-line'}`} />
              <p className="text-xs text-muted">{isUserOnline ? 'Online' : 'Offline'}</p>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted">{user.bio}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              <span className="pill">{user.country}</span>
              <span
                className={
                  verificationTier === 'none'
                    ? 'rounded-full bg-line px-2.5 py-1 text-xs font-semibold text-muted'
                    : 'rounded-full bg-[#fff7da] px-2.5 py-1 text-xs font-semibold text-[#8a6a00] ring-1 ring-[#e0c15a]'
                }
              >
                {verificationLabel}
              </span>
            </div>
            {verificationTier === 'none' ? (
              <p className="mt-2 text-xs text-muted">
                Unverified accounts can keep up to 3 active listings. Current active listings: {unverifiedListingCount}.
              </p>
            ) : null}
            {isOwnProfile ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="btn-muted cursor-pointer">
                  {avatarUploading ? 'Uploading...' : 'Change profile picture'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={avatarUploading}
                    onChange={handleAvatarUpload}
                  />
                </label>
                {avatarFeedback ? <p className="w-full text-xs text-muted">{avatarFeedback}</p> : null}
              </div>
            ) : null}
            {!isOwnProfile ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleFollowToggle}
                  disabled={isBlocked}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    isFollowing
                      ? 'border border-line bg-white text-ink hover:border-accent'
                      : 'bg-accent text-white hover:bg-accentStrong'
                  } ${isBlocked ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  {isBlocked
                    ? 'Blocked'
                    : !canInteract
                      ? 'Sign in to follow'
                      : isFollowing
                        ? 'Following'
                        : showFollowBack
                          ? 'Follow back'
                          : 'Follow'}
                </button>

                {isBlocked ? (
                  <button type="button" className="btn-muted" disabled>
                    Messaging disabled
                  </button>
                ) : canOpenMessage ? (
                  <Link to={requestChatHref} className="btn-muted">
                    Message
                  </Link>
                ) : messageRequestStatus === 'pending' ? (
                  hasRequestConversation ? (
                    <Link to={requestChatHref} className="btn-muted">
                      Open request chat
                    </Link>
                  ) : (
                    <button type="button" className="btn-muted" disabled>
                      Request pending
                    </button>
                  )
                ) : (
                  <button type="button" className="btn-muted" onClick={handleMessageRequest}>
                    {canInteract ? 'Send message request' : 'Sign in to message'}
                  </button>
                )}

                {requestFeedback ? <p className="w-full text-xs text-muted">{requestFeedback}</p> : null}
                {followFeedback ? <p className="w-full text-xs text-muted">{followFeedback}</p> : null}
                {!canOpenMessage && !requestFeedback ? (
                  <p className="w-full text-xs text-muted">
                    Direct messaging unlocks when they follow back or accept your message request.
                  </p>
                ) : null}

                <div className="mt-2 grid w-full gap-2 sm:grid-cols-[minmax(0,1fr),auto,auto]">
                  <select
                    className="input"
                    value={reportReason}
                    onChange={(event) => setReportReason(event.target.value)}
                  >
                    {reportReasonOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn-muted"
                    onClick={handleReportUser}
                    disabled={reportPending}
                  >
                    {reportPending ? 'Reporting...' : 'Report user'}
                  </button>
                  <button
                    type="button"
                    className="btn-muted"
                    onClick={handleBlockUser}
                    disabled={blockPending || isBlocked}
                  >
                    {blockPending ? 'Blocking...' : isBlocked ? 'Blocked' : 'Block user'}
                  </button>
                </div>

                {reportFeedback ? <p className="w-full text-xs text-muted">{reportFeedback}</p> : null}
                {blockFeedback ? <p className="w-full text-xs text-muted">{blockFeedback}</p> : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="surface p-4">
          <button
            type="button"
            className="w-full text-left"
            onClick={() => handleRelationListToggle('followers')}
          >
            <p className="text-sm text-muted">Followers</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{user.followers.toLocaleString()}</p>
            <p className="mt-1 text-xs text-muted">Tap to view</p>
          </button>
        </article>
        <article className="surface p-4">
          <button
            type="button"
            className="w-full text-left"
            onClick={() => handleRelationListToggle('following')}
          >
            <p className="text-sm text-muted">Following</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{user.following.toLocaleString()}</p>
            <p className="mt-1 text-xs text-muted">Tap to view</p>
          </button>
        </article>
        <article className="surface p-4">
          <p className="text-sm text-muted">Filtered value</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {formatMoneyForViewer(totalValue, viewerLocation, viewerLocation)}
          </p>
        </article>
      </section>

      {activeRelationList ? (
        <section className="surface p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-ink">{relationListTitle}</h2>
            <button
              type="button"
              className="btn-muted"
              onClick={() => setActiveRelationList('')}
            >
              Close
            </button>
          </div>

          {relationUsersLoading ? (
            <p className="text-sm text-muted">Loading users...</p>
          ) : relationUsers.length ? (
            <div className="grid gap-2">
              {relationUsers.map((relationUser) => (
                <Link
                  key={relationUser.id}
                  to={buildProfilePath(relationUser)}
                  className="flex items-center gap-3 rounded-xl border border-line bg-white p-3 transition hover:border-accent"
                >
                  <img
                    src={resolveProfilePictureUrl(getProfilePictureValue(relationUser))}
                    alt={relationUser.full_name}
                    className="h-10 w-10 rounded-full object-cover"
                    onError={(event) => {
                      event.currentTarget.src = '/placeholders/avatar-anya.svg'
                    }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="truncate text-sm font-semibold text-ink">{relationUser.full_name}</p>
                      <VerifiedBadge
                        tier={normalizeVerificationTier(relationUser.verification_tier, relationUser.is_verified)}
                      />
                    </div>
                    <p className="truncate text-xs text-muted">@{relationUser.username}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No users found in this list yet.</p>
          )}
          {relationFeedback ? <p className="mt-2 text-xs text-muted">{relationFeedback}</p> : null}
        </section>
      ) : null}

      <section className="surface p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">Posts</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-line bg-white p-1">
              <button
                type="button"
                onClick={() => setStatusFilter('available')}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  statusFilter === 'available' ? 'bg-accent text-white' : 'text-muted'
                }`}
              >
                Available
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('sold')}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  statusFilter === 'sold' ? 'bg-accent text-white' : 'text-muted'
                }`}
              >
                Sold
              </button>
            </div>
            {isOwnProfile ? (
              <button
                type="button"
                className="btn-muted"
                onClick={handleDeleteAllPosts}
                disabled={deleteAllPending || Boolean(deletePendingPostId) || Boolean(editingPostId) || !userPosts.length}
              >
                {deleteAllPending ? 'Deleting all...' : 'Delete all posts'}
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {filteredPosts.map((post) => (
            <article key={post.id} className="overflow-hidden rounded-2xl border border-line bg-white">
              <img
                src={post.images[0] || '/placeholders/listing-home.svg'}
                alt={post.title}
                className="h-44 w-full object-cover"
                onError={(event) => {
                  const alternateImage = (post.images || []).find(
                    (candidate) => candidate && candidate !== event.currentTarget.currentSrc && candidate !== event.currentTarget.src,
                  )
                  if (alternateImage) {
                    event.currentTarget.src = alternateImage
                    return
                  }
                  event.currentTarget.src = '/placeholders/listing-home.svg'
                }}
              />
              <div className="space-y-2 p-3">
                <p className="font-semibold text-ink">{post.title}</p>
                <p className="text-sm text-muted">{post.location}</p>
                <div className="flex items-center justify-between">
                  <span className="pill">{post.condition.toUpperCase()}</span>
                  <span className="text-sm font-semibold text-accentStrong">
                    {formatMoneyForViewer(post.price, viewerLocation, post.location)}
                  </span>
                </div>
                {isOwnProfile ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="btn-muted w-full"
                      onClick={() => handleStartEditPost(post)}
                      disabled={
                        editPending ||
                        deletePendingPostId === post.id ||
                        deleteAllPending ||
                        (Boolean(editingPostId) && editingPostId !== post.id)
                      }
                    >
                      {editingPostId === post.id ? 'Editing...' : 'Edit post'}
                    </button>
                    <button
                      type="button"
                      className="btn-muted w-full"
                      onClick={() => handleDeletePost(post.id)}
                      disabled={deletePendingPostId === post.id || editPending || Boolean(editingPostId)}
                    >
                      {deletePendingPostId === post.id ? 'Deleting...' : 'Delete post'}
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>

        {editFeedback ? <p className="mt-4 text-sm text-muted">{editFeedback}</p> : null}
        {deleteFeedback ? <p className="mt-1 text-sm text-muted">{deleteFeedback}</p> : null}
        {!filteredPosts.length ? <p className="mt-4 text-sm text-muted">No posts in this status yet.</p> : null}
      </section>

      {isOwnProfile && editingPostId ? (
        <section className="surface p-5">
          <h2 className="text-lg font-semibold text-ink">Edit Post</h2>
          <form onSubmit={handleEditPostSubmit} className="mt-3 space-y-3">
            <input
              className="input"
              value={editForm.title}
              onChange={(event) => updateEditValue('title', event.target.value)}
              placeholder="Title"
              required
            />
            <textarea
              className="input min-h-24"
              value={editForm.description}
              onChange={(event) => updateEditValue('description', event.target.value)}
              placeholder="Description"
              required
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={editForm.price}
                onChange={(event) => updateEditValue('price', event.target.value)}
                placeholder="Price"
                required
              />
              <input
                className="input"
                value={editForm.location}
                onChange={(event) => updateEditValue('location', event.target.value)}
                placeholder="Location"
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                className="input"
                value={editForm.condition}
                onChange={(event) => updateEditValue('condition', event.target.value)}
              >
                <option value="new">New</option>
                <option value="used">Used</option>
              </select>
              <label className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={editForm.is_available}
                  onChange={(event) => updateEditValue('is_available', event.target.checked)}
                />
                Available for sale
              </label>
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={editForm.is_negotiable}
                onChange={(event) => updateEditValue('is_negotiable', event.target.checked)}
              />
              Allow price negotiation
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn-primary" disabled={editPending}>
                {editPending ? 'Saving...' : 'Save changes'}
              </button>
              <button type="button" className="btn-muted" onClick={handleCancelEditPost} disabled={editPending}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  )
}
