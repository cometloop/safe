import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { createSafe } from '@cometloop/safe'
import { createQuery } from '../query'
import { QueryCache } from '../query-cache'
import { EntityStore } from '../entity-store'
import { Notifier } from '../notifier'
import { FocusManager } from '../focus-manager'

function createMockDocument(initialVisibility: string = 'visible') {
  const target = new EventTarget()
  return {
    visibilityState: initialVisibility,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  }
}

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

describe('refetchInterval', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('refetches on interval when there is an active subscriber', async () => {
    const fn = vi.fn().mockResolvedValue({ id: '1' })
    const deps = createDeps({ defaultRefetchInterval: 1000 })

    const query = createQuery({ key: '/users', fn }, deps)

    const cb = vi.fn()
    const unsub = query.subscribe(cb)

    await query()
    expect(fn).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(fn).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(1000)
    expect(fn).toHaveBeenCalledTimes(3)

    unsub()
    deps.focusManager.destroy()
  })

  it('stops interval when last subscriber unsubscribes', async () => {
    const fn = vi.fn().mockResolvedValue({ id: '1' })
    const deps = createDeps({ defaultRefetchInterval: 1000 })

    const query = createQuery({ key: '/users', fn }, deps)

    const cb = vi.fn()
    const unsub = query.subscribe(cb)

    await query()
    expect(fn).toHaveBeenCalledTimes(1)

    unsub()

    await vi.advanceTimersByTimeAsync(1000)

    // Should NOT have refetched after unsubscribe
    expect(fn).toHaveBeenCalledTimes(1)
    deps.focusManager.destroy()
  })

  it('restarts interval on new subscriber after previous unsubscribe', async () => {
    const fn = vi.fn().mockResolvedValue({ id: '1' })
    const deps = createDeps({ defaultRefetchInterval: 1000 })

    const query = createQuery({ key: '/users', fn }, deps)

    // First subscriber
    const unsub1 = query.subscribe(vi.fn())
    await query()
    expect(fn).toHaveBeenCalledTimes(1)

    unsub1()

    await vi.advanceTimersByTimeAsync(1000)
    expect(fn).toHaveBeenCalledTimes(1) // No refetch after unsub

    // New subscriber
    const unsub2 = query.subscribe(vi.fn())
    await query()

    await vi.advanceTimersByTimeAsync(1000)

    expect(fn).toHaveBeenCalledTimes(3)

    unsub2()
    deps.focusManager.destroy()
  })

  it('skips refetch when tab is hidden and refetchIntervalInBackground is false', async () => {
    const mockDoc = createMockDocument('visible')
    const savedDocument = globalThis.document
    globalThis.document = mockDoc as any

    const focusManager = new FocusManager()
    const fn = vi.fn().mockResolvedValue({ id: '1' })
    const deps = createDeps({
      defaultRefetchInterval: 1000,
      defaultRefetchIntervalInBackground: false,
      focusManager,
    })

    const query = createQuery({ key: '/users', fn }, deps)

    const unsub = query.subscribe(vi.fn())
    await query()
    expect(fn).toHaveBeenCalledTimes(1)

    // Now hide the tab
    mockDoc.visibilityState = 'hidden'

    await vi.advanceTimersByTimeAsync(1000)

    // Should NOT refetch while hidden
    expect(fn).toHaveBeenCalledTimes(1)

    // Make visible again
    mockDoc.visibilityState = 'visible'

    await vi.advanceTimersByTimeAsync(1000)

    // Should refetch now that it's visible
    expect(fn).toHaveBeenCalledTimes(2)

    unsub()
    focusManager.destroy()
    globalThis.document = savedDocument
  })

  it('refetches in background when refetchIntervalInBackground is true', async () => {
    const mockDoc = createMockDocument('hidden')
    const savedDocument = globalThis.document
    globalThis.document = mockDoc as any

    const focusManager = new FocusManager()
    const fn = vi.fn().mockResolvedValue({ id: '1' })
    const deps = createDeps({
      defaultRefetchInterval: 1000,
      defaultRefetchIntervalInBackground: true,
      focusManager,
    })

    const query = createQuery({ key: '/users', fn }, deps)

    const unsub = query.subscribe(vi.fn())
    await query()
    expect(fn).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000)

    // Should refetch even while hidden
    expect(fn).toHaveBeenCalledTimes(2)

    unsub()
    focusManager.destroy()
    globalThis.document = savedDocument
  })

  it('per-query config overrides global default', async () => {
    const fn = vi.fn().mockResolvedValue({ id: '1' })
    const deps = createDeps({ defaultRefetchInterval: false })

    const query = createQuery({
      key: '/users',
      fn,
      refetchInterval: 500,
    }, deps)

    const unsub = query.subscribe(vi.fn())
    await query()
    expect(fn).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(500)

    expect(fn).toHaveBeenCalledTimes(2)

    unsub()
    deps.focusManager.destroy()
  })

  it('does not start interval when refetchInterval is false', async () => {
    const fn = vi.fn().mockResolvedValue({ id: '1' })
    const deps = createDeps({ defaultRefetchInterval: false })

    const query = createQuery({ key: '/users', fn }, deps)

    const unsub = query.subscribe(vi.fn())
    await query()
    expect(fn).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5000)

    expect(fn).toHaveBeenCalledTimes(1)

    unsub()
    deps.focusManager.destroy()
  })
})

