import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import LeftRail from '@/components/left-rail'
import PostCard from '@/components/post-card'
import RightRail from '@/components/right-rail'
import { useI18n } from '@/src/context/i18n-context'

export default function MarketplaceShell({ title, subtitle, posts }) {
  const { t } = useI18n()
  const [visibleCount, setVisibleCount] = useState(4)
  const sentinelRef = useRef(null)

  const visiblePosts = useMemo(() => posts.slice(0, visibleCount), [posts, visibleCount])
  const hasMore = visibleCount < posts.length

  useEffect(() => {
    if (!hasMore || !sentinelRef.current) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((count) => Math.min(count + 2, posts.length))
        }
      },
      { threshold: 0.4 },
    )

    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasMore, posts.length])

  return (
    <div className="grid gap-5 lg:grid-cols-[220px,minmax(0,1fr),280px]">
      <LeftRail />

      <section className="space-y-4">
        <header className="surface animate-rise p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="font-brand text-2xl font-semibold text-ink">{title}</h1>
              <p className="text-sm text-muted">{subtitle}</p>
            </div>

            <div className="flex items-center gap-2">
              <Link to="/sell" className="btn-primary">
                {t('market.create_post')}
              </Link>
            </div>
          </div>
        </header>

        <div className="space-y-4">
          {visiblePosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>

        {hasMore ? (
          <div className="space-y-3">
            <div ref={sentinelRef} className="h-2" aria-hidden="true" />
            <button type="button" onClick={() => setVisibleCount((count) => count + 4)} className="btn-muted w-full">
              {t('market.load_more')}
            </button>
          </div>
        ) : (
          <p className="text-center text-sm text-muted">{t('market.end_feed')}</p>
        )}
      </section>

      <RightRail />
    </div>
  )
}
