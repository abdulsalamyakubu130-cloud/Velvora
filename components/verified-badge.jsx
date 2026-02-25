export default function VerifiedBadge({ tier = 'none', className = '', showLabel = false }) {
  if (tier === 'none') return null

  const label = tier === 'enhanced' ? 'Verified Pro' : 'Verified'
  const toneClass =
    tier === 'enhanced'
      ? 'bg-[#b8860b] text-[#fff8e1] ring-1 ring-[#d4af37]'
      : 'bg-[#fff7da] text-[#8a6a00] ring-1 ring-[#e0c15a]'

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
