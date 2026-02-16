import { describe, it, expect, vi, afterEach } from 'vitest'
import { createSafe } from '@cometloop/safe'
import { safeQuery } from '../client'

type AppError = { code: string; message: string }

function createClient(overrides: Record<string, any> = {}) {
  const safe = createSafe<AppError>({
    parseError: (e) => ({
      code: 'UNKNOWN',
      message: e instanceof Error ? e.message : String(e),
    }),
    defaultError: { code: 'UNKNOWN', message: 'Unknown error' },
  })

  return safeQuery<AppError>({
    safe,
    ...overrides,
  })
}

describe('safeQuery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a client with query and mutate methods', () => {
    const api = createClient()
    expect(api.query).toBeTypeOf('function')
    expect(api.mutate).toBeTypeOf('function')
  })

  it('creates a query that executes', async () => {
    const api = createClient()
    const usersQuery = api.query({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1', name: 'Alice' }]),
    })

    const [result, err] = await usersQuery()
    expect(err).toBeNull()
    expect(result).toEqual([{ id: '1', name: 'Alice' }])
  })

  it('creates a query with path params', async () => {
    const api = createClient()
    const userQuery = api.query({
      key: '/users/:id',
      fn: () => Promise.resolve({ id: '123', name: 'Alice' }),
    })

    const [result, err] = await userQuery({ params: { id: '123' } })
    expect(err).toBeNull()
    expect(result).toEqual({ id: '123', name: 'Alice' })
  })

  it('creates a mutation that executes', async () => {
    const api = createClient()
    const createUser = api.mutate({
      key: '/users',
      fn: () => Promise.resolve({ id: '1', name: 'Alice' }),
      method: 'POST',
    })

    const [result, err] = await createUser({ body: { name: 'Alice' } })
    expect(err).toBeNull()
    expect(result).toEqual({ id: '1', name: 'Alice' })
  })

  it('fn receives context with params', async () => {
    const fn = vi.fn().mockResolvedValue([])

    const api = createClient()
    const usersQuery = api.query({
      key: '/users',
      fn,
    })

    await usersQuery()
    expect(fn).toHaveBeenCalled()
  })

  it('uses custom staleTime and gcTime', async () => {
    const fn = vi.fn().mockResolvedValue([{ id: '1' }])

    const api = createClient({ staleTime: 30000, gcTime: 120000 })
    const usersQuery = api.query({
      key: '/users',
      fn,
    })

    await usersQuery()
    const [result] = await usersQuery() // should use cache
    expect(result).toEqual([{ id: '1' }])
    expect(fn).toHaveBeenCalledTimes(1) // only one fetch
  })

  it('handles error responses', async () => {
    const api = createClient()
    const usersQuery = api.query({
      key: '/users',
      fn: () => Promise.reject(new Error('Server failed')),
    })

    const [result, err] = await usersQuery()
    expect(result).toBeNull()
    expect(err).toBeDefined()
    expect(err!.code).toBe('UNKNOWN')
  })

  it('query has invalidate and refetch methods', () => {
    const api = createClient()
    const usersQuery = api.query({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1' }]),
    })

    expect(usersQuery.invalidate).toBeTypeOf('function')
    expect(usersQuery.refetch).toBeTypeOf('function')
  })

  it('query has subscribe method', () => {
    const api = createClient()
    const usersQuery = api.query({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1' }]),
    })

    expect(usersQuery.subscribe).toBeTypeOf('function')
  })

  // ─── invalidateByPrefix ───

  it('invalidateByPrefix causes matching queries to refetch', async () => {
    const fn = vi.fn().mockResolvedValue([{ id: '1' }])
    const api = createClient({ staleTime: 30000 })

    const usersQuery = api.query({ key: '/users', fn })
    await usersQuery()
    expect(fn).toHaveBeenCalledTimes(1)

    api.invalidateByPrefix('/users')

    await usersQuery()
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('invalidateByPrefix does not affect non-matching queries', async () => {
    const usersFn = vi.fn().mockResolvedValue([])
    const postsFn = vi.fn().mockResolvedValue([])
    const api = createClient({ staleTime: 30000 })

    const usersQuery = api.query({ key: '/users', fn: usersFn })
    const postsQuery = api.query({ key: '/posts', fn: postsFn })
    await usersQuery()
    await postsQuery()

    api.invalidateByPrefix('/users')

    await postsQuery()
    expect(postsFn).toHaveBeenCalledTimes(1)
  })

  it('invalidateByPrefix notifies subscribers', async () => {
    const api = createClient({ staleTime: 30000 })
    const usersQuery = api.query({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1' }]),
    })
    await usersQuery()

    const callback = vi.fn()
    usersQuery.subscribe(callback)
    callback.mockClear()

    api.invalidateByPrefix('/users')
    expect(callback).toHaveBeenCalled()
  })

  // ─── invalidateAll ───

  it('invalidateAll causes all queries to refetch', async () => {
    const usersFn = vi.fn().mockResolvedValue([])
    const postsFn = vi.fn().mockResolvedValue([])
    const api = createClient({ staleTime: 30000 })

    const usersQuery = api.query({ key: '/users', fn: usersFn })
    const postsQuery = api.query({ key: '/posts', fn: postsFn })
    await usersQuery()
    await postsQuery()
    expect(usersFn).toHaveBeenCalledTimes(1)
    expect(postsFn).toHaveBeenCalledTimes(1)

    api.invalidateAll()

    await usersQuery()
    await postsQuery()
    expect(usersFn).toHaveBeenCalledTimes(2)
    expect(postsFn).toHaveBeenCalledTimes(2)
  })

  it('invalidateAll notifies all subscribers', async () => {
    const api = createClient({ staleTime: 30000 })
    const usersQuery = api.query({
      key: '/users',
      fn: () => Promise.resolve([]),
    })
    const postsQuery = api.query({
      key: '/posts',
      fn: () => Promise.resolve([]),
    })
    await usersQuery()
    await postsQuery()

    const usersCb = vi.fn()
    const postsCb = vi.fn()
    usersQuery.subscribe(usersCb)
    postsQuery.subscribe(postsCb)
    usersCb.mockClear()
    postsCb.mockClear()

    api.invalidateAll()
    expect(usersCb).toHaveBeenCalled()
    expect(postsCb).toHaveBeenCalled()
  })

  // ─── clear ───

  it('clear removes cached data so next call refetches', async () => {
    const fn = vi.fn().mockResolvedValue([{ id: '1' }])
    const api = createClient({ staleTime: 30000 })

    const usersQuery = api.query({ key: '/users', fn })
    await usersQuery()
    expect(fn).toHaveBeenCalledTimes(1)

    api.clear()

    await usersQuery()
    expect(fn).toHaveBeenCalledTimes(2)
  })

  // ─── destroy ───

  it('destroy prevents further query calls', () => {
    const api = createClient()
    api.destroy()

    expect(() =>
      api.query({ key: '/users', fn: () => Promise.resolve([]) })
    ).toThrow('SafeQueryClient has been destroyed')
  })

  it('destroy prevents further mutate calls', () => {
    const api = createClient()
    api.destroy()

    expect(() =>
      api.mutate({ key: '/users', fn: () => Promise.resolve(), method: 'POST' })
    ).toThrow('SafeQueryClient has been destroyed')
  })

  it('destroy prevents invalidateByPrefix', () => {
    const api = createClient()
    api.destroy()

    expect(() => api.invalidateByPrefix('/users')).toThrow(
      'SafeQueryClient has been destroyed'
    )
  })

  it('destroy prevents invalidateAll', () => {
    const api = createClient()
    api.destroy()

    expect(() => api.invalidateAll()).toThrow(
      'SafeQueryClient has been destroyed'
    )
  })

  it('destroy prevents clear', () => {
    const api = createClient()
    api.destroy()

    expect(() => api.clear()).toThrow('SafeQueryClient has been destroyed')
  })

  it('destroy is idempotent', () => {
    const api = createClient()
    api.destroy()
    expect(() => api.destroy()).not.toThrow()
  })

  // ─── subscribe ───

  it('subscribe receives initial state immediately', () => {
    const api = createClient()
    const usersQuery = api.query({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1' }]),
    })

    const callback = vi.fn()
    usersQuery.subscribe(callback)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'idle', data: undefined })
    )
  })

  it('subscribe is notified after query fetches', async () => {
    const api = createClient()
    const usersQuery = api.query({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1' }]),
    })

    const states: any[] = []
    usersQuery.subscribe((state) => states.push({ ...state }))

    await usersQuery()

    const lastState = states[states.length - 1]
    expect(lastState.status).toBe('success')
    expect(lastState.data).toEqual([{ id: '1' }])
  })

  it('unsubscribe stops notifications', async () => {
    const api = createClient({ staleTime: 30000 })
    const usersQuery = api.query({
      key: '/users',
      fn: () => Promise.resolve([]),
    })
    await usersQuery()

    const callback = vi.fn()
    const unsub = usersQuery.subscribe(callback)
    callback.mockClear()

    unsub()
    usersQuery.invalidate()
    expect(callback).not.toHaveBeenCalled()
  })

  // ─── invalidate (per-query) ───

  it('query.invalidate causes next call to refetch', async () => {
    const fn = vi.fn().mockResolvedValue([{ id: '1' }])
    const api = createClient({ staleTime: 30000 })

    const usersQuery = api.query({ key: '/users', fn })
    await usersQuery()
    expect(fn).toHaveBeenCalledTimes(1)

    usersQuery.invalidate()

    await usersQuery()
    expect(fn).toHaveBeenCalledTimes(2)
  })

  // ─── refetch ───

  it('query.refetch forces a fresh fetch', async () => {
    let callCount = 0
    const fn = vi.fn().mockImplementation(() => {
      callCount++
      return Promise.resolve([{ id: String(callCount) }])
    })
    const api = createClient({ staleTime: 30000 })

    const usersQuery = api.query({ key: '/users', fn })
    await usersQuery()
    expect(fn).toHaveBeenCalledTimes(1)

    const [result] = await usersQuery.refetch()
    expect(fn).toHaveBeenCalledTimes(2)
    expect(result).toEqual([{ id: '2' }])
  })

  // ─── reactive getters ───

  it('exposes reactive status getter', async () => {
    const api = createClient()
    const usersQuery = api.query({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1' }]),
    })

    expect(usersQuery.status).toBe('idle')
    await usersQuery()
    expect(usersQuery.status).toBe('success')
  })

  it('exposes reactive data getter', async () => {
    const api = createClient()
    const usersQuery = api.query({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1' }]),
    })

    expect(usersQuery.data).toBeUndefined()
    await usersQuery()
    expect(usersQuery.data).toEqual([{ id: '1' }])
  })

  it('exposes reactive error getter', async () => {
    const api = createClient()
    const usersQuery = api.query({
      key: '/users',
      fn: () => Promise.reject(new Error('fail')),
    })

    expect(usersQuery.error).toBeNull()
    await usersQuery()
    expect(usersQuery.error).toBeDefined()
  })

  it('exposes reactive isStale getter', async () => {
    const api = createClient({ staleTime: 30000 })
    const usersQuery = api.query({
      key: '/users',
      fn: () => Promise.resolve([]),
    })

    expect(usersQuery.isStale).toBe(true)
    await usersQuery()
    expect(usersQuery.isStale).toBe(false)
  })

  // ─── enabled: false ───

  it('enabled: false skips fetch and returns [null, null]', async () => {
    const fn = vi.fn().mockResolvedValue([])
    const api = createClient()
    const usersQuery = api.query({ key: '/users', fn })

    const [result, err] = await usersQuery({ enabled: false })
    expect(fn).not.toHaveBeenCalled()
    expect(result).toBeNull()
    expect(err).toBeNull()
  })

  it('enabled: false returns cached data if available', async () => {
    const fn = vi.fn().mockResolvedValue([{ id: '1' }])
    const api = createClient({ staleTime: 30000 })
    const usersQuery = api.query({ key: '/users', fn })

    await usersQuery()
    expect(fn).toHaveBeenCalledTimes(1)

    const [result, err] = await usersQuery({ enabled: false })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(result).toEqual([{ id: '1' }])
    expect(err).toBeNull()
  })

  // ─── parseResponse ───

  it('parseResponse transforms query data', async () => {
    const api = createClient()
    const usersQuery = api.query({
      key: '/users',
      fn: () => Promise.resolve({ items: [{ id: '1' }] }),
      parseResponse: (data) => data.items,
    })

    const [result, err] = await usersQuery()
    expect(err).toBeNull()
    expect(result).toEqual([{ id: '1' }])
  })

  it('parseResponse transforms mutation data', async () => {
    const api = createClient()
    const createUser = api.mutate({
      key: '/users',
      method: 'POST',
      fn: () => Promise.resolve({ data: { id: '1', name: 'Alice' } }),
      parseResponse: (d) => d.data,
    })

    const [result, err] = await createUser({ body: { name: 'Alice' } })
    expect(err).toBeNull()
    expect(result).toEqual({ id: '1', name: 'Alice' })
  })

  // ─── lifecycle callbacks ───

  it('query config-level onSuccess is called', async () => {
    const onSuccess = vi.fn()
    const api = createClient()
    const usersQuery = api.query({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1' }]),
      onSuccess,
    })

    await usersQuery()
    expect(onSuccess).toHaveBeenCalledWith([{ id: '1' }])
  })

  it('query config-level onError is called', async () => {
    const onError = vi.fn()
    const api = createClient()
    const usersQuery = api.query({
      key: '/users',
      fn: () => Promise.reject(new Error('fail')),
      onError,
    })

    await usersQuery()
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'UNKNOWN' })
    )
  })

  it('query config-level onSettled is called on success', async () => {
    const onSettled = vi.fn()
    const api = createClient()
    const usersQuery = api.query({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1' }]),
      onSettled,
    })

    await usersQuery()
    expect(onSettled).toHaveBeenCalledWith([{ id: '1' }], null)
  })

  it('query invoke-level onSuccess is called', async () => {
    const onSuccess = vi.fn()
    const api = createClient()
    const usersQuery = api.query({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1' }]),
    })

    await usersQuery({ onSuccess })
    expect(onSuccess).toHaveBeenCalledWith([{ id: '1' }])
  })

  it('query invoke-level onError is called', async () => {
    const onError = vi.fn()
    const api = createClient()
    const usersQuery = api.query({
      key: '/users',
      fn: () => Promise.reject(new Error('fail')),
    })

    await usersQuery({ onError })
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'UNKNOWN' })
    )
  })

  it('mutation config-level onSuccess is called', async () => {
    const onSuccess = vi.fn()
    const api = createClient()
    const createUser = api.mutate({
      key: '/users',
      method: 'POST',
      fn: () => Promise.resolve({ id: '1' }),
      onSuccess,
    })

    await createUser({ body: {} })
    expect(onSuccess).toHaveBeenCalledWith({ id: '1' })
  })

  it('mutation config-level onError is called', async () => {
    const onError = vi.fn()
    const api = createClient()
    const createUser = api.mutate({
      key: '/users',
      method: 'POST',
      fn: () => Promise.reject(new Error('fail')),
      onError,
    })

    await createUser({ body: {} })
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'UNKNOWN' })
    )
  })

  it('mutation invoke-level onSettled is called', async () => {
    const onSettled = vi.fn()
    const api = createClient()
    const createUser = api.mutate({
      key: '/users',
      method: 'POST',
      fn: () => Promise.resolve({ id: '1' }),
    })

    await createUser({ body: {}, onSettled })
    expect(onSettled).toHaveBeenCalledWith({ id: '1' }, null)
  })

  // ─── mutation error handling ───

  it('mutation returns error tuple on failure', async () => {
    const api = createClient()
    const createUser = api.mutate({
      key: '/users',
      method: 'POST',
      fn: () => Promise.reject(new Error('bad request')),
    })

    const [result, err] = await createUser({ body: {} })
    expect(result).toBeNull()
    expect(err).toBeDefined()
    expect(err!.code).toBe('UNKNOWN')
  })

  // ─── query deduplication ───

  it('deduplicates concurrent calls to the same query', async () => {
    let resolvePromise: (v: any) => void
    const fn = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolvePromise = resolve })
    )
    const api = createClient()

    const usersQuery = api.query({ key: '/users', fn })

    const p1 = usersQuery()
    const p2 = usersQuery()

    resolvePromise!([{ id: '1' }])

    const [r1] = await p1
    const [r2] = await p2
    expect(fn).toHaveBeenCalledTimes(1)
    expect(r1).toEqual([{ id: '1' }])
    expect(r2).toEqual([{ id: '1' }])
  })

  // ─── search params ───

  it('different search params create separate cache entries', async () => {
    const fn = vi.fn().mockImplementation((ctx: any) =>
      Promise.resolve([{ page: ctx.searchParams?.page }])
    )
    const api = createClient({ staleTime: 30000 })

    const usersQuery = api.query({ key: '/users', fn })

    await usersQuery({ searchParams: { page: 1 } })
    await usersQuery({ searchParams: { page: 2 } })
    expect(fn).toHaveBeenCalledTimes(2)

    // Same params should hit cache
    await usersQuery({ searchParams: { page: 1 } })
    expect(fn).toHaveBeenCalledTimes(2)
  })

  // ─── staleTime: 0 default ───

  it('default staleTime 0 means data goes stale after time passes', async () => {
    vi.useFakeTimers()
    try {
      const fn = vi.fn().mockResolvedValue([])
      const api = createClient()

      const usersQuery = api.query({ key: '/users', fn })
      await usersQuery()

      // Advance time by 1ms so isStale (Date.now() - updatedAt > 0) is true
      vi.advanceTimersByTime(1)

      await usersQuery()
      expect(fn).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  // ─── subscribe with path params ───

  it('subscribe works with parameterized queries', async () => {
    const api = createClient()
    const userQuery = api.query({
      key: '/users/:id',
      fn: () => Promise.resolve({ id: '1', name: 'Alice' }),
    })

    const states: any[] = []
    userQuery.subscribe(
      (state) => states.push({ ...state }),
      { params: { id: '1' } }
    )

    await userQuery({ params: { id: '1' } })

    const lastState = states[states.length - 1]
    expect(lastState.status).toBe('success')
    expect(lastState.data).toEqual({ id: '1', name: 'Alice' })
  })
})
