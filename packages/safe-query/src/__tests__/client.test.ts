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
})
