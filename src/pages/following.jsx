import PostCard from '@/components/post-card'
import { useLivePosts } from '@/src/hooks/use-live-posts'

export default function FollowingPage() {
  const { posts } = useLivePosts({ onlyFollowing: true })

  return (
    <div className="space-y-4">
      <header className="surface p-5">
        <h1 className="font-brand text-2xl font-semibold">Following</h1>
        <p className="mt-1 text-sm text-muted">Latest products from sellers you follow.</p>
      </header>
      <div className="space-y-4">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
        {!posts.length ? <p className="text-sm text-muted">Follow sellers to see their latest posts here.</p> : null}
      </div>
    </div>
  )
}
