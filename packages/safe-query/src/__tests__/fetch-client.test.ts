import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchJson } from '../fetch-client'
import { HttpError } from '../types'

describe('fetchJson', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('makes a GET request and returns JSON', async () => {
    const data = { id: 1, name: 'Test' }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '100' }),
        json: () => Promise.resolve(data),
      })
    )

    const result = await fetchJson('https://api.example.com/users')
    expect(result).toEqual(data)
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/users', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      signal: undefined,
    })
  })

  it('makes a POST request with body', async () => {
    const body = { name: 'New User' }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-length': '100' }),
        json: () => Promise.resolve({ id: 2, ...body }),
      })
    )

    await fetchJson('https://api.example.com/users', {
      method: 'POST',
      body,
    })
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/users',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(body),
      })
    )
  })

  it('throws HttpError on non-ok response with JSON body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ message: 'User not found' }),
      })
    )

    await expect(
      fetchJson('https://api.example.com/users/999')
    ).rejects.toThrow(HttpError)

    try {
      await fetchJson('https://api.example.com/users/999')
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError)
      const err = e as HttpError
      expect(err.status).toBe(404)
      expect(err.statusText).toBe('Not Found')
      expect(err.body).toEqual({ message: 'User not found' })
    }
  })

  it('throws HttpError with text body when JSON parse fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('parse error')),
        text: () => Promise.resolve('Server error occurred'),
      })
    )

    try {
      await fetchJson('https://api.example.com/users')
    } catch (e) {
      const err = e as HttpError
      expect(err.body).toBe('Server error occurred')
    }
  })

  it('throws HttpError with null body when both json and text fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('parse error')),
        text: () => Promise.reject(new Error('text error')),
      })
    )

    try {
      await fetchJson('https://api.example.com/users')
    } catch (e) {
      const err = e as HttpError
      expect(err.body).toBeNull()
    }
  })

  it('returns undefined for 204 No Content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        headers: new Headers(),
        json: () => Promise.reject(new Error('no body')),
      })
    )

    const result = await fetchJson('https://api.example.com/users/1')
    expect(result).toBeUndefined()
  })

  it('returns undefined for content-length 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '0' }),
        json: () => Promise.reject(new Error('no body')),
      })
    )

    const result = await fetchJson('https://api.example.com/users/1')
    expect(result).toBeUndefined()
  })

  it('merges custom headers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '100' }),
        json: () => Promise.resolve({}),
      })
    )

    await fetchJson('https://api.example.com/users', {
      headers: { Authorization: 'Bearer token123' },
    })

    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/users',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: 'Bearer token123',
        },
      })
    )
  })

  it('passes abort signal', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '100' }),
        json: () => Promise.resolve({}),
      })
    )

    await fetchJson('https://api.example.com/users', {
      signal: controller.signal,
    })

    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/users',
      expect.objectContaining({
        signal: controller.signal,
      })
    )
  })
})
