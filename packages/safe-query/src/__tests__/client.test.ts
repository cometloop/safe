import { describe, it, expect, vi, afterEach } from 'vitest'
import { createSafeQueryClient } from '../client'

type AppError = { code: string; message: string }

function createClient(overrides: Record<string, any> = {}) {
  return createSafeQueryClient<AppError>({
    name: 'test',
    baseUrl: 'https://api.example.com',
    parseError: (e) => ({
      code: 'UNKNOWN',
      message: e instanceof Error ? e.message : String(e),
    }),
    defaultError: { code: 'UNKNOWN', message: 'Unknown error' },
    ...overrides,
  })
}

function mockFetchResponse(data: any, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: new Headers({
        'content-length': data === undefined ? '0' : '100',
      }),
      json: () => Promise.resolve(data),
    })
  )
}

describe('createSafeQueryClient', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a client with query and mutate methods', () => {
    const api = createClient()
    expect(api.query).toBeTypeOf('function')
    expect(api.mutate).toBeTypeOf('function')
  })

  it('creates a query that executes', async () => {
    mockFetchResponse([{ id: '1', name: 'Alice' }])

    const api = createClient()
    const usersQuery = api.query('/users')

    const [result, err] = await usersQuery.execute()
    expect(err).toBeNull()
    expect(result).toEqual([{ id: '1', name: 'Alice' }])
  })

  it('creates a query with path params', async () => {
    mockFetchResponse({ id: '123', name: 'Alice' })

    const api = createClient()
    const userQuery = api.query('/users/:id')

    const [result, err] = await userQuery.execute({ id: '123' })
    expect(err).toBeNull()
    expect(result).toEqual({ id: '123', name: 'Alice' })
  })

  it('creates a mutation that executes', async () => {
    mockFetchResponse({ id: '1', name: 'Alice' }, 201)

    const api = createClient()
    const createUser = api.mutate('/users', { method: 'POST' })

    const [result, err] = await createUser.execute({ name: 'Alice' })
    expect(err).toBeNull()
    expect(result).toEqual({ id: '1', name: 'Alice' })
  })

  it('passes headers from client config', async () => {
    mockFetchResponse([])

    const api = createClient({
      headers: () => ({ Authorization: 'Bearer test-token' }),
    })
    const usersQuery = api.query('/users')

    await usersQuery.execute()
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/users',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    )
  })

  it('uses custom staleTime and gcTime', async () => {
    mockFetchResponse([{ id: '1' }])

    const api = createClient({ staleTime: 30000, gcTime: 120000 })
    const usersQuery = api.query('/users')

    await usersQuery.execute()
    const [result] = await usersQuery.execute() // should use cache
    expect(result).toEqual([{ id: '1' }])
    expect(fetch).toHaveBeenCalledTimes(1) // only one fetch
  })

  it('handles error responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ message: 'Server failed' }),
      })
    )

    const api = createClient()
    const usersQuery = api.query('/users')

    const [result, err] = await usersQuery.execute()
    expect(result).toBeNull()
    expect(err).toBeDefined()
    expect(err!.code).toBe('UNKNOWN')
  })

  it('query has invalidate and refetch methods', async () => {
    mockFetchResponse([{ id: '1' }])

    const api = createClient()
    const usersQuery = api.query('/users')

    expect(usersQuery.invalidate).toBeTypeOf('function')
    expect(usersQuery.refetch).toBeTypeOf('function')
  })

  it('query has subscribe method', async () => {
    mockFetchResponse([{ id: '1' }])

    const api = createClient()
    const usersQuery = api.query('/users')

    expect(usersQuery.subscribe).toBeTypeOf('function')
  })
})
