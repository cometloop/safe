import { describe, it, expect, vi, afterEach } from 'vitest'
import { createSafe } from '@cometloop/safe'
import { createQuery } from '../query'
import { QueryCache } from '../query-cache'
import { EntityStore } from '../entity-store'
import { Notifier } from '../notifier'

function createDeps(overrides: Record<string, any> = {}) {
  const safeInstance = createSafe({
    parseError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
    defaultError: 'Unknown error',
  })

  return {
    safeInstance,
    queryCache: new QueryCache(),
    entityStore: new EntityStore(),
    notifier: new Notifier(),
    baseUrl: 'https://api.example.com',
    headers: undefined,
    defaultStaleTime: 0,
    defaultGcTime: 5 * 60_000,
    ...overrides,
  }
}

describe('createQuery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('executes a simple GET query', async () => {
    const users = [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '100' }),
        json: () => Promise.resolve(users),
      })
    )

    const deps = createDeps()
    const query = createQuery('/users', undefined, deps)

    const [result, err] = await query.execute()
    expect(err).toBeNull()
    expect(result).toEqual(users)
  })

  it('executes a query with path params', async () => {
    const user = { id: '123', name: 'Alice' }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '100' }),
        json: () => Promise.resolve(user),
      })
    )

    const deps = createDeps()
    const query = createQuery('/users/:id', undefined, deps)

    const [result, err] = await query.execute({ id: '123' })
    expect(err).toBeNull()
    expect(result).toEqual(user)
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/users/123',
      expect.any(Object)
    )
  })

  it('applies parseResponse', async () => {
    const rawData = [{ id: '1', name: 'Alice' }]

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '100' }),
        json: () => Promise.resolve(rawData),
      })
    )

    const deps = createDeps()
    const query = createQuery('/users', {
      parseResponse: (data: any[]) =>
        data.map((u) => ({ ...u, __type: 'user' as const })),
    }, deps)

    const [result, err] = await query.execute()
    expect(err).toBeNull()
    expect(result).toEqual([{ id: '1', name: 'Alice', __type: 'user' }])
  })

  it('normalizes entities', async () => {
    const users = [
      { id: '1', name: 'Alice', __type: 'user' },
      { id: '2', name: 'Bob', __type: 'user' },
    ]

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '100' }),
        json: () => Promise.resolve(users),
      })
    )

    const deps = createDeps()
    const query = createQuery('/users', {
      entities: { user: (u: any) => u.id },
    }, deps)

    await query.execute()

    // Entities should be in the store
    expect(deps.entityStore.get('user', '1')).toEqual({
      id: '1',
      name: 'Alice',
      __type: 'user',
    })
    expect(deps.entityStore.get('user', '2')).toEqual({
      id: '2',
      name: 'Bob',
      __type: 'user',
    })
  })

  it('returns cached data when fresh', async () => {
    const users = [{ id: '1', name: 'Alice' }]

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '100' }),
        json: () => Promise.resolve(users),
      })
    )

    const deps = createDeps({ defaultStaleTime: 60000 })
    const query = createQuery('/users', { staleTime: 60000 }, deps)

    await query.execute()
    expect(fetch).toHaveBeenCalledTimes(1)

    // Second call should return cached data
    const [result, err] = await query.execute()
    expect(err).toBeNull()
    expect(result).toEqual(users)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('deduplicates concurrent requests', async () => {
    let resolvePromise: (value: any) => void
    const fetchPromise = new Promise((resolve) => {
      resolvePromise = resolve
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        fetchPromise.then((data) => ({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-length': '100' }),
          json: () => Promise.resolve(data),
        }))
      )
    )

    const deps = createDeps()
    const query = createQuery('/users', undefined, deps)

    const p1 = query.execute()
    const p2 = query.execute()

    resolvePromise!([{ id: '1' }])

    const [r1] = await p1
    const [r2] = await p2

    expect(r1).toEqual([{ id: '1' }])
    expect(r2).toEqual([{ id: '1' }])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('subscribes and receives state updates', async () => {
    const users = [{ id: '1', name: 'Alice' }]

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '100' }),
        json: () => Promise.resolve(users),
      })
    )

    const deps = createDeps()
    const query = createQuery('/users', undefined, deps)

    const states: any[] = []
    const unsub = query.subscribe((state: any) => {
      states.push({ ...state })
    })

    // Should receive initial idle state
    expect(states.length).toBe(1)
    expect(states[0].status).toBe('idle')

    await query.execute()

    // Should have received updated states
    expect(states.length).toBeGreaterThan(1)
    const lastState = states[states.length - 1]
    expect(lastState.status).toBe('success')
    expect(lastState.data).toEqual(users)

    unsub()
  })

  it('subscribes with params', async () => {
    const user = { id: '123', name: 'Alice' }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '100' }),
        json: () => Promise.resolve(user),
      })
    )

    const deps = createDeps()
    const query = createQuery('/users/:id', undefined, deps)

    const states: any[] = []
    const unsub = query.subscribe({ id: '123' }, (state: any) => {
      states.push({ ...state })
    })

    expect(states[0].status).toBe('idle')

    await query.execute({ id: '123' })

    const lastState = states[states.length - 1]
    expect(lastState.data).toEqual(user)

    unsub()
  })

  it('invalidates cache', async () => {
    const users = [{ id: '1', name: 'Alice' }]
    let callCount = 0

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        callCount++
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-length': '100' }),
          json: () => Promise.resolve(users),
        })
      })
    )

    const deps = createDeps({ defaultStaleTime: 60000 })
    const query = createQuery('/users', { staleTime: 60000 }, deps)

    await query.execute()
    expect(callCount).toBe(1)

    query.invalidate()

    // Next execute should refetch
    await query.execute()
    expect(callCount).toBe(2)
  })

  it('refetches data', async () => {
    let callCount = 0

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        callCount++
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-length': '100' }),
          json: () => Promise.resolve([{ id: callCount }]),
        })
      })
    )

    const deps = createDeps({ defaultStaleTime: 60000 })
    const query = createQuery('/users', { staleTime: 60000 }, deps)

    await query.execute()
    expect(callCount).toBe(1)

    const [result] = await query.refetch()
    expect(callCount).toBe(2)
    expect(result).toEqual([{ id: 2 }])
  })

  it('handles fetch errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network error'))
    )

    const deps = createDeps()
    const query = createQuery('/users', undefined, deps)

    const [result, err] = await query.execute()
    expect(result).toBeNull()
    expect(err).toBe('Network error')
  })

  it('provides headers from config', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '100' }),
        json: () => Promise.resolve([]),
      })
    )

    const deps = createDeps({
      headers: () => ({ Authorization: 'Bearer token' }),
    })
    const query = createQuery('/users', undefined, deps)

    await query.execute()
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/users',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
        }),
      })
    )
  })
})
