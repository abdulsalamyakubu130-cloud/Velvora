export default function VerifiedBadge({ tier = 'none', className = '', showLabel = false }) {
  if (tier === 'none') return null

  const label = tier === 'enhanced' ? 'Verified Pro' : 'Verified'
  const toneClass =
    tier === 'enhanced'
      ? 'bg-accent text-white ring-1 ring-accent/30'
      : 'bg-accentSoft text-accentStrong ring-1 ring-accent/20'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-1 text-[10px] font-semibold leading-none ${toneClass} ${className}`.trim()}
      title={label}
      aria-label={label}
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.2" />
        <path
          d="M4.7 8.3l2 2 4.6-4.6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showLabel ? <span>{label}</span> : null}
    </span>
  )
}
