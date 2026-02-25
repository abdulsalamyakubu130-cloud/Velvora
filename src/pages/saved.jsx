import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PostCard from '@/components/post-card'
import { listLocalSavedPostIds } from '@/lib/utils/social-cache'
import { useLivePosts } from '@/src/hooks/use-live-posts'
import { useAuth } from '@/src/context/auth-context'

export default function SavedPage() {
  const { user: authUser } = useAuth()
  const currentUserId = String(authUser?.id || '')
  const { posts, loading } = useLivePosts()
  const [savedPostIds, setSavedPostIds] = useState([])
  const [savedIdsLoaded, setSavedIdsLoaded] = useState(false)

  const loadSavedPostIds = useCallback(() => {
    if (!currentUserId) {
      setSavedPostIds([])
      setSavedIdsLoaded(true)
      return
    }

    const ids = Array.from(new Set(listLocalSavedPostIds(currentUserId).map((value) => String(value))))
    setSavedPostIds(ids)
    setSavedIdsLoaded(true)
  }, [currentUserId])

  useEffect(() => {
    loadSavedPostIds()
  }, [loadSavedPostIds])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    window.addEventListener('velvora:saved-posts-changed', loadSavedPostIds)
    return () => {
      window.removeEventListener('velvora:saved-posts-changed', loadSavedPostIds)
    }
  }, [loadSavedPostIds])

  const savedPosts = useMemo(() => {
    if (!savedPostIds.length) return []
    const idSet = new Set(savedPostIds)
    return posts.filter((post) => idSet.has(String(post.id)))
  }, [posts, savedPostIds])

  return (
    <div className="space-y-4">
      <header className="surface p-5">
        <h1 className="font-brand text-2xl font-semibold">Saved</h1>
        <p className="mt-1 text-sm text-muted">Your saved products for later decision.</p>
      </header>

      {loading && !savedIdsLoaded ? (
        <section className="surface p-6 text-center">
          <p className="text-sm text-muted">Loading saved items...</p>
        </section>
      ) : null}

      {!savedPostIds.length && savedIdsLoaded ? (
        <section className="surface p-6 text-center">
          <p className="text-sm text-muted">No saved items yet.</p>
          <Link to="/explore" className="btn-muted mt-4">
            Browse listings
          </Link>
        </section>
      ) : null}

      {savedPostIds.length && !savedPosts.length && !loading ? (
        <section className="surface p-6 text-center">
          <p className="text-sm text-muted">Saved items will appear here when available.</p>
          <Link to="/explore" className="btn-muted mt-4">
            Browse listings
          </Link>
        </section>
      ) : null}

      {savedPosts.length ? (
        <div className="space-y-4">
          {savedPosts.map((post) => (
            <PostCard key={post.id} post={post} compact />
          ))}
        </div>
      ) : null}
    </div>
  )
}
