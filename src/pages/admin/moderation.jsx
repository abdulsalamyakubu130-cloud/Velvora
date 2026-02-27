import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { buildProfilePath, normalizeVerificationTier } from '@/lib/utils'
import { formatBoostTierLabel } from '@/lib/monetization/boost-plans'
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { useAuth } from '@/src/context/auth-context'

const initialOverview = {
  totalUsers: 0,
  verifiedUsers: 0,
  pendingVerification: 0,
  bannedUsers: 0,
  openReports: 0,
  flaggedUsers: 0,
  blockedActions: 0,
  pendingBoostOrders: 0,
  activeBoosts: 0,
}

function formatTierLabel(tier) {
  if (tier === 'enhanced') return 'Enhanced'
  if (tier === 'basic') return 'Basic'
  return 'Unverified'
}

function formatDateTime(value) {
  if (!value) return 'N/A'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'N/A'
  return parsed.toLocaleString()
}

function normalizeStatus(status) {
  if (status === 'restricted') return 'restricted'
  if (status === 'banned') return 'banned'
  return 'active'
}

function statusBadgeClass(status) {
  if (status === 'banned') return 'rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700'
  if (status === 'restricted') return 'rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700'
  return 'pill'
}

function statusLabel(status) {
  if (status === 'banned') return 'Banned'
  if (status === 'restricted') return 'Restricted'
  return 'Active'
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

function normalizeBoostStatus(status) {
  if (status === 'active') return 'active'
  if (status === 'rejected') return 'rejected'
  if (status === 'expired') return 'expired'
  if (status === 'cancelled') return 'cancelled'
  return 'pending'
}

function boostStatusBadgeClass(status) {
  const normalized = normalizeBoostStatus(status)
  if (normalized === 'active') return 'rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700'
  if (normalized === 'pending') return 'rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700'
  if (normalized === 'rejected') return 'rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700'
  if (normalized === 'expired') return 'rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700'
  return 'pill'
}

function boostStatusLabel(status) {
  const normalized = normalizeBoostStatus(status)
  if (normalized === 'active') return 'Active'
  if (normalized === 'pending') return 'Pending payment'
  if (normalized === 'rejected') return 'Rejected'
  if (normalized === 'expired') return 'Expired'
  if (normalized === 'cancelled') return 'Cancelled'
  return 'Pending payment'
}

export default function ModerationPage() {
  const { user: authUser } = useAuth()
  const [overview, setOverview] = useState(initialOverview)
  const [users, setUsers] = useState([])
  const [pendingKycRequests, setPendingKycRequests] = useState([])
  const [boostOrders, setBoostOrders] = useState([])
  const [searchValue, setSearchValue] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [actionPendingRequestId, setActionPendingRequestId] = useState('')
  const [boostActionOrderId, setBoostActionOrderId] = useState('')
  const [accountActionUserId, setAccountActionUserId] = useState('')
  const [feedback, setFeedback] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [warningMessage, setWarningMessage] = useState('')
  const [statusFeatureEnabled, setStatusFeatureEnabled] = useState(true)

  const isLikelyAdmin = useMemo(() => {
    const roleFromAppMetadata = authUser?.app_metadata?.role
    const roleFromUserMetadata = authUser?.user_metadata?.role
    const roleFromAuthObject = authUser?.role
    return [roleFromAppMetadata, roleFromUserMetadata, roleFromAuthObject].includes('admin')
  }, [authUser])

  const filteredUsers = useMemo(() => {
    const query = searchValue.trim().toLowerCase()
    return users.filter((item) => {
      const targetStatus = normalizeStatus(item.account_status)
      const matchesStatus = statusFilter === 'all' || targetStatus === statusFilter
      const matchesSearch =
        !query ||
        String(item.username || '').toLowerCase().includes(query) ||
        String(item.full_name || '').toLowerCase().includes(query) ||
        String(item.email || '').toLowerCase().includes(query)
      return matchesStatus && matchesSearch
    })
  }, [searchValue, statusFilter, users])

  const loadModerationData = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (!isSupabaseConfigured) {
          setErrorMessage('Supabase is not configured. Add env keys to use moderation actions.')
          setOverview(initialOverview)
          setUsers([])
          setPendingKycRequests([])
          setBoostOrders([])
          setIsLoading(false)
          setIsRefreshing(false)
          return
        }

        const supabase = getSupabaseBrowserClient()
        if (!supabase) {
          setErrorMessage('Unable to connect to Supabase in this browser session.')
          setOverview(initialOverview)
          setUsers([])
          setPendingKycRequests([])
          setBoostOrders([])
          setIsLoading(false)
          setIsRefreshing(false)
          return
        }

        if (silent) {
          setIsRefreshing(true)
        } else {
          setIsLoading(true)
        }
        setErrorMessage('')
        setWarningMessage('')

        const usersQueryWithTier = supabase
          .from('users')
          .select('id, username, full_name, email, country, is_verified, verification_tier, created_at')
          .order('created_at', { ascending: false })
          .limit(300)

        let usersResult = await usersQueryWithTier
        const usersTierMissing = String(usersResult.error?.message || '')
          .toLowerCase()
          .includes('verification_tier')

        if (usersTierMissing) {
          usersResult = await supabase
            .from('users')
            .select('id, username, full_name, email, country, is_verified, created_at')
            .order('created_at', { ascending: false })
            .limit(300)
        }

        const [reportsResult, pendingKycResult, blockedUsersResult, usersCountResult, verifiedUsersCountResult, boostOrdersResult] = await Promise.all([
          supabase.from('reports').select('id, user_id'),
          supabase
            .from('kyc_verifications')
            .select(
              `
                id,
                user_id,
                tier_requested,
                status,
                notes,
                created_at
              `,
            )
            .eq('status', 'pending')
            .order('created_at', { ascending: true }),
          supabase.from('blocked_users').select('id', { head: true, count: 'exact' }),
          supabase.from('users').select('id', { head: true, count: 'exact' }),
          supabase.from('users').select('id', { head: true, count: 'exact' }).eq('is_verified', true),
          supabase
            .from('post_boost_orders')
            .select(
              `
                id,
                user_id,
                post_id,
                plan_id,
                boost_tier,
                amount_ngn,
                duration_days,
                status,
                payment_reference,
                created_at,
                starts_at,
                ends_at
              `,
            )
            .order('created_at', { ascending: false })
            .limit(300),
        ])

        const primaryError = usersResult.error || usersCountResult.error || verifiedUsersCountResult.error
        if (primaryError) {
          const normalized = String(primaryError.message || '').toLowerCase()
          const isPermissionError =
            normalized.includes('permission denied') ||
            normalized.includes('row-level security') ||
            normalized.includes('not authorized')
          const isNetworkError = normalized.includes('failed to fetch')

          setErrorMessage(
            isPermissionError
              ? 'Admin permission required. Ensure your admin email is allowlisted and RLS policies permit control-room admins.'
              : isNetworkError
                ? 'Cannot reach Supabase right now. Check your internet and Supabase URL/key, then refresh.'
                : primaryError.message || 'Failed to load admin data.',
          )

          setOverview(initialOverview)
          setUsers([])
          setPendingKycRequests([])
          setBoostOrders([])
          setIsLoading(false)
          setIsRefreshing(false)
          return
        }

        const reports = reportsResult.data || []
        const flaggedUserIds = new Set(reports.map((item) => item.user_id).filter(Boolean))
        const pendingRows = pendingKycResult.data || []
        const usersRows = (usersResult.data || []).map((row) => ({
          ...row,
          verification_tier: normalizeVerificationTier(row.verification_tier, row.is_verified),
        }))
        const usersById = new Map(usersRows.map((row) => [row.id, row]))

        const loadWarnings = []
        if (reportsResult.error) loadWarnings.push('Could not load reports.')
        if (pendingKycResult.error) loadWarnings.push('Could not load pending KYC queue.')
        if (blockedUsersResult.error) loadWarnings.push('Could not load blocked actions count.')
        const boostOrdersTableMissing = isMissingTableError(boostOrdersResult.error, 'post_boost_orders')
        if (boostOrdersResult.error && boostOrdersTableMissing) {
          loadWarnings.push('Run supabase/post_boosts.sql to enable paid boost orders.')
        } else if (boostOrdersResult.error) {
          loadWarnings.push(boostOrdersResult.error.message || 'Could not load boost orders.')
        }

        const missingProfileIds = [...new Set(
          pendingRows
            .map((request) => request.user_id)
            .filter((id) => Boolean(id) && !usersById.has(id)),
        )]

        if (missingProfileIds.length) {
          const missingProfilesResult = await supabase
            .from('users')
            .select('id, username, full_name, email, country, is_verified, verification_tier')
            .in('id', missingProfileIds)

          if (missingProfilesResult.error) {
            loadWarnings.push('Could not load profile details for some KYC requests.')
          } else {
            for (const row of missingProfilesResult.data || []) {
              usersById.set(row.id, {
                ...row,
                verification_tier: normalizeVerificationTier(row.verification_tier, row.is_verified),
              })
            }
          }
        }

        const boostRows = boostOrdersResult.data || []
        const boostUserIds = [...new Set(boostRows.map((row) => row.user_id).filter(Boolean))]
        const missingBoostSellerIds = boostUserIds.filter((id) => !usersById.has(id))

        if (missingBoostSellerIds.length) {
          const missingBoostSellersResult = await supabase
            .from('users')
            .select('id, username, full_name, email, country, is_verified, verification_tier')
            .in('id', missingBoostSellerIds)

          if (missingBoostSellersResult.error) {
            loadWarnings.push('Could not load profile details for some boost orders.')
          } else {
            for (const row of missingBoostSellersResult.data || []) {
              usersById.set(row.id, {
                ...row,
                verification_tier: normalizeVerificationTier(row.verification_tier, row.is_verified),
              })
            }
          }
        }

        const boostPostIds = [...new Set(boostRows.map((row) => row.post_id).filter(Boolean))]
        let boostPostsById = new Map()
        if (boostPostIds.length) {
          const boostPostsResult = await supabase.from('posts').select('id, title').in('id', boostPostIds)

          if (boostPostsResult.error) {
            loadWarnings.push('Could not load post details for some boost orders.')
          } else {
            boostPostsById = new Map((boostPostsResult.data || []).map((row) => [row.id, row]))
          }
        }

        const mappedBoostOrders = boostRows.map((row) => {
          const seller = usersById.get(row.user_id) || null
          const post = boostPostsById.get(row.post_id) || null
          const endsAtUnix = new Date(row.ends_at || 0).getTime()
          const isActiveNow =
            normalizeBoostStatus(row.status) === 'active' &&
            Number.isFinite(endsAtUnix) &&
            endsAtUnix > Date.now()

          return {
            id: row.id,
            userId: row.user_id,
            postId: row.post_id,
            planId: row.plan_id || '',
            boostTier: row.boost_tier || '',
            amountNgn: Number(row.amount_ngn) || 0,
            durationDays: Number(row.duration_days) || 0,
            status: isActiveNow ? 'active' : normalizeBoostStatus(row.status),
            paymentReference: row.payment_reference || '',
            createdAt: row.created_at || null,
            startsAt: row.starts_at || null,
            endsAt: row.ends_at || null,
            postTitle: post?.title || 'Untitled post',
            seller: seller
              ? {
                  id: seller.id,
                  username: seller.username || '',
                  full_name: seller.full_name || seller.username || 'Seller',
                  email: seller.email || '',
                }
              : null,
          }
        })

        const statusRowsResult = await supabase.from('user_account_status').select('user_id, status, reason, updated_at')

        const statusByUserId = new Map()
        let bannedUsersCount = 0
        let canManageStatus = true

        if (statusRowsResult.error) {
          const normalized = String(statusRowsResult.error.message || '').toLowerCase()
          const statusTableMissing = normalized.includes('relation') && normalized.includes('user_account_status')
          const isNetworkError = normalized.includes('failed to fetch')

          if (statusTableMissing) {
            canManageStatus = false
            loadWarnings.push('Run supabase/admin_account_status.sql to enable account status and ban controls.')
          } else if (isNetworkError) {
            canManageStatus = false
            loadWarnings.push('Could not reach Supabase for account status. Try again in a moment.')
          } else {
            loadWarnings.push(statusRowsResult.error.message || 'Could not load account status table.')
          }
        } else {
          for (const row of statusRowsResult.data || []) {
            const normalizedStatus = normalizeStatus(row.status)
            statusByUserId.set(row.user_id, {
              status: normalizedStatus,
              reason: row.reason || '',
              updated_at: row.updated_at || null,
            })
            if (normalizedStatus === 'banned') {
              bannedUsersCount += 1
            }
          }
        }

        const usersWithStatus = usersRows.map((row) => {
          const accountStatus = statusByUserId.get(row.id)
          return {
            ...row,
            account_status: accountStatus?.status || 'active',
            account_status_reason: accountStatus?.reason || '',
            account_status_updated_at: accountStatus?.updated_at || null,
          }
        })

        const nextPendingKycRequests = pendingRows.map((request) => {
          const linkedUser = usersById.get(request.user_id) || null
          return {
            id: request.id,
            userId: request.user_id,
            tierRequested: request.tier_requested,
            notes: request.notes || '',
            createdAt: request.created_at,
            profile: linkedUser || null,
          }
        })

        const pendingBoostOrdersCount = mappedBoostOrders.filter((order) => normalizeBoostStatus(order.status) === 'pending').length
        const activeBoostOrdersCount = mappedBoostOrders.filter((order) => {
          if (normalizeBoostStatus(order.status) !== 'active') return false
          const endsAtUnix = new Date(order.endsAt || 0).getTime()
          return Number.isFinite(endsAtUnix) && endsAtUnix > Date.now()
        }).length

        setOverview({
          totalUsers: Number(usersCountResult.count) || usersWithStatus.length,
          verifiedUsers: Number(verifiedUsersCountResult.count) || usersWithStatus.filter((row) => row.is_verified).length,
          pendingVerification: nextPendingKycRequests.length,
          bannedUsers: bannedUsersCount,
          openReports: reports.length,
          flaggedUsers: flaggedUserIds.size,
          blockedActions: Number(blockedUsersResult.count) || 0,
          pendingBoostOrders: pendingBoostOrdersCount,
          activeBoosts: activeBoostOrdersCount,
        })
        setUsers(usersWithStatus)
        setPendingKycRequests(nextPendingKycRequests)
        setBoostOrders(mappedBoostOrders)
        setStatusFeatureEnabled(canManageStatus)
        setWarningMessage(loadWarnings.join(' '))
        setIsLoading(false)
        setIsRefreshing(false)
      } catch (error) {
        const message = String(error?.message || error || 'Failed to load admin data.')
        const normalized = message.toLowerCase()
        const isNetworkError = normalized.includes('failed to fetch')

        setOverview(initialOverview)
        setUsers([])
        setPendingKycRequests([])
        setBoostOrders([])
        setStatusFeatureEnabled(false)
        setErrorMessage(
          isNetworkError
            ? 'Cannot reach Supabase right now. Check internet and Supabase API keys, then refresh.'
            : message,
        )
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [],
  )

  useEffect(() => {
    loadModerationData()
  }, [loadModerationData])

  async function handleVerificationDecision(request, decision) {
    if (!authUser?.id) return

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setErrorMessage('Unable to connect to Supabase right now.')
      return
    }

    setActionPendingRequestId(request.id)
    setFeedback('')
    setErrorMessage('')

    const reviewedAt = new Date().toISOString()

    let kycUpdateResult = await supabase
      .from('kyc_verifications')
      .update({
        status: decision,
        reviewed_by: authUser.id,
        reviewed_at: reviewedAt,
      })
      .eq('id', request.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    const kycUpdateErrorMessage = String(kycUpdateResult.error?.message || '').toLowerCase()
    const reviewedByForeignKeyError =
      kycUpdateErrorMessage.includes('foreign key') && kycUpdateErrorMessage.includes('reviewed_by')

    // Some projects created admin users before auth->public.users sync; retry without reviewed_by in that case.
    if (reviewedByForeignKeyError) {
      kycUpdateResult = await supabase
        .from('kyc_verifications')
        .update({
          status: decision,
          reviewed_at: reviewedAt,
        })
        .eq('id', request.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()
    }

    if (kycUpdateResult.error) {
      setActionPendingRequestId('')
      const normalized = String(kycUpdateResult.error.message || '').toLowerCase()
      const isPermissionError =
        normalized.includes('row-level security') || normalized.includes('permission denied') || normalized.includes('not authorized')
      setErrorMessage(
        isPermissionError
          ? 'Approve failed: admin KYC update is blocked by RLS. Update kyc_verifications admin policies in Supabase.'
          : kycUpdateResult.error.message || 'Failed to update verification request.',
      )
      return
    }

    if (!kycUpdateResult.data) {
      setActionPendingRequestId('')
      setFeedback('This request is no longer pending. Panel refreshed.')
      await loadModerationData({ silent: true })
      return
    }

    if (decision === 'approved') {
      const verificationTier = request.tierRequested === 'enhanced' ? 'enhanced' : 'basic'
      const { data: updatedUserRow, error: updateUserError } = await supabase
        .from('users')
        .update({ is_verified: true, verification_tier: verificationTier })
        .eq('id', request.userId)
        .select('id')
        .maybeSingle()

      if (updateUserError) {
        setActionPendingRequestId('')
        const normalized = String(updateUserError.message || '').toLowerCase()
        const isPermissionError =
          normalized.includes('row-level security') || normalized.includes('permission denied') || normalized.includes('not authorized')
        setErrorMessage(
          isPermissionError
            ? 'Request was reviewed, but updating user verification tier is blocked by RLS on users table. Update admin users policy in Supabase.'
            : updateUserError.message || 'Verification decision saved, but user profile update failed.',
        )
        await loadModerationData({ silent: true })
        return
      }

      if (!updatedUserRow) {
        setActionPendingRequestId('')
        setErrorMessage(
          'Request was reviewed, but user verification flag was not updated. Fix users table admin update policy, then sync approved KYC to users.',
        )
        await loadModerationData({ silent: true })
        return
      }
    }

    setActionPendingRequestId('')
    setFeedback(
      decision === 'approved'
        ? `Approved ${request.profile?.username || 'user'} for ${formatTierLabel(request.tierRequested)} verification.`
        : `Rejected ${request.profile?.username || 'user'} verification request.`,
    )
    await loadModerationData({ silent: true })
  }

  async function handleAccountStatusChange(targetUser, nextStatus) {
    if (!authUser?.id || !targetUser?.id) return
    if (!statusFeatureEnabled) {
      setErrorMessage('Account status controls are not enabled yet. Run supabase/admin_account_status.sql first.')
      return
    }
    if (targetUser.id === authUser.id && nextStatus === 'banned') {
      setErrorMessage('You cannot ban your own admin account.')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setErrorMessage('Unable to connect to Supabase right now.')
      return
    }

    setAccountActionUserId(targetUser.id)
    setFeedback('')
    setErrorMessage('')

    const reason =
      nextStatus === 'banned'
        ? 'Banned by admin'
        : nextStatus === 'restricted'
          ? 'Restricted by admin'
          : 'Restored to active by admin'

    const { error } = await supabase.from('user_account_status').upsert(
      {
        user_id: targetUser.id,
        status: nextStatus,
        reason,
        updated_by: authUser.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )

    setAccountActionUserId('')

    if (error) {
      setErrorMessage(error.message || 'Failed to update account status.')
      return
    }

    setFeedback(`Updated @${targetUser.username || 'user'} account status to ${statusLabel(nextStatus).toLowerCase()}.`)
    await loadModerationData({ silent: true })
  }

  async function handleBoostOrderDecision(order, nextStatus) {
    if (!authUser?.id || !order?.id) return

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setErrorMessage('Unable to connect to Supabase right now.')
      return
    }

    setBoostActionOrderId(order.id)
    setFeedback('')
    setErrorMessage('')

    const nowIso = new Date().toISOString()
    const durationDays = Number(order.durationDays) > 0 ? Number(order.durationDays) : 3

    let updatePayload
    if (nextStatus === 'active') {
      updatePayload = {
        status: 'active',
        starts_at: nowIso,
        ends_at: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString(),
        reviewed_by: authUser.id,
        reviewed_at: nowIso,
      }
    } else if (nextStatus === 'expired') {
      updatePayload = {
        status: 'expired',
        ends_at: nowIso,
        reviewed_by: authUser.id,
        reviewed_at: nowIso,
      }
    } else {
      updatePayload = {
        status: 'rejected',
        starts_at: null,
        ends_at: null,
        reviewed_by: authUser.id,
        reviewed_at: nowIso,
      }
    }

    let updateResult = await supabase
      .from('post_boost_orders')
      .update(updatePayload)
      .eq('id', order.id)
      .select('id')
      .maybeSingle()

    const reviewedByForeignKeyError = String(updateResult.error?.message || '')
      .toLowerCase()
      .includes('reviewed_by')

    if (reviewedByForeignKeyError) {
      const fallbackPayload = { ...updatePayload }
      delete fallbackPayload.reviewed_by
      updateResult = await supabase
        .from('post_boost_orders')
        .update(fallbackPayload)
        .eq('id', order.id)
        .select('id')
        .maybeSingle()
    }

    setBoostActionOrderId('')

    if (updateResult.error) {
      setErrorMessage(
        isMissingTableError(updateResult.error, 'post_boost_orders')
          ? 'Boost table is missing. Run supabase/post_boosts.sql first.'
          : updateResult.error.message || 'Failed to update boost order.',
      )
      return
    }

    if (!updateResult.data) {
      const { data: latestOrder } = await supabase
        .from('post_boost_orders')
        .select('id, status')
        .eq('id', order.id)
        .maybeSingle()

      const latestStatus = normalizeBoostStatus(latestOrder?.status)
      const originalStatus = normalizeBoostStatus(order.status)

      if (latestOrder?.id && latestStatus === originalStatus) {
        setErrorMessage(
          'Boost update is blocked by Supabase RLS. Add your admin email to `is_marketplace_admin()` in `supabase/post_boosts.sql` and run it again.',
        )
      } else {
        setFeedback('Boost order is no longer editable. Panel refreshed.')
      }
      await loadModerationData({ silent: true })
      return
    }

    if (nextStatus === 'active') {
      setFeedback(`Boost activated for "${order.postTitle}".`)
    } else if (nextStatus === 'expired') {
      setFeedback(`Boost expired for "${order.postTitle}".`)
    } else {
      setFeedback(`Boost order rejected for "${order.postTitle}".`)
    }

    await loadModerationData({ silent: true })
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3 sm:space-y-4">
      <header className="surface p-4 sm:p-5">
        <h1 className="font-brand text-xl font-semibold sm:text-2xl">Admin Panel</h1>
        <p className="mt-1 text-sm text-muted">
          Separate control center for verification, account status review, and enforcement actions.
        </p>
        {!isLikelyAdmin ? (
          <p className="mt-2 text-xs text-muted">
            Account metadata does not show admin role yet. Supabase JWT role still decides permission.
          </p>
        ) : null}
      </header>

      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
        <article className="surface p-3 sm:p-4">
          <p className="text-sm text-muted">People on website</p>
          <p className="mt-1 text-lg font-semibold text-ink sm:text-2xl">{overview.totalUsers.toLocaleString()}</p>
        </article>
        <article className="surface p-3 sm:p-4">
          <p className="text-sm text-muted">Verified users</p>
          <p className="mt-1 text-lg font-semibold text-ink sm:text-2xl">{overview.verifiedUsers.toLocaleString()}</p>
        </article>
        <article className="surface p-3 sm:p-4">
          <p className="text-sm text-muted">Pending KYC</p>
          <p className="mt-1 text-lg font-semibold text-ink sm:text-2xl">{overview.pendingVerification.toLocaleString()}</p>
        </article>
        <article className="surface p-3 sm:p-4">
          <p className="text-sm text-muted">Banned users</p>
          <p className="mt-1 text-lg font-semibold text-ink sm:text-2xl">{overview.bannedUsers.toLocaleString()}</p>
        </article>
        <article className="surface p-3 sm:p-4">
          <p className="text-sm text-muted">Open reports</p>
          <p className="mt-1 text-lg font-semibold text-ink sm:text-2xl">{overview.openReports.toLocaleString()}</p>
        </article>
        <article className="surface p-3 sm:p-4">
          <p className="text-sm text-muted">Flagged users</p>
          <p className="mt-1 text-lg font-semibold text-ink sm:text-2xl">{overview.flaggedUsers.toLocaleString()}</p>
        </article>
        <article className="surface col-span-2 p-3 sm:col-span-2 sm:p-4">
          <p className="text-sm text-muted">Blocked actions</p>
          <p className="mt-1 text-lg font-semibold text-ink sm:text-2xl">{overview.blockedActions.toLocaleString()}</p>
        </article>
        <article className="surface p-3 sm:p-4">
          <p className="text-sm text-muted">Pending boosts</p>
          <p className="mt-1 text-lg font-semibold text-ink sm:text-2xl">{overview.pendingBoostOrders.toLocaleString()}</p>
        </article>
        <article className="surface p-3 sm:p-4">
          <p className="text-sm text-muted">Active boosts</p>
          <p className="mt-1 text-lg font-semibold text-ink sm:text-2xl">{overview.activeBoosts.toLocaleString()}</p>
        </article>
      </section>

      <section className="surface p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-ink sm:text-lg">Account status and user controls</h2>
          <button
            type="button"
            className="btn-muted text-xs sm:text-sm"
            onClick={() => loadModerationData({ silent: true })}
            disabled={isLoading || isRefreshing}
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh panel'}
          </button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr),200px]">
          <input
            className="input"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Search by username, full name, or email"
          />
          <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="restricted">Restricted</option>
            <option value="banned">Banned</option>
          </select>
        </div>

        {feedback ? <p className="mt-3 text-sm text-muted">{feedback}</p> : null}
        {errorMessage ? <p className="mt-3 text-sm text-muted">{errorMessage}</p> : null}
        {warningMessage ? <p className="mt-3 text-sm text-muted">{warningMessage}</p> : null}
        {!statusFeatureEnabled ? (
          <p className="mt-2 text-xs text-muted">Run `supabase/admin_account_status.sql` to enable ban/status actions.</p>
        ) : null}

        {isLoading ? <p className="mt-3 text-sm text-muted">Loading users...</p> : null}

        {!isLoading && !filteredUsers.length ? <p className="mt-3 text-sm text-muted">No users found for this filter.</p> : null}

        {!isLoading && filteredUsers.length ? (
          <div className="mt-3 space-y-3">
            {filteredUsers.map((targetUser) => {
              const currentStatus = normalizeStatus(targetUser.account_status)
              const verificationTier = normalizeVerificationTier(targetUser.verification_tier, targetUser.is_verified)
              const hasUsername = Boolean(targetUser.username)

              return (
                <article key={targetUser.id} className="rounded-2xl border border-line bg-white p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {targetUser.full_name || 'Unnamed user'} (@{targetUser.username || 'unknown'})
                      </p>
                      <p className="text-xs text-muted">
                        {targetUser.email || 'No email'} | {targetUser.country || 'No country'} | Joined {formatDateTime(targetUser.created_at)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={statusBadgeClass(currentStatus)}>{statusLabel(currentStatus)}</span>
                        <span className="pill">{formatTierLabel(verificationTier)}</span>
                        <span className="text-xs text-muted">ID: {targetUser.id}</span>
                      </div>
                      {targetUser.account_status_reason ? (
                        <p className="mt-1 text-xs text-muted">Reason: {targetUser.account_status_reason}</p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {hasUsername ? (
                        <Link to={buildProfilePath(targetUser)} className="btn-muted text-xs sm:text-sm">
                          Open profile
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        className="btn-muted text-xs sm:text-sm"
                        onClick={() => handleAccountStatusChange(targetUser, 'active')}
                        disabled={accountActionUserId === targetUser.id || !statusFeatureEnabled}
                      >
                        Activate
                      </button>
                      <button
                        type="button"
                        className="btn-muted text-xs sm:text-sm"
                        onClick={() => handleAccountStatusChange(targetUser, 'restricted')}
                        disabled={accountActionUserId === targetUser.id || !statusFeatureEnabled}
                      >
                        Restrict
                      </button>
                      <button
                        type="button"
                        className="btn-muted text-xs sm:text-sm"
                        onClick={() => handleAccountStatusChange(targetUser, 'banned')}
                        disabled={accountActionUserId === targetUser.id || !statusFeatureEnabled}
                      >
                        {accountActionUserId === targetUser.id ? 'Saving...' : 'Ban user'}
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        ) : null}
      </section>

      <section className="surface p-3 sm:p-4">
        <h2 className="text-base font-semibold text-ink sm:text-lg">Pending KYC verification requests</h2>
        {!isLoading && !pendingKycRequests.length ? (
          <p className="mt-3 text-sm text-muted">No pending KYC requests right now.</p>
        ) : null}

        {!isLoading && pendingKycRequests.length ? (
          <div className="mt-3 space-y-3">
            {pendingKycRequests.map((request) => (
              <article key={request.id} className="rounded-2xl border border-line bg-white p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {request.profile?.full_name || 'Unnamed user'} (@{request.profile?.username || 'unknown'})
                    </p>
                    <p className="text-xs text-muted">
                      Email: {request.profile?.email || 'Not available'} | Country: {request.profile?.country || 'N/A'}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Requested tier: {formatTierLabel(request.tierRequested)} | Submitted: {formatDateTime(request.createdAt)}
                    </p>
                    {request.notes ? <p className="mt-1 text-xs text-muted">Notes: {request.notes}</p> : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary text-xs sm:text-sm"
                      onClick={() => handleVerificationDecision(request, 'approved')}
                      disabled={actionPendingRequestId === request.id}
                    >
                      {actionPendingRequestId === request.id ? 'Saving...' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      className="btn-muted text-xs sm:text-sm"
                      onClick={() => handleVerificationDecision(request, 'rejected')}
                      disabled={actionPendingRequestId === request.id}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="surface p-3 sm:p-4">
        <h2 className="text-base font-semibold text-ink sm:text-lg">Post boost orders</h2>
        <p className="mt-1 text-sm text-muted">
          Approve paid boost orders to move listings higher in Home and Explore.
        </p>
        {!isLoading && !boostOrders.length ? (
          <p className="mt-3 text-sm text-muted">No boost orders yet.</p>
        ) : null}

        {!isLoading && boostOrders.length ? (
          <div className="mt-3 space-y-3">
            {boostOrders.map((order) => {
              const isPending = normalizeBoostStatus(order.status) === 'pending'
              const isActive = normalizeBoostStatus(order.status) === 'active'
              const sellerHasUsername = Boolean(order.seller?.username)
              return (
                <article key={order.id} className="rounded-2xl border border-line bg-white p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{order.postTitle}</p>
                      <p className="text-xs text-muted">
                        Seller: {order.seller?.full_name || 'Unknown'} (@{order.seller?.username || 'unknown'})
                      </p>
                      <p className="text-xs text-muted">
                        Plan: {formatBoostTierLabel(order.boostTier)} | N{order.amountNgn.toLocaleString()} | {order.durationDays} days
                      </p>
                      <p className="text-xs text-muted">
                        Ref: {order.paymentReference || 'N/A'} | Created: {formatDateTime(order.createdAt)}
                      </p>
                      {order.startsAt ? (
                        <p className="text-xs text-muted">
                          Active window: {formatDateTime(order.startsAt)} to {formatDateTime(order.endsAt)}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className={boostStatusBadgeClass(order.status)}>{boostStatusLabel(order.status)}</span>
                      {sellerHasUsername ? (
                        <Link to={buildProfilePath(order.seller)} className="btn-muted text-xs sm:text-sm">
                          Seller profile
                        </Link>
                      ) : null}
                      {isPending ? (
                        <>
                          <button
                            type="button"
                            className="btn-primary text-xs sm:text-sm"
                            onClick={() => handleBoostOrderDecision(order, 'active')}
                            disabled={boostActionOrderId === order.id}
                          >
                            {boostActionOrderId === order.id ? 'Saving...' : 'Activate boost'}
                          </button>
                          <button
                            type="button"
                            className="btn-muted text-xs sm:text-sm"
                            onClick={() => handleBoostOrderDecision(order, 'rejected')}
                            disabled={boostActionOrderId === order.id}
                          >
                            Reject
                          </button>
                        </>
                      ) : null}
                      {isActive ? (
                        <button
                          type="button"
                          className="btn-muted text-xs sm:text-sm"
                          onClick={() => handleBoostOrderDecision(order, 'expired')}
                          disabled={boostActionOrderId === order.id}
                        >
                          {boostActionOrderId === order.id ? 'Saving...' : 'Expire now'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        ) : null}
      </section>
    </div>
  )
}
