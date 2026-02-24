import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { buildProfilePath, formatMoneyForViewer, normalizeVerificationTier, resolveViewerLocation, timeAgo } from '@/lib/utils'
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { runWithMissingColumnFallback } from '@/lib/supabase/query-compat'
import { getProfilePictureValue, resolveProfilePictureUrl } from '@/lib/utils/media-url'
import { isLocalLiked, setLocalLike } from '@/lib/utils/social-cache'
import { useAuth } from '@/src/context/auth-context'
import { useI18n } from '@/src/context/i18n-context'
import VerifiedBadge from '@/components/verified-badge'

function readLocalComments(storageKey) {
  if (!storageKey || typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(storageKey)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persistLocalComments(storageKey, comments) {
  if (!storageKey || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(comments))
  } catch {
    // Ignore localStorage failures.
  }
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

function isPlaceholderImage(url) {
  return String(url || '').startsWith('/placeholders/')
}

export default function PostCard({ post, compact = false }) {
  const { user: authUser } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const [isLiked, setIsLiked] = useState(() =>
    authUser?.id ? Boolean(post.is_liked_by_me) || isLocalLiked(authUser.id, post.id) : false,
  )
  const [likesCount, setLikesCount] = useState(post.likes_count)
  const [likePending, setLikePending] = useState(false)
  const [commentsCount, setCommentsCount] = useState(post.comments_count)
  const [commentDraft, setCommentDraft] = useState('')
  const [showCommentInput, setShowCommentInput] = useState(false)
  const [comments, setComments] = useState([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentPending, setCommentPending] = useState(false)
  const [commentFeedback, setCommentFeedback] = useState('')
  const [engagementFeedback, setEngagementFeedback] = useState('')
  const [isFollowing, setIsFollowing] = useState(Boolean(post.user.is_following))
  const [followPending, setFollowPending] = useState(false)
  const showFollowBack = Boolean(post.user.follows_you) && !isFollowing
  const viewerLocation = resolveViewerLocation(authUser)
  const hasPrice = Number(post.price) > 0
  const verificationTier = normalizeVerificationTier(post.user.verification_tier, post.user.is_verified)
  const fallbackPostImage = '/placeholders/listing-home.svg'
  const [imageSrc, setImageSrc] = useState(() => {
    const remoteImage = post.images?.[0] || ''
    if (remoteImage && !isPlaceholderImage(remoteImage)) return remoteImage
    return remoteImage || fallbackPostImage
  })
  const localCommentsKey = useMemo(() => `velvora:post-comments:${post.id}`, [post.id])
  const authRedirectTarget = `${location.pathname}${location.search}${location.hash}`
  const authCommentIdentity = useMemo(
    () => ({
      id: authUser?.id || '',
      username:
        authUser?.user_metadata?.username ||
        authUser?.email?.split('@')[0] ||
        authUser?.phone?.replace(/[^\d]/g, '') ||
        'me',
      full_name: authUser?.user_metadata?.full_name || authUser?.email || 'You',
      avatar_url:
        authUser?.user_metadata?.profile_picture_url ||
        authUser?.user_metadata?.avatar_url ||
        '/placeholders/avatar-anya.svg',
    }),
    [authUser],
  )
  const authorProfileHref = useMemo(() => buildProfilePath(post?.user), [post?.user])
  useEffect(() => {
    setLikesCount(post.likes_count)
    setCommentsCount(post.comments_count)
    setIsFollowing(Boolean(post.user.is_following))
    if (!authUser?.id) {
      setIsLiked(false)
      return
    }
    setIsLiked(Boolean(post.is_liked_by_me) || isLocalLiked(authUser.id, post.id))
  }, [authUser?.id, post.comments_count, post.id, post.is_liked_by_me, post.likes_count, post.user.is_following])

  useEffect(() => {
    const remoteImage = post.images?.[0] || ''
    if (remoteImage && !isPlaceholderImage(remoteImage)) {
      setImageSrc(remoteImage)
      return
    }
    setImageSrc(remoteImage || fallbackPostImage)
  }, [fallbackPostImage, post.id, post.images])

  const loadComments = useCallback(async () => {
    if (!post?.id) return

    if (!isSupabaseConfigured) {
      const localComments = readLocalComments(localCommentsKey)
      setComments(localComments)
      setCommentsCount(localComments.length)
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      const localComments = readLocalComments(localCommentsKey)
      setComments(localComments)
      setCommentsCount(localComments.length)
      return
    }

    setCommentsLoading(true)
    const { data, error } = await runWithMissingColumnFallback(
      () =>
        supabase
          .from('comments')
          .select(
            `
              id,
              user_id,
              content,
              created_at,
              users(id, username, full_name, avatar_url, profile_picture_url)
            `,
          )
          .eq('post_id', post.id)
          .order('created_at', { ascending: false })
          .limit(50),
      () =>
        supabase
          .from('comments')
          .select(
            `
              id,
              user_id,
              content,
              created_at,
              users(id, username, full_name, avatar_url)
            `,
          )
          .eq('post_id', post.id)
          .order('created_at', { ascending: false })
          .limit(50),
    )

    setCommentsLoading(false)

    if (error) {
      const localComments = readLocalComments(localCommentsKey)
      setComments(localComments)
      setCommentsCount(localComments.length)
      return
    }

    const uniqueCommentsById = new Map()
    for (const row of data || []) {
      if (!row?.id || uniqueCommentsById.has(row.id)) continue
      const linkedUser = Array.isArray(row.users) ? row.users[0] : row.users
      const resolvedProfilePicture = resolveProfilePictureUrl(linkedUser?.profile_picture_url || '', '')
      const resolvedAvatar = resolveProfilePictureUrl(linkedUser?.avatar_url || '', '')
      const finalProfilePicture = resolvedProfilePicture || resolvedAvatar
      uniqueCommentsById.set(row.id, {
        id: row.id,
        content: row.content || '',
        created_at: row.created_at,
        author: {
          id: row.user_id,
          username: linkedUser?.username || `user_${String(row.user_id || '').slice(0, 8)}`,
          full_name: linkedUser?.full_name || linkedUser?.username || 'Marketplace user',
          profile_picture_url: finalProfilePicture,
          avatar_url: resolvedAvatar || finalProfilePicture,
        },
      })
    }
    const mappedComments = Array.from(uniqueCommentsById.values())

    setComments(mappedComments)
    setCommentsCount(mappedComments.length)
  }, [localCommentsKey, post?.id])

  useEffect(() => {
    if (!showCommentInput) return
    loadComments()
  }, [loadComments, showCommentInput])

  useEffect(() => {
    if (!showCommentInput || !isSupabaseConfigured || !post?.id) return undefined
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return undefined

    const channel = supabase
      .channel(`post-comments:${post.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `post_id=eq.${post.id}` }, loadComments)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadComments, post?.id, showCommentInput])

  async function resolveTargetUserId() {
    const directId = String(post?.user?.id || '')
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (uuidPattern.test(directId)) return directId

    if (!isSupabaseConfigured || !post?.user?.username) return ''
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return ''

    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('username', post.user.username)
      .maybeSingle()

    return data?.id || ''
  }

  async function refreshLikesCount(supabaseClient) {
    if (!post?.id) return
    const { count, error } = await supabaseClient.from('likes').select('id', { head: true, count: 'exact' }).eq('post_id', post.id)
    if (error) return
    setLikesCount(Number(count) || 0)
  }

  async function handleLikeToggle() {
    if (likePending) return

    if (!authUser?.id) {
      setEngagementFeedback('Sign in to like or follow posts.')
      navigate('/auth', { state: { from: authRedirectTarget } })
      return
    }

    if (!post?.id) {
      return
    }

    if (!isSupabaseConfigured) {
      const nextIsLiked = !isLiked
      setIsLiked(nextIsLiked)
      setLikesCount((count) => (nextIsLiked ? count + 1 : Math.max(0, count - 1)))
      setLocalLike(authUser.id, post.id, nextIsLiked)
      setEngagementFeedback('Like saved locally.')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      const nextIsLiked = !isLiked
      setIsLiked(nextIsLiked)
      setLikesCount((count) => (nextIsLiked ? count + 1 : Math.max(0, count - 1)))
      setLocalLike(authUser.id, post.id, nextIsLiked)
      setEngagementFeedback('Like saved locally.')
      return
    }

    setLikePending(true)
    setEngagementFeedback('')

    if (!isLiked) {
      const { error } = await supabase.from('likes').insert({
        user_id: authUser.id,
        post_id: post.id,
      })

      if (error && error.code !== '23505') {
        if (isMissingTableError(error, 'likes')) {
          setIsLiked(true)
          setLikesCount((count) => count + 1)
          setLocalLike(authUser.id, post.id, true)
          setLikePending(false)
          setEngagementFeedback('Like saved locally. Run supabase/social_sync_fix.sql to sync likes.')
          return
        }
        setLikePending(false)
        setEngagementFeedback('Failed to like this post.')
        return
      }

      setIsLiked(true)
      setLocalLike(authUser.id, post.id, true)
      await refreshLikesCount(supabase)
      setLikePending(false)
      return
    }

    const { error } = await supabase
      .from('likes')
      .delete()
      .eq('user_id', authUser.id)
      .eq('post_id', post.id)

    if (error) {
      if (isMissingTableError(error, 'likes')) {
        setIsLiked(false)
        setLikesCount((count) => Math.max(0, count - 1))
        setLocalLike(authUser.id, post.id, false)
        setLikePending(false)
        setEngagementFeedback('Like updated locally. Run supabase/social_sync_fix.sql to sync likes.')
        return
      }
      setLikePending(false)
      setEngagementFeedback('Failed to remove like.')
      return
    }

    setIsLiked(false)
    setLocalLike(authUser.id, post.id, false)
    await refreshLikesCount(supabase)
    setLikePending(false)
  }

  async function handleCommentSubmit(event) {
    event.preventDefault()
    if (commentPending) return
    const nextComment = commentDraft.trim()
    if (!nextComment) return

    if (!authUser?.id) {
      setCommentFeedback('Sign in to comment on this post.')
      return
    }

    setCommentPending(true)
    setCommentFeedback('')

    if (!isSupabaseConfigured || !post?.id) {
      const nextLocalComment = {
        id: `local-${Date.now()}`,
        content: nextComment,
        created_at: new Date().toISOString(),
        author: authCommentIdentity,
      }
      const nextComments = [nextLocalComment, ...comments]
      setComments(nextComments)
      persistLocalComments(localCommentsKey, nextComments)
      setCommentsCount(nextComments.length)
      setCommentDraft('')
      setCommentPending(false)
      setShowCommentInput(true)
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setCommentPending(false)
      setCommentFeedback('Unable to connect right now. Try again.')
      return
    }

    const { error } = await supabase.from('comments').insert({
      user_id: authUser.id,
      post_id: post.id,
      content: nextComment,
    })

    setCommentPending(false)

    if (error) {
      if (isMissingTableError(error, 'comments')) {
        const nextLocalComment = {
          id: `local-${Date.now()}`,
          content: nextComment,
          created_at: new Date().toISOString(),
          author: authCommentIdentity,
        }
        const nextComments = [nextLocalComment, ...comments]
        setComments(nextComments)
        persistLocalComments(localCommentsKey, nextComments)
        setCommentsCount(nextComments.length)
        setCommentDraft('')
        setShowCommentInput(true)
        setCommentFeedback('Comment saved locally.')
        return
      }
      setCommentFeedback(error.message || 'Failed to post comment.')
      return
    }

    setCommentDraft('')
    setShowCommentInput(true)
    await loadComments()
  }

  async function handleFollowToggle() {
    if (!authUser?.id) {
      setEngagementFeedback('Sign in to like or follow posts.')
      navigate('/auth', { state: { from: authRedirectTarget } })
      return
    }

    const targetUserId = await resolveTargetUserId()
    const isOwnProfile = authUser?.id && targetUserId && authUser.id === targetUserId
    if (isOwnProfile || followPending) return

    if (!targetUserId) {
      setEngagementFeedback('Unable to follow this user right now. Refresh and try again.')
      return
    }

    if (!isSupabaseConfigured) {
      setEngagementFeedback('Unable to sync follow status right now. Check your Supabase setup.')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setEngagementFeedback('Unable to connect to Supabase right now.')
      return
    }

    setFollowPending(true)
    setEngagementFeedback('')
    const nextIsFollowing = !isFollowing

    if (nextIsFollowing) {
      const { error } = await supabase.from('followers').insert({
        follower_id: authUser.id,
        following_id: targetUserId,
      })
      if (error && error.code !== '23505') {
        setEngagementFeedback(
          isMissingTableError(error, 'followers')
            ? 'Followers table is missing. Run supabase/social_sync_fix.sql in Supabase SQL Editor, then refresh.'
            : 'Failed to follow this user.',
        )
        setFollowPending(false)
        return
      }
      setIsFollowing(true)
      setFollowPending(false)
      return
    }

    const { error } = await supabase
      .from('followers')
      .delete()
      .eq('follower_id', authUser.id)
      .eq('following_id', targetUserId)

    if (error) {
      setEngagementFeedback(
        isMissingTableError(error, 'followers')
          ? 'Followers table is missing. Run supabase/social_sync_fix.sql in Supabase SQL Editor, then refresh.'
          : 'Failed to unfollow this user.',
      )
      setFollowPending(false)
      return
    }
    setIsFollowing(false)
    setFollowPending(false)
  }

  return (
    <article className="surface overflow-hidden animate-rise">
      <img
        src={imageSrc}
        alt={post.title}
        className={`w-full object-cover ${compact ? 'h-52' : 'h-72 md:h-[24rem]'}`}
        onError={() => {
          const alternateImage = (post.images || []).find((candidate) => candidate && candidate !== imageSrc)
          if (alternateImage) {
            setImageSrc(alternateImage)
            return
          }
          if (imageSrc !== fallbackPostImage) {
            setImageSrc(fallbackPostImage)
          }
        }}
      />

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-ink">{post.title}</h3>
            <p className="text-sm text-muted">
              {post.location} | {timeAgo(post.created_at)}
            </p>
          </div>
          <p className="text-base font-semibold text-accentStrong">
            {hasPrice ? formatMoneyForViewer(post.price, viewerLocation, post.location) : 'Price on request'}
          </p>
        </div>

        {!compact ? <p className="text-sm text-muted">{post.description}</p> : null}

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="pill">{post.condition.toUpperCase()}</span>
          <span className="pill">{post.category_name}</span>
          {post.is_negotiable ? <span className="pill">{t('post.negotiable')}</span> : null}
          {!post.is_available ? <span className="pill">{t('post.sold')}</span> : null}
        </div>

        <div className="flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
          <Link to={authorProfileHref} className="flex min-w-0 items-center gap-2">
            <img
              src={resolveProfilePictureUrl(getProfilePictureValue(post.user))}
              alt={post.user.full_name}
              className="h-8 w-8 rounded-lg object-cover"
              onError={(event) => {
                event.currentTarget.src = '/placeholders/avatar-anya.svg'
              }}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <p className="truncate text-sm font-semibold text-ink">{post.user.full_name}</p>
                <VerifiedBadge tier={verificationTier} />
              </div>
              <p className="truncate text-xs text-muted">@{post.user.username}</p>
            </div>
          </Link>

          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={handleLikeToggle}
              disabled={likePending}
              className={`w-full whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition sm:w-auto ${
                isLiked ? 'border-accent bg-accent text-white' : 'border-line bg-white text-ink hover:border-accent'
              }`}
            >
              {t('post.like')} {likesCount}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCommentInput((current) => !current)
              }}
              className="w-full whitespace-nowrap rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-accent sm:w-auto"
            >
              {t('post.comment')} {commentsCount}
            </button>
            <button
              type="button"
              onClick={handleFollowToggle}
              disabled={followPending}
              className={`col-span-2 w-full whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition sm:col-span-1 sm:w-auto ${
                isFollowing
                  ? 'border border-line bg-white text-ink hover:border-accent'
                  : 'bg-accent text-white hover:bg-accentStrong'
              }`}
            >
              {isFollowing ? t('post.following') : showFollowBack ? t('post.follow_back') : t('post.follow')}
            </button>
          </div>
        </div>
        {engagementFeedback ? <p className="text-xs text-muted">{engagementFeedback}</p> : null}

        {showCommentInput ? (
          <div className="space-y-3 border-t border-line pt-3">
            {commentsLoading ? <p className="text-xs text-muted">Loading comments...</p> : null}
            {!commentsLoading && comments.length ? (
              <div className="space-y-2">
                {comments.slice(0, 8).map((comment) => (
                  <article key={comment.id} className="rounded-xl border border-line bg-white p-2.5">
                    <div className="min-w-0">
                      <Link
                        to={buildProfilePath(comment.author)}
                        className="mb-1 inline-flex items-center gap-2 hover:opacity-90"
                      >
                        <img
                          src={resolveProfilePictureUrl(getProfilePictureValue(comment.author))}
                          alt={comment.author.full_name}
                          className="h-7 w-7 rounded-full object-cover"
                          onError={(event) => {
                            event.currentTarget.src = '/placeholders/avatar-anya.svg'
                          }}
                        />
                        <p className="text-xs font-semibold text-ink">
                          {comment.author.full_name}{' '}
                          <span className="font-normal text-muted">@{comment.author.username}</span>
                        </p>
                      </Link>
                      <div className="min-w-0">
                        <p className="text-sm text-ink">{comment.content}</p>
                        <p className="text-[11px] text-muted">{timeAgo(comment.created_at)}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
            {!commentsLoading && !comments.length ? (
              <p className="text-xs text-muted">No comments yet. Be the first to comment.</p>
            ) : null}

            <form onSubmit={handleCommentSubmit} className="flex items-center gap-2">
              <input
                className="input"
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                placeholder={authUser?.id ? t('post.comment_placeholder') : 'Sign in to comment'}
                disabled={commentPending}
              />
              <button type="submit" className="btn-primary" disabled={commentPending || !authUser?.id}>
                {commentPending ? 'Posting...' : t('post.post')}
              </button>
            </form>
            {commentFeedback ? <p className="text-xs text-muted">{commentFeedback}</p> : null}
          </div>
        ) : null}
      </div>
    </article>
  )
}
