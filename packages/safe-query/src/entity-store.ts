import type { EntityRef, GlobalEntityConfig } from './types'

export type EntitySnapshot = Map<string, Map<string, unknown>>

export class EntityStore {
  private entities = new Map<string, Map<string, unknown>>()
  private entityToQueries = new Map<string, Set<string>>()
  private queryToEntities = new Map<string, Set<string>>()
  private optimisticState = new Map<string, {
    baseValue: unknown | undefined
    inFlightCount: number
    hadError: boolean
  }>()
  private _version = 0
  private denormWeakCache = new WeakMap<object, { version: number; result: unknown }>()

  get version(): number {
    return this._version
  }

  private entityKey(type: string, id: string): string {
    return `${type}:${id}`
  }

  private parseEntityKey(key: string): [string, string] {
    const idx = key.indexOf(':')
    return [key.substring(0, idx), key.substring(idx + 1)]
  }

  get(type: string, id: string): unknown | undefined {
    return this.entities.get(type)?.get(id)
  }

  set(type: string, id: string, entity: unknown): void {
    let typeMap = this.entities.get(type)
    if (!typeMap) {
      typeMap = new Map()
      this.entities.set(type, typeMap)
    }
    typeMap.set(id, entity)
    this._version++
  }

  delete(type: string, id: string): void {
    const typeMap = this.entities.get(type)
    if (typeMap) {
      typeMap.delete(id)
      if (typeMap.size === 0) {
        this.entities.delete(type)
      }
      this._version++
    }
  }

  registerQueryEntities(
    queryKey: string,
    entityKeys: Set<string>
  ): Set<string> {
    // O(1) lookup of previous entity keys via reverse index
    const previousKeys = this.queryToEntities.get(queryKey)

    // Remove old mappings using the reverse index
    if (previousKeys) {
      for (const eKey of previousKeys) {
        const queries = this.entityToQueries.get(eKey)
        if (queries) {
          queries.delete(queryKey)
          if (queries.size === 0) {
            this.entityToQueries.delete(eKey)
          }
        }
      }
    }

    // Register new mappings
    for (const eKey of entityKeys) {
      let queries = this.entityToQueries.get(eKey)
      if (!queries) {
        queries = new Set()
        this.entityToQueries.set(eKey, queries)
      }
      queries.add(queryKey)
    }

    // Update the reverse index
    this.queryToEntities.set(queryKey, entityKeys)

    return entityKeys
  }

  getQueriesForEntity(type: string, id: string): Set<string> {
    const key = this.entityKey(type, id)
    return this.entityToQueries.get(key) ?? new Set()
  }

