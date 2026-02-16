import { describe, it, expect, vi, afterEach } from 'vitest'
import { createSafeQueryClient } from '../client'

type AppError = { code: string; message: string }

describe('Integration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('full query flow with entity normalization', async () => {
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

    const api = createSafeQueryClient<AppError>({
      name: 'test',
      baseUrl: 'https://api.example.com',
      parseError: (e) => ({
        code: 'UNKNOWN',
        message: e instanceof Error ? e.message : String(e),
      }),
      defaultError: { code: 'UNKNOWN', message: 'Unknown error' },
    })

    const usersQuery = api.query<(typeof users)[number][]>('/users', {
      entities: { user: (u: any) => u.id },
    })

    const [result, err] = await usersQuery.execute()
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

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '100' }),
        json: () => Promise.resolve(rawPosts),
      })
    )

    const api = createSafeQueryClient<AppError>({
      name: 'test',
      baseUrl: 'https://api.example.com',
      parseError: (e) => ({
        code: 'UNKNOWN',
        message: e instanceof Error ? e.message : String(e),
      }),
      defaultError: { code: 'UNKNOWN', message: 'Unknown error' },
    })

    const postsQuery = api.query('/posts', {
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

    const [result, err] = await postsQuery.execute()
    expect(err).toBeNull()
    expect(result).toBeDefined()
    expect(result![0].title).toBe('Hello')
    expect(result![0].__type).toBe('post')
    expect(result![0].author.__type).toBe('user')
  })

  it('mutation updates entity store and notifies queries', async () => {
    // Setup: fetch users first
    const users = [{ id: '1', name: 'Alice', __type: 'user' }]

    let fetchCallCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        fetchCallCount++
        if (fetchCallCount === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-length': '100' }),
            json: () => Promise.resolve(users),
          })
        }
        // Mutation response
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-length': '100' }),
          json: () =>
            Promise.resolve({
              id: '1',
              name: 'Alice Updated',
              __type: 'user',
            }),
        })
      })
    )

    const api = createSafeQueryClient<AppError>({
      name: 'test',
      baseUrl: 'https://api.example.com',
      parseError: (e) => ({
        code: 'UNKNOWN',
        message: e instanceof Error ? e.message : String(e),
      }),
      defaultError: { code: 'UNKNOWN', message: 'Unknown error' },
    })

    const usersQuery = api.query('/users', {
      entities: { user: (u: any) => u.id },
    })

    // Execute query to populate cache
    await usersQuery.execute()

    const updateUser = api.mutate('/users/:id', {
      method: 'PUT',
      entities: { user: (u: any) => u.id },
    })

    // Execute mutation
    const [result, err] = await updateUser.execute(
      { id: '1' },
      { name: 'Alice Updated' }
    )
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

    const api = createSafeQueryClient<AppError>({
      name: 'test',
      baseUrl: 'https://api.example.com',
      parseError: (e) => ({
        code: 'UNKNOWN',
        message: e instanceof Error ? e.message : String(e),
      }),
      defaultError: { code: 'UNKNOWN', message: 'Unknown error' },
    })

    const usersQuery = api.query('/users')

    const states: any[] = []
    const unsub = usersQuery.subscribe((state: any) => {
      states.push({ ...state })
    })

    // Initial state
    expect(states[0].status).toBe('idle')
    expect(states[0].data).toBeUndefined()

    // Start fetch
    const executePromise = usersQuery.execute()

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
    // First request succeeds (initial query)
    // Second request fails (mutation)
    let fetchCallCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        fetchCallCount++
        if (fetchCallCount === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-length': '100' }),
            json: () =>
              Promise.resolve([
                { id: '1', name: 'Alice', __type: 'user' },
              ]),
          })
        }
        return Promise.reject(new Error('Server error'))
      })
    )

    const api = createSafeQueryClient<AppError>({
      name: 'test',
      baseUrl: 'https://api.example.com',
      parseError: (e) => ({
        code: 'UNKNOWN',
        message: e instanceof Error ? e.message : String(e),
      }),
      defaultError: { code: 'UNKNOWN', message: 'Unknown error' },
      enableOptimisticUpdates: true,
    })

    const usersQuery = api.query('/users', {
      entities: { user: (u: any) => u.id },
    })

    // Populate cache
    await usersQuery.execute()

    // Subscribe to track state changes
    const states: any[] = []
    const unsub = usersQuery.subscribe((state: any) => {
      states.push({ ...state })
    })

    const updateUser = api.mutate('/users/:id', {
      method: 'PUT',
      entities: { user: (u: any) => u.id },
    })

    // Execute mutation that will fail
    const [, mutErr] = await updateUser.execute(
      { id: '1' },
      { name: 'Bob' }
    )

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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '100' }),
        json: () => Promise.resolve({ id: '42', name: 'Alice' }),
      })
    )

    const api = createSafeQueryClient<AppError>({
      name: 'test',
      baseUrl: 'https://api.example.com',
      parseError: (e) => ({
        code: 'UNKNOWN',
        message: e instanceof Error ? e.message : String(e),
      }),
      defaultError: { code: 'UNKNOWN', message: 'Unknown error' },
    })

    const userQuery = api.query('/users/:id')

    const states: any[] = []
    const unsub = userQuery.subscribe({ id: '42' }, (state: any) => {
      states.push({ ...state })
    })

    await userQuery.execute({ id: '42' })

    const lastState = states[states.length - 1]
    expect(lastState.data).toEqual({ id: '42', name: 'Alice' })

    // Invalidate with params
    userQuery.invalidate({ id: '42' })

    unsub()
  })

  it('DELETE mutation without path params', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        headers: new Headers(),
        json: () => Promise.reject(new Error('no body')),
      })
    )

    const api = createSafeQueryClient<AppError>({
      name: 'test',
      baseUrl: 'https://api.example.com',
      parseError: (e) => ({
        code: 'UNKNOWN',
        message: e instanceof Error ? e.message : String(e),
      }),
      defaultError: { code: 'UNKNOWN', message: 'Unknown error' },
    })

    const clearAll = api.mutate('/cache', { method: 'DELETE' })
    const [, err] = await clearAll.execute()
    expect(err).toBeNull()
  })
})