describe('refetchOnWindowFocus', () => {
  let savedDocument: typeof globalThis.document

  beforeEach(() => {
    vi.useFakeTimers()
    savedDocument = globalThis.document
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    globalThis.document = savedDocument
  })

  it('refetches stale queries when tab regains focus', async () => {
    const mockDoc = createMockDocument('visible')
    globalThis.document = mockDoc as any

    const focusManager = new FocusManager()
    const fn = vi.fn().mockResolvedValue({ id: '1' })
    const deps = createDeps({
      defaultRefetchOnWindowFocus: true,
      defaultStaleTime: 0,
      focusManager,
    })

    const query = createQuery({ key: '/users', fn }, deps)

    const unsub = query.subscribe(vi.fn())
    await query()
    expect(fn).toHaveBeenCalledTimes(1)

    // Advance past staleTime=0 so data becomes stale
    await vi.advanceTimersByTimeAsync(1)

    // Simulate tab losing and regaining focus
    mockDoc.visibilityState = 'hidden'
    mockDoc.dispatchEvent(new Event('visibilitychange'))

    mockDoc.visibilityState = 'visible'
    mockDoc.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)

    expect(fn).toHaveBeenCalledTimes(2)

    unsub()
    focusManager.destroy()
  })

  it('does not refetch fresh queries on focus', async () => {
    const mockDoc = createMockDocument('visible')
    globalThis.document = mockDoc as any

    const focusManager = new FocusManager()
    const fn = vi.fn().mockResolvedValue({ id: '1' })
    const deps = createDeps({
      defaultRefetchOnWindowFocus: true,
      defaultStaleTime: 60_000,
      focusManager,
    })

    const query = createQuery({ key: '/users', fn }, deps)

    const unsub = query.subscribe(vi.fn())
    await query()
    expect(fn).toHaveBeenCalledTimes(1)

    // Simulate focus
    mockDoc.visibilityState = 'hidden'
    mockDoc.dispatchEvent(new Event('visibilitychange'))

    mockDoc.visibilityState = 'visible'
    mockDoc.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)

    // Should NOT refetch because data is still fresh
    expect(fn).toHaveBeenCalledTimes(1)

    unsub()
    focusManager.destroy()
  })

  it('does not refetch when there are no subscribers', async () => {
    const mockDoc = createMockDocument('visible')
    globalThis.document = mockDoc as any

    const focusManager = new FocusManager()
    const fn = vi.fn().mockResolvedValue({ id: '1' })
    const deps = createDeps({
      defaultRefetchOnWindowFocus: true,
      defaultStaleTime: 0,
      focusManager,
    })

    const query = createQuery({ key: '/users', fn }, deps)

    const unsub = query.subscribe(vi.fn())
    await query()
    expect(fn).toHaveBeenCalledTimes(1)

    // Advance past staleTime=0 so data becomes stale
    await vi.advanceTimersByTimeAsync(1)

    // Unsubscribe first
    unsub()

    // Simulate focus
    mockDoc.visibilityState = 'hidden'
    mockDoc.dispatchEvent(new Event('visibilitychange'))

    mockDoc.visibilityState = 'visible'
    mockDoc.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)

    // Should NOT refetch — no subscribers
    expect(fn).toHaveBeenCalledTimes(1)

    focusManager.destroy()
  })

  it('per-query refetchOnWindowFocus overrides global default', async () => {
    const mockDoc = createMockDocument('visible')
    globalThis.document = mockDoc as any

    const focusManager = new FocusManager()
    const fn = vi.fn().mockResolvedValue({ id: '1' })
    const deps = createDeps({
      defaultRefetchOnWindowFocus: false,
      defaultStaleTime: 0,
      focusManager,
    })

    const query = createQuery({
      key: '/users',
      fn,
      refetchOnWindowFocus: true,
    }, deps)

    const unsub = query.subscribe(vi.fn())
    await query()
    expect(fn).toHaveBeenCalledTimes(1)

    // Advance past staleTime=0 so data becomes stale
    await vi.advanceTimersByTimeAsync(1)

    // Simulate focus
    mockDoc.visibilityState = 'hidden'
    mockDoc.dispatchEvent(new Event('visibilitychange'))

    mockDoc.visibilityState = 'visible'
    mockDoc.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)

    expect(fn).toHaveBeenCalledTimes(2)

    unsub()
    focusManager.destroy()
  })
})
