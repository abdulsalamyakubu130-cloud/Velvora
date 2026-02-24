import { Link } from 'react-router-dom'

const actions = [
  {
    title: 'Report user',
    description: 'Flag abusive behavior, impersonation, or suspicious activity.',
  },
  {
    title: 'Report post',
    description: 'Report prohibited items, misleading listings, or spam.',
  },
  {
    title: 'Block user',
    description: 'Hide a user from feed, search, and messages.',
  },
  {
    title: 'Verified badge system',
    description: 'Seller verification managed by admin review workflow.',
  },
]

export default function SafetyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <header className="surface p-5">
        <h1 className="font-brand text-2xl font-semibold">Trust & Safety</h1>
        <p className="mt-1 text-sm text-muted">Trust is growth. Keep Velvora safe for global buyers and sellers.</p>
      </header>

      <section className="surface p-4">
        <div className="space-y-2">
          {actions.map((action) => (
            <article key={action.title} className="rounded-xl border border-line bg-white p-3">
              <h2 className="text-sm font-semibold text-ink">{action.title}</h2>
              <p className="text-sm text-muted">{action.description}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link to="/guidelines" className="btn-muted">
          Community guidelines
        </Link>
      </div>
    </div>
  )
}
