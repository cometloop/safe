import type { EntityRef } from './types'

export type EntitySnapshot = Map<string, Map<string, unknown>>

export class EntityStore {
  private entities = new Map<string, Map<string, unknown>>()
  private entityToQueries = new Map<string, Set<string>>()

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
  }

  delete(type: string, id: string): void {
    const typeMap = this.entities.get(type)
    if (typeMap) {
      typeMap.delete(id)
      if (typeMap.size === 0) {
        this.entities.delete(type)
      }
    }
  }

  registerQueryEntities(
    queryKey: string,
    entityKeys: Set<string>
  ): Set<string> {
    const previousKeys = new Set<string>()

    // Collect previous entity keys for this query and remove old mappings
    for (const [eKey, queries] of this.entityToQueries) {
      if (queries.has(queryKey)) {
        previousKeys.add(eKey)
        queries.delete(queryKey)
        if (queries.size === 0) {
          this.entityToQueries.delete(eKey)
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

    return entityKeys
  }

  getQueriesForEntity(type: string, id: string): Set<string> {
    const key = this.entityKey(type, id)
    return this.entityToQueries.get(key) ?? new Set()
  }

  normalize(
    data: unknown,
    extractors: Record<string, (entity: any) => string>
  ): { normalized: unknown; entityKeys: Set<string> } {
    const entityKeys = new Set<string>()

    const walk = (value: unknown): unknown => {
      if (value === null || value === undefined) return value
      if (typeof value !== 'object') return value

      if (Array.isArray(value)) {
        return value.map(walk)
      }

      const obj = value as Record<string, unknown>
      const typeName = obj.__type as string | undefined

      if (typeName && extractors[typeName]) {
        const id = extractors[typeName](obj)
        const eKey = this.entityKey(typeName, id)
        entityKeys.add(eKey)

        // Walk nested properties to normalize nested entities first
        const walked: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(obj)) {
          walked[k] = walk(v)
        }

        // Store the walked entity (with nested refs) in the entity store
        this.set(typeName, id, walked)

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
      snap.set(type, new Map(typeMap))
    }
    return snap
  }

  restore(snapshot: EntitySnapshot): void {
    this.entities.clear()
    for (const [type, typeMap] of snapshot) {
      this.entities.set(type, new Map(typeMap))
    }
  }

  clear(): void {
    this.entities.clear()
    this.entityToQueries.clear()
  }
}
