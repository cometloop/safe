import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { FocusManager } from '../focus-manager'

function createMockDocument(initialVisibility: string = 'visible') {
  const target = new EventTarget()
  return {
    visibilityState: initialVisibility,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  }
}

describe('FocusManager', () => {
  let savedDocument: typeof globalThis.document

  beforeEach(() => {
    savedDocument = globalThis.document
  })

  afterEach(() => {
    vi.restoreAllMocks()
    globalThis.document = savedDocument
  })

  it('isFocused returns true when document is not available', () => {
    // @ts-expect-error - simulating SSR
    globalThis.document = undefined

    const fm = new FocusManager()
    expect(fm.isFocused()).toBe(true)
    fm.destroy()
  })

  it('isFocused returns true when visibilityState is visible', () => {
    const mockDoc = createMockDocument('visible')
    globalThis.document = mockDoc as any

    const fm = new FocusManager()
    expect(fm.isFocused()).toBe(true)
    fm.destroy()
  })

  it('isFocused returns false when visibilityState is hidden', () => {
    const mockDoc = createMockDocument('hidden')
    globalThis.document = mockDoc as any

    const fm = new FocusManager()
    expect(fm.isFocused()).toBe(false)
    fm.destroy()
  })

  it('calls subscribers when tab becomes visible', () => {
    const mockDoc = createMockDocument('hidden')
    globalThis.document = mockDoc as any

    const fm = new FocusManager()
    const cb = vi.fn()
    fm.subscribe(cb)

    mockDoc.visibilityState = 'visible'
    mockDoc.dispatchEvent(new Event('visibilitychange'))

    expect(cb).toHaveBeenCalledTimes(1)
    fm.destroy()
  })

  it('does not call subscribers when tab becomes hidden', () => {
    const mockDoc = createMockDocument('visible')
    globalThis.document = mockDoc as any

    const fm = new FocusManager()
    const cb = vi.fn()
    fm.subscribe(cb)

    mockDoc.visibilityState = 'hidden'
    mockDoc.dispatchEvent(new Event('visibilitychange'))

    expect(cb).not.toHaveBeenCalled()
    fm.destroy()
  })

  it('unsubscribe removes the callback', () => {
    const mockDoc = createMockDocument('hidden')
    globalThis.document = mockDoc as any

    const fm = new FocusManager()
    const cb = vi.fn()
    const unsub = fm.subscribe(cb)

    unsub()

    mockDoc.visibilityState = 'visible'
    mockDoc.dispatchEvent(new Event('visibilitychange'))

    expect(cb).not.toHaveBeenCalled()
    fm.destroy()
  })

  it('destroy cleans up event listener and clears subscribers', () => {
    const mockDoc = createMockDocument('hidden')
    globalThis.document = mockDoc as any

    const fm = new FocusManager()
    const cb = vi.fn()
    fm.subscribe(cb)

    fm.destroy()

    mockDoc.visibilityState = 'visible'
    mockDoc.dispatchEvent(new Event('visibilitychange'))

    expect(cb).not.toHaveBeenCalled()
  })

  it('supports multiple subscribers', () => {
    const mockDoc = createMockDocument('hidden')
    globalThis.document = mockDoc as any

    const fm = new FocusManager()
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    fm.subscribe(cb1)
    fm.subscribe(cb2)

    mockDoc.visibilityState = 'visible'
    mockDoc.dispatchEvent(new Event('visibilitychange'))

    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)
    fm.destroy()
  })
})
