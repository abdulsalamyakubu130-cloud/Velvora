import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { timeAgo } from '@/lib/utils'
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { useAuth } from '@/src/context/auth-context'

function isMissingColumnError(error, columnName) {
  const message = String(error?.message || '').toLowerCase()
  return error?.code === '42703' || message.includes(String(columnName || '').toLowerCase())
}

function buildFallbackBody(notification) {
  if (notification.type === 'message') return 'You have a new chat update.'
  if (notification.type === 'follow') return 'Someone followed your profile.'
  if (notification.type === 'comment') return 'Someone commented on your listing.'
  if (notification.type === 'like') return 'Someone liked your listing.'
  if (notification.type === 'post') return 'Someone you follow posted a new listing.'
  if (notification.type === 'mention') return 'You have a verification update.'
  return 'You have a new notification.'
}

export default function NotificationsPage() {
  const { user: authUser } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [markingAllRead, setMarkingAllRead] = useState(false)
  const currentUserId = String(authUser?.id || '')
  const unreadCount = useMemo(() => notifications.filter((notification) => !notification.is_read).length, [notifications])

  const loadNotifications = useCallback(async (options = {}) => {
    const { silent = false } = options
    if (!silent) setLoading(true)
    setFeedback('')

    if (!currentUserId) {
      setNotifications([])
      if (!silent) setLoading(false)
      setFeedback('Sign in to view notifications.')
      return
    }

    if (!isSupabaseConfigured) {
      setNotifications([])
      if (!silent) setLoading(false)
      setFeedback('Notifications are unavailable right now.')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setNotifications([])
      if (!silent) setLoading(false)
      setFeedback('Unable to connect right now.')
      return
    }

    let rows = []
    const richQuery = await supabase
      .from('notifications')
      .select('id, type, reference_id, is_read, created_at, actor_id, title, body')
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false })
      .limit(120)

    if (richQuery.error && (isMissingColumnError(richQuery.error, 'actor_id') || isMissingColumnError(richQuery.error, 'title'))) {
      const fallbackQuery = await supabase
        .from('notifications')
        .select('id, type, reference_id, is_read, created_at')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false })
        .limit(120)

      if (fallbackQuery.error) {
        setNotifications([])
        if (!silent) setLoading(false)
        setFeedback(fallbackQuery.error.message || 'Failed to load notifications.')
        return
      }

      rows = fallbackQuery.data || []
    } else if (richQuery.error) {
      setNotifications([])
      if (!silent) setLoading(false)
      setFeedback(richQuery.error.message || 'Failed to load notifications.')
      return
    } else {
      rows = richQuery.data || []
    }

    const actorIds = Array.from(new Set(rows.map((row) => row.actor_id).filter(Boolean)))
    const actorRows = actorIds.length
      ? await supabase.from('users').select('id, username, full_name').in('id', actorIds)
      : { data: [], error: null }
    const actorsById = new Map((actorRows.data || []).map((row) => [row.id, row]))

    const mappedNotifications = rows.map((row) => {
      const actor = actorsById.get(row.actor_id) || null
      const actorLabel = actor?.username ? `@${actor.username}` : actor?.full_name || ''
      const body = row.body || `${actorLabel ? `${actorLabel} ` : ''}${buildFallbackBody(row)}`

      return {
        id: row.id,
        type: row.type,
        created_at: row.created_at,
        is_read: Boolean(row.is_read),
        body,
        title: row.title || row.type?.toUpperCase() || 'NOTIFICATION',
      }
    })

    setNotifications(mappedNotifications)
    if (!silent) setLoading(false)
  }, [currentUserId])

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  useEffect(() => {
    if (!currentUserId || !isSupabaseConfigured) return undefined
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return undefined

    const channel = supabase
      .channel(`notifications:${currentUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${currentUserId}` },
        () => loadNotifications({ silent: true }),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUserId, loadNotifications])

  async function handleMarkAsRead(notificationId) {
    if (!notificationId || !currentUserId || !isSupabaseConfigured) return

    setNotifications((currentRows) =>
      currentRows.map((row) =>
        row.id === notificationId
          ? { ...row, is_read: true }
          : row,
      ),
    )

    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', currentUserId)

    if (error) {
      setFeedback(error.message || 'Failed to mark notification as read.')
      loadNotifications({ silent: true })
    }
  }

  async function handleMarkAllAsRead() {
    if (!currentUserId || !isSupabaseConfigured || !unreadCount) return

    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    setMarkingAllRead(true)
    setNotifications((currentRows) => currentRows.map((row) => ({ ...row, is_read: true })))

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', currentUserId)
      .eq('is_read', false)

    setMarkingAllRead(false)

    if (error) {
      setFeedback(error.message || 'Failed to mark all notifications as read.')
      loadNotifications({ silent: true })
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <header className="surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-brand text-2xl font-semibold">Notifications</h1>
            <p className="mt-1 text-sm text-muted">Likes, comments, follows, verification, and messages in one place.</p>
          </div>
          <button
            type="button"
            className="btn-muted"
            onClick={handleMarkAllAsRead}
            disabled={!unreadCount || markingAllRead}
          >
            {markingAllRead ? 'Updating...' : `Mark all read${unreadCount ? ` (${unreadCount})` : ''}`}
          </button>
        </div>
      </header>

      <section className="surface p-4">
        {loading ? <p className="text-sm text-muted">Loading notifications...</p> : null}
        {feedback ? <p className="mb-3 text-sm text-muted">{feedback}</p> : null}

        {!loading && !notifications.length ? (
          <p className="text-sm text-muted">No notifications yet.</p>
        ) : (
          <div className="space-y-2">
            {notifications.map((notification) => (
              <article
                key={notification.id}
                className={`rounded-xl border p-3 ${notification.is_read ? 'border-line bg-white' : 'border-accent bg-accentSoft'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{notification.title}</p>
                    <p className="mt-1 text-sm text-ink">{notification.body}</p>
                    <p className="mt-1 text-xs text-muted">
                      {notification.type.toUpperCase()} | {timeAgo(notification.created_at)}
                    </p>
                  </div>
                  {!notification.is_read ? (
                    <button
                      type="button"
                      className="btn-muted"
                      onClick={() => handleMarkAsRead(notification.id)}
                    >
                      Mark read
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <Link to="/messages" className="btn-muted">
          Open messages
        </Link>
        <Link to="/settings" className="btn-muted">
          Verification settings
        </Link>
      </div>
    </div>
  )
}
