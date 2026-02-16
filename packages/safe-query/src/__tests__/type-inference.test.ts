import { describe, it, expect, vi, afterEach } from 'vitest'
import { createSafeQueryClient } from '../client'

/**
 * These tests verify that the type system correctly infers and enforces
 * path params, response types, body types, and method-conditional signatures.
 * They are compile-time checks as much as runtime checks.
 */

type AppError = { code: string; message: string }
type User = { id: string; name: string; email: string }
type CreateUserInput = { name: string; email: string }
type UpdateUserInput = { name?: string; email?: string }

function mockFetch(data: any) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': '100' }),
      json: () => Promise.resolve(data),
    })
  )
}

const api = createSafeQueryClient<AppError>({
  name: 'test',
  baseUrl: 'https://api.example.com',
  parseError: (e) => ({
    code: 'UNKNOWN',
    message: e instanceof Error ? e.message : String(e),
  }),
  defaultError: { code: 'UNKNOWN', message: 'Unknown error' },
})

describe('Type inference', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('query response is typed as TData', async () => {
    mockFetch([{ id: '1', name: 'Alice', email: 'alice@test.com' }])

    const usersQuery = api.query<User[]>('/users')
    const [users, err] = await usersQuery.execute()

    if (!err) {
      // users is typed as User[]
      const first: User = users[0]
      expect(first.name).toBe('Alice')
      expect(first.email).toBe('alice@test.com')
    }
  })

  it('query with path params requires params object', async () => {
    mockFetch({ id: '123', name: 'Alice', email: 'alice@test.com' })

    const userQuery = api.query<User>('/users/:id')
    // execute requires { id: string }
    const [user, err] = await userQuery.execute({ id: '123' })

    if (!err) {
      expect(user.name).toBe('Alice')
    }
  })

  it('query with multiple path params requires all params', async () => {
    mockFetch({ id: 'c1', body: 'Great post!' })

    const commentQuery = api.query('/users/:userId/posts/:postId/comments/:commentId')
    // execute requires { userId, postId, commentId }
    const [result, err] = await commentQuery.execute({
      userId: 'u1',
      postId: 'p1',
      commentId: 'c1',
    })

    expect(err).toBeNull()
    expect(result).toBeDefined()
  })

  it('mutation with typed body enforces body shape', async () => {
    mockFetch({ id: '1', name: 'Alice', email: 'alice@test.com' })

    // TData = User, TBody = CreateUserInput
    const createUser = api.mutate<User, CreateUserInput>('/users', {
      method: 'POST',
    })

    // body is typed as CreateUserInput
    const [user, err] = await createUser.execute({
      name: 'Alice',
      email: 'alice@test.com',
    })

    if (!err) {
      expect(user.name).toBe('Alice')
    }
  })

  it('PUT mutation with path params and typed body', async () => {
    mockFetch({ id: '123', name: 'Updated', email: 'updated@test.com' })

    // TData = User, TBody = UpdateUserInput
    const updateUser = api.mutate<User, UpdateUserInput>('/users/:id', {
      method: 'PUT',
    })

    // execute(params: { id: string }, body: UpdateUserInput)
    const [user, err] = await updateUser.execute(
      { id: '123' },
      { name: 'Updated' }
    )

    if (!err) {
      expect(user.name).toBe('Updated')
    }
  })

  it('DELETE mutation can take a body for bulk deletes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        headers: new Headers(),
        json: () => Promise.reject(new Error('no body')),
      })
    )

    type BulkDeleteInput = { ids: string[] }
    const deleteUsers = api.mutate<void, BulkDeleteInput>('/users', {
      method: 'DELETE',
    })
    // body is typed as BulkDeleteInput
    const [, err] = await deleteUsers.execute({ ids: ['1', '2', '3'] })
    expect(err).toBeNull()
  })

  it('error type flows from client config', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network error'))
    )

    const usersQuery = api.query<User[]>('/users')
    const [, err] = await usersQuery.execute()

    if (err) {
      // err is typed as AppError
      const code: string = err.code
      const message: string = err.message
      expect(code).toBe('UNKNOWN')
      expect(message).toBe('Network error')
    }
  })

  it('subscribe state is typed with TData and TError', async () => {
    mockFetch([{ id: '1', name: 'Alice', email: 'alice@test.com' }])

    const usersQuery = api.query<User[]>('/users')

    const unsub = usersQuery.subscribe((state) => {
      // state.data is User[] | undefined
      // state.error is AppError | null
      if (state.data) {
        const first: User = state.data[0]
        expect(first.name).toBeDefined()
      }
      if (state.error) {
        const code: string = state.error.code
        expect(code).toBeDefined()
      }
    })

    await usersQuery.execute()
    unsub()
  })
})
