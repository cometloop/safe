import { describe, it, expect, vi, afterEach } from 'vitest'
import { createSafe } from '@cometloop/safe'
import { safeQuery } from '../client'

type AppError = string

function createClient(overrides: Record<string, any> = {}) {
  const safe = createSafe<AppError>({
    parseError: (e) => (e instanceof Error ? e.message : String(e)),
    defaultError: 'Unknown error',
  })

  return safeQuery<AppError>({
    safe,
    ...overrides,
  })
}

describe('SSR / hydration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('dehydrate returns empty state for empty cache', () => {
    const api = createClient()
    const state = api.dehydrate()
    expect(state.queries).toEqual([])
    api.destroy()
  })

  it('dehydrate serializes cached queries', async () => {
    const api = createClient({ staleTime: 60000 })
    const getUsers = api.query({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1', name: 'Alice' }]),
    })

    await getUsers()

    const state = api.dehydrate()
    expect(state.queries).toHaveLength(1)
    expect(state.queries[0]!.key).toBe('/users')
    expect(state.queries[0]!.data).toEqual([{ id: '1', name: 'Alice' }])
    expect(state.queries[0]!.dataUpdatedAt).toBeTypeOf('number')

    api.destroy()
  })

  it('dehydrate serializes multiple queries', async () => {
    const api = createClient({ staleTime: 60000 })
    const getUsers = api.query({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1', name: 'Alice' }]),
    })
    const getPosts = api.query({
      key: '/posts',
      fn: () => Promise.resolve([{ id: 'p1', title: 'Hello' }]),
    })

    await getUsers()
    await getPosts()

    const state = api.dehydrate()
    expect(state.queries).toHaveLength(2)
    const keys = state.queries.map(q => q.key).sort()
    expect(keys).toEqual(['/posts', '/users'])

    api.destroy()
  })

  it('dehydrate includes parameterized queries', async () => {
    const api = createClient({ staleTime: 60000 })
    const getUser = api.query({
      key: '/users/:id',
      fn: () => Promise.resolve({ id: '1', name: 'Alice' }),
    })

    await getUser({ params: { id: '1' } })
    await getUser({ params: { id: '2' } })

    const state = api.dehydrate()
    expect(state.queries).toHaveLength(2)

    api.destroy()
  })

  it('hydrate restores data into new client', async () => {
    // Server: fetch and dehydrate
    const server = createClient({ staleTime: 60000 })
    const serverQuery = server.query({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1', name: 'Alice' }]),
    })
    await serverQuery()
    const dehydratedState = server.dehydrate()
    server.destroy()

    // Client: hydrate and verify
    const client = createClient({ staleTime: 60000 })
    client.hydrate(dehydratedState)

    const data = client.getQueryData<Array<{ id: string; name: string }>>('/users')
    expect(data).toEqual([{ id: '1', name: 'Alice' }])

    client.destroy()
  })

  it('hydrated data is available to queries without refetch', async () => {
    const fn = vi.fn().mockResolvedValue([{ id: '1', name: 'Server' }])

    // Dehydrate from server
    const server = createClient({ staleTime: 60000 })
    server.setQueryData('/users', [{ id: '1', name: 'Alice' }])
    const dehydratedState = server.dehydrate()
    server.destroy()

    // Client hydrate
    const client = createClient({ staleTime: 60000 })
    client.hydrate(dehydratedState)

    const getUsers = client.query({ key: '/users', fn })

    const [result, err] = await getUsers()
    expect(err).toBeNull()
    expect(result).toEqual([{ id: '1', name: 'Alice' }])
    expect(fn).not.toHaveBeenCalled() // no fetch needed, data is fresh

    client.destroy()
  })

  it('hydrate notifies subscribers', async () => {
    const client = createClient({ staleTime: 60000 })
    const getUsers = client.query({
      key: '/users',
      fn: () => Promise.resolve([]),
    })

    const states: any[] = []
    const unsub = getUsers.subscribe((state) => { states.push({ ...state }) })
    states.length = 0

    client.hydrate({
      queries: [{
        key: '/users',
        data: [{ id: '1', name: 'Alice' }],
        dataUpdatedAt: Date.now(),
      }],
    })

    expect(states.length).toBeGreaterThan(0)
    const lastState = states[states.length - 1]
    expect(lastState.data).toEqual([{ id: '1', name: 'Alice' }])
    expect(lastState.status).toBe('success')

    unsub()
    client.destroy()
  })

  it('hydrate does not overwrite newer data', async () => {
    const client = createClient({ staleTime: 60000 })
    const getUsers = client.query({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1', name: 'Fresh' }]),
    })

    await getUsers()

    const freshData = client.getQueryData('/users')
    expect(freshData).toEqual([{ id: '1', name: 'Fresh' }])

    // Try to hydrate with older data
    client.hydrate({
      queries: [{
        key: '/users',
        data: [{ id: '1', name: 'Old' }],
        dataUpdatedAt: Date.now() - 120000, // 2 minutes ago
      }],
    })

    // Should still have fresh data
    expect(client.getQueryData('/users')).toEqual([{ id: '1', name: 'Fresh' }])

    client.destroy()
  })

  it('hydrate with entities normalizes data', async () => {
    const safe = createSafe<AppError>({
      parseError: (e) => (e instanceof Error ? e.message : String(e)),
      defaultError: 'Unknown error',
    })
    const server = safeQuery<AppError>({
      safe,
      entities: {
        user: { match: (obj: any) => 'name' in obj, id: (u: any) => u.id },
      },
      staleTime: 60000,
    })

    server.setQueryData('/users', [{ id: '1', name: 'Alice' }])
    const dehydratedState = server.dehydrate()
    server.destroy()

    const client = safeQuery<AppError>({
      safe: createSafe<AppError>({
        parseError: (e) => (e instanceof Error ? e.message : String(e)),
        defaultError: 'Unknown error',
      }),
      entities: {
        user: { match: (obj: any) => 'name' in obj, id: (u: any) => u.id },
      },
      staleTime: 60000,
    })

    client.hydrate(dehydratedState)

    const data = client.getQueryData<Array<{ id: string; name: string }>>('/users')
    expect(data).toEqual([{ id: '1', name: 'Alice' }])

    client.destroy()
  })

  it('dehydrate/hydrate round-trip preserves dataUpdatedAt', async () => {
    const api = createClient({ staleTime: 60000 })
    api.setQueryData('/users', [{ id: '1' }])

    const dehydrated = api.dehydrate()
    const originalTimestamp = dehydrated.queries[0]!.dataUpdatedAt

    const client2 = createClient({ staleTime: 60000 })
    client2.hydrate(dehydrated)

    const reDehydrated = client2.dehydrate()
    expect(reDehydrated.queries[0]!.dataUpdatedAt).toBe(originalTimestamp)

    api.destroy()
    client2.destroy()
  })

  it('dehydrate skips entries with no data', async () => {
    const api = createClient()
    const getUsers = api.query({
      key: '/users',
      fn: () => new Promise(() => {}), // never resolves
    })

    getUsers() // starts fetch but no data yet

    const state = api.dehydrate()
    expect(state.queries).toHaveLength(0)

    api.destroy()
  })

  it('dehydrate throws after destroy', () => {
    const api = createClient()
    api.destroy()
    expect(() => api.dehydrate()).toThrow('SafeQueryClient has been destroyed')
  })

  it('hydrate throws after destroy', () => {
    const api = createClient()
    api.destroy()
    expect(() => api.hydrate({ queries: [] })).toThrow('SafeQueryClient has been destroyed')
  })

  it('JSON serialization round-trip works', async () => {
    const api = createClient({ staleTime: 60000 })
    api.setQueryData('/users', [{ id: '1', name: 'Alice' }])

    const dehydrated = api.dehydrate()
    const json = JSON.stringify(dehydrated)
    const parsed = JSON.parse(json)

    const client2 = createClient({ staleTime: 60000 })
    client2.hydrate(parsed)

    expect(client2.getQueryData('/users')).toEqual([{ id: '1', name: 'Alice' }])

    api.destroy()
    client2.destroy()
  })

  it('hydrate skips older data when existing data is newer', async () => {
    const api = createClient({ staleTime: 60000 })

    // Set data with a recent timestamp
    api.setQueryData('/users', [{ id: '1', name: 'Fresh' }])

    // Hydrate with older data
    api.hydrate({
      queries: [{
        key: '/users',
        data: [{ id: '1', name: 'Stale' }],
        dataUpdatedAt: Date.now() - 120000, // 2 minutes ago
      }],
    })

    // Should still have the fresh data
    expect(api.getQueryData('/users')).toEqual([{ id: '1', name: 'Fresh' }])

    api.destroy()
  })

  it('hydrate with null dataUpdatedAt does not set dataUpdatedAt', async () => {
    const api = createClient({ staleTime: 60000 })

    api.hydrate({
      queries: [{
        key: '/users',
        data: [{ id: '1', name: 'Alice' }],
        dataUpdatedAt: null,
      }],
    })

    // Data should still be available
    expect(api.getQueryData('/users')).toEqual([{ id: '1', name: 'Alice' }])

    api.destroy()
  })
})
