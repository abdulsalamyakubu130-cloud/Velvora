import { marketplaceCategories, mockPosts } from '@/lib/data/mock-data'
import PostCard from '@/components/post-card'

export default function CategoriesPage() {
  return (
    <div className="space-y-5">
      <header className="surface p-5">
        <h1 className="font-brand text-2xl font-semibold">Categories</h1>
        <p className="mt-1 text-sm text-muted">Browse all marketplace categories.</p>
      </header>

      {marketplaceCategories.map((category) => {
        const posts = mockPosts.filter((post) => post.category_id === category.id).slice(0, 2)
        if (!posts.length) return null
        return (
          <section key={category.id} className="surface p-4">
            <h2 className="mb-3 text-lg font-semibold text-ink">{category.name}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} compact />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
