import { describe, it, expect } from 'vitest'
import {
  safe,
  createSafe,
  ok,
  err,
  TimeoutError,
} from './index'

describe('index re-exports', () => {
  it('exports safe object with all methods', () => {
    expect(safe).toBeDefined()
    expect(typeof safe.sync).toBe('function')
    expect(typeof safe.async).toBe('function')
    expect(typeof safe.wrap).toBe('function')
    expect(typeof safe.wrapAsync).toBe('function')
    expect(typeof safe.all).toBe('function')
    expect(typeof safe.allSettled).toBe('function')
  })

  it('exports createSafe factory', () => {
    expect(typeof createSafe).toBe('function')
  })

  it('exports ok and err constructors', () => {
    const success = ok(42)
    expect(success[0]).toBe(42)
    expect(success[1]).toBeNull()
    expect(success.ok).toBe(true)

    const failure = err('bad')
    expect(failure[0]).toBeNull()
    expect(failure[1]).toBe('bad')
    expect(failure.ok).toBe(false)
  })

  it('exports TimeoutError class', () => {
    const te = new TimeoutError(5000)
    expect(te).toBeInstanceOf(Error)
    expect(te).toBeInstanceOf(TimeoutError)
    expect(te.name).toBe('TimeoutError')
    expect(te.message).toBe('Operation timed out after 5000ms')
  })
})
