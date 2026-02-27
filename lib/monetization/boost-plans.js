export const BOOST_PLAN_OPTIONS = [
  {
    id: 'starter_3d',
    label: 'Starter boost',
    tier: 'starter',
    durationDays: 3,
    amountNgn: 500,
    description: 'Move your listing above non-boosted posts for 3 days.',
  },
  {
    id: 'pro_7d',
    label: 'Pro boost',
    tier: 'standard',
    durationDays: 7,
    amountNgn: 1500,
    description: 'Stronger ranking priority for 7 days.',
  },
  {
    id: 'premium_7d',
    label: 'Premium boost',
    tier: 'premium',
    durationDays: 7,
    amountNgn: 3000,
    description: 'Highest ranking priority for 7 days.',
  },
]

const BOOST_TIER_PRIORITY = {
  starter: 1,
  standard: 2,
  premium: 3,
}

export function getBoostPlanById(planId) {
  return BOOST_PLAN_OPTIONS.find((plan) => plan.id === planId) || null
}

export function getBoostTierPriority(tier) {
  return BOOST_TIER_PRIORITY[String(tier || '').toLowerCase()] || 0
}

export function formatBoostTierLabel(tier) {
  const normalized = String(tier || '').toLowerCase()
  if (normalized === 'premium') return 'Premium'
  if (normalized === 'standard') return 'Pro'
  if (normalized === 'starter') return 'Starter'
  return 'Boost'
}
