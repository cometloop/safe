import { HttpError, type FetchOptions } from './types'

export async function fetchJson<T>(
  url: string,
  options?: FetchOptions
): Promise<T | undefined> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options?.headers,
  }

  if (options?.body !== undefined) {
    headers['Content-Type'] = 'application/json'
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
    return undefined
  }

  return response.json() as Promise<T>
}