  normalize(
    data: unknown,
    extractors: GlobalEntityConfig
  ): { normalized: unknown; entityKeys: Set<string> } {
    const entityKeys = new Set<string>()
    const extractorEntries = Object.entries(extractors)

    const walk = (value: unknown): unknown => {
      if (value === null || value === undefined) return value
      if (typeof value !== 'object') return value

      if (Array.isArray(value)) {
        return value.map(walk)
      }

      const obj = value as Record<string, unknown>

      // Match-based resolution: find the first extractor whose match() returns true
      let matchedType: string | undefined
      let matchedExtractor: GlobalEntityConfig[string] | undefined
      for (const [typeName, extractor] of extractorEntries) {
        if (extractor.match(obj)) {
          matchedType = typeName
          matchedExtractor = extractor
          break
        }
      }

      if (matchedType && matchedExtractor) {
        const id = matchedExtractor.id(obj)
        const eKey = this.entityKey(matchedType, id)
        entityKeys.add(eKey)

        // Walk nested properties to normalize nested entities first
        const walked: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(obj)) {
          walked[k] = walk(v)
        }

        // Store the walked entity (with nested refs) in the entity store
        this.set(matchedType, id, walked)

        return { __ref: eKey } as EntityRef
      }

      // Not an entity, but may contain nested entities
      const result: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(obj)) {
        result[k] = walk(v)
      }
      return result
    }

    const normalized = walk(data)
    return { normalized, entityKeys }
  }

  normalizeExplicit(
    entityMap: Record<string, unknown | unknown[]>,
    extractors: GlobalEntityConfig
  ): Set<string> {
    const entityKeys = new Set<string>()
    for (const [typeName, entities] of Object.entries(entityMap)) {
      const extractor = extractors[typeName]
      if (!extractor) continue
      const items = Array.isArray(entities) ? entities : [entities]
      for (const entity of items) {
        if (entity == null || typeof entity !== 'object') continue
        const id = extractor.id(entity)
        this.set(typeName, id, entity)
        entityKeys.add(this.entityKey(typeName, id))
      }
    }
    return entityKeys
  }

  denormalize(data: unknown, visited?: Set<string>): unknown {
    if (data === null || data === undefined) return data
    if (typeof data !== 'object') return data

    if (Array.isArray(data)) {
      return data.map((item) => this.denormalize(item, visited))
    }

    const obj = data as Record<string, unknown>

    if (typeof obj.__ref === 'string') {
      const ref = obj.__ref
      const [type, id] = this.parseEntityKey(ref)
      const entity = this.get(type, id)
      if (entity === undefined) return obj // safe fallback

      const track = visited ?? new Set<string>()
      if (track.has(ref)) return obj // circular reference
      track.add(ref)

      const result = this.denormalize(entity, track)
      track.delete(ref)
      return result
    }

    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      result[k] = this.denormalize(v, visited)
    }
    return result
  }

  snapshot(): EntitySnapshot {
    const snap = new Map<string, Map<string, unknown>>()
    for (const [type, typeMap] of this.entities) {
      const clonedMap = new Map<string, unknown>()
      for (const [id, entity] of typeMap) {
        clonedMap.set(id, structuredClone(entity))
      }
      snap.set(type, clonedMap)
    }
    return snap
  }

  restore(snapshot: EntitySnapshot): void {
    this.entities.clear()
    for (const [type, typeMap] of snapshot) {
      this.entities.set(type, new Map(typeMap))
    }
    this._version++
  }

  unregisterQuery(queryKey: string): void {
    const entityKeys = this.queryToEntities.get(queryKey)
    if (entityKeys) {
      for (const eKey of entityKeys) {
        const queries = this.entityToQueries.get(eKey)
        if (queries) {
          queries.delete(queryKey)
          if (queries.size === 0) {
            this.entityToQueries.delete(eKey)
          }
        }
      }
      this.queryToEntities.delete(queryKey)
    }
  }

  beginOptimistic(type: string, id: string): void {
    const key = this.entityKey(type, id)
    const existing = this.optimisticState.get(key)
    if (existing) {
      existing.inFlightCount++
    } else {
      this.optimisticState.set(key, {
        baseValue: this.get(type, id),
        inFlightCount: 1,
        hadError: false,
      })
    }
  }

  endOptimistic(type: string, id: string, success: boolean): Set<string> | null {
    const key = this.entityKey(type, id)
    const state = this.optimisticState.get(key)
    if (!state) return null

    if (!success) {
      state.hadError = true
    }

    state.inFlightCount--

    if (state.inFlightCount > 0) {
      // Update base to current store value when a mutation succeeds,
      // so rollback from a later failure won't overwrite confirmed server data
      if (success) {
        state.baseValue = this.get(type, id)
      }
      return null
    }

    // All in-flight mutations for this entity have settled
    this.optimisticState.delete(key)

    if (state.hadError) {
      // Only roll back if the last mutation failed; if it succeeded,
      // the store already contains confirmed server data
      if (!success) {
        if (state.baseValue === undefined) {
          this.delete(type, id)
        } else {
          this.set(type, id, state.baseValue)
        }
      }
      // Return affected query keys for invalidation
      return this.getQueriesForEntity(type, id)
    }

    // All succeeded, discard tracking
    return null
  }

  clearOptimistic(): void {
    this.optimisticState.clear()
  }

  denormalizeCached(data: unknown): unknown {
    if (data !== null && typeof data === 'object') {
      const cached = this.denormWeakCache.get(data as object)
      if (cached && cached.version === this._version) {
        return cached.result
      }
      const result = this.denormalize(data)
      this.denormWeakCache.set(data as object, { version: this._version, result })
      return result
    }
    return this.denormalize(data)
  }

  clear(): void {
    this.entities.clear()
    this.entityToQueries.clear()
    this.queryToEntities.clear()
    this.clearOptimistic()
    this._version++
  }
}
