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

    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve(users),
    }, deps)

    const [result, err] = await query()
    expect(err).toBeNull()
    expect(result).toEqual(users)
  })

  it('executes a query with path params', async () => {
    const user = { id: '123', name: 'Alice' }

    const deps = createDeps()
    const fn = vi.fn().mockResolvedValue(user)
    const query = createQuery({
      key: '/users/:id',
      fn,
    }, deps)

    const [result, err] = await query({ params: { id: '123' } })
    expect(err).toBeNull()
    expect(result).toEqual(user)
    expect(fn).toHaveBeenCalledWith(
      expect.objectContaining({ params: { id: '123' } })
    )
  })

  it('applies parseResponse', async () => {
    const rawData = [{ id: '1', name: 'Alice' }]

    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve(rawData),
      parseResponse: (data: any[]) =>
        data.map((u) => ({ ...u, __type: 'user' as const })),
    }, deps)

    const [result, err] = await query()
    expect(err).toBeNull()
    expect(result).toEqual([{ id: '1', name: 'Alice', __type: 'user' }])
  })

  it('normalizes entities', async () => {
    const users = [
      { id: '1', name: 'Alice', __type: 'user' },
      { id: '2', name: 'Bob', __type: 'user' },
    ]

    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve(users),
      entities: { user: (u: any) => u.id },
    }, deps)

    await query()

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
    const fn = vi.fn().mockResolvedValue(users)

    const deps = createDeps({ defaultStaleTime: 60000 })
    const query = createQuery({
      key: '/users',
      fn,
      staleTime: 60000,
    }, deps)

    await query()
    expect(fn).toHaveBeenCalledTimes(1)

    // Second call should return cached data
    const [result, err] = await query()
    expect(err).toBeNull()
    expect(result).toEqual(users)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('deduplicates concurrent requests', async () => {
    let resolvePromise: (value: any) => void
    const fetchPromise = new Promise((resolve) => {
      resolvePromise = resolve
    })

    const fn = vi.fn().mockReturnValue(fetchPromise)

    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn,
    }, deps)

    const p1 = query()
    const p2 = query()

    resolvePromise!([{ id: '1' }])

    const [r1] = await p1
    const [r2] = await p2

    expect(r1).toEqual([{ id: '1' }])
    expect(r2).toEqual([{ id: '1' }])
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('subscribes and receives state updates', async () => {
    const users = [{ id: '1', name: 'Alice' }]

    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve(users),
    }, deps)

    const states: any[] = []
    const unsub = query.subscribe((state: any) => {
      states.push({ ...state })
    })

    // Should receive initial idle state
    expect(states.length).toBe(1)
    expect(states[0].status).toBe('idle')

    await query()

    // Should have received updated states
    expect(states.length).toBeGreaterThan(1)
    const lastState = states[states.length - 1]
    expect(lastState.status).toBe('success')
    expect(lastState.data).toEqual(users)

    unsub()
  })

  it('subscribes with params', async () => {
    const user = { id: '123', name: 'Alice' }

    const deps = createDeps()
    const query = createQuery({
      key: '/users/:id',
      fn: () => Promise.resolve(user),
    }, deps)

    const states: any[] = []
    const unsub = query.subscribe((state: any) => {
      states.push({ ...state })
    }, { params: { id: '123' } })

    expect(states[0].status).toBe('idle')

    await query({ params: { id: '123' } })

    const lastState = states[states.length - 1]
    expect(lastState.data).toEqual(user)

    unsub()
  })

  it('invalidates cache', async () => {
    const users = [{ id: '1', name: 'Alice' }]
    let callCount = 0
    const fn = vi.fn().mockImplementation(() => {
      callCount++
      return Promise.resolve(users)
    })

    const deps = createDeps({ defaultStaleTime: 60000 })
    const query = createQuery({
      key: '/users',
      fn,
      staleTime: 60000,
    }, deps)

    await query()
    expect(callCount).toBe(1)

    query.invalidate()

    // Next execute should refetch
    await query()
    expect(callCount).toBe(2)
  })

  it('refetches data', async () => {
    let callCount = 0
    const fn = vi.fn().mockImplementation(() => {
      callCount++
      return Promise.resolve([{ id: callCount }])
    })

    const deps = createDeps({ defaultStaleTime: 60000 })
    const query = createQuery({
      key: '/users',
      fn,
      staleTime: 60000,
    }, deps)

    await query()
    expect(callCount).toBe(1)

    const [result] = await query.refetch()
    expect(callCount).toBe(2)
    expect(result).toEqual([{ id: 2 }])
  })

  it('handles fetch errors', async () => {
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => Promise.reject(new Error('Network error')),
    }, deps)

    const [result, err] = await query()
    expect(result).toBeNull()
    expect(err).toBe('Network error')
  })

  it('executes a query with search params', async () => {
    const users = [{ id: '1', name: 'Alice' }]
    const fn = vi.fn().mockResolvedValue(users)

    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn,
    }, deps)

    const [result, err] = await query({
      searchParams: { search: 'foo', page: 2 },
    })
    expect(err).toBeNull()
    expect(result).toEqual(users)
    expect(fn).toHaveBeenCalledWith(
      expect.objectContaining({ searchParams: { search: 'foo', page: 2 } })
    )
  })

  it('executes a query with path params and search params', async () => {
    const posts = [{ id: 'p1', title: 'Hello' }]
    const fn = vi.fn().mockResolvedValue(posts)

    const deps = createDeps()
    const query = createQuery({
      key: '/users/:id/posts',
      fn,
    }, deps)

    const [result, err] = await query({
      params: { id: '123' },
      searchParams: { page: 2 },
    })
    expect(err).toBeNull()
    expect(result).toEqual(posts)
    expect(fn).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { id: '123' },
        searchParams: { page: 2 },
      })
    )
  })

  it('different search params produce different cache entries', async () => {
    let callCount = 0
    const fn = vi.fn().mockImplementation(() => {
      callCount++
      return Promise.resolve([{ page: callCount }])
    })

    const deps = createDeps({ defaultStaleTime: 60000 })
    const query = createQuery({
      key: '/users',
      fn,
      staleTime: 60000,
    }, deps)

    await query({ searchParams: { page: 1 } })
    await query({ searchParams: { page: 2 } })

    // Both should have made separate fetch calls
    expect(callCount).toBe(2)
  })

  it('subscribes with search params (no path params)', async () => {
    const users = [{ id: '1', name: 'Alice' }]

    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve(users),
    }, deps)

    const states: any[] = []
    const unsub = query.subscribe(
      (state: any) => { states.push({ ...state }) },
      { searchParams: { search: 'foo' } }
    )

    expect(states[0].status).toBe('idle')

    await query({ searchParams: { search: 'foo' } })

    const lastState = states[states.length - 1]
    expect(lastState.data).toEqual(users)

    unsub()
  })

  it('invalidates with search params', async () => {
    let callCount = 0
    const fn = vi.fn().mockImplementation(() => {
      callCount++
      return Promise.resolve([{ id: callCount }])
    })

    const deps = createDeps({ defaultStaleTime: 60000 })
    const query = createQuery({
      key: '/users',
      fn,
      staleTime: 60000,
    }, deps)

    await query({ searchParams: { page: 1 } })
    expect(callCount).toBe(1)

    query.invalidate({ searchParams: { page: 1 } })

    await query({ searchParams: { page: 1 } })
    expect(callCount).toBe(2)
  })

  it('refetches with search params', async () => {
    let callCount = 0
    const fn = vi.fn().mockImplementation(() => {
      callCount++
      return Promise.resolve([{ id: callCount }])
    })

    const deps = createDeps({ defaultStaleTime: 60000 })
    const query = createQuery({
      key: '/users',
      fn,
      staleTime: 60000,
    }, deps)

    await query({ searchParams: { page: 1 } })
    expect(callCount).toBe(1)

    const [result] = await query.refetch({
      searchParams: { page: 1 },
    })
    expect(callCount).toBe(2)
    expect(result).toEqual([{ id: 2 }])
  })

  it('exposes reactive status getter', async () => {
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1' }]),
    }, deps)

    expect(query.status).toBe('idle')
    expect(query.data).toBeUndefined()
    expect(query.error).toBeNull()
    expect(query.isFetching).toBe(false)
    expect(query.isStale).toBe(true)

    await query()

    expect(query.status).toBe('success')
    expect(query.data).toEqual([{ id: '1' }])
    expect(query.isFetching).toBe(false)
  })
})
