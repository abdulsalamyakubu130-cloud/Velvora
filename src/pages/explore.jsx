import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { countryOptions, marketplaceCategories, trendingHashtags } from '@/lib/data/mock-data'
import { buildProfilePath, normalizeVerificationTier } from '@/lib/utils'
import PostCard from '@/components/post-card'
import VerifiedBadge from '@/components/verified-badge'
import { useLivePosts } from '@/src/hooks/use-live-posts'
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { runWithMissingColumnFallback } from '@/lib/supabase/query-compat'
import { getProfilePictureValue, resolveProfilePictureUrl } from '@/lib/utils/media-url'

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function cleanTag(tag) {
  return normalize(tag).replace(/^#/, '')
}

function matchesTag(post, rawTag) {
  const tag = cleanTag(rawTag)
  if (!tag) return true

  if (tag === 'velvorafinds') return true
  if (tag === 'homeaesthetic') return normalize(post.category_name).includes('home')
  if (tag === 'newdrop') {
    const createdAt = new Date(post.created_at).getTime()
    if (Number.isNaN(createdAt)) return false
    const daysSinceCreated = (Date.now() - createdAt) / (1000 * 60 * 60 * 24)
    return daysSinceCreated <= 30
  }
  if (tag === 'sustainablebuy') {
    const category = normalize(post.category_name)
    return ['home', 'beauty', 'art'].some((item) => category.includes(item))
  }
  if (tag === 'globalmarket') return Boolean(post.location)

  const haystack = normalize(
    `${post.title} ${post.description} ${post.category_name} ${post.location} ${post.user?.username} ${post.user?.full_name}`,
  )
  return haystack.includes(tag)
}

function matchesQuery(post, rawQuery) {
  const query = normalize(rawQuery)
  if (!query) return true

  const haystack = normalize(
    `${post.title} ${post.description} ${post.category_name} ${post.location} ${post.user?.username} ${post.user?.full_name}`,
  )
  return haystack.includes(query)
}

function matchesPerson(post, rawQuery) {
  const query = normalize(rawQuery)
  if (!query) return false
  const personHaystack = normalize(`${post.user?.username} ${post.user?.full_name}`)
  return personHaystack.includes(query)
}

function normalizeUserSearchQuery(rawValue) {
  return normalize(rawValue).replace(/^@+/, '')
}

function isSearchableText(value) {
  return Boolean(String(value || '').trim())
}

const userDirectorySelect = 'id, username, full_name, avatar_url, profile_picture_url, country, is_verified, verification_tier'
const userDirectorySelectFallback = 'id, username, full_name, avatar_url, country, is_verified, verification_tier'

export default function ExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { posts } = useLivePosts()
  const [directoryUsers, setDirectoryUsers] = useState([])
  const selectedCategory = normalize(searchParams.get('category'))
  const selectedTag = cleanTag(searchParams.get('tag'))
  const rawSearchQuery = searchParams.get('q') || ''
  const searchQuery = normalize(rawSearchQuery)
  const peopleSearchQuery = normalizeUserSearchQuery(rawSearchQuery)
  const selectedCountry = normalize(searchParams.get('country'))

  useEffect(() => {
    let cancelled = false

    async function loadDirectoryUsers() {
      if (!peopleSearchQuery || !isSupabaseConfigured) {
        if (!cancelled) setDirectoryUsers([])
        return
      }

      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        if (!cancelled) setDirectoryUsers([])
        return
      }

      const escapedQuery = peopleSearchQuery.replace(/[%_]/g, '').trim()
      if (!escapedQuery) {
        if (!cancelled) setDirectoryUsers([])
        return
      }

      const queryUsers = (buildQuery) =>
        runWithMissingColumnFallback(
          () => buildQuery(userDirectorySelect),
          () => buildQuery(userDirectorySelectFallback),
        )

      const [exactMatchResult, usernameResult, fullNameResult, emailResult] = await Promise.all([
        queryUsers((selectClause) => supabase.from('users').select(selectClause).eq('username', escapedQuery).limit(1)),
        queryUsers((selectClause) => supabase.from('users').select(selectClause).ilike('username', `%${escapedQuery}%`).limit(20)),
        queryUsers((selectClause) => supabase.from('users').select(selectClause).ilike('full_name', `%${escapedQuery}%`).limit(20)),
        queryUsers((selectClause) => supabase.from('users').select(selectClause).ilike('email', `%${escapedQuery}%`).limit(20)),
      ])

      if (cancelled) return

      const hasError =
        exactMatchResult.error ||
        usernameResult.error ||
        fullNameResult.error ||
        emailResult.error

      if (hasError) {
        setDirectoryUsers([])
        return
      }

      const uniqueUsers = new Map()
      const mergedUsers = [
        ...(exactMatchResult.data || []),
        ...(usernameResult.data || []),
        ...(fullNameResult.data || []),
        ...(emailResult.data || []),
      ]

      for (const user of mergedUsers) {
        if (!isSearchableText(user?.username)) continue
        const key = String(user.id || user.username).toLowerCase()
        if (!uniqueUsers.has(key)) {
          uniqueUsers.set(key, user)
        }
      }

      setDirectoryUsers(
        Array.from(uniqueUsers.values())
          .slice(0, 20)
          .map((user) => {
            const resolvedProfilePicture = resolveProfilePictureUrl(user.profile_picture_url || '', '')
            const resolvedAvatar = resolveProfilePictureUrl(user.avatar_url || '', '')
            const finalProfilePicture = resolvedProfilePicture || resolvedAvatar
            return {
              ...user,
              profile_picture_url: finalProfilePicture,
              avatar_url: resolvedAvatar || finalProfilePicture,
            }
          }),
      )
    }

    loadDirectoryUsers()
    return () => {
      cancelled = true
    }
  }, [peopleSearchQuery])

  const filteredPosts = useMemo(
    () =>
      posts.filter((post) => {
        const categoryMatch = !selectedCategory || normalize(post.category_name) === selectedCategory
        const tagMatch = !selectedTag || matchesTag(post, selectedTag)
        const queryMatch = !searchQuery || matchesQuery(post, searchQuery)
        const locationText = normalize(post.location)
        const userCountry = normalize(post.user?.country)
        const countryMatch = !selectedCountry || locationText.includes(selectedCountry) || userCountry.includes(selectedCountry)
        return categoryMatch && tagMatch && queryMatch && countryMatch
      }),
    [posts, searchQuery, selectedCategory, selectedCountry, selectedTag],
  )

  const mostLiked = [...filteredPosts].sort((a, b) => b.likes_count - a.likes_count).slice(0, 4)
  const newListings = [...filteredPosts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 4)
  const matchingPeople = useMemo(() => {
    if (!peopleSearchQuery) return []

    const uniqueByUsername = new Map()
    directoryUsers.forEach((user) => {
      const key = String(user.username || '')
      if (!key || uniqueByUsername.has(key)) return
      uniqueByUsername.set(key, user)
    })

    posts.forEach((post) => {
      if (!post?.user?.username || !matchesPerson(post, peopleSearchQuery)) return
      if (uniqueByUsername.has(post.user.username)) return
      uniqueByUsername.set(post.user.username, post.user)
    })

    return Array.from(uniqueByUsername.values()).slice(0, 8)
  }, [directoryUsers, peopleSearchQuery, posts])

  const hasActiveFilters = Boolean(selectedCategory || selectedTag || selectedCountry || searchQuery)

  function setCategoryFilter(categoryName) {
    const next = new URLSearchParams(searchParams)
    next.set('category', categoryName)
    setSearchParams(next)
  }

  function setTagFilter(hashtag) {
    const next = new URLSearchParams(searchParams)
    next.set('tag', hashtag)
    setSearchParams(next)
  }

  function setCountryFilter(countryName) {
    const next = new URLSearchParams(searchParams)
    const normalizedCountry = normalize(countryName)
    if (selectedCountry && selectedCountry === normalizedCountry) {
      next.delete('country')
    } else {
      next.set('country', countryName)
    }
    setSearchParams(next)
  }

  function clearFilters() {
    setSearchParams({})
  }

  return (
    <div className="space-y-5">
      <header className="surface animate-rise p-5">
        <h1 className="font-brand text-2xl font-semibold text-ink">Explore</h1>
        <p className="mt-1 text-sm text-muted">Discover by category, country, trends, and engagement.</p>
        {hasActiveFilters ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {searchQuery ? <span className="pill">Search: {searchQuery}</span> : null}
            {selectedCategory ? <span className="pill">Category: {selectedCategory}</span> : null}
            {selectedTag ? <span className="pill">Tag: #{selectedTag}</span> : null}
            {selectedCountry ? <span className="pill">Country: {selectedCountry}</span> : null}
            <button type="button" onClick={clearFilters} className="btn-muted">
              Clear filters
            </button>
          </div>
        ) : null}
      </header>

      {searchQuery ? (
        <section className="surface p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">People</h2>
          {matchingPeople.length ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {matchingPeople.map((person) => (
                <Link
                  key={person.username}
                  to={buildProfilePath(person)}
                  className="flex items-center gap-2 rounded-xl border border-line bg-white p-2.5 transition hover:border-accent"
                >
                  <img
                    src={resolveProfilePictureUrl(getProfilePictureValue(person))}
                    alt={person.full_name || person.username}
                    className="h-9 w-9 rounded-full object-cover"
                    onError={(event) => {
                      event.currentTarget.src = '/placeholders/avatar-anya.svg'
                    }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="truncate text-sm font-semibold text-ink">{person.full_name || person.username}</p>
                      <VerifiedBadge
                        tier={normalizeVerificationTier(person.verification_tier, person.is_verified)}
                      />
                    </div>
                    <p className="truncate text-xs text-muted">@{person.username}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No people match this search yet.</p>
          )}
        </section>
      ) : null}

      <section className="surface p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Categories</h2>
        <div className="flex flex-wrap gap-2">
          {marketplaceCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setCategoryFilter(category.name)}
              className={`pill transition hover:opacity-80 ${
                normalize(category.name) === selectedCategory ? 'ring-2 ring-accent/40' : ''
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>
      </section>

      <section className="surface p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Countries</h2>
        <div className="flex flex-wrap gap-2">
          {countryOptions.map((country) => (
            <button
              key={country}
              type="button"
              onClick={() => setCountryFilter(country)}
              className={`pill transition hover:opacity-80 ${
                normalize(country) === selectedCountry ? 'ring-2 ring-accent/40' : ''
              }`}
            >
              {country}
            </button>
          ))}
        </div>
      </section>

      <section className="surface p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Trending Posts</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {filteredPosts.slice(0, 4).map((post) => (
            <PostCard key={post.id} post={post} compact />
          ))}
        </div>
        {!filteredPosts.length ? <p className="mt-3 text-sm text-muted">No posts match this filter yet.</p> : null}
      </section>

      <section className="surface p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Most Liked</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {mostLiked.map((post) => (
            <PostCard key={post.id} post={post} compact />
          ))}
        </div>
      </section>

      <section className="surface p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">New Listings</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {newListings.map((post) => (
            <PostCard key={post.id} post={post} compact />
          ))}
        </div>
      </section>

      <section className="surface p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Trending tags</h2>
        <div className="flex flex-wrap gap-2">
          {trendingHashtags.map((hashtag) => (
            <button
              key={hashtag}
              type="button"
              onClick={() => setTagFilter(hashtag)}
              className={`pill transition hover:opacity-80 ${
                cleanTag(hashtag) === selectedTag ? 'ring-2 ring-accent/40' : ''
              }`}
            >
              {hashtag}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
