import { describe, it, expect, vi, afterEach } from 'vitest'
import { createSafe } from '@cometloop/safe'
import { safeQuery } from '../client'

/**
 * These tests verify that the type system correctly infers and enforces
 * path params, response types, body types, and method-conditional signatures.
 * They are compile-time checks as much as runtime checks.
 */

type AppError = { code: string; message: string }
type User = { id: string; name: string; email: string }
type CreateUserInput = { name: string; email: string }
type UpdateUserInput = { name?: string; email?: string }

const safe = createSafe<AppError>({
  parseError: (e) => ({
    code: 'UNKNOWN',
    message: e instanceof Error ? e.message : String(e),
  }),
  defaultError: { code: 'UNKNOWN', message: 'Unknown error' },
})

const api = safeQuery<AppError>({ safe })

describe('Type inference', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('query response is typed as TData', async () => {
    const usersQuery = api.query({
      key: '/users' as const,
      fn: (): Promise<User[]> => Promise.resolve([{ id: '1', name: 'Alice', email: 'alice@test.com' }]),
    })
    const [users, err] = await usersQuery()

    if (!err) {
      // users is typed as User[]
      const first: User = users[0]
      expect(first.name).toBe('Alice')
      expect(first.email).toBe('alice@test.com')
    }
  })

  it('query with path params requires params object', async () => {
    const userQuery = api.query({
      key: '/users/:id',
      fn: (): Promise<User> => Promise.resolve({ id: '123', name: 'Alice', email: 'alice@test.com' }),
    })
    // execute requires { params: { id: string } }
    const [user, err] = await userQuery({ params: { id: '123' } })

    if (!err) {
      expect(user.name).toBe('Alice')
    }
  })

  it('query with multiple path params requires all params', async () => {
    const commentQuery = api.query({
      key: '/users/:userId/posts/:postId/comments/:commentId',
      fn: () => Promise.resolve({ id: 'c1', body: 'Great post!' }),
    })
    // execute requires { params: { userId, postId, commentId } }
    const [result, err] = await commentQuery({
      params: {
        userId: 'u1',
        postId: 'p1',
        commentId: 'c1',
      },
    })

    expect(err).toBeNull()
    expect(result).toBeDefined()
  })

  it('mutation with typed body enforces body shape', async () => {
    // TData = User, TBody = CreateUserInput
    const createUser = api.mutate<User, CreateUserInput>({
      key: '/users',
      fn: ({ body }) => Promise.resolve({ id: '1', ...body, } as User),
      method: 'POST',
    })

    // body is typed as CreateUserInput
    const [user, err] = await createUser({
      body: {
        name: 'Alice',
        email: 'alice@test.com',
      },
    })

    if (!err) {
      expect(user.name).toBe('Alice')
    }
  })

  it('PUT mutation with path params and typed body', async () => {
    // TData = User, TBody = UpdateUserInput, TPath inferred
    const updateUser = api.mutate<User, UpdateUserInput, '/users/:id'>({
      key: '/users/:id',
      fn: () => Promise.resolve({ id: '123', name: 'Updated', email: 'updated@test.com' }),
      method: 'PUT',
    })

    // execute({ params: { id: string }, body: UpdateUserInput })
    const [user, err] = await updateUser({
      params: { id: '123' },
      body: { name: 'Updated' },
    })

    if (!err) {
      expect(user.name).toBe('Updated')
    }
  })

  it('DELETE mutation can take a body for bulk deletes', async () => {
    type BulkDeleteInput = { ids: string[] }
    const deleteUsers = api.mutate<void, BulkDeleteInput>({
      key: '/users',
      fn: () => Promise.resolve(undefined as void),
      method: 'DELETE',
    })
    // body is typed as BulkDeleteInput
    const [, err] = await deleteUsers({ body: { ids: ['1', '2', '3'] } })
    expect(err).toBeNull()
  })

  it('error type flows from client config', async () => {
    const usersQuery = api.query({
      key: '/users',
      fn: (): Promise<User[]> => Promise.reject(new Error('Network error')),
    })
    const [, err] = await usersQuery()

    if (err) {
      // err is typed as AppError
      const code: string = err.code
      const message: string = err.message
      expect(code).toBe('UNKNOWN')
      expect(message).toBe('Network error')
    }
  })

  it('query execute accepts searchParams in options', async () => {
    const usersQuery = api.query({
      key: '/users',
      fn: (): Promise<User[]> => Promise.resolve([{ id: '1', name: 'Alice', email: 'alice@test.com' }]),
    })
    const [users, err] = await usersQuery({
      searchParams: { search: 'alice', page: 1 },
    })

    if (!err) {
      expect(users.length).toBe(1)
    }
  })

  it('query with path params accepts searchParams in options', async () => {
    const postsQuery = api.query({
      key: '/users/:id/posts',
      fn: () => Promise.resolve([{ id: 'p1', title: 'Hello' }]),
    })
    const [posts, err] = await postsQuery({
      params: { id: 'u1' },
      searchParams: { page: 1, limit: 10 },
    })

    expect(err).toBeNull()
    expect(posts).toBeDefined()
  })

  it('mutation accepts searchParams in options', async () => {
    const createUser = api.mutate<User, CreateUserInput>({
      key: '/users',
      fn: ({ body }) => Promise.resolve({ id: '1', ...body } as User),
      method: 'POST',
    })

    const [user, err] = await createUser({
      body: { name: 'Alice', email: 'alice@test.com' },
      searchParams: { dryRun: true },
    })

    if (!err) {
      expect(user.name).toBe('Alice')
    }
  })

  it('subscribe state is typed with TData and TError', async () => {
    const usersQuery = api.query({
      key: '/users',
      fn: (): Promise<User[]> => Promise.resolve([{ id: '1', name: 'Alice', email: 'alice@test.com' }]),
    })

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

    await usersQuery()
    unsub()
  })
})
