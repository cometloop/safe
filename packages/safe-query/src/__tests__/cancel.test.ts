import { describe, it, expect, vi, afterEach } from 'vitest'
import { createSafe } from '@cometloop/safe'
import { createQuery } from '../query'
import { QueryCache } from '../query-cache'
import { EntityStore } from '../entity-store'
import { Notifier } from '../notifier'
import { FocusManager } from '../focus-manager'
import { safeQuery } from '../client'

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
    defaultStaleTime: 0,
    defaultGcTime: 5 * 60_000,
    focusManager: new FocusManager(),
    defaultRefetchInterval: false as number | false,
    defaultRefetchIntervalInBackground: false,
    defaultRefetchOnWindowFocus: false,
    registerCleanup: () => {},
    ...overrides,
  }
}

describe('query cancellation API', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('cancel() aborts the in-flight request', async () => {
    let capturedSignal: AbortSignal | undefined
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: (ctx: any) => {
        capturedSignal = ctx.signal
        return new Promise(() => {}) // never resolves
      },
    }, deps)

    query() // start fetch, don't await

    expect(capturedSignal).toBeDefined()
    expect(capturedSignal!.aborted).toBe(false)

    query.cancel()

    expect(capturedSignal!.aborted).toBe(true)
  })

  it('cancel() notifies subscribers', async () => {
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => new Promise(() => {}),
    }, deps)

    const states: any[] = []
    const unsub = query.subscribe((state) => {
      states.push({ ...state })
    })

    query()
    const preCancel = states.length
    query.cancel()

    expect(states.length).toBeGreaterThan(preCancel)

    unsub()
  })

  it('cancel() with params cancels specific query', async () => {
    let signal1: AbortSignal | undefined
    let signal2: AbortSignal | undefined
    const deps = createDeps()
    const query = createQuery({
      key: '/users/:id',
      fn: (ctx: any) => {
        if (ctx.params.id === '1') signal1 = ctx.signal
        else signal2 = ctx.signal
        return new Promise(() => {})
      },
    }, deps)

    query({ params: { id: '1' } })
    query({ params: { id: '2' } })

    expect(signal1!.aborted).toBe(false)
    expect(signal2!.aborted).toBe(false)

    query.cancel({ params: { id: '1' } })

    expect(signal1!.aborted).toBe(true)
    expect(signal2!.aborted).toBe(false)
  })

  it('cancel() clears the inflight promise', async () => {
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => new Promise(() => {}),
    }, deps)

    query()

    const entry = deps.queryCache.get('/users')
    expect(entry?.inflightPromise).not.toBeNull()

    query.cancel()

    expect(entry?.inflightPromise).toBeNull()
  })

  it('cancel() is safe to call when nothing is in flight', () => {
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve([]),
    }, deps)

    // Should not throw
    expect(() => query.cancel()).not.toThrow()
  })

  it('client.cancelQuery() cancels a query from outside', async () => {
    let capturedSignal: AbortSignal | undefined
    const safe = createSafe({
      parseError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
      defaultError: 'Unknown error',
    })
    const api = safeQuery({ safe })

    const getUsers = api.query({
      key: '/users',
      fn: (ctx: any) => {
        capturedSignal = ctx.signal
        return new Promise(() => {})
      },
    })

    getUsers()

    expect(capturedSignal!.aborted).toBe(false)

    api.cancelQuery('/users')

    expect(capturedSignal!.aborted).toBe(true)

    api.destroy()
  })

  it('client.cancelQuery() with params', async () => {
    let capturedSignal: AbortSignal | undefined
    const safe = createSafe({
      parseError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
      defaultError: 'Unknown error',
    })
    const api = safeQuery({ safe })

    const getUser = api.query({
      key: '/users/:id',
      fn: (ctx: any) => {
        capturedSignal = ctx.signal
        return new Promise(() => {})
      },
    })

    getUser({ params: { id: '1' } })

    api.cancelQuery('/users/:id', { params: { id: '1' } })

    expect(capturedSignal!.aborted).toBe(true)

    api.destroy()
  })

  it('client.cancelQuery() throws after destroy', () => {
    const safe = createSafe({
      parseError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
      defaultError: 'Unknown error',
    })
    const api = safeQuery({ safe })
    api.destroy()

    expect(() => api.cancelQuery('/users')).toThrow('SafeQueryClient has been destroyed')
  })

  it('cancel allows subsequent fetch to proceed', async () => {
    let callCount = 0
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => {
        callCount++
        if (callCount === 1) return new Promise(() => {}) // first call hangs
        return Promise.resolve([{ id: '1' }])
      },
    }, deps)

    query() // first call, will hang
    query.cancel() // cancel it

    // Second call should proceed
    const [result, err] = await query()
    expect(err).toBeNull()
    expect(result).toEqual([{ id: '1' }])
    expect(callCount).toBe(2)
  })
})
