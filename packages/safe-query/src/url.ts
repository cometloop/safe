import type { SearchParams } from './types'

export function buildUrl(
  baseUrl: string,
  path: string,
  params?: Record<string, string>,
  searchParams?: SearchParams
): string {
  let resolvedPath = path
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      resolvedPath = resolvedPath.replace(
        `:${key}`,
        encodeURIComponent(value)
      )
    }
  }

  // Validate all path params were replaced
  const unreplaced = resolvedPath.match(/:([a-zA-Z_]\w*)/g)
  if (unreplaced) {
    const names = unreplaced.map(p => p.substring(1)).join(', ')
    throw new Error(`Missing URL params: ${names}`)
  }

  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const p = resolvedPath.startsWith('/') ? resolvedPath : `/${resolvedPath}`
  let url = `${base}${p}`

  if (searchParams) {
    const parts: string[] = []
    const sorted = Object.entries(searchParams).sort(([a], [b]) =>
      a.localeCompare(b)
    )
    for (const [key, value] of sorted) {
      if (Array.isArray(value)) {
        for (const item of value) {
          parts.push(
            `${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`
          )
        }
      } else {
        parts.push(
          `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
        )
      }
    }
    if (parts.length > 0) {
      url += `?${parts.join('&')}`
    }
  }

  return url
}
