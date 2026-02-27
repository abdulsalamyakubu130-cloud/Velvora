import { useEffect, useMemo, useState } from 'react'
import { getSupabaseBrowserClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { marketplaceCategories } from '@/lib/data/mock-data'
import { maxVerificationTier, normalizeVerificationTier } from '@/lib/utils'
import { persistLocalPostImage } from '@/lib/utils/post-image-cache'
import { useAuth } from '@/src/context/auth-context'

const LISTING_BUCKET = import.meta.env.VITE_SUPABASE_LISTING_BUCKET || 'listing-images'
const LISTING_BUCKET_CANDIDATES = Array.from(
  new Set([LISTING_BUCKET, 'listing-images', 'post-images', 'posts', 'images']),
)
const LOCAL_IMAGE_BACKUP_MAX_BYTES = 1.5 * 1024 * 1024
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

const formDefaults = {
  title: '',
  description: '',
  category_id: '',
  condition: 'used',
  location: '',
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeCategorySlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^cat-/, '')
    .replace(/&/g, ' and ')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildFallbackCategoryOptions() {
  return marketplaceCategories.map((category) => ({
    id: category.id,
    slug: normalizeCategorySlug(category.id || category.name),
    name: category.name,
  }))
}

function mergeCategoryOptions(remoteRows = []) {
  const fallbackRows = buildFallbackCategoryOptions()
  const bySlug = new Map(fallbackRows.map((row) => [row.slug, row]))

  for (const row of remoteRows) {
    const slug = normalizeCategorySlug(row?.slug || row?.name || row?.id)
    if (!slug) continue
    bySlug.set(slug, {
      id: row?.id || `cat-${slug}`,
      slug,
      name: String(row?.name || slug.replace(/-/g, ' ')).trim(),
    })
  }

  return Array.from(bySlug.values()).sort((left, right) => left.name.localeCompare(right.name))
}

function isMissingTableError(error, tableName) {
  const message = String(error?.message || '').toLowerCase()
  return (
    error?.code === 'PGRST205' ||
    message.includes(`public.${String(tableName || '').toLowerCase()}`) && message.includes('schema cache') ||
    message.includes(`relation "public.${String(tableName || '').toLowerCase()}" does not exist`) ||
    message.includes(`relation "${String(tableName || '').toLowerCase()}" does not exist`)
  )
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Failed to read image file.'))
    reader.readAsDataURL(file)
  })
}

async function readFileAsOptimizedDataUrl(file) {
  const sourceDataUrl = await readFileAsDataUrl(file)

  if (file.size <= LOCAL_IMAGE_BACKUP_MAX_BYTES || typeof document === 'undefined') {
    return sourceDataUrl
  }

  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      try {
        const maxDimension = 1280
        const scale = Math.min(1, maxDimension / Math.max(image.width || 1, image.height || 1))
        const width = Math.max(1, Math.round((image.width || 1) * scale))
        const height = Math.max(1, Math.round((image.height || 1) * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) {
          resolve(sourceDataUrl)
          return
        }

        context.drawImage(image, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.76))
      } catch {
        resolve(sourceDataUrl)
      }
    }
    image.onerror = () => resolve(sourceDataUrl)
    image.src = sourceDataUrl
  })
}

