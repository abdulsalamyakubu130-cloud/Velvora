import MarketplaceShell from '@/components/marketplace-shell'
import { useLivePosts } from '@/src/hooks/use-live-posts'
import { useI18n } from '@/src/context/i18n-context'

export default function HomePage() {
  const { t } = useI18n()
  const { posts, loading, error, refresh } = useLivePosts()

  return (
    <MarketplaceShell
      title={t('home.title')}
      subtitle={t('home.subtitle')}
      posts={posts}
      loading={loading}
      error={error}
      onRetry={refresh}
    />
  )
}
