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
  const [requestActionPending, setRequestActionPending] = useState(false)
  const typingTimeoutRef = useRef(null)
  const channelRef = useRef(null)

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

  const loadConversations = useCallback(async () => {
    setLoadingConversations(true)
    setStatusMessage('')

    if (!currentUserId) {
      setConversations([])
      setActiveConversationId('')
      setLoadingConversations(false)
      setStatusMessage('Sign in to view your conversations.')
      return
    }

    if (!isSupabaseConfigured) {
      setConversations([])
      setActiveConversationId('')
      setLoadingConversations(false)
      setStatusMessage('Supabase is not configured for chat.')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setConversations([])
      setActiveConversationId('')
      setLoadingConversations(false)
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
      setLoadingConversations(false)
      setStatusMessage(conversationError.message || 'Failed to load conversations.')
      return
    }

    const rawConversations = conversationRows || []
    if (!rawConversations.length) {
      setConversations([])
      setActiveConversationId('')
      setLoadingConversations(false)
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

    const [usersResult, latestMessagesResult, requestRowsResult] = await Promise.all([
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
    ])

    if (requestRowsResult.error && !isMissingTableError(requestRowsResult.error, 'message_requests')) {
      setStatusMessage(requestRowsResult.error.message || 'Failed to load message requests.')
    }

    const requestByConversationId = new Map((requestRowsResult.data || []).map((row) => [row.conversation_id, row]))

    const usersById = new Map((usersResult.data || []).map((row) => [row.id, row]))
    const latestMessageByConversationId = new Map()
    for (const row of latestMessagesResult.data || []) {
      if (!latestMessageByConversationId.has(row.conversation_id)) {
        latestMessageByConversationId.set(row.conversation_id, row)
      }
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
      return mappedConversations[0]?.id || ''
    })
    setStatusMessage(mappedConversations.length ? '' : 'No conversations yet.')
    setLoadingConversations(false)
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
      setActiveConversationId(existingConversationId)
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
      setActiveConversationId(createdConversation.id)
      return
    }

    const requestRow = Array.isArray(requestData) ? requestData[0] : requestData
    if (!requestRow?.conversation_id) return

    await loadConversations()
    setActiveConversationId(requestRow.conversation_id)
  }, [currentUserId, loadConversations, requestedUsername])

  const loadMessages = useCallback(async () => {
    setComposerFeedback('')

    if (!activeConversationId) {
      setMessages([])
      return
    }

    if (!isSupabaseConfigured) {
      setMessages([])
      setComposerFeedback('Supabase is not configured for chat.')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setMessages([])
      setComposerFeedback('Unable to connect to Supabase right now.')
      return
    }

    setLoadingMessages(true)
    const { data, error } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content, image_url, created_at, is_seen')
      .eq('conversation_id', activeConversationId)
      .order('created_at', { ascending: true })
      .limit(200)
    setLoadingMessages(false)

    if (error) {
      setMessages([])
      setComposerFeedback(error.message || 'Failed to load messages.')
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
    if (!isSupabaseConfigured || !activeConversationId || !currentUserId) return undefined
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return undefined

    const partnerId = String(activeConversation?.partner_id || '')
    const channel = supabase
      .channel(`conversation:${activeConversationId}`, { config: { presence: { key: currentUserId } } })
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
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const senderId = String(payload?.sender_id || '')
        if (senderId && senderId !== currentUserId) {
          setPartnerTyping(Boolean(payload?.is_typing))
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
      setPartnerTyping(false)
      setPartnerOnline(false)
      channelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [activeConversation?.partner_id, activeConversation?.partner_name, activeConversationId, currentUserId, loadConversations])

  useEffect(() => {
    if (!messages.length || !activeConversationId) return

    const unseenIncoming = messages.filter(
      (message) => String(message.sender_id || '') !== currentUserId && !message.is_seen,
    )
    if (!unseenIncoming.length || !isSupabaseConfigured) return

    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    const persistedIds = unseenIncoming
      .map((message) => message.id)
      .filter((messageId) => !String(messageId).startsWith('local-'))

    if (!persistedIds.length) return

    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        String(message.sender_id || '') !== currentUserId && !message.is_seen
          ? { ...message, is_seen: true }
          : message,
      ),
    )

    supabase
      .from('messages')
      .update({ is_seen: true })
      .in('id', persistedIds)
      .eq('conversation_id', activeConversationId)
  }, [activeConversationId, currentUserId, messages])

  function broadcastTyping(isTyping) {
    const channel = channelRef.current
    if (!channel || !activeConversationId) return

    channel.send({
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
    <div className="grid gap-5 lg:grid-cols-[320px,minmax(0,1fr)]">
      <aside className="surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="font-brand text-xl font-semibold">Messages</h1>
        </div>

        {loadingConversations ? <p className="mb-3 text-sm text-muted">Loading conversations...</p> : null}
        {statusMessage ? <p className="mb-3 text-sm text-muted">{statusMessage}</p> : null}

        <div className="space-y-2">
          {conversations.map((conversation) => {
            const isActive = conversation.id === activeConversationId

            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setActiveConversationId(conversation.id)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  isActive
                    ? 'border-accent bg-accentSoft'
                    : 'border-line bg-white hover:border-accent hover:bg-accentSoft/60'
                }`}
              >
                <div className="flex items-center gap-2">
                  <img
                    src={conversation.partner_avatar}
                    alt={conversation.partner_name}
                    className="h-9 w-9 rounded-full object-cover"
                    onError={(event) => {
                      event.currentTarget.src = '/placeholders/avatar-anya.svg'
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{conversation.partner_name}</p>
                    <p className="truncate text-sm text-muted">{conversation.last_message}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className="text-[11px] text-muted">{timeAgo(conversation.last_message_at)}</p>
                      {conversation.request_status === 'pending' ? (
                        <span className="rounded-full bg-accentSoft px-2 py-0.5 text-[10px] font-semibold text-accentStrong">
                          Request pending
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      <section className="surface flex min-h-[560px] flex-col p-4">
        {!activeConversation ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted">No conversation selected.</p>
          </div>
        ) : (
          <>
            <div className="mb-4 border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <img
                  src={activeConversation.partner_avatar}
                  alt={activeConversation.partner_name}
                  className="h-10 w-10 rounded-full object-cover"
                  onError={(event) => {
                    event.currentTarget.src = '/placeholders/avatar-anya.svg'
                  }}
                />
                <div>
                  <h2 className="text-lg font-semibold text-ink">{activeConversation.partner_name}</h2>
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${partnerOnline ? 'bg-emerald-500' : 'bg-line'}`} />
                    <span className="text-xs text-muted">{partnerOnline ? 'Online' : 'Offline'}</span>
                    {partnerTyping ? <span className="text-xs text-muted">Typing...</span> : null}
                  </div>
                </div>
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
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto pr-2">
              {loadingMessages ? <p className="text-sm text-muted">Loading messages...</p> : null}
              {!loadingMessages && !messages.length ? (
                <p className="text-sm text-muted">No messages yet. Start the conversation.</p>
              ) : null}
              {messages.map((message) => {
                const mine = String(message.sender_id || '') === currentUserId
                return (
                  <div
                    key={message.id}
                    className={`max-w-[82%] rounded-2xl px-4 py-2 text-sm ${
                      mine ? 'ml-auto bg-accent text-white' : 'bg-accentSoft text-ink'
                    }`}
                  >
                    {message.content ? <p>{message.content}</p> : null}
                    {message.image_url ? (
                      <img
                        src={message.image_url}
                        alt="Attachment"
                        className="mt-2 max-h-52 w-full rounded-xl object-cover"
                        onError={(event) => {
                          event.currentTarget.src = '/placeholders/listing-home.svg'
                        }}
                      />
                    ) : null}
                    <div className={`mt-1 text-[11px] ${mine ? 'text-white/80' : 'text-muted'}`}>
                      {timeAgo(message.created_at)} | {mine ? (message.is_seen ? 'Seen' : 'Delivered') : 'Received'}
                    </div>
                  </div>
                )
              })}
            </div>

            <form onSubmit={handleSend} className="mt-4 space-y-2">
              {attachment ? (
                <div className="rounded-xl border border-line bg-white p-2">
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
                  <img src={attachment.previewUrl} alt={attachment.name} className="max-h-44 w-full rounded-lg object-cover" />
                </div>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-[1fr,auto,auto]">
                <input
                  className="input"
                  placeholder={composerPlaceholder}
                  value={draft}
                  onChange={handleDraftChange}
                  disabled={!canMessage || sending}
                />
                <label className={`btn-muted cursor-pointer ${!canMessage || sending ? 'opacity-50' : ''}`}>
                  Attach image
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    disabled={!canMessage || sending}
                    onChange={(event) => handleAttachmentSelect(event.target.files)}
                  />
                </label>
                <button type="submit" className="btn-primary" disabled={!canMessage || sending}>
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
              {composerFeedback ? <p className="text-xs text-muted">{composerFeedback}</p> : null}
            </form>
          </>
        )}
      </section>
    </div>
  )
}
