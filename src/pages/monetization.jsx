const monetizationItems = [
  {
    title: 'Sponsored posts',
    detail: 'Promote listings at top of feed and explore.',
  },
  {
    title: 'Boost visibility',
    detail: 'Time-based paid boosts for selected listings.',
  },
  {
    title: 'Featured sellers',
    detail: 'Homepage spotlight slots for premium sellers.',
  },
  {
    title: 'Verified badge subscription',
    detail: 'Monthly plan for identity and trust badge checks.',
  },
  {
    title: 'Homepage banner ads',
    detail: 'Native placements for relevant commerce campaigns.',
  },
  {
    title: 'Premium seller tools',
    detail: 'Analytics, conversion funnels, and auto-reply tools.',
  },
]

export default function MonetizationPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <header className="surface p-5">
        <h1 className="font-brand text-2xl font-semibold">Monetization Model</h1>
        <p className="mt-1 text-sm text-muted">Scalable revenue channels for a web-first marketplace.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        {monetizationItems.map((item) => (
          <article key={item.title} className="surface p-4">
            <h2 className="text-base font-semibold text-ink">{item.title}</h2>
            <p className="mt-1 text-sm text-muted">{item.detail}</p>
          </article>
        ))}
      </section>
    </div>
  )
}
