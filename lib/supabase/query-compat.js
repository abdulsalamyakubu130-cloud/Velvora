export function isMissingColumnError(error, columnName) {
  const message = String(error?.message || '').toLowerCase()
  const targetColumn = String(columnName || '').toLowerCase()
  if (!targetColumn) return false
  return error?.code === '42703' || message.includes(targetColumn)
}

const columnMissingCache = new Map()

export async function runWithMissingColumnFallback(
  primaryQueryFactory,
  fallbackQueryFactory,
  missingColumn = 'profile_picture_url',
) {
  const cacheKey = String(missingColumn || '').toLowerCase()
  if (cacheKey && columnMissingCache.get(cacheKey) === true) {
    return fallbackQueryFactory()
  }

  const primaryResult = await primaryQueryFactory()
  if (primaryResult?.error && isMissingColumnError(primaryResult.error, missingColumn)) {
    if (cacheKey) columnMissingCache.set(cacheKey, true)
    return fallbackQueryFactory()
  }
  if (cacheKey) columnMissingCache.set(cacheKey, false)
  return primaryResult
}
