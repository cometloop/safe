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
      const data = { __type: 'user', id: '1', name: 'Alice' }
      const extractors = { user: (u: any) => u.id }

      const { normalized, entityKeys } = store.normalize(data, extractors)

      expect(normalized).toEqual({ __ref: 'user:1' })
      expect(entityKeys).toEqual(new Set(['user:1']))
      expect(store.get('user', '1')).toEqual({
        __type: 'user',
        id: '1',
        name: 'Alice',
      })
    })

    it('normalizes an array of entities', () => {
      const store = new EntityStore()
      const data = [
        { __type: 'user', id: '1', name: 'Alice' },
        { __type: 'user', id: '2', name: 'Bob' },
      ]
      const extractors = { user: (u: any) => u.id }

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
        __type: 'post',
        id: 'p1',
        author: { __type: 'user', id: 'u1', name: 'Alice' },
      }
      const extractors = {
        post: (p: any) => p.id,
        user: (u: any) => u.id,
      }

      const { normalized, entityKeys } = store.normalize(data, extractors)

      expect(normalized).toEqual({ __ref: 'post:p1' })
      expect(entityKeys).toEqual(new Set(['post:p1', 'user:u1']))
      expect(store.get('post', 'p1')).toEqual({
        __type: 'post',
        id: 'p1',
        author: { __ref: 'user:u1' },
      })
      expect(store.get('user', 'u1')).toEqual({
        __type: 'user',
        id: 'u1',
        name: 'Alice',
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

    it('handles objects without __type', () => {
      const store = new EntityStore()
      const data = { id: '1', name: 'Alice' }
      const { normalized } = store.normalize(data, {})
      expect(normalized).toEqual({ id: '1', name: 'Alice' })
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
  })
})
