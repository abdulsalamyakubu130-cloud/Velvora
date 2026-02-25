import { useCallback, useEffect, useState } from 'react'
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { useAuth } from '@/src/context/auth-context'

export function useUnreadMessageCount({ enabled = true } = {}) {
  const { user } = useAuth()
  const currentUserId = String(user?.id || '')
  const [unreadMessageCount, setUnreadMessageCount] = useState(0)

  const loadUnreadMessageCount = useCallback(async () => {
    if (!enabled || !currentUserId || !isSupabaseConfigured) {
      setUnreadMessageCount(0)
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setUnreadMessageCount(0)
      return
    }

    const { data: conversationRows, error: conversationError } = await supabase
      .from('conversations')
      .select('id')
      .or(`user_one.eq.${currentUserId},user_two.eq.${currentUserId}`)
      .limit(300)

    if (conversationError || !conversationRows?.length) {
      setUnreadMessageCount(0)
      return
    }

    const conversationIds = conversationRows.map((row) => row.id).filter(Boolean)
    if (!conversationIds.length) {
      setUnreadMessageCount(0)
      return
    }

    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .in('conversation_id', conversationIds)
      .eq('is_seen', false)
      .neq('sender_id', currentUserId)

    setUnreadMessageCount(Number(count) || 0)
  }, [currentUserId, enabled])

  useEffect(() => {
    loadUnreadMessageCount()
  }, [loadUnreadMessageCount])

  useEffect(() => {
    if (!enabled || !currentUserId || !isSupabaseConfigured) return undefined
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return undefined

    const channel = supabase
      .channel(`unread-messages:${currentUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => loadUnreadMessageCount(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `user_one=eq.${currentUserId}` },
        () => loadUnreadMessageCount(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `user_two=eq.${currentUserId}` },
        () => loadUnreadMessageCount(),
      )
      .subscribe()

    function handleManualRefresh() {
      loadUnreadMessageCount()
    }

    const refreshInterval = window.setInterval(() => {
      loadUnreadMessageCount()
    }, 10000)
    window.addEventListener('velvora:refresh-unread-messages', handleManualRefresh)

    return () => {
      window.clearInterval(refreshInterval)
      window.removeEventListener('velvora:refresh-unread-messages', handleManualRefresh)
      supabase.removeChannel(channel)
    }
  }, [currentUserId, enabled, loadUnreadMessageCount])

  return unreadMessageCount
}
