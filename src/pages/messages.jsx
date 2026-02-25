import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { resolveViewerLocation, timeAgo } from '@/lib/utils'
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { runWithMissingColumnFallback } from '@/lib/supabase/query-compat'
import { getProfilePictureValue, resolveProfilePictureUrl } from '@/lib/utils/media-url'
import { useAuth } from '@/src/context/auth-context'

function buildLastMessagePreview(message) {
  if (!message) return 'No messages yet.'
  const content = String(message.content || '').trim()
  if (content) return content
  if (message.image_url) return 'Image'
  return 'No messages yet.'
}

function formatMessageTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
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

export default function MessagesPage() {
  const location = useLocation()
  const { user: authUser } = useAuth()
  const [showMobileThread, setShowMobileThread] = useState(false)
  const [conversations, setConversations] = useState([])
  const [loadingConversations, setLoadingConversations] = useState(false)
  const [activeConversationId, setActiveConversationId] = useState('')
  const [messages, setMessages] = useState([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [draft, setDraft] = useState('')
  const [attachment, setAttachment] = useState(null)
  const [composerFeedback, setComposerFeedback] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [partnerTyping, setPartnerTyping] = useState(false)
  const [partnerOnline, setPartnerOnline] = useState(false)
  const [sending, setSending] = useState(false)
  const [deletingMessageId, setDeletingMessageId] = useState('')
  const [deletingConversation, setDeletingConversation] = useState(false)
  const [requestActionPending, setRequestActionPending] = useState(false)
  const [openedConversationNonce, setOpenedConversationNonce] = useState(0)
  const typingTimeoutRef = useRef(null)
  const partnerTypingTimeoutRef = useRef(null)
  const openedConversationsRef = useRef(new Set())
  const channelRef = useRef(null)
  const messagesViewportRef = useRef(null)

  resolveViewerLocation(authUser)
  const currentUserId = String(authUser?.id || '')
  const requestedUsername = useMemo(() => {
    const query = new URLSearchParams(location.search)
    return String(query.get('user') || '').trim()
  }, [location.search])

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) || null,
    [activeConversationId, conversations],
  )
  const activeRequestStatus = activeConversation?.request_status || 'none'
  const activeViewerIsRequester = activeConversation?.requester_id === currentUserId
  const activeViewerIsTarget = activeConversation?.target_user_id === currentUserId
  const isRequestBlockedForViewer = activeViewerIsRequester && (activeRequestStatus === 'pending' || activeRequestStatus === 'rejected')
  const canMessage = Boolean(currentUserId && activeConversationId && !isRequestBlockedForViewer)
  const composerPlaceholder =
    !activeConversation
      ? 'Select a conversation'
      : isRequestBlockedForViewer
        ? activeRequestStatus === 'rejected'
          ? 'Message request declined'
          : 'Waiting for request acceptance'
        : 'Type a message...'

  const refreshUnreadMessageBadge = useCallback(() => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new Event('velvora:refresh-unread-messages'))
  }, [])

  const markConversationNotificationsRead = useCallback(async (conversationId) => {
    if (!conversationId || !currentUserId || !isSupabaseConfigured) return

    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', currentUserId)
      .eq('type', 'message')
      .eq('reference_id', conversationId)
      .eq('is_read', false)
  }, [currentUserId])

  function markConversationOpened(conversationId) {
    if (!conversationId) return
    openedConversationsRef.current.add(String(conversationId))
    setOpenedConversationNonce((currentValue) => currentValue + 1)
  }

  function activateConversation(conversationId, options = {}) {
    const { opened = false } = options
    if (!conversationId) return
    setActiveConversationId(conversationId)
    if (opened) {
      markConversationOpened(conversationId)
    }
    setShowMobileThread(true)
  }

  const loadConversations = useCallback(async (options = {}) => {
    const { silent = false } = options
    if (!silent) setLoadingConversations(true)
    if (!silent) setStatusMessage('')

    if (!currentUserId) {
      setConversations([])
      setActiveConversationId('')
      if (!silent) setLoadingConversations(false)
      setStatusMessage('Sign in to view your conversations.')
      return
    }

    if (!isSupabaseConfigured) {
      setConversations([])
      setActiveConversationId('')
      if (!silent) setLoadingConversations(false)
      setStatusMessage('Supabase is not configured for chat.')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setConversations([])
      setActiveConversationId('')
      if (!silent) setLoadingConversations(false)
      setStatusMessage('Unable to connect to Supabase right now.')
      return
    }

    const { data: conversationRows, error: conversationError } = await supabase
      .from('conversations')
      .select('id, user_one, user_two, created_at')
      .or(`user_one.eq.${currentUserId},user_two.eq.${currentUserId}`)
      .order('created_at', { ascending: false })
      .limit(100)

    if (conversationError) {
      setConversations([])
      setActiveConversationId('')
      if (!silent) setLoadingConversations(false)
      setStatusMessage(conversationError.message || 'Failed to load conversations.')
      return
    }

    const rawConversations = conversationRows || []
    if (!rawConversations.length) {
      setConversations([])
      setActiveConversationId('')
      if (!silent) setLoadingConversations(false)
      setStatusMessage('No conversations yet.')
      return
    }

    const partnerIds = Array.from(
      new Set(
        rawConversations
          .map((conversation) => (conversation.user_one === currentUserId ? conversation.user_two : conversation.user_one))
          .filter(Boolean),
      ),
    )
    const conversationIds = rawConversations.map((conversation) => conversation.id)

    const [usersResult, latestMessagesResult, requestRowsResult, unreadRowsResult] = await Promise.all([
      partnerIds.length
        ? runWithMissingColumnFallback(
            () =>
              supabase
                .from('users')
                .select('id, username, full_name, avatar_url, profile_picture_url')
                .in('id', partnerIds),
            () =>
              supabase
                .from('users')
                .select('id, username, full_name, avatar_url')
                .in('id', partnerIds),
          )
        : Promise.resolve({ data: [], error: null }),
      conversationIds.length
        ? supabase
            .from('messages')
            .select('id, conversation_id, sender_id, content, image_url, created_at, is_seen')
            .in('conversation_id', conversationIds)
            .order('created_at', { ascending: false })
            .limit(Math.max(conversationIds.length * 4, 120))
        : Promise.resolve({ data: [], error: null }),
      conversationIds.length
        ? supabase
            .from('message_requests')
            .select('conversation_id, status, requester_id, target_user_id, updated_at')
            .in('conversation_id', conversationIds)
        : Promise.resolve({ data: [], error: null }),
      conversationIds.length
        ? supabase
            .from('messages')
            .select('conversation_id')
            .in('conversation_id', conversationIds)
            .eq('is_seen', false)
            .neq('sender_id', currentUserId)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (requestRowsResult.error && !isMissingTableError(requestRowsResult.error, 'message_requests')) {
      setStatusMessage(requestRowsResult.error.message || 'Failed to load message requests.')
    }

    const requestByConversationId = new Map((requestRowsResult.data || []).map((row) => [row.conversation_id, row]))

    const usersById = new Map((usersResult.data || []).map((row) => [row.id, row]))
    const latestMessageByConversationId = new Map()
    const unreadCountByConversationId = new Map()
    for (const row of latestMessagesResult.data || []) {
      if (!latestMessageByConversationId.has(row.conversation_id)) {
        latestMessageByConversationId.set(row.conversation_id, row)
      }
    }
    for (const row of unreadRowsResult.data || []) {
      const currentCount = unreadCountByConversationId.get(row.conversation_id) || 0
      unreadCountByConversationId.set(row.conversation_id, currentCount + 1)
    }

    const mappedConversations = rawConversations
      .map((conversation) => {
        const partnerId = conversation.user_one === currentUserId ? conversation.user_two : conversation.user_one
        const partnerRow = usersById.get(partnerId) || {}
        const latestMessage = latestMessageByConversationId.get(conversation.id) || null
        const request = requestByConversationId.get(conversation.id) || null
        const requestStatus = request?.status || 'none'
        const requestUpdatedAt = request?.updated_at || null
        const lastMessageAt = latestMessage?.created_at || requestUpdatedAt || conversation.created_at
        const requestPendingNoMessage = requestStatus === 'pending' && !latestMessage

        return {
          id: conversation.id,
          partner_id: partnerId,
          partner_name:
            partnerRow.full_name ||
            partnerRow.username ||
            `user_${String(partnerId || '').slice(0, 8)}`,
          partner_username: partnerRow.username || '',
          partner_avatar: resolveProfilePictureUrl(getProfilePictureValue(partnerRow)),
          last_message: requestPendingNoMessage ? 'Message request pending' : buildLastMessagePreview(latestMessage),
          last_message_at: lastMessageAt,
          unread_count: unreadCountByConversationId.get(conversation.id) || 0,
          request_status: requestStatus,
          requester_id: request?.requester_id || '',
          target_user_id: request?.target_user_id || '',
        }
      })
      .sort((leftConversation, rightConversation) => (
        new Date(rightConversation.last_message_at).getTime() -
        new Date(leftConversation.last_message_at).getTime()
      ))

    setConversations(mappedConversations)
    setActiveConversationId((currentId) => {
      if (currentId && mappedConversations.some((conversation) => conversation.id === currentId)) {
        return currentId
      }
      return ''
    })
    if (!silent) setStatusMessage(mappedConversations.length ? '' : 'No conversations yet.')
    if (!silent) setLoadingConversations(false)
  }, [currentUserId])

  const ensureConversationForRequestedUser = useCallback(async () => {
    if (!requestedUsername || !currentUserId || !isSupabaseConfigured) return

    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    const { data: targetUser, error: targetUserError } = await supabase
      .from('users')
      .select('id, username')
      .eq('username', requestedUsername)
      .maybeSingle()

    if (targetUserError || !targetUser?.id || String(targetUser.id) === currentUserId) return

    const { data: existingRows } = await supabase
      .from('conversations')
      .select('id, user_one, user_two')
      .or(
        `and(user_one.eq.${currentUserId},user_two.eq.${targetUser.id}),and(user_one.eq.${targetUser.id},user_two.eq.${currentUserId})`,
      )
      .limit(1)

    const existingConversationId = existingRows?.[0]?.id
    if (existingConversationId) {
      await loadConversations()
      activateConversation(existingConversationId, { opened: true })
      return
    }

    const { data: requestData, error: requestError } = await supabase.rpc('create_message_request', {
      target_user_id_input: targetUser.id,
      request_text: null,
    })

    const rpcUnavailable = isMissingFunctionError(requestError, 'create_message_request') || isMissingTableError(requestError, 'message_requests')

    if (requestError && !rpcUnavailable) {
      setComposerFeedback(requestError.message || 'Failed to open conversation.')
      return
    }

    if (rpcUnavailable) {
      const { data: createdConversation, error: createError } = await supabase
        .from('conversations')
        .insert({
          user_one: currentUserId,
          user_two: targetUser.id,
        })
        .select('id')
        .single()

      if (createError || !createdConversation?.id) return
      await loadConversations()
      activateConversation(createdConversation.id, { opened: true })
      return
    }

    const requestRow = Array.isArray(requestData) ? requestData[0] : requestData
    if (!requestRow?.conversation_id) return

    await loadConversations()
    activateConversation(requestRow.conversation_id, { opened: true })
  }, [currentUserId, loadConversations, requestedUsername])

  const loadMessages = useCallback(async (options = {}) => {
    const { silent = false } = options
    if (!silent) setComposerFeedback('')

    if (!activeConversationId) {
      setMessages([])
      return
    }

    if (!isSupabaseConfigured) {
      setMessages([])
      if (!silent) setComposerFeedback('Supabase is not configured for chat.')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setMessages([])
      if (!silent) setComposerFeedback('Unable to connect to Supabase right now.')
      return
    }

    if (!silent) setLoadingMessages(true)
    const { data, error } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content, image_url, created_at, is_seen')
      .eq('conversation_id', activeConversationId)
      .order('created_at', { ascending: true })
      .limit(200)
    if (!silent) setLoadingMessages(false)

    if (error) {
      setMessages([])
      if (!silent) setComposerFeedback(error.message || 'Failed to load messages.')
      return
    }

    const partnerName = activeConversation?.partner_name || 'User'
    const mappedMessages = (data || []).map((row) => ({
      id: row.id,
      sender_id: row.sender_id,
      sender_name: String(row.sender_id) === currentUserId ? 'Me' : partnerName,
      content: row.content,
      image_url: row.image_url,
      created_at: row.created_at,
      is_seen: Boolean(row.is_seen),
    }))

    setMessages(mappedMessages)
  }, [activeConversation?.partner_name, activeConversationId, currentUserId])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    ensureConversationForRequestedUser()
  }, [ensureConversationForRequestedUser])

  useEffect(() => {
    if (!isSupabaseConfigured || !currentUserId) return undefined
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return undefined

    const channel = supabase
      .channel(`messages-overview:${currentUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `user_one=eq.${currentUserId}` },
        loadConversations,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `user_two=eq.${currentUserId}` },
        loadConversations,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_requests', filter: `requester_id=eq.${currentUserId}` },
        loadConversations,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_requests', filter: `target_user_id=eq.${currentUserId}` },
        loadConversations,
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${currentUserId}` },
        loadConversations,
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => loadConversations({ silent: true }),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        () => loadConversations({ silent: true }),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUserId, loadConversations])

  useEffect(() => {
    setDraft('')
    setAttachment(null)
    setPartnerTyping(false)
    setPartnerOnline(false)
    loadMessages()
  }, [activeConversationId, loadMessages])

  useEffect(() => {
    if (!currentUserId || !isSupabaseConfigured) return undefined

    const refreshInterval = setInterval(() => {
      loadConversations({ silent: true })
      if (activeConversationId) {
        loadMessages({ silent: true })
      }
    }, 6000)

    return () => {
      clearInterval(refreshInterval)
    }
  }, [activeConversationId, currentUserId, loadConversations, loadMessages])

  useEffect(() => {
    if (!isSupabaseConfigured || !activeConversationId || !currentUserId) return undefined
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return undefined

    const partnerId = String(activeConversation?.partner_id || '')
    const channel = supabase
      .channel(`conversation:${activeConversationId}`, {
        config: {
          presence: { key: currentUserId },
          broadcast: { ack: true, self: false },
        },
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeConversationId}` },
        (payload) => {
          const nextMessage = {
            id: payload.new.id,
            sender_id: payload.new.sender_id,
            sender_name: String(payload.new.sender_id) === currentUserId ? 'Me' : activeConversation?.partner_name || 'User',
            content: payload.new.content,
            image_url: payload.new.image_url,
            created_at: payload.new.created_at,
            is_seen: Boolean(payload.new.is_seen),
          }
          setMessages((currentMessages) => {
            if (currentMessages.some((message) => String(message.id) === String(nextMessage.id))) {
              return currentMessages
            }
            return [...currentMessages, nextMessage]
          })
          loadConversations({ silent: true })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeConversationId}` },
        (payload) => {
          const updatedMessageId = String(payload.new.id)
          setMessages((currentMessages) =>
            currentMessages.map((message) =>
              String(message.id) === updatedMessageId
                ? {
                    ...message,
                    is_seen: Boolean(payload.new.is_seen),
                    content: payload.new.content,
                    image_url: payload.new.image_url,
                  }
                : message,
            ),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_requests', filter: `conversation_id=eq.${activeConversationId}` },
        loadConversations,
      )
      .on('broadcast', { event: 'typing' }, (eventPayload) => {
        const payload = eventPayload?.payload || eventPayload || {}
        const senderId = String(payload.sender_id || '')
        const conversationId = String(payload.conversation_id || '')
        if (!senderId || senderId === currentUserId || conversationId !== String(activeConversationId)) return

        const isTyping = Boolean(payload.is_typing)
        setPartnerTyping(isTyping)

        if (partnerTypingTimeoutRef.current) {
          clearTimeout(partnerTypingTimeoutRef.current)
        }
        if (isTyping) {
          partnerTypingTimeoutRef.current = setTimeout(() => {
            setPartnerTyping(false)
          }, 2200)
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState()
        if (partnerId) {
          setPartnerOnline(Boolean(presenceState[partnerId]?.length))
          return
        }
        const onlinePeerExists = Object.keys(presenceState).some((key) => key !== currentUserId)
        setPartnerOnline(onlinePeerExists)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.track({ user_id: currentUserId, online_at: new Date().toISOString() })
        }
      })

    channelRef.current = channel

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
      if (partnerTypingTimeoutRef.current) {
        clearTimeout(partnerTypingTimeoutRef.current)
      }
      setPartnerTyping(false)
      setPartnerOnline(false)
      channelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [activeConversation?.partner_id, activeConversation?.partner_name, activeConversationId, currentUserId, loadConversations])

  useEffect(() => {
    if (!activeConversationId || !currentUserId) return
    if (!openedConversationsRef.current.has(String(activeConversationId))) return
    if (typeof document !== 'undefined' && (document.visibilityState !== 'visible' || !document.hasFocus())) return
    const isDesktopViewport = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
    if (!isDesktopViewport && !showMobileThread) return

    refreshUnreadMessageBadge()
    void markConversationNotificationsRead(activeConversationId)

    if (!messages.length || !isSupabaseConfigured) return
    const unseenIncoming = messages.filter(
      (message) => String(message.sender_id || '') !== currentUserId && !message.is_seen,
    )
    if (!unseenIncoming.length) return

    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        String(message.sender_id || '') !== currentUserId && !message.is_seen
          ? { ...message, is_seen: true }
          : message,
      ),
    )

    setConversations((currentConversations) =>
      currentConversations.map((conversation) =>
        conversation.id === activeConversationId
          ? { ...conversation, unread_count: 0 }
          : conversation,
      ),
    )

    supabase
      .from('messages')
      .update({ is_seen: true })
      .neq('sender_id', currentUserId)
      .eq('is_seen', false)
      .eq('conversation_id', activeConversationId)
      .then(() => {
        refreshUnreadMessageBadge()
        void markConversationNotificationsRead(activeConversationId)
        loadConversations({ silent: true })
      })
  }, [
    activeConversationId,
    currentUserId,
    loadConversations,
    markConversationNotificationsRead,
    messages,
    openedConversationNonce,
    refreshUnreadMessageBadge,
    showMobileThread,
  ])

  useEffect(() => {
    const viewport = messagesViewportRef.current
    if (!viewport) return
    viewport.scrollTop = viewport.scrollHeight
  }, [activeConversationId, messages])

  function broadcastTyping(isTyping) {
    const channel = channelRef.current
    if (!channel || !activeConversationId || !currentUserId) return

    void channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        sender_id: currentUserId,
        conversation_id: activeConversationId,
        is_typing: isTyping,
      },
    })
  }

  function handleDraftChange(event) {
    const nextDraft = event.target.value
    setDraft(nextDraft)

    if (!canMessage) return
    markConversationOpened(activeConversationId)
    broadcastTyping(true)

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    typingTimeoutRef.current = setTimeout(() => {
      broadcastTyping(false)
    }, 1200)
  }

  function clearAttachment() {
    setAttachment(null)
  }

  function handleAttachmentSelect(fileList) {
    const file = fileList?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setComposerFeedback('Only image attachments are supported.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setComposerFeedback('Image too large. Max 5MB.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setAttachment({
        name: file.name,
        previewUrl: String(reader.result || ''),
        type: file.type,
      })
      setComposerFeedback('')
    }
    reader.onerror = () => {
      setComposerFeedback('Failed to read image attachment.')
    }
    reader.readAsDataURL(file)
  }

  async function handleMessageRequestDecision(nextStatus) {
    if (!activeConversationId || !currentUserId || !activeViewerIsTarget) return
    if (!isSupabaseConfigured) return

    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    setRequestActionPending(true)
    setComposerFeedback('')

    const { data, error } = await supabase
      .from('message_requests')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('conversation_id', activeConversationId)
      .eq('target_user_id', currentUserId)
      .eq('status', 'pending')
      .select('status')
      .maybeSingle()

    setRequestActionPending(false)

    if (error) {
      setComposerFeedback(error.message || 'Failed to update message request.')
      return
    }

    if (!data) {
      setComposerFeedback('This request is no longer pending.')
      await loadConversations()
      return
    }

    setConversations((currentConversations) =>
      currentConversations.map((conversation) =>
        conversation.id === activeConversationId
          ? { ...conversation, request_status: nextStatus }
          : conversation,
      ),
    )
    setComposerFeedback(nextStatus === 'accepted' ? 'Message request accepted.' : 'Message request declined.')
  }

  async function handleDeleteMessage(messageId) {
    const normalizedMessageId = String(messageId || '')
    if (!normalizedMessageId || !currentUserId) return

    const messageRow = messages.find((message) => String(message.id) === normalizedMessageId)
    if (!messageRow) return
    if (String(messageRow.sender_id || '') !== currentUserId) {
      setComposerFeedback('You can only delete your own messages.')
      return
    }

    if (typeof window !== 'undefined') {
      const shouldDelete = window.confirm('Delete this message?')
      if (!shouldDelete) return
    }

    if (normalizedMessageId.startsWith('local-')) {
      setMessages((currentMessages) =>
        currentMessages.filter((message) => String(message.id) !== normalizedMessageId),
      )
      return
    }

    if (!isSupabaseConfigured) {
      setComposerFeedback('Message deletion requires Supabase configuration.')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setComposerFeedback('Unable to connect to Supabase right now.')
      return
    }

    setDeletingMessageId(normalizedMessageId)
    setComposerFeedback('')

    const { error: hardDeleteError } = await supabase
      .from('messages')
      .delete()
      .eq('id', normalizedMessageId)
      .eq('sender_id', currentUserId)

    if (!hardDeleteError) {
      setMessages((currentMessages) =>
        currentMessages.filter((message) => String(message.id) !== normalizedMessageId),
      )
      setDeletingMessageId('')
      await loadConversations({ silent: true })
      refreshUnreadMessageBadge()
      return
    }

    const { error: softDeleteError } = await supabase
      .from('messages')
      .update({ content: 'Message deleted', image_url: null })
      .eq('id', normalizedMessageId)
      .eq('sender_id', currentUserId)

    setDeletingMessageId('')

    if (softDeleteError) {
      setComposerFeedback(hardDeleteError.message || softDeleteError.message || 'Failed to delete message.')
      return
    }

    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        String(message.id) === normalizedMessageId
          ? { ...message, content: 'Message deleted', image_url: null }
          : message,
      ),
    )
    await loadConversations({ silent: true })
  }

  async function handleDeleteConversation() {
    if (!activeConversationId || !currentUserId || deletingConversation) return

    if (typeof window !== 'undefined') {
      const shouldDelete = window.confirm('Delete this entire chat? This action cannot be undone.')
      if (!shouldDelete) return
    }

    if (!isSupabaseConfigured) {
      setComposerFeedback('Chat deletion requires Supabase configuration.')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setComposerFeedback('Unable to connect to Supabase right now.')
      return
    }

    const conversationId = String(activeConversationId)
    setDeletingConversation(true)
    setComposerFeedback('')

    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId)

    setDeletingConversation(false)

    if (error) {
      setComposerFeedback(error.message || 'Failed to delete this chat.')
      return
    }

    openedConversationsRef.current.delete(conversationId)
    setConversations((currentConversations) =>
      currentConversations.filter((conversation) => conversation.id !== conversationId),
    )
    setMessages([])
    setDraft('')
    setAttachment(null)
    setActiveConversationId('')
    setShowMobileThread(false)
    setPartnerTyping(false)
    setPartnerOnline(false)
    setStatusMessage('Conversation deleted.')
    refreshUnreadMessageBadge()
    await markConversationNotificationsRead(conversationId)
  }

  async function handleSend(event) {
    event.preventDefault()
    const trimmedDraft = draft.trim()
    if (!trimmedDraft && !attachment) return

    if (!canMessage || !currentUserId) {
      setComposerFeedback(
        isRequestBlockedForViewer
          ? activeRequestStatus === 'rejected'
            ? 'Your message request was declined.'
            : 'Wait for this message request to be accepted.'
          : 'Select a conversation to start chatting.',
      )
      return
    }
    markConversationOpened(activeConversationId)

    if (!isSupabaseConfigured) {
      setComposerFeedback('Supabase is not configured for chat.')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setComposerFeedback('Unable to connect to Supabase right now.')
      return
    }

    if (activeViewerIsTarget && activeRequestStatus === 'pending') {
      const { error: autoAcceptError } = await supabase
        .from('message_requests')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('conversation_id', activeConversationId)
        .eq('target_user_id', currentUserId)
        .eq('status', 'pending')

      if (autoAcceptError && !isMissingTableError(autoAcceptError, 'message_requests')) {
        setComposerFeedback(autoAcceptError.message || 'Failed to accept message request.')
        return
      }

      setConversations((currentConversations) =>
        currentConversations.map((conversation) =>
          conversation.id === activeConversationId
            ? { ...conversation, request_status: 'accepted' }
            : conversation,
        ),
      )
    }

    setSending(true)
    setComposerFeedback('')
    broadcastTyping(false)

    const optimisticMessageId = `local-${Date.now()}`
    const optimisticMessage = {
      id: optimisticMessageId,
      sender_id: currentUserId,
      sender_name: 'Me',
      content: trimmedDraft || null,
      image_url: attachment?.previewUrl || null,
      created_at: new Date().toISOString(),
      is_seen: false,
    }
    setMessages((currentMessages) => [...currentMessages, optimisticMessage])

    const sentContent = trimmedDraft || null
    const sentImage = attachment?.previewUrl || null
    setDraft('')
    setAttachment(null)

    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: activeConversationId,
        sender_id: currentUserId,
        content: sentContent,
        image_url: sentImage,
        is_seen: false,
      })
      .select('id, sender_id, content, image_url, created_at, is_seen, conversation_id')
      .single()

    if (error) {
      setComposerFeedback(error.message || 'Failed to send message.')
      setSending(false)
      return
    }

    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === optimisticMessageId
          ? {
              id: data.id,
              sender_id: data.sender_id,
              sender_name: 'Me',
              content: data.content,
              image_url: data.image_url,
              created_at: data.created_at,
              is_seen: Boolean(data.is_seen),
            }
          : message,
      ),
    )

    await loadConversations()
    setSending(false)
  }

  return (
    <div className="grid gap-2.5 lg:grid-cols-[260px,minmax(0,1fr)] xl:grid-cols-[280px,minmax(0,1fr)]">
      <aside className={`surface overflow-hidden p-0 ${showMobileThread ? 'hidden lg:block' : 'block'}`}>
        <header className="border-b border-line bg-white px-3 py-2">
          <h1 className="font-brand text-lg font-semibold text-ink">Messages</h1>
          <p className="text-xs text-muted">{conversations.length} conversation{conversations.length === 1 ? '' : 's'}</p>
        </header>

        {loadingConversations ? <p className="px-3 py-1.5 text-sm text-muted">Loading conversations...</p> : null}
        {statusMessage ? <p className="px-3 py-1.5 text-sm text-muted">{statusMessage}</p> : null}

        <div className="max-h-[62vh] overflow-y-auto lg:max-h-[calc(100vh-14rem)]">
          {conversations.map((conversation) => {
            const isActive = conversation.id === activeConversationId
            const hasUnread = Number(conversation.unread_count || 0) > 0 && !isActive
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => {
                  activateConversation(conversation.id, { opened: true })
                }}
                className={`group flex w-full items-center gap-2 border-b border-line/70 px-3 py-2 text-left transition ${
                  isActive ? 'bg-accentSoft/70' : 'bg-white hover:bg-accentSoft/30'
                }`}
              >
                <img
                  src={conversation.partner_avatar}
                  alt={conversation.partner_name}
                  className="h-8 w-8 rounded-full object-cover ring-1 ring-line"
                  onError={(event) => {
                    event.currentTarget.src = '/placeholders/avatar-anya.svg'
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold text-ink">{conversation.partner_name}</p>
                    <div className="flex items-center gap-2">
                      {hasUnread ? (
                        <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-accent px-1 py-0.5 text-[10px] font-semibold text-white">
                          {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
                        </span>
                      ) : null}
                      <p className="text-[10px] text-muted">{timeAgo(conversation.last_message_at)}</p>
                    </div>
                  </div>
                  <p className={`truncate text-[10px] ${hasUnread ? 'font-semibold text-ink' : 'text-muted'}`}>
                    {conversation.last_message}
                  </p>
                  {conversation.request_status === 'pending' ? (
                    <span className="mt-1 inline-flex rounded-full bg-accentSoft px-1.5 py-0.5 text-[10px] font-semibold text-accentStrong">
                      Request pending
                    </span>
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      <section className={`surface min-h-[70vh] flex-col overflow-hidden p-0 ${showMobileThread ? 'flex' : 'hidden lg:flex'}`}>
        {!activeConversation ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted">No conversation selected.</p>
          </div>
        ) : (
          <>
            <header className="border-b border-line bg-white px-4 py-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="btn-muted h-8 w-8 px-0 lg:hidden"
                  onClick={() => setShowMobileThread(false)}
                  aria-label="Close chat"
                >
                  {'<'}
                </button>
                <img
                  src={activeConversation.partner_avatar}
                  alt={activeConversation.partner_name}
                  className="h-10 w-10 rounded-full object-cover ring-1 ring-line"
                  onError={(event) => {
                    event.currentTarget.src = '/placeholders/avatar-anya.svg'
                  }}
                />
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-ink">{activeConversation.partner_name}</h2>
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${partnerOnline ? 'bg-emerald-500' : 'bg-line'}`} />
                    <span className="text-xs text-muted">{partnerOnline ? 'Active now' : 'Offline'}</span>
                    {partnerTyping ? <span className="text-xs text-muted">Typing...</span> : null}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  className="btn-muted h-8 px-3 text-xs text-[#b3261e] hover:border-[#b3261e]"
                  disabled={deletingConversation}
                  onClick={handleDeleteConversation}
                >
                  {deletingConversation ? 'Deleting chat...' : 'Delete chat'}
                </button>
              </div>
              {activeRequestStatus === 'pending' ? (
                <div className="mt-3 rounded-xl border border-line bg-accentSoft/60 p-3">
                  <p className="text-xs text-ink">
                    {activeViewerIsTarget
                      ? 'This user sent you a message request.'
                      : 'Your message request is pending acceptance.'}
                  </p>
                  {activeViewerIsTarget ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={requestActionPending}
                        onClick={() => handleMessageRequestDecision('accepted')}
                      >
                        {requestActionPending ? 'Updating...' : 'Accept'}
                      </button>
                      <button
                        type="button"
                        className="btn-muted"
                        disabled={requestActionPending}
                        onClick={() => handleMessageRequestDecision('rejected')}
                      >
                        Decline
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </header>

            <div
              ref={messagesViewportRef}
              className="flex-1 space-y-2.5 overflow-y-auto bg-[#eef1f5] px-3 py-4 sm:px-5"
            >
              {loadingMessages ? <p className="text-sm text-muted">Loading messages...</p> : null}
              {!loadingMessages && !messages.length ? (
                <p className="text-sm text-muted">No messages yet. Start the conversation.</p>
              ) : null}
              {messages.map((message) => {
                const mine = String(message.sender_id || '') === currentUserId
                const deletingThisMessage = deletingMessageId === String(message.id)
                const sentTimeLabel = formatMessageTime(message.created_at)
                return (
                  <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <article
                      className={`max-w-[85%] rounded-3xl px-3.5 py-2.5 text-sm leading-5 ${
                        mine
                          ? 'rounded-br-lg bg-accent text-white'
                          : 'rounded-bl-lg bg-white text-ink shadow-sm'
                      }`}
                    >
                      {message.content ? <p className="whitespace-pre-wrap break-words">{message.content}</p> : null}
                      {message.image_url ? (
                        <img
                          src={message.image_url}
                          alt="Attachment"
                          className="mt-2 max-h-52 w-full rounded-2xl object-cover"
                          onError={(event) => {
                            event.currentTarget.src = '/placeholders/listing-home.svg'
                          }}
                        />
                      ) : null}
                      {mine ? (
                        <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-white/90">
                          <span>{`${sentTimeLabel} | ${message.is_seen ? 'Seen' : 'Delivered'}`}</span>
                          <button
                            type="button"
                            className="font-semibold text-white/90 underline-offset-2 hover:text-white hover:underline disabled:opacity-60"
                            onClick={() => handleDeleteMessage(message.id)}
                            disabled={deletingThisMessage}
                          >
                            {deletingThisMessage ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      ) : (
                        <p className="mt-1.5 text-[10px] text-muted">{sentTimeLabel}</p>
                      )}
                    </article>
                  </div>
                )
              })}
            </div>

            <form onSubmit={handleSend} className="border-t border-line bg-white px-3 py-3 sm:px-4">
              {attachment ? (
                <div className="mb-2 rounded-xl border border-line bg-white p-2">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-muted">Attachment: {attachment.name}</p>
                    <button
                      type="button"
                      className="text-xs font-semibold text-accent hover:text-accentStrong"
                      onClick={clearAttachment}
                    >
                      Remove
                    </button>
                  </div>
                  <img src={attachment.previewUrl} alt={attachment.name} className="max-h-44 w-full rounded-xl object-cover" />
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <label
                  className={`inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-line bg-white text-xl font-semibold text-muted ${
                    !canMessage || sending ? 'opacity-50' : 'hover:border-accent hover:text-accent'
                  }`}
                  title="Attach image"
                >
                  +
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    disabled={!canMessage || sending}
                    onChange={(event) => handleAttachmentSelect(event.target.files)}
                  />
                </label>
                <input
                  className="input h-10 rounded-full border-line bg-[#f2f4f7] px-4 focus:ring-0"
                  placeholder={composerPlaceholder}
                  value={draft}
                  onChange={handleDraftChange}
                  disabled={!canMessage || sending}
                />
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center rounded-full bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accentStrong disabled:opacity-50"
                  disabled={!canMessage || sending}
                >
                  {sending ? '...' : 'Send'}
                </button>
              </div>
              {composerFeedback ? <p className="mt-2 text-xs text-muted">{composerFeedback}</p> : null}
            </form>
          </>
        )}
      </section>
    </div>
  )
}
