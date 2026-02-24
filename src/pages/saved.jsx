import { mockPosts } from '@/lib/data/mock-data'
import PostCard from '@/components/post-card'

export default function SavedPage() {
  return (
    <div className="space-y-4">
      <header className="surface p-5">
        <h1 className="font-brand text-2xl font-semibold">Saved</h1>
        <p className="mt-1 text-sm text-muted">Your saved products for later decision.</p>
      </header>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {mockPosts.slice(2, 8).map((post) => (
          <PostCard key={post.id} post={post} compact />
        ))}
      </div>
    </div>
  )
}
