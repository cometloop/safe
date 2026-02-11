import { describe, it, expect } from 'vitest'
import { safe, createSafe, ok, err, TimeoutError } from './index'

describe('safe/index re-exports', () => {
  it('exports safe object', () => {
    expect(safe).toBeDefined()
    expect(typeof safe.sync).toBe('function')
  })

  it('exports createSafe factory', () => {
    expect(typeof createSafe).toBe('function')
  })

  it('exports ok and err constructors', () => {
    expect(typeof ok).toBe('function')
    expect(typeof err).toBe('function')
  })

  it('exports TimeoutError class', () => {
    expect(TimeoutError).toBeDefined()
    expect(new TimeoutError(100)).toBeInstanceOf(Error)
  })
})