export default function SellPage() {
  const { user: authUser } = useAuth()
  const [formData, setFormData] = useState(formDefaults)
  const [files, setFiles] = useState([])
  const [feedback, setFeedback] = useState('')
  const [pending, setPending] = useState(false)
  const [categoryOptions, setCategoryOptions] = useState(() => buildFallbackCategoryOptions())
  const [sellerTier, setSellerTier] = useState('none')
  const [activeListingCount, setActiveListingCount] = useState(0)

  const previews = useMemo(() => files.map((file) => ({ name: file.name, url: URL.createObjectURL(file) })), [files])

  useEffect(() => {
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url))
    }
  }, [previews])

  useEffect(() => {
    async function loadCategories() {
      if (!isSupabaseConfigured) return

      const supabase = getSupabaseBrowserClient()
      if (!supabase) return

      const { data, error } = await supabase.from('categories').select('id, slug, name').order('name', { ascending: true })
      if (error) return
      setCategoryOptions(mergeCategoryOptions(data || []))
    }

    loadCategories()
  }, [])

  useEffect(() => {
    async function loadSellerCompliance() {
      if (!isSupabaseConfigured || !authUser?.id) return

      const supabase = getSupabaseBrowserClient()
      if (!supabase) return

      const [{ data: profileRow }, { count }, { data: approvedKycRow }] = await Promise.all([
        supabase.from('users').select('is_verified, verification_tier').eq('id', authUser.id).maybeSingle(),
        supabase.from('posts').select('id', { head: true, count: 'exact' }).eq('user_id', authUser.id).eq('is_available', true),
        supabase
          .from('kyc_verifications')
          .select('tier_requested')
          .eq('user_id', authUser.id)
          .eq('status', 'approved')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      const profileTier = normalizeVerificationTier(
        profileRow?.verification_tier ?? authUser?.user_metadata?.verification_tier,
        profileRow?.is_verified || authUser?.user_metadata?.is_verified,
      )
      const approvedTier = normalizeVerificationTier(approvedKycRow?.tier_requested)
      const nextTier = maxVerificationTier(profileTier, approvedTier)

      setSellerTier(nextTier)
      setActiveListingCount(Number(count) || 0)
    }

    loadSellerCompliance()
  }, [authUser?.id, authUser?.user_metadata?.verification_tier])

  function handleFileSelect(selectedFiles) {
    if (!selectedFiles?.length) return
    const pickedFiles = Array.from(selectedFiles).slice(0, 6)
    const nextFiles = pickedFiles.filter((file) => SUPPORTED_IMAGE_TYPES.includes(file.type))
    setFiles(nextFiles)
    if (nextFiles.length !== pickedFiles.length) {
      setFeedback('Some images were skipped. Please use JPG, PNG, WEBP, or GIF.')
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFeedback('')

    if (!isSupabaseConfigured) {
      setFeedback('Connect Supabase environment keys first.')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setFeedback('Please sign in before publishing.')
      return
    }

    const isUnverifiedSeller = sellerTier === 'none'
    if (isUnverifiedSeller && activeListingCount >= 3) {
      setFeedback('Unverified seller limit reached (3 active listings). Complete verification to post more.')
      return
    }

    let resolvedCategoryId = formData.category_id || null
    if (resolvedCategoryId && !uuidPattern.test(resolvedCategoryId)) {
      const selectedCategory = categoryOptions.find((category) => category.id === resolvedCategoryId)
      const categorySlug = normalizeCategorySlug(selectedCategory?.slug || selectedCategory?.name || resolvedCategoryId)
      const { data: categoryRow, error: categoryError } = await supabase
        .from('categories')
        .select('id')
        .eq('slug', categorySlug)
        .maybeSingle()

      if (categoryError || !categoryRow?.id) {
        setFeedback('Selected category is not in your database yet. Run supabase/seed.sql, then publish again.')
        return
      }

      resolvedCategoryId = categoryRow.id
    }

    setPending(true)
    const { data: createdPost, error: postError } = await supabase
      .from('posts')
      .insert({
        user_id: user.id,
        title: formData.title,
        description: formData.description,
        price: 0,
        category_id: resolvedCategoryId,
        condition: formData.condition,
        location: formData.location,
        is_available: true,
        is_negotiable: false,
      })
      .select('id')
      .single()

    if (postError) {
      setPending(false)
      setFeedback(postError.message)
      return
    }

    let storedImageCount = 0
    let savedImageLocally = false
    let localBackupImage = ''
    let imageInsertFailureMessage = ''

    if (files.length && createdPost?.id) {
      try {
        localBackupImage = await readFileAsOptimizedDataUrl(files[0])
        persistLocalPostImage(createdPost.id, localBackupImage)
        savedImageLocally = true
      } catch {
        // Ignore local backup failures.
      }

      const uploadedImages = []

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]
        const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
        const filePath = `${user.id}/${createdPost.id}/${Date.now()}-${index}.${extension}`
        let uploadedPublicUrl = ''

        for (const bucket of LISTING_BUCKET_CANDIDATES) {
          const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, file, {
            upsert: true,
            contentType: file.type || 'image/jpeg',
          })

          if (!uploadError) {
            const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(filePath)
            uploadedPublicUrl = publicData?.publicUrl || ''
            break
          }
        }

        if (uploadedPublicUrl) {
          uploadedImages.push({
            post_id: createdPost.id,
            image_url: uploadedPublicUrl,
            sort_order: index,
          })
        }
      }

      if (uploadedImages.length) {
        let missingPostImagesTable = false
        for (const row of uploadedImages) {
          const { error: imageInsertError } = await supabase.from('post_images').insert(row)
          if (!imageInsertError) {
            storedImageCount += 1
            continue
          }

          if (isMissingTableError(imageInsertError, 'post_images')) {
            missingPostImagesTable = true
            break
          }

          if (!imageInsertFailureMessage) {
            imageInsertFailureMessage = imageInsertError.message || 'Image metadata save failed.'
          }
        }

        if (missingPostImagesTable) {
          try {
            const localImage = localBackupImage || (await readFileAsDataUrl(files[0]))
            persistLocalPostImage(createdPost.id, localImage)
            savedImageLocally = true
          } catch {
            // Fall through to generic feedback.
          }
        }
      } else {
        try {
          const inlineImage = localBackupImage || (await readFileAsOptimizedDataUrl(files[0]))
          persistLocalPostImage(createdPost.id, inlineImage)
          savedImageLocally = true
        } catch {
          // Ignore local fallback failures.
        }
      }
    }

    const failedImageCount = files.length ? Math.max(0, files.length - storedImageCount) : 0

    if (storedImageCount > 0 && failedImageCount > 0) {
      setFeedback(
        `Listing published with ${storedImageCount}/${files.length} images. ${failedImageCount} image(s) failed to sync.`,
      )
    } else if (storedImageCount > 0) {
      setFeedback('Listing published successfully with images.')
    } else if (files.length > 0 && imageInsertFailureMessage) {
      setFeedback(
        `Listing published, but image metadata failed to sync: ${imageInsertFailureMessage}`,
      )
    } else if (savedImageLocally) {
      setFeedback('Listing published. Image saved locally on this device because storage/database setup is incomplete.')
    } else if (files.length > 0) {
      setFeedback('Listing published, but images could not be uploaded. Check Supabase storage bucket and policies.')
    } else {
      setFeedback('Listing published successfully.')
    }

    setPending(false)
    setFormData(formDefaults)
    setFiles([])
    if (sellerTier === 'none') {
      setActiveListingCount((currentCount) => currentCount + 1)
    }
  }

  function updateValue(key, value) {
    setFormData((currentFormData) => ({ ...currentFormData, [key]: value }))
  }

  return (
    <div className="mx-auto w-full max-w-3xl animate-rise">
      <section className="surface p-5 sm:p-6">
        <h1 className="font-brand text-2xl font-semibold">Create Post</h1>
        <p className="mt-1 text-sm text-muted">Upload photos, add details, and publish to feed + explore.</p>
        <div className="mt-3 rounded-xl border border-line bg-accentSoft/40 p-3 text-sm text-muted">
          <p className="font-semibold text-ink">
            Seller tier: {sellerTier === 'enhanced' ? 'Enhanced (KYC Pro)' : sellerTier === 'basic' ? 'Basic (KYC)' : 'Unverified'}
          </p>
          {sellerTier === 'none' ? (
            <p className="mt-1">Unverified accounts can keep up to 3 active listings. Current active: {activeListingCount}.</p>
          ) : (
            <p className="mt-1">Verification unlocked higher trust and posting limits.</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label
            htmlFor="images"
            className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line bg-accentSoft/45 p-4 text-center"
          >
            <span className="text-sm font-semibold text-accentStrong">Drag and drop images here</span>
            <span className="mt-1 text-xs text-muted">or click to browse (max 6 files)</span>
          </label>
          <input
            id="images"
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => handleFileSelect(event.target.files)}
          />

          {previews.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {previews.map((preview) => (
                <img key={preview.name} src={preview.url} alt={preview.name} className="h-32 w-full rounded-xl object-cover" />
              ))}
            </div>
          ) : null}

          <input
            className="input"
            value={formData.title}
            onChange={(event) => updateValue('title', event.target.value)}
            placeholder="Title"
            required
          />

          <textarea
            className="input min-h-28"
            value={formData.description}
            onChange={(event) => updateValue('description', event.target.value)}
            placeholder="Description"
            required
          />

          <input
            className="input"
            value={formData.location}
            onChange={(event) => updateValue('location', event.target.value)}
            placeholder="Location"
            required
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <select
              className="input"
              value={formData.category_id}
              onChange={(event) => updateValue('category_id', event.target.value)}
              required
            >
              <option value="">Select category</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>

            <select
              className="input"
              value={formData.condition}
              onChange={(event) => updateValue('condition', event.target.value)}
            >
              <option value="new">New</option>
              <option value="used">Used</option>
            </select>
          </div>

          <button className="btn-primary w-full sm:w-auto" type="submit" disabled={pending}>
            {pending ? 'Publishing...' : 'Publish'}
          </button>
        </form>

        <p className="mt-3 text-sm text-muted">{feedback}</p>
      </section>
    </div>
  )
}
