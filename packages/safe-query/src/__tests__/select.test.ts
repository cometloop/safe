import { describe, it, expect, vi, afterEach } from 'vitest'
import { createSafe } from '@cometloop/safe'
import { createQuery } from '../query'
import { QueryCache } from '../query-cache'
import { EntityStore } from '../entity-store'
import { Notifier } from '../notifier'
import { FocusManager } from '../focus-manager'
import { safeQuery } from '../client'

type User = { id: string; name: string; email: string }

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

describe('select / transform', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('select transforms data in subscriber callbacks', async () => {
    const users: User[] = [
      { id: '1', name: 'Alice', email: 'alice@test.com' },
      { id: '2', name: 'Bob', email: 'bob@test.com' },
    ]

    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve(users),
    }, deps)

    await query()

    const states: any[] = []
    const unsub = query.subscribe(
      (state) => { states.push({ ...state }) },
      { select: (data: User[]) => data.map(u => u.name) },
    )

    // Initial notification should have transformed data
    expect(states[0].data).toEqual(['Alice', 'Bob'])
    expect(states[0].status).toBe('success')

    unsub()
  })

  it('select returns IDs from a list', async () => {
    const users: User[] = [
      { id: '1', name: 'Alice', email: 'alice@test.com' },
      { id: '2', name: 'Bob', email: 'bob@test.com' },
    ]

    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve(users),
    }, deps)

    await query()

    const states: any[] = []
    const unsub = query.subscribe(
      (state) => { states.push({ ...state }) },
      { select: (data: User[]) => data.map(u => u.id) },
    )

    expect(states[0].data).toEqual(['1', '2'])

    unsub()
  })

  it('select does not affect the cache', async () => {
    const users: User[] = [
      { id: '1', name: 'Alice', email: 'alice@test.com' },
    ]

    const deps = createDeps({ defaultStaleTime: 60000 })
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve(users),
      staleTime: 60000,
    }, deps)

    await query()

    // Subscriber with select
    const selectStates: any[] = []
    const unsub1 = query.subscribe(
      (state) => { selectStates.push({ ...state }) },
      { select: (data: User[]) => data.length },
    )

    // Subscriber without select
    const rawStates: any[] = []
    const unsub2 = query.subscribe(
      (state) => { rawStates.push({ ...state }) },
    )

    // Select subscriber sees count
    expect(selectStates[0].data).toBe(1)
    // Raw subscriber sees full data
    expect(rawStates[0].data).toEqual(users)

    unsub1()
    unsub2()
  })

  it('select receives undefined when no data', async () => {
    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve([] as User[]),
    }, deps)

    const states: any[] = []
    const unsub = query.subscribe(
      (state) => { states.push({ ...state }) },
      { select: (data: User[]) => data.map(u => u.name) },
    )

    // Before fetch, data is undefined — select should not be called
    expect(states[0].data).toBeUndefined()
    expect(states[0].status).toBe('idle')

    unsub()
  })

  it('select is called on each notification with latest data', async () => {
    let callCount = 0
    const deps = createDeps()
    const fn = vi.fn().mockImplementation(() => {
      callCount++
      return Promise.resolve([{ id: String(callCount), name: `User ${callCount}`, email: `u${callCount}@test.com` }])
    })

    const query = createQuery({
      key: '/users',
      fn,
    }, deps)

    const states: any[] = []
    const unsub = query.subscribe(
      (state) => { states.push({ ...state }) },
      { select: (data: User[]) => data.map(u => u.name) },
    )

    await query()

    const afterFirst = states.filter(s => s.status === 'success')
    expect(afterFirst[afterFirst.length - 1].data).toEqual(['User 1'])

    await query.refetch()

    const afterSecond = states.filter(s => s.status === 'success')
    expect(afterSecond[afterSecond.length - 1].data).toEqual(['User 2'])

    unsub()
  })

  it('different subscribers can have different select functions', async () => {
    const users: User[] = [
      { id: '1', name: 'Alice', email: 'alice@test.com' },
      { id: '2', name: 'Bob', email: 'bob@test.com' },
    ]

    const deps = createDeps()
    const query = createQuery({
      key: '/users',
      fn: () => Promise.resolve(users),
    }, deps)

    await query()

    const nameStates: any[] = []
    const emailStates: any[] = []
    const countStates: any[] = []

    const unsub1 = query.subscribe(
      (state) => { nameStates.push({ ...state }) },
      { select: (data: User[]) => data.map(u => u.name) },
    )
    const unsub2 = query.subscribe(
      (state) => { emailStates.push({ ...state }) },
      { select: (data: User[]) => data.map(u => u.email) },
    )
    const unsub3 = query.subscribe(
      (state) => { countStates.push({ ...state }) },
      { select: (data: User[]) => data.length },
    )

    expect(nameStates[0].data).toEqual(['Alice', 'Bob'])
    expect(emailStates[0].data).toEqual(['alice@test.com', 'bob@test.com'])
    expect(countStates[0].data).toBe(2)

    unsub1()
    unsub2()
    unsub3()
  })

  it('select works with client-level query', async () => {
    const safe = createSafe({
      parseError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
      defaultError: 'Unknown error',
    })
    const api = safeQuery({ safe })

    const getUsers = api.query({
      key: '/users',
      fn: (): Promise<User[]> => Promise.resolve([
        { id: '1', name: 'Alice', email: 'a@test.com' },
      ]),
    })

    await getUsers()

    const states: any[] = []
    const unsub = getUsers.subscribe(
      (state) => { states.push({ ...state }) },
      { select: (data: User[]) => data.map(u => u.id) } as any,
    )

    expect(states[0].data).toEqual(['1'])

    unsub()
    api.destroy()
  })
})
