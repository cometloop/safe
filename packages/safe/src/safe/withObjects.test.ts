import { describe, it, expect, vi } from 'vitest'
import {
  safe,
  createSafe,
  withObjects,
  okObj,
  errObj,
  type SafeResultObj,
} from './index'

describe('withObjects', () => {
  describe('wrapping SafeResult (sync tuple)', () => {
    it('converts a success tuple to { ok: true, data, error: null }', () => {
      const result = withObjects(safe.sync(() => 42))

      expect(result).toEqual({ ok: true, data: 42, error: null })
    })

    it('converts an error tuple to { ok: false, data: null, error }', () => {
      const result = withObjects(
        safe.sync(() => {
          throw new Error('boom')
        })
      )

      expect(result.ok).toBe(false)
      expect(result.data).toBeNull()
      expect(result.error).toBeInstanceOf(Error)
      expect((result.error as Error).message).toBe('boom')
    })

    it('result is not an array', () => {
      const result = withObjects(safe.sync(() => 42))

      expect(Array.isArray(result)).toBe(false)
    })

    it('Object.keys includes all 3 properties', () => {
      const result = withObjects(safe.sync(() => 'hello'))

      expect(Object.keys(result).sort()).toEqual(['data', 'error', 'ok'])
    })

    it('JSON.stringify works correctly for success', () => {
      const result = withObjects(safe.sync(() => ({ name: 'test' })))

      expect(JSON.parse(JSON.stringify(result))).toEqual({
        ok: true,
        data: { name: 'test' },
        error: null,
      })
    })

    it('spread preserves all properties', () => {
      const result = withObjects(safe.sync(() => 42))
      const spread = { ...result }

      expect(spread).toEqual({ ok: true, data: 42, error: null })
    })

    it('works with custom parseError', () => {
      const result = withObjects(
        safe.sync(
          () => {
            throw new Error('oops')
          },
          (e) => String(e)
        )
      )

      expect(result).toEqual({ ok: false, data: null, error: 'Error: oops' })
    })

    it('type narrows via ok discriminant', () => {
      const result = withObjects(safe.sync(() => 42))

      if (result.ok) {
        const data: number = result.data
        const error: null = result.error
        expect(data).toBe(42)
        expect(error).toBeNull()
      } else {
        const data: null = result.data
        const _error: Error = result.error
        expect(data).toBeNull()
      }
    })
  })

  describe('wrapping Promise<SafeResult> (async)', () => {
    it('resolves to object result on success', async () => {
      const result = await withObjects(safe.async(() => Promise.resolve(42)))

      expect(result).toEqual({ ok: true, data: 42, error: null })
    })

    it('resolves to object result on error', async () => {
      const result = await withObjects(
        safe.async(() => Promise.reject(new Error('async boom')))
      )

      expect(result.ok).toBe(false)
      expect(result.data).toBeNull()
      expect((result.error as Error).message).toBe('async boom')
    })

    it('works with createSafe async results', async () => {
      const appSafe = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown',
      })

      const result = await withObjects(
        appSafe.async(() => Promise.resolve('data'))
      )

      expect(result).toEqual({ ok: true, data: 'data', error: null })
    })
  })

  describe('wrapping sync functions', () => {
    it('wraps safe.wrap result into object-returning function', () => {
      const safeParse = withObjects(safe.wrap(JSON.parse))
      const result = safeParse('{"a":1}')

      expect(result).toEqual({ ok: true, data: { a: 1 }, error: null })
    })

    it('returns object error on function failure', () => {
      const safeParse = withObjects(safe.wrap(JSON.parse))
      const result = safeParse('invalid json')

      expect(result.ok).toBe(false)
      expect(result.data).toBeNull()
      expect(result.error).toBeInstanceOf(Error)
    })

    it('works with createSafe .wrap()', () => {
      const appSafe = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown',
      })
      const safeParse = withObjects(appSafe.wrap(JSON.parse))

      const success = safeParse('{"b":2}')
      expect(success).toEqual({ ok: true, data: { b: 2 }, error: null })

      const failure = safeParse('bad')
      expect(failure.ok).toBe(false)
      expect(typeof failure.error).toBe('string')
    })
  })

  describe('wrapping async functions', () => {
    it('wraps safe.wrapAsync result into object-returning async function', async () => {
      const safeFetch = withObjects(
        safe.wrapAsync((x: number) => Promise.resolve(x * 2))
      )
      const result = await safeFetch(21)

      expect(result).toEqual({ ok: true, data: 42, error: null })
    })

    it('returns object error on async function failure', async () => {
      const safeFn = withObjects(
        safe.wrapAsync(() => Promise.reject(new Error('fail')))
      )
      const result = await safeFn()

      expect(result.ok).toBe(false)
      expect(result.data).toBeNull()
      expect((result.error as Error).message).toBe('fail')
    })

    it('works with createSafe .wrapAsync()', async () => {
      const appSafe = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown',
      })
      const safeFn = withObjects(
        appSafe.wrapAsync((n: number) => Promise.resolve(n + 1))
      )

      const result = await safeFn(5)
      expect(result).toEqual({ ok: true, data: 6, error: null })
    })
  })

  describe('wrapping SafeInstance', () => {
    const appSafe = createSafe({
      parseError: (e) => (e instanceof Error ? e.message : String(e)),
      defaultError: 'unknown error',
    })

    it('sync returns object result', () => {
      const objSafe = withObjects(appSafe)
      const result = objSafe.sync(() => 42)

      expect(result).toEqual({ ok: true, data: 42, error: null })
    })

    it('sync error returns object result', () => {
      const objSafe = withObjects(appSafe)
      const result = objSafe.sync(() => {
        throw new Error('sync fail')
      })

      expect(result).toEqual({ ok: false, data: null, error: 'sync fail' })
    })

    it('async returns object result', async () => {
      const objSafe = withObjects(appSafe)
      const result = await objSafe.async(() => Promise.resolve('hello'))

      expect(result).toEqual({ ok: true, data: 'hello', error: null })
    })

    it('async error returns object result', async () => {
      const objSafe = withObjects(appSafe)
      const result = await objSafe.async(() =>
        Promise.reject(new Error('async fail'))
      )

      expect(result).toEqual({ ok: false, data: null, error: 'async fail' })
    })

    it('wrap returns object-returning function', () => {
      const objSafe = withObjects(appSafe)
      const safeParse = objSafe.wrap(JSON.parse)

      expect(safeParse('{"x":1}')).toEqual({
        ok: true,
        data: { x: 1 },
        error: null,
      })
      const failure = safeParse('bad')
      expect(failure.ok).toBe(false)
      expect(failure.data).toBeNull()
      expect(typeof failure.error).toBe('string')
    })

    it('wrapAsync returns object-returning async function', async () => {
      const objSafe = withObjects(appSafe)
      const safeFn = objSafe.wrapAsync((n: number) => Promise.resolve(n * 3))

      const result = await safeFn(7)
      expect(result).toEqual({ ok: true, data: 21, error: null })
    })

    it('all success returns object result', async () => {
      const objSafe = withObjects(appSafe)
      const result = await objSafe.all({
        a: () => Promise.resolve(1),
        b: () => Promise.resolve(2),
      })

      expect(result).toEqual({ ok: true, data: { a: 1, b: 2 }, error: null })
    })

    it('all error returns object result', async () => {
      const objSafe = withObjects(appSafe)
      const result = await objSafe.all({
        a: () => Promise.resolve(1),
        b: () => Promise.reject(new Error('b failed')),
      })

      expect(result.ok).toBe(false)
      expect(result.data).toBeNull()
      expect(result.error).toBe('b failed')
    })

    it('allSettled entries are SafeResultObj', async () => {
      const objSafe = withObjects(appSafe)
      const results = await objSafe.allSettled({
        a: () => Promise.resolve(1),
        b: () => Promise.reject(new Error('b failed')),
      })

      expect(results.a).toEqual({ ok: true, data: 1, error: null })
      expect(results.b).toEqual({ ok: false, data: null, error: 'b failed' })

      // Verify they're plain objects, not tuples
      expect(Array.isArray(results.a)).toBe(false)
      expect(Array.isArray(results.b)).toBe(false)
    })

    it('hooks still fire (onSuccess, onError, onSettled)', () => {
      const onSuccess = vi.fn()
      const onError = vi.fn()
      const onSettled = vi.fn()

      const hookedSafe = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown',
        onSuccess,
        onError,
        onSettled,
      })
      const objSafe = withObjects(hookedSafe)

      objSafe.sync(() => 42)
      expect(onSuccess).toHaveBeenCalledWith(42)
      expect(onSettled).toHaveBeenCalledWith(42, null)

      objSafe.sync(() => {
        throw new Error('test')
      })
      expect(onError).toHaveBeenCalled()
      expect(onSettled).toHaveBeenCalledTimes(2)
    })

    it('parseResult still applies', () => {
      const objSafe = withObjects(
        createSafe({
          parseError: (e) => String(e),
          defaultError: 'unknown',
          parseResult: (r) => ({ wrapped: r }),
        })
      )

      const result = objSafe.sync(() => 42)
      expect(result).toEqual({ ok: true, data: { wrapped: 42 }, error: null })
    })

    it('retry and abortAfter still work', async () => {
      const onRetry = vi.fn()
      const objSafe = withObjects(appSafe)

      let attempts = 0
      const result = await objSafe.async(
        () => {
          attempts++
          if (attempts < 3) throw new Error('not yet')
          return Promise.resolve('done')
        },
        { retry: { times: 3 }, onRetry }
      )

      expect(result).toEqual({ ok: true, data: 'done', error: null })
      expect(onRetry).toHaveBeenCalledTimes(2)
    })
  })

  describe('okObj / errObj constructors', () => {
    it('okObj creates correct shape', () => {
      const result = okObj(42)

      expect(result).toEqual({ ok: true, data: 42, error: null })
      expect(result.ok).toBe(true)
      expect(result.data).toBe(42)
      expect(result.error).toBeNull()
    })

    it('errObj creates correct shape', () => {
      const result = errObj('bad')

      expect(result).toEqual({ ok: false, data: null, error: 'bad' })
      expect(result.ok).toBe(false)
      expect(result.data).toBeNull()
      expect(result.error).toBe('bad')
    })

    it('okObj type narrowing works', () => {
      const result: SafeResultObj<number, string> = okObj(10)

      if (result.ok) {
        const data: number = result.data
        expect(data).toBe(10)
      }
    })

    it('errObj type narrowing works', () => {
      const result: SafeResultObj<number, string> = errObj('fail')

      if (!result.ok) {
        const error: string = result.error
        expect(error).toBe('fail')
      }
    })
  })

  describe('wrapping standalone safe.all', () => {
    it('converts safe.all success to object result', async () => {
      const result = await withObjects(
        safe.all({
          a: safe.async(() => Promise.resolve(1)),
          b: safe.async(() => Promise.resolve('two')),
        })
      )

      expect(result.ok).toBe(true)
      expect(result.data).toEqual({ a: 1, b: 'two' })
      expect(result.error).toBeNull()
    })

    it('converts safe.all error to object result', async () => {
      const result = await withObjects(
        safe.all({
          a: safe.async(() => Promise.resolve(1)),
          b: safe.async(() => Promise.reject(new Error('b failed'))),
        })
      )

      expect(result.ok).toBe(false)
      expect(result.data).toBeNull()
      expect(result.error).toBeInstanceOf(Error)
      expect((result.error as Error).message).toBe('b failed')
    })
  })

  describe('wrapping standalone safe.allSettled', () => {
    it('converts safe.allSettled results to object results', async () => {
      const tupleResults = await safe.allSettled({
        a: safe.async(() => Promise.resolve(1)),
        b: safe.async(() => Promise.reject(new Error('b failed'))),
      })

      const resultA = withObjects(tupleResults.a)
      const resultB = withObjects(tupleResults.b)

      expect(resultA).toEqual({ ok: true, data: 1, error: null })
      expect(resultB.ok).toBe(false)
      expect(resultB.data).toBeNull()
      expect(resultB.error).toBeInstanceOf(Error)
      expect((resultB.error as Error).message).toBe('b failed')
    })
  })

  describe('edge cases', () => {
    it('throws TypeError for unsupported input', () => {
      expect(() => withObjects(42 as any)).toThrow(TypeError)
      expect(() => withObjects('string' as any)).toThrow(TypeError)
    })
  })
})
