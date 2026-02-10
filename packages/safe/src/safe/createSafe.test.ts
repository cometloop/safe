import { describe, it, expect, vi } from 'vitest'
import {
  createSafe,
  TimeoutError,
  type SafeResult,
  type SafeHooks,
  type SafeAsyncHooks,
  type CreateSafeConfig,
  type SafeInstance,
} from './index'

describe('createSafe', () => {
  describe('factory creation', () => {
    it('creates a safe instance with all four methods', () => {
      const appSafe = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown error',
      })

      expect(appSafe).toHaveProperty('sync')
      expect(appSafe).toHaveProperty('async')
      expect(appSafe).toHaveProperty('wrap')
      expect(appSafe).toHaveProperty('wrapAsync')
      expect(typeof appSafe.sync).toBe('function')
      expect(typeof appSafe.async).toBe('function')
      expect(typeof appSafe.wrap).toBe('function')
      expect(typeof appSafe.wrapAsync).toBe('function')
    })

    it('infers error type from parseError return type', () => {
      const appSafe = createSafe({
        parseError: (e) => ({
          code: 'UNKNOWN_ERROR' as const,
          message: e instanceof Error ? e.message : 'Unknown error',
          originalError: e,
        }),
        defaultError: { code: 'UNKNOWN_ERROR' as const, message: 'unknown error', originalError: null },
      })

      const [, error] = appSafe.sync(() => {
        throw new Error('test')
      })

      if (error) {
        expect(error.code).toBe('UNKNOWN_ERROR')
        expect(error.message).toBe('test')
        expect(error.originalError).toBeInstanceOf(Error)
      }
    })

    it('accepts optional default hooks in config', () => {
      const onSuccess = vi.fn()
      const onError = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown error',
        onSuccess,
        onError,
      })

      expect(appSafe).toBeDefined()
    })

    it('validates CreateSafeConfig type', () => {
      const config: CreateSafeConfig<{ code: string }> = {
        parseError: () => ({ code: 'ERR' }),
        defaultError: { code: 'UNKNOWN' },
        onSuccess: (result) => {
          void result
        },
        onError: (error) => {
          const _code: string = error.code
          void _code
        },
      }

      const instance = createSafe(config)
      expect(instance).toBeDefined()
    })

    it('validates SafeInstance type', () => {
      const instance: SafeInstance<string> = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown error',
      })

      expect(instance.sync).toBeDefined()
      expect(instance.async).toBeDefined()
      expect(instance.wrap).toBeDefined()
      expect(instance.wrapAsync).toBeDefined()
    })
  })

  describe('sync method', () => {
    it('returns [result, null] on success', () => {
      const appSafe = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown error',
      })

      const result = appSafe.sync(() => 42)
      expect(result).toEqual([42, null])
    })

    it('returns [null, mappedError] on failure', () => {
      const appSafe = createSafe({
        parseError: (e) => ({
          type: 'error' as const,
          msg: e instanceof Error ? e.message : 'Unknown',
        }),
        defaultError: { type: 'error' as const, msg: 'unknown error' },
      })

      const result = appSafe.sync(() => {
        throw new Error('failed')
      })

      expect(result[0]).toBeNull()
      expect(result[1]).toEqual({ type: 'error', msg: 'failed' })
    })

    it('always uses configured parseError', () => {
      const parseError = vi.fn((e: unknown) => ({
        mapped: true,
        original: e,
      }))

      const appSafe = createSafe({ parseError, defaultError: { mapped: true, original: null } })

      appSafe.sync(() => {
        throw new Error('test')
      })

      expect(parseError).toHaveBeenCalledTimes(1)
      expect(parseError).toHaveBeenCalledWith(expect.any(Error))
    })

    it('does not call parseError on success', () => {
      const parseError = vi.fn((e: unknown) => String(e))
      const appSafe = createSafe({ parseError, defaultError: 'unknown error' })

      appSafe.sync(() => 'success')

      expect(parseError).not.toHaveBeenCalled()
    })

    it('handles various return types', () => {
      const appSafe = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown error',
      })

      expect(appSafe.sync(() => 'string')).toEqual(['string', null])
      expect(appSafe.sync(() => 123)).toEqual([123, null])
      expect(appSafe.sync(() => true)).toEqual([true, null])
      expect(appSafe.sync(() => null)).toEqual([null, null])
      expect(appSafe.sync(() => undefined)).toEqual([undefined, null])
      expect(appSafe.sync(() => ({ foo: 'bar' }))).toEqual([{ foo: 'bar' }, null])
      expect(appSafe.sync(() => [1, 2, 3])).toEqual([[1, 2, 3], null])
    })

    it('handles various thrown types', () => {
      const appSafe = createSafe({
        parseError: (e) => ({ value: e }),
        defaultError: { value: null },
      })

      expect(appSafe.sync(() => { throw new Error('err') })[1]).toEqual({ value: expect.any(Error) })
      expect(appSafe.sync(() => { throw 'string' })[1]).toEqual({ value: 'string' })
      expect(appSafe.sync(() => { throw 404 })[1]).toEqual({ value: 404 })
      expect(appSafe.sync(() => { throw { code: 'ERR' } })[1]).toEqual({ value: { code: 'ERR' } })
      expect(appSafe.sync(() => { throw undefined })[1]).toEqual({ value: undefined })
      expect(appSafe.sync(() => { throw null })[1]).toEqual({ value: null })
    })
  })

  describe('async method', () => {
    it('returns [result, null] on success', async () => {
      const appSafe = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown error',
      })

      const result = await appSafe.async(() => Promise.resolve(42))
      expect(result).toEqual([42, null])
    })

    it('returns [null, mappedError] on rejection', async () => {
      const appSafe = createSafe({
        parseError: (e) => ({
          statusCode: 500,
          message: e instanceof Error ? e.message : 'Unknown',
        }),
        defaultError: { statusCode: 0, message: 'unknown error' },
      })

      const result = await appSafe.async(() => Promise.reject(new Error('async fail')))

      expect(result[0]).toBeNull()
      expect(result[1]).toEqual({ statusCode: 500, message: 'async fail' })
    })

    it('returns [null, mappedError] when async function throws', async () => {
      const appSafe = createSafe({
        parseError: (e) => ({ thrown: true, error: e }),
        defaultError: { thrown: true, error: null },
      })

      const result = await appSafe.async(async () => {
        throw new Error('thrown in async')
      })

      expect(result[0]).toBeNull()
      expect(result[1]).toEqual({ thrown: true, error: expect.any(Error) })
    })

    it('always uses configured parseError', async () => {
      const parseError = vi.fn((e: unknown) => ({ mapped: e }))
      const appSafe = createSafe({ parseError, defaultError: { mapped: null } })

      await appSafe.async(() => Promise.reject('error'))

      expect(parseError).toHaveBeenCalledTimes(1)
      expect(parseError).toHaveBeenCalledWith('error')
    })

    it('does not call parseError on success', async () => {
      const parseError = vi.fn((e: unknown) => String(e))
      const appSafe = createSafe({ parseError, defaultError: 'unknown error' })

      await appSafe.async(() => Promise.resolve('success'))

      expect(parseError).not.toHaveBeenCalled()
    })

    it('handles async functions', async () => {
      const appSafe = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown error',
      })

      const result = await appSafe.async(async () => {
        return 'async result'
      })

      expect(result).toEqual(['async result', null])
    })
  })

  describe('wrap method', () => {
    it('returns a wrapped function', () => {
      const appSafe = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown error',
      })

      const wrapped = appSafe.wrap(() => 42)
      expect(typeof wrapped).toBe('function')
    })

    it('preserves function parameters', () => {
      const appSafe = createSafe({
        parseError: (e) => ({
          error: true,
          msg: e instanceof Error ? e.message : String(e),
        }),
        defaultError: { error: true, msg: 'unknown error' },
      })

      const divide = (a: number, b: number) => {
        if (b === 0) throw new Error('Division by zero')
        return a / b
      }

      const safeDivide = appSafe.wrap(divide)

      expect(safeDivide(10, 2)).toEqual([5, null])
      expect(safeDivide(20, 4)).toEqual([5, null])
      expect(safeDivide(10, 0)).toEqual([null, { error: true, msg: 'Division by zero' }])
    })

    it('wraps JSON.parse with configured error mapping', () => {
      const appSafe = createSafe({
        parseError: (e) => ({
          type: 'parse_error' as const,
          message: e instanceof Error ? e.message : 'Parse failed',
        }),
        defaultError: { type: 'parse_error' as const, message: 'unknown error' },
      })

      const safeJsonParse = appSafe.wrap(JSON.parse)

      expect(safeJsonParse('{"name": "test"}')).toEqual([{ name: 'test' }, null])
      const [, error] = safeJsonParse('{invalid}')
      expect(error?.type).toBe('parse_error')
      expect(typeof error?.message).toBe('string')
      expect(error?.message.length).toBeGreaterThan(0)
    })

    it('can be called multiple times', () => {
      const appSafe = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown error',
      })

      let counter = 0
      const wrapped = appSafe.wrap(() => ++counter)

      expect(wrapped()).toEqual([1, null])
      expect(wrapped()).toEqual([2, null])
      expect(wrapped()).toEqual([3, null])
    })

    it('wraps functions with object parameters', () => {
      type User = { id: number; name: string }

      const appSafe = createSafe({
        parseError: (e) => ({ code: 'VALIDATION_ERROR', message: String(e) }),
        defaultError: { code: 'UNKNOWN', message: 'unknown error' },
      })

      const validateUser = (user: User) => {
        if (!user.name) throw new Error('Name is required')
        if (user.id <= 0) throw new Error('Invalid ID')
        return user
      }

      const safeValidate = appSafe.wrap(validateUser)

      expect(safeValidate({ id: 1, name: 'John' })).toEqual([{ id: 1, name: 'John' }, null])
      expect(safeValidate({ id: 1, name: '' })[0]).toBeNull()
      expect(safeValidate({ id: 0, name: 'John' })[0]).toBeNull()
    })
  })

  describe('wrapAsync method', () => {
    it('returns a wrapped async function', () => {
      const appSafe = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown error',
      })

      const wrapped = appSafe.wrapAsync(() => Promise.resolve(42))
      expect(typeof wrapped).toBe('function')
    })

    it('preserves async function parameters', async () => {
      const appSafe = createSafe({
        parseError: (e) => ({
          code: 'FETCH_ERROR' as const,
          message: e instanceof Error ? e.message : 'Unknown',
        }),
        defaultError: { code: 'FETCH_ERROR' as const, message: 'unknown error' },
      })

      const fetchUser = async (id: number) => {
        if (id <= 0) throw new Error('Invalid ID')
        return { id, name: `User ${id}` }
      }

      const safeFetch = appSafe.wrapAsync(fetchUser)

      expect(await safeFetch(1)).toEqual([{ id: 1, name: 'User 1' }, null])
      expect(await safeFetch(42)).toEqual([{ id: 42, name: 'User 42' }, null])
      expect(await safeFetch(-1)).toEqual([null, { code: 'FETCH_ERROR', message: 'Invalid ID' }])
    })

    it('wraps async functions with multiple parameters', async () => {
      const appSafe = createSafe({
        parseError: (e) => ({
          status: 400,
          error: e instanceof Error ? e.message : 'Unknown',
        }),
        defaultError: { status: 0, error: 'unknown error' },
      })

      const postData = async (endpoint: string, body: Record<string, unknown>) => {
        if (!body.id) throw new Error('Missing required field: id')
        return { success: true, endpoint, body }
      }

      const safePost = appSafe.wrapAsync(postData)

      expect(await safePost('/api/users', { id: 1, name: 'John' })).toEqual([
        { success: true, endpoint: '/api/users', body: { id: 1, name: 'John' } },
        null,
      ])

      expect(await safePost('/api/users', { name: 'John' })).toEqual([
        null,
        { status: 400, error: 'Missing required field: id' },
      ])
    })

    it('can be called multiple times', async () => {
      const appSafe = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown error',
      })

      let counter = 0
      const wrapped = appSafe.wrapAsync(() => Promise.resolve(++counter))

      expect(await wrapped()).toEqual([1, null])
      expect(await wrapped()).toEqual([2, null])
      expect(await wrapped()).toEqual([3, null])
    })
  })

  describe('default hooks from config', () => {
    it('calls default onSuccess on successful sync execution', () => {
      const defaultOnSuccess = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown error',
        onSuccess: defaultOnSuccess,
      })

      appSafe.sync(() => 42)

      expect(defaultOnSuccess).toHaveBeenCalledTimes(1)
      expect(defaultOnSuccess).toHaveBeenCalledWith(42)
    })

    it('calls default onError on failed sync execution', () => {
      const defaultOnError = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => ({
          code: 'ERR',
          message: e instanceof Error ? e.message : 'Unknown',
        }),
        defaultError: { code: 'UNKNOWN', message: 'unknown error' },
        onError: defaultOnError,
      })

      appSafe.sync(() => {
        throw new Error('test error')
      })

      expect(defaultOnError).toHaveBeenCalledTimes(1)
      expect(defaultOnError).toHaveBeenCalledWith({ code: 'ERR', message: 'test error' })
    })

    it('calls default onSuccess on successful async execution', async () => {
      const defaultOnSuccess = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown error',
        onSuccess: defaultOnSuccess,
      })

      await appSafe.async(() => Promise.resolve('async result'))

      expect(defaultOnSuccess).toHaveBeenCalledTimes(1)
      expect(defaultOnSuccess).toHaveBeenCalledWith('async result')
    })

    it('calls default onError on failed async execution', async () => {
      const defaultOnError = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => ({ error: String(e) }),
        defaultError: { error: 'unknown error' },
        onError: defaultOnError,
      })

      await appSafe.async(() => Promise.reject('async error'))

      expect(defaultOnError).toHaveBeenCalledTimes(1)
      expect(defaultOnError).toHaveBeenCalledWith({ error: 'async error' })
    })

    it('calls default onSuccess on wrapped function success', () => {
      const defaultOnSuccess = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown error',
        onSuccess: defaultOnSuccess,
      })

      const safeDivide = appSafe.wrap((a: number, b: number) => a / b)
      safeDivide(10, 2)

      expect(defaultOnSuccess).toHaveBeenCalledWith(5)
    })

    it('calls default onError on wrapped function error', () => {
      const defaultOnError = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => ({ msg: String(e) }),
        defaultError: { msg: 'unknown error' },
        onError: defaultOnError,
      })

      const divide = (a: number, b: number) => {
        if (b === 0) throw new Error('Division by zero')
        return a / b
      }

      const safeDivide = appSafe.wrap(divide)
      safeDivide(10, 0)

      expect(defaultOnError).toHaveBeenCalledWith({ msg: 'Error: Division by zero' })
    })

    it('calls default onSuccess on wrapped async function success', async () => {
      const defaultOnSuccess = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown error',
        onSuccess: defaultOnSuccess,
      })

      const safeFetch = appSafe.wrapAsync(async (id: number) => ({ id }))
      await safeFetch(42)

      expect(defaultOnSuccess).toHaveBeenCalledWith({ id: 42 })
    })

    it('calls default onError on wrapped async function error', async () => {
      const defaultOnError = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => ({ code: 'ERR', msg: String(e) }),
        defaultError: { code: 'ERR', msg: 'unknown error' },
        onError: defaultOnError,
      })

      const safeFetch = appSafe.wrapAsync(async (id: number) => {
        if (id <= 0) throw new Error('Invalid ID')
        return { id }
      })
      await safeFetch(-1)

      expect(defaultOnError).toHaveBeenCalledWith({ code: 'ERR', msg: 'Error: Invalid ID' })
    })

    it('does not call default onError on success', () => {
      const defaultOnSuccess = vi.fn()
      const defaultOnError = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown error',
        onSuccess: defaultOnSuccess,
        onError: defaultOnError,
      })

      appSafe.sync(() => 42)

      expect(defaultOnSuccess).toHaveBeenCalled()
      expect(defaultOnError).not.toHaveBeenCalled()
    })

    it('does not call default onSuccess on error', () => {
      const defaultOnSuccess = vi.fn()
      const defaultOnError = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown error',
        onSuccess: defaultOnSuccess,
        onError: defaultOnError,
      })

      appSafe.sync(() => {
        throw new Error('fail')
      })

      expect(defaultOnSuccess).not.toHaveBeenCalled()
      expect(defaultOnError).toHaveBeenCalled()
    })
  })

  describe('per-call hooks', () => {
    it('supports per-call hooks on sync', () => {
      const onSuccess = vi.fn()
      const onError = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown error',
      })

      appSafe.sync(() => 42, { onSuccess, onError })

      expect(onSuccess).toHaveBeenCalledWith(42, [])
      expect(onError).not.toHaveBeenCalled()
    })

    it('supports per-call hooks on async', async () => {
      const onSuccess = vi.fn()
      const onError = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown error',
      })

      await appSafe.async(() => Promise.resolve('done'), { onSuccess, onError })

      expect(onSuccess).toHaveBeenCalledWith('done', [])
      expect(onError).not.toHaveBeenCalled()
    })

    it('supports per-call hooks on wrap with context', () => {
      const onSuccess = vi.fn()
      const onError = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown error',
      })

      const safeDivide = appSafe.wrap((a: number, b: number) => a / b, { onSuccess, onError })
      safeDivide(10, 2)

      expect(onSuccess).toHaveBeenCalledWith(5, [10, 2])
      expect(onError).not.toHaveBeenCalled()
    })

    it('supports per-call hooks on wrapAsync with context', async () => {
      const onSuccess = vi.fn()
      const onError = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown error',
      })

      const safeFetch = appSafe.wrapAsync(async (id: number) => ({ id }), { onSuccess, onError })
      await safeFetch(42)

      expect(onSuccess).toHaveBeenCalledWith({ id: 42 }, [42])
      expect(onError).not.toHaveBeenCalled()
    })

    it('per-call onSuccess receives correctly typed result', () => {
      const appSafe = createSafe({
        parseError: (e) => String(e),
        defaultError: 'unknown error',
      })

      appSafe.sync(() => ({ name: 'John', age: 30 }), {
        onSuccess: (result) => {
          // TypeScript should infer result as { name: string; age: number }
          const _name: string = result.name
          const _age: number = result.age
          void [_name, _age]
        },
      })
    })

    it('per-call onError receives correctly typed error', () => {
      const appSafe = createSafe({
        parseError: (e) => ({
          code: 'ERR' as const,
          message: e instanceof Error ? e.message : 'Unknown',
        }),
        defaultError: { code: 'ERR' as const, message: 'unknown error' },
      })

      appSafe.sync(
        () => {
          throw new Error('fail')
        },
        {
          onError: (error) => {
            // TypeScript should infer error as { code: 'ERR'; message: string }
            const _code: 'ERR' = error.code
            const _msg: string = error.message
            void [_code, _msg]
          },
        }
      )
    })
  })

  describe('onSettled hook', () => {
    describe('default onSettled from config', () => {
      it('calls default onSettled on successful sync execution', () => {
        const defaultOnSettled = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          defaultError: 'unknown error',
          onSettled: defaultOnSettled,
        })

        appSafe.sync(() => 42)

        expect(defaultOnSettled).toHaveBeenCalledTimes(1)
        expect(defaultOnSettled).toHaveBeenCalledWith(42, null)
      })

      it('calls default onSettled on failed sync execution', () => {
        const defaultOnSettled = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => ({
            code: 'ERR',
            message: e instanceof Error ? e.message : 'Unknown',
          }),
          defaultError: { code: 'UNKNOWN', message: 'unknown error' },
          onSettled: defaultOnSettled,
        })

        appSafe.sync(() => { throw new Error('test error') })

        expect(defaultOnSettled).toHaveBeenCalledTimes(1)
        expect(defaultOnSettled).toHaveBeenCalledWith(null, { code: 'ERR', message: 'test error' })
      })

      it('calls default onSettled on successful async execution', async () => {
        const defaultOnSettled = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          defaultError: 'unknown error',
          onSettled: defaultOnSettled,
        })

        await appSafe.async(() => Promise.resolve('async result'))

        expect(defaultOnSettled).toHaveBeenCalledTimes(1)
        expect(defaultOnSettled).toHaveBeenCalledWith('async result', null)
      })

      it('calls default onSettled on failed async execution', async () => {
        const defaultOnSettled = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => ({ error: String(e) }),
          defaultError: { error: 'unknown error' },
          onSettled: defaultOnSettled,
        })

        await appSafe.async(() => Promise.reject('async error'))

        expect(defaultOnSettled).toHaveBeenCalledTimes(1)
        expect(defaultOnSettled).toHaveBeenCalledWith(null, { error: 'async error' })
      })

      it('calls default onSettled on wrapped function success', () => {
        const defaultOnSettled = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          defaultError: 'unknown error',
          onSettled: defaultOnSettled,
        })

        const safeDivide = appSafe.wrap((a: number, b: number) => a / b)
        safeDivide(10, 2)

        expect(defaultOnSettled).toHaveBeenCalledWith(5, null)
      })

      it('calls default onSettled on wrapped function error', () => {
        const defaultOnSettled = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => ({ msg: String(e) }),
          defaultError: { msg: 'unknown error' },
          onSettled: defaultOnSettled,
        })

        const divide = (a: number, b: number) => {
          if (b === 0) throw new Error('Division by zero')
          return a / b
        }

        const safeDivide = appSafe.wrap(divide)
        safeDivide(10, 0)

        expect(defaultOnSettled).toHaveBeenCalledWith(null, { msg: 'Error: Division by zero' })
      })

      it('calls default onSettled on wrapped async function success', async () => {
        const defaultOnSettled = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          defaultError: 'unknown error',
          onSettled: defaultOnSettled,
        })

        const safeFetch = appSafe.wrapAsync(async (id: number) => ({ id }))
        await safeFetch(42)

        expect(defaultOnSettled).toHaveBeenCalledWith({ id: 42 }, null)
      })

      it('calls default onSettled on wrapped async function error', async () => {
        const defaultOnSettled = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => ({ code: 'ERR', msg: String(e) }),
          defaultError: { code: 'ERR', msg: 'unknown error' },
          onSettled: defaultOnSettled,
        })

        const safeFetch = appSafe.wrapAsync(async (id: number) => {
          if (id <= 0) throw new Error('Invalid ID')
          return { id }
        })
        await safeFetch(-1)

        expect(defaultOnSettled).toHaveBeenCalledWith(null, { code: 'ERR', msg: 'Error: Invalid ID' })
      })
    })

    describe('per-call onSettled hooks', () => {
      it('supports per-call onSettled on sync', () => {
        const onSettled = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          defaultError: 'unknown error',
        })

        appSafe.sync(() => 42, { onSettled })

        expect(onSettled).toHaveBeenCalledWith(42, null, [])
      })

      it('supports per-call onSettled on async', async () => {
        const onSettled = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          defaultError: 'unknown error',
        })

        await appSafe.async(() => Promise.resolve('done'), { onSettled })

        expect(onSettled).toHaveBeenCalledWith('done', null, [])
      })

      it('supports per-call onSettled on wrap with context', () => {
        const onSettled = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          defaultError: 'unknown error',
        })

        const safeDivide = appSafe.wrap((a: number, b: number) => a / b, { onSettled })
        safeDivide(10, 2)

        expect(onSettled).toHaveBeenCalledWith(5, null, [10, 2])
      })

      it('supports per-call onSettled on wrapAsync with context', async () => {
        const onSettled = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          defaultError: 'unknown error',
        })

        const safeFetch = appSafe.wrapAsync(async (id: number) => ({ id }), { onSettled })
        await safeFetch(42)

        expect(onSettled).toHaveBeenCalledWith({ id: 42 }, null, [42])
      })
    })

    describe('onSettled merging behavior', () => {
      it('calls default onSettled first, then per-call onSettled on success', () => {
        const callOrder: string[] = []
        const defaultOnSettled = vi.fn(() => callOrder.push('default'))
        const perCallOnSettled = vi.fn(() => callOrder.push('per-call'))

        const appSafe = createSafe({
          parseError: (e) => String(e),
          defaultError: 'unknown error',
          onSettled: defaultOnSettled,
        })

        appSafe.sync(() => 42, { onSettled: perCallOnSettled })

        expect(callOrder).toEqual(['default', 'per-call'])
        expect(defaultOnSettled).toHaveBeenCalledWith(42, null)
        expect(perCallOnSettled).toHaveBeenCalledWith(42, null, [])
      })

      it('calls default onSettled first, then per-call onSettled on error', () => {
        const callOrder: string[] = []
        const defaultOnSettled = vi.fn(() => callOrder.push('default'))
        const perCallOnSettled = vi.fn(() => callOrder.push('per-call'))

        const appSafe = createSafe({
          parseError: (e) => ({ msg: String(e) }),
          defaultError: { msg: 'unknown error' },
          onSettled: defaultOnSettled,
        })

        appSafe.sync(
          () => { throw new Error('fail') },
          { onSettled: perCallOnSettled },
        )

        expect(callOrder).toEqual(['default', 'per-call'])
        expect(defaultOnSettled).toHaveBeenCalledWith(null, { msg: 'Error: fail' })
        expect(perCallOnSettled).toHaveBeenCalledWith(null, { msg: 'Error: fail' }, [])
      })

      it('calls both default and per-call onSettled on async success', async () => {
        const defaultOnSettled = vi.fn()
        const perCallOnSettled = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          defaultError: 'unknown error',
          onSettled: defaultOnSettled,
        })

        await appSafe.async(() => Promise.resolve('async'), { onSettled: perCallOnSettled })

        expect(defaultOnSettled).toHaveBeenCalledWith('async', null)
        expect(perCallOnSettled).toHaveBeenCalledWith('async', null, [])
      })

      it('calls both default and per-call onSettled on async error', async () => {
        const defaultOnSettled = vi.fn()
        const perCallOnSettled = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          defaultError: 'unknown error',
          onSettled: defaultOnSettled,
        })

        await appSafe.async(() => Promise.reject('fail'), { onSettled: perCallOnSettled })

        expect(defaultOnSettled).toHaveBeenCalledWith(null, 'fail')
        expect(perCallOnSettled).toHaveBeenCalledWith(null, 'fail', [])
      })

      it('calls both onSettled hooks on wrap success with context', () => {
        const defaultOnSettled = vi.fn()
        const perCallOnSettled = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          defaultError: 'unknown error',
          onSettled: defaultOnSettled,
        })

        const safeDivide = appSafe.wrap((a: number, b: number) => a / b, {
          onSettled: perCallOnSettled,
        })
        safeDivide(10, 2)

        expect(defaultOnSettled).toHaveBeenCalledWith(5, null)
        expect(perCallOnSettled).toHaveBeenCalledWith(5, null, [10, 2])
      })

      it('calls both onSettled hooks on wrap error with context', () => {
        const defaultOnSettled = vi.fn()
        const perCallOnSettled = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => ({ error: String(e) }),
          defaultError: { error: 'unknown error' },
          onSettled: defaultOnSettled,
        })

        const divide = (a: number, b: number) => {
          if (b === 0) throw new Error('Division by zero')
          return a / b
        }

        const safeDivide = appSafe.wrap(divide, { onSettled: perCallOnSettled })
        safeDivide(10, 0)

        expect(defaultOnSettled).toHaveBeenCalledWith(null, { error: 'Error: Division by zero' })
        expect(perCallOnSettled).toHaveBeenCalledWith(null, { error: 'Error: Division by zero' }, [10, 0])
      })

      it('calls both onSettled hooks on wrapAsync success', async () => {
        const defaultOnSettled = vi.fn()
        const perCallOnSettled = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          defaultError: 'unknown error',
          onSettled: defaultOnSettled,
        })

        const safeFetch = appSafe.wrapAsync(async (id: number) => ({ id }), {
          onSettled: perCallOnSettled,
        })
        await safeFetch(42)

        expect(defaultOnSettled).toHaveBeenCalledWith({ id: 42 }, null)
        expect(perCallOnSettled).toHaveBeenCalledWith({ id: 42 }, null, [42])
      })

      it('calls both onSettled hooks on wrapAsync error', async () => {
        const defaultOnSettled = vi.fn()
        const perCallOnSettled = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => ({ code: 'ERR', msg: String(e) }),
          defaultError: { code: 'ERR', msg: 'unknown error' },
          onSettled: defaultOnSettled,
        })

        const safeFetch = appSafe.wrapAsync(
          async (id: number) => {
            if (id <= 0) throw new Error('Invalid')
            return { id }
          },
          { onSettled: perCallOnSettled },
        )
        await safeFetch(-1)

        expect(defaultOnSettled).toHaveBeenCalledWith(null, { code: 'ERR', msg: 'Error: Invalid' })
        expect(perCallOnSettled).toHaveBeenCalledWith(null, { code: 'ERR', msg: 'Error: Invalid' }, [-1])
      })
    })

    describe('onSettled execution order relative to onSuccess/onError', () => {
      it('fires onSuccess then onSettled on success (default hooks)', () => {
        const callOrder: string[] = []

        const appSafe = createSafe({
          parseError: (e) => String(e),
          defaultError: 'unknown error',
          onSuccess: () => callOrder.push('onSuccess'),
          onError: () => callOrder.push('onError'),
          onSettled: () => callOrder.push('onSettled'),
        })

        appSafe.sync(() => 42)

        expect(callOrder).toEqual(['onSuccess', 'onSettled'])
      })

      it('fires onError then onSettled on error (default hooks)', () => {
        const callOrder: string[] = []

        const appSafe = createSafe({
          parseError: (e) => String(e),
          defaultError: 'unknown error',
          onSuccess: () => callOrder.push('onSuccess'),
          onError: () => callOrder.push('onError'),
          onSettled: () => callOrder.push('onSettled'),
        })

        appSafe.sync(() => { throw new Error('fail') })

        expect(callOrder).toEqual(['onError', 'onSettled'])
      })

      it('full hook cascade order: default onSuccess, per-call onSuccess, default onSettled, per-call onSettled', () => {
        const callOrder: string[] = []

        const appSafe = createSafe({
          parseError: (e) => String(e),
          defaultError: 'unknown error',
          onSuccess: () => callOrder.push('default-onSuccess'),
          onSettled: () => callOrder.push('default-onSettled'),
        })

        appSafe.sync(() => 42, {
          onSuccess: () => callOrder.push('perCall-onSuccess'),
          onSettled: () => callOrder.push('perCall-onSettled'),
        })

        expect(callOrder).toEqual([
          'default-onSuccess',
          'perCall-onSuccess',
          'default-onSettled',
          'perCall-onSettled',
        ])
      })

      it('full hook cascade order on error: default onError, per-call onError, default onSettled, per-call onSettled', () => {
        const callOrder: string[] = []

        const appSafe = createSafe({
          parseError: (e) => String(e),
          defaultError: 'unknown error',
          onError: () => callOrder.push('default-onError'),
          onSettled: () => callOrder.push('default-onSettled'),
        })

        appSafe.sync(
          () => { throw new Error('fail') },
          {
            onError: () => callOrder.push('perCall-onError'),
            onSettled: () => callOrder.push('perCall-onSettled'),
          },
        )

        expect(callOrder).toEqual([
          'default-onError',
          'perCall-onError',
          'default-onSettled',
          'perCall-onSettled',
        ])
      })
    })

    describe('onSettled with retry', () => {
      it('onSettled fires only once after all retries exhausted', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'))
        const defaultOnSettled = vi.fn()
        const defaultOnRetry = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          defaultError: 'unknown error',
          retry: { times: 2 },
          onRetry: defaultOnRetry,
          onSettled: defaultOnSettled,
        })

        await appSafe.async(fn)

        expect(defaultOnRetry).toHaveBeenCalledTimes(2)
        expect(defaultOnSettled).toHaveBeenCalledTimes(1)
        expect(defaultOnSettled).toHaveBeenCalledWith(null, expect.any(String))
      })

      it('onSettled fires once on success after retries', async () => {
        let attempts = 0
        const fn = vi.fn().mockImplementation(async () => {
          attempts++
          if (attempts < 3) throw new Error('fail')
          return 'success'
        })
        const defaultOnSettled = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          defaultError: 'unknown error',
          retry: { times: 3 },
          onSettled: defaultOnSettled,
        })

        await appSafe.async(fn)

        expect(defaultOnSettled).toHaveBeenCalledTimes(1)
        expect(defaultOnSettled).toHaveBeenCalledWith('success', null)
      })
    })

    describe('onSettled works when only onSettled is provided', () => {
      it('works without onSuccess or onError in config', () => {
        const defaultOnSettled = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          defaultError: 'unknown error',
          onSettled: defaultOnSettled,
        })

        appSafe.sync(() => 42)

        expect(defaultOnSettled).toHaveBeenCalledWith(42, null)
      })

      it('works without onSuccess or onError in per-call hooks', () => {
        const onSettled = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
        })

        appSafe.sync(() => 42, { onSettled })

        expect(onSettled).toHaveBeenCalledWith(42, null, [])
      })
    })
  })

  describe('hooks merging behavior', () => {
    it('calls default hooks first, then per-call hooks on success', () => {
      const callOrder: string[] = []
      const defaultOnSuccess = vi.fn(() => callOrder.push('default'))
      const perCallOnSuccess = vi.fn(() => callOrder.push('per-call'))

      const appSafe = createSafe({
        parseError: (e) => String(e),
        onSuccess: defaultOnSuccess,
      })

      appSafe.sync(() => 42, { onSuccess: perCallOnSuccess })

      expect(callOrder).toEqual(['default', 'per-call'])
      expect(defaultOnSuccess).toHaveBeenCalledWith(42)
      expect(perCallOnSuccess).toHaveBeenCalledWith(42, [])
    })

    it('calls default hooks first, then per-call hooks on error', () => {
      const callOrder: string[] = []
      const defaultOnError = vi.fn(() => callOrder.push('default'))
      const perCallOnError = vi.fn(() => callOrder.push('per-call'))

      const appSafe = createSafe({
        parseError: (e) => ({ msg: String(e) }),
        onError: defaultOnError,
      })

      appSafe.sync(
        () => {
          throw new Error('fail')
        },
        { onError: perCallOnError }
      )

      expect(callOrder).toEqual(['default', 'per-call'])
      expect(defaultOnError).toHaveBeenCalledWith({ msg: 'Error: fail' })
      expect(perCallOnError).toHaveBeenCalledWith({ msg: 'Error: fail' }, [])
    })

    it('calls both default and per-call hooks on async success', async () => {
      const defaultOnSuccess = vi.fn()
      const perCallOnSuccess = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => String(e),
        onSuccess: defaultOnSuccess,
      })

      await appSafe.async(() => Promise.resolve('async'), { onSuccess: perCallOnSuccess })

      expect(defaultOnSuccess).toHaveBeenCalledWith('async')
      expect(perCallOnSuccess).toHaveBeenCalledWith('async', [])
    })

    it('calls both default and per-call hooks on async error', async () => {
      const defaultOnError = vi.fn()
      const perCallOnError = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => String(e),
        onError: defaultOnError,
      })

      await appSafe.async(() => Promise.reject('fail'), { onError: perCallOnError })

      expect(defaultOnError).toHaveBeenCalledWith('fail')
      expect(perCallOnError).toHaveBeenCalledWith('fail', [])
    })

    it('calls both hooks on wrap success with context', () => {
      const defaultOnSuccess = vi.fn()
      const perCallOnSuccess = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => String(e),
        onSuccess: defaultOnSuccess,
      })

      const safeDivide = appSafe.wrap((a: number, b: number) => a / b, {
        onSuccess: perCallOnSuccess,
      })
      safeDivide(10, 2)

      expect(defaultOnSuccess).toHaveBeenCalledWith(5)
      expect(perCallOnSuccess).toHaveBeenCalledWith(5, [10, 2])
    })

    it('calls both hooks on wrap error with context', () => {
      const defaultOnError = vi.fn()
      const perCallOnError = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => ({ error: String(e) }),
        onError: defaultOnError,
      })

      const divide = (a: number, b: number) => {
        if (b === 0) throw new Error('Division by zero')
        return a / b
      }

      const safeDivide = appSafe.wrap(divide, { onError: perCallOnError })
      safeDivide(10, 0)

      expect(defaultOnError).toHaveBeenCalledWith({ error: 'Error: Division by zero' })
      expect(perCallOnError).toHaveBeenCalledWith({ error: 'Error: Division by zero' }, [10, 0])
    })

    it('calls both hooks on wrapAsync success with context', async () => {
      const defaultOnSuccess = vi.fn()
      const perCallOnSuccess = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => String(e),
        onSuccess: defaultOnSuccess,
      })

      const safeFetch = appSafe.wrapAsync(async (id: number) => ({ id }), {
        onSuccess: perCallOnSuccess,
      })
      await safeFetch(42)

      expect(defaultOnSuccess).toHaveBeenCalledWith({ id: 42 })
      expect(perCallOnSuccess).toHaveBeenCalledWith({ id: 42 }, [42])
    })

    it('calls both hooks on wrapAsync error with context', async () => {
      const defaultOnError = vi.fn()
      const perCallOnError = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => ({ code: 'ERR', msg: String(e) }),
        onError: defaultOnError,
      })

      const safeFetch = appSafe.wrapAsync(
        async (id: number) => {
          if (id <= 0) throw new Error('Invalid')
          return { id }
        },
        { onError: perCallOnError }
      )
      await safeFetch(-1)

      expect(defaultOnError).toHaveBeenCalledWith({ code: 'ERR', msg: 'Error: Invalid' })
      expect(perCallOnError).toHaveBeenCalledWith({ code: 'ERR', msg: 'Error: Invalid' }, [-1])
    })

    it('works when only default hooks are provided', () => {
      const defaultOnSuccess = vi.fn()
      const defaultOnError = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => String(e),
        onSuccess: defaultOnSuccess,
        onError: defaultOnError,
      })

      appSafe.sync(() => 42)

      expect(defaultOnSuccess).toHaveBeenCalledWith(42)
      expect(defaultOnError).not.toHaveBeenCalled()
    })

    it('works when only per-call hooks are provided', () => {
      const perCallOnSuccess = vi.fn()
      const perCallOnError = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => String(e),
      })

      appSafe.sync(() => 42, { onSuccess: perCallOnSuccess, onError: perCallOnError })

      expect(perCallOnSuccess).toHaveBeenCalledWith(42, [])
      expect(perCallOnError).not.toHaveBeenCalled()
    })

    it('works when no hooks are provided', () => {
      const appSafe = createSafe({
        parseError: (e) => String(e),
      })

      const result = appSafe.sync(() => 42)

      expect(result).toEqual([42, null])
    })
  })

  describe('multiple instances', () => {
    it('allows creating multiple instances with different error types', () => {
      const apiSafe = createSafe({
        parseError: (e) => ({
          type: 'api_error' as const,
          message: String(e),
        }),
      })

      const dbSafe = createSafe({
        parseError: (e) => ({
          type: 'db_error' as const,
          query: 'unknown',
          original: e,
        }),
      })

      const [, apiError] = apiSafe.sync(() => {
        throw new Error('API failed')
      })
      const [, dbError] = dbSafe.sync(() => {
        throw new Error('DB failed')
      })

      expect(apiError?.type).toBe('api_error')
      expect(dbError?.type).toBe('db_error')
      expect(dbError?.query).toBe('unknown')
    })

    it('instances are independent', () => {
      const onSuccess1 = vi.fn()
      const onSuccess2 = vi.fn()

      const safe1 = createSafe({
        parseError: (e) => String(e),
        onSuccess: onSuccess1,
      })

      const safe2 = createSafe({
        parseError: (e) => ({ error: e }),
        onSuccess: onSuccess2,
      })

      safe1.sync(() => 'result1')
      safe2.sync(() => 'result2')

      expect(onSuccess1).toHaveBeenCalledWith('result1')
      expect(onSuccess1).not.toHaveBeenCalledWith('result2')
      expect(onSuccess2).toHaveBeenCalledWith('result2')
      expect(onSuccess2).not.toHaveBeenCalledWith('result1')
    })

    it('different instances can have different hook behaviors', () => {
      const log1: string[] = []
      const log2: string[] = []

      const loggingSafe = createSafe({
        parseError: (e) => String(e),
        onSuccess: () => log1.push('success'),
        onError: () => log1.push('error'),
      })

      const silentSafe = createSafe({
        parseError: (e) => String(e),
      })

      loggingSafe.sync(() => 42)
      silentSafe.sync(() => 42)
      loggingSafe.sync(() => { throw new Error('fail') })
      silentSafe.sync(() => { throw new Error('fail') })

      expect(log1).toEqual(['success', 'error'])
      expect(log2).toEqual([])
    })
  })

  describe('edge cases', () => {
    it('handles parseError that throws — returns defaultError as fallback', () => {
      const appSafe = createSafe({
        parseError: () => {
          throw new Error('parseError threw')
        },
        defaultError: 'factory fallback',
      })

      // When parseError throws, defaultError is returned instead of propagating
      const result = appSafe.sync(() => {
        throw new Error('original')
      })
      expect(result[0]).toBeNull()
      expect(result[1]).toBe('factory fallback')
    })

    it('createSafe with defaultError returns it when parseError throws', () => {
      const defaultErr = { code: 'DEFAULT' as const, message: 'fallback' }
      const appSafe = createSafe({
        parseError: () => { throw new Error('parseError broke') },
        defaultError: defaultErr,
      })

      const result = appSafe.sync(() => { throw new Error('original') })
      expect(result[0]).toBeNull()
      expect(result[1]).toBe(defaultErr)
    })

    it('per-call defaultError overrides factory defaultError', () => {
      const factoryDefault = { code: 'FACTORY' as const }
      const perCallDefault = { code: 'PER_CALL' as const }

      const appSafe = createSafe({
        parseError: () => { throw new Error('parseError broke') },
        defaultError: factoryDefault,
      })

      const result = appSafe.sync(
        () => { throw new Error('original') },
        { defaultError: perCallDefault as any },
      )
      expect(result[0]).toBeNull()
      expect(result[1]).toBe(perCallDefault)
    })

    it('parseError throwing calls onHookError with hookName parseError via createSafe', () => {
      const onHookError = vi.fn()
      const parseErrorException = new Error('parseError broke')

      const appSafe = createSafe({
        parseError: () => { throw parseErrorException },
        defaultError: 'fallback',
        onHookError,
      })

      appSafe.sync(() => { throw new Error('original') })
      expect(onHookError).toHaveBeenCalledWith(parseErrorException, 'parseError')
    })

    it('handles default onSuccess that throws (swallowed, success result returned)', () => {
      const appSafe = createSafe({
        parseError: (e) => ({
          source: 'hook',
          message: e instanceof Error ? e.message : 'Unknown',
        }),
        onSuccess: () => {
          throw new Error('onSuccess threw')
        },
      })

      // Hook errors are swallowed — the successful result is still returned
      const result = appSafe.sync(() => 42)
      expect(result[0]).toBe(42)
      expect(result[1]).toBeNull()
    })

    it('handles default onError that throws (swallowed, error result returned)', () => {
      const appSafe = createSafe({
        parseError: (e) => String(e),
        onError: () => {
          throw new Error('onError threw')
        },
      })

      // Hook errors are swallowed — the original error result is still returned
      const result = appSafe.sync(() => {
        throw new Error('original')
      })
      expect(result[0]).toBeNull()
      expect(result[1]).toBe('Error: original')
    })

    it('per-call onSuccess still runs when default onSuccess throws', () => {
      const perCallOnSuccess = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => String(e),
        onSuccess: () => {
          throw new Error('default onSuccess threw')
        },
      })

      const result = appSafe.sync(() => 42, { onSuccess: perCallOnSuccess })

      expect(perCallOnSuccess).toHaveBeenCalledWith(42, [])
      expect(result).toEqual([42, null])
    })

    it('per-call onError still runs when default onError throws', () => {
      const perCallOnError = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => String(e),
        onError: () => {
          throw new Error('default onError threw')
        },
      })

      const result = appSafe.sync(
        () => { throw new Error('fail') },
        { onError: perCallOnError },
      )

      expect(perCallOnError).toHaveBeenCalledWith('Error: fail', [])
      expect(result[0]).toBeNull()
      expect(result[1]).toBe('Error: fail')
    })

    it('per-call onSettled still runs when default onSettled throws', () => {
      const perCallOnSettled = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => String(e),
        onSettled: () => {
          throw new Error('default onSettled threw')
        },
      })

      const result = appSafe.sync(() => 42, { onSettled: perCallOnSettled })

      expect(perCallOnSettled).toHaveBeenCalledWith(42, null, [])
      expect(result).toEqual([42, null])
    })

    it('per-call onRetry still runs when default onRetry throws (async)', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'))
      const perCallOnRetry = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => String(e),
        retry: { times: 1 },
        onRetry: () => {
          throw new Error('default onRetry threw')
        },
      })

      await appSafe.async(fn, { onRetry: perCallOnRetry })

      expect(perCallOnRetry).toHaveBeenCalledWith('Error: fail', 1, [])
    })

    it('per-call async onSuccess still runs when default onSuccess throws', async () => {
      const perCallOnSuccess = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => String(e),
        onSuccess: () => {
          throw new Error('default onSuccess threw')
        },
      })

      const result = await appSafe.async(
        () => Promise.resolve('done'),
        { onSuccess: perCallOnSuccess },
      )

      expect(perCallOnSuccess).toHaveBeenCalledWith('done', [])
      expect(result).toEqual(['done', null])
    })

    it('handles empty config with only parseError', () => {
      const appSafe = createSafe({
        parseError: (e) => e,
      })

      const [result] = appSafe.sync(() => 'works')
      expect(result).toBe('works')
    })

    it('parseError can return the original error', () => {
      const appSafe = createSafe({
        parseError: (e) => e as Error,
      })

      const originalError = new Error('original')
      const [, error] = appSafe.sync(() => {
        throw originalError
      })

      expect(error).toBe(originalError)
    })

    it('parseError can return a completely different type', () => {
      const appSafe = createSafe({
        parseError: () => 42,
      })

      const [, error] = appSafe.sync(() => {
        throw new Error('ignored')
      })

      expect(error).toBe(42)
    })
  })

  describe('type safety', () => {
    it('infers correct SafeResult type from sync', () => {
      const appSafe = createSafe({
        parseError: (e) => ({
          code: 'ERR',
          message: e instanceof Error ? e.message : 'Unknown',
        }),
      })

      const result: SafeResult<number, { code: string; message: string }> = appSafe.sync(() => 42)

      expect(result).toEqual([42, null])
    })

    it('infers correct SafeResult type from async', async () => {
      const appSafe = createSafe({
        parseError: (e) => ({ error: String(e) }),
      })

      const result: SafeResult<string, { error: string }> = await appSafe.async(() =>
        Promise.resolve('hello')
      )

      expect(result).toEqual(['hello', null])
    })

    it('infers correct wrapped function type', () => {
      const appSafe = createSafe({
        parseError: (e) => String(e),
      })

      const wrapped: (a: number, b: number) => SafeResult<number, string> = appSafe.wrap(
        (a: number, b: number) => a + b
      )

      expect(wrapped(1, 2)).toEqual([3, null])
    })

    it('infers correct wrapped async function type', async () => {
      const appSafe = createSafe({
        parseError: (e) => ({ err: String(e) }),
      })

      const wrapped: (id: number) => Promise<SafeResult<{ id: number }, { err: string }>> =
        appSafe.wrapAsync(async (id: number) => ({ id }))

      expect(await wrapped(42)).toEqual([{ id: 42 }, null])
    })

    it('rejects falsy parseError return types at compile time', () => {
      // @ts-expect-error — null is falsy, breaks if (error) idiom
      createSafe({ parseError: () => null })
      // @ts-expect-error — undefined is falsy
      createSafe({ parseError: () => undefined })
      // @ts-expect-error — false is falsy
      createSafe({ parseError: () => false })
    })
  })

  describe('retry configuration', () => {
    describe('default retry from factory', () => {
      it('uses default retry config from factory', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'))
        const onRetry = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          retry: { times: 2 },
          onRetry,
        })

        await appSafe.async(fn)

        expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
        expect(onRetry).toHaveBeenCalledTimes(2)
      })

      it('uses default retry config on wrapAsync', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'))
        const onRetry = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          retry: { times: 2 },
          onRetry,
        })

        const wrapped = appSafe.wrapAsync(fn)
        await wrapped()

        expect(fn).toHaveBeenCalledTimes(3)
        expect(onRetry).toHaveBeenCalledTimes(2)
      })

      it('calls default onRetry with error and attempt', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('test error'))
        const defaultOnRetry = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => ({
            code: 'ERR',
            message: e instanceof Error ? e.message : 'unknown',
          }),
          retry: { times: 2 },
          onRetry: defaultOnRetry,
        })

        await appSafe.async(fn)

        expect(defaultOnRetry).toHaveBeenCalledTimes(2)
        expect(defaultOnRetry).toHaveBeenNthCalledWith(
          1,
          { code: 'ERR', message: 'test error' },
          1
        )
        expect(defaultOnRetry).toHaveBeenNthCalledWith(
          2,
          { code: 'ERR', message: 'test error' },
          2
        )
      })
    })

    describe('per-call retry overrides default', () => {
      it('per-call retry completely overrides default retry', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'))

        const appSafe = createSafe({
          parseError: (e) => String(e),
          retry: { times: 5 }, // default: 5 retries
        })

        await appSafe.async(fn, {
          retry: { times: 1 }, // override: only 1 retry
        })

        expect(fn).toHaveBeenCalledTimes(2) // initial + 1 retry
      })

      it('per-call retry can disable retries with times: 0', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'))
        const defaultOnRetry = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          retry: { times: 3 },
          onRetry: defaultOnRetry,
        })

        await appSafe.async(fn, {
          retry: { times: 0 },
        })

        expect(fn).toHaveBeenCalledTimes(1) // no retries
        expect(defaultOnRetry).not.toHaveBeenCalled()
      })

      it('per-call retry overrides default on wrapAsync', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'))

        const appSafe = createSafe({
          parseError: (e) => String(e),
          retry: { times: 5 },
        })

        const wrapped = appSafe.wrapAsync(fn, {
          retry: { times: 2 },
        })
        await wrapped()

        expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
      })
    })

    describe('onRetry hook merging', () => {
      it('calls both default and per-call onRetry hooks', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'))
        const defaultOnRetry = vi.fn()
        const perCallOnRetry = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          retry: { times: 1 },
          onRetry: defaultOnRetry,
        })

        await appSafe.async(fn, {
          onRetry: perCallOnRetry,
        })

        expect(defaultOnRetry).toHaveBeenCalledTimes(1)
        expect(perCallOnRetry).toHaveBeenCalledTimes(1)
      })

      it('calls default onRetry first, then per-call onRetry', async () => {
        const callOrder: string[] = []
        const fn = vi.fn().mockRejectedValue(new Error('fail'))
        const defaultOnRetry = vi.fn(() => callOrder.push('default'))
        const perCallOnRetry = vi.fn(() => callOrder.push('per-call'))

        const appSafe = createSafe({
          parseError: (e) => String(e),
          retry: { times: 1 },
          onRetry: defaultOnRetry,
        })

        await appSafe.async(fn, {
          onRetry: perCallOnRetry,
        })

        expect(callOrder).toEqual(['default', 'per-call'])
      })

      it('per-call onRetry receives context', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'))
        const perCallOnRetry = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          retry: { times: 1 },
        })

        const wrapped = appSafe.wrapAsync(
          async (id: number, name: string) => {
            throw new Error('fail')
          },
          {
            onRetry: perCallOnRetry,
          }
        )

        await wrapped(42, 'test')

        expect(perCallOnRetry).toHaveBeenCalledWith('Error: fail', 1, [42, 'test'])
      })
    })

    describe('retry with onError', () => {
      it('onError only fires after all retries exhausted', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'))
        const defaultOnError = vi.fn()
        const defaultOnRetry = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          retry: { times: 2 },
          onRetry: defaultOnRetry,
          onError: defaultOnError,
        })

        await appSafe.async(fn)

        expect(defaultOnRetry).toHaveBeenCalledTimes(2)
        expect(defaultOnError).toHaveBeenCalledTimes(1)
      })

      it('per-call onError works with retry', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'))
        const perCallOnError = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          retry: { times: 1 },
        })

        await appSafe.async(fn, {
          onError: perCallOnError,
        })

        expect(perCallOnError).toHaveBeenCalledTimes(1)
        expect(perCallOnError).toHaveBeenCalledWith('Error: fail', [])
      })
    })

    describe('retry with success', () => {
      it('succeeds after partial failures', async () => {
        let attempts = 0
        const fn = vi.fn().mockImplementation(async () => {
          attempts++
          if (attempts < 3) throw new Error('fail')
          return 'success'
        })
        const defaultOnRetry = vi.fn()
        const defaultOnSuccess = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          retry: { times: 3 },
          onRetry: defaultOnRetry,
          onSuccess: defaultOnSuccess,
        })

        const result = await appSafe.async(fn)

        expect(result).toEqual(['success', null])
        expect(defaultOnRetry).toHaveBeenCalledTimes(2)
        expect(defaultOnSuccess).toHaveBeenCalledTimes(1)
        expect(defaultOnSuccess).toHaveBeenCalledWith('success')
      })
    })

    describe('waitBefore configuration', () => {
      it('uses default waitBefore from factory', async () => {
        vi.useFakeTimers()
        const fn = vi.fn().mockRejectedValue(new Error('fail'))
        const waitBefore = vi.fn().mockReturnValue(100)

        const appSafe = createSafe({
          parseError: (e) => String(e),
          retry: { times: 2, waitBefore },
        })

        const promise = appSafe.async(fn)
        await vi.runAllTimersAsync()
        await promise

        expect(waitBefore).toHaveBeenCalledTimes(2)
        expect(waitBefore).toHaveBeenNthCalledWith(1, 1)
        expect(waitBefore).toHaveBeenNthCalledWith(2, 2)

        vi.useRealTimers()
      })

      it('per-call waitBefore overrides default', async () => {
        vi.useFakeTimers()
        const fn = vi.fn().mockRejectedValue(new Error('fail'))
        const defaultWaitBefore = vi.fn().mockReturnValue(1000)
        const perCallWaitBefore = vi.fn().mockReturnValue(10)

        const appSafe = createSafe({
          parseError: (e) => String(e),
          retry: { times: 1, waitBefore: defaultWaitBefore },
        })

        const promise = appSafe.async(fn, {
          retry: { times: 1, waitBefore: perCallWaitBefore },
        })
        await vi.runAllTimersAsync()
        await promise

        expect(defaultWaitBefore).not.toHaveBeenCalled()
        expect(perCallWaitBefore).toHaveBeenCalledTimes(1)

        vi.useRealTimers()
      })
    })

    describe('no default retry', () => {
      it('works without default retry config', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'))
        const perCallOnRetry = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
        })

        await appSafe.async(fn, {
          retry: { times: 2 },
          onRetry: perCallOnRetry,
        })

        expect(fn).toHaveBeenCalledTimes(3)
        expect(perCallOnRetry).toHaveBeenCalledTimes(2)
      })

      it('does not retry without any retry config', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'))

        const appSafe = createSafe({
          parseError: (e) => String(e),
        })

        await appSafe.async(fn)

        expect(fn).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('abortAfter configuration', () => {
    describe('default abortAfter from factory', () => {
      it('uses default abortAfter config from factory', async () => {
        vi.useFakeTimers()

        const fn = vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve('done'), 1000))
        )

        const appSafe = createSafe({
          parseError: (e) => ({
            type: e instanceof TimeoutError ? 'timeout' : 'error',
            message: e instanceof Error ? e.message : 'Unknown',
          }),
          abortAfter: 100,
        })

        const promise = appSafe.async(fn)
        await vi.advanceTimersByTimeAsync(100)
        const result = await promise

        expect(result[0]).toBeNull()
        expect(result[1]).toEqual({
          type: 'timeout',
          message: 'Operation timed out after 100ms',
        })

        vi.useRealTimers()
      })

      it('uses default abortAfter on wrapAsync', async () => {
        vi.useFakeTimers()

        const fn = (id: number) =>
          new Promise((resolve) => setTimeout(() => resolve({ id }), 1000))

        const appSafe = createSafe({
          parseError: (e) => String(e),
          abortAfter: 100,
        })

        const safeFn = appSafe.wrapAsync(fn)
        const promise = safeFn(42)
        await vi.advanceTimersByTimeAsync(100)
        const result = await promise

        expect(result[0]).toBeNull()
        expect(result[1]).toContain('timed out')

        vi.useRealTimers()
      })

      it('passes signal to function with default abortAfter', async () => {
        vi.useFakeTimers()

        let receivedSignal: AbortSignal | undefined

        const fn = vi.fn().mockImplementation((signal?: AbortSignal) => {
          receivedSignal = signal
          return new Promise((resolve) => setTimeout(() => resolve('done'), 50))
        })

        const appSafe = createSafe({
          parseError: (e) => String(e),
          abortAfter: 100,
        })

        const promise = appSafe.async(fn)
        await vi.advanceTimersByTimeAsync(50)
        await promise

        expect(receivedSignal).toBeInstanceOf(AbortSignal)

        vi.useRealTimers()
      })
    })

    describe('per-call abortAfter overrides default', () => {
      it('per-call abortAfter overrides default abortAfter', async () => {
        vi.useFakeTimers()

        const fn = vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve('done'), 75))
        )

        const appSafe = createSafe({
          parseError: (e) => e instanceof TimeoutError ? 'timeout' : 'error',
          abortAfter: 50, // Default would timeout
        })

        // Override with longer timeout - should succeed
        const promise = appSafe.async(fn, { abortAfter: 100 })
        await vi.advanceTimersByTimeAsync(75)
        const result = await promise

        expect(result).toEqual(['done', null])

        vi.useRealTimers()
      })

      it('per-call abortAfter can set shorter timeout than default', async () => {
        vi.useFakeTimers()

        const fn = vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve('done'), 100))
        )

        const appSafe = createSafe({
          parseError: (e) => e instanceof TimeoutError ? 'timeout' : 'error',
          abortAfter: 200, // Default would succeed
        })

        // Override with shorter timeout - should fail
        const promise = appSafe.async(fn, { abortAfter: 50 })
        await vi.advanceTimersByTimeAsync(50)
        const result = await promise

        expect(result).toEqual([null, 'timeout'])

        vi.useRealTimers()
      })

      it('per-call abortAfter overrides default on wrapAsync', async () => {
        vi.useFakeTimers()

        const fn = (id: number) =>
          new Promise<{ id: number }>((resolve) =>
            setTimeout(() => resolve({ id }), 75)
          )

        const appSafe = createSafe({
          parseError: (e) => e instanceof TimeoutError ? 'timeout' : 'error',
          abortAfter: 50, // Default would timeout
        })

        const safeFn = appSafe.wrapAsync(fn, { abortAfter: 100 })
        const promise = safeFn(42)
        await vi.advanceTimersByTimeAsync(75)
        const result = await promise

        expect(result).toEqual([{ id: 42 }, null])

        vi.useRealTimers()
      })
    })

    describe('abortAfter with retry', () => {
      it('each retry gets its own timeout with default abortAfter', async () => {
        vi.useFakeTimers()

        let attempts = 0
        const fn = vi.fn().mockImplementation(() => {
          attempts++
          const delay = attempts < 3 ? 200 : 10
          return new Promise((resolve) => setTimeout(() => resolve('success'), delay))
        })

        const appSafe = createSafe({
          parseError: (e) => String(e),
          abortAfter: 100,
          retry: { times: 2 },
        })

        const promise = appSafe.async(fn)

        await vi.advanceTimersByTimeAsync(100)
        await vi.advanceTimersByTimeAsync(100)
        await vi.advanceTimersByTimeAsync(10)

        const result = await promise

        expect(result).toEqual(['success', null])
        expect(fn).toHaveBeenCalledTimes(3)

        vi.useRealTimers()
      })

      it('onRetry is called with TimeoutError when timeout causes retry', async () => {
        vi.useFakeTimers()

        const fn = vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve('done'), 200))
        )

        const onRetry = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => ({
            type: e instanceof TimeoutError ? 'timeout' : 'error',
            message: e instanceof Error ? e.message : 'Unknown',
          }),
          abortAfter: 100,
          retry: { times: 1 },
          onRetry,
        })

        const promise = appSafe.async(fn)
        await vi.advanceTimersByTimeAsync(100)
        await vi.advanceTimersByTimeAsync(100)
        await promise

        expect(onRetry).toHaveBeenCalledTimes(1)
        expect(onRetry).toHaveBeenCalledWith(
          { type: 'timeout', message: 'Operation timed out after 100ms' },
          1
        )

        vi.useRealTimers()
      })
    })

    describe('no default abortAfter', () => {
      it('works without default abortAfter config', async () => {
        const fn = vi.fn().mockResolvedValue('success')

        const appSafe = createSafe({
          parseError: (e) => String(e),
        })

        const result = await appSafe.async(fn)

        expect(result).toEqual(['success', null])
        expect(fn).toHaveBeenCalledWith(undefined)
      })

      it('per-call abortAfter works without default', async () => {
        vi.useFakeTimers()

        const fn = vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve('done'), 200))
        )

        const appSafe = createSafe({
          parseError: (e) => e instanceof TimeoutError ? 'timeout' : 'error',
        })

        const promise = appSafe.async(fn, { abortAfter: 100 })
        await vi.advanceTimersByTimeAsync(100)
        const result = await promise

        expect(result).toEqual([null, 'timeout'])

        vi.useRealTimers()
      })
    })
  })

  describe('parseResult', () => {
    describe('factory parseResult as default', () => {
      it('transforms sync result with factory parseResult', () => {
        const appSafe = createSafe({
          parseError: (e) => String(e),
          parseResult: (response) => ({ wrapped: response }),
        })

        const [result, error] = appSafe.sync(() => 42)

        expect(error).toBeNull()
        expect(result).toEqual({ wrapped: 42 })
      })

      it('transforms async result with factory parseResult', async () => {
        const appSafe = createSafe({
          parseError: (e) => String(e),
          parseResult: (response) => ({ wrapped: response }),
        })

        const [result, error] = await appSafe.async(() => Promise.resolve('hello'))

        expect(error).toBeNull()
        expect(result).toEqual({ wrapped: 'hello' })
      })

      it('transforms wrap result with factory parseResult', () => {
        const appSafe = createSafe({
          parseError: (e) => String(e),
          parseResult: (response) => ({ wrapped: response }),
        })

        const safeDivide = appSafe.wrap((a: number, b: number) => a / b)
        const [result, error] = safeDivide(10, 2)

        expect(error).toBeNull()
        expect(result).toEqual({ wrapped: 5 })
      })

      it('transforms wrapAsync result with factory parseResult', async () => {
        const appSafe = createSafe({
          parseError: (e) => String(e),
          parseResult: (response) => ({ wrapped: response }),
        })

        const safeFetch = appSafe.wrapAsync(async (id: number) => ({ id }))
        const [result, error] = await safeFetch(42)

        expect(error).toBeNull()
        expect(result).toEqual({ wrapped: { id: 42 } })
      })
    })

    describe('per-call parseResult overrides factory', () => {
      it('per-call parseResult overrides factory on sync', () => {
        const appSafe = createSafe({
          parseError: (e) => String(e),
          parseResult: (response) => ({ factory: response }),
        })

        const [result] = appSafe.sync(() => 42, {
          parseResult: (raw) => raw * 10,
        })

        expect(result).toBe(420)
      })

      it('per-call parseResult overrides factory on async', async () => {
        const appSafe = createSafe({
          parseError: (e) => String(e),
          parseResult: (response) => ({ factory: response }),
        })

        const [result] = await appSafe.async(() => Promise.resolve(5), {
          parseResult: (raw) => raw + 100,
        })

        expect(result).toBe(105)
      })

      it('per-call parseResult overrides factory on wrap', () => {
        const appSafe = createSafe({
          parseError: (e) => String(e),
          parseResult: (response) => ({ factory: response }),
        })

        const safeAdd = appSafe.wrap((a: number, b: number) => a + b, {
          parseResult: (raw) => `sum: ${raw}`,
        })

        const [result] = safeAdd(3, 7)

        expect(result).toBe('sum: 10')
      })

      it('per-call parseResult overrides factory on wrapAsync', async () => {
        const appSafe = createSafe({
          parseError: (e) => String(e),
          parseResult: (response) => ({ factory: response }),
        })

        const safeFetch = appSafe.wrapAsync(async (id: number) => ({ id }), {
          parseResult: (raw) => raw.id,
        })

        const [result] = await safeFetch(42)

        expect(result).toBe(42)
      })
    })

    describe('hooks receive transformed value', () => {
      it('default onSuccess receives factory-transformed value', () => {
        const defaultOnSuccess = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          parseResult: (response) => ({ wrapped: response }),
          onSuccess: defaultOnSuccess,
        })

        appSafe.sync(() => 42)

        expect(defaultOnSuccess).toHaveBeenCalledWith({ wrapped: 42 })
      })

      it('default onSettled receives factory-transformed value', () => {
        const defaultOnSettled = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          parseResult: (response) => ({ wrapped: response }),
          onSettled: defaultOnSettled,
        })

        appSafe.sync(() => 42)

        expect(defaultOnSettled).toHaveBeenCalledWith({ wrapped: 42 }, null)
      })

      it('per-call onSuccess receives transformed value', () => {
        const perCallOnSuccess = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          parseResult: (response) => ({ wrapped: response }),
        })

        appSafe.sync(() => 42, { onSuccess: perCallOnSuccess })

        expect(perCallOnSuccess).toHaveBeenCalledWith({ wrapped: 42 }, [])
      })

      it('per-call onSuccess receives per-call-transformed value when overriding', () => {
        const perCallOnSuccess = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          parseResult: (response) => ({ factory: response }),
        })

        appSafe.sync(() => 42, {
          parseResult: (raw) => raw * 2,
          onSuccess: perCallOnSuccess,
        })

        expect(perCallOnSuccess).toHaveBeenCalledWith(84, [])
      })
    })

    describe('parseResult error handling', () => {
      it('factory parseResult throw returns error through error path', () => {
        const appSafe = createSafe({
          parseError: (e) => ({
            code: 'PARSE_ERROR',
            message: e instanceof Error ? e.message : 'Unknown',
          }),
          parseResult: () => {
            throw new Error('validation failed')
          },
        })

        const [result, error] = appSafe.sync(() => 42)

        expect(result).toBeNull()
        expect(error).toEqual({ code: 'PARSE_ERROR', message: 'validation failed' })
      })

      it('per-call parseResult throw returns error through error path', () => {
        const appSafe = createSafe({
          parseError: (e) => ({
            code: 'PARSE_ERROR',
            message: e instanceof Error ? e.message : 'Unknown',
          }),
        })

        const [result, error] = appSafe.sync(() => 42, {
          parseResult: () => {
            throw new Error('per-call validation failed')
          },
        })

        expect(result).toBeNull()
        expect(error).toEqual({ code: 'PARSE_ERROR', message: 'per-call validation failed' })
      })

      it('factory parseResult throw triggers retry on async', async () => {
        const fn = vi.fn().mockResolvedValue('data')

        const appSafe = createSafe({
          parseError: (e) => String(e),
          parseResult: () => { throw new Error('not ready') },
          retry: { times: 3 },
        })

        const [result, error] = await appSafe.async(fn)

        // parseResult failure goes through error path and triggers retries
        expect(fn).toHaveBeenCalledTimes(4)
        expect(result).toBeNull()
        expect(error).toBe('Error: not ready')
      })

      it('parseResult not called on error path', () => {
        const parseResult = vi.fn((response: unknown) => response)

        const appSafe = createSafe({
          parseError: (e) => String(e),
          parseResult,
        })

        appSafe.sync(() => { throw new Error('fail') })

        expect(parseResult).not.toHaveBeenCalled()
      })
    })

    describe('hook cascade with parseResult', () => {
      it('full cascade: factory parseResult, default onSuccess, per-call onSuccess, default onSettled, per-call onSettled', () => {
        const callOrder: string[] = []

        const appSafe = createSafe({
          parseError: (e) => String(e),
          parseResult: (response) => {
            callOrder.push('factory-parseResult')
            return { wrapped: response }
          },
          onSuccess: () => callOrder.push('default-onSuccess'),
          onSettled: () => callOrder.push('default-onSettled'),
        })

        appSafe.sync(() => 42, {
          onSuccess: () => callOrder.push('perCall-onSuccess'),
          onSettled: () => callOrder.push('perCall-onSettled'),
        })

        expect(callOrder).toEqual([
          'factory-parseResult',
          'default-onSuccess',
          'perCall-onSuccess',
          'default-onSettled',
          'perCall-onSettled',
        ])
      })

      it('per-call parseResult replaces factory in cascade', () => {
        const callOrder: string[] = []
        const values: unknown[] = []

        const appSafe = createSafe({
          parseError: (e) => String(e),
          parseResult: () => {
            callOrder.push('factory-parseResult')
            return 'factory'
          },
          onSuccess: (result) => {
            callOrder.push('default-onSuccess')
            values.push(result)
          },
        })

        appSafe.sync(() => 42, {
          parseResult: (raw) => {
            callOrder.push('perCall-parseResult')
            return raw * 2
          },
          onSuccess: (result) => {
            callOrder.push('perCall-onSuccess')
            values.push(result)
          },
        })

        expect(callOrder).toEqual([
          'perCall-parseResult',
          'default-onSuccess',
          'perCall-onSuccess',
        ])
        // Both hooks see per-call transformed value
        expect(values).toEqual([84, 84])
      })
    })

    describe('backward compatibility without parseResult', () => {
      it('sync works without parseResult in factory', () => {
        const appSafe = createSafe({
          parseError: (e) => String(e),
        })

        const [result, error] = appSafe.sync(() => 42)

        expect(result).toBe(42)
        expect(error).toBeNull()
      })

      it('async works without parseResult in factory', async () => {
        const appSafe = createSafe({
          parseError: (e) => String(e),
        })

        const [result, error] = await appSafe.async(() => Promise.resolve('hello'))

        expect(result).toBe('hello')
        expect(error).toBeNull()
      })

      it('wrap works without parseResult in factory', () => {
        const appSafe = createSafe({
          parseError: (e) => String(e),
        })

        const safeAdd = appSafe.wrap((a: number, b: number) => a + b)
        const [result, error] = safeAdd(3, 7)

        expect(result).toBe(10)
        expect(error).toBeNull()
      })

      it('wrapAsync works without parseResult in factory', async () => {
        const appSafe = createSafe({
          parseError: (e) => String(e),
        })

        const safeFetch = appSafe.wrapAsync(async (id: number) => ({ id }))
        const [result, error] = await safeFetch(42)

        expect(result).toEqual({ id: 42 })
        expect(error).toBeNull()
      })
    })
  })

  describe('all', () => {
    it('works with pre-configured error type', async () => {
      const appSafe = createSafe({
        parseError: (e) => ({
          code: 'ERR' as const,
          message: e instanceof Error ? e.message : 'unknown',
        }),
      })

      const [data, error] = await appSafe.all({
        a: () => Promise.resolve(1),
        b: () => Promise.resolve('two'),
      })

      expect(error).toBeNull()
      expect(data).toEqual({ a: 1, b: 'two' })
    })

    it('returns error with pre-configured error type on failure', async () => {
      const appSafe = createSafe({
        parseError: (e) => ({
          code: 'ERR' as const,
          message: e instanceof Error ? e.message : 'unknown',
        }),
      })

      const [data, error] = await appSafe.all({
        a: () => Promise.resolve(1),
        b: () => Promise.reject(new Error('boom')),
      })

      expect(data).toBeNull()
      expect(error).toEqual({ code: 'ERR', message: 'boom' })
    })

    it('applies factory parseError to errors', async () => {
      const appSafe = createSafe({
        parseError: (e) => ({
          code: 'CUSTOM' as const,
          message: e instanceof Error ? e.message : 'unknown',
        }),
      })

      const [, error] = await appSafe.all({
        a: () => Promise.resolve(1),
        b: () => Promise.reject(new Error('fail')),
      })

      expect(error).toEqual({ code: 'CUSTOM', message: 'fail' })
    })

    it('applies factory hooks to each operation', async () => {
      const onSuccess = vi.fn()
      const onError = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => (e instanceof Error ? e.message : 'unknown'),
        onSuccess,
        onError,
      })

      await appSafe.all({
        a: () => Promise.resolve(1),
        b: () => Promise.reject(new Error('boom')),
      })

      expect(onSuccess).toHaveBeenCalledWith(1)
      expect(onError).toHaveBeenCalledWith('boom')
    })

    it('applies factory retry config to each operation', async () => {
      let attempts = 0
      const appSafe = createSafe({
        parseError: (e) => (e instanceof Error ? e.message : 'unknown'),
        retry: { times: 2 },
      })

      const [data] = await appSafe.all({
        a: () => {
          attempts++
          if (attempts < 3) return Promise.reject(new Error('not yet'))
          return Promise.resolve('done')
        },
      })

      expect(attempts).toBe(3)
      expect(data).toEqual({ a: 'done' })
    })

    it('applies factory parseResult to each operation', async () => {
      const appSafe = createSafe({
        parseError: (e) => String(e),
        parseResult: (r) => ({ wrapped: r }),
      })

      const [data] = await appSafe.all({
        a: () => Promise.resolve(1),
        b: () => Promise.resolve('two'),
      })

      expect(data).toEqual({ a: { wrapped: 1 }, b: { wrapped: 'two' } })
    })

    it('short-circuits on first error without waiting for slower operations', async () => {
      const slowFinished = vi.fn()
      const appSafe = createSafe({
        parseError: (e) => (e instanceof Error ? e.message : 'unknown'),
      })

      const [data, error] = await appSafe.all({
        fast: () => Promise.reject(new Error('fast fail')),
        slow: () =>
          new Promise<string>((resolve) => {
            setTimeout(() => {
              slowFinished()
              resolve('done')
            }, 5000)
          }),
      })

      expect(error).toBe('fast fail')
      expect(data).toBeNull()
      expect(slowFinished).not.toHaveBeenCalled()
    })

    it('works with a single entry', async () => {
      const appSafe = createSafe({
        parseError: (e) => (e instanceof Error ? e.message : 'unknown'),
      })

      const [data, error] = await appSafe.all({
        only: () => Promise.resolve('solo'),
      })

      expect(error).toBeNull()
      expect(data).toEqual({ only: 'solo' })
    })

    it('parseResult throwing returns error in all()', async () => {
      const appSafe = createSafe({
        parseError: (e) => ({
          code: 'PARSE_RESULT_ERROR' as const,
          message: e instanceof Error ? e.message : 'unknown',
        }),
        parseResult: () => { throw new Error('parseResult exploded') },
      })

      const [data, error] = await appSafe.all({
        a: () => Promise.resolve(1),
        b: () => Promise.resolve(2),
      })

      expect(data).toBeNull()
      expect(error).toEqual({ code: 'PARSE_RESULT_ERROR', message: 'parseResult exploded' })
    })

    it('handles a function that throws synchronously (before returning a promise)', async () => {
      const appSafe = createSafe({
        parseError: (e) => ({
          code: 'SYNC_THROW' as const,
          message: e instanceof Error ? e.message : 'unknown',
        }),
      })

      const [data, error] = await appSafe.all({
        good: () => Promise.resolve(1),
        bad: () => { throw new Error('sync kaboom') },
      })

      expect(data).toBeNull()
      expect(error).toEqual({ code: 'SYNC_THROW', message: 'sync kaboom' })
    })

    it('catches a raw promise rejection via defensive handler and applies parseError', async () => {
      // An invalid abortAfter causes validateAbortAfter to throw *before*
      // safeAsync's try-catch, making the returned promise reject outright.
      // The rejection handler on .then() in createSafe.all must catch this
      // and apply parseError (not just toError).
      const appSafe = createSafe({
        parseError: (e) => ({
          code: 'ERR' as const,
          message: e instanceof Error ? e.message : 'unknown',
        }),
        abortAfter: -1,
      })

      const [data, error] = await appSafe.all({
        a: () => Promise.resolve(1),
      })

      expect(data).toBeNull()
      expect(error).toEqual({ code: 'ERR', message: expect.stringMatching(/abortAfter/) })
    })

    it('ignores late rejections after already resolved (rejection handler done guard)', async () => {
      // Both promises reject via invalid abortAfter. The first rejection
      // resolves the outer promise; the second hits `if (done) return`.
      const appSafe = createSafe({
        parseError: (e) => ({
          code: 'ERR' as const,
          message: e instanceof Error ? e.message : 'unknown',
        }),
        abortAfter: -1,
      })

      const [data, error] = await appSafe.all({
        a: () => Promise.resolve(1),
        b: () => Promise.resolve(2),
      })

      expect(data).toBeNull()
      expect(error).toEqual({ code: 'ERR', message: expect.stringMatching(/abortAfter/) })
    })
  })

  describe('allSettled', () => {
    it('works with pre-configured error type', async () => {
      const appSafe = createSafe({
        parseError: (e) => ({
          code: 'ERR' as const,
          message: e instanceof Error ? e.message : 'unknown',
        }),
      })

      const results = await appSafe.allSettled({
        a: () => Promise.resolve(1),
        b: () => Promise.reject(new Error('fail')),
      })

      expect(results.a.ok).toBe(true)
      expect(results.a.value).toBe(1)

      expect(results.b.ok).toBe(false)
      expect(results.b.error).toEqual({ code: 'ERR', message: 'fail' })
    })

    it('applies factory parseError to errors', async () => {
      const appSafe = createSafe({
        parseError: (e) => ({
          code: 'CUSTOM' as const,
          message: e instanceof Error ? e.message : 'unknown',
        }),
      })

      const results = await appSafe.allSettled({
        a: () => Promise.resolve(1),
        b: () => Promise.reject(new Error('oops')),
      })

      expect(results.b.ok).toBe(false)
      expect(results.b.error).toEqual({ code: 'CUSTOM', message: 'oops' })
    })

    it('applies factory hooks to each operation', async () => {
      const onSuccess = vi.fn()
      const onError = vi.fn()

      const appSafe = createSafe({
        parseError: (e) => (e instanceof Error ? e.message : 'unknown'),
        onSuccess,
        onError,
      })

      await appSafe.allSettled({
        a: () => Promise.resolve(1),
        b: () => Promise.reject(new Error('boom')),
      })

      expect(onSuccess).toHaveBeenCalledWith(1)
      expect(onError).toHaveBeenCalledWith('boom')
    })

    it('applies factory retry config to each operation', async () => {
      let attempts = 0
      const appSafe = createSafe({
        parseError: (e) => (e instanceof Error ? e.message : 'unknown'),
        retry: { times: 2 },
      })

      const results = await appSafe.allSettled({
        a: () => {
          attempts++
          if (attempts < 3) return Promise.reject(new Error('not yet'))
          return Promise.resolve('done')
        },
      })

      expect(attempts).toBe(3)
      expect(results.a.ok).toBe(true)
      expect(results.a.value).toBe('done')
    })

    it('works with a single entry', async () => {
      const appSafe = createSafe({
        parseError: (e) => (e instanceof Error ? e.message : 'unknown'),
      })

      const results = await appSafe.allSettled({
        only: () => Promise.resolve('solo'),
      })

      expect(results.only.ok).toBe(true)
      expect(results.only.value).toBe('solo')
    })

    it('parseResult throwing returns errors in allSettled()', async () => {
      const appSafe = createSafe({
        parseError: (e) => ({
          code: 'PARSE_RESULT_ERROR' as const,
          message: e instanceof Error ? e.message : 'unknown',
        }),
        parseResult: () => { throw new Error('parseResult exploded') },
      })

      const results = await appSafe.allSettled({
        a: () => Promise.resolve(1),
        b: () => Promise.resolve(2),
      })

      expect(results.a.ok).toBe(false)
      expect(results.a.error).toEqual({ code: 'PARSE_RESULT_ERROR', message: 'parseResult exploded' })
      expect(results.b.ok).toBe(false)
      expect(results.b.error).toEqual({ code: 'PARSE_RESULT_ERROR', message: 'parseResult exploded' })
    })
  })

  describe('onHookError', () => {
    describe('factory-level onHookError', () => {
      it('catches default onSuccess hook errors', () => {
        const hookError = new Error('default hook broke')
        const onHookError = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          onSuccess: () => { throw hookError },
          onHookError,
        })

        const result = appSafe.sync(() => 42)

        expect(result).toEqual([42, null])
        expect(onHookError).toHaveBeenCalledWith(hookError, 'onSuccess')
      })

      it('catches default onError hook errors', () => {
        const hookError = new Error('default hook broke')
        const onHookError = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          onError: () => { throw hookError },
          onHookError,
        })

        const result = appSafe.sync(() => { throw new Error('fail') })

        expect(result[0]).toBeNull()
        expect(onHookError).toHaveBeenCalledWith(hookError, 'onError')
      })

      it('catches default onSettled hook errors', () => {
        const hookError = new Error('default hook broke')
        const onHookError = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          onSettled: () => { throw hookError },
          onHookError,
        })

        const result = appSafe.sync(() => 42)

        expect(result).toEqual([42, null])
        expect(onHookError).toHaveBeenCalledWith(hookError, 'onSettled')
      })

      it('catches default onRetry hook errors on async', async () => {
        const hookError = new Error('default hook broke')
        const onHookError = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          retry: { times: 1 },
          onRetry: () => { throw hookError },
          onHookError,
        })

        await appSafe.async(() => Promise.reject(new Error('fail')))

        expect(onHookError).toHaveBeenCalledWith(hookError, 'onRetry')
      })

      it('catches per-call hook errors with factory onHookError', () => {
        const hookError = new Error('per-call hook broke')
        const onHookError = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          onHookError,
        })

        const result = appSafe.sync(() => 42, {
          onSuccess: () => { throw hookError },
        })

        expect(result).toEqual([42, null])
        expect(onHookError).toHaveBeenCalledWith(hookError, 'onSuccess')
      })

      it('works on wrap method', () => {
        const hookError = new Error('hook broke')
        const onHookError = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          onSuccess: () => { throw hookError },
          onHookError,
        })

        const wrapped = appSafe.wrap((x: number) => x * 2)
        const result = wrapped(5)

        expect(result).toEqual([10, null])
        expect(onHookError).toHaveBeenCalledWith(hookError, 'onSuccess')
      })

      it('works on wrapAsync method', async () => {
        const hookError = new Error('hook broke')
        const onHookError = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          onSuccess: () => { throw hookError },
          onHookError,
        })

        const wrapped = appSafe.wrapAsync(async (x: number) => x * 2)
        const result = await wrapped(5)

        expect(result).toEqual([10, null])
        expect(onHookError).toHaveBeenCalledWith(hookError, 'onSuccess')
      })
    })

    describe('per-call onHookError overrides factory', () => {
      it('per-call onHookError takes precedence over factory onHookError', () => {
        const hookError = new Error('hook broke')
        const factoryOnHookError = vi.fn()
        const perCallOnHookError = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          onHookError: factoryOnHookError,
        })

        appSafe.sync(() => 42, {
          onSuccess: () => { throw hookError },
          onHookError: perCallOnHookError,
        })

        expect(perCallOnHookError).toHaveBeenCalledWith(hookError, 'onSuccess')
        expect(factoryOnHookError).not.toHaveBeenCalled()
      })

      it('per-call onHookError overrides on async', async () => {
        const hookError = new Error('hook broke')
        const factoryOnHookError = vi.fn()
        const perCallOnHookError = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          onHookError: factoryOnHookError,
        })

        await appSafe.async(() => Promise.resolve(42), {
          onSuccess: () => { throw hookError },
          onHookError: perCallOnHookError,
        })

        expect(perCallOnHookError).toHaveBeenCalledWith(hookError, 'onSuccess')
        expect(factoryOnHookError).not.toHaveBeenCalled()
      })

      it('per-call onHookError overrides on wrap', () => {
        const hookError = new Error('hook broke')
        const factoryOnHookError = vi.fn()
        const perCallOnHookError = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          onHookError: factoryOnHookError,
        })

        const wrapped = appSafe.wrap((x: number) => x * 2, {
          onSuccess: () => { throw hookError },
          onHookError: perCallOnHookError,
        })
        wrapped(5)

        expect(perCallOnHookError).toHaveBeenCalledWith(hookError, 'onSuccess')
        expect(factoryOnHookError).not.toHaveBeenCalled()
      })

      it('per-call onHookError overrides on wrapAsync', async () => {
        const hookError = new Error('hook broke')
        const factoryOnHookError = vi.fn()
        const perCallOnHookError = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          onHookError: factoryOnHookError,
        })

        const wrapped = appSafe.wrapAsync(async (x: number) => x * 2, {
          onSuccess: () => { throw hookError },
          onHookError: perCallOnHookError,
        })
        await wrapped(5)

        expect(perCallOnHookError).toHaveBeenCalledWith(hookError, 'onSuccess')
        expect(factoryOnHookError).not.toHaveBeenCalled()
      })

      it('falls back to factory onHookError when per-call does not provide one', () => {
        const hookError = new Error('hook broke')
        const factoryOnHookError = vi.fn()

        const appSafe = createSafe({
          parseError: (e) => String(e),
          onHookError: factoryOnHookError,
        })

        appSafe.sync(() => 42, {
          onSuccess: () => { throw hookError },
        })

        expect(factoryOnHookError).toHaveBeenCalledWith(hookError, 'onSuccess')
      })
    })

    describe('falsy defaultError values', () => {
      it('defaultError: empty string is returned when parseError throws', () => {
        const appSafe = createSafe({
          parseError: () => { throw new Error('parseError broke') },
          defaultError: '',
        })

        const result = appSafe.sync(() => { throw new Error('original') })
        expect(result[0]).toBeNull()
        expect(result[1]).toBe('')
        expect(result.ok).toBe(false)
      })

      it('defaultError: 0 is returned when parseError throws', () => {
        const appSafe = createSafe({
          parseError: () => { throw new Error('parseError broke') },
          defaultError: 0,
        })

        const result = appSafe.sync(() => { throw new Error('original') })
        expect(result[0]).toBeNull()
        expect(result[1]).toBe(0)
        expect(result.ok).toBe(false)
      })

      it('defaultError: false is returned when parseError throws', () => {
        const appSafe = createSafe({
          parseError: () => { throw new Error('parseError broke') },
          defaultError: false,
        })

        const result = appSafe.sync(() => { throw new Error('original') })
        expect(result[0]).toBeNull()
        expect(result[1]).toBe(false)
        expect(result.ok).toBe(false)
      })

      it('defaultError: null is returned when parseError throws', () => {
        const appSafe = createSafe({
          parseError: () => { throw new Error('parseError broke') },
          defaultError: null,
        })

        const result = appSafe.sync(() => { throw new Error('original') })
        expect(result[0]).toBeNull()
        // defaultError is null but `defaultError ?? toError(e)` falls through to toError
        // because null is nullish — so the fallback Error is returned
        expect(result[1]).toBeInstanceOf(Error)
        expect(result.ok).toBe(false)
      })
    })

    describe('onHookError does not crash the application', () => {
      it('factory onHookError that throws is silently swallowed', () => {
        const appSafe = createSafe({
          parseError: (e) => String(e),
          onSuccess: () => { throw new Error('hook broke') },
          onHookError: () => { throw new Error('onHookError broke') },
        })

        const result = appSafe.sync(() => 42)

        expect(result).toEqual([42, null])
      })

      it('per-call onHookError that throws is silently swallowed', () => {
        const appSafe = createSafe({
          parseError: (e) => String(e),
        })

        const result = appSafe.sync(() => 42, {
          onSuccess: () => { throw new Error('hook broke') },
          onHookError: () => { throw new Error('onHookError broke') },
        })

        expect(result).toEqual([42, null])
      })
    })
  })

  describe('all with empty object', () => {
    it('returns ok with empty object for empty input', async () => {
      const appSafe = createSafe({
        parseError: (e) => (e instanceof Error ? e.message : 'unknown'),
      })

      const [data, error] = await appSafe.all({})

      expect(error).toBeNull()
      expect(data).toEqual({})
    })

    it('result has ok: true for empty input', async () => {
      const appSafe = createSafe({
        parseError: (e) => String(e),
      })

      const result = await appSafe.all({})

      expect(result.ok).toBe(true)
      expect(result.value).toEqual({})
      expect(result.error).toBeNull()
    })
  })

  describe('allSettled with empty object', () => {
    it('returns empty object for empty input', async () => {
      const appSafe = createSafe({
        parseError: (e) => (e instanceof Error ? e.message : 'unknown'),
      })

      const results = await appSafe.allSettled({})

      expect(results).toEqual({})
    })
  })
})
