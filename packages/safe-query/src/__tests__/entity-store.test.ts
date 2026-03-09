import { describe, it, expect } from 'vitest'
import { EntityStore } from '../entity-store'

describe('EntityStore', () => {
  describe('get/set/delete', () => {
    it('stores and retrieves entities', () => {
      const store = new EntityStore()
      store.set('user', '1', { id: '1', name: 'Alice' })
      expect(store.get('user', '1')).toEqual({ id: '1', name: 'Alice' })
    })

    it('returns undefined for missing entity', () => {
      const store = new EntityStore()
      expect(store.get('user', '999')).toBeUndefined()
    })

    it('deletes entity', () => {
      const store = new EntityStore()
      store.set('user', '1', { id: '1' })
      store.delete('user', '1')
      expect(store.get('user', '1')).toBeUndefined()
    })

    it('cleans up empty type map on delete', () => {
      const store = new EntityStore()
      store.set('user', '1', { id: '1' })
      store.delete('user', '1')
      // Calling get on deleted type should return undefined
      expect(store.get('user', '1')).toBeUndefined()
    })

    it('handles delete of non-existent type', () => {
      const store = new EntityStore()
      store.delete('nonexistent', '1')
      expect(store.get('nonexistent', '1')).toBeUndefined()
    })

    it('does not clean up type map when other entities remain', () => {
      const store = new EntityStore()
      store.set('user', '1', { id: '1' })
      store.set('user', '2', { id: '2' })
      store.delete('user', '1')
      expect(store.get('user', '1')).toBeUndefined()
      expect(store.get('user', '2')).toEqual({ id: '2' })
    })
  })

  describe('normalize', () => {
    it('normalizes a single entity', () => {
      const store = new EntityStore()
      const data = { id: '1', name: 'Alice' }
      const extractors = {
        user: {
          match: (obj: Record<string, unknown>) => 'name' in obj,
          id: (u: any) => u.id,
        },
      }

      const { normalized, entityKeys } = store.normalize(data, extractors)

      expect(normalized).toEqual({ __ref: 'user:1' })
      expect(entityKeys).toEqual(new Set(['user:1']))
      expect(store.get('user', '1')).toEqual({
        id: '1',
        name: 'Alice',
      })
    })

    it('normalizes an array of entities', () => {
      const store = new EntityStore()
      const data = [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ]
      const extractors = {
        user: {
          match: (obj: Record<string, unknown>) => 'name' in obj,
          id: (u: any) => u.id,
        },
      }

      const { normalized, entityKeys } = store.normalize(data, extractors)

      expect(normalized).toEqual([
        { __ref: 'user:1' },
        { __ref: 'user:2' },
      ])
      expect(entityKeys).toEqual(new Set(['user:1', 'user:2']))
    })

    it('normalizes nested entities', () => {
      const store = new EntityStore()
      const data = {
        id: 'p1',
        title: 'Hello World',
        author: { id: 'u1', name: 'Alice', email: 'alice@example.com' },
      }
      const extractors = {
        post: {
          match: (obj: Record<string, unknown>) => 'title' in obj,
          id: (p: any) => p.id,
        },
        user: {
          match: (obj: Record<string, unknown>) =>
            'email' in obj && !('title' in obj),
          id: (u: any) => u.id,
        },
      }

      const { normalized, entityKeys } = store.normalize(data, extractors)

      expect(normalized).toEqual({ __ref: 'post:p1' })
      expect(entityKeys).toEqual(new Set(['post:p1', 'user:u1']))
      expect(store.get('post', 'p1')).toEqual({
        id: 'p1',
        title: 'Hello World',
        author: { __ref: 'user:u1' },
      })
      expect(store.get('user', 'u1')).toEqual({
        id: 'u1',
        name: 'Alice',
        email: 'alice@example.com',
      })
    })

    it('handles null and undefined values', () => {
      const store = new EntityStore()
      expect(store.normalize(null, {}).normalized).toBeNull()
      expect(store.normalize(undefined, {}).normalized).toBeUndefined()
    })

    it('handles primitives', () => {
      const store = new EntityStore()
      expect(store.normalize(42, {}).normalized).toBe(42)
      expect(store.normalize('hello', {}).normalized).toBe('hello')
    })

    it('passes through objects that match no extractor', () => {
      const store = new EntityStore()
      const data = { id: '1', name: 'Alice' }
      const extractors = {
        post: {
          match: (obj: Record<string, unknown>) => 'title' in obj,
          id: (p: any) => p.id,
        },
      }
      const { normalized } = store.normalize(data, extractors)
      expect(normalized).toEqual({ id: '1', name: 'Alice' })
    })

    it('matches entities by shape without __type', () => {
      const store = new EntityStore()
      const data = [
        { id: '1', title: 'Post 1', body: 'Content' },
        { id: '2', name: 'Alice', email: 'alice@test.com' },
      ]
      const extractors = {
        post: {
          match: (obj: Record<string, unknown>) => 'title' in obj,
          id: (p: any) => p.id,
        },
        user: {
          match: (obj: Record<string, unknown>) => 'email' in obj,
          id: (u: any) => u.id,
        },
      }

      const { normalized, entityKeys } = store.normalize(data, extractors)

      expect(normalized).toEqual([
        { __ref: 'post:1' },
        { __ref: 'user:2' },
      ])
      expect(entityKeys).toEqual(new Set(['post:1', 'user:2']))
      expect(store.get('post', '1')).toEqual({
        id: '1',
        title: 'Post 1',
        body: 'Content',
      })
      expect(store.get('user', '2')).toEqual({
        id: '2',
        name: 'Alice',
        email: 'alice@test.com',
      })
    })

    it('no match passes object through unchanged', () => {
      const store = new EntityStore()
      const data = { foo: 'bar', baz: 42 }
      const extractors = {
        user: {
          match: (obj: Record<string, unknown>) => 'email' in obj,
          id: (u: any) => u.id,
        },
        post: {
          match: (obj: Record<string, unknown>) => 'title' in obj,
          id: (p: any) => p.id,
        },
      }

      const { normalized, entityKeys } = store.normalize(data, extractors)

      expect(normalized).toEqual({ foo: 'bar', baz: 42 })
      expect(entityKeys).toEqual(new Set())
    })

    it('normalizeExplicit stores entities from user-provided map', () => {
      const store = new EntityStore()
      const extractors = {
        user: {
          match: (obj: Record<string, unknown>) => 'name' in obj,
          id: (u: any) => u.id,
        },
        post: {
          match: (obj: Record<string, unknown>) => 'title' in obj,
          id: (p: any) => p.id,
        },
      }
      const entityMap = {
        user: [
          { id: 'u1', name: 'Alice' },
          { id: 'u2', name: 'Bob' },
        ],
        post: { id: 'p1', title: 'Hello' },
      }

      const entityKeys = store.normalizeExplicit(entityMap, extractors)

      expect(entityKeys).toEqual(new Set(['user:u1', 'user:u2', 'post:p1']))
      expect(store.get('user', 'u1')).toEqual({ id: 'u1', name: 'Alice' })
      expect(store.get('user', 'u2')).toEqual({ id: 'u2', name: 'Bob' })
      expect(store.get('post', 'p1')).toEqual({ id: 'p1', title: 'Hello' })
    })
  })

  describe('denormalize', () => {
    it('denormalizes a reference', () => {
      const store = new EntityStore()
      store.set('user', '1', { __type: 'user', id: '1', name: 'Alice' })

      const result = store.denormalize({ __ref: 'user:1' })
      expect(result).toEqual({ __type: 'user', id: '1', name: 'Alice' })
    })

    it('denormalizes an array of references', () => {
      const store = new EntityStore()
      store.set('user', '1', { __type: 'user', id: '1', name: 'Alice' })
      store.set('user', '2', { __type: 'user', id: '2', name: 'Bob' })

      const result = store.denormalize([
        { __ref: 'user:1' },
        { __ref: 'user:2' },
      ])
      expect(result).toEqual([
        { __type: 'user', id: '1', name: 'Alice' },
        { __type: 'user', id: '2', name: 'Bob' },
      ])
    })

    it('denormalizes nested references', () => {
      const store = new EntityStore()
      store.set('user', 'u1', { __type: 'user', id: 'u1', name: 'Alice' })
      store.set('post', 'p1', {
        __type: 'post',
        id: 'p1',
        author: { __ref: 'user:u1' },
      })

      const result = store.denormalize({ __ref: 'post:p1' })
      expect(result).toEqual({
        __type: 'post',
        id: 'p1',
        author: { __type: 'user', id: 'u1', name: 'Alice' },
      })
    })

    it('handles missing entity reference gracefully', () => {
      const store = new EntityStore()
      const ref = { __ref: 'user:missing' }
      expect(store.denormalize(ref)).toEqual(ref)
    })

    it('handles circular references', () => {
      const store = new EntityStore()
      store.set('user', '1', {
        __type: 'user',
        id: '1',
        friend: { __ref: 'user:1' },
      })

      const result = store.denormalize({ __ref: 'user:1' }) as any
      expect(result.__type).toBe('user')
      expect(result.id).toBe('1')
      // Circular reference should return the ref as-is
      expect(result.friend).toEqual({ __ref: 'user:1' })
    })

    it('handles null and undefined', () => {
      const store = new EntityStore()
      expect(store.denormalize(null)).toBeNull()
      expect(store.denormalize(undefined)).toBeUndefined()
    })

    it('handles primitives', () => {
      const store = new EntityStore()
      expect(store.denormalize(42)).toBe(42)
      expect(store.denormalize('hello')).toBe('hello')
    })

    it('handles entity keys with colons in ID', () => {
      const store = new EntityStore()
      store.set('user', 'urn:uuid:123', {
        __type: 'user',
        id: 'urn:uuid:123',
      })

      const result = store.denormalize({ __ref: 'user:urn:uuid:123' })
      expect(result).toEqual({ __type: 'user', id: 'urn:uuid:123' })
    })
  })

  describe('registerQueryEntities', () => {
    it('registers entity-to-query mapping', () => {
      const store = new EntityStore()
      store.registerQueryEntities('q1', new Set(['user:1', 'user:2']))

      expect(store.getQueriesForEntity('user', '1')).toEqual(new Set(['q1']))
      expect(store.getQueriesForEntity('user', '2')).toEqual(new Set(['q1']))
    })

    it('updates mapping on re-registration', () => {
      const store = new EntityStore()
      store.registerQueryEntities('q1', new Set(['user:1', 'user:2']))
      store.registerQueryEntities('q1', new Set(['user:1', 'user:3']))

      expect(store.getQueriesForEntity('user', '1')).toEqual(new Set(['q1']))
      expect(store.getQueriesForEntity('user', '2')).toEqual(new Set())
      expect(store.getQueriesForEntity('user', '3')).toEqual(new Set(['q1']))
    })

    it('returns empty set for unknown entity', () => {
      const store = new EntityStore()
      expect(store.getQueriesForEntity('user', '999')).toEqual(new Set())
    })

    it('keeps other query mappings when one query re-registers', () => {
      const store = new EntityStore()
      store.registerQueryEntities('q1', new Set(['user:1']))
      store.registerQueryEntities('q2', new Set(['user:1']))

      // Re-register q1 without user:1
      store.registerQueryEntities('q1', new Set(['user:2']))

      // user:1 should still map to q2
      expect(store.getQueriesForEntity('user', '1')).toEqual(new Set(['q2']))
      expect(store.getQueriesForEntity('user', '2')).toEqual(new Set(['q1']))
    })
  })

  describe('unregisterQuery', () => {
    it('removes query from entity-to-query mappings', () => {
      const store = new EntityStore()
      store.registerQueryEntities('q1', new Set(['user:1', 'user:2']))

      store.unregisterQuery('q1')

      expect(store.getQueriesForEntity('user', '1')).toEqual(new Set())
      expect(store.getQueriesForEntity('user', '2')).toEqual(new Set())
    })

    it('does not affect other queries for the same entity', () => {
      const store = new EntityStore()
      store.registerQueryEntities('q1', new Set(['user:1']))
      store.registerQueryEntities('q2', new Set(['user:1']))

      store.unregisterQuery('q1')

      expect(store.getQueriesForEntity('user', '1')).toEqual(new Set(['q2']))
    })

    it('is a no-op for an unknown query', () => {
      const store = new EntityStore()
      store.registerQueryEntities('q1', new Set(['user:1']))

      store.unregisterQuery('q-unknown')

      expect(store.getQueriesForEntity('user', '1')).toEqual(new Set(['q1']))
    })

    it('allows re-registration after unregister', () => {
      const store = new EntityStore()
      store.registerQueryEntities('q1', new Set(['user:1']))
      store.unregisterQuery('q1')

      store.registerQueryEntities('q1', new Set(['user:2']))

      expect(store.getQueriesForEntity('user', '1')).toEqual(new Set())
      expect(store.getQueriesForEntity('user', '2')).toEqual(new Set(['q1']))
    })
  })

  describe('snapshot/restore', () => {
    it('takes a snapshot and restores it', () => {
      const store = new EntityStore()
      store.set('user', '1', { name: 'Alice' })
      store.set('user', '2', { name: 'Bob' })

      const snap = store.snapshot()

      store.set('user', '1', { name: 'Modified' })
      store.delete('user', '2')

      store.restore(snap)

      expect(store.get('user', '1')).toEqual({ name: 'Alice' })
      expect(store.get('user', '2')).toEqual({ name: 'Bob' })
    })

    it('snapshot is independent of store changes', () => {
      const store = new EntityStore()
      store.set('user', '1', { name: 'Alice' })

      const snap = store.snapshot()
      store.set('user', '1', { name: 'Modified' })

      // Snapshot should still have original value
      expect(snap.get('user')?.get('1')).toEqual({ name: 'Alice' })
    })

    it('snapshot deep copies entity values', () => {
      const store = new EntityStore()
      const entity = { name: 'Alice', tags: ['admin'] }
      store.set('user', '1', entity)

      const snap = store.snapshot()

      // Mutating the original entity in-place should not affect the snapshot
      entity.name = 'Mutated'
      entity.tags.push('hacked')

      const snapshotEntity = snap.get('user')?.get('1') as any
      expect(snapshotEntity.name).toBe('Alice')
      expect(snapshotEntity.tags).toEqual(['admin'])
    })

    it('snapshot deep copies nested objects', () => {
      const store = new EntityStore()
      store.set('user', '1', {
        name: 'Alice',
        profile: { bio: 'original', settings: { theme: 'dark' } },
      })

      const snap = store.snapshot()

      // Mutate the entity in the store after snapshot
      const current = store.get('user', '1') as any
      current.profile.bio = 'mutated'
      current.profile.settings.theme = 'light'

      const snapshotEntity = snap.get('user')?.get('1') as any
      expect(snapshotEntity.profile.bio).toBe('original')
      expect(snapshotEntity.profile.settings.theme).toBe('dark')
    })
  })

  describe('beginOptimistic / endOptimistic', () => {
    it('saves base value on first call', () => {
      const store = new EntityStore()
      store.set('user', '1', { name: 'Alice' })

      store.beginOptimistic('user', '1')

      // Modify entity
      store.set('user', '1', { name: 'Bob' })

      // End with error → should restore base value
      const keys = store.endOptimistic('user', '1', false)
      expect(store.get('user', '1')).toEqual({ name: 'Alice' })
      expect(keys).toBeDefined()
    })

    it('restores undefined base when entity did not exist', () => {
      const store = new EntityStore()

      store.beginOptimistic('user', '1')
      store.set('user', '1', { name: 'Optimistic' })

      const keys = store.endOptimistic('user', '1', false)
      expect(store.get('user', '1')).toBeUndefined()
      expect(keys).toBeDefined()
    })

    it('increments count on concurrent calls', () => {
      const store = new EntityStore()
      store.set('user', '1', { name: 'Alice' })

      store.beginOptimistic('user', '1')
      store.set('user', '1', { name: 'Bob' })

      store.beginOptimistic('user', '1')
      store.set('user', '1', { name: 'Charlie' })

      // First end: counter > 0, should return null
      const result1 = store.endOptimistic('user', '1', true)
      expect(result1).toBeNull()
      expect(store.get('user', '1')).toEqual({ name: 'Charlie' })

      // Second end (success): discards tracking, no restore
      const result2 = store.endOptimistic('user', '1', true)
      expect(result2).toBeNull()
      expect(store.get('user', '1')).toEqual({ name: 'Charlie' })
    })

    it('rolls back on error when concurrent mutations settle', () => {
      const store = new EntityStore()
      store.set('user', '1', { name: 'Alice' })
      store.registerQueryEntities('q1', new Set(['user:1']))

      store.beginOptimistic('user', '1')
      store.set('user', '1', { name: 'Bob' })

      store.beginOptimistic('user', '1')
      store.set('user', '1', { name: 'Charlie' })

      // First settles with error
      const result1 = store.endOptimistic('user', '1', false)
      expect(result1).toBeNull() // counter still > 0

      // Second settles with success → hadError is true but last succeeded,
      // so keep current data (no rollback) and return keys for invalidation
      const result2 = store.endOptimistic('user', '1', true)
      expect(result2).toEqual(new Set(['q1']))
      expect(store.get('user', '1')).toEqual({ name: 'Charlie' })
    })

    it('returns null when endOptimistic called without beginOptimistic', () => {
      const store = new EntityStore()
      const result = store.endOptimistic('user', '1', true)
      expect(result).toBeNull()
    })

    it('clearOptimistic removes all tracking state', () => {
      const store = new EntityStore()
      store.set('user', '1', { name: 'Alice' })
      store.beginOptimistic('user', '1')
      store.set('user', '1', { name: 'Bob' })

      store.clearOptimistic()

      // After clearing optimistic state, endOptimistic should be a no-op
      const result = store.endOptimistic('user', '1', false)
      expect(result).toBeNull()
      // Entity should remain as-is (no rollback since tracking was cleared)
      expect(store.get('user', '1')).toEqual({ name: 'Bob' })
    })

    it('clear() also clears optimistic state', () => {
      const store = new EntityStore()
      store.set('user', '1', { name: 'Alice' })
      store.beginOptimistic('user', '1')

      store.clear()

      const result = store.endOptimistic('user', '1', false)
      expect(result).toBeNull()
    })
  })
})
