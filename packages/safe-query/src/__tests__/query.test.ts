import { describe, it, expect, vi, afterEach } from 'vitest'
import { createSafe } from '@cometloop/safe'
import { createQuery } from '../query'
import { QueryCache } from '../query-cache'
import { EntityStore } from '../entity-store'
import { Notifier } from '../notifier'
import { FocusManager } from '../focus-manager'

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
    focusManager: new FocusManager(),
    defaultRefetchInterval: false as number | false,
    defaultRefetchIntervalInBackground: false,
    defaultRefetchOnWindowFocus: false,
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

  it('stores abort controller on cache entry during fetch', async () => {
    let capturedSignal: AbortSignal | undefined
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: (ctx: any) => {
        capturedSignal = ctx.signal
        return Promise.resolve([{ id: '1' }])
      },
    }, deps)

    await query()

    expect(capturedSignal).toBeDefined()
    expect(capturedSignal!.aborted).toBe(false)
  })

  it('passes abort controller signal to fn', async () => {
    let capturedSignal: AbortSignal | undefined
    let resolvePromise: (v: any) => void
    const fetchPromise = new Promise((resolve) => { resolvePromise = resolve })

    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: (ctx: any) => {
        capturedSignal = ctx.signal
        return fetchPromise
      },
    }, deps)

    const p = query()
    expect(capturedSignal).toBeInstanceOf(AbortSignal)
    expect(capturedSignal!.aborted).toBe(false)

    resolvePromise!([])
    await p
  })

  it('abort controller is aborted on invalidate', async () => {
    let capturedSignal: AbortSignal | undefined
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: (ctx: any) => {
        capturedSignal = ctx.signal
        return new Promise(() => {}) // never resolves
      },
    }, deps)

    query() // start fetch, don't await

    expect(capturedSignal).toBeDefined()
    expect(capturedSignal!.aborted).toBe(false)

    query.invalidate()

    expect(capturedSignal!.aborted).toBe(true)
  })

  it('links user-provided signal to internal controller', async () => {
    let capturedSignal: AbortSignal | undefined
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: (ctx: any) => {
        capturedSignal = ctx.signal
        return new Promise(() => {})
      },
    }, deps)

    const userController = new AbortController()
    query({ signal: userController.signal })

    expect(capturedSignal).toBeDefined()
    expect(capturedSignal!.aborted).toBe(false)

    userController.abort('user cancelled')

    expect(capturedSignal!.aborted).toBe(true)
  })

  it('handles already-aborted user signal', async () => {
    let capturedSignal: AbortSignal | undefined
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: (ctx: any) => {
        capturedSignal = ctx.signal
        return new Promise(() => {})
      },
    }, deps)

    const userController = new AbortController()
    userController.abort('pre-aborted')
    query({ signal: userController.signal })

    expect(capturedSignal!.aborted).toBe(true)
  })

  it('clears abort controller on settled', async () => {
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1' }]),
    }, deps)

    await query()

    const entry = deps.queryCache.get('/users')
    expect(entry?.abortController).toBeNull()
  })

  it('emits a one-time warning for getter on parameterized query', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const deps = createDeps()
    const query = createQuery({
      key: '/users/:id',
      fn: () => Promise.resolve({ id: '1' }),
    }, deps)

    // First access should warn
    void query.status
    expect(warnSpy).toHaveBeenCalledOnce()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('parameterized query')
    )

    // Second access should not warn again
    warnSpy.mockClear()
    void query.data
    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('returns error when enabled: false and no cached data', async () => {
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1' }]),
    }, deps)

    const [data, err] = await query({ enabled: false })
    // Should be a proper error, not [null, null]
    expect(data).toBeNull()
    expect(err).toBeTruthy()
    expect(typeof err).toBe('string')
  })

  it('returns cached data when enabled: false and cache exists', async () => {
    const users = [{ id: '1', name: 'Alice' }]
    const deps = createDeps({ defaultStaleTime: 60000 })
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve(users),
      staleTime: 60000,
    }, deps)

    // Populate cache
    await query()

    // Disabled query should still return cached data
    const [data, err] = await query({ enabled: false })
    expect(err).toBeNull()
    expect(data).toEqual(users)
  })

  it('does not fetch when enabled: false', async () => {
    const fn = vi.fn().mockResolvedValue([{ id: '1' }])
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn,
    }, deps)

    await query({ enabled: false })
    expect(fn).not.toHaveBeenCalled()
  })

  it('does not warn for non-parameterized query getters', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve([]),
    }, deps)

    void query.status
    void query.data
    void query.error
    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('preserves stale data when refetch fails (stale-while-revalidate)', async () => {
    const users = [{ id: '1', name: 'Alice' }]
    let callCount = 0
    const fn = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve(users)
      return Promise.reject(new Error('Server error'))
    })

    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn,
    }, deps)

    // First call succeeds
    await query()
    expect(query.status).toBe('success')
    expect(query.data).toEqual(users)

    // Force refetch that fails
    await query.refetch()
    expect(query.status).toBe('error')
    // Data should still be the stale value from the first success
    expect(query.data).toEqual(users)
    expect(query.error).toBe('Server error')
  })

  it('mapToEntities transforms data and entities are normalized', async () => {
    type ApiUser = { type: string; id: string; name: string }
    type NormalizedUser = ApiUser & { __type: 'user' }

    const apiUsers: ApiUser[] = [
      { type: 'user', id: '1', name: 'Alice' },
      { type: 'user', id: '2', name: 'Bob' },
    ]

    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve(apiUsers),
      mapToEntities: (users): NormalizedUser[] =>
        users.map(u => ({ ...u, __type: 'user' as const })),
      entities: { user: (u: any) => u.id },
    }, deps)

    const [result, err] = await query()
    expect(err).toBeNull()
    expect(result).toEqual([
      { type: 'user', id: '1', name: 'Alice', __type: 'user' },
      { type: 'user', id: '2', name: 'Bob', __type: 'user' },
    ])

    expect(deps.entityStore.get('user', '1')).toEqual(
      expect.objectContaining({ id: '1', name: 'Alice', __type: 'user' })
    )
    expect(deps.entityStore.get('user', '2')).toEqual(
      expect.objectContaining({ id: '2', name: 'Bob', __type: 'user' })
    )
  })

  it('mapToEntities composes with parseResponse', async () => {
    type RawResponse = { data: { type: string; id: string; name: string }[] }
    type ApiUser = { type: string; id: string; name: string }
    type NormalizedUser = ApiUser & { __type: 'user' }

    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: (): Promise<RawResponse> => Promise.resolve({
        data: [{ type: 'user', id: '1', name: 'Alice' }],
      }),
      parseResponse: (raw: RawResponse): ApiUser[] => raw.data,
      mapToEntities: (users): NormalizedUser[] =>
        users.map(u => ({ ...u, __type: 'user' as const })),
      entities: { user: (u: any) => u.id },
    }, deps)

    const [result, err] = await query()
    expect(err).toBeNull()
    expect(result).toEqual([
      { type: 'user', id: '1', name: 'Alice', __type: 'user' },
    ])

    expect(deps.entityStore.get('user', '1')).toEqual(
      expect.objectContaining({ id: '1', name: 'Alice', __type: 'user' })
    )
  })

  it('mapToEntities without entities still transforms data', async () => {
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1', name: 'Alice' }]),
      mapToEntities: (users) =>
        users.map(u => ({ ...u, __type: 'user' as const })),
    }, deps)

    const [result, err] = await query()
    expect(err).toBeNull()
    expect(result).toEqual([{ id: '1', name: 'Alice', __type: 'user' }])
  })

  it('subscribers receive mapToEntities-transformed data', async () => {
    type ApiUser = { type: string; id: string; name: string }
    type NormalizedUser = ApiUser & { __type: 'user' }

    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: (): Promise<ApiUser[]> => Promise.resolve([
        { type: 'user', id: '1', name: 'Alice' },
      ]),
      mapToEntities: (users): NormalizedUser[] =>
        users.map(u => ({ ...u, __type: 'user' as const })),
      entities: { user: (u: any) => u.id },
    }, deps)

    const states: any[] = []
    const unsub = query.subscribe((state) => {
      states.push({ ...state })
    })

    await query()

    const lastState = states[states.length - 1]
    expect(lastState.status).toBe('success')
    expect(lastState.data).toEqual([
      { type: 'user', id: '1', name: 'Alice', __type: 'user' },
    ])

    unsub()
  })

  // ─── initialData ───

  it('static initialData populates cache — invoke returns it without calling fn', async () => {
    const fn = vi.fn().mockResolvedValue([{ id: '1' }])
    const deps = createDeps({ defaultStaleTime: 60000 })
    const query = createQuery({
      key: '/users',
      fn,
      staleTime: 60000,
      initialData: [{ id: '1', name: 'Alice' }],
      initialDataUpdatedAt: Date.now(),
    }, deps)

    const [result, err] = await query()
    expect(err).toBeNull()
    expect(result).toEqual([{ id: '1', name: 'Alice' }])
    expect(fn).not.toHaveBeenCalled()
  })

  it('function initialData receives context with params and getEntity', async () => {
    const fn = vi.fn().mockResolvedValue({ id: '1', name: 'Alice' })
    const deps = createDeps({ defaultStaleTime: 60000 })

    // Pre-populate entity store
    deps.entityStore.set('user', '1', { id: '1', name: 'Alice', __type: 'user' })

    const initialDataFn = vi.fn().mockImplementation((ctx: any) => {
      return ctx.getEntity('user', ctx.params.id)
    })

    const query = createQuery({
      key: '/users/:id',
      fn,
      staleTime: 60000,
      initialData: initialDataFn,
      initialDataUpdatedAt: Date.now(),
    }, deps)

    const [result, err] = await query({ params: { id: '1' } })
    expect(err).toBeNull()
    expect(result).toEqual({ id: '1', name: 'Alice', __type: 'user' })
    expect(initialDataFn).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { id: '1' },
        getEntity: expect.any(Function),
      })
    )
    expect(fn).not.toHaveBeenCalled()
  })

  it('initialDataUpdatedAt older than staleTime triggers background refetch', async () => {
    const fn = vi.fn().mockResolvedValue([{ id: '1', name: 'Updated Alice' }])
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn,
      staleTime: 60000,
      initialData: [{ id: '1', name: 'Alice' }],
      initialDataUpdatedAt: Date.now() - 120000, // 2 minutes ago, stale
    }, deps)

    const [result] = await query()
    // fn should have been called because the initial data is stale
    expect(fn).toHaveBeenCalledTimes(1)
    expect(result).toEqual([{ id: '1', name: 'Updated Alice' }])
  })

  it('initialDataUpdatedAt = now + long staleTime → no fetch', async () => {
    const fn = vi.fn().mockResolvedValue([{ id: '1', name: 'Server' }])
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn,
      staleTime: 60000,
      initialData: [{ id: '1', name: 'Cached' }],
      initialDataUpdatedAt: Date.now(),
    }, deps)

    const [result] = await query()
    expect(fn).not.toHaveBeenCalled()
    expect(result).toEqual([{ id: '1', name: 'Cached' }])
  })

  it('initialData not used when cache already has data', async () => {
    const fn = vi.fn().mockResolvedValue([{ id: '1', name: 'Server' }])
    const deps = createDeps({ defaultStaleTime: 60000 })
    const query = createQuery({
      key: '/users',
      fn,
      staleTime: 60000,
      initialData: [{ id: '1', name: 'Initial' }],
      initialDataUpdatedAt: Date.now(),
    }, deps)

    // First invoke seeds initial data
    await query()
    expect(fn).not.toHaveBeenCalled()

    // Invalidate to make stale, then re-invoke
    query.invalidate()
    const [result] = await query()
    // Should have called fn since cache was invalidated (data existed but was stale)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(result).toEqual([{ id: '1', name: 'Server' }])
  })

  it('initialData works with entity normalization — entity store populated', async () => {
    const fn = vi.fn().mockResolvedValue([])
    const deps = createDeps({ defaultStaleTime: 60000 })
    const query = createQuery({
      key: '/users',
      fn,
      staleTime: 60000,
      initialData: [
        { id: '1', name: 'Alice', __type: 'user' },
        { id: '2', name: 'Bob', __type: 'user' },
      ],
      initialDataUpdatedAt: Date.now(),
      entities: { user: (u: any) => u.id },
    }, deps)

    await query()

    expect(fn).not.toHaveBeenCalled()
    expect(deps.entityStore.get('user', '1')).toEqual(
      expect.objectContaining({ id: '1', name: 'Alice', __type: 'user' })
    )
    expect(deps.entityStore.get('user', '2')).toEqual(
      expect.objectContaining({ id: '2', name: 'Bob', __type: 'user' })
    )
  })

  it('initialData seeded on subscribe — first callback receives data', async () => {
    const deps = createDeps({ defaultStaleTime: 60000 })
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve([]),
      staleTime: 60000,
      initialData: [{ id: '1', name: 'Alice' }],
      initialDataUpdatedAt: Date.now(),
    }, deps)

    const states: any[] = []
    const unsub = query.subscribe((state) => {
      states.push({ ...state })
    })

    expect(states[0].status).toBe('success')
    expect(states[0].data).toEqual([{ id: '1', name: 'Alice' }])
    expect(states[0].isPlaceholderData).toBe(false)

    unsub()
  })

  it('function initialData returning undefined → skips seeding, normal fetch proceeds', async () => {
    const fn = vi.fn().mockResolvedValue([{ id: '1', name: 'Server' }])
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn,
      initialData: () => undefined,
    }, deps)

    const [result] = await query()
    expect(fn).toHaveBeenCalledTimes(1)
    expect(result).toEqual([{ id: '1', name: 'Server' }])
  })

  it('initialData works with enabled: false — returns initial data instead of QueryDisabledError', async () => {
    const fn = vi.fn().mockResolvedValue([])
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn,
      initialData: [{ id: '1', name: 'Alice' }],
      initialDataUpdatedAt: Date.now(),
    }, deps)

    const [result, err] = await query({ enabled: false })
    expect(err).toBeNull()
    expect(result).toEqual([{ id: '1', name: 'Alice' }])
    expect(fn).not.toHaveBeenCalled()
  })

  // ─── placeholderData ───

  it('placeholderData appears in subscriber state while fetching', async () => {
    let resolvePromise: (value: any) => void
    const fetchPromise = new Promise((resolve) => { resolvePromise = resolve })

    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => fetchPromise as Promise<any>,
      placeholderData: [{ id: '1', name: 'Placeholder' }],
    }, deps)

    const states: any[] = []
    const unsub = query.subscribe((state) => {
      states.push({ ...state })
    })

    // Start fetch
    const executePromise = query()

    // Find the loading state — should have placeholder
    const loadingState = states.find(s => s.isFetching && s.isPlaceholderData)
    expect(loadingState).toBeDefined()
    expect(loadingState.data).toEqual([{ id: '1', name: 'Placeholder' }])
    expect(loadingState.status).toBe('success')
    expect(loadingState.isFetching).toBe(true)
    expect(loadingState.isPlaceholderData).toBe(true)

    resolvePromise!([{ id: '1', name: 'Real' }])
    await executePromise

    unsub()
  })

  it('placeholderData disappears when fetch completes — replaced by real data', async () => {
    let resolvePromise: (value: any) => void
    const fetchPromise = new Promise((resolve) => { resolvePromise = resolve })

    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => fetchPromise as Promise<any>,
      placeholderData: [{ id: '1', name: 'Placeholder' }],
    }, deps)

    const states: any[] = []
    const unsub = query.subscribe((state) => {
      states.push({ ...state })
    })

    const executePromise = query()
    resolvePromise!([{ id: '1', name: 'Real' }])
    await executePromise

    const lastState = states[states.length - 1]
    expect(lastState.data).toEqual([{ id: '1', name: 'Real' }])
    expect(lastState.isPlaceholderData).toBe(false)
    expect(lastState.status).toBe('success')
    expect(lastState.isFetching).toBe(false)

    unsub()
  })

  it('placeholderData not stored in cache', async () => {
    let resolvePromise: (value: any) => void
    const fetchPromise = new Promise((resolve) => { resolvePromise = resolve })

    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => fetchPromise as Promise<any>,
      placeholderData: [{ id: '1', name: 'Placeholder' }],
    }, deps)

    query()

    // Cache entry should have no data
    const entry = deps.queryCache.get('/users')
    expect(entry?.data).toBeUndefined()

    resolvePromise!([{ id: '1', name: 'Real' }])
  })

  it('placeholderData function form receives context with getEntity', async () => {
    let resolvePromise: (value: any) => void
    const fetchPromise = new Promise((resolve) => { resolvePromise = resolve })

    const deps = createDeps()
    deps.entityStore.set('user', '1', { id: '1', name: 'From Store', __type: 'user' })

    const placeholderFn = vi.fn().mockImplementation((ctx: any) => {
      return ctx.getEntity('user', '1')
    })

    const query = createQuery({
      key: '/users/:id',
      fn: () => fetchPromise as Promise<any>,
      placeholderData: placeholderFn,
    }, deps)

    const states: any[] = []
    const unsub = query.subscribe((state) => {
      states.push({ ...state })
    }, { params: { id: '1' } })

    query({ params: { id: '1' } })

    const placeholderState = states.find(s => s.isPlaceholderData)
    expect(placeholderState).toBeDefined()
    expect(placeholderState.data).toEqual({ id: '1', name: 'From Store', __type: 'user' })
    expect(placeholderFn).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { id: '1' },
        getEntity: expect.any(Function),
      })
    )

    resolvePromise!({ id: '1', name: 'Real' })
    unsub()
  })

  it('placeholderData not used when cache has data', async () => {
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1', name: 'Real' }]),
      placeholderData: [{ id: '1', name: 'Placeholder' }],
    }, deps)

    await query()

    const states: any[] = []
    const unsub = query.subscribe((state) => {
      states.push({ ...state })
    })

    // With data in cache, placeholder should never appear
    expect(states[0].data).toEqual([{ id: '1', name: 'Real' }])
    expect(states[0].isPlaceholderData).toBe(false)

    unsub()
  })

  it('isPlaceholderData is false in all non-placeholder scenarios', async () => {
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1' }]),
    }, deps)

    const states: any[] = []
    const unsub = query.subscribe((state) => {
      states.push({ ...state })
    })

    await query()

    for (const state of states) {
      expect(state.isPlaceholderData).toBe(false)
    }

    unsub()
  })
})
