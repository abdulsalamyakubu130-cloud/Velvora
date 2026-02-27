import { useEffect, useMemo, useState } from 'react'

const SWIPE_THRESHOLD = 40
const DEFAULT_FALLBACK_IMAGE = '/placeholders/listing-home.svg'

function normalizeImageList(images, fallbackImage) {
  const normalizedImages = Array.isArray(images)
    ? images
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    : []
  return normalizedImages.length ? normalizedImages : [fallbackImage]
}

export default function ListingImageCarousel({
  images = [],
  alt = 'Listing image',
  imageClassName = 'h-64 w-full object-cover',
  containerClassName = '',
  fallbackImage = DEFAULT_FALLBACK_IMAGE,
  showControls = true,
  showDots = true,
}) {
  const normalizedImages = useMemo(() => normalizeImageList(images, fallbackImage), [images, fallbackImage])
  const hasMultiple = normalizedImages.length > 1
  const [activeIndex, setActiveIndex] = useState(0)
  const [failedImageIndices, setFailedImageIndices] = useState({})
  const [touchStartX, setTouchStartX] = useState(0)

  useEffect(() => {
    setActiveIndex(0)
    setFailedImageIndices({})
  }, [normalizedImages])

  function moveImage(delta) {
    if (!hasMultiple) return
    setActiveIndex((currentIndex) => {
      const totalImages = normalizedImages.length
      const nextIndex = currentIndex + delta
      if (nextIndex < 0) return totalImages - 1
      if (nextIndex >= totalImages) return 0
      return nextIndex
    })
  }

  function handleImageError() {
    setFailedImageIndices((currentState) => ({
      ...currentState,
      [activeIndex]: true,
    }))
  }

  function handleTouchStart(event) {
    if (!hasMultiple) return
    const clientX = Number(event.touches?.[0]?.clientX || 0)
    setTouchStartX(clientX)
  }

  function handleTouchEnd(event) {
    if (!hasMultiple || !touchStartX) return
    const touchEndX = Number(event.changedTouches?.[0]?.clientX || 0)
    const delta = touchEndX - touchStartX
    setTouchStartX(0)
    if (Math.abs(delta) < SWIPE_THRESHOLD) return
    moveImage(delta < 0 ? 1 : -1)
  }

  const activeImageSrc = failedImageIndices[activeIndex] ? fallbackImage : normalizedImages[activeIndex] || fallbackImage

  return (
    <div
      className={`relative overflow-hidden ${containerClassName}`.trim()}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <img
        src={activeImageSrc}
        alt={alt}
        className={imageClassName}
        onError={handleImageError}
        loading="lazy"
        decoding="async"
      />

      {hasMultiple ? (
        <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white">
          {activeIndex + 1}/{normalizedImages.length}
        </span>
      ) : null}

      {hasMultiple && showControls ? (
        <>
          <button
            type="button"
            onClick={() => moveImage(-1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 px-2 py-1 text-xs font-semibold text-white transition hover:bg-black/65"
            aria-label="Previous image"
          >
            {'<'}
          </button>
          <button
            type="button"
            onClick={() => moveImage(1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 px-2 py-1 text-xs font-semibold text-white transition hover:bg-black/65"
            aria-label="Next image"
          >
            {'>'}
          </button>
        </>
      ) : null}

      {hasMultiple && showDots ? (
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/35 px-2 py-1">
          {normalizedImages.map((_value, imageIndex) => (
            <button
              key={imageIndex}
              type="button"
              onClick={() => setActiveIndex(imageIndex)}
              className={`h-1.5 w-1.5 rounded-full transition ${
                imageIndex === activeIndex ? 'bg-white' : 'bg-white/45'
              }`}
              aria-label={`View image ${imageIndex + 1}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
