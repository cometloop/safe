import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryCache } from '../query-cache'

describe('QueryCache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('buildKey', () => {
    it('returns path when no params', () => {
      const cache = new QueryCache()
      expect(cache.buildKey('/users')).toBe('/users')
    })

    it('builds key with sorted params', () => {
      const cache = new QueryCache()
      expect(cache.buildKey('/users/:id', { id: '123' })).toBe(
        '/users/:id?id=123'
      )
    })

    it('sorts params alphabetically', () => {
      const cache = new QueryCache()
      expect(
        cache.buildKey('/search', { z: '1', a: '2' })
      ).toBe('/search?a=2&z=1')
    })

    it('includes search params in key', () => {
      const cache = new QueryCache()
      expect(
        cache.buildKey('/users', undefined, { search: 'foo', page: 2 })
      ).toBe('/users?~page=2&search=foo')
    })

    it('includes both path params and search params in key', () => {
      const cache = new QueryCache()
      expect(
        cache.buildKey('/users/:id', { id: '123' }, { page: 1 })
      ).toBe('/users/:id?id=123&~page=1')
    })

    it('produces different keys for different search params', () => {
      const cache = new QueryCache()
      const key1 = cache.buildKey('/users', undefined, { page: 1 })
      const key2 = cache.buildKey('/users', undefined, { page: 2 })
      expect(key1).not.toBe(key2)
    })

    it('handles array search params in key', () => {
      const cache = new QueryCache()
      expect(
        cache.buildKey('/users', undefined, { tag: ['a', 'b'] })
      ).toBe('/users?~tag=a&tag=b')
    })

    it('handles empty search params', () => {
      const cache = new QueryCache()
      expect(cache.buildKey('/users', undefined, {})).toBe('/users')
    })
  })

  describe('getOrCreate', () => {
    it('creates a new entry with defaults', () => {
      const cache = new QueryCache(1000, 60000)
      const entry = cache.getOrCreate('/users')

      expect(entry.data).toBeUndefined()
      expect(entry.normalizedData).toBeUndefined()
      expect(entry.error).toBeNull()
      expect(entry.dataUpdatedAt).toBeNull()
      expect(entry.staleTime).toBe(1000)
      expect(entry.gcTime).toBe(60000)
      expect(entry.subscriberCount).toBe(0)
      expect(entry.generation).toBe(0)
      expect(entry.inflightPromise).toBeNull()
    })

    it('returns existing entry', () => {
      const cache = new QueryCache()
      const entry1 = cache.getOrCreate('/users')
      entry1.data = 'test'
      const entry2 = cache.getOrCreate('/users')
      expect(entry2.data).toBe('test')
      expect(entry1).toBe(entry2)
    })

    it('overrides staleTime and gcTime per entry', () => {
      const cache = new QueryCache(0, 5000)
      const entry = cache.getOrCreate('/users', 10000, 30000)
      expect(entry.staleTime).toBe(10000)
      expect(entry.gcTime).toBe(30000)
    })
  })

  describe('isStale', () => {
    it('returns true when dataUpdatedAt is null', () => {
      const cache = new QueryCache()
      const entry = cache.getOrCreate('/users')
      expect(cache.isStale(entry)).toBe(true)
    })

    it('returns false when data is fresh', () => {
      const cache = new QueryCache()
      const entry = cache.getOrCreate('/users', 10000)
      entry.dataUpdatedAt = Date.now()
      expect(cache.isStale(entry)).toBe(false)
    })

    it('returns true after staleTime has passed', () => {
      const cache = new QueryCache()
      const entry = cache.getOrCreate('/users', 1000)
      entry.dataUpdatedAt = Date.now()
      vi.advanceTimersByTime(1001)
      expect(cache.isStale(entry)).toBe(true)
    })

    it('returns true immediately with staleTime 0', () => {
      const cache = new QueryCache()
      const entry = cache.getOrCreate('/users', 0)
      entry.dataUpdatedAt = Date.now()
      vi.advanceTimersByTime(1)
      expect(cache.isStale(entry)).toBe(true)
    })
  })

  describe('setData', () => {
    it('sets data and clears error', () => {
      const cache = new QueryCache()
      const entry = cache.getOrCreate('/users')
      entry.error = new Error('old error')

      cache.setData('/users', [{ id: 1 }], [{ __ref: 'user:1' }], new Set(['user:1']))

      expect(entry.data).toEqual([{ id: 1 }])
      expect(entry.normalizedData).toEqual([{ __ref: 'user:1' }])
      expect(entry.error).toBeNull()
      expect(entry.dataUpdatedAt).toBeGreaterThan(0)
      expect(entry.entityKeys).toEqual(new Set(['user:1']))
    })
  })

  describe('setError', () => {
    it('sets error on entry', () => {
      const cache = new QueryCache()
      cache.getOrCreate('/users')
      const error = new Error('test error')
      cache.setError('/users', error)
      expect(cache.get('/users')?.error).toBe(error)
    })
  })

  describe('invalidate', () => {
    it('sets dataUpdatedAt to null', () => {
      const cache = new QueryCache()
      cache.setData('/users', [], [], new Set())
      cache.invalidate('/users')
      expect(cache.get('/users')?.dataUpdatedAt).toBeNull()
    })

    it('does nothing for missing key', () => {
      const cache = new QueryCache()
      cache.invalidate('/missing')
      expect(cache.get('/missing')).toBeUndefined()
    })
  })

  describe('subscriber management', () => {
    it('increments subscriber count', () => {
      const cache = new QueryCache()
      cache.getOrCreate('/users')
      cache.addSubscriber('/users')
      expect(cache.get('/users')?.subscriberCount).toBe(1)
    })

    it('decrements subscriber count', () => {
      const cache = new QueryCache()
      cache.getOrCreate('/users')
      cache.addSubscriber('/users')
      cache.removeSubscriber('/users')
      expect(cache.get('/users')?.subscriberCount).toBe(0)
    })

    it('schedules GC after last subscriber removed', () => {
      const cache = new QueryCache(0, 1000)
      cache.getOrCreate('/users', 0, 1000)
      cache.addSubscriber('/users')
      cache.removeSubscriber('/users')

      // Entry should still exist
      expect(cache.get('/users')).toBeDefined()

      // After gcTime, entry should be deleted
      vi.advanceTimersByTime(1001)
      expect(cache.get('/users')).toBeUndefined()
    })

    it('cancels GC when subscriber re-added', () => {
      const cache = new QueryCache(0, 1000)
      cache.getOrCreate('/users', 0, 1000)
      cache.addSubscriber('/users')
      cache.removeSubscriber('/users')

      // Re-subscribe before GC fires
      cache.addSubscriber('/users')

      vi.advanceTimersByTime(1001)
      // Entry should still exist
      expect(cache.get('/users')).toBeDefined()
    })

    it('never goes below 0 subscriber count', () => {
      const cache = new QueryCache()
      cache.getOrCreate('/users')
      cache.removeSubscriber('/users')
      expect(cache.get('/users')?.subscriberCount).toBe(0)
    })
  })

  describe('delete', () => {
    it('removes entry and clears GC timer', () => {
      const cache = new QueryCache()
      cache.getOrCreate('/users')
      cache.delete('/users')
      expect(cache.get('/users')).toBeUndefined()
    })

    it('clears pending GC timer on delete', () => {
      const cache = new QueryCache(0, 1000)
      cache.getOrCreate('/users', 0, 1000)
      cache.addSubscriber('/users')
      cache.removeSubscriber('/users') // schedules GC
      cache.delete('/users')
      expect(cache.get('/users')).toBeUndefined()
    })

    it('handles deleting non-existent key', () => {
      const cache = new QueryCache()
      cache.delete('/missing')
      expect(cache.get('/missing')).toBeUndefined()
    })
  })

  describe('clear', () => {
    it('removes all entries', () => {
      const cache = new QueryCache()
      cache.getOrCreate('/users')
      cache.getOrCreate('/posts')
      cache.clear()
      expect(cache.get('/users')).toBeUndefined()
      expect(cache.get('/posts')).toBeUndefined()
    })

    it('clears GC timers on clear', () => {
      const cache = new QueryCache(0, 1000)
      cache.getOrCreate('/users', 0, 1000)
      cache.getOrCreate('/posts', 0, 1000)
      cache.addSubscriber('/users')
      cache.removeSubscriber('/users') // schedules GC
      cache.clear()
      expect(cache.get('/users')).toBeUndefined()
      expect(cache.get('/posts')).toBeUndefined()
    })
  })

  describe('GC edge cases', () => {
    it('does not delete entry if subscriber added during GC window', () => {
      const cache = new QueryCache(0, 1000)
      cache.getOrCreate('/users', 0, 1000)
      cache.addSubscriber('/users')
      cache.removeSubscriber('/users') // schedules GC

      // Add subscriber during GC window
      cache.addSubscriber('/users')

      vi.advanceTimersByTime(1001)
      // Should not be deleted because subscriberCount > 0
      expect(cache.get('/users')).toBeDefined()
      expect(cache.get('/users')?.subscriberCount).toBe(1)
    })

    it('reschedules GC when subscriber removed again after re-add', () => {
      const cache = new QueryCache(0, 500)
      cache.getOrCreate('/users', 0, 500)
      cache.addSubscriber('/users')
      cache.removeSubscriber('/users') // schedules GC at t=500

      vi.advanceTimersByTime(250) // at t=250

      cache.addSubscriber('/users') // cancels GC
      cache.removeSubscriber('/users') // reschedules GC at t=750

      vi.advanceTimersByTime(250) // at t=500 - old GC would fire, but was cancelled
      expect(cache.get('/users')).toBeDefined()

      vi.advanceTimersByTime(250) // at t=750 - new GC fires
      expect(cache.get('/users')).toBeUndefined()
    })
  })

  describe('onEvict callback', () => {
    it('calls onEvict when GC removes an entry', () => {
      const onEvict = vi.fn()
      const cache = new QueryCache(0, 500, onEvict)
      cache.getOrCreate('/users', 0, 500)
      cache.addSubscriber('/users')
      cache.removeSubscriber('/users')

      vi.advanceTimersByTime(501)

      expect(onEvict).toHaveBeenCalledOnce()
      expect(onEvict).toHaveBeenCalledWith('/users')
    })

    it('calls onEvict when entry is explicitly deleted', () => {
      const onEvict = vi.fn()
      const cache = new QueryCache(0, 5000, onEvict)
      cache.getOrCreate('/users')

      cache.delete('/users')

      expect(onEvict).toHaveBeenCalledOnce()
      expect(onEvict).toHaveBeenCalledWith('/users')
    })

    it('does not call onEvict when deleting non-existent key', () => {
      const onEvict = vi.fn()
      const cache = new QueryCache(0, 5000, onEvict)

      cache.delete('/missing')

      expect(onEvict).not.toHaveBeenCalled()
    })

    it('does not call onEvict when GC is cancelled by re-subscribe', () => {
      const onEvict = vi.fn()
      const cache = new QueryCache(0, 500, onEvict)
      cache.getOrCreate('/users', 0, 500)
      cache.addSubscriber('/users')
      cache.removeSubscriber('/users')

      cache.addSubscriber('/users') // cancel GC

      vi.advanceTimersByTime(501)

      expect(onEvict).not.toHaveBeenCalled()
    })
  })

  describe('cancelInflight', () => {
    it('aborts the abort controller', () => {
      const cache = new QueryCache()
      const entry = cache.getOrCreate('/users')
      const controller = new AbortController()
      entry.abortController = controller

      cache.cancelInflight('/users')

      expect(controller.signal.aborted).toBe(true)
      expect(entry.abortController).toBeNull()
    })

    it('increments generation to discard pending callbacks', () => {
      const cache = new QueryCache()
      const entry = cache.getOrCreate('/users')
      const initialGen = entry.generation

      cache.cancelInflight('/users')

      expect(entry.generation).toBe(initialGen + 1)
    })

    it('clears inflight promise', () => {
      const cache = new QueryCache()
      const entry = cache.getOrCreate('/users')
      entry.inflightPromise = Promise.resolve([null, null]) as any

      cache.cancelInflight('/users')

      expect(entry.inflightPromise).toBeNull()
    })

    it('is a no-op for missing key', () => {
      const cache = new QueryCache()
      expect(() => cache.cancelInflight('/missing')).not.toThrow()
    })

    it('handles entry with no abort controller', () => {
      const cache = new QueryCache()
      cache.getOrCreate('/users')

      expect(() => cache.cancelInflight('/users')).not.toThrow()
    })
  })

  describe('invalidate with cancelInflight', () => {
    it('aborts inflight request on invalidate', () => {
      const cache = new QueryCache()
      const entry = cache.getOrCreate('/users')
      const controller = new AbortController()
      entry.abortController = controller
      entry.inflightPromise = Promise.resolve([null, null]) as any
      cache.setData('/users', [], [], new Set())

      cache.invalidate('/users')

      expect(controller.signal.aborted).toBe(true)
      expect(entry.inflightPromise).toBeNull()
      expect(entry.dataUpdatedAt).toBeNull()
    })
  })

  describe('delete with cancelInflight', () => {
    it('aborts inflight request on delete', () => {
      const cache = new QueryCache()
      const entry = cache.getOrCreate('/users')
      const controller = new AbortController()
      entry.abortController = controller

      cache.delete('/users')

      expect(controller.signal.aborted).toBe(true)
    })
  })

  describe('clear with abort', () => {
    it('aborts all controllers on clear', () => {
      const cache = new QueryCache()
      const entry1 = cache.getOrCreate('/users')
      const entry2 = cache.getOrCreate('/posts')
      const c1 = new AbortController()
      const c2 = new AbortController()
      entry1.abortController = c1
      entry2.abortController = c2

      cache.clear()

      expect(c1.signal.aborted).toBe(true)
      expect(c2.signal.aborted).toBe(true)
    })
  })

  describe('destroy', () => {
    it('sets disposed flag and clears cache', () => {
      const cache = new QueryCache()
      cache.getOrCreate('/users')

      cache.destroy()

      expect(cache.isDisposed()).toBe(true)
      expect(cache.get('/users')).toBeUndefined()
    })

    it('aborts all controllers on destroy', () => {
      const cache = new QueryCache()
      const entry = cache.getOrCreate('/users')
      const controller = new AbortController()
      entry.abortController = controller

      cache.destroy()

      expect(controller.signal.aborted).toBe(true)
    })

    it('GC timer does not evict after destroy', () => {
      const onEvict = vi.fn()
      const cache = new QueryCache(0, 500, onEvict)
      cache.getOrCreate('/users', 0, 500)
      cache.addSubscriber('/users')
      cache.removeSubscriber('/users') // schedules GC

      cache.destroy()

      vi.advanceTimersByTime(1000)

      // onEvict should not be called by the GC timer after destroy
      // (it was called during destroy's clear())
      expect(onEvict).not.toHaveBeenCalled()
    })
  })

  describe('GC with disposed guard', () => {
    it('GC timer is a no-op after destroy', () => {
      const onEvict = vi.fn()
      const cache = new QueryCache(0, 500, onEvict)

      // Create entry, add and remove subscriber to schedule GC
      cache.getOrCreate('/late', 0, 500)
      cache.addSubscriber('/late')
      cache.removeSubscriber('/late')

      // Destroy before GC fires
      cache.destroy()

      // Advance past GC time
      vi.advanceTimersByTime(1000)

      // GC should not call onEvict because disposed
      expect(onEvict).not.toHaveBeenCalled()
    })
  })

  describe('getOrCreate initializes abortController', () => {
    it('initializes abortController as null', () => {
      const cache = new QueryCache()
      const entry = cache.getOrCreate('/users')
      expect(entry.abortController).toBeNull()
    })
  })

  describe('keys', () => {
    it('returns all cache keys', () => {
      const cache = new QueryCache()
      cache.getOrCreate('/users')
      cache.getOrCreate('/posts')
      expect([...cache.keys()]).toEqual(['/users', '/posts'])
    })
  })
})
