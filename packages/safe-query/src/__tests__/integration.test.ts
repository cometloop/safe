import { describe, it, expect, vi, afterEach } from 'vitest'
import { createSafe } from '@cometloop/safe'
import { safeQuery } from '../client'

type AppError = { code: string; message: string }

function createApi(overrides: Record<string, any> = {}) {
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

describe('Integration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('full query flow with entity normalization', async () => {
    const users = [
      { id: '1', name: 'Alice', __type: 'user' },
      { id: '2', name: 'Bob', __type: 'user' },
    ]

    const api = createApi()

    const usersQuery = api.query({
      key: '/users',
      fn: () => Promise.resolve(users),
      entities: { user: (u: any) => u.id },
    })

    const [result, err] = await usersQuery()
    expect(err).toBeNull()
    expect(result).toEqual(users)
  })

  it('query with parseResponse and entity normalization', async () => {
    const rawPosts = [
      {
        id: 'p1',
        title: 'Hello',
        author: { userId: 'u1', name: 'Alice' },
      },
    ]

    const api = createApi()

    const postsQuery = api.query({
      key: '/posts',
      fn: () => Promise.resolve(rawPosts),
      parseResponse: (data: any[]) =>
        data.map((post) => ({
          ...post,
          __type: 'post' as const,
          author: {
            ...post.author,
            __type: 'user' as const,
          },
        })),
      entities: {
        post: (p: any) => p.id,
        user: (u: any) => u.userId,
      },
    })

    const [result, err] = await postsQuery()
    expect(err).toBeNull()
    expect(result).toBeDefined()
    expect(result![0].title).toBe('Hello')
    expect(result![0].__type).toBe('post')
    expect(result![0].author.__type).toBe('user')
  })

  it('mutation updates entity store and notifies queries', async () => {
    const users = [{ id: '1', name: 'Alice', __type: 'user' }]

    const api = createApi()

    const usersQuery = api.query({
      key: '/users',
      fn: () => Promise.resolve(users),
      entities: { user: (u: any) => u.id },
    })

    // Execute query to populate cache
    await usersQuery()

    const updateUser = api.mutate({
      key: '/users/:id',
      fn: () => Promise.resolve({
        id: '1',
        name: 'Alice Updated',
        __type: 'user',
      }),
      method: 'PUT',
      entities: { user: (u: any) => u.id },
    })

    // Execute mutation
    const [result, err] = await updateUser({
      params: { id: '1' },
      body: { name: 'Alice Updated' },
    })
    expect(err).toBeNull()
    expect(result).toEqual({
      id: '1',
      name: 'Alice Updated',
      __type: 'user',
    })
  })

  it('subscriber receives state updates during query lifecycle', async () => {
    let resolvePromise: (value: any) => void
    const fetchPromise = new Promise((resolve) => {
      resolvePromise = resolve
    })

    const api = createApi()

    const usersQuery = api.query({
      key: '/users',
      fn: () => fetchPromise as Promise<any>,
    })

    const states: any[] = []
    const unsub = usersQuery.subscribe((state: any) => {
      states.push({ ...state })
    })

    // Initial state
    expect(states[0].status).toBe('idle')
    expect(states[0].data).toBeUndefined()

    // Start fetch
    const executePromise = usersQuery()

    // Resolve fetch
    resolvePromise!([{ id: '1', name: 'Alice' }])
    await executePromise

    // Should have success state
    const lastState = states[states.length - 1]
    expect(lastState.status).toBe('success')
    expect(lastState.data).toEqual([{ id: '1', name: 'Alice' }])
    expect(lastState.isFetching).toBe(false)

    unsub()
  })

  it('optimistic update flow with rollback', async () => {
    const users = [{ id: '1', name: 'Alice', __type: 'user' }]

    const api = createApi({ enableOptimisticUpdates: true })

    const usersQuery = api.query({
      key: '/users',
      fn: () => Promise.resolve(users),
      entities: { user: (u: any) => u.id },
    })

    // Populate cache
    await usersQuery()

    // Subscribe to track state changes
    const states: any[] = []
    const unsub = usersQuery.subscribe((state: any) => {
      states.push({ ...state })
    })

    const updateUser = api.mutate({
      key: '/users/:id',
      fn: () => Promise.reject(new Error('Server error')),
      method: 'PUT',
      entities: { user: (u: any) => u.id },
    })

    // Execute mutation that will fail
    const [, mutErr] = await updateUser({
      params: { id: '1' },
      body: { name: 'Bob' },
    })

    expect(mutErr).toBeDefined()

    // After rollback, the original data should be restored
    const lastState = states[states.length - 1]
    expect(lastState.data).toBeDefined()
    // Data should contain original Alice, not Bob
    if (Array.isArray(lastState.data)) {
      expect(lastState.data[0].name).toBe('Alice')
    }

    unsub()
  })

  it('query with path params subscribe and execute', async () => {
    const api = createApi()

    const userQuery = api.query({
      key: '/users/:id',
      fn: () => Promise.resolve({ id: '42', name: 'Alice' }),
    })

    const states: any[] = []
    const unsub = userQuery.subscribe((state: any) => {
      states.push({ ...state })
    }, { params: { id: '42' } })

    await userQuery({ params: { id: '42' } })

    const lastState = states[states.length - 1]
    expect(lastState.data).toEqual({ id: '42', name: 'Alice' })

    // Invalidate with params
    userQuery.invalidate({ params: { id: '42' } })

    unsub()
  })

  it('query with search params', async () => {
    const fn = vi.fn().mockResolvedValue([{ id: '1', name: 'Alice' }])

    const api = createApi()

    const usersQuery = api.query({
      key: '/users',
      fn,
    })

    const [result, err] = await usersQuery({
      searchParams: { search: 'alice', page: 1 },
    })

    expect(err).toBeNull()
    expect(result).toEqual([{ id: '1', name: 'Alice' }])
    expect(fn).toHaveBeenCalledWith(
      expect.objectContaining({ searchParams: { search: 'alice', page: 1 } })
    )
  })

  it('different search params produce different cache entries', async () => {
    let callCount = 0
    const fn = vi.fn().mockImplementation(() => {
      callCount++
      return Promise.resolve([{ page: callCount }])
    })

    const api = createApi({ staleTime: 60000 })

    const usersQuery = api.query({
      key: '/users',
      fn,
      staleTime: 60000,
    })

    const [r1] = await usersQuery({ searchParams: { page: 1 } })
    const [r2] = await usersQuery({ searchParams: { page: 2 } })

    expect(r1).toEqual([{ page: 1 }])
    expect(r2).toEqual([{ page: 2 }])
    expect(callCount).toBe(2)
  })

  it('mutation with search params passes to fn', async () => {
    const fn = vi.fn().mockResolvedValue({ id: '1', name: 'Alice' })

    const api = createApi()

    const createUser = api.mutate({
      key: '/users',
      fn,
      method: 'POST',
    })

    const [result, err] = await createUser({
      body: { name: 'Alice' },
      searchParams: { dryRun: true },
    })

    expect(err).toBeNull()
    expect(result).toEqual({ id: '1', name: 'Alice' })
    expect(fn).toHaveBeenCalledWith(
      expect.objectContaining({ searchParams: { dryRun: true } })
    )
  })

  it('mapToEntities populates entity store and mutation updates flow back to query', async () => {
    type ApiUser = { type: string; id: string; name: string }
    type NormalizedUser = ApiUser & { __type: 'user' }

    const api = createApi()

    const usersQuery = api.query({
      key: '/users',
      fn: (): Promise<ApiUser[]> =>
        Promise.resolve([{ type: 'user', id: '1', name: 'Alice' }]),
      mapToEntities: (users): NormalizedUser[] =>
        users.map(u => ({ ...u, __type: 'user' as const })),
      entities: { user: (u: NormalizedUser) => u.id },
    })

    // Populate cache and entity store via query
    const [queryResult, queryErr] = await usersQuery()
    expect(queryErr).toBeNull()
    const first = queryResult![0]!
    expect(first.__type).toBe('user')
    expect(first.name).toBe('Alice')

    // Mutate the entity
    const updateUser = api.mutate({
      key: '/users/:id',
      fn: () =>
        Promise.resolve({ type: 'user', id: '1', name: 'Alice Updated', __type: 'user' }),
      method: 'PUT',
      entities: { user: (u: any) => u.id },
    })

    await updateUser({ params: { id: '1' }, body: { name: 'Alice Updated' } })

    // Subscribe to the query and verify updated data flows back through entity store
    const states: any[] = []
    const unsub = usersQuery.subscribe((state) => {
      states.push({ ...state })
    })

    const lastState = states[states.length - 1]
    expect(lastState.status).toBe('success')
    expect(lastState.data[0].name).toBe('Alice Updated')

    unsub()
  })

  it('DELETE mutation without path params', async () => {
    const api = createApi()

    const clearAll = api.mutate({
      key: '/cache',
      fn: () => Promise.resolve(undefined as void),
      method: 'DELETE',
    })

    const [, err] = await clearAll({})
    expect(err).toBeNull()
  })

  it('list-to-detail with initialData — use getEntity in detail query for instant return', async () => {
    const users = [
      { id: '1', name: 'Alice', __type: 'user' as const },
      { id: '2', name: 'Bob', __type: 'user' as const },
    ]

    const api = createApi()

    const usersQuery = api.query({
      key: '/users',
      fn: () => Promise.resolve(users),
      entities: { user: (u: any) => u.id },
    })

    // Populate the list query cache + entity store
    await usersQuery()

    const detailFn = vi.fn().mockResolvedValue({ id: '1', name: 'Alice', __type: 'user' })
    const userQuery = api.query({
      key: '/users/:id',
      fn: detailFn,
      staleTime: 60000,
      initialData: (ctx: any) => ctx.getEntity('user', ctx.params.id),
      initialDataUpdatedAt: Date.now(),
    })

    // Detail query should return entity from store without fetching
    const [result, err] = await userQuery({ params: { id: '1' } })
    expect(err).toBeNull()
    expect(result).toEqual(expect.objectContaining({ id: '1', name: 'Alice' }))
    expect(detailFn).not.toHaveBeenCalled()
  })

  it('list-to-detail with placeholderData — entity shown as placeholder while fetching', async () => {
    const users = [
      { id: '1', name: 'Alice', __type: 'user' as const },
    ]

    const api = createApi()

    const usersQuery = api.query({
      key: '/users',
      fn: () => Promise.resolve(users),
      entities: { user: (u: any) => u.id },
    })

    // Populate entity store
    await usersQuery()

    let resolveDetail: (value: any) => void
    const detailPromise = new Promise((resolve) => { resolveDetail = resolve })

    const userQuery = api.query({
      key: '/users/:id',
      fn: () => detailPromise as Promise<any>,
      placeholderData: (ctx: any) => ctx.getEntity('user', ctx.params.id),
    })

    const states: any[] = []
    const unsub = userQuery.subscribe((state: any) => {
      states.push({ ...state })
    }, { params: { id: '1' } })

    // Start fetch
    userQuery({ params: { id: '1' } })

    // Should have a placeholder state with entity data
    const placeholderState = states.find((s: any) => s.isPlaceholderData)
    expect(placeholderState).toBeDefined()
    expect(placeholderState.data).toEqual(expect.objectContaining({ id: '1', name: 'Alice' }))
    expect(placeholderState.isFetching).toBe(true)
    expect(placeholderState.status).toBe('success')

    resolveDetail!({ id: '1', name: 'Alice (full)', __type: 'user' })

    // Wait for settle
    await new Promise(resolve => setTimeout(resolve, 10))

    const lastState = states[states.length - 1]
    expect(lastState.isPlaceholderData).toBe(false)
    expect(lastState.data).toEqual(expect.objectContaining({ id: '1', name: 'Alice (full)' }))

    unsub()
  })
})
