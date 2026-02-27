export default function VerifiedBadge({ tier = 'none', className = '', showLabel = false }) {
  if (tier === 'none') return null

  const label = tier === 'enhanced' ? 'Verified Pro' : 'Verified'
  const toneClass =
    tier === 'enhanced'
      ? 'bg-[#eaf2ff] text-[#0f4ed8] ring-1 ring-[#c7d9ff]'
      : 'bg-[#f2f6ff] text-[#355ecf] ring-1 ring-[#d3e0ff]'

  return (
    <span
      className={`inline-flex items-center rounded-full ${showLabel ? 'gap-1 px-1.5 py-0.5 text-[9px]' : 'h-4 w-4 justify-center'} font-semibold leading-none ${toneClass} ${className}`.trim()}
      title={label}
      aria-label={label}
    >
      <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.24" />
        <path
          d="M4.7 8.3l2 2 4.6-4.6"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showLabel ? <span className="leading-none">{label}</span> : null}
    </span>
  )
}
