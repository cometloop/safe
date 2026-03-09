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
    })

    const deps = createDeps({
      entities: {
        user: { match: (obj: any) => 'name' in obj, id: (u: any) => u.id },
      },
    })
    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'PUT',
    }, deps)

    await mutation({ params: { id: '1' }, body: { name: 'Updated' } })
    expect(deps.entityStore.get('user', '1')).toEqual({
      id: '1',
      name: 'Updated',
    })
  })

  it('performs optimistic update on PUT', async () => {
    let resolvePromise: (value: any) => void
    const fetchPromise = new Promise((resolve) => {
      resolvePromise = resolve
    })
    const fn = vi.fn().mockReturnValue(fetchPromise)

    const deps = createDeps({
      enableOptimisticUpdates: true,
      entities: {
        user: { match: (obj: any) => 'name' in obj, id: (u: any) => u.id },
      },
    })

    // Pre-populate entity store
    deps.entityStore.set('user', '1', {
      id: '1',
      name: 'Alice',
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
    }, deps)

    const executePromise = mutation({ params: { id: '1' }, body: { name: 'Bob' } })

    // Optimistic update should be applied immediately
    expect(deps.entityStore.get('user', '1')).toEqual(
      expect.objectContaining({ name: 'Bob' })
    )
    expect(notifySpy).toHaveBeenCalled()

    // Resolve the server response
    resolvePromise!({ id: '1', name: 'Bob' })
    await executePromise
  })

  it('rolls back optimistic update on error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Server error'))

    const deps = createDeps({
      enableOptimisticUpdates: true,
      entities: {
        user: { match: (obj: any) => 'name' in obj, id: (u: any) => u.id },
      },
    })

    // Pre-populate entity store
    deps.entityStore.set('user', '1', {
      id: '1',
      name: 'Alice',
    })

    deps.entityStore.registerQueryEntities(
      '/users',
      new Set(['user:1'])
    )

    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'PUT',
    }, deps)

    const [, err] = await mutation({ params: { id: '1' }, body: { name: 'Bob' } })

    expect(err).toBe('Server error')
    // Should be rolled back
    expect(deps.entityStore.get('user', '1')).toEqual({
      id: '1',
      name: 'Alice',
    })
  })

  it('performs optimistic delete', async () => {
    let resolvePromise: (value: any) => void
    const fetchPromise = new Promise((resolve) => {
      resolvePromise = resolve
    })
    const fn = vi.fn().mockReturnValue(fetchPromise)

    const deps = createDeps({
      enableOptimisticUpdates: true,
      entities: {
        user: { match: (obj: any) => 'name' in obj, id: (u: any) => u.id },
      },
    })

    deps.entityStore.set('user', '1', {
      id: '1',
      name: 'Alice',
    })

    deps.entityStore.registerQueryEntities(
      '/users',
      new Set(['user:1'])
    )

    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'DELETE',
    }, deps)

    const executePromise = mutation({ params: { id: '1' } })

    // Entity should be deleted optimistically
    expect(deps.entityStore.get('user', '1')).toBeUndefined()

    resolvePromise!(undefined)
    await executePromise
  })

  it('does not perform optimistic update for POST', async () => {
    const fn = vi.fn().mockResolvedValue({ id: '1', name: 'Alice' })

    const deps = createDeps({
      enableOptimisticUpdates: true,
      entities: {
        user: { match: (obj: any) => 'name' in obj, id: (u: any) => u.id },
      },
    })

    const mutation = createMutation({
      key: '/users',
      fn,
      method: 'POST',
    }, deps)

    await mutation({ body: { name: 'Alice' } })

    // Entity should be set from server response, not optimistically
    expect(deps.entityStore.get('user', '1')).toEqual({
      id: '1',
      name: 'Alice',
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

    const deps = createDeps({
      enableOptimisticUpdates: true,
      entities: {
        post: { match: (obj: any) => 'title' in obj, id: (p: any) => p.id },
        user: { match: (obj: any) => 'name' in obj, id: (u: any) => u.id },
      },
    })

    deps.entityStore.set('post', 'p1', {
      id: 'p1',
      title: 'Old Title',
    })

    deps.entityStore.registerQueryEntities(
      '/posts',
      new Set(['post:p1'])
    )

    const mutation = createMutation({
      key: '/posts/:postId',
      fn,
      method: 'PUT',
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

    resolvePromise!({ id: 'p1', title: 'New Title' })
    await executePromise
  })

  it('skips optimistic update when entity not in store', async () => {
    let resolvePromise: (value: any) => void
    const fetchPromise = new Promise((resolve) => {
      resolvePromise = resolve
    })
    const fn = vi.fn().mockReturnValue(fetchPromise)

    const deps = createDeps({
      enableOptimisticUpdates: true,
      entities: {
        user: { match: (obj: any) => 'name' in obj, id: (u: any) => u.id },
      },
    })

    // Don't pre-populate entity store - entity doesn't exist
    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'PUT',
    }, deps)

    const executePromise = mutation({ params: { id: '1' }, body: { name: 'Bob' } })

    // No optimistic update because entity doesn't exist in store
    expect(deps.entityStore.get('user', '1')).toBeUndefined()

    resolvePromise!({ id: '1', name: 'Bob' })
    await executePromise
  })

  it('skips optimistic when multiple entity keys and no explicit config', async () => {
    const fn = vi.fn().mockResolvedValue({ id: '1', name: 'Bob' })

    const deps = createDeps({
      enableOptimisticUpdates: true,
      entities: {
        user: { match: (obj: any) => 'name' in obj, id: (u: any) => u.id },
        post: { match: (obj: any) => 'title' in obj, id: (p: any) => p.id },
      },
    })

    deps.entityStore.set('user', '1', {
      id: '1',
      name: 'Alice',
    })

    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'PUT',
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

    const deps = createDeps({
      enableOptimisticUpdates: true,
      entities: {
        user: { match: (obj: any) => 'name' in obj, id: (u: any) => u.id },
      },
    })

    deps.entityStore.set('user', '1', {
      id: '1',
      name: 'Alice',
      email: 'alice@example.com',
    })

    deps.entityStore.registerQueryEntities(
      '/users',
      new Set(['user:1'])
    )

    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'PATCH',
    }, deps)

    const executePromise = mutation({ params: { id: '1' }, body: { name: 'Bob' } })

    // Optimistic update should merge
    expect(deps.entityStore.get('user', '1')).toEqual(
      expect.objectContaining({ name: 'Bob', email: 'alice@example.com' })
    )

    resolvePromise!({ id: '1', name: 'Bob', email: 'alice@example.com' })
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

    const deps = createDeps({
      enableOptimisticUpdates: true,
      entities: {
        user: { match: (obj: any) => 'name' in obj, id: (u: any) => u.id },
      },
    })

    deps.entityStore.set('user', '1', {
      id: '1',
      name: 'Alice',
    })

    deps.entityStore.registerQueryEntities(
      '/users',
      new Set(['user:1'])
    )

    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'DELETE',
    }, deps)

    const [, err] = await mutation({ params: { id: '1' } })
    expect(err).toBe('Server error')

    // Should be rolled back
    expect(deps.entityStore.get('user', '1')).toEqual({
      id: '1',
      name: 'Alice',
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

    const deps = createDeps({
      enableOptimisticUpdates: true,
      entities: {
        user: { match: (obj: any) => 'name' in obj, id: (u: any) => u.id },
      },
    })

    deps.entityStore.set('user', '1', {
      id: '1',
      name: 'Alice',
      email: 'alice@test.com',
    })

    deps.entityStore.registerQueryEntities(
      '/users',
      new Set(['user:1'])
    )

    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'PUT',
    }, deps)

    // Launch two concurrent mutations
    const p1 = mutation({ params: { id: '1' }, body: { name: 'Bob' } })
    const p2 = mutation({ params: { id: '1' }, body: { email: 'bob@test.com' } })

    // Both succeed
    resolve1!({ id: '1', name: 'Bob', email: 'alice@test.com' })
    resolve2!({ id: '1', name: 'Bob', email: 'bob@test.com' })

    await p1
    await p2

    // Final state should reflect both mutations
    const entity = deps.entityStore.get('user', '1') as any
    expect(entity.name).toBe('Bob')
    expect(entity.email).toBe('bob@test.com')
  })

  it('mapToEntities transforms data and entities are normalized', async () => {
    type ApiUser = { type: string; id: string; name: string }
    type NormalizedUser = { id: string; name: string; role: string }

    const fn = vi.fn().mockResolvedValue({ type: 'user', id: '1', name: 'Alice' })

    const deps = createDeps({
      entities: {
        user: { match: (obj: any) => 'name' in obj && 'role' in obj, id: (u: any) => u.id },
      },
    })
    const mutation = createMutation({
      key: '/users',
      fn,
      method: 'POST',
      mapToEntities: (data: ApiUser): NormalizedUser => ({ id: data.id, name: data.name, role: 'member' }),
    }, deps)

    const [result, err] = await mutation({ body: { name: 'Alice' } })
    expect(err).toBeNull()
    expect(result).toEqual({ id: '1', name: 'Alice', role: 'member' })

    expect(deps.entityStore.get('user', '1')).toEqual(
      expect.objectContaining({ id: '1', name: 'Alice', role: 'member' })
    )
  })

  it('mapToEntities composes with parseResponse in mutation', async () => {
    type RawResponse = { data: { type: string; id: string; name: string } }
    type ApiUser = { type: string; id: string; name: string }
    type NormalizedUser = { id: string; name: string; role: string }

    const fn = vi.fn().mockResolvedValue({
      data: { type: 'user', id: '1', name: 'Alice' },
    })

    const deps = createDeps({
      entities: {
        user: { match: (obj: any) => 'name' in obj && 'role' in obj, id: (u: any) => u.id },
      },
    })
    const mutation = createMutation({
      key: '/users',
      fn,
      method: 'POST',
      parseResponse: (raw: RawResponse): ApiUser => raw.data,
      mapToEntities: (data: ApiUser): NormalizedUser => ({ id: data.id, name: data.name, role: 'member' }),
    }, deps)

    const [result, err] = await mutation({ body: { name: 'Alice' } })
    expect(err).toBeNull()
    expect(result).toEqual({ id: '1', name: 'Alice', role: 'member' })

    expect(deps.entityStore.get('user', '1')).toEqual(
      expect.objectContaining({ id: '1', name: 'Alice', role: 'member' })
    )
  })

  it('mapToEntities without entities still transforms mutation data', async () => {
    const fn = vi.fn().mockResolvedValue({ id: '1', name: 'Alice' })

    const deps = createDeps()
    const mutation = createMutation({
      key: '/users',
      fn,
      method: 'POST',
      mapToEntities: (data: any) => ({ ...data, __type: 'user' as const }),
    }, deps)

    const [result, err] = await mutation({ body: { name: 'Alice' } })
    expect(err).toBeNull()
    expect(result).toEqual({ id: '1', name: 'Alice', __type: 'user' })
  })

  it('composes safe instance abortAfter signal with user signal', async () => {
    let capturedSignal: AbortSignal | undefined
    const fn = vi.fn().mockImplementation((ctx: any) => {
      capturedSignal = ctx.signal
      return Promise.resolve({ id: '1', name: 'Alice' })
    })

    // Create safe instance with abortAfter so it provides a signal
    const safeInstance = createSafe({
      parseError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
      defaultError: 'Unknown error',
      abortAfter: 5000,
    })

    const deps = createDeps({ safeInstance })
    const mutation = createMutation({
      key: '/users',
      fn,
      method: 'POST',
    }, deps)

    const [result, err] = await mutation({ body: { name: 'Alice' } })
    expect(err).toBeNull()
    expect(result).toEqual({ id: '1', name: 'Alice' })
    // Signal should have been composed from the safe instance's abortAfter signal
    expect(capturedSignal).toBeDefined()
    expect(capturedSignal!.aborted).toBe(false)
  })

  it('composes safe instance abortAfter signal with user-provided signal', async () => {
    let capturedSignal: AbortSignal | undefined
    const fn = vi.fn().mockImplementation((ctx: any) => {
      capturedSignal = ctx.signal
      return new Promise(() => {}) // never resolves
    })

    const safeInstance = createSafe({
      parseError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
      defaultError: 'Unknown error',
      abortAfter: 5000,
    })

    const deps = createDeps({ safeInstance })
    const mutation = createMutation({
      key: '/users',
      fn,
      method: 'POST',
    }, deps)

    const userController = new AbortController()
    mutation({ body: { name: 'Alice' }, signal: userController.signal })

    expect(capturedSignal).toBeDefined()
    expect(capturedSignal!.aborted).toBe(false)

    // User signal abort should propagate through the composed signal
    userController.abort('user cancelled')
    expect(capturedSignal!.aborted).toBe(true)
  })

  it('skips optimistic delete when entity not in store', async () => {
    const fn = vi.fn().mockResolvedValue(undefined)

    const deps = createDeps({
      enableOptimisticUpdates: true,
      entities: {
        user: { match: (obj: any) => 'name' in obj, id: (u: any) => u.id },
      },
    })

    // Don't pre-populate entity store - entity doesn't exist
    const beginSpy = vi.spyOn(deps.entityStore, 'beginOptimistic')
    const deleteSpy = vi.spyOn(deps.entityStore, 'delete')
    const notifySpy = vi.spyOn(deps.notifier, 'notifyMany')

    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'DELETE',
    }, deps)

    const [, err] = await mutation({ params: { id: '1' } })
    expect(err).toBeNull()

    // Should not have performed any optimistic tracking
    expect(beginSpy).not.toHaveBeenCalled()
    expect(deleteSpy).not.toHaveBeenCalled()
    expect(notifySpy).not.toHaveBeenCalled()
  })

  it('concurrent optimistic mutations: first fails while second in-flight notifies queries', async () => {
    let reject1: (e: any) => void
    let resolve2: (v: any) => void
    const promise1 = new Promise((_, rej) => { reject1 = rej })
    const promise2 = new Promise((r) => { resolve2 = r })

    let callCount = 0
    const fn = vi.fn().mockImplementation(() => {
      callCount++
      return callCount === 1 ? promise1 : promise2
    })

    const deps = createDeps({
      enableOptimisticUpdates: true,
      entities: {
        user: { match: (obj: any) => 'name' in obj, id: (u: any) => u.id },
      },
    })

    deps.entityStore.set('user', '1', {
      id: '1',
      name: 'Alice',
    })

    deps.entityStore.registerQueryEntities(
      '/users',
      new Set(['user:1'])
    )

    const notifyManySpy = vi.spyOn(deps.notifier, 'notifyMany')

    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'PUT',
    }, deps)

    const p1 = mutation({ params: { id: '1' }, body: { name: 'Bob' } })
    const p2 = mutation({ params: { id: '1' }, body: { name: 'Charlie' } })

    // First fails while second is still in-flight (counter > 0, no rollback yet)
    notifyManySpy.mockClear()
    reject1!(new Error('Server error'))
    await p1

    // Should have notified affected queries even though no rollback (counter still > 0)
    expect(notifyManySpy).toHaveBeenCalled()

    // Now resolve second to clean up
    resolve2!({ id: '1', name: 'Charlie' })
    await p2
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

    const deps = createDeps({
      enableOptimisticUpdates: true,
      entities: {
        user: { match: (obj: any) => 'name' in obj, id: (u: any) => u.id },
      },
    })

    deps.entityStore.set('user', '1', {
      id: '1',
      name: 'Alice',
    })

    deps.entityStore.registerQueryEntities(
      '/users',
      new Set(['user:1'])
    )

    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'PUT',
    }, deps)

    const p1 = mutation({ params: { id: '1' }, body: { name: 'Bob' } })
    const p2 = mutation({ params: { id: '1' }, body: { name: 'Charlie' } })

    // First succeeds
    resolve1!({ id: '1', name: 'Bob' })
    await p1

    // Second fails — rolls back to M1's confirmed server data, not original base
    reject2!(new Error('Server error'))
    await p2

    // Should roll back to M1's confirmed server data (Bob), not original base (Alice)
    expect(deps.entityStore.get('user', '1')).toEqual({
      id: '1',
      name: 'Bob',
    })
  })

  // ─── Mutation State Tracking (Issue #5) ───

  it('starts in idle state', () => {
    const fn = vi.fn().mockResolvedValue({ id: '1' })
    const deps = createDeps()
    const mutation = createMutation({ key: '/users', fn, method: 'POST' }, deps)

    expect(mutation.status).toBe('idle')
    expect(mutation.isPending).toBe(false)
    expect(mutation.isSuccess).toBe(false)
    expect(mutation.isError).toBe(false)
    expect(mutation.data).toBeUndefined()
    expect(mutation.error).toBeNull()
    expect(mutation.submittedAt).toBeNull()
  })

  it('transitions to pending then success', async () => {
    let resolvePromise: (v: any) => void
    const fetchPromise = new Promise((r) => { resolvePromise = r })
    const fn = vi.fn().mockReturnValue(fetchPromise)
    const deps = createDeps()
    const mutation = createMutation({ key: '/users', fn, method: 'POST' }, deps)

    const promise = mutation({ body: { name: 'Alice' } })

    expect(mutation.status).toBe('pending')
    expect(mutation.isPending).toBe(true)
    expect(mutation.isSuccess).toBe(false)
    expect(mutation.submittedAt).toBeTypeOf('number')

    resolvePromise!({ id: '1', name: 'Alice' })
    await promise

    expect(mutation.status).toBe('success')
    expect(mutation.isPending).toBe(false)
    expect(mutation.isSuccess).toBe(true)
    expect(mutation.isError).toBe(false)
    expect(mutation.data).toEqual({ id: '1', name: 'Alice' })
    expect(mutation.error).toBeNull()
  })

  it('transitions to pending then error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'))
    const deps = createDeps()
    const mutation = createMutation({ key: '/users', fn, method: 'POST' }, deps)

    await mutation({ body: { name: 'Alice' } })

    expect(mutation.status).toBe('error')
    expect(mutation.isPending).toBe(false)
    expect(mutation.isSuccess).toBe(false)
    expect(mutation.isError).toBe(true)
    expect(mutation.data).toBeUndefined()
    expect(mutation.error).toBe('fail')
  })

  it('subscribe notifies on state changes', async () => {
    let resolvePromise: (v: any) => void
    const fetchPromise = new Promise((r) => { resolvePromise = r })
    const fn = vi.fn().mockReturnValue(fetchPromise)
    const deps = createDeps()
    const mutation = createMutation({ key: '/users', fn, method: 'POST' }, deps)

    const states: string[] = []
    const unsub = mutation.subscribe((s) => { states.push(s.status) })

    const promise = mutation({ body: { name: 'Alice' } })
    resolvePromise!({ id: '1' })
    await promise

    expect(states).toEqual(['pending', 'success'])
    unsub()
  })

  it('unsubscribe stops notifications', async () => {
    const fn = vi.fn().mockResolvedValue({ id: '1' })
    const deps = createDeps()
    const mutation = createMutation({ key: '/users', fn, method: 'POST' }, deps)

    const states: string[] = []
    const unsub = mutation.subscribe((s) => { states.push(s.status) })
    unsub()

    await mutation({ body: {} })
    expect(states).toEqual([])
  })

  it('reset returns to idle state', async () => {
    const fn = vi.fn().mockResolvedValue({ id: '1', name: 'Alice' })
    const deps = createDeps()
    const mutation = createMutation({ key: '/users', fn, method: 'POST' }, deps)

    await mutation({ body: { name: 'Alice' } })
    expect(mutation.status).toBe('success')

    mutation.reset()
    expect(mutation.status).toBe('idle')
    expect(mutation.isPending).toBe(false)
    expect(mutation.isSuccess).toBe(false)
    expect(mutation.data).toBeUndefined()
    expect(mutation.error).toBeNull()
    expect(mutation.submittedAt).toBeNull()
  })

  // ─── onMutate callback (Issue #6) ───

  it('onMutate receives variables and context flows to onSuccess', async () => {
    const onMutate = vi.fn().mockReturnValue({ rollback: true })
    const onSuccess = vi.fn()
    const fn = vi.fn().mockResolvedValue({ id: '1', name: 'Alice' })

    const deps = createDeps()
    const mutation = createMutation({
      key: '/users',
      fn,
      method: 'POST',
      onMutate,
      onSuccess,
    }, deps)

    await mutation({ body: { name: 'Alice' } })

    expect(onMutate).toHaveBeenCalledWith(
      expect.objectContaining({ body: { name: 'Alice' } })
    )
    expect(onSuccess).toHaveBeenCalledWith(
      { id: '1', name: 'Alice' },
      { rollback: true }
    )
  })

  it('onMutate context flows to onError on failure', async () => {
    const onMutate = vi.fn().mockReturnValue({ previousData: [1, 2, 3] })
    const onError = vi.fn()
    const fn = vi.fn().mockRejectedValue(new Error('fail'))

    const deps = createDeps()
    const mutation = createMutation({
      key: '/users',
      fn,
      method: 'POST',
      onMutate,
      onError,
    }, deps)

    await mutation({ body: {} })

    expect(onError).toHaveBeenCalledWith('fail', { previousData: [1, 2, 3] })
  })

  it('onMutate context flows to onSettled', async () => {
    const onMutate = vi.fn().mockReturnValue('ctx')
    const onSettled = vi.fn()
    const fn = vi.fn().mockResolvedValue({ id: '1' })

    const deps = createDeps()
    const mutation = createMutation({
      key: '/users',
      fn,
      method: 'POST',
      onMutate,
      onSettled,
    }, deps)

    await mutation({ body: {} })

    expect(onSettled).toHaveBeenCalledWith({ id: '1' }, null, 'ctx')
  })

  it('async onMutate is awaited before mutation fires', async () => {
    const callOrder: string[] = []

    const onMutate = vi.fn().mockImplementation(async () => {
      callOrder.push('onMutate')
      return 'async-ctx'
    })

    const fn = vi.fn().mockImplementation(async () => {
      callOrder.push('fn')
      return { id: '1' }
    })

    const deps = createDeps()
    const mutation = createMutation({
      key: '/users',
      fn,
      method: 'POST',
      onMutate,
    }, deps)

    await mutation({ body: {} })
    expect(callOrder).toEqual(['onMutate', 'fn'])
  })

  it('onMutate skips built-in optimistic updates', async () => {
    let resolvePromise: (v: any) => void
    const fetchPromise = new Promise((r) => { resolvePromise = r })
    const fn = vi.fn().mockReturnValue(fetchPromise)

    const deps = createDeps({
      enableOptimisticUpdates: true,
      entities: {
        user: { match: (obj: any) => 'name' in obj, id: (u: any) => u.id },
      },
    })

    deps.entityStore.set('user', '1', { id: '1', name: 'Alice' })
    deps.entityStore.registerQueryEntities('/users', new Set(['user:1']))

    const beginSpy = vi.spyOn(deps.entityStore, 'beginOptimistic')

    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'PUT',
      onMutate: () => {
        // User does their own optimistic update here
        return { previous: 'Alice' }
      },
    }, deps)

    const promise = mutation({ params: { id: '1' }, body: { name: 'Bob' } })

    // Built-in optimistic should NOT have been called
    expect(beginSpy).not.toHaveBeenCalled()
    // Entity store should still have original since onMutate didn't modify it
    expect(deps.entityStore.get('user', '1')).toEqual({ id: '1', name: 'Alice' })

    resolvePromise!({ id: '1', name: 'Bob' })
    await promise
  })

  it('onMutate receives params and searchParams', async () => {
    const onMutate = vi.fn()
    const fn = vi.fn().mockResolvedValue({ id: '1' })

    const deps = createDeps()
    const mutation = createMutation({
      key: '/users/:id',
      fn,
      method: 'PUT',
      onMutate,
    }, deps)

    await mutation({
      params: { id: '123' },
      body: { name: 'Bob' },
      searchParams: { notify: true },
    })

    expect(onMutate).toHaveBeenCalledWith({
      params: { id: '123' },
      body: { name: 'Bob' },
      searchParams: { notify: true },
    })
  })
})
