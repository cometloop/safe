import { describe, it, expect, vi, afterEach } from 'vitest'
import { createSafe } from '@cometloop/safe'
import { createQuery } from '../query'
import { QueryCache } from '../query-cache'
import { EntityStore } from '../entity-store'
import { Notifier } from '../notifier'
import { FocusManager } from '../focus-manager'

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

describe('enabled on subscribe', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('enabled: false still receives initial state notification', () => {
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1' }]),
    }, deps)

    const states: any[] = []
    const unsub = query.subscribe(
      (state) => { states.push({ ...state }) },
      { enabled: false },
    )

    expect(states.length).toBe(1)
    expect(states[0].status).toBe('idle')

    unsub()
  })

  it('enabled: false does not increment subscriber count', () => {
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1' }]),
    }, deps)

    const key = deps.queryCache.buildKey('/users')
    deps.queryCache.getOrCreate(key, 0, 5 * 60_000)

    const unsub = query.subscribe(
      () => {},
      { enabled: false },
    )

    const entry = deps.queryCache.get(key)
    expect(entry!.subscriberCount).toBe(0)

    unsub()
  })

  it('enabled: true (default) increments subscriber count', () => {
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1' }]),
    }, deps)

    const key = deps.queryCache.buildKey('/users')

    const unsub = query.subscribe(() => {})

    const entry = deps.queryCache.get(key)
    expect(entry!.subscriberCount).toBe(1)

    unsub()
  })

  it('enabled: false does not start interval refetching', () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockResolvedValue([])

    const deps = createDeps({
      defaultRefetchInterval: 1000,
    })
    const query = createQuery({
      key: '/users',
      fn,
      refetchInterval: 1000,
    }, deps)

    const unsub = query.subscribe(
      () => {},
      { enabled: false },
    )

    vi.advanceTimersByTime(5000)
    // Should NOT have triggered any refetches
    expect(fn).not.toHaveBeenCalled()

    unsub()
  })

  it('enabled: false subscriber still receives updates from other sources', async () => {
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1', name: 'Alice' }]),
    }, deps)

    const states: any[] = []
    const unsub = query.subscribe(
      (state) => { states.push({ ...state }) },
      { enabled: false },
    )

    // Trigger fetch externally
    await query()

    // Should have received the update
    expect(states.length).toBeGreaterThan(1)
    const lastState = states[states.length - 1]
    expect(lastState.status).toBe('success')
    expect(lastState.data).toEqual([{ id: '1', name: 'Alice' }])

    unsub()
  })

  it('enabled: false unsubscribe does not decrement subscriber count', () => {
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1' }]),
    }, deps)

    // Normal subscriber first
    const unsub1 = query.subscribe(() => {})
    const key = deps.queryCache.buildKey('/users')
    expect(deps.queryCache.get(key)!.subscriberCount).toBe(1)

    // Disabled subscriber
    const unsub2 = query.subscribe(
      () => {},
      { enabled: false },
    )
    expect(deps.queryCache.get(key)!.subscriberCount).toBe(1) // unchanged

    unsub2() // should not decrement
    expect(deps.queryCache.get(key)!.subscriberCount).toBe(1) // still 1

    unsub1()
    expect(deps.queryCache.get(key)!.subscriberCount).toBe(0)
  })

  it('enabled: false with params still receives updates', async () => {
    const deps = createDeps()
    const query = createQuery({
      key: '/users/:id',
      fn: () => Promise.resolve({ id: '1', name: 'Alice' }),
    }, deps)

    const states: any[] = []
    const unsub = query.subscribe(
      (state) => { states.push({ ...state }) },
      { params: { id: '1' }, enabled: false },
    )

    await query({ params: { id: '1' } })

    const lastState = states[states.length - 1]
    expect(lastState.data).toEqual({ id: '1', name: 'Alice' })

    unsub()
  })

  it('enabled: false can be combined with select', async () => {
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve([{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }]),
    }, deps)

    await query()

    const states: any[] = []
    const unsub = query.subscribe(
      (state) => { states.push({ ...state }) },
      {
        enabled: false,
        select: (data: any[]) => data.map((u: any) => u.name),
      },
    )

    expect(states[0].data).toEqual(['Alice', 'Bob'])

    unsub()
  })
})
