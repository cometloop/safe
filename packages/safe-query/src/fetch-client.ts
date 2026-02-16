import { HttpError, type FetchOptions } from './types'

export async function fetchJson<T>(
  url: string,
  options?: FetchOptions
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...options?.headers,
  }

  const init: RequestInit = {
    method: options?.method ?? 'GET',
    headers,
    signal: options?.signal,
  }

  if (options?.body !== undefined) {
    init.body = JSON.stringify(options.body)
  }

  const response = await fetch(url, init)

  if (!response.ok) {
    let body: unknown
    try {
      body = await response.json()
    } catch {
      try {
        body = await response.text()
      } catch {
        body = null
      }
    }
    throw new HttpError(response.status, response.statusText, body)
  }

  if (
    response.status === 204 ||
    response.headers.get('content-length') === '0'
  ) {
    return undefined as T
  }

  return response.json() as Promise<T>
}
