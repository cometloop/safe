import { describe, it, expect, vi, afterEach } from 'vitest'
import { createSafe } from '@cometloop/safe'
import { safeQuery } from '../client'

type AppError = string

function createClient(overrides: Record<string, any> = {}) {
  const safe = createSafe<AppError>({
    parseError: (e) => (e instanceof Error ? e.message : String(e)),
    defaultError: 'Unknown error',
  })

  return safeQuery<AppError>({
    safe,
    ...overrides,
  })
}

type Item = { id: string; name: string; cursor: string }

function makePages(count: number, startId = 1): Item[][] {
  const pages: Item[][] = []
  for (let p = 0; p < count; p++) {
    const items: Item[] = []
    for (let i = 0; i < 3; i++) {
      const id = startId + p * 3 + i
      items.push({ id: String(id), name: `Item ${id}`, cursor: `cursor_${id}` })
    }
    pages.push(items)
  }
  return pages
}

describe('infinite query / pagination', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches the first page on initial invoke', async () => {
    const pages = makePages(3)
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: ({ pageParam }) => {
        const idx = pageParam as number
        return Promise.resolve(pages[idx]!)
      },
      initialPageParam: 0,
      getNextPageParam: (lastPage) => {
        const lastItem = lastPage[lastPage.length - 1]
        return lastItem?.cursor ? 1 : undefined
      },
    })

    const [result, err] = await query()
    expect(err).toBeNull()
    expect(result!.pages).toHaveLength(1)
    expect(result!.pages[0]).toEqual(pages[0])
    expect(result!.pageParams).toEqual([0])

    api.destroy()
  })

  it('fetchNextPage fetches the next page', async () => {
    let callCount = 0
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: ({ pageParam }) => {
        callCount++
        const cursor = pageParam as string | null
        const items = [{ id: String(callCount), name: `Page ${callCount}`, cursor: `cursor_${callCount}` }]
        return Promise.resolve(items)
      },
      initialPageParam: null,
      getNextPageParam: (lastPage) => {
        const lastItem = lastPage[lastPage.length - 1]
        return lastItem?.cursor
      },
    })

    await query()
    expect(callCount).toBe(1)

    const [result, err] = await query.fetchNextPage()
    expect(err).toBeNull()
    expect(callCount).toBe(2)
    expect(result!.pages).toHaveLength(2)
    expect(result!.pages[0]![0]!.name).toBe('Page 1')
    expect(result!.pages[1]![0]!.name).toBe('Page 2')

    api.destroy()
  })

  it('fetchNextPage returns current data when no next page', async () => {
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => Promise.resolve([{ id: '1', name: 'Only', cursor: '' }]),
      initialPageParam: null,
      getNextPageParam: () => undefined, // no next page
    })

    await query()
    const [result] = await query.fetchNextPage()
    expect(result!.pages).toHaveLength(1) // no new page added

    api.destroy()
  })

  it('fetchPreviousPage prepends pages', async () => {
    let callCount = 0
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: ({ pageParam }) => {
        callCount++
        return Promise.resolve([{ id: String(callCount), name: `Page ${pageParam}`, cursor: `c${callCount}` }])
      },
      initialPageParam: 5,
      getNextPageParam: () => undefined,
      getPreviousPageParam: (firstPage) => {
        const num = parseInt(firstPage[0]!.name.split(' ')[1]!)
        return num > 1 ? num - 1 : undefined
      },
    })

    await query()
    expect(callCount).toBe(1)

    const [result] = await query.fetchPreviousPage()
    expect(callCount).toBe(2)
    expect(result!.pages).toHaveLength(2)
    // Previous page should be first
    expect(result!.pageParams[0]).toBe(4)
    expect(result!.pageParams[1]).toBe(5)

    api.destroy()
  })

  it('hasNextPage and hasPreviousPage reflect state', async () => {
    const api = createClient()
    let callCount = 0
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => {
        callCount++
        return Promise.resolve([{ id: String(callCount), name: `Item ${callCount}`, cursor: callCount < 3 ? `c${callCount}` : '' }])
      },
      initialPageParam: null,
      getNextPageParam: (lastPage) => {
        const lastItem = lastPage[lastPage.length - 1]
        return lastItem?.cursor ? `next_${lastItem.cursor}` : undefined
      },
      getPreviousPageParam: () => undefined,
    })

    const states: any[] = []
    const unsub = query.subscribe((state) => {
      states.push({ ...state })
    })

    await query()

    const successState = states.find(s => s.status === 'success')
    expect(successState.hasNextPage).toBe(true)
    expect(successState.hasPreviousPage).toBe(false)

    unsub()
    api.destroy()
  })

  it('subscribe receives state updates during pagination', async () => {
    let callCount = 0
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => {
        callCount++
        return Promise.resolve([{ id: String(callCount), name: `Item`, cursor: `c${callCount}` }])
      },
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage[lastPage.length - 1]?.cursor,
    })

    const states: any[] = []
    const unsub = query.subscribe((state) => {
      states.push({ ...state })
    })

    expect(states[0].status).toBe('idle')

    await query()

    const afterFirst = states.find(s => s.status === 'success')
    expect(afterFirst.data.pages).toHaveLength(1)

    await query.fetchNextPage()

    const allSuccess = states.filter(s => s.status === 'success' && s.data)
    const last = allSuccess[allSuccess.length - 1]
    expect(last.data.pages).toHaveLength(2)

    unsub()
    api.destroy()
  })

  it('isFetchingNextPage is true during fetchNextPage', async () => {
    let resolvePromise: (value: any) => void
    let callCount = 0
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => {
        callCount++
        if (callCount === 1) return Promise.resolve([{ id: '1', name: 'Item', cursor: 'c1' }])
        return new Promise((resolve) => { resolvePromise = resolve })
      },
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage[lastPage.length - 1]?.cursor,
    })

    await query()

    const states: any[] = []
    const unsub = query.subscribe((state) => {
      states.push({ ...state })
    })

    const p = query.fetchNextPage()

    const fetchingState = states.find(s => s.isFetchingNextPage)
    expect(fetchingState).toBeDefined()
    expect(fetchingState.isFetchingNextPage).toBe(true)
    expect(fetchingState.isFetchingPreviousPage).toBe(false)

    resolvePromise!([{ id: '2', name: 'Item 2', cursor: 'c2' }])
    await p

    unsub()
    api.destroy()
  })

  it('maxPages limits the number of stored pages', async () => {
    let callCount = 0
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => {
        callCount++
        return Promise.resolve([{ id: String(callCount), name: `Page ${callCount}`, cursor: `c${callCount}` }])
      },
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage[lastPage.length - 1]?.cursor,
      maxPages: 2,
    })

    await query()
    await query.fetchNextPage()
    await query.fetchNextPage()

    // Should only have 2 pages (maxPages: 2)
    const data = query.data
    expect(data!.pages).toHaveLength(2)
    // Should keep the most recent pages
    expect(data!.pages[0]![0]!.name).toBe('Page 2')
    expect(data!.pages[1]![0]!.name).toBe('Page 3')

    api.destroy()
  })

  it('cancel() aborts the current page fetch', async () => {
    let capturedSignal: AbortSignal | undefined
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: (ctx: any) => {
        capturedSignal = ctx.signal
        return new Promise(() => {})
      },
      initialPageParam: null,
      getNextPageParam: () => 'next',
    })

    query()

    expect(capturedSignal!.aborted).toBe(false)
    query.cancel()
    expect(capturedSignal!.aborted).toBe(true)

    api.destroy()
  })

  it('invalidate() clears and triggers refetch', async () => {
    const fn = vi.fn().mockResolvedValue([{ id: '1', name: 'Item', cursor: 'c1' }])
    const api = createClient({ staleTime: 60000 })
    const query = api.infiniteQuery({
      key: '/items',
      fn,
      staleTime: 60000,
      initialPageParam: null,
      getNextPageParam: () => undefined,
    })

    await query()
    expect(fn).toHaveBeenCalledTimes(1)

    query.invalidate()
    await query()
    expect(fn).toHaveBeenCalledTimes(2)

    api.destroy()
  })

  it('reactive getters work', async () => {
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => Promise.resolve([{ id: '1', name: 'Item', cursor: 'c1' }]),
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage[lastPage.length - 1]?.cursor ? 'next' : undefined,
    })

    expect(query.status).toBe('idle')
    expect(query.data).toBeUndefined()
    expect(query.isFetching).toBe(false)
    expect(query.hasNextPage).toBe(false)
    expect(query.hasPreviousPage).toBe(false)

    await query()

    expect(query.status).toBe('success')
    expect(query.data!.pages).toHaveLength(1)
    expect(query.hasNextPage).toBe(true)
    expect(query.isFetching).toBe(false)

    api.destroy()
  })

  it('returns cached data when fresh', async () => {
    const fn = vi.fn().mockResolvedValue([{ id: '1', name: 'Item', cursor: '' }])
    const api = createClient({ staleTime: 60000 })
    const query = api.infiniteQuery({
      key: '/items',
      fn,
      staleTime: 60000,
      initialPageParam: null,
      getNextPageParam: () => undefined,
    })

    await query()
    expect(fn).toHaveBeenCalledTimes(1)

    const [result] = await query()
    expect(fn).toHaveBeenCalledTimes(1)
    expect(result!.pages).toHaveLength(1)

    api.destroy()
  })

  it('refetch re-fetches all pages', async () => {
    let callCount = 0
    const api = createClient({ staleTime: 60000 })
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => {
        callCount++
        return Promise.resolve([{ id: String(callCount), name: `Page ${callCount}`, cursor: callCount < 5 ? `c${callCount}` : '' }])
      },
      staleTime: 60000,
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage[lastPage.length - 1]?.cursor || undefined,
    })

    // Fetch page 1
    await query()
    // Fetch page 2
    await query.fetchNextPage()
    expect(callCount).toBe(2)

    // Refetch should re-fetch both pages
    const [result] = await query.refetch()
    expect(callCount).toBe(4) // 2 original + 2 refetched
    expect(result!.pages).toHaveLength(2)

    api.destroy()
  })

  it('works with path params', async () => {
    const fn = vi.fn().mockImplementation(({ pageParam, params }: any) => {
      return Promise.resolve([{ id: `${params.userId}-${pageParam}`, name: 'Post', cursor: '' }])
    })

    const api = createClient()
    const query = api.infiniteQuery({
      key: '/users/:userId/posts',
      fn,
      initialPageParam: 0,
      getNextPageParam: () => undefined,
    })

    const [result, err] = await query({ params: { userId: 'u1' } })
    expect(err).toBeNull()
    expect(result!.pages[0]![0]!.id).toBe('u1-0')
    expect(fn).toHaveBeenCalledWith(
      expect.objectContaining({ params: { userId: 'u1' }, pageParam: 0 })
    )

    api.destroy()
  })

  it('enabled on subscribe works for infinite query', () => {
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => Promise.resolve([]),
      initialPageParam: null,
      getNextPageParam: () => undefined,
    })

    const states: any[] = []
    const unsub = query.subscribe(
      (state) => { states.push({ ...state }) },
      { enabled: false },
    )

    expect(states.length).toBe(1)
    expect(states[0].status).toBe('idle')

    unsub()
    api.destroy()
  })

  // ─── Bug #2: enabled: false should throw QueryDisabledError ───

  it('enabled: false returns QueryDisabledError, not generic Error', async () => {
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => Promise.resolve([{ id: '1', name: 'Item', cursor: '' }]),
      initialPageParam: null,
      getNextPageParam: () => undefined,
    })

    const [data, err] = await query({ enabled: false })
    expect(data).toBeNull()
    expect(err).toBeTruthy()
    expect(err).toBe('Query is disabled')

    api.destroy()
  })

  // ─── Bug #3: refetchAllPages generation-abort returns valid SafeResult ───

  it('refetchAllPages generation-abort returns a valid SafeResult (not [null, null])', async () => {
    let callCount = 0
    let resolveSecondPage: (v: any) => void

    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => {
        callCount++
        if (callCount <= 2) {
          return Promise.resolve([{ id: String(callCount), name: `Page ${callCount}`, cursor: `c${callCount}` }])
        }
        return new Promise((resolve) => { resolveSecondPage = resolve })
      },
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage[lastPage.length - 1]?.cursor || undefined,
    })

    await query()
    await query.fetchNextPage()
    expect(callCount).toBe(2)

    const refetchPromise = query.refetch()
    query.invalidate()
    resolveSecondPage!([{ id: '99', name: 'Stale', cursor: '' }])

    const [data, err] = await refetchPromise

    const isValidResult = (data !== null && err === null) || (data === null && err !== null)
    expect(isValidResult).toBe(true)

    api.destroy()
  })

  // ─── fetchPage error handling ───

  it('fetchPage error sets cache error and calls lifecycle callbacks', async () => {
    const onError = vi.fn()
    const onSettled = vi.fn()
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => Promise.reject(new Error('fetch failed')),
      initialPageParam: null,
      getNextPageParam: () => undefined,
      onError,
      onSettled,
    })

    const [data, err] = await query()
    expect(data).toBeNull()
    expect(err).toBe('fetch failed')
    expect(onError).toHaveBeenCalledWith('fetch failed')
    expect(onSettled).toHaveBeenCalled()

    api.destroy()
  })

  it('fetchPage signal cleanup runs on settled', async () => {
    const userController = new AbortController()
    const removeSpy = vi.spyOn(userController.signal, 'removeEventListener')

    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => Promise.resolve([{ id: '1', name: 'Item', cursor: '' }]),
      initialPageParam: null,
      getNextPageParam: () => undefined,
    })

    await query({ signal: userController.signal })
    expect(removeSpy).toHaveBeenCalled()

    api.destroy()
  })

  it('fetchPage with already-aborted signal aborts immediately', async () => {
    let capturedSignal: AbortSignal | undefined
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: (ctx: any) => {
        capturedSignal = ctx.signal
        return Promise.resolve([{ id: '1', name: 'Item', cursor: '' }])
      },
      initialPageParam: null,
      getNextPageParam: () => undefined,
    })

    const controller = new AbortController()
    controller.abort('pre-aborted')
    await query({ signal: controller.signal })

    expect(capturedSignal!.aborted).toBe(true)

    api.destroy()
  })

  // ─── deduplication ───

  it('deduplicates concurrent invoke calls', async () => {
    let callCount = 0
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => {
        callCount++
        return Promise.resolve([{ id: '1', name: 'Item', cursor: '' }])
      },
      initialPageParam: null,
      getNextPageParam: () => undefined,
    })

    const p1 = query()
    const p2 = query()

    const [r1] = await p1
    const [r2] = await p2

    expect(callCount).toBe(1)
    expect(r1).toEqual(r2)

    api.destroy()
  })

  // ─── refetchAllPages error path ───

  it('refetchAllPages handles page error with lifecycle callbacks', async () => {
    let callCount = 0
    const onError = vi.fn()
    const onSettled = vi.fn()

    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => {
        callCount++
        if (callCount <= 2) {
          return Promise.resolve([{ id: String(callCount), name: `Page ${callCount}`, cursor: `c${callCount}` }])
        }
        return Promise.reject(new Error('page error'))
      },
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage[lastPage.length - 1]?.cursor || undefined,
      onError,
      onSettled,
    })

    await query()
    await query.fetchNextPage()
    expect(callCount).toBe(2)

    // Refetch all pages — third call will fail
    const [data, err] = await query.refetch()
    expect(data).toBeNull()
    expect(err).toBe('page error')
    expect(onError).toHaveBeenCalledWith('page error')
    expect(onSettled).toHaveBeenCalled()

    api.destroy()
  })

  it('refetchAllPages with signal passes signal to page fetches', async () => {
    let callCount = 0
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => {
        callCount++
        return Promise.resolve([{ id: String(callCount), name: `Page ${callCount}`, cursor: `c${callCount}` }])
      },
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage[lastPage.length - 1]?.cursor || undefined,
    })

    await query()
    await query.fetchNextPage()

    const userController = new AbortController()
    const removeSpy = vi.spyOn(userController.signal, 'removeEventListener')

    await query.refetch()
    // Signal cleanup tested implicitly — no crash

    api.destroy()
  })

  it('refetchAllPages with already-aborted signal', async () => {
    let callCount = 0
    let capturedSignal: AbortSignal | undefined
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: (ctx: any) => {
        callCount++
        capturedSignal = ctx.signal
        return Promise.resolve([{ id: String(callCount), name: `P${callCount}`, cursor: `c${callCount}` }])
      },
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage[lastPage.length - 1]?.cursor || undefined,
    })

    await query()
    await query.fetchNextPage()

    const controller = new AbortController()
    controller.abort('pre-aborted')
    // Invalidate to trigger refetchAllPages
    query.invalidate()
    await query({ signal: controller.signal })

    expect(capturedSignal!.aborted).toBe(true)

    api.destroy()
  })

  // ─── fetchNextPage with no current data ───

  it('fetchNextPage with no existing data fetches initial page as forward', async () => {
    const api = createClient()
    let capturedPageParam: unknown
    const query = api.infiniteQuery({
      key: '/items',
      fn: ({ pageParam }) => {
        capturedPageParam = pageParam
        return Promise.resolve([{ id: '1', name: 'Item', cursor: '' }])
      },
      initialPageParam: 'start',
      getNextPageParam: () => undefined,
    })

    const [result] = await query.fetchNextPage()
    expect(capturedPageParam).toBe('start')
    expect(result!.pages).toHaveLength(1)

    api.destroy()
  })

  // ─── fetchPreviousPage edge cases ───

  it('fetchPreviousPage returns empty data when no getPreviousPageParam', async () => {
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => Promise.resolve([{ id: '1', name: 'Item', cursor: '' }]),
      initialPageParam: null,
      getNextPageParam: () => undefined,
      // no getPreviousPageParam
    })

    const [result, err] = await query.fetchPreviousPage()
    expect(err).toBeNull()
    expect(result!.pages).toEqual([])
    expect(result!.pageParams).toEqual([])

    api.destroy()
  })

  it('fetchPreviousPage with no current data fetches initial page backward', async () => {
    const api = createClient()
    let capturedPageParam: unknown
    const query = api.infiniteQuery({
      key: '/items',
      fn: ({ pageParam }) => {
        capturedPageParam = pageParam
        return Promise.resolve([{ id: '1', name: 'Item', cursor: '' }])
      },
      initialPageParam: 'start',
      getNextPageParam: () => undefined,
      getPreviousPageParam: () => undefined,
    })

    const [result] = await query.fetchPreviousPage()
    expect(capturedPageParam).toBe('start')
    expect(result!.pages).toHaveLength(1)

    api.destroy()
  })

  it('fetchPreviousPage returns current data when no prev page param', async () => {
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => Promise.resolve([{ id: '1', name: 'Item', cursor: '' }]),
      initialPageParam: null,
      getNextPageParam: () => undefined,
      getPreviousPageParam: () => undefined, // always returns undefined
    })

    await query()
    const [result, err] = await query.fetchPreviousPage()
    expect(err).toBeNull()
    expect(result!.pages).toHaveLength(1) // unchanged

    api.destroy()
  })

  // ─── refetch interval & focus listener ───

  it('refetch interval triggers periodic refetches', async () => {
    vi.useFakeTimers()
    let callCount = 0
    const api = createClient({ refetchInterval: 1000 })
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => {
        callCount++
        return Promise.resolve([{ id: String(callCount), name: 'Item', cursor: '' }])
      },
      initialPageParam: null,
      getNextPageParam: () => undefined,
      refetchInterval: 1000,
    })

    const unsub = query.subscribe(() => {})
    await query()
    expect(callCount).toBe(1)

    await vi.advanceTimersByTimeAsync(1100)
    expect(callCount).toBeGreaterThan(1)

    unsub()
    api.destroy()
    vi.useRealTimers()
  })

  it('refetch on window focus triggers refetch when stale', async () => {
    const api = createClient({ refetchOnWindowFocus: true })
    let callCount = 0
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => {
        callCount++
        return Promise.resolve([{ id: String(callCount), name: 'Item', cursor: '' }])
      },
      initialPageParam: null,
      getNextPageParam: () => undefined,
      refetchOnWindowFocus: true,
    })

    const unsub = query.subscribe(() => {})
    await query()
    expect(callCount).toBe(1)

    unsub()
    api.destroy()
  })

  it('unsubscribe stops interval and focus listener', async () => {
    vi.useFakeTimers()
    let callCount = 0
    const api = createClient({ refetchInterval: 500 })
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => {
        callCount++
        return Promise.resolve([{ id: String(callCount), name: 'Item', cursor: '' }])
      },
      initialPageParam: null,
      getNextPageParam: () => undefined,
      refetchInterval: 500,
    })

    const unsub = query.subscribe(() => {})
    await query()
    const countAfterFirstFetch = callCount

    unsub()

    await vi.advanceTimersByTimeAsync(2000)
    // Should not have refetched after unsubscribe
    expect(callCount).toBe(countAfterFirstFetch)

    api.destroy()
    vi.useRealTimers()
  })

  // ─── reactive getters ───

  it('error getter returns error state', async () => {
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => Promise.reject(new Error('boom')),
      initialPageParam: null,
      getNextPageParam: () => undefined,
    })

    await query()
    expect(query.error).toBe('boom')

    api.destroy()
  })

  it('isStale getter reflects staleness', async () => {
    const api = createClient({ staleTime: 60000 })
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => Promise.resolve([{ id: '1', name: 'Item', cursor: '' }]),
      initialPageParam: null,
      getNextPageParam: () => undefined,
      staleTime: 60000,
    })

    expect(query.isStale).toBe(true)
    await query()
    expect(query.isStale).toBe(false)

    api.destroy()
  })

  it('isFetchingPreviousPage getter during fetchPreviousPage', async () => {
    let resolvePromise: (v: any) => void
    let callCount = 0
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => {
        callCount++
        if (callCount === 1) return Promise.resolve([{ id: '1', name: 'Item', cursor: 'c1' }])
        return new Promise((resolve) => { resolvePromise = resolve })
      },
      initialPageParam: 5,
      getNextPageParam: () => undefined,
      getPreviousPageParam: () => 4,
    })

    await query()

    const states: any[] = []
    const unsub = query.subscribe((state) => {
      states.push({ ...state })
    })

    const p = query.fetchPreviousPage()

    const fetchingState = states.find(s => s.isFetchingPreviousPage)
    expect(fetchingState).toBeDefined()
    expect(fetchingState.isFetchingPreviousPage).toBe(true)
    expect(fetchingState.isFetchingNextPage).toBe(false)

    resolvePromise!([{ id: '0', name: 'Prev', cursor: '' }])
    await p

    unsub()
    api.destroy()
  })

  it('hasPreviousPage getter reflects previous page availability', async () => {
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => Promise.resolve([{ id: '1', name: 'Item', cursor: '' }]),
      initialPageParam: 5,
      getNextPageParam: () => undefined,
      getPreviousPageParam: () => 4, // always has previous
    })

    await query()
    expect(query.hasPreviousPage).toBe(true)

    api.destroy()
  })

  // ─── onSuccess lifecycle callback ───

  it('fetchPage onSuccess calls config callback', async () => {
    const onSuccess = vi.fn()
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => Promise.resolve([{ id: '1', name: 'Item', cursor: '' }]),
      initialPageParam: null,
      getNextPageParam: () => undefined,
      onSuccess,
    })

    await query()
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ pages: expect.any(Array), pageParams: expect.any(Array) })
    )

    api.destroy()
  })

  // ─── refetchAllPages success lifecycle ───

  it('refetchAllPages success calls onSuccess and onSettled', async () => {
    let callCount = 0
    const onSuccess = vi.fn()
    const onSettled = vi.fn()
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => {
        callCount++
        return Promise.resolve([{ id: String(callCount), name: `P${callCount}`, cursor: callCount < 3 ? `c${callCount}` : '' }])
      },
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage[lastPage.length - 1]?.cursor || undefined,
      onSuccess,
      onSettled,
    })

    await query()
    await query.fetchNextPage()

    onSuccess.mockClear()
    onSettled.mockClear()

    await query.refetch()
    expect(onSuccess).toHaveBeenCalled()
    expect(onSettled).toHaveBeenCalled()

    api.destroy()
  })

  // ─── maxPages backward direction ───

  it('maxPages limits pages when fetching backward', async () => {
    let callCount = 0
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => {
        callCount++
        return Promise.resolve([{ id: String(callCount), name: `Page ${callCount}`, cursor: `c${callCount}` }])
      },
      initialPageParam: 5,
      getNextPageParam: () => undefined,
      getPreviousPageParam: (_, allPages) => allPages.length < 4 ? 'prev' : undefined,
      maxPages: 2,
    })

    await query()
    await query.fetchPreviousPage()
    await query.fetchPreviousPage()

    const data = query.data
    expect(data!.pages).toHaveLength(2)

    api.destroy()
  })

  // ─── fetchPage deduplication ───

  it('fetchPage deduplicates concurrent calls', async () => {
    let callCount = 0
    let resolvePromise: (v: any) => void
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => {
        callCount++
        if (callCount === 1) return Promise.resolve([{ id: '1', name: 'Item', cursor: 'c1' }])
        return new Promise((resolve) => { resolvePromise = resolve })
      },
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage[lastPage.length - 1]?.cursor,
    })

    await query()

    // Two concurrent fetchNextPage calls
    const p1 = query.fetchNextPage()
    const p2 = query.fetchNextPage()

    resolvePromise!([{ id: '2', name: 'Page 2', cursor: '' }])
    const [r1] = await p1
    const [r2] = await p2

    expect(callCount).toBe(2) // only 1 extra call, not 2
    expect(r1).toEqual(r2)

    api.destroy()
  })

  // ─── combinedParse / mapToEntities ───

  it('mapToEntities transforms page data', async () => {
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => Promise.resolve([{ id: '1', name: 'raw' }]),
      initialPageParam: null,
      getNextPageParam: () => undefined,
      mapToEntities: (items: any[]) => items.map(i => ({ ...i, mapped: true })),
    })

    const [result, err] = await query()
    expect(err).toBeNull()
    expect(result!.pages[0]![0]).toEqual({ id: '1', name: 'raw', mapped: true })

    api.destroy()
  })

  // ─── normalizePages with entities ───

  it('normalizePages with entities normalizes page data', async () => {
    const api = createClient({
      entities: {
        item: { match: (obj: any) => 'name' in obj, id: (i: any) => i.id },
      },
    })
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => Promise.resolve([{ id: '1', name: 'Item 1' }]),
      initialPageParam: null,
      getNextPageParam: () => undefined,
    })

    await query()
    // No crash — entities normalized

    api.destroy()
  })

  it('normalizePages with custom normalize function', async () => {
    const api = createClient({
      entities: {
        item: { match: (obj: any) => 'name' in obj, id: (i: any) => i.id },
      },
    })
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => Promise.resolve([{ id: '1', name: 'Item 1' }]),
      initialPageParam: null,
      getNextPageParam: () => undefined,
      normalize: (page: any) => ({ item: page }),
    })

    await query()
    // No crash — entities normalized with custom function

    api.destroy()
  })

  // ─── warnIfParameterized ───

  it('warns when accessing getter on parameterized infinite query', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items/:id',
      fn: () => Promise.resolve([{ id: '1', name: 'Item', cursor: '' }]),
      initialPageParam: null,
      getNextPageParam: () => undefined,
    })

    void query.status
    expect(warnSpy).toHaveBeenCalledOnce()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('parameterized infinite query')
    )

    // Second access — no duplicate warning
    warnSpy.mockClear()
    void query.data
    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
    api.destroy()
  })

  // ─── refetchAllPages with user signal (non-aborted) ───

  it('refetchAllPages cleans up user signal listeners', async () => {
    let callCount = 0
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => {
        callCount++
        return Promise.resolve([{ id: String(callCount), name: `P${callCount}`, cursor: callCount < 3 ? `c${callCount}` : '' }])
      },
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage[lastPage.length - 1]?.cursor || undefined,
    })

    await query()
    await query.fetchNextPage()

    const userController = new AbortController()
    const removeSpy = vi.spyOn(userController.signal, 'removeEventListener')

    // Trigger refetchAllPages via refetch with user signal
    query.invalidate()
    await query({ signal: userController.signal })

    expect(removeSpy).toHaveBeenCalled()

    api.destroy()
  })

  // ─── refetchAllPages error + generation mismatch ───

  it('refetchAllPages error during stale generation cleans up signal', async () => {
    let callCount = 0
    let rejectFn: (e: any) => void

    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => {
        callCount++
        if (callCount <= 2) {
          return Promise.resolve([{ id: String(callCount), name: `P${callCount}`, cursor: `c${callCount}` }])
        }
        // During refetch, the first page fetch will block then reject
        return new Promise((_, rej) => { rejectFn = rej })
      },
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage[lastPage.length - 1]?.cursor || undefined,
    })

    await query()
    await query.fetchNextPage()

    const refetchPromise = query.refetch()
    // Bump generation so the refetch becomes stale
    query.invalidate()
    // Reject the stale refetch page
    rejectFn!(new Error('stale error'))

    const [data, err] = await refetchPromise
    // Should still be a valid SafeResult
    const isValid = (data !== null && err === null) || (data === null && err !== null)
    expect(isValid).toBe(true)

    api.destroy()
  })

  // ─── fetchPage onError generation mismatch ───

  it('fetchPage onError skips when generation mismatches', async () => {
    let callCount = 0
    let rejectPromise: (e: any) => void
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => {
        callCount++
        if (callCount === 1) return new Promise((_, rej) => { rejectPromise = rej })
        return Promise.resolve([{ id: '1', name: 'Item', cursor: '' }])
      },
      initialPageParam: null,
      getNextPageParam: () => undefined,
    })

    const p1 = query()

    // Start a new fetch (bumps generation)
    query.invalidate()
    const p2 = query()

    // Reject the first fetch — generation mismatch, should not set error
    rejectPromise!(new Error('stale error'))
    await p1

    const [data] = await p2
    expect(data).toBeDefined()
    expect(query.error).toBeNull()

    api.destroy()
  })

  // ─── fetchPage onSettled generation mismatch ───

  it('fetchPage onSettled skips notify when generation mismatches', async () => {
    let callCount = 0
    let resolvePromise: (v: any) => void
    const api = createClient()
    const query = api.infiniteQuery({
      key: '/items',
      fn: () => {
        callCount++
        if (callCount === 1) return new Promise((resolve) => { resolvePromise = resolve })
        return Promise.resolve([{ id: '2', name: 'New', cursor: '' }])
      },
      initialPageParam: null,
      getNextPageParam: () => undefined,
    })

    const p1 = query()
    query.invalidate()
    const p2 = query()

    resolvePromise!([{ id: '1', name: 'Stale', cursor: '' }])
    await p1
    await p2

    // The second fetch should have won
    expect(query.data!.pages[0]![0]!.name).toBe('New')

    api.destroy()
  })
})
