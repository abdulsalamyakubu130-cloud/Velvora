const rules = [
  'No prohibited or illegal products.',
  'No counterfeit goods or misleading listings.',
  'No harassment, hate speech, or abusive messaging.',
  'Respect shipping and delivery promises.',
  'Use report tools for suspicious behavior.',
]

export default function GuidelinesPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <header className="surface p-5">
        <h1 className="font-brand text-2xl font-semibold">Community Guidelines</h1>
        <p className="mt-1 text-sm text-muted">Clear rules that protect buyers, sellers, and trust.</p>
      </header>

      <section className="surface p-4">
        <ol className="space-y-2 text-sm text-ink">
          {rules.map((rule, index) => (
            <li key={rule} className="rounded-xl border border-line bg-white p-3">
              <span className="font-semibold">{index + 1}. </span>
              {rule}
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
