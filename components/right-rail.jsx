import { Link } from 'react-router-dom'
import { marketplaceCategories, trendingHashtags } from '@/lib/data/mock-data'
import { useI18n } from '@/src/context/i18n-context'

export default function RightRail() {
  const { t } = useI18n()

  return (
    <aside className="hidden animate-rise space-y-4 lg:block">
      <section className="surface p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{t('right.trending')}</h2>
        <div className="flex flex-wrap gap-2">
          {trendingHashtags.map((hashtag) => (
            <Link
              key={hashtag}
              to={`/explore?tag=${encodeURIComponent(hashtag)}`}
              className="pill transition hover:opacity-80"
            >
              {hashtag}
            </Link>
          ))}
        </div>
      </section>

      <section className="surface p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{t('right.top_categories')}</h2>
        <div className="flex flex-wrap gap-2">
          {marketplaceCategories.map((category) => (
            <Link
              key={category.id}
              to={`/explore?category=${encodeURIComponent(category.name)}`}
              className="pill transition hover:opacity-80"
            >
              {category.name}
            </Link>
          ))}
        </div>
      </section>
    </aside>
  )
}
