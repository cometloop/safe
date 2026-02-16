import { describe, it, expect, vi } from 'vitest'
import { Notifier } from '../notifier'

describe('Notifier', () => {
  it('calls subscribed callback on notify', () => {
    const notifier = new Notifier()
    const cb = vi.fn()
    notifier.subscribe('key1', cb)
    notifier.notify('key1')
    expect(cb).toHaveBeenCalledOnce()
  })

  it('does not call callback for different key', () => {
    const notifier = new Notifier()
    const cb = vi.fn()
    notifier.subscribe('key1', cb)
    notifier.notify('key2')
    expect(cb).not.toHaveBeenCalled()
  })

  it('unsubscribes correctly', () => {
    const notifier = new Notifier()
    const cb = vi.fn()
    const unsub = notifier.subscribe('key1', cb)
    unsub()
    notifier.notify('key1')
    expect(cb).not.toHaveBeenCalled()
  })

  it('supports multiple subscribers on same key', () => {
    const notifier = new Notifier()
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    notifier.subscribe('key1', cb1)
    notifier.subscribe('key1', cb2)
    notifier.notify('key1')
    expect(cb1).toHaveBeenCalledOnce()
    expect(cb2).toHaveBeenCalledOnce()
  })

  it('notifyMany calls callbacks for multiple keys', () => {
    const notifier = new Notifier()
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    notifier.subscribe('key1', cb1)
    notifier.subscribe('key2', cb2)
    notifier.notifyMany(['key1', 'key2'])
    expect(cb1).toHaveBeenCalledOnce()
    expect(cb2).toHaveBeenCalledOnce()
  })

  it('notifyMany deduplicates same callback across keys', () => {
    const notifier = new Notifier()
    const cb = vi.fn()
    notifier.subscribe('key1', cb)
    notifier.subscribe('key2', cb)
    notifier.notifyMany(['key1', 'key2'])
    expect(cb).toHaveBeenCalledOnce()
  })

  it('hasListeners returns true when subscribers exist', () => {
    const notifier = new Notifier()
    notifier.subscribe('key1', () => {})
    expect(notifier.hasListeners('key1')).toBe(true)
  })

  it('hasListeners returns false when no subscribers', () => {
    const notifier = new Notifier()
    expect(notifier.hasListeners('key1')).toBe(false)
  })

  it('hasListeners returns false after all unsubscribe', () => {
    const notifier = new Notifier()
    const unsub = notifier.subscribe('key1', () => {})
    unsub()
    expect(notifier.hasListeners('key1')).toBe(false)
  })

  it('cleans up key from map when last subscriber unsubscribes', () => {
    const notifier = new Notifier()
    const unsub1 = notifier.subscribe('key1', () => {})
    const unsub2 = notifier.subscribe('key1', () => {})
    unsub1()
    expect(notifier.hasListeners('key1')).toBe(true)
    unsub2()
    expect(notifier.hasListeners('key1')).toBe(false)
  })
})
