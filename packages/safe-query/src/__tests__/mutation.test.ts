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
    baseUrl: 'https://api.example.com',
    headers: undefined,
    enableOptimisticUpdates: false,
    ...overrides,
  }
}

function mockFetchResponse(data: any, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status,
      headers: new Headers({ 'content-length': '100' }),
      json: () => Promise.resolve(data),
    })
  )
}

describe('createMutation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('executes a POST mutation with body', async () => {
    const response = { id: '1', name: 'Alice' }
    mockFetchResponse(response, 201)

    const deps = createDeps()
    const mutation = createMutation('/users', { method: 'POST' }, deps)

    const [result, err] = await mutation.execute({ name: 'Alice' })
    expect(err).toBeNull()
    expect(result).toEqual(response)
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/users',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Alice' }),
      })
    )
  })

  it('executes a PUT mutation with params and body', async () => {
    const response = { id: '123', name: 'Updated' }
    mockFetchResponse(response)

    const deps = createDeps()
    const mutation = createMutation('/users/:id', { method: 'PUT' }, deps)

    const [result, err] = await mutation.execute(
      { id: '123' },
      { name: 'Updated' }
    )
    expect(err).toBeNull()
    expect(result).toEqual(response)
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/users/123',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated' }),
      })
    )
  })

  it('executes a DELETE mutation with params', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        headers: new Headers(),
        json: () => Promise.reject(new Error('no body')),
      })
    )

    const deps = createDeps()
    const mutation = createMutation('/users/:id', { method: 'DELETE' }, deps)

    const [_result, err] = await mutation.execute({ id: '123' }, undefined)
    expect(err).toBeNull()
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/users/123',
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('applies parseResponse', async () => {
    mockFetchResponse({ id: '1', name: 'Alice' })

    const deps = createDeps()
    const mutation = createMutation('/users', {
      method: 'POST',
      parseResponse: (data: any) => ({ ...data, __type: 'user' as const }),
    }, deps)

    const [result, err] = await mutation.execute({ name: 'Alice' })
    expect(err).toBeNull()
    expect(result).toEqual({ id: '1', name: 'Alice', __type: 'user' })
  })

  it('normalizes entities from mutation response', async () => {
    mockFetchResponse({
      id: '1',
      name: 'Updated',
      __type: 'user',
    })

    const deps = createDeps()
    const mutation = createMutation('/users/:id', {
      method: 'PUT',
      entities: { user: (u: any) => u.id },
    }, deps)

    await mutation.execute({ id: '1' }, { name: 'Updated' })
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

    const mutation = createMutation('/users/:id', {
      method: 'PUT',
      entities: { user: (u: any) => u.id },
    }, deps)

    const executePromise = mutation.execute({ id: '1' }, { name: 'Bob' })

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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Server error'))
    )

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

    const mutation = createMutation('/users/:id', {
      method: 'PUT',
      entities: { user: (u: any) => u.id },
    }, deps)

    const [, err] = await mutation.execute({ id: '1' }, { name: 'Bob' })

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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        fetchPromise.then(() => ({
          ok: true,
          status: 204,
          headers: new Headers(),
          json: () => Promise.reject(new Error('no body')),
        }))
      )
    )

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

    const mutation = createMutation('/users/:id', {
      method: 'DELETE',
      entities: { user: (u: any) => u.id },
    }, deps)

    const executePromise = mutation.execute({ id: '1' }, undefined)

    // Entity should be deleted optimistically
    expect(deps.entityStore.get('user', '1')).toBeUndefined()

    resolvePromise!(undefined)
    await executePromise
  })

  it('does not perform optimistic update for POST', async () => {
    mockFetchResponse({ id: '1', name: 'Alice', __type: 'user' }, 201)

    const deps = createDeps({ enableOptimisticUpdates: true })

    const mutation = createMutation('/users', {
      method: 'POST',
      entities: { user: (u: any) => u.id },
    }, deps)

    await mutation.execute({ name: 'Alice' })

    // Entity should be set from server response, not optimistically
    expect(deps.entityStore.get('user', '1')).toEqual({
      id: '1',
      name: 'Alice',
      __type: 'user',
    })
  })

  it('handles fetch errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network error'))
    )

    const deps = createDeps()
    const mutation = createMutation('/users', { method: 'POST' }, deps)

    const [result, err] = await mutation.execute({ name: 'Alice' })
    expect(result).toBeNull()
    expect(err).toBe('Network error')
  })

  it('provides headers from config', async () => {
    mockFetchResponse({})

    const deps = createDeps({
      headers: () => ({ Authorization: 'Bearer token' }),
    })
    const mutation = createMutation('/users', { method: 'POST' }, deps)

    await mutation.execute({ name: 'Alice' })
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/users',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
        }),
      })
    )
  })

  it('uses explicit optimistic config', async () => {
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

    const mutation = createMutation('/posts/:postId', {
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

    const executePromise = mutation.execute(
      { postId: 'p1' },
      { title: 'New Title' }
    )

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

    const deps = createDeps({ enableOptimisticUpdates: true })

    // Don't pre-populate entity store - entity doesn't exist
    const mutation = createMutation('/users/:id', {
      method: 'PUT',
      entities: { user: (u: any) => u.id },
    }, deps)

    const executePromise = mutation.execute({ id: '1' }, { name: 'Bob' })

    // No optimistic update because entity doesn't exist in store
    expect(deps.entityStore.get('user', '1')).toBeUndefined()

    resolvePromise!({ id: '1', name: 'Bob', __type: 'user' })
    await executePromise
  })

  it('skips optimistic when multiple entity keys and no explicit config', async () => {
    mockFetchResponse({ id: '1', name: 'Bob', __type: 'user' })

    const deps = createDeps({ enableOptimisticUpdates: true })

    deps.entityStore.set('user', '1', {
      id: '1',
      name: 'Alice',
      __type: 'user',
    })

    const mutation = createMutation('/users/:id', {
      method: 'PUT',
      entities: {
        user: (u: any) => u.id,
        post: (p: any) => p.id,
      },
    }, deps)

    // Should not crash; no optimistic update because multiple entity types
    await mutation.execute({ id: '1' }, { name: 'Bob' })
  })

  it('DELETE without path params', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        headers: new Headers(),
        json: () => Promise.reject(new Error('no body')),
      })
    )

    const deps = createDeps()
    const mutation = createMutation('/cache', { method: 'DELETE' }, deps)

    const [, err] = await mutation.execute(undefined)
    expect(err).toBeNull()
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/cache',
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('PATCH mutation with optimistic update', async () => {
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

    const mutation = createMutation('/users/:id', {
      method: 'PATCH',
      entities: { user: (u: any) => u.id },
    }, deps)

    const executePromise = mutation.execute({ id: '1' }, { name: 'Bob' })

    // Optimistic update should merge
    expect(deps.entityStore.get('user', '1')).toEqual(
      expect.objectContaining({ name: 'Bob', email: 'alice@example.com' })
    )

    resolvePromise!({ id: '1', name: 'Bob', email: 'alice@example.com', __type: 'user' })
    await executePromise
  })

  it('rolls back optimistic delete on error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Server error'))
    )

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

    const mutation = createMutation('/users/:id', {
      method: 'DELETE',
      entities: { user: (u: any) => u.id },
    }, deps)

    const [, err] = await mutation.execute({ id: '1' }, undefined)
    expect(err).toBe('Server error')

    // Should be rolled back
    expect(deps.entityStore.get('user', '1')).toEqual({
      id: '1',
      name: 'Alice',
      __type: 'user',
    })
  })
})
