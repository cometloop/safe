import { describe, it, expect, vi, afterEach } from 'vitest'
import { createSafe } from '@cometloop/safe'
import { createMutation } from '../mutation'
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
    enableOptimisticUpdates: false,
    ...overrides,
  }
}

describe('createMutation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('executes a POST mutation with body', async () => {
    const response = { id: '1', name: 'Alice' }
    const fn = vi.fn().mockResolvedValue(response)

    const deps = createDeps()
    const mutation = createMutation({
      key: '/users',
      fn,
      method: 'POST',
    }, deps)

    const [result, err] = await mutation({ body: { name: 'Alice' } })
    expect(err).toBeNull()
    expect(result).toEqual(response)
    expect(fn).toHaveBeenCalledWith(
      expect.objectContaining({ body: { name: 'Alice' } })
    )
  })

  it('executes a PUT mutation with params and body', async () => {
    const response = { id: '123', name: 'Updated' }
    const fn = vi.fn().mockResolvedValue(response)

    const deps = createDeps()
    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'PUT',
    }, deps)

    const [result, err] = await mutation({
      params: { id: '123' },
      body: { name: 'Updated' },
    })
    expect(err).toBeNull()
    expect(result).toEqual(response)
    expect(fn).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { id: '123' },
        body: { name: 'Updated' },
      })
    )
  })

  it('executes a DELETE mutation with params', async () => {
    const fn = vi.fn().mockResolvedValue(undefined)

    const deps = createDeps()
    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'DELETE',
    }, deps)

    const [_result, err] = await mutation({ params: { id: '123' } })
    expect(err).toBeNull()
    expect(fn).toHaveBeenCalledWith(
      expect.objectContaining({ params: { id: '123' } })
    )
  })

  it('applies parseResponse', async () => {
    const fn = vi.fn().mockResolvedValue({ id: '1', name: 'Alice' })

    const deps = createDeps()
    const mutation = createMutation({
      key: '/users',
      fn,
      method: 'POST',
      parseResponse: (data: any) => ({ ...data, __type: 'user' as const }),
    }, deps)

    const [result, err] = await mutation({ body: { name: 'Alice' } })
    expect(err).toBeNull()
    expect(result).toEqual({ id: '1', name: 'Alice', __type: 'user' })
  })

  it('normalizes entities from mutation response', async () => {
    const fn = vi.fn().mockResolvedValue({
      id: '1',
      name: 'Updated',
      __type: 'user',
    })

    const deps = createDeps()
    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'PUT',
      entities: { user: (u: any) => u.id },
    }, deps)

    await mutation({ params: { id: '1' }, body: { name: 'Updated' } })
    expect(deps.entityStore.get('user', '1')).toEqual({
      id: '1',
      name: 'Updated',
      __type: 'user',
    })
  })

  it('performs optimistic update on PUT', async () => {
    let resolvePromise: (value: any) => void
    const fetchPromise = new Promise((resolve) => {
      resolvePromise = resolve
    })
    const fn = vi.fn().mockReturnValue(fetchPromise)

    const deps = createDeps({ enableOptimisticUpdates: true })

    // Pre-populate entity store
    deps.entityStore.set('user', '1', {
      id: '1',
      name: 'Alice',
      __type: 'user',
    })

    // Register entity-to-query mapping
    deps.entityStore.registerQueryEntities(
      '/users',
      new Set(['user:1'])
    )

    const notifySpy = vi.spyOn(deps.notifier, 'notifyMany')

    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'PUT',
      entities: { user: (u: any) => u.id },
    }, deps)

    const executePromise = mutation({ params: { id: '1' }, body: { name: 'Bob' } })

    // Optimistic update should be applied immediately
    expect(deps.entityStore.get('user', '1')).toEqual(
      expect.objectContaining({ name: 'Bob' })
    )
    expect(notifySpy).toHaveBeenCalled()

    // Resolve the server response
    resolvePromise!({ id: '1', name: 'Bob', __type: 'user' })
    await executePromise
  })

  it('rolls back optimistic update on error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Server error'))

    const deps = createDeps({ enableOptimisticUpdates: true })

    // Pre-populate entity store
    deps.entityStore.set('user', '1', {
      id: '1',
      name: 'Alice',
      __type: 'user',
    })

    deps.entityStore.registerQueryEntities(
      '/users',
      new Set(['user:1'])
    )

    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'PUT',
      entities: { user: (u: any) => u.id },
    }, deps)

    const [, err] = await mutation({ params: { id: '1' }, body: { name: 'Bob' } })

    expect(err).toBe('Server error')
    // Should be rolled back
    expect(deps.entityStore.get('user', '1')).toEqual({
      id: '1',
      name: 'Alice',
      __type: 'user',
    })
  })

  it('performs optimistic delete', async () => {
    let resolvePromise: (value: any) => void
    const fetchPromise = new Promise((resolve) => {
      resolvePromise = resolve
    })
    const fn = vi.fn().mockReturnValue(fetchPromise)

    const deps = createDeps({ enableOptimisticUpdates: true })

    deps.entityStore.set('user', '1', {
      id: '1',
      name: 'Alice',
      __type: 'user',
    })

    deps.entityStore.registerQueryEntities(
      '/users',
      new Set(['user:1'])
    )

    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'DELETE',
      entities: { user: (u: any) => u.id },
    }, deps)

    const executePromise = mutation({ params: { id: '1' } })

    // Entity should be deleted optimistically
    expect(deps.entityStore.get('user', '1')).toBeUndefined()

    resolvePromise!(undefined)
    await executePromise
  })

  it('does not perform optimistic update for POST', async () => {
    const fn = vi.fn().mockResolvedValue({ id: '1', name: 'Alice', __type: 'user' })

    const deps = createDeps({ enableOptimisticUpdates: true })

    const mutation = createMutation({
      key: '/users',
      fn,
      method: 'POST',
      entities: { user: (u: any) => u.id },
    }, deps)

    await mutation({ body: { name: 'Alice' } })

    // Entity should be set from server response, not optimistically
    expect(deps.entityStore.get('user', '1')).toEqual({
      id: '1',
      name: 'Alice',
      __type: 'user',
    })
  })

  it('handles fetch errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Network error'))

    const deps = createDeps()
    const mutation = createMutation({
      key: '/users',
      fn,
      method: 'POST',
    }, deps)

    const [result, err] = await mutation({ body: { name: 'Alice' } })
    expect(result).toBeNull()
    expect(err).toBe('Network error')
  })

  it('uses explicit optimistic config', async () => {
    let resolvePromise: (value: any) => void
    const fetchPromise = new Promise((resolve) => {
      resolvePromise = resolve
    })
    const fn = vi.fn().mockReturnValue(fetchPromise)

    const deps = createDeps({ enableOptimisticUpdates: true })

    deps.entityStore.set('post', 'p1', {
      id: 'p1',
      title: 'Old Title',
      __type: 'post',
    })

    deps.entityStore.registerQueryEntities(
      '/posts',
      new Set(['post:p1'])
    )

    const mutation = createMutation({
      key: '/posts/:postId',
      fn,
      method: 'PUT',
      entities: {
        post: (p: any) => p.id,
        user: (u: any) => u.id,
      },
      optimistic: {
        entityType: 'post',
        entityId: (params: any) => params.postId,
      },
    } as any, deps)

    const executePromise = mutation({
      params: { postId: 'p1' },
      body: { title: 'New Title' },
    } as any)

    // Optimistic update using explicit config
    expect(deps.entityStore.get('post', 'p1')).toEqual(
      expect.objectContaining({ title: 'New Title' })
    )

    resolvePromise!({ id: 'p1', title: 'New Title', __type: 'post' })
    await executePromise
  })

  it('skips optimistic update when entity not in store', async () => {
    let resolvePromise: (value: any) => void
    const fetchPromise = new Promise((resolve) => {
      resolvePromise = resolve
    })
    const fn = vi.fn().mockReturnValue(fetchPromise)

    const deps = createDeps({ enableOptimisticUpdates: true })

    // Don't pre-populate entity store - entity doesn't exist
    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'PUT',
      entities: { user: (u: any) => u.id },
    }, deps)

    const executePromise = mutation({ params: { id: '1' }, body: { name: 'Bob' } })

    // No optimistic update because entity doesn't exist in store
    expect(deps.entityStore.get('user', '1')).toBeUndefined()

    resolvePromise!({ id: '1', name: 'Bob', __type: 'user' })
    await executePromise
  })

  it('skips optimistic when multiple entity keys and no explicit config', async () => {
    const fn = vi.fn().mockResolvedValue({ id: '1', name: 'Bob', __type: 'user' })

    const deps = createDeps({ enableOptimisticUpdates: true })

    deps.entityStore.set('user', '1', {
      id: '1',
      name: 'Alice',
      __type: 'user',
    })

    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'PUT',
      entities: {
        user: (u: any) => u.id,
        post: (p: any) => p.id,
      },
    }, deps)

    // Should not crash; no optimistic update because multiple entity types
    await mutation({ params: { id: '1' }, body: { name: 'Bob' } })
  })

  it('DELETE without path params', async () => {
    const fn = vi.fn().mockResolvedValue(undefined)

    const deps = createDeps()
    const mutation = createMutation({
      key: '/cache',
      fn,
      method: 'DELETE',
    }, deps)

    const [, err] = await mutation({})
    expect(err).toBeNull()
    expect(fn).toHaveBeenCalled()
  })

  it('PATCH mutation with optimistic update', async () => {
    let resolvePromise: (value: any) => void
    const fetchPromise = new Promise((resolve) => {
      resolvePromise = resolve
    })
    const fn = vi.fn().mockReturnValue(fetchPromise)

    const deps = createDeps({ enableOptimisticUpdates: true })

    deps.entityStore.set('user', '1', {
      id: '1',
      name: 'Alice',
      email: 'alice@example.com',
      __type: 'user',
    })

    deps.entityStore.registerQueryEntities(
      '/users',
      new Set(['user:1'])
    )

    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'PATCH',
      entities: { user: (u: any) => u.id },
    }, deps)

    const executePromise = mutation({ params: { id: '1' }, body: { name: 'Bob' } })

    // Optimistic update should merge
    expect(deps.entityStore.get('user', '1')).toEqual(
      expect.objectContaining({ name: 'Bob', email: 'alice@example.com' })
    )

    resolvePromise!({ id: '1', name: 'Bob', email: 'alice@example.com', __type: 'user' })
    await executePromise
  })

  it('passes searchParams to fn context', async () => {
    const response = { id: '1', name: 'Alice' }
    const fn = vi.fn().mockResolvedValue(response)

    const deps = createDeps()
    const mutation = createMutation({
      key: '/users',
      fn,
      method: 'POST',
    }, deps)

    const [result, err] = await mutation({
      body: { name: 'Alice' },
      searchParams: { dryRun: true },
    })
    expect(err).toBeNull()
    expect(result).toEqual(response)
    expect(fn).toHaveBeenCalledWith(
      expect.objectContaining({ searchParams: { dryRun: true } })
    )
  })

  it('passes searchParams with path params to fn context', async () => {
    const response = { id: '123', name: 'Updated' }
    const fn = vi.fn().mockResolvedValue(response)

    const deps = createDeps()
    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'PUT',
    }, deps)

    const [result, err] = await mutation({
      params: { id: '123' },
      body: { name: 'Updated' },
      searchParams: { notify: true },
    })
    expect(err).toBeNull()
    expect(result).toEqual(response)
    expect(fn).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { id: '123' },
        body: { name: 'Updated' },
        searchParams: { notify: true },
      })
    )
  })

  it('rolls back optimistic delete on error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Server error'))

    const deps = createDeps({ enableOptimisticUpdates: true })

    deps.entityStore.set('user', '1', {
      id: '1',
      name: 'Alice',
      __type: 'user',
    })

    deps.entityStore.registerQueryEntities(
      '/users',
      new Set(['user:1'])
    )

    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'DELETE',
      entities: { user: (u: any) => u.id },
    }, deps)

    const [, err] = await mutation({ params: { id: '1' } })
    expect(err).toBe('Server error')

    // Should be rolled back
    expect(deps.entityStore.get('user', '1')).toEqual({
      id: '1',
      name: 'Alice',
      __type: 'user',
    })
  })

  it('composes user signal with retry signal', async () => {
    let capturedSignal: AbortSignal | undefined
    const fn = vi.fn().mockImplementation((ctx: any) => {
      capturedSignal = ctx.signal
      return new Promise(() => {}) // never resolves
    })

    const deps = createDeps()
    const mutation = createMutation({
      key: '/users',
      fn,
      method: 'POST',
    }, deps)

    const userController = new AbortController()
    mutation({ body: { name: 'Alice' }, signal: userController.signal })

    expect(capturedSignal).toBeDefined()
    expect(capturedSignal!.aborted).toBe(false)

    // User signal should abort the composed signal
    userController.abort('user cancelled')
    expect(capturedSignal!.aborted).toBe(true)
  })

  it('handles already-aborted user signal in mutation', async () => {
    let capturedSignal: AbortSignal | undefined
    const fn = vi.fn().mockImplementation((ctx: any) => {
      capturedSignal = ctx.signal
      return new Promise(() => {})
    })

    const deps = createDeps()
    const mutation = createMutation({
      key: '/users',
      fn,
      method: 'POST',
    }, deps)

    const userController = new AbortController()
    userController.abort('pre-aborted')
    mutation({ body: { name: 'Alice' }, signal: userController.signal })

    expect(capturedSignal!.aborted).toBe(true)
  })

  it('concurrent mutations: both succeed without conflict', async () => {
    let resolve1: (v: any) => void
    let resolve2: (v: any) => void
    const promise1 = new Promise((r) => { resolve1 = r })
    const promise2 = new Promise((r) => { resolve2 = r })

    let callCount = 0
    const fn = vi.fn().mockImplementation(() => {
      callCount++
      return callCount === 1 ? promise1 : promise2
    })

    const deps = createDeps({ enableOptimisticUpdates: true })

    deps.entityStore.set('user', '1', {
      id: '1',
      name: 'Alice',
      email: 'alice@test.com',
      __type: 'user',
    })

    deps.entityStore.registerQueryEntities(
      '/users',
      new Set(['user:1'])
    )

    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'PUT',
      entities: { user: (u: any) => u.id },
    }, deps)

    // Launch two concurrent mutations
    const p1 = mutation({ params: { id: '1' }, body: { name: 'Bob' } })
    const p2 = mutation({ params: { id: '1' }, body: { email: 'bob@test.com' } })

    // Both succeed
    resolve1!({ id: '1', name: 'Bob', email: 'alice@test.com', __type: 'user' })
    resolve2!({ id: '1', name: 'Bob', email: 'bob@test.com', __type: 'user' })

    await p1
    await p2

    // Final state should reflect both mutations
    const entity = deps.entityStore.get('user', '1') as any
    expect(entity.name).toBe('Bob')
    expect(entity.email).toBe('bob@test.com')
  })

  it('concurrent mutations: second fails, rolls back to base when all settle', async () => {
    let resolve1: (v: any) => void
    let reject2: (e: any) => void
    const promise1 = new Promise((r) => { resolve1 = r })
    const promise2 = new Promise((_, rej) => { reject2 = rej })

    let callCount = 0
    const fn = vi.fn().mockImplementation(() => {
      callCount++
      return callCount === 1 ? promise1 : promise2
    })

    const deps = createDeps({ enableOptimisticUpdates: true })

    deps.entityStore.set('user', '1', {
      id: '1',
      name: 'Alice',
      __type: 'user',
    })

    deps.entityStore.registerQueryEntities(
      '/users',
      new Set(['user:1'])
    )

    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'PUT',
      entities: { user: (u: any) => u.id },
    }, deps)

    const p1 = mutation({ params: { id: '1' }, body: { name: 'Bob' } })
    const p2 = mutation({ params: { id: '1' }, body: { name: 'Charlie' } })

    // First succeeds
    resolve1!({ id: '1', name: 'Bob', __type: 'user' })
    await p1

    // Second fails
    reject2!(new Error('Server error'))
    await p2

    // Should roll back to base value (Alice) because one mutation errored
    expect(deps.entityStore.get('user', '1')).toEqual({
      id: '1',
      name: 'Alice',
      __type: 'user',
    })
  })
})
