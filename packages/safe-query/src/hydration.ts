import type { DehydratedState, DehydratedQuery } from './types'
import { QueryCache } from './query-cache'
import { EntityStore } from './entity-store'
import { Notifier } from './notifier'
import type { GlobalEntityConfig } from './types'

export type DehydrateOptions = {
  shouldDehydrateQuery?: (key: string, data: unknown) => boolean
}

export function dehydrateCache(
  queryCache: QueryCache,
): DehydratedState {
  const queries: DehydratedQuery[] = []

  for (const [key, entry] of queryCache.entries()) {
    if (entry.data === undefined) continue

    queries.push({
      key,
      data: entry.data,
      dataUpdatedAt: entry.dataUpdatedAt,
    })
  }

  return { queries }
}

export function hydrateCache(
  queryCache: QueryCache,
  entityStore: EntityStore,
  notifier: Notifier,
  state: DehydratedState,
  entities?: GlobalEntityConfig,
  defaultStaleTime = 0,
  defaultGcTime = 5 * 60_000,
): void {
  for (const query of state.queries) {
    const entry = queryCache.getOrCreate(query.key, defaultStaleTime, defaultGcTime)

    // Don't overwrite existing data that's newer
    if (entry.data !== undefined && entry.dataUpdatedAt !== null) {
      if (query.dataUpdatedAt !== null && query.dataUpdatedAt <= entry.dataUpdatedAt) {
        continue
      }
    }

    // Normalize entities if configured
    if (entities && query.data !== undefined) {
      const { normalized, entityKeys } = entityStore.normalize(query.data, entities)
      queryCache.setData(query.key, query.data, normalized, entityKeys)
      entityStore.registerQueryEntities(query.key, entityKeys)
    } else {
      queryCache.setData(query.key, query.data, undefined, new Set())
    }

    // Restore dataUpdatedAt if provided
    if (query.dataUpdatedAt !== null) {
      entry.dataUpdatedAt = query.dataUpdatedAt
    }

    notifier.notify(query.key)
  }
}
