export function buildUrl(
  baseUrl: string,
  path: string,
  params?: Record<string, string>
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

  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const p = resolvedPath.startsWith('/') ? resolvedPath : `/${resolvedPath}`
  return `${base}${p}`
}
