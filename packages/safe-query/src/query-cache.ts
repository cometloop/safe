import type { CacheEntry, SearchParams } from './types'

export class QueryCache {
  private cache = new Map<string, CacheEntry<unknown>>()

  private defaultStaleTime: number
  private defaultGcTime: number

  constructor(defaultStaleTime = 0, defaultGcTime = 5 * 60_000) {
    this.defaultStaleTime = defaultStaleTime
    this.defaultGcTime = defaultGcTime
  }

  buildKey(
    path: string,
    params?: Record<string, string>,
    searchParams?: SearchParams
  ): string {
    let key = path
    if (params) {
      const sorted = Object.entries(params).sort(([a], [b]) =>
        a.localeCompare(b)
      )
      key += `?${sorted.map(([k, v]) => `${k}=${v}`).join('&')}`
    }
    if (searchParams) {
      const sorted = Object.entries(searchParams).sort(([a], [b]) =>
        a.localeCompare(b)
      )
      const parts: string[] = []
      for (const [k, v] of sorted) {
        if (Array.isArray(v)) {
          for (const item of v) {
            parts.push(`${k}=${String(item)}`)
          }
        } else {
          parts.push(`${k}=${String(v)}`)
        }
      }
      if (parts.length > 0) {
        key += `${params ? '&' : '?'}~${parts.join('&')}`
      }
    }
    return key
  }

  get(key: string): CacheEntry<unknown> | undefined {
    return this.cache.get(key)
  }

  getOrCreate(
    key: string,
    staleTime?: number,
    gcTime?: number
  ): CacheEntry<unknown> {
    let entry = this.cache.get(key)
    if (!entry) {
      entry = {
        data: undefined,
        normalizedData: undefined,
        error: null,
        dataUpdatedAt: null,
        staleTime: staleTime ?? this.defaultStaleTime,
        gcTime: gcTime ?? this.defaultGcTime,
        gcTimer: null,
        subscriberCount: 0,
        generation: 0,
        inflightPromise: null,
        entityKeys: new Set(),
      }
      this.cache.set(key, entry)
    }
    return entry
  }

  isStale(entry: CacheEntry<unknown>): boolean {
    if (entry.dataUpdatedAt === null) return true
    return Date.now() - entry.dataUpdatedAt > entry.staleTime
  }

  setData(
    key: string,
    data: unknown,
    normalizedData: unknown,
    entityKeys: Set<string>
  ): void {
    const entry = this.getOrCreate(key)
    entry.data = data
    entry.normalizedData = normalizedData
    entry.error = null
    entry.dataUpdatedAt = Date.now()
    entry.entityKeys = entityKeys
  }

  setError(key: string, error: unknown): void {
    const entry = this.getOrCreate(key)
    entry.error = error
  }

  invalidate(key: string): void {
    const entry = this.cache.get(key)
    if (entry) {
      entry.dataUpdatedAt = null
    }
  }

  addSubscriber(key: string): void {
    const entry = this.cache.get(key)
    if (entry) {
      entry.subscriberCount++
      if (entry.gcTimer !== null) {
        clearTimeout(entry.gcTimer)
        entry.gcTimer = null
      }
    }
  }

  removeSubscriber(key: string): void {
    const entry = this.cache.get(key)
    if (entry) {
      entry.subscriberCount--
      if (entry.subscriberCount <= 0) {
        entry.subscriberCount = 0
        this.scheduleGc(key, entry)
      }
    }
  }

  private scheduleGc(key: string, entry: CacheEntry<unknown>): void {
    if (entry.gcTimer !== null) {
      clearTimeout(entry.gcTimer)
    }
    entry.gcTimer = setTimeout(() => {
      // Double check no subscribers were added
      if (entry.subscriberCount === 0) {
        this.cache.delete(key)
      }
      entry.gcTimer = null
    }, entry.gcTime)
  }

  delete(key: string): void {
    const entry = this.cache.get(key)
    if (entry) {
      if (entry.gcTimer !== null) {
        clearTimeout(entry.gcTimer)
      }
      this.cache.delete(key)
    }
  }

  clear(): void {
    for (const [key, entry] of this.cache) {
      if (entry.gcTimer !== null) {
        clearTimeout(entry.gcTimer)
      }
      this.cache.delete(key)
    }
  }

  keys(): IterableIterator<string> {
    return this.cache.keys()
  }
}
