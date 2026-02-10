import { describe, it, expect, vi } from 'vitest'
import {
  safe,
  ok,
  err,
  TimeoutError,
  type SafeOk,
  type SafeErr,
  type SafeResult,
  type SafeHooks,
  type SafeAsyncHooks,
  type RetryConfig,
} from './index'

describe('safe', () => {
  describe('sync', () => {
    describe('successful execution', () => {
      it('returns [result, null] when function succeeds', () => {
        const result = safe.sync(() => 42)

        expect(result).toEqual([42, null])
        expect(result[0]).toBe(42)
        expect(result[1]).toBeNull()
      })

      it('returns [result, null] for string return values', () => {
        const result = safe.sync(() => 'hello')

        expect(result).toEqual(['hello', null])
      })

      it('returns [result, null] for object return values', () => {
        const obj = { foo: 'bar', count: 123 }
        const result = safe.sync(() => obj)

        expect(result).toEqual([obj, null])
      })

      it('returns [result, null] for array return values', () => {
        const arr = [1, 2, 3]
        const result = safe.sync(() => arr)

        expect(result).toEqual([arr, null])
      })

      it('returns [undefined, null] when function returns undefined', () => {
        const result = safe.sync(() => undefined)

        expect(result).toEqual([undefined, null])
      })

      it('returns [null, null] when function returns null', () => {
        const result = safe.sync(() => null)

        expect(result).toEqual([null, null])
      })

      it('returns [false, null] when function returns false', () => {
        const result = safe.sync(() => false)

        expect(result).toEqual([false, null])
      })

      it('returns [0, null] when function returns 0', () => {
        const result = safe.sync(() => 0)

        expect(result).toEqual([0, null])
      })
    })

    describe('failed execution without parseError', () => {
      it('returns [null, Error] when function throws an Error', () => {
        const error = new Error('test error')
        const result = safe.sync(() => {
          throw error
        })

        expect(result).toEqual([null, error])
        expect(result[0]).toBeNull()
        expect(result[1]).toBe(error)
      })

      it('returns [null, Error] when function throws a string', () => {
        const result = safe.sync(() => {
          throw 'string error'
        })

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect(result[1]!.message).toBe('string error')
      })

      it('returns [null, Error] when function throws a number', () => {
        const result = safe.sync(() => {
          throw 404
        })

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect(result[1]!.message).toBe('404')
      })

      it('returns [null, Error] when function throws an object', () => {
        const errorObj = { code: 'ERR_001', message: 'Something went wrong' }
        const result = safe.sync(() => {
          throw errorObj
        })

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
      })

      it('returns [null, Error] when function throws undefined', () => {
        const result = safe.sync(() => {
          throw undefined
        })

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect(result[1]!.message).toBe('undefined')
      })

      it('returns [null, Error] when function throws null', () => {
        const result = safe.sync(() => {
          throw null
        })

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect(result[1]!.message).toBe('null')
      })
    })

    describe('failed execution with parseError', () => {
      it('returns [null, mappedError] using custom error mapper', () => {
        const parseError = (e: unknown) => ({
          type: 'custom',
          original: e,
        })

        const result = safe.sync(() => {
          throw new Error('original error')
        }, parseError)

        expect(result[0]).toBeNull()
        expect(result[1]).toEqual({
          type: 'custom',
          original: expect.any(Error),
        })
      })

      it('calls parseError with the thrown value', () => {
        const parseError = vi.fn((e: unknown) => `mapped: ${e}`)
        const thrownValue = 'test error'

        safe.sync(() => {
          throw thrownValue
        }, parseError)

        expect(parseError).toHaveBeenCalledTimes(1)
        expect(parseError).toHaveBeenCalledWith(thrownValue)
      })

      it('does not call parseError when function succeeds', () => {
        const parseError = vi.fn((e: unknown) => e)

        safe.sync(() => 'success', parseError)

        expect(parseError).not.toHaveBeenCalled()
      })

      it('maps error to a string', () => {
        const result = safe.sync(
          () => {
            throw new Error('original')
          },
          (e) => (e instanceof Error ? e.message : 'unknown')
        )

        expect(result).toEqual([null, 'original'])
      })

      it('maps error to a structured error type', () => {
        type AppError = { code: string; message: string }

        const result = safe.sync<number, AppError>(
          () => {
            throw new Error('Something failed')
          },
          (e) => ({
            code: 'ERR_SYNC',
            message: e instanceof Error ? e.message : 'Unknown error',
          })
        )

        expect(result[0]).toBeNull()
        expect(result[1]).toEqual({
          code: 'ERR_SYNC',
          message: 'Something failed',
        })
      })
    })

    describe('type safety', () => {
      it('infers correct return type without parseError', () => {
        const result: SafeResult<number, Error> = safe.sync(() => 42)

        expect(result).toEqual([42, null])
      })

      it('infers correct return type with parseError', () => {
        const result: SafeResult<number, string> = safe.sync(
          () => 42,
          (e) => String(e)
        )

        expect(result).toEqual([42, null])
      })

      it('rejects falsy parseError return types at compile time', () => {
        // @ts-expect-error — null is falsy
        safe.sync(() => 42, () => null)
        // @ts-expect-error — undefined is falsy
        safe.sync(() => 42, () => undefined)
        // @ts-expect-error — false is falsy
        safe.sync(() => 42, () => false)
      })
    })
  })

  describe('async', () => {
    describe('successful execution', () => {
      it('returns [result, null] when promise resolves', async () => {
        const result = await safe.async(() => Promise.resolve(42))

        expect(result).toEqual([42, null])
        expect(result[0]).toBe(42)
        expect(result[1]).toBeNull()
      })

      it('returns [result, null] for string return values', async () => {
        const result = await safe.async(() => Promise.resolve('hello'))

        expect(result).toEqual(['hello', null])
      })

      it('returns [result, null] for object return values', async () => {
        const obj = { foo: 'bar', count: 123 }
        const result = await safe.async(() => Promise.resolve(obj))

        expect(result).toEqual([obj, null])
      })

      it('returns [result, null] for array return values', async () => {
        const arr = [1, 2, 3]
        const result = await safe.async(() => Promise.resolve(arr))

        expect(result).toEqual([arr, null])
      })

      it('returns [undefined, null] when promise resolves with undefined', async () => {
        const result = await safe.async(() => Promise.resolve(undefined))

        expect(result).toEqual([undefined, null])
      })

      it('returns [null, null] when promise resolves with null', async () => {
        const result = await safe.async(() => Promise.resolve(null))

        expect(result).toEqual([null, null])
      })

      it('returns [false, null] when promise resolves with false', async () => {
        const result = await safe.async(() => Promise.resolve(false))

        expect(result).toEqual([false, null])
      })

      it('returns [0, null] when promise resolves with 0', async () => {
        const result = await safe.async(() => Promise.resolve(0))

        expect(result).toEqual([0, null])
      })

      it('handles async functions', async () => {
        const result = await safe.async(async () => {
          return 'async result'
        })

        expect(result).toEqual(['async result', null])
      })
    })

    describe('failed execution without parseError', () => {
      it('returns [null, Error] when promise rejects with Error', async () => {
        const error = new Error('test error')
        const result = await safe.async(() => Promise.reject(error))

        expect(result).toEqual([null, error])
        expect(result[0]).toBeNull()
        expect(result[1]).toBe(error)
      })

      it('returns [null, Error] when promise rejects with string', async () => {
        const result = await safe.async(() => Promise.reject('string error'))

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect(result[1]!.message).toBe('string error')
      })

      it('returns [null, Error] when promise rejects with number', async () => {
        const result = await safe.async(() => Promise.reject(404))

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect(result[1]!.message).toBe('404')
      })

      it('returns [null, Error] when promise rejects with object', async () => {
        const errorObj = { code: 'ERR_001', message: 'Something went wrong' }
        const result = await safe.async(() => Promise.reject(errorObj))

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
      })

      it('returns [null, Error] when promise rejects with undefined', async () => {
        const result = await safe.async(() => Promise.reject(undefined))

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect(result[1]!.message).toBe('undefined')
      })

      it('returns [null, Error] when promise rejects with null', async () => {
        const result = await safe.async(() => Promise.reject(null))

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect(result[1]!.message).toBe('null')
      })

      it('returns [null, Error] when async function throws', async () => {
        const error = new Error('thrown error')
        const result = await safe.async(async () => {
          throw error
        })

        expect(result).toEqual([null, error])
      })
    })

    describe('failed execution with parseError', () => {
      it('returns [null, mappedError] using custom error mapper', async () => {
        const parseError = (e: unknown) => ({
          type: 'custom',
          original: e,
        })

        const result = await safe.async(
          () => Promise.reject(new Error('original error')),
          parseError
        )

        expect(result[0]).toBeNull()
        expect(result[1]).toEqual({
          type: 'custom',
          original: expect.any(Error),
        })
      })

      it('calls parseError with the rejected value', async () => {
        const parseError = vi.fn((e: unknown) => `mapped: ${e}`)
        const rejectedValue = 'test error'

        await safe.async(() => Promise.reject(rejectedValue), parseError)

        expect(parseError).toHaveBeenCalledTimes(1)
        expect(parseError).toHaveBeenCalledWith(rejectedValue)
      })

      it('does not call parseError when promise resolves', async () => {
        const parseError = vi.fn((e: unknown) => e)

        await safe.async(() => Promise.resolve('success'), parseError)

        expect(parseError).not.toHaveBeenCalled()
      })

      it('maps error to a string', async () => {
        const result = await safe.async(
          () => Promise.reject(new Error('original')),
          (e) => (e instanceof Error ? e.message : 'unknown')
        )

        expect(result).toEqual([null, 'original'])
      })

      it('maps error to a structured error type', async () => {
        type AppError = { code: string; message: string }

        const result = await safe.async<number, AppError>(
          () => Promise.reject(new Error('Something failed')),
          (e) => ({
            code: 'ERR_ASYNC',
            message: e instanceof Error ? e.message : 'Unknown error',
          })
        )

        expect(result[0]).toBeNull()
        expect(result[1]).toEqual({
          code: 'ERR_ASYNC',
          message: 'Something failed',
        })
      })
    })

    describe('type safety', () => {
      it('infers correct return type without parseError', async () => {
        const result: SafeResult<number, Error> = await safe.async(() =>
          Promise.resolve(42)
        )

        expect(result).toEqual([42, null])
      })

      it('infers correct return type with parseError', async () => {
        const result: SafeResult<number, string> = await safe.async(
          () => Promise.resolve(42),
          (e) => String(e)
        )

        expect(result).toEqual([42, null])
      })
    })
  })

  describe('SafeResult type', () => {
    it('can be destructured for success case', () => {
      const result = safe.sync(() => 42)
      const [value, error] = result

      if (error === null) {
        expect(value).toBe(42)
      }
    })

    it('can be destructured for error case', () => {
      const result = safe.sync(() => {
        throw new Error('test')
      })
      const [value, error] = result

      if (error !== null) {
        expect(value).toBeNull()
        expect(error).toBeInstanceOf(Error)
      }
    })

    it('supports discriminated union narrowing', () => {
      const result = safe.sync(() => 'success')

      if (result[1] === null) {
        // TypeScript knows result[0] is the success value
        const value: string = result[0]
        expect(value).toBe('success')
      } else {
        // TypeScript knows result[0] is null
        expect(result[0]).toBeNull()
      }
    })
  })

  describe('wrap', () => {
    describe('returns a wrapped function', () => {
      it('returns a function', () => {
        const wrapped = safe.wrap(() => 42)

        expect(typeof wrapped).toBe('function')
      })

      it('wrapped function returns SafeResult on success', () => {
        const wrapped = safe.wrap(() => 42)
        const result = wrapped()

        expect(result).toEqual([42, null])
      })

      it('wrapped function returns SafeResult on error', () => {
        const error = new Error('test error')
        const wrapped = safe.wrap(() => {
          throw error
        })
        const result = wrapped()

        expect(result).toEqual([null, error])
      })

      it('can be called multiple times', () => {
        let counter = 0
        const wrapped = safe.wrap(() => ++counter)

        expect(wrapped()).toEqual([1, null])
        expect(wrapped()).toEqual([2, null])
        expect(wrapped()).toEqual([3, null])
      })
    })

    describe('successful execution', () => {
      it('returns [result, null] for various return types', () => {
        expect(safe.wrap(() => 'hello')()).toEqual(['hello', null])
        expect(safe.wrap(() => 123)()).toEqual([123, null])
        expect(safe.wrap(() => true)()).toEqual([true, null])
        expect(safe.wrap(() => null)()).toEqual([null, null])
        expect(safe.wrap(() => undefined)()).toEqual([undefined, null])
      })

      it('returns [result, null] for object return values', () => {
        const obj = { foo: 'bar' }
        const wrapped = safe.wrap(() => obj)

        expect(wrapped()).toEqual([obj, null])
      })

      it('returns [result, null] for array return values', () => {
        const arr = [1, 2, 3]
        const wrapped = safe.wrap(() => arr)

        expect(wrapped()).toEqual([arr, null])
      })
    })

    describe('failed execution without parseError', () => {
      it('returns [null, Error] when function throws', () => {
        const error = new Error('test')
        const wrapped = safe.wrap(() => {
          throw error
        })

        expect(wrapped()).toEqual([null, error])
      })

      it('returns [null, Error] for non-Error throws', () => {
        const wrapped = safe.wrap(() => {
          throw 'string error'
        })

        const result = wrapped()
        expect(result[1]).toBeInstanceOf(Error)
        expect(result[1]!.message).toBe('string error')
        expect(result[1]!.cause).toBe('string error')
      })
    })

    describe('failed execution with parseError', () => {
      it('uses custom error mapper', () => {
        const wrapped = safe.wrap(
          () => {
            throw new Error('original')
          },
          (e) => ({ mapped: true, original: e })
        )
        const result = wrapped()

        expect(result[0]).toBeNull()
        expect(result[1]).toEqual({
          mapped: true,
          original: expect.any(Error),
        })
      })

      it('calls parseError with the thrown value', () => {
        const parseError = vi.fn((e: unknown) => `mapped: ${e}`)
        const wrapped = safe.wrap(() => {
          throw 'error'
        }, parseError)

        wrapped()

        expect(parseError).toHaveBeenCalledWith('error')
      })

      it('does not call parseError on success', () => {
        const parseError = vi.fn((e: unknown) => e)
        const wrapped = safe.wrap(() => 'success', parseError)

        wrapped()

        expect(parseError).not.toHaveBeenCalled()
      })

      it('maps error to a structured type', () => {
        const throwingFn = (): number => {
          throw new Error('Something failed')
        }

        const wrapped = safe.wrap(throwingFn, (e) => ({
          code: 'ERR_WRAP',
          message: e instanceof Error ? e.message : 'Unknown',
        }))

        expect(wrapped()).toEqual([
          null,
          { code: 'ERR_WRAP', message: 'Something failed' },
        ])
      })
    })

    describe('type safety', () => {
      it('infers correct return type without parseError', () => {
        const wrapped = safe.wrap(() => 42)
        const result: SafeResult<number, Error> = wrapped()

        expect(result).toEqual([42, null])
      })

      it('infers correct return type with parseError', () => {
        const wrapped = safe.wrap(
          () => 42,
          (e) => String(e)
        )
        const result: SafeResult<number, string> = wrapped()

        expect(result).toEqual([42, null])
      })

      it('rejects falsy parseError return types at compile time', () => {
        // @ts-expect-error — null is falsy
        safe.wrap(() => 42, () => null)
        // @ts-expect-error — undefined is falsy
        safe.wrap(() => 42, () => undefined)
      })
    })

    describe('with parameters - automatic type preservation', () => {
      it('preserves function parameters without redeclaring types', () => {
        const divide = (a: number, b: number) => {
          if (b === 0) throw new Error('Division by zero')
          return a / b
        }

        // No need to redeclare (a: number, b: number) - types are inferred!
        const safeDivide = safe.wrap(divide)

        expect(safeDivide(10, 2)).toEqual([5, null])
        expect(safeDivide(20, 4)).toEqual([5, null])
        expect(safeDivide(10, 0)[0]).toBeNull()
        expect((safeDivide(10, 0)[1] as Error).message).toBe('Division by zero')
      })

      it('preserves parameters with custom error mapping', () => {
        const divide = (a: number, b: number) => {
          if (b === 0) throw new Error('Division by zero')
          return a / b
        }

        // wrap preserves parameters AND adds error mapping
        const safeDivide = safe.wrap(divide, (e) => ({
          operation: 'division',
          reason: e instanceof Error ? e.message : 'Unknown error',
        }))

        expect(safeDivide(10, 2)).toEqual([5, null])
        expect(safeDivide(10, 0)).toEqual([
          null,
          { operation: 'division', reason: 'Division by zero' },
        ])
      })

      it('wraps JSON.parse directly', () => {
        // Wrap JSON.parse directly - parameters are preserved
        const safeJsonParse = safe.wrap(JSON.parse)

        expect(safeJsonParse('{"name": "test"}')).toEqual([
          { name: 'test' },
          null,
        ])
        expect(safeJsonParse('{invalid}')[0]).toBeNull()
        expect(safeJsonParse('{invalid}')[1]).toBeInstanceOf(SyntaxError)
      })

      it('wraps functions with object parameters', () => {
        type User = { id: number; name: string }

        const validateUser = (user: User) => {
          if (!user.name) throw new Error('Name is required')
          if (user.id <= 0) throw new Error('Invalid ID')
          return user
        }

        // Type of user parameter is automatically inferred as User
        const safeValidate = safe.wrap(validateUser)

        expect(safeValidate({ id: 1, name: 'John' })).toEqual([
          { id: 1, name: 'John' },
          null,
        ])
        expect(safeValidate({ id: 1, name: '' })[0]).toBeNull()
        expect((safeValidate({ id: 1, name: '' })[1] as Error).message).toBe(
          'Name is required'
        )
        expect(safeValidate({ id: 0, name: 'John' })[0]).toBeNull()
      })

      it('wraps functions with multiple parameters of different types', () => {
        const createUser = (name: string, age: number, active: boolean) => {
          if (!name) throw new Error('Name required')
          return { name, age, active }
        }

        const safeCreateUser = safe.wrap(createUser)

        expect(safeCreateUser('John', 30, true)).toEqual([
          { name: 'John', age: 30, active: true },
          null,
        ])
        expect(safeCreateUser('', 30, true)[0]).toBeNull()
      })
    })

    describe('this binding preservation', () => {
      it('forwards this to the wrapped function when called as a method', () => {
        const obj = {
          value: 42,
          getValue: safe.wrap(function (this: { value: number }) {
            return this.value
          }),
        }

        const [result, error] = obj.getValue()
        expect(error).toBeNull()
        expect(result).toBe(42)
      })

      it('works with class instances', () => {
        class Calculator {
          constructor(public multiplier: number) {}
          multiply = safe.wrap(function (this: Calculator, n: number) {
            return n * this.multiplier
          })
        }

        const calc = new Calculator(3)
        const [result, error] = calc.multiply(7)
        expect(error).toBeNull()
        expect(result).toBe(21)
      })

      it('works with prototype methods assigned after wrap', () => {
        class Service {
          name = 'TestService'
          getName!: () => SafeResult<string, Error>
        }
        Service.prototype.getName = safe.wrap(function (this: Service) {
          return this.name
        })

        const svc = new Service()
        const [result, error] = svc.getName()
        expect(error).toBeNull()
        expect(result).toBe('TestService')
      })
    })
  })

  describe('wrapAsync', () => {
    describe('returns a wrapped function', () => {
      it('returns a function', () => {
        const wrapped = safe.wrapAsync(() => Promise.resolve(42))

        expect(typeof wrapped).toBe('function')
      })

      it('wrapped function returns Promise<SafeResult> on success', async () => {
        const wrapped = safe.wrapAsync(() => Promise.resolve(42))
        const result = await wrapped()

        expect(result).toEqual([42, null])
      })

      it('wrapped function returns Promise<SafeResult> on error', async () => {
        const error = new Error('test error')
        const wrapped = safe.wrapAsync(() => Promise.reject(error))
        const result = await wrapped()

        expect(result).toEqual([null, error])
      })

      it('can be called multiple times', async () => {
        let counter = 0
        const wrapped = safe.wrapAsync(() => Promise.resolve(++counter))

        expect(await wrapped()).toEqual([1, null])
        expect(await wrapped()).toEqual([2, null])
        expect(await wrapped()).toEqual([3, null])
      })
    })

    describe('successful execution', () => {
      it('returns [result, null] for various return types', async () => {
        expect(await safe.wrapAsync(() => Promise.resolve('hello'))()).toEqual([
          'hello',
          null,
        ])
        expect(await safe.wrapAsync(() => Promise.resolve(123))()).toEqual([
          123,
          null,
        ])
        expect(await safe.wrapAsync(() => Promise.resolve(true))()).toEqual([
          true,
          null,
        ])
        expect(await safe.wrapAsync(() => Promise.resolve(null))()).toEqual([
          null,
          null,
        ])
        expect(
          await safe.wrapAsync(() => Promise.resolve(undefined))()
        ).toEqual([undefined, null])
      })

      it('returns [result, null] for object return values', async () => {
        const obj = { foo: 'bar' }
        const wrapped = safe.wrapAsync(() => Promise.resolve(obj))

        expect(await wrapped()).toEqual([obj, null])
      })

      it('handles async functions', async () => {
        const wrapped = safe.wrapAsync(async () => {
          return 'async result'
        })

        expect(await wrapped()).toEqual(['async result', null])
      })
    })

    describe('failed execution without parseError', () => {
      it('returns [null, Error] when promise rejects', async () => {
        const error = new Error('test')
        const wrapped = safe.wrapAsync(() => Promise.reject(error))

        expect(await wrapped()).toEqual([null, error])
      })

      it('returns [null, Error] for non-Error rejections', async () => {
        const wrapped = safe.wrapAsync(() => Promise.reject('string error'))
        const result = await wrapped()

        expect(result[1]).toBeInstanceOf(Error)
        expect(result[1]!.message).toBe('string error')
        expect(result[1]!.cause).toBe('string error')
      })

      it('returns [null, Error] when async function throws', async () => {
        const error = new Error('thrown')
        const wrapped = safe.wrapAsync(async () => {
          throw error
        })

        expect(await wrapped()).toEqual([null, error])
      })
    })

    describe('failed execution with parseError', () => {
      it('uses custom error mapper', async () => {
        const wrapped = safe.wrapAsync(
          () => Promise.reject(new Error('original')),
          (e) => ({ mapped: true, original: e })
        )
        const result = await wrapped()

        expect(result[0]).toBeNull()
        expect(result[1]).toEqual({
          mapped: true,
          original: expect.any(Error),
        })
      })

      it('calls parseError with the rejected value', async () => {
        const parseError = vi.fn((e: unknown) => `mapped: ${e}`)
        const wrapped = safe.wrapAsync(() => Promise.reject('error'), parseError)

        await wrapped()

        expect(parseError).toHaveBeenCalledWith('error')
      })

      it('does not call parseError on success', async () => {
        const parseError = vi.fn((e: unknown) => e)
        const wrapped = safe.wrapAsync(
          () => Promise.resolve('success'),
          parseError
        )

        await wrapped()

        expect(parseError).not.toHaveBeenCalled()
      })

      it('maps error to a structured type', async () => {
        const rejectingFn = (): Promise<number> =>
          Promise.reject(new Error('Something failed'))

        const wrapped = safe.wrapAsync(rejectingFn, (e) => ({
          code: 'ERR_WRAP_ASYNC',
          message: e instanceof Error ? e.message : 'Unknown',
        }))

        expect(await wrapped()).toEqual([
          null,
          { code: 'ERR_WRAP_ASYNC', message: 'Something failed' },
        ])
      })
    })

    describe('type safety', () => {
      it('infers correct return type without parseError', async () => {
        const wrapped = safe.wrapAsync(() => Promise.resolve(42))
        const result: SafeResult<number, Error> = await wrapped()

        expect(result).toEqual([42, null])
      })

      it('infers correct return type with parseError', async () => {
        const wrapped = safe.wrapAsync(
          () => Promise.resolve(42),
          (e) => String(e)
        )
        const result: SafeResult<number, string> = await wrapped()

        expect(result).toEqual([42, null])
      })

      it('rejects falsy parseError return types at compile time', () => {
        // @ts-expect-error — null is falsy
        safe.wrapAsync(() => Promise.resolve(42), () => null)
        // @ts-expect-error — false is falsy
        safe.wrapAsync(() => Promise.resolve(42), () => false)
      })
    })

    describe('with parameters - automatic type preservation', () => {
      it('preserves async function parameters without redeclaring types', async () => {
        const fetchUser = async (id: number) => {
          if (id <= 0) throw new Error('Invalid user ID')
          return { id, name: `User ${id}` }
        }

        // No need to redeclare (id: number) - types are inferred!
        const safeFetchUser = safe.wrapAsync(fetchUser)

        expect(await safeFetchUser(1)).toEqual([
          { id: 1, name: 'User 1' },
          null,
        ])
        expect(await safeFetchUser(42)).toEqual([
          { id: 42, name: 'User 42' },
          null,
        ])
        expect((await safeFetchUser(-1))[0]).toBeNull()
        expect((await safeFetchUser(-1))[1]).toBeInstanceOf(Error)
      })

      it('preserves parameters with custom error mapping', async () => {
        const postData = async (
          endpoint: string,
          data: Record<string, unknown>
        ) => {
          if (!data.id) throw new Error('Missing required field: id')
          return { success: true, endpoint, data }
        }

        // wrapAsync preserves parameters AND adds error mapping
        const safePost = safe.wrapAsync(postData, (e) => ({
          statusCode: 400,
          message: e instanceof Error ? e.message : 'Unknown error',
        }))

        expect(await safePost('/api/users', { id: 1, name: 'John' })).toEqual([
          {
            success: true,
            endpoint: '/api/users',
            data: { id: 1, name: 'John' },
          },
          null,
        ])

        expect(await safePost('/api/users', { name: 'John' })).toEqual([
          null,
          { statusCode: 400, message: 'Missing required field: id' },
        ])
      })

      it('wraps fetch-like functions directly', async () => {
        const mockFetch = async (url: string) => {
          if (url.includes('error')) throw new Error('Network error')
          return { status: 200, data: `Response from ${url}` }
        }

        // No need for: const safeFetch = (url: string) => ...
        // Just wrap directly!
        const safeFetch = safe.wrapAsync(mockFetch)

        expect(await safeFetch('/api/users')).toEqual([
          { status: 200, data: 'Response from /api/users' },
          null,
        ])
        expect((await safeFetch('/api/error'))[0]).toBeNull()
        expect((await safeFetch('/api/error'))[1]).toBeInstanceOf(Error)
      })

      it('wraps functions with multiple parameters of different types', async () => {
        const createRecord = async (
          table: string,
          data: Record<string, unknown>,
          options: { validate: boolean }
        ) => {
          if (options.validate && !data.id) throw new Error('ID required')
          return { table, data, created: true }
        }

        const safeCreate = safe.wrapAsync(createRecord)

        expect(
          await safeCreate('users', { id: 1 }, { validate: true })
        ).toEqual([{ table: 'users', data: { id: 1 }, created: true }, null])
        expect(
          (await safeCreate('users', {}, { validate: true }))[0]
        ).toBeNull()
      })

      it('wraps generic async functions', async () => {
        const fetchById = async <T>(id: number): Promise<T> => {
          if (id <= 0) throw new Error('Invalid ID')
          return { id } as T
        }

        // For generic functions, you can still use closures when needed
        const safeFetchUser = safe.wrapAsync(() =>
          fetchById<{ id: number }>(42)
        )

        expect(await safeFetchUser()).toEqual([{ id: 42 }, null])
      })
    })

    describe('this binding preservation', () => {
      it('forwards this to the wrapped async function when called as a method', async () => {
        const obj = {
          value: 'async-hello',
          getValue: safe.wrapAsync(async function (this: { value: string }) {
            return this.value
          }),
        }

        const [result, error] = await obj.getValue()
        expect(error).toBeNull()
        expect(result).toBe('async-hello')
      })

      it('works with class instances', async () => {
        class ApiClient {
          constructor(public baseUrl: string) {}
          fetchUrl = safe.wrapAsync(async function (this: ApiClient, path: string) {
            return `${this.baseUrl}${path}`
          })
        }

        const client = new ApiClient('https://api.example.com')
        const [result, error] = await client.fetchUrl('/users')
        expect(error).toBeNull()
        expect(result).toBe('https://api.example.com/users')
      })
    })
  })

  describe('hooks', () => {
    describe('sync with hooks', () => {
      it('calls onSuccess on successful execution', () => {
        const onSuccess = vi.fn()
        const onError = vi.fn()
        const hooks: SafeHooks<number, Error, []> = { onSuccess, onError }

        const result = safe.sync(() => 42, hooks)

        expect(result).toEqual([42, null])
        expect(onSuccess).toHaveBeenCalledTimes(1)
        expect(onSuccess).toHaveBeenCalledWith(42, [])
        expect(onError).not.toHaveBeenCalled()
      })

      it('calls onError on failed execution', () => {
        const onSuccess = vi.fn()
        const onError = vi.fn()
        const error = new Error('test error')

        safe.sync(
          () => {
            throw error
          },
          { onSuccess, onError }
        )

        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledWith(error, [])
        expect(onSuccess).not.toHaveBeenCalled()
      })

      it('works with parseError and hooks together', () => {
        const onSuccess = vi.fn()
        const onError = vi.fn()
        const parseError = (e: unknown) => ({
          code: 'ERR',
          message: e instanceof Error ? e.message : 'Unknown',
        })

        const result = safe.sync(
          () => {
            throw new Error('original')
          },
          parseError,
          { onSuccess, onError }
        )

        expect(result[0]).toBeNull()
        expect(result[1]).toEqual({ code: 'ERR', message: 'original' })
        expect(onError).toHaveBeenCalledWith(
          { code: 'ERR', message: 'original' },
          []
        )
        expect(onSuccess).not.toHaveBeenCalled()
      })

      it('calls onSuccess with parseError on success', () => {
        const onSuccess = vi.fn()
        const parseError = (e: unknown) => String(e)

        safe.sync(() => 'result', parseError, { onSuccess, defaultError: 'unknown error' })

        expect(onSuccess).toHaveBeenCalledWith('result', [])
      })

      it('works with only onSuccess hook', () => {
        const onSuccess = vi.fn()

        safe.sync(() => 42, { onSuccess })

        expect(onSuccess).toHaveBeenCalledWith(42, [])
      })

      it('works with only onError hook', () => {
        const onError = vi.fn()
        const error = new Error('test')

        safe.sync(
          () => {
            throw error
          },
          { onError }
        )

        expect(onError).toHaveBeenCalledWith(error, [])
      })
    })

    describe('async with hooks', () => {
      it('calls onSuccess on successful execution', async () => {
        const onSuccess = vi.fn()
        const onError = vi.fn()

        const result = await safe.async(() => Promise.resolve(42), {
          onSuccess,
          onError,
        })

        expect(result).toEqual([42, null])
        expect(onSuccess).toHaveBeenCalledTimes(1)
        expect(onSuccess).toHaveBeenCalledWith(42, [])
        expect(onError).not.toHaveBeenCalled()
      })

      it('calls onError on failed execution', async () => {
        const onSuccess = vi.fn()
        const onError = vi.fn()
        const error = new Error('async error')

        await safe.async(() => Promise.reject(error), { onSuccess, onError })

        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledWith(error, [])
        expect(onSuccess).not.toHaveBeenCalled()
      })

      it('works with parseError and hooks together', async () => {
        const onError = vi.fn()
        const parseError = (e: unknown) => `mapped: ${e}`

        await safe.async(() => Promise.reject('error'), parseError, { onError, defaultError: 'unknown error' })

        expect(onError).toHaveBeenCalledWith('mapped: error', [])
      })
    })

    describe('wrap with hooks', () => {
      it('calls onSuccess with result and context (args)', () => {
        const onSuccess = vi.fn()
        const onError = vi.fn()

        const divide = (a: number, b: number) => a / b
        const safeDivide = safe.wrap(divide, { onSuccess, onError })

        const result = safeDivide(10, 2)

        expect(result).toEqual([5, null])
        expect(onSuccess).toHaveBeenCalledTimes(1)
        expect(onSuccess).toHaveBeenCalledWith(5, [10, 2])
        expect(onError).not.toHaveBeenCalled()
      })

      it('calls onError with error and context (args)', () => {
        const onSuccess = vi.fn()
        const onError = vi.fn()

        const divide = (a: number, b: number) => {
          if (b === 0) throw new Error('Division by zero')
          return a / b
        }
        const safeDivide = safe.wrap(divide, { onSuccess, onError })

        const result = safeDivide(10, 0)

        expect(result[0]).toBeNull()
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledWith(expect.any(Error), [10, 0])
        expect(onSuccess).not.toHaveBeenCalled()
      })

      it('works with parseError and hooks together', () => {
        const onError = vi.fn()
        const parseError = (e: unknown) => ({
          type: 'division_error',
          original: e,
        })

        const divide = (a: number, b: number) => {
          if (b === 0) throw new Error('Division by zero')
          return a / b
        }
        const safeDivide = safe.wrap(divide, parseError, { onError, defaultError: { type: 'division_error', original: null } })

        safeDivide(10, 0)

        expect(onError).toHaveBeenCalledWith(
          { type: 'division_error', original: expect.any(Error) },
          [10, 0]
        )
      })

      it('context contains all function arguments', () => {
        const onSuccess = vi.fn()

        const createUser = (name: string, age: number, active: boolean) => ({
          name,
          age,
          active,
        })
        const safeCreate = safe.wrap(createUser, { onSuccess })

        safeCreate('John', 30, true)

        expect(onSuccess).toHaveBeenCalledWith(
          { name: 'John', age: 30, active: true },
          ['John', 30, true]
        )
      })

      it('hooks are called on each invocation', () => {
        const onSuccess = vi.fn()

        const wrapped = safe.wrap((x: number) => x * 2, { onSuccess })

        wrapped(1)
        wrapped(2)
        wrapped(3)

        expect(onSuccess).toHaveBeenCalledTimes(3)
        expect(onSuccess).toHaveBeenNthCalledWith(1, 2, [1])
        expect(onSuccess).toHaveBeenNthCalledWith(2, 4, [2])
        expect(onSuccess).toHaveBeenNthCalledWith(3, 6, [3])
      })
    })

    describe('wrapAsync with hooks', () => {
      it('calls onSuccess with result and context (args)', async () => {
        const onSuccess = vi.fn()
        const onError = vi.fn()

        const fetchUser = async (id: number) => ({ id, name: `User ${id}` })
        const safeFetch = safe.wrapAsync(fetchUser, { onSuccess, onError })

        const result = await safeFetch(42)

        expect(result).toEqual([{ id: 42, name: 'User 42' }, null])
        expect(onSuccess).toHaveBeenCalledTimes(1)
        expect(onSuccess).toHaveBeenCalledWith({ id: 42, name: 'User 42' }, [42])
        expect(onError).not.toHaveBeenCalled()
      })

      it('calls onError with error and context (args)', async () => {
        const onSuccess = vi.fn()
        const onError = vi.fn()

        const fetchUser = async (id: number) => {
          if (id <= 0) throw new Error('Invalid ID')
          return { id }
        }
        const safeFetch = safe.wrapAsync(fetchUser, { onSuccess, onError })

        await safeFetch(-1)

        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledWith(expect.any(Error), [-1])
        expect(onSuccess).not.toHaveBeenCalled()
      })

      it('works with parseError and hooks together', async () => {
        const onError = vi.fn()
        const parseError = (e: unknown) => ({
          statusCode: 400,
          message: e instanceof Error ? e.message : 'Unknown',
        })

        const postData = async (endpoint: string, body: object) => {
          if (!Object.keys(body).length) throw new Error('Empty body')
          return { endpoint, body }
        }
        const safePost = safe.wrapAsync(postData, parseError, { onError, defaultError: { statusCode: 0, message: 'unknown error' } })

        await safePost('/api/users', {})

        expect(onError).toHaveBeenCalledWith(
          { statusCode: 400, message: 'Empty body' },
          ['/api/users', {}]
        )
      })

      it('context contains all async function arguments', async () => {
        const onSuccess = vi.fn()

        const createRecord = async (
          table: string,
          data: object,
          options: { validate: boolean }
        ) => ({ table, data, options })

        const safeCreate = safe.wrapAsync(createRecord, { onSuccess })

        await safeCreate('users', { id: 1 }, { validate: true })

        expect(onSuccess).toHaveBeenCalledWith(
          { table: 'users', data: { id: 1 }, options: { validate: true } },
          ['users', { id: 1 }, { validate: true }]
        )
      })

      it('hooks are called on each async invocation', async () => {
        const onSuccess = vi.fn()

        const wrapped = safe.wrapAsync(async (x: number) => x * 2, {
          onSuccess,
        })

        await wrapped(1)
        await wrapped(2)
        await wrapped(3)

        expect(onSuccess).toHaveBeenCalledTimes(3)
        expect(onSuccess).toHaveBeenNthCalledWith(1, 2, [1])
        expect(onSuccess).toHaveBeenNthCalledWith(2, 4, [2])
        expect(onSuccess).toHaveBeenNthCalledWith(3, 6, [3])
      })
    })

    describe('type inference with hooks', () => {
      it('infers context type for wrap', () => {
        // This test validates TypeScript inference - if it compiles, it passes
        const wrapped = safe.wrap(
          (a: number, b: string) => `${a}-${b}`,
          {
            onSuccess: (result, [num, str]) => {
              // TypeScript should infer: result: string, num: number, str: string
              const _r: string = result
              const _n: number = num
              const _s: string = str
              void [_r, _n, _s]
            },
            onError: (error, [num, str]) => {
              const _e: Error = error
              const _n: number = num
              const _s: string = str
              void [_e, _n, _s]
            },
          }
        )

        expect(wrapped(1, 'test')).toEqual(['1-test', null])
      })

      it('infers mapped error type in hooks', () => {
        type AppError = { code: string; message: string }

        const wrapped = safe.wrap(
          () => {
            throw new Error('fail')
          },
          (e): AppError => ({
            code: 'ERR',
            message: e instanceof Error ? e.message : 'Unknown',
          }),
          {
            onError: (error) => {
              // TypeScript should infer error as AppError
              const _code: string = error.code
              const _msg: string = error.message
              void [_code, _msg]
            },
          }
        )

        const result = wrapped()
        expect(result[1]).toEqual({ code: 'ERR', message: 'fail' })
      })
    })
  })

  describe('onSettled hook', () => {
    describe('sync with onSettled', () => {
      it('calls onSettled with (result, null) on success', () => {
        const onSettled = vi.fn()

        safe.sync(() => 42, { onSettled })

        expect(onSettled).toHaveBeenCalledTimes(1)
        expect(onSettled).toHaveBeenCalledWith(42, null, [])
      })

      it('calls onSettled with (null, error) on failure', () => {
        const onSettled = vi.fn()
        const error = new Error('fail')

        safe.sync(() => { throw error }, { onSettled })

        expect(onSettled).toHaveBeenCalledTimes(1)
        expect(onSettled).toHaveBeenCalledWith(null, error, [])
      })

      it('calls onSettled after onSuccess on success', () => {
        const callOrder: string[] = []
        const onSuccess = vi.fn(() => callOrder.push('onSuccess'))
        const onSettled = vi.fn(() => callOrder.push('onSettled'))

        safe.sync(() => 42, { onSuccess, onSettled })

        expect(callOrder).toEqual(['onSuccess', 'onSettled'])
      })

      it('calls onSettled after onError on failure', () => {
        const callOrder: string[] = []
        const onError = vi.fn(() => callOrder.push('onError'))
        const onSettled = vi.fn(() => callOrder.push('onSettled'))

        safe.sync(() => { throw new Error('fail') }, { onError, onSettled })

        expect(callOrder).toEqual(['onError', 'onSettled'])
      })

      it('does not call onSuccess or onError when only onSettled is provided (success)', () => {
        const onSettled = vi.fn()

        const result = safe.sync(() => 42, { onSettled })

        expect(result).toEqual([42, null])
        expect(onSettled).toHaveBeenCalledWith(42, null, [])
      })

      it('does not call onSuccess or onError when only onSettled is provided (error)', () => {
        const onSettled = vi.fn()
        const error = new Error('fail')

        const result = safe.sync(() => { throw error }, { onSettled })

        expect(result).toEqual([null, error])
        expect(onSettled).toHaveBeenCalledWith(null, error, [])
      })

      it('works with parseError and onSettled', () => {
        const onSettled = vi.fn()
        const parseError = (e: unknown) => ({
          code: 'ERR',
          message: e instanceof Error ? e.message : 'Unknown',
        })

        safe.sync(
          () => { throw new Error('original') },
          parseError,
          { onSettled },
        )

        expect(onSettled).toHaveBeenCalledWith(
          null,
          { code: 'ERR', message: 'original' },
          [],
        )
      })
    })

    describe('async with onSettled', () => {
      it('calls onSettled with (result, null) on success', async () => {
        const onSettled = vi.fn()

        await safe.async(() => Promise.resolve(42), { onSettled })

        expect(onSettled).toHaveBeenCalledTimes(1)
        expect(onSettled).toHaveBeenCalledWith(42, null, [])
      })

      it('calls onSettled with (null, error) on failure', async () => {
        const onSettled = vi.fn()
        const error = new Error('async fail')

        await safe.async(() => Promise.reject(error), { onSettled })

        expect(onSettled).toHaveBeenCalledTimes(1)
        expect(onSettled).toHaveBeenCalledWith(null, error, [])
      })

      it('calls onSettled after onSuccess on success', async () => {
        const callOrder: string[] = []
        const onSuccess = vi.fn(() => callOrder.push('onSuccess'))
        const onSettled = vi.fn(() => callOrder.push('onSettled'))

        await safe.async(() => Promise.resolve('done'), { onSuccess, onSettled })

        expect(callOrder).toEqual(['onSuccess', 'onSettled'])
      })

      it('calls onSettled after onError on failure', async () => {
        const callOrder: string[] = []
        const onError = vi.fn(() => callOrder.push('onError'))
        const onSettled = vi.fn(() => callOrder.push('onSettled'))

        await safe.async(() => Promise.reject(new Error('fail')), { onError, onSettled })

        expect(callOrder).toEqual(['onError', 'onSettled'])
      })

      it('works with parseError and onSettled', async () => {
        const onSettled = vi.fn()

        await safe.async(
          () => Promise.reject('error'),
          (e) => `mapped: ${e}`,
          { onSettled },
        )

        expect(onSettled).toHaveBeenCalledWith(null, 'mapped: error', [])
      })

      it('onSettled fires only once after all retries exhausted', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'))
        const onSettled = vi.fn()

        await safe.async(fn, {
          retry: { times: 2 },
          onSettled,
        })

        expect(fn).toHaveBeenCalledTimes(3)
        expect(onSettled).toHaveBeenCalledTimes(1)
        expect(onSettled).toHaveBeenCalledWith(null, expect.any(Error), [])
      })

      it('onSettled fires once on success after retries', async () => {
        let attempts = 0
        const fn = vi.fn().mockImplementation(async () => {
          attempts++
          if (attempts < 3) throw new Error('fail')
          return 'success'
        })
        const onSettled = vi.fn()

        await safe.async(fn, {
          retry: { times: 3 },
          onSettled,
        })

        expect(onSettled).toHaveBeenCalledTimes(1)
        expect(onSettled).toHaveBeenCalledWith('success', null, [])
      })
    })

    describe('wrap with onSettled', () => {
      it('calls onSettled with result, null, and context on success', () => {
        const onSettled = vi.fn()

        const divide = (a: number, b: number) => a / b
        const safeDivide = safe.wrap(divide, { onSettled })

        safeDivide(10, 2)

        expect(onSettled).toHaveBeenCalledTimes(1)
        expect(onSettled).toHaveBeenCalledWith(5, null, [10, 2])
      })

      it('calls onSettled with null, error, and context on failure', () => {
        const onSettled = vi.fn()

        const divide = (a: number, b: number) => {
          if (b === 0) throw new Error('Division by zero')
          return a / b
        }
        const safeDivide = safe.wrap(divide, { onSettled })

        safeDivide(10, 0)

        expect(onSettled).toHaveBeenCalledTimes(1)
        expect(onSettled).toHaveBeenCalledWith(null, expect.any(Error), [10, 0])
      })

      it('calls onSettled after onSuccess on success', () => {
        const callOrder: string[] = []
        const onSuccess = vi.fn(() => callOrder.push('onSuccess'))
        const onSettled = vi.fn(() => callOrder.push('onSettled'))

        const wrapped = safe.wrap((x: number) => x * 2, { onSuccess, onSettled })
        wrapped(5)

        expect(callOrder).toEqual(['onSuccess', 'onSettled'])
      })

      it('calls onSettled after onError on failure', () => {
        const callOrder: string[] = []
        const onError = vi.fn(() => callOrder.push('onError'))
        const onSettled = vi.fn(() => callOrder.push('onSettled'))

        const wrapped = safe.wrap(() => { throw new Error('fail') }, { onError, onSettled })
        wrapped()

        expect(callOrder).toEqual(['onError', 'onSettled'])
      })

      it('onSettled is called on each invocation', () => {
        const onSettled = vi.fn()

        const wrapped = safe.wrap((x: number) => x * 2, { onSettled })

        wrapped(1)
        wrapped(2)
        wrapped(3)

        expect(onSettled).toHaveBeenCalledTimes(3)
        expect(onSettled).toHaveBeenNthCalledWith(1, 2, null, [1])
        expect(onSettled).toHaveBeenNthCalledWith(2, 4, null, [2])
        expect(onSettled).toHaveBeenNthCalledWith(3, 6, null, [3])
      })

      it('works with parseError and onSettled', () => {
        const onSettled = vi.fn()

        const wrapped = safe.wrap(
          () => { throw new Error('fail') },
          (e) => ({ code: 'ERR', msg: e instanceof Error ? e.message : 'Unknown' }),
          { onSettled },
        )

        wrapped()

        expect(onSettled).toHaveBeenCalledWith(
          null,
          { code: 'ERR', msg: 'fail' },
          [],
        )
      })
    })

    describe('wrapAsync with onSettled', () => {
      it('calls onSettled with result, null, and context on success', async () => {
        const onSettled = vi.fn()

        const fetchUser = async (id: number) => ({ id, name: `User ${id}` })
        const safeFetch = safe.wrapAsync(fetchUser, { onSettled })

        await safeFetch(42)

        expect(onSettled).toHaveBeenCalledTimes(1)
        expect(onSettled).toHaveBeenCalledWith({ id: 42, name: 'User 42' }, null, [42])
      })

      it('calls onSettled with null, error, and context on failure', async () => {
        const onSettled = vi.fn()

        const fetchUser = async (id: number) => {
          if (id <= 0) throw new Error('Invalid ID')
          return { id }
        }
        const safeFetch = safe.wrapAsync(fetchUser, { onSettled })

        await safeFetch(-1)

        expect(onSettled).toHaveBeenCalledTimes(1)
        expect(onSettled).toHaveBeenCalledWith(null, expect.any(Error), [-1])
      })

      it('calls onSettled after onSuccess on success', async () => {
        const callOrder: string[] = []
        const onSuccess = vi.fn(() => callOrder.push('onSuccess'))
        const onSettled = vi.fn(() => callOrder.push('onSettled'))

        const wrapped = safe.wrapAsync(async (x: number) => x * 2, { onSuccess, onSettled })
        await wrapped(5)

        expect(callOrder).toEqual(['onSuccess', 'onSettled'])
      })

      it('calls onSettled after onError on failure', async () => {
        const callOrder: string[] = []
        const onError = vi.fn(() => callOrder.push('onError'))
        const onSettled = vi.fn(() => callOrder.push('onSettled'))

        const wrapped = safe.wrapAsync(async () => { throw new Error('fail') }, { onError, onSettled })
        await wrapped()

        expect(callOrder).toEqual(['onError', 'onSettled'])
      })

      it('onSettled fires only once after all retries exhausted', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'))
        const onSettled = vi.fn()

        const wrapped = safe.wrapAsync(fn, {
          retry: { times: 2 },
          onSettled,
        })

        await wrapped()

        expect(fn).toHaveBeenCalledTimes(3)
        expect(onSettled).toHaveBeenCalledTimes(1)
        expect(onSettled).toHaveBeenCalledWith(null, expect.any(Error), [])
      })

      it('onSettled fires once on success after retries', async () => {
        let attempts = 0
        const fn = vi.fn().mockImplementation(async () => {
          attempts++
          if (attempts < 3) throw new Error('fail')
          return 'success'
        })
        const onSettled = vi.fn()

        const wrapped = safe.wrapAsync(fn, {
          retry: { times: 3 },
          onSettled,
        })

        await wrapped()

        expect(onSettled).toHaveBeenCalledTimes(1)
        expect(onSettled).toHaveBeenCalledWith('success', null, [])
      })

      it('works with parseError and onSettled', async () => {
        const onSettled = vi.fn()

        const wrapped = safe.wrapAsync(
          async () => { throw new Error('fail') },
          (e) => ({ code: 'ERR', msg: e instanceof Error ? e.message : 'Unknown' }),
          { onSettled },
        )

        await wrapped()

        expect(onSettled).toHaveBeenCalledWith(
          null,
          { code: 'ERR', msg: 'fail' },
          [],
        )
      })

      it('context contains all async function arguments', async () => {
        const onSettled = vi.fn()

        const createRecord = async (
          table: string,
          data: object,
          options: { validate: boolean },
        ) => ({ table, data, options })

        const safeCreate = safe.wrapAsync(createRecord, { onSettled })

        await safeCreate('users', { id: 1 }, { validate: true })

        expect(onSettled).toHaveBeenCalledWith(
          { table: 'users', data: { id: 1 }, options: { validate: true } },
          null,
          ['users', { id: 1 }, { validate: true }],
        )
      })
    })

    describe('type inference with onSettled', () => {
      it('infers result and error types for wrap', () => {
        const wrapped = safe.wrap(
          (a: number, b: string) => `${a}-${b}`,
          {
            onSettled: (result, error, [num, str]) => {
              const _r: string | null = result
              const _e: Error | null = error
              const _n: number = num
              const _s: string = str
              void [_r, _e, _n, _s]
            },
          },
        )

        expect(wrapped(1, 'test')).toEqual(['1-test', null])
      })

      it('infers mapped error type in onSettled', () => {
        type AppError = { code: string; message: string }

        const wrapped = safe.wrap(
          () => { throw new Error('fail') },
          (e): AppError => ({
            code: 'ERR',
            message: e instanceof Error ? e.message : 'Unknown',
          }),
          {
            onSettled: (result, error) => {
              const _r: never | null = result
              const _e: AppError | null = error
              void [_r, _e]
            },
          },
        )

        const result = wrapped()
        expect(result[1]).toEqual({ code: 'ERR', message: 'fail' })
      })
    })
  })

  describe('retry', () => {
    describe('safe.async with retry', () => {
      it('succeeds on first attempt with no retries', async () => {
        const fn = vi.fn().mockResolvedValue('success')
        const onRetry = vi.fn()

        const result = await safe.async(fn, {
          retry: { times: 3 },
          onRetry,
        })

        expect(result).toEqual(['success', null])
        expect(fn).toHaveBeenCalledTimes(1)
        expect(onRetry).not.toHaveBeenCalled()
      })

      it('retries and succeeds after partial failures', async () => {
        let attempts = 0
        const fn = vi.fn().mockImplementation(async () => {
          attempts++
          if (attempts < 3) throw new Error(`Attempt ${attempts} failed`)
          return 'success'
        })
        const onRetry = vi.fn()

        const result = await safe.async(fn, {
          retry: { times: 3 },
          onRetry,
        })

        expect(result).toEqual(['success', null])
        expect(fn).toHaveBeenCalledTimes(3)
        expect(onRetry).toHaveBeenCalledTimes(2)
      })

      it('exhausts all attempts then fails', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('always fails'))
        const onRetry = vi.fn()
        const onError = vi.fn()

        const result = await safe.async(fn, {
          retry: { times: 2 },
          onRetry,
          onError,
        })

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
        expect(onRetry).toHaveBeenCalledTimes(2)
        expect(onError).toHaveBeenCalledTimes(1)
      })

      it('calls onRetry with 1-indexed attempt number', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'))
        const onRetry = vi.fn()

        await safe.async(fn, {
          retry: { times: 3 },
          onRetry,
        })

        expect(onRetry).toHaveBeenCalledTimes(3)
        expect(onRetry).toHaveBeenNthCalledWith(1, expect.any(Error), 1, [])
        expect(onRetry).toHaveBeenNthCalledWith(2, expect.any(Error), 2, [])
        expect(onRetry).toHaveBeenNthCalledWith(3, expect.any(Error), 3, [])
      })

      it('calls waitBefore with 1-indexed attempt number', async () => {
        vi.useFakeTimers()
        const fn = vi.fn().mockRejectedValue(new Error('fail'))
        const waitBefore = vi.fn().mockReturnValue(0)

        const promise = safe.async(fn, {
          retry: { times: 2, waitBefore },
        })

        await vi.runAllTimersAsync()
        await promise

        expect(waitBefore).toHaveBeenCalledTimes(2)
        expect(waitBefore).toHaveBeenNthCalledWith(1, 1)
        expect(waitBefore).toHaveBeenNthCalledWith(2, 2)

        vi.useRealTimers()
      })

      it('waits before retry when waitBefore returns positive value', async () => {
        vi.useFakeTimers()
        let attempts = 0
        const fn = vi.fn().mockImplementation(async () => {
          attempts++
          if (attempts < 2) throw new Error('fail')
          return 'success'
        })

        const promise = safe.async(fn, {
          retry: { times: 2, waitBefore: () => 100 },
        })

        // First attempt should happen immediately
        await vi.advanceTimersByTimeAsync(0)
        expect(fn).toHaveBeenCalledTimes(1)

        // Wait for the 100ms delay
        await vi.advanceTimersByTimeAsync(100)
        await promise

        expect(fn).toHaveBeenCalledTimes(2)

        vi.useRealTimers()
      })

      it('onError only fires after all retries exhausted', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'))
        const onError = vi.fn()
        const onRetry = vi.fn()

        await safe.async(fn, {
          retry: { times: 2 },
          onRetry,
          onError,
        })

        // onError called once at the end
        expect(onError).toHaveBeenCalledTimes(1)
        // onRetry called for each retry (not the final failure)
        expect(onRetry).toHaveBeenCalledTimes(2)
      })

      it('works with parseError and retry', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('original'))
        const parseError = vi.fn((e: unknown) => ({
          code: 'ERR',
          message: e instanceof Error ? e.message : 'unknown',
        }))
        const onRetry = vi.fn()

        const result = await safe.async(fn, parseError, {
          retry: { times: 1 },
          onRetry,
          defaultError: { code: 'UNKNOWN', message: 'unknown' },
        })

        expect(result[1]).toEqual({ code: 'ERR', message: 'original' })
        // parseError called for each attempt
        expect(parseError).toHaveBeenCalledTimes(2)
        expect(onRetry).toHaveBeenCalledWith(
          { code: 'ERR', message: 'original' },
          1,
          []
        )
      })

      it('does not retry when times is 0', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'))
        const onRetry = vi.fn()

        await safe.async(fn, {
          retry: { times: 0 },
          onRetry,
        })

        expect(fn).toHaveBeenCalledTimes(1)
        expect(onRetry).not.toHaveBeenCalled()
      })
    })

    describe('safe.wrapAsync with retry', () => {
      it('succeeds on first attempt with no retries', async () => {
        const fn = vi.fn().mockResolvedValue('success')
        const onRetry = vi.fn()

        const wrapped = safe.wrapAsync(fn, {
          retry: { times: 3 },
          onRetry,
        })

        const result = await wrapped()

        expect(result).toEqual(['success', null])
        expect(fn).toHaveBeenCalledTimes(1)
        expect(onRetry).not.toHaveBeenCalled()
      })

      it('retries and succeeds after partial failures', async () => {
        let attempts = 0
        const fn = vi.fn().mockImplementation(async (id: number) => {
          attempts++
          if (attempts < 3) throw new Error(`Attempt ${attempts} failed`)
          return { id }
        })
        const onRetry = vi.fn()

        const wrapped = safe.wrapAsync(fn, {
          retry: { times: 3 },
          onRetry,
        })

        const result = await wrapped(42)

        expect(result).toEqual([{ id: 42 }, null])
        expect(fn).toHaveBeenCalledTimes(3)
        expect(onRetry).toHaveBeenCalledTimes(2)
      })

      it('exhausts all attempts then fails', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('always fails'))
        const onRetry = vi.fn()
        const onError = vi.fn()

        const wrapped = safe.wrapAsync(fn, {
          retry: { times: 2 },
          onRetry,
          onError,
        })

        const result = await wrapped()

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect(fn).toHaveBeenCalledTimes(3)
        expect(onRetry).toHaveBeenCalledTimes(2)
        expect(onError).toHaveBeenCalledTimes(1)
      })

      it('passes function args as context to onRetry', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'))
        const onRetry = vi.fn()

        const wrapped = safe.wrapAsync(
          async (a: number, b: string) => {
            throw new Error('fail')
          },
          {
            retry: { times: 1 },
            onRetry,
          }
        )

        await wrapped(42, 'test')

        expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, [42, 'test'])
      })

      it('calls waitBefore with 1-indexed attempt number', async () => {
        vi.useFakeTimers()
        const fn = vi.fn().mockRejectedValue(new Error('fail'))
        const waitBefore = vi.fn().mockReturnValue(0)

        const wrapped = safe.wrapAsync(fn, {
          retry: { times: 2, waitBefore },
        })

        const promise = wrapped()
        await vi.runAllTimersAsync()
        await promise

        expect(waitBefore).toHaveBeenCalledTimes(2)
        expect(waitBefore).toHaveBeenNthCalledWith(1, 1)
        expect(waitBefore).toHaveBeenNthCalledWith(2, 2)

        vi.useRealTimers()
      })

      it('waits before retry when waitBefore returns positive value', async () => {
        vi.useFakeTimers()
        let attempts = 0
        const fn = vi.fn().mockImplementation(async () => {
          attempts++
          if (attempts < 2) throw new Error('fail')
          return 'success'
        })

        const wrapped = safe.wrapAsync(fn, {
          retry: { times: 2, waitBefore: () => 100 },
        })

        const promise = wrapped()

        // First attempt should happen immediately
        await vi.advanceTimersByTimeAsync(0)
        expect(fn).toHaveBeenCalledTimes(1)

        // Wait for the 100ms delay
        await vi.advanceTimersByTimeAsync(100)
        await promise

        expect(fn).toHaveBeenCalledTimes(2)

        vi.useRealTimers()
      })

      it('works with parseError and retry', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('original'))
        const parseError = vi.fn((e: unknown) => ({
          code: 'ERR',
          message: e instanceof Error ? e.message : 'unknown',
        }))
        const onRetry = vi.fn()

        const wrapped = safe.wrapAsync(fn, parseError, {
          retry: { times: 1 },
          onRetry,
          defaultError: { code: 'UNKNOWN', message: 'unknown' },
        })

        const result = await wrapped()

        expect(result[1]).toEqual({ code: 'ERR', message: 'original' })
        expect(parseError).toHaveBeenCalledTimes(2)
        expect(onRetry).toHaveBeenCalledWith(
          { code: 'ERR', message: 'original' },
          1,
          []
        )
      })

      it('does not retry when times is 0', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'))
        const onRetry = vi.fn()

        const wrapped = safe.wrapAsync(fn, {
          retry: { times: 0 },
          onRetry,
        })

        await wrapped()

        expect(fn).toHaveBeenCalledTimes(1)
        expect(onRetry).not.toHaveBeenCalled()
      })

      it('each call to wrapped function runs independent retries', async () => {
        let call1Attempts = 0
        let call2Attempts = 0

        const fn = vi.fn().mockImplementation(async (callId: number) => {
          if (callId === 1) {
            call1Attempts++
            if (call1Attempts < 2) throw new Error('fail')
            return 'call1-success'
          } else {
            call2Attempts++
            if (call2Attempts < 3) throw new Error('fail')
            return 'call2-success'
          }
        })

        const wrapped = safe.wrapAsync(fn, {
          retry: { times: 3 },
        })

        const [result1, result2] = await Promise.all([
          wrapped(1),
          wrapped(2),
        ])

        expect(result1).toEqual(['call1-success', null])
        expect(result2).toEqual(['call2-success', null])
        expect(call1Attempts).toBe(2)
        expect(call2Attempts).toBe(3)
      })
    })

    describe('type safety', () => {
      it('SafeAsyncHooks type includes retry and onRetry', () => {
        const hooks: SafeAsyncHooks<number, Error, [string]> = {
          onSuccess: (result, context) => {
            const _r: number = result
            const _c: [string] = context
            void [_r, _c]
          },
          onError: (error, context) => {
            const _e: Error = error
            const _c: [string] = context
            void [_e, _c]
          },
          onRetry: (error, attempt, context) => {
            const _e: Error = error
            const _a: number = attempt
            const _c: [string] = context
            void [_e, _a, _c]
          },
          retry: {
            times: 3,
            waitBefore: (attempt) => attempt * 100,
          },
        }

        expect(hooks).toBeDefined()
      })

      it('RetryConfig type is correct', () => {
        const config: RetryConfig = {
          times: 3,
          waitBefore: (attempt) => attempt * 100,
        }

        expect(config.times).toBe(3)
        expect(config.waitBefore?.(1)).toBe(100)
        expect(config.waitBefore?.(2)).toBe(200)
      })
    })
  })

  describe('abortAfter (timeout)', () => {
    describe('safe.async with abortAfter', () => {
      it('returns TimeoutError when operation exceeds timeout', async () => {
        vi.useFakeTimers()

        const fn = vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve('done'), 1000))
        )

        const promise = safe.async(fn, { abortAfter: 100 })

        await vi.advanceTimersByTimeAsync(100)
        const result = await promise

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(TimeoutError)
        expect((result[1] as TimeoutError).message).toBe('Operation timed out after 100ms')

        vi.useRealTimers()
      })

      it('returns result when operation completes within timeout', async () => {
        vi.useFakeTimers()

        const fn = vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve('success'), 50))
        )

        const promise = safe.async(fn, { abortAfter: 100 })

        await vi.advanceTimersByTimeAsync(50)
        const result = await promise

        expect(result).toEqual(['success', null])

        vi.useRealTimers()
      })

      it('passes AbortSignal to the function', async () => {
        vi.useFakeTimers()

        let receivedSignal: AbortSignal | undefined

        const fn = vi.fn().mockImplementation((signal?: AbortSignal) => {
          receivedSignal = signal
          return new Promise((resolve) => setTimeout(() => resolve('done'), 50))
        })

        const promise = safe.async(fn, { abortAfter: 100 })
        await vi.advanceTimersByTimeAsync(50)
        await promise

        expect(receivedSignal).toBeDefined()
        expect(receivedSignal).toBeInstanceOf(AbortSignal)

        vi.useRealTimers()
      })

      it('aborts the signal when timeout occurs', async () => {
        vi.useFakeTimers()

        let receivedSignal: AbortSignal | undefined

        const fn = vi.fn().mockImplementation((signal?: AbortSignal) => {
          receivedSignal = signal
          return new Promise((resolve) => setTimeout(() => resolve('done'), 1000))
        })

        const promise = safe.async(fn, { abortAfter: 100 })
        await vi.advanceTimersByTimeAsync(100)
        await promise

        expect(receivedSignal?.aborted).toBe(true)

        vi.useRealTimers()
      })

      it('works without timeout when abortAfter is not set', async () => {
        const fn = vi.fn().mockResolvedValue('success')

        const result = await safe.async(fn)

        expect(result).toEqual(['success', null])
        // Function should not receive signal when abortAfter is not set
        expect(fn).toHaveBeenCalledWith(undefined)
      })

      it('transforms TimeoutError with parseError', async () => {
        vi.useFakeTimers()

        const fn = vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve('done'), 1000))
        )

        const parseError = (e: unknown) => ({
          code: e instanceof TimeoutError ? 'TIMEOUT' : 'UNKNOWN',
          message: e instanceof Error ? e.message : 'Unknown error',
        })

        const promise = safe.async(fn, parseError, { abortAfter: 100, defaultError: { code: 'UNKNOWN', message: 'unknown error' } })

        await vi.advanceTimersByTimeAsync(100)
        const result = await promise

        expect(result[0]).toBeNull()
        expect(result[1]).toEqual({
          code: 'TIMEOUT',
          message: 'Operation timed out after 100ms',
        })

        vi.useRealTimers()
      })

      it('each retry attempt gets its own timeout', async () => {
        vi.useFakeTimers()

        let attempts = 0
        const fn = vi.fn().mockImplementation(() => {
          attempts++
          // First two attempts timeout, third succeeds quickly
          const delay = attempts < 3 ? 200 : 10
          return new Promise((resolve) => setTimeout(() => resolve('success'), delay))
        })

        const onRetry = vi.fn()

        const promise = safe.async(fn, {
          abortAfter: 100,
          retry: { times: 2 },
          onRetry,
        })

        // First attempt times out at 100ms
        await vi.advanceTimersByTimeAsync(100)
        // Second attempt times out at 100ms
        await vi.advanceTimersByTimeAsync(100)
        // Third attempt succeeds at 10ms
        await vi.advanceTimersByTimeAsync(10)

        const result = await promise

        expect(result).toEqual(['success', null])
        expect(onRetry).toHaveBeenCalledTimes(2)
        expect(fn).toHaveBeenCalledTimes(3)

        vi.useRealTimers()
      })

      it('each retry attempt gets a fresh AbortController', async () => {
        vi.useFakeTimers()

        const signals: AbortSignal[] = []

        const fn = vi.fn().mockImplementation((signal?: AbortSignal) => {
          if (signal) signals.push(signal)
          return new Promise((resolve) => setTimeout(() => resolve('done'), 200))
        })

        const promise = safe.async(fn, {
          abortAfter: 100,
          retry: { times: 1 },
        })

        await vi.advanceTimersByTimeAsync(100)
        await vi.advanceTimersByTimeAsync(100)
        await promise

        expect(signals.length).toBe(2)
        expect(signals[0]).not.toBe(signals[1])
        expect(signals[0].aborted).toBe(true)
        expect(signals[1].aborted).toBe(true)

        vi.useRealTimers()
      })
    })

    describe('safe.wrapAsync with abortAfter', () => {
      it('returns TimeoutError when wrapped function exceeds timeout', async () => {
        vi.useFakeTimers()

        const fn = (id: number) =>
          new Promise((resolve) => setTimeout(() => resolve({ id }), 1000))

        const safeFn = safe.wrapAsync(fn, { abortAfter: 100 })

        const promise = safeFn(42)
        await vi.advanceTimersByTimeAsync(100)
        const result = await promise

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(TimeoutError)

        vi.useRealTimers()
      })

      it('returns result when wrapped function completes within timeout', async () => {
        vi.useFakeTimers()

        const fn = (id: number) =>
          new Promise<{ id: number }>((resolve) =>
            setTimeout(() => resolve({ id }), 50)
          )

        const safeFn = safe.wrapAsync(fn, { abortAfter: 100 })

        const promise = safeFn(42)
        await vi.advanceTimersByTimeAsync(50)
        const result = await promise

        expect(result).toEqual([{ id: 42 }, null])

        vi.useRealTimers()
      })

      it('does not inject AbortSignal into wrapped function args', async () => {
        vi.useFakeTimers()

        let receivedArgs: unknown[] = []

        const fn = vi.fn().mockImplementation((id: number, name: string) => {
          receivedArgs = [id, name]
          return new Promise((resolve) => setTimeout(() => resolve('done'), 50))
        })

        const safeFn = safe.wrapAsync(fn, { abortAfter: 100 })

        const promise = safeFn(42, 'test')
        await vi.advanceTimersByTimeAsync(50)
        await promise

        expect(receivedArgs).toEqual([42, 'test'])
        expect(fn).toHaveBeenCalledWith(42, 'test')

        vi.useRealTimers()
      })

      it('works with parseError and abortAfter', async () => {
        vi.useFakeTimers()

        const fn = (id: number) =>
          new Promise((resolve) => setTimeout(() => resolve({ id }), 1000))

        const safeFn = safe.wrapAsync(
          fn,
          (e) => ({
            type: e instanceof TimeoutError ? 'timeout' : 'error',
            msg: e instanceof Error ? e.message : 'Unknown',
          }),
          { abortAfter: 100 }
        )

        const promise = safeFn(42)
        await vi.advanceTimersByTimeAsync(100)
        const result = await promise

        expect(result[0]).toBeNull()
        expect(result[1]).toEqual({
          type: 'timeout',
          msg: 'Operation timed out after 100ms',
        })

        vi.useRealTimers()
      })

      it('works without signal when abortAfter is not set', async () => {
        const fn = vi.fn().mockResolvedValue('success')

        const safeFn = safe.wrapAsync(fn)
        const result = await safeFn()

        expect(result).toEqual(['success', null])
        // Should not pass signal when abortAfter is not configured
        expect(fn).toHaveBeenCalledWith()
      })

      it('each call gets independent timeout', async () => {
        vi.useFakeTimers()

        const fn = (delay: number) =>
          new Promise<string>((resolve) =>
            setTimeout(() => resolve(`done-${delay}`), delay)
          )

        const safeFn = safe.wrapAsync(fn, { abortAfter: 100 })

        const promise1 = safeFn(50) // Should succeed
        const promise2 = safeFn(200) // Should timeout

        await vi.advanceTimersByTimeAsync(50)
        const result1 = await promise1

        await vi.advanceTimersByTimeAsync(50) // Now at 100ms total
        const result2 = await promise2

        expect(result1).toEqual(['done-50', null])
        expect(result2[0]).toBeNull()
        expect(result2[1]).toBeInstanceOf(TimeoutError)

        vi.useRealTimers()
      })
    })

    describe('TimeoutError class', () => {
      it('has correct name property', () => {
        const error = new TimeoutError(100)
        expect(error.name).toBe('TimeoutError')
      })

      it('has correct message format', () => {
        const error = new TimeoutError(5000)
        expect(error.message).toBe('Operation timed out after 5000ms')
      })

      it('is instance of Error', () => {
        const error = new TimeoutError(100)
        expect(error).toBeInstanceOf(Error)
        expect(error).toBeInstanceOf(TimeoutError)
      })
    })
  })

  describe('parseResult', () => {
    describe('sync with parseResult', () => {
      it('transforms the successful result', () => {
        const result = safe.sync(() => '{"name":"John"}', {
          parseResult: (raw) => JSON.parse(raw) as { name: string },
        })

        expect(result).toEqual([{ name: 'John' }, null])
      })

      it('onSuccess receives the transformed value', () => {
        const onSuccess = vi.fn()

        safe.sync(() => 10, {
          parseResult: (n) => n * 2,
          onSuccess,
        })

        expect(onSuccess).toHaveBeenCalledWith(20, [])
      })

      it('onSettled receives the transformed value on success', () => {
        const onSettled = vi.fn()

        safe.sync(() => 'hello', {
          parseResult: (s) => s.length,
          onSettled,
        })

        expect(onSettled).toHaveBeenCalledWith(5, null, [])
      })

      it('returns error when parseResult throws', () => {
        const result = safe.sync(() => 'not json', {
          parseResult: (raw) => JSON.parse(raw),
        })

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(SyntaxError)
      })

      it('returns parsed error when parseResult throws (with parseError)', () => {
        const result = safe.sync(
          () => 'invalid',
          (e) => ({ code: 'PARSE_FAIL', msg: e instanceof Error ? e.message : 'unknown' }),
          {
            parseResult: () => { throw new Error('validation failed') },
          },
        )

        expect(result[0]).toBeNull()
        expect(result[1]).toEqual({ code: 'PARSE_FAIL', msg: 'validation failed' })
      })

      it('parseResult is not called on error path', () => {
        const parseResult = vi.fn((x: number) => x * 2)

        safe.sync(
          () => { throw new Error('fail') },
          { parseResult },
        )

        expect(parseResult).not.toHaveBeenCalled()
      })

      it('works with parseError and parseResult together', () => {
        const result = safe.sync(
          () => '42',
          (e) => `error: ${e}`,
          {
            parseResult: (s) => parseInt(s, 10),
          },
        )

        expect(result).toEqual([42, null])
      })

      it('handles falsy transform results', () => {
        expect(safe.sync(() => 'truthy', { parseResult: () => null })).toEqual([null, null])
        expect(safe.sync(() => 'truthy', { parseResult: () => undefined })).toEqual([undefined, null])
        expect(safe.sync(() => 'truthy', { parseResult: () => 0 })).toEqual([0, null])
        expect(safe.sync(() => 'truthy', { parseResult: () => false })).toEqual([false, null])
      })
    })

    describe('async with parseResult', () => {
      it('transforms the successful async result', async () => {
        const result = await safe.async(() => Promise.resolve('{"id":1}'), {
          parseResult: (raw) => JSON.parse(raw) as { id: number },
        })

        expect(result).toEqual([{ id: 1 }, null])
      })

      it('onSuccess receives the transformed value', async () => {
        const onSuccess = vi.fn()

        await safe.async(() => Promise.resolve(5), {
          parseResult: (n) => n * 3,
          onSuccess,
        })

        expect(onSuccess).toHaveBeenCalledWith(15, [])
      })

      it('returns error when parseResult throws', async () => {
        const result = await safe.async(() => Promise.resolve('bad json'), {
          parseResult: (raw) => JSON.parse(raw),
        })

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(SyntaxError)
      })

      it('returns parsed error when parseResult throws (with parseError)', async () => {
        const result = await safe.async(
          () => Promise.resolve('data'),
          (e) => ({ code: 'FAIL', msg: e instanceof Error ? e.message : 'unknown' }),
          {
            parseResult: () => { throw new Error('bad data') },
          },
        )

        expect(result[0]).toBeNull()
        expect(result[1]).toEqual({ code: 'FAIL', msg: 'bad data' })
      })

      it('parseResult throw triggers retry', async () => {
        const fn = vi.fn().mockResolvedValue('data')

        const result = await safe.async(fn, {
          parseResult: () => { throw new Error('always fails') },
          retry: { times: 3 },
        })

        // parseResult failure goes through the error path and triggers retries
        expect(fn).toHaveBeenCalledTimes(4)
        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
      })
    })

    describe('wrap with parseResult', () => {
      it('transforms the successful result with context', () => {
        const onSuccess = vi.fn()

        const safeFn = safe.wrap(
          (a: number, b: number) => a + b,
          {
            parseResult: (sum) => `sum: ${sum}`,
            onSuccess,
          },
        )

        const result = safeFn(3, 4)

        expect(result).toEqual(['sum: 7', null])
        expect(onSuccess).toHaveBeenCalledWith('sum: 7', [3, 4])
      })

      it('onSettled receives transformed value with context', () => {
        const onSettled = vi.fn()

        const safeFn = safe.wrap(
          (x: number) => x,
          {
            parseResult: (n) => n > 0,
            onSettled,
          },
        )

        safeFn(5)

        expect(onSettled).toHaveBeenCalledWith(true, null, [5])
      })

      it('returns error when parseResult throws', () => {
        const safeFn = safe.wrap(
          (x: number) => x,
          {
            parseResult: () => { throw new Error('transform failed') },
          },
        )

        const result = safeFn(42)

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect((result[1] as Error).message).toBe('transform failed')
      })

      it('multiple calls each transform independently', () => {
        const safeFn = safe.wrap(
          (x: number) => x,
          {
            parseResult: (n) => n * 10,
          },
        )

        expect(safeFn(1)).toEqual([10, null])
        expect(safeFn(2)).toEqual([20, null])
        expect(safeFn(3)).toEqual([30, null])
      })
    })

    describe('wrapAsync with parseResult', () => {
      it('transforms the successful async result with context', async () => {
        const onSuccess = vi.fn()

        const safeFn = safe.wrapAsync(
          async (id: number) => ({ id, name: `User ${id}` }),
          {
            parseResult: (user) => user.name,
            onSuccess,
          },
        )

        const result = await safeFn(42)

        expect(result).toEqual(['User 42', null])
        expect(onSuccess).toHaveBeenCalledWith('User 42', [42])
      })

      it('returns error when parseResult throws', async () => {
        const safeFn = safe.wrapAsync(
          async (id: number) => ({ id }),
          {
            parseResult: () => { throw new Error('transform failed') },
          },
        )

        const result = await safeFn(1)

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect((result[1] as Error).message).toBe('transform failed')
      })

      it('parseResult throw triggers retry', async () => {
        const fn = vi.fn().mockResolvedValue({ id: 42 })

        const safeFn = safe.wrapAsync(fn, {
          parseResult: () => { throw new Error('not valid yet') },
          retry: { times: 2 },
        })

        const result = await safeFn(42)

        // parseResult failure goes through the error path and triggers retries
        expect(fn).toHaveBeenCalledTimes(3)
        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
      })
    })

    describe('backward compatibility', () => {
      it('without parseResult, sync behavior is unchanged', () => {
        const result = safe.sync(() => 42)
        expect(result).toEqual([42, null])
      })

      it('without parseResult, async behavior is unchanged', async () => {
        const result = await safe.async(() => Promise.resolve('hello'))
        expect(result).toEqual(['hello', null])
      })

      it('without parseResult, wrap behavior is unchanged', () => {
        const safeFn = safe.wrap((a: number, b: number) => a + b)
        expect(safeFn(1, 2)).toEqual([3, null])
      })

      it('without parseResult, wrapAsync behavior is unchanged', async () => {
        const safeFn = safe.wrapAsync(async (id: number) => ({ id }))
        expect(await safeFn(1)).toEqual([{ id: 1 }, null])
      })

      it('hooks without parseResult work identically', () => {
        const onSuccess = vi.fn()
        safe.sync(() => 42, { onSuccess })
        expect(onSuccess).toHaveBeenCalledWith(42, [])
      })
    })
  })

  describe('async edge cases (timeout + retry + abort interactions)', () => {
    describe('onRetry with TimeoutError', () => {
      it('receives correct 1-indexed attempt number when timeout triggers retry', async () => {
        vi.useFakeTimers()

        const fn = vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve('done'), 500))
        )
        const onRetry = vi.fn()

        const promise = safe.async(fn, {
          abortAfter: 100,
          retry: { times: 2 },
          onRetry,
        })

        // Attempt 1 times out
        await vi.advanceTimersByTimeAsync(100)
        // Attempt 2 times out
        await vi.advanceTimersByTimeAsync(100)
        // Attempt 3 times out (final, no onRetry)
        await vi.advanceTimersByTimeAsync(100)

        await promise

        expect(onRetry).toHaveBeenCalledTimes(2)
        expect(onRetry).toHaveBeenNthCalledWith(1, expect.any(TimeoutError), 1, [])
        expect(onRetry).toHaveBeenNthCalledWith(2, expect.any(TimeoutError), 2, [])

        vi.useRealTimers()
      })

      it('receives TimeoutError through parseError during retry', async () => {
        vi.useFakeTimers()

        const fn = vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve('done'), 500))
        )
        const parseError = vi.fn((e: unknown) => ({
          type: e instanceof TimeoutError ? 'timeout' : 'other',
          message: e instanceof Error ? e.message : 'unknown',
        }))
        const onRetry = vi.fn()

        const promise = safe.async(fn, parseError, {
          abortAfter: 100,
          retry: { times: 1 },
          onRetry,
          defaultError: { type: 'unknown', message: 'unknown' },
        })

        await vi.advanceTimersByTimeAsync(100)
        await vi.advanceTimersByTimeAsync(100)
        await promise

        expect(onRetry).toHaveBeenCalledWith(
          { type: 'timeout', message: 'Operation timed out after 100ms' },
          1,
          []
        )

        vi.useRealTimers()
      })
    })

    describe('onSettled with TimeoutError', () => {
      it('receives TimeoutError when operation times out (no retry)', async () => {
        vi.useFakeTimers()

        const onSettled = vi.fn()
        const onError = vi.fn()

        const promise = safe.async(
          () => new Promise((resolve) => setTimeout(() => resolve('done'), 500)),
          {
            abortAfter: 100,
            onError,
            onSettled,
          }
        )

        await vi.advanceTimersByTimeAsync(100)
        await promise

        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError).toHaveBeenCalledWith(expect.any(TimeoutError), [])
        expect(onSettled).toHaveBeenCalledTimes(1)
        expect(onSettled).toHaveBeenCalledWith(null, expect.any(TimeoutError), [])

        vi.useRealTimers()
      })

      it('receives TimeoutError after all retries exhausted', async () => {
        vi.useFakeTimers()

        const onSettled = vi.fn()

        const promise = safe.async(
          () => new Promise((resolve) => setTimeout(() => resolve('done'), 500)),
          {
            abortAfter: 100,
            retry: { times: 1 },
            onSettled,
          }
        )

        await vi.advanceTimersByTimeAsync(100)
        await vi.advanceTimersByTimeAsync(100)
        await promise

        expect(onSettled).toHaveBeenCalledTimes(1)
        expect(onSettled).toHaveBeenCalledWith(null, expect.any(TimeoutError), [])

        vi.useRealTimers()
      })

      it('receives success when retry succeeds after timeout', async () => {
        vi.useFakeTimers()

        let attempts = 0
        const fn = vi.fn().mockImplementation(() => {
          attempts++
          const delay = attempts < 2 ? 500 : 10
          return new Promise((resolve) => setTimeout(() => resolve('ok'), delay))
        })
        const onSettled = vi.fn()

        const promise = safe.async(fn, {
          abortAfter: 100,
          retry: { times: 1 },
          onSettled,
        })

        // Attempt 1 times out
        await vi.advanceTimersByTimeAsync(100)
        // Attempt 2 succeeds quickly
        await vi.advanceTimersByTimeAsync(10)
        await promise

        expect(onSettled).toHaveBeenCalledTimes(1)
        expect(onSettled).toHaveBeenCalledWith('ok', null, [])

        vi.useRealTimers()
      })
    })

    describe('late promise resolution after timeout', () => {
      it('timeout result is returned even if promise resolves later', async () => {
        vi.useFakeTimers()

        let resolveManually!: (value: string) => void
        const fn = vi.fn().mockImplementation(
          () => new Promise<string>((resolve) => { resolveManually = resolve })
        )

        const promise = safe.async(fn, { abortAfter: 100 })

        // Timeout fires
        await vi.advanceTimersByTimeAsync(100)
        const result = await promise

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(TimeoutError)

        // Late resolution — should not cause issues
        resolveManually('late value')

        vi.useRealTimers()
      })

      it('timeout result is returned even if promise rejects later', async () => {
        vi.useFakeTimers()

        let rejectManually!: (reason: Error) => void
        const fn = vi.fn().mockImplementation(
          () => new Promise<string>((_resolve, reject) => { rejectManually = reject })
        )

        const promise = safe.async(fn, { abortAfter: 100 })

        await vi.advanceTimersByTimeAsync(100)
        const result = await promise

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(TimeoutError)

        // Late rejection — should not cause unhandled rejection
        rejectManually(new Error('late error'))

        vi.useRealTimers()
      })
    })

    describe('concurrent wrapAsync with retry + timeout', () => {
      it('multiple concurrent calls each get independent retry + timeout state', async () => {
        vi.useFakeTimers()

        const callAttempts: Record<number, number> = {}

        const fn = vi.fn().mockImplementation(async (callId: number) => {
          callAttempts[callId] = (callAttempts[callId] || 0) + 1
          if (callId === 1) {
            // Call 1: always times out (slow)
            return new Promise((resolve) => setTimeout(() => resolve('c1'), 500))
          } else if (callId === 2) {
            // Call 2: succeeds immediately
            return `c2-attempt-${callAttempts[callId]}`
          } else {
            // Call 3: fails with regular error, then succeeds
            if (callAttempts[callId] < 2) throw new Error('c3 fail')
            return 'c3-success'
          }
        })

        const wrapped = safe.wrapAsync(fn, {
          abortAfter: 100,
          retry: { times: 2 },
        })

        const p1 = wrapped(1)
        const p2 = wrapped(2)
        const p3 = wrapped(3)

        // Advance enough for everything to settle
        await vi.advanceTimersByTimeAsync(100)
        await vi.advanceTimersByTimeAsync(100)
        await vi.advanceTimersByTimeAsync(100)

        const [r1, r2, r3] = await Promise.all([p1, p2, p3])

        // Call 1: all 3 attempts timeout → TimeoutError
        expect(r1[0]).toBeNull()
        expect(r1[1]).toBeInstanceOf(TimeoutError)

        // Call 2: succeeds on first attempt
        expect(r2).toEqual(['c2-attempt-1', null])

        // Call 3: fails once then succeeds
        expect(r3).toEqual(['c3-success', null])

        vi.useRealTimers()
      })
    })

    describe('hook ordering with timeout', () => {
      it('follows parseError → onError → onSettled order on timeout', async () => {
        vi.useFakeTimers()

        const callOrder: string[] = []

        const parseError = vi.fn((e: unknown) => {
          callOrder.push('parseError')
          return {
            type: e instanceof TimeoutError ? 'timeout' : 'other',
            message: e instanceof Error ? e.message : 'unknown',
          }
        })
        const onError = vi.fn(() => callOrder.push('onError'))
        const onSettled = vi.fn(() => callOrder.push('onSettled'))

        const promise = safe.async(
          () => new Promise((resolve) => setTimeout(() => resolve('done'), 500)),
          parseError,
          {
            abortAfter: 100,
            onError,
            onSettled,
          }
        )

        await vi.advanceTimersByTimeAsync(100)
        await promise

        expect(callOrder).toEqual(['parseError', 'onError', 'onSettled'])

        vi.useRealTimers()
      })

      it('follows parseError → onRetry → (wait) → … → parseError → onError → onSettled with retry', async () => {
        vi.useFakeTimers()

        const callOrder: string[] = []

        const parseError = vi.fn((e: unknown) => {
          callOrder.push('parseError')
          return e instanceof TimeoutError ? 'timeout' : 'error'
        })
        const onRetry = vi.fn(() => callOrder.push('onRetry'))
        const onError = vi.fn(() => callOrder.push('onError'))
        const onSettled = vi.fn(() => callOrder.push('onSettled'))

        const promise = safe.async(
          () => new Promise((resolve) => setTimeout(() => resolve('done'), 500)),
          parseError,
          {
            abortAfter: 100,
            retry: { times: 1 },
            onRetry,
            onError,
            onSettled,
          }
        )

        // Attempt 1 times out
        await vi.advanceTimersByTimeAsync(100)
        // Attempt 2 times out
        await vi.advanceTimersByTimeAsync(100)
        await promise

        expect(callOrder).toEqual([
          'parseError', 'onRetry',    // attempt 1 fails
          'parseError', 'onError', 'onSettled', // attempt 2 fails (final)
        ])

        vi.useRealTimers()
      })
    })

    describe('onRetry fires before waitBefore delay', () => {
      it('onRetry is called then waitBefore delay occurs before next attempt', async () => {
        vi.useFakeTimers()

        const callOrder: string[] = []
        let attempts = 0

        const fn = vi.fn().mockImplementation(() => {
          attempts++
          callOrder.push(`attempt-${attempts}`)
          if (attempts < 3) throw new Error('fail')
          return Promise.resolve('success')
        })

        const onRetry = vi.fn(() => callOrder.push('onRetry'))

        const promise = safe.async(fn, {
          retry: {
            times: 2,
            waitBefore: () => 200,
          },
          onRetry,
        })

        // Attempt 1 runs immediately
        await vi.advanceTimersByTimeAsync(0)
        expect(callOrder).toEqual(['attempt-1', 'onRetry'])

        // Wait 200ms for backoff
        await vi.advanceTimersByTimeAsync(200)
        expect(callOrder).toEqual(['attempt-1', 'onRetry', 'attempt-2', 'onRetry'])

        // Wait 200ms for second backoff
        await vi.advanceTimersByTimeAsync(200)
        await promise

        expect(callOrder).toEqual([
          'attempt-1', 'onRetry',
          'attempt-2', 'onRetry',
          'attempt-3',
        ])

        vi.useRealTimers()
      })
    })

    describe('mixed error types across retries', () => {
      it('handles timeout on first attempt then regular error then success', async () => {
        vi.useFakeTimers()

        let attempts = 0
        const fn = vi.fn().mockImplementation(async () => {
          attempts++
          if (attempts === 1) {
            // First attempt: slow (will timeout)
            return new Promise((resolve) => setTimeout(() => resolve('done'), 500))
          }
          if (attempts === 2) {
            // Second attempt: regular error
            throw new Error('network error')
          }
          // Third attempt: success
          return 'success'
        })
        const onRetry = vi.fn()

        const promise = safe.async(fn, {
          abortAfter: 100,
          retry: { times: 2 },
          onRetry,
        })

        // Attempt 1 times out at 100ms
        await vi.advanceTimersByTimeAsync(100)
        // Attempt 2 throws immediately, attempt 3 succeeds immediately
        await vi.advanceTimersByTimeAsync(0)
        await promise

        const result = await promise

        expect(result).toEqual(['success', null])
        expect(onRetry).toHaveBeenCalledTimes(2)
        expect(onRetry.mock.calls[0][0]).toBeInstanceOf(TimeoutError)
        expect(onRetry.mock.calls[1][0]).toBeInstanceOf(Error)
        expect(onRetry.mock.calls[1][0].message).toBe('network error')

        vi.useRealTimers()
      })

      it('handles regular error then timeout then success', async () => {
        vi.useFakeTimers()

        let attempts = 0
        const fn = vi.fn().mockImplementation(async () => {
          attempts++
          if (attempts === 1) {
            throw new Error('first fail')
          }
          if (attempts === 2) {
            return new Promise((resolve) => setTimeout(() => resolve('done'), 500))
          }
          return 'success'
        })
        const onRetry = vi.fn()

        const promise = safe.async(fn, {
          abortAfter: 100,
          retry: { times: 2 },
          onRetry,
        })

        // Attempt 1 fails immediately
        await vi.advanceTimersByTimeAsync(0)
        // Attempt 2 times out
        await vi.advanceTimersByTimeAsync(100)
        // Attempt 3 succeeds
        await vi.advanceTimersByTimeAsync(0)

        const result = await promise

        expect(result).toEqual(['success', null])
        expect(onRetry).toHaveBeenCalledTimes(2)
        expect(onRetry.mock.calls[0][0]).toBeInstanceOf(Error)
        expect(onRetry.mock.calls[0][0].message).toBe('first fail')
        expect(onRetry.mock.calls[1][0]).toBeInstanceOf(TimeoutError)

        vi.useRealTimers()
      })
    })

    describe('context in wrapAsync hooks with timeout', () => {
      it('onRetry receives original args (without injected signal) as context', async () => {
        vi.useFakeTimers()

        const onRetry = vi.fn()

        const wrapped = safe.wrapAsync(
          async (id: number, name: string) => {
            return new Promise((resolve) => setTimeout(() => resolve({ id, name }), 500))
          },
          {
            abortAfter: 100,
            retry: { times: 1 },
            onRetry,
          }
        )

        const promise = wrapped(42, 'test')
        await vi.advanceTimersByTimeAsync(100)
        await vi.advanceTimersByTimeAsync(100)
        await promise

        expect(onRetry).toHaveBeenCalledWith(
          expect.any(TimeoutError),
          1,
          [42, 'test'] // original args, not including injected signal
        )

        vi.useRealTimers()
      })

      it('onError and onSettled receive original args as context on timeout', async () => {
        vi.useFakeTimers()

        const onError = vi.fn()
        const onSettled = vi.fn()

        const wrapped = safe.wrapAsync(
          async (id: number) => {
            return new Promise((resolve) => setTimeout(() => resolve({ id }), 500))
          },
          {
            abortAfter: 100,
            onError,
            onSettled,
          }
        )

        const promise = wrapped(99)
        await vi.advanceTimersByTimeAsync(100)
        await promise

        expect(onError).toHaveBeenCalledWith(expect.any(TimeoutError), [99])
        expect(onSettled).toHaveBeenCalledWith(null, expect.any(TimeoutError), [99])

        vi.useRealTimers()
      })
    })

    describe('parseResult not called on timeout path', () => {
      it('parseResult is not invoked when operation times out', async () => {
        vi.useFakeTimers()

        const parseResult = vi.fn((x: string) => x.toUpperCase())

        const promise = safe.async(
          () => new Promise<string>((resolve) => setTimeout(() => resolve('done'), 500)),
          {
            abortAfter: 100,
            parseResult,
          }
        )

        await vi.advanceTimersByTimeAsync(100)
        const result = await promise

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(TimeoutError)
        expect(parseResult).not.toHaveBeenCalled()

        vi.useRealTimers()
      })

      it('parseResult is not invoked on timeout with wrapAsync', async () => {
        vi.useFakeTimers()

        const parseResult = vi.fn((x: { id: number }) => x.id)

        const wrapped = safe.wrapAsync(
          (id: number) =>
            new Promise<{ id: number }>((resolve) =>
              setTimeout(() => resolve({ id }), 500)
            ),
          {
            abortAfter: 100,
            parseResult,
          }
        )

        const promise = wrapped(42)
        await vi.advanceTimersByTimeAsync(100)
        await promise

        expect(parseResult).not.toHaveBeenCalled()

        vi.useRealTimers()
      })

      it('parseResult is called only on successful attempts during retry', async () => {
        vi.useFakeTimers()

        let attempts = 0
        const fn = vi.fn().mockImplementation(() => {
          attempts++
          const delay = attempts < 2 ? 500 : 10
          return new Promise((resolve) => setTimeout(() => resolve(`result-${attempts}`), delay))
        })
        const parseResult = vi.fn((x: string) => x.toUpperCase())

        const promise = safe.async(fn, {
          abortAfter: 100,
          retry: { times: 1 },
          parseResult,
        })

        // Attempt 1 times out
        await vi.advanceTimersByTimeAsync(100)
        // Attempt 2 succeeds
        await vi.advanceTimersByTimeAsync(10)
        await promise

        // parseResult only called for the successful attempt
        expect(parseResult).toHaveBeenCalledTimes(1)
        expect(parseResult).toHaveBeenCalledWith('result-2')

        vi.useRealTimers()
      })
    })
  })

  describe('throwing hooks do not crash the application', () => {
    const throwingHook = () => {
      throw new Error('hook exploded')
    }

    describe('sync', () => {
      it('returns success result when onSuccess throws', () => {
        const result = safe.sync(() => 42, { onSuccess: throwingHook })
        expect(result).toEqual([42, null])
      })

      it('returns success result when onSettled throws on success path', () => {
        const result = safe.sync(() => 42, { onSettled: throwingHook })
        expect(result).toEqual([42, null])
      })

      it('returns error result when onError throws', () => {
        const result = safe.sync(
          () => {
            throw new Error('original')
          },
          { onError: throwingHook }
        )
        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect((result[1] as Error).message).toBe('original')
      })

      it('returns error result when onSettled throws on error path', () => {
        const result = safe.sync(
          () => {
            throw new Error('original')
          },
          { onSettled: throwingHook }
        )
        expect(result[0]).toBeNull()
        expect((result[1] as Error).message).toBe('original')
      })

      it('still calls onSettled when onSuccess throws', () => {
        const onSettled = vi.fn()
        safe.sync(() => 42, { onSuccess: throwingHook, onSettled })
        expect(onSettled).toHaveBeenCalledWith(42, null, [])
      })

      it('still calls onSettled when onError throws', () => {
        const onSettled = vi.fn()
        safe.sync(
          () => {
            throw new Error('original')
          },
          { onError: throwingHook, onSettled }
        )
        expect(onSettled).toHaveBeenCalledWith(null, expect.any(Error), [])
      })
    })

    describe('async', () => {
      it('returns success result when onSuccess throws', async () => {
        const result = await safe.async(async () => 42, {
          onSuccess: throwingHook,
        })
        expect(result).toEqual([42, null])
      })

      it('returns error result when onError throws', async () => {
        const result = await safe.async(
          async () => {
            throw new Error('original')
          },
          { onError: throwingHook }
        )
        expect(result[0]).toBeNull()
        expect((result[1] as Error).message).toBe('original')
      })

      it('returns error result when onSettled throws on error path', async () => {
        const result = await safe.async(
          async () => {
            throw new Error('original')
          },
          { onSettled: throwingHook }
        )
        expect(result[0]).toBeNull()
        expect((result[1] as Error).message).toBe('original')
      })

      it('continues retrying when onRetry throws', async () => {
        let attempts = 0
        const result = await safe.async(
          async () => {
            attempts++
            if (attempts < 3) throw new Error(`attempt ${attempts}`)
            return 'success'
          },
          { onRetry: throwingHook, retry: { times: 2 } }
        )
        expect(result).toEqual(['success', null])
        expect(attempts).toBe(3)
      })
    })

    describe('wrap', () => {
      it('returns success result when onSuccess throws', () => {
        const wrapped = safe.wrap((x: number) => x * 2, {
          onSuccess: throwingHook,
        })
        expect(wrapped(5)).toEqual([10, null])
      })

      it('returns error result when onError throws', () => {
        const wrapped = safe.wrap(
          () => {
            throw new Error('original')
          },
          { onError: throwingHook }
        )
        const result = wrapped()
        expect(result[0]).toBeNull()
        expect((result[1] as Error).message).toBe('original')
      })
    })

    describe('wrapAsync', () => {
      it('returns success result when onSuccess throws', async () => {
        const wrapped = safe.wrapAsync(async (x: number) => x * 2, {
          onSuccess: throwingHook,
        })
        expect(await wrapped(5)).toEqual([10, null])
      })

      it('returns error result when onError throws', async () => {
        const wrapped = safe.wrapAsync(
          async () => {
            throw new Error('original')
          },
          { onError: throwingHook }
        )
        const result = await wrapped()
        expect(result[0]).toBeNull()
        expect((result[1] as Error).message).toBe('original')
      })

      it('continues retrying when onRetry throws', async () => {
        let attempts = 0
        const wrapped = safe.wrapAsync(
          async () => {
            attempts++
            if (attempts < 2) throw new Error(`attempt ${attempts}`)
            return 'done'
          },
          { onRetry: throwingHook, retry: { times: 1 } }
        )
        expect(await wrapped()).toEqual(['done', null])
        expect(attempts).toBe(2)
      })
    })
  })

  describe('all', () => {
    it('returns ok with named values when all succeed', async () => {
      const [data, error] = await safe.all({
        user: safe.async(() => Promise.resolve({ name: 'Alice' })),
        posts: safe.async(() => Promise.resolve([1, 2, 3])),
      })

      expect(error).toBeNull()
      expect(data).toEqual({ user: { name: 'Alice' }, posts: [1, 2, 3] })
      expect(data!.user).toEqual({ name: 'Alice' })
      expect(data!.posts).toEqual([1, 2, 3])
    })

    it('returns err with first error when one fails', async () => {
      const [data, error] = await safe.all({
        user: safe.async(() => Promise.resolve({ name: 'Alice' })),
        posts: safe.async(() => Promise.reject(new Error('fetch failed'))),
      })

      expect(data).toBeNull()
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('fetch failed')
    })

    it('returns first error when multiple fail', async () => {
      const error1 = new Error('first')
      const error2 = new Error('second')

      const [data, error] = await safe.all({
        a: safe.async(() => Promise.reject(error1)),
        b: safe.async(() => Promise.reject(error2)),
      })

      expect(data).toBeNull()
      expect(error).toBe(error1)
    })

    it('returns ok with empty object for empty input', async () => {
      const [data, error] = await safe.all({})

      expect(error).toBeNull()
      expect(data).toEqual({})
    })

    it('preserves result values by key', async () => {
      const [data, error] = await safe.all({
        count: safe.async(() => Promise.resolve(42)),
        label: safe.async(() => Promise.resolve('hello')),
        flag: safe.async(() => Promise.resolve(true)),
      })

      expect(error).toBeNull()
      expect(data!.count).toBe(42)
      expect(data!.label).toBe('hello')
      expect(data!.flag).toBe(true)
    })

    it('works with per-operation parseError', async () => {
      const parseError = (e: unknown) => ({
        code: 'FAIL' as const,
        message: e instanceof Error ? e.message : 'unknown',
      })

      const [data, error] = await safe.all({
        a: safe.async(() => Promise.resolve('ok')),
        b: safe.async(() => Promise.reject(new Error('boom')), parseError),
      })

      expect(data).toBeNull()
      expect(error).toEqual({ code: 'FAIL', message: 'boom' })
    })

    it('works with hooks on individual operations', async () => {
      const onSuccess = vi.fn()

      const [data, error] = await safe.all({
        val: safe.async(() => Promise.resolve(10), { onSuccess }),
      })

      expect(error).toBeNull()
      expect(data!.val).toBe(10)
      expect(onSuccess).toHaveBeenCalledWith(10, [])
    })

    it('result has tagged properties on success', async () => {
      const result = await safe.all({
        x: safe.async(() => Promise.resolve(1)),
      })

      expect(result.ok).toBe(true)
      expect(result.value).toEqual({ x: 1 })
      expect(result.error).toBeNull()
    })

    it('result has tagged properties on error', async () => {
      const result = await safe.all({
        x: safe.async(() => Promise.reject(new Error('fail'))),
      })

      expect(result.ok).toBe(false)
      expect(result.value).toBeNull()
      expect(result.error).toBeInstanceOf(Error)
    })

    it('short-circuits on first error without waiting for slower operations', async () => {
      const slowFinished = vi.fn()

      const [data, error] = await safe.all({
        fast: safe.async(() => Promise.reject(new Error('fast fail'))),
        slow: safe.async(
          () =>
            new Promise<string>((resolve) => {
              setTimeout(() => {
                slowFinished()
                resolve('done')
              }, 5000)
            })
        ),
      })

      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('fast fail')
      expect(data).toBeNull()
      // The slow operation's callback should not have fired yet
      expect(slowFinished).not.toHaveBeenCalled()
    })

    it('works with a single entry', async () => {
      const [data, error] = await safe.all({
        only: safe.async(() => Promise.resolve('solo')),
      })

      expect(error).toBeNull()
      expect(data).toEqual({ only: 'solo' })
    })

    it('works with a single failing entry', async () => {
      const [data, error] = await safe.all({
        only: safe.async(() => Promise.reject(new Error('solo fail'))),
      })

      expect(data).toBeNull()
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('solo fail')
    })
  })

  describe('allSettled', () => {
    it('returns all success results as named SafeResults', async () => {
      const results = await safe.allSettled({
        user: safe.async(() => Promise.resolve({ name: 'Alice' })),
        posts: safe.async(() => Promise.resolve([1, 2, 3])),
      })

      expect(results.user.ok).toBe(true)
      expect(results.user.value).toEqual({ name: 'Alice' })
      expect(results.user.error).toBeNull()
      expect(results.user[0]).toEqual({ name: 'Alice' })
      expect(results.user[1]).toBeNull()

      expect(results.posts.ok).toBe(true)
      expect(results.posts.value).toEqual([1, 2, 3])
    })

    it('returns all error results as named SafeResults', async () => {
      const results = await safe.allSettled({
        a: safe.async(() => Promise.reject(new Error('err a'))),
        b: safe.async(() => Promise.reject(new Error('err b'))),
      })

      expect(results.a.ok).toBe(false)
      expect(results.a.value).toBeNull()
      expect(results.a.error).toBeInstanceOf(Error)
      expect((results.a.error as Error).message).toBe('err a')

      expect(results.b.ok).toBe(false)
      expect((results.b.error as Error).message).toBe('err b')
    })

    it('returns mixed success and error results', async () => {
      const results = await safe.allSettled({
        good: safe.async(() => Promise.resolve('yes')),
        bad: safe.async(() => Promise.reject(new Error('no'))),
      })

      expect(results.good.ok).toBe(true)
      expect(results.good.value).toBe('yes')

      expect(results.bad.ok).toBe(false)
      expect((results.bad.error as Error).message).toBe('no')
    })

    it('returns empty object for empty input', async () => {
      const results = await safe.allSettled({})

      expect(results).toEqual({})
    })

    it('each result is a proper SafeResult with tagged properties', async () => {
      const results = await safe.allSettled({
        val: safe.async(() => Promise.resolve(42)),
      })

      const r = results.val
      expect(r.ok).toBe(true)
      expect(r.value).toBe(42)
      expect(r.error).toBeNull()
      expect(r[0]).toBe(42)
      expect(r[1]).toBeNull()
    })

    it('works with per-operation parseError', async () => {
      const parseError = (e: unknown) => ({
        code: 'CUSTOM' as const,
        message: e instanceof Error ? e.message : 'unknown',
      })

      const results = await safe.allSettled({
        item: safe.async(() => Promise.reject(new Error('oops')), parseError),
      })

      expect(results.item.ok).toBe(false)
      expect(results.item.error).toEqual({ code: 'CUSTOM', message: 'oops' })
    })

    it('works with a single entry', async () => {
      const results = await safe.allSettled({
        only: safe.async(() => Promise.resolve('solo')),
      })

      expect(results.only.ok).toBe(true)
      expect(results.only.value).toBe('solo')
    })

    it('works with a single failing entry', async () => {
      const results = await safe.allSettled({
        only: safe.async(() => Promise.reject(new Error('solo fail'))),
      })

      expect(results.only.ok).toBe(false)
      expect((results.only.error as Error).message).toBe('solo fail')
    })
  })

  describe('tagged result properties (.ok, .value, .error)', () => {
    describe('sync', () => {
      it('has ok: true and value/error properties on success', () => {
        const result = safe.sync(() => 42)

        expect(result.ok).toBe(true)
        expect(result.value).toBe(42)
        expect(result.error).toBeNull()
      })

      it('has ok: false and value/error properties on failure', () => {
        const error = new Error('fail')
        const result = safe.sync(() => {
          throw error
        })

        expect(result.ok).toBe(false)
        expect(result.value).toBeNull()
        expect(result.error).toBe(error)
      })

      it('discriminates null success from null error', () => {
        const success = safe.sync(() => null)
        const failure = safe.sync(() => {
          throw null
        })

        // success is [null, null] at the tuple level
        expect(success[0]).toBeNull()
        expect(success[1]).toBeNull()
        // failure is [null, Error('null')] since toError normalizes non-Error values
        expect(failure[0]).toBeNull()
        expect(failure[1]).toBeInstanceOf(Error)

        // Discriminated by .ok
        expect(success.ok).toBe(true)
        expect(failure.ok).toBe(false)

        expect(success.value).toBeNull()
        expect(success.error).toBeNull()
        expect(failure.value).toBeNull()
        expect(failure.error).toBeInstanceOf(Error)
      })

      it('tuple destructuring still works', () => {
        const [value, error] = safe.sync(() => 42)

        expect(value).toBe(42)
        expect(error).toBeNull()
      })
    })

    describe('async', () => {
      it('has ok: true and value/error properties on success', async () => {
        const result = await safe.async(async () => 'hello')

        expect(result.ok).toBe(true)
        expect(result.value).toBe('hello')
        expect(result.error).toBeNull()
      })

      it('has ok: false and value/error properties on failure', async () => {
        const error = new Error('async fail')
        const result = await safe.async(async () => {
          throw error
        })

        expect(result.ok).toBe(false)
        expect(result.value).toBeNull()
        expect(result.error).toBe(error)
      })

      it('discriminates null success from null error (async)', async () => {
        const success = await safe.async(async () => null)
        const failure = await safe.async(async () => {
          throw null
        })

        expect(success.ok).toBe(true)
        expect(failure.ok).toBe(false)
      })

      it('tuple destructuring still works (async)', async () => {
        const [value, error] = await safe.async(async () => 99)

        expect(value).toBe(99)
        expect(error).toBeNull()
      })
    })

    describe('wrap', () => {
      it('has ok: true on success', () => {
        const wrapped = safe.wrap((x: number) => x * 2)
        const result = wrapped(5)

        expect(result.ok).toBe(true)
        expect(result.value).toBe(10)
        expect(result.error).toBeNull()
      })

      it('has ok: false on failure', () => {
        const wrapped = safe.wrap(() => {
          throw new Error('wrap fail')
        })
        const result = wrapped()

        expect(result.ok).toBe(false)
        expect(result.value).toBeNull()
        expect(result.error).toBeInstanceOf(Error)
      })
    })

    describe('wrapAsync', () => {
      it('has ok: true on success', async () => {
        const wrapped = safe.wrapAsync(async (x: number) => x + 1)
        const result = await wrapped(10)

        expect(result.ok).toBe(true)
        expect(result.value).toBe(11)
        expect(result.error).toBeNull()
      })

      it('has ok: false on failure', async () => {
        const wrapped = safe.wrapAsync(async () => {
          throw new Error('wrapAsync fail')
        })
        const result = await wrapped()

        expect(result.ok).toBe(false)
        expect(result.value).toBeNull()
        expect(result.error).toBeInstanceOf(Error)
      })
    })

    describe('parseResult returning null still has ok: true', () => {
      it('sync with parseResult returning null', () => {
        const result = safe.sync(() => 42, {
          parseResult: () => null,
        })

        expect(result.ok).toBe(true)
        expect(result.value).toBeNull()
        expect(result.error).toBeNull()
      })

      it('async with parseResult returning null', async () => {
        const result = await safe.async(async () => 42, {
          parseResult: () => null,
        })

        expect(result.ok).toBe(true)
        expect(result.value).toBeNull()
        expect(result.error).toBeNull()
      })
    })

    describe('ok() and err() constructors', () => {
      it('ok() creates a tagged success result', () => {
        const result = ok(42)

        expect(result).toEqual([42, null])
        expect(result.ok).toBe(true)
        expect(result.value).toBe(42)
        expect(result.error).toBeNull()
        expect(result[0]).toBe(42)
        expect(result[1]).toBeNull()
      })

      it('err() creates a tagged error result', () => {
        const error = new Error('test')
        const result = err(error)

        expect(result).toEqual([null, error])
        expect(result.ok).toBe(false)
        expect(result.value).toBeNull()
        expect(result.error).toBe(error)
        expect(result[0]).toBeNull()
        expect(result[1]).toBe(error)
      })

      it('ok(null) is distinguishable from err(null)', () => {
        const success = ok(null)
        const failure = err(null)

        expect(success.ok).toBe(true)
        expect(failure.ok).toBe(false)
      })
    })
  })

  describe('onHookError', () => {
    describe('sync', () => {
      it('calls onHookError when onSuccess throws', () => {
        const hookError = new Error('hook broke')
        const onHookError = vi.fn()

        const result = safe.sync(() => 42, {
          onSuccess: () => { throw hookError },
          onHookError,
        })

        expect(result).toEqual([42, null])
        expect(onHookError).toHaveBeenCalledWith(hookError, 'onSuccess')
      })

      it('calls onHookError when onError throws', () => {
        const hookError = new Error('hook broke')
        const onHookError = vi.fn()

        const result = safe.sync(
          () => { throw new Error('original') },
          {
            onError: () => { throw hookError },
            onHookError,
          },
        )

        expect(result[0]).toBeNull()
        expect(onHookError).toHaveBeenCalledWith(hookError, 'onError')
      })

      it('calls onHookError when onSettled throws', () => {
        const hookError = new Error('hook broke')
        const onHookError = vi.fn()

        const result = safe.sync(() => 42, {
          onSettled: () => { throw hookError },
          onHookError,
        })

        expect(result).toEqual([42, null])
        expect(onHookError).toHaveBeenCalledWith(hookError, 'onSettled')
      })

      it('does not crash when onHookError itself throws', () => {
        const result = safe.sync(() => 42, {
          onSuccess: () => { throw new Error('hook broke') },
          onHookError: () => { throw new Error('onHookError broke') },
        })

        expect(result).toEqual([42, null])
      })

      it('still returns correct result when onHookError is provided and no hooks throw', () => {
        const onHookError = vi.fn()

        const result = safe.sync(() => 42, {
          onSuccess: vi.fn(),
          onHookError,
        })

        expect(result).toEqual([42, null])
        expect(onHookError).not.toHaveBeenCalled()
      })
    })

    describe('async', () => {
      it('calls onHookError when onSuccess throws', async () => {
        const hookError = new Error('hook broke')
        const onHookError = vi.fn()

        const result = await safe.async(() => Promise.resolve(42), {
          onSuccess: () => { throw hookError },
          onHookError,
        })

        expect(result).toEqual([42, null])
        expect(onHookError).toHaveBeenCalledWith(hookError, 'onSuccess')
      })

      it('calls onHookError when onError throws', async () => {
        const hookError = new Error('hook broke')
        const onHookError = vi.fn()

        const result = await safe.async(
          () => Promise.reject(new Error('original')),
          {
            onError: () => { throw hookError },
            onHookError,
          },
        )

        expect(result[0]).toBeNull()
        expect(onHookError).toHaveBeenCalledWith(hookError, 'onError')
      })

      it('calls onHookError when onRetry throws', async () => {
        const hookError = new Error('hook broke')
        const onHookError = vi.fn()

        const result = await safe.async(
          () => Promise.reject(new Error('fail')),
          {
            retry: { times: 1 },
            onRetry: () => { throw hookError },
            onHookError,
          },
        )

        expect(result[0]).toBeNull()
        expect(onHookError).toHaveBeenCalledWith(hookError, 'onRetry')
      })

      it('does not crash when onHookError itself throws (async)', async () => {
        const result = await safe.async(() => Promise.resolve(42), {
          onSuccess: () => { throw new Error('hook broke') },
          onHookError: () => { throw new Error('onHookError broke') },
        })

        expect(result).toEqual([42, null])
      })
    })

    describe('wrap', () => {
      it('calls onHookError when onSuccess throws', () => {
        const hookError = new Error('hook broke')
        const onHookError = vi.fn()

        const wrapped = safe.wrap((x: number) => x * 2, {
          onSuccess: () => { throw hookError },
          onHookError,
        })
        const result = wrapped(5)

        expect(result).toEqual([10, null])
        expect(onHookError).toHaveBeenCalledWith(hookError, 'onSuccess')
      })

      it('calls onHookError when onError throws', () => {
        const hookError = new Error('hook broke')
        const onHookError = vi.fn()

        const wrapped = safe.wrap(
          () => { throw new Error('original') },
          {
            onError: () => { throw hookError },
            onHookError,
          },
        )
        const result = wrapped()

        expect(result[0]).toBeNull()
        expect(onHookError).toHaveBeenCalledWith(hookError, 'onError')
      })
    })

    describe('wrapAsync', () => {
      it('calls onHookError when onSuccess throws', async () => {
        const hookError = new Error('hook broke')
        const onHookError = vi.fn()

        const wrapped = safe.wrapAsync(
          async (x: number) => x * 2,
          {
            onSuccess: () => { throw hookError },
            onHookError,
          },
        )
        const result = await wrapped(5)

        expect(result).toEqual([10, null])
        expect(onHookError).toHaveBeenCalledWith(hookError, 'onSuccess')
      })

      it('calls onHookError when onRetry throws', async () => {
        const hookError = new Error('hook broke')
        const onHookError = vi.fn()

        const wrapped = safe.wrapAsync(
          async () => { throw new Error('fail') },
          {
            retry: { times: 1 },
            onRetry: () => { throw hookError },
            onHookError,
          },
        )
        const result = await wrapped()

        expect(result[0]).toBeNull()
        expect(onHookError).toHaveBeenCalledWith(hookError, 'onRetry')
      })
    })

    describe('with parseError', () => {
      it('works with parseError and onHookError on sync', () => {
        const hookError = new Error('hook broke')
        const onHookError = vi.fn()

        const result = safe.sync(
          () => 42,
          (e: unknown) => String(e),
          {
            onSuccess: () => { throw hookError },
            onHookError,
            defaultError: 'unknown error',
          },
        )

        expect(result).toEqual([42, null])
        expect(onHookError).toHaveBeenCalledWith(hookError, 'onSuccess')
      })

      it('works with parseError and onHookError on async', async () => {
        const hookError = new Error('hook broke')
        const onHookError = vi.fn()

        const result = await safe.async(
          () => Promise.resolve(42),
          (e: unknown) => String(e),
          {
            onSuccess: () => { throw hookError },
            onHookError,
            defaultError: 'unknown error',
          },
        )

        expect(result).toEqual([42, null])
        expect(onHookError).toHaveBeenCalledWith(hookError, 'onSuccess')
      })
    })
  })

  describe('parseError safety', () => {
    describe('sync', () => {
      it('parseError throwing returns toError(e) as fallback (no defaultError)', () => {
        const result = safe.sync(
          () => { throw 'string error' },
          () => { throw new Error('parseError broke') },
        )

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect((result[1] as Error).message).toBe('string error')
      })

      it('parseError throwing returns defaultError when provided', () => {
        const defaultErr = { code: 'FALLBACK' }
        const result = safe.sync(
          () => { throw new Error('original') },
          () => { throw new Error('parseError broke') },
          { defaultError: defaultErr, onHookError: () => {} },
        )

        expect(result[0]).toBeNull()
        expect(result[1]).toBe(defaultErr)
      })

      it('parseError throwing calls onHookError with hookName parseError', () => {
        const onHookError = vi.fn()
        const parseErrorException = new Error('parseError broke')

        safe.sync(
          () => { throw new Error('original') },
          () => { throw parseErrorException },
          { onHookError, defaultError: { code: 'FALLBACK' } },
        )

        expect(onHookError).toHaveBeenCalledWith(parseErrorException, 'parseError')
      })

      it('hooks (onError, onSettled) still fire after parseError failure', () => {
        const onError = vi.fn()
        const onSettled = vi.fn()
        const defaultErr = { code: 'FALLBACK' }

        safe.sync(
          () => { throw new Error('original') },
          () => { throw new Error('parseError broke') },
          { defaultError: defaultErr, onError, onSettled, onHookError: () => {} },
        )

        expect(onError).toHaveBeenCalledWith(defaultErr, [])
        expect(onSettled).toHaveBeenCalledWith(null, defaultErr, [])
      })

      it('no parseError + non-Error thrown value returns Error wrapping the value', () => {
        const result = safe.sync(() => { throw 42 })

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect((result[1] as Error).message).toBe('42')
        expect((result[1] as Error).cause).toBe(42)
      })

      it('no parseError + structured object preserves original via cause', () => {
        const thrown = { code: 'ERR', details: [1, 2, 3] }
        const result = safe.sync(() => { throw thrown })

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect((result[1] as Error).cause).toBe(thrown)
      })

      it('no parseError + Error thrown value returns the Error as-is', () => {
        const original = new Error('original')
        const result = safe.sync(() => { throw original })

        expect(result[1]).toBe(original)
      })

      it('onHookError throwing during parseError failure does not crash', () => {
        const result = safe.sync(
          () => { throw 'oops' },
          () => { throw new Error('parseError broke') },
          { onHookError: () => { throw new Error('onHookError also broke') } },
        )

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect((result[1] as Error).message).toBe('oops')
      })
    })

    describe('async', () => {
      it('parseError throwing returns toError(e) as fallback (no defaultError)', async () => {
        const result = await safe.async(
          () => Promise.reject('string error'),
          () => { throw new Error('parseError broke') },
        )

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect((result[1] as Error).message).toBe('string error')
      })

      it('parseError throwing returns defaultError when provided', async () => {
        const defaultErr = { code: 'FALLBACK' }
        const result = await safe.async(
          () => Promise.reject(new Error('original')),
          () => { throw new Error('parseError broke') },
          { defaultError: defaultErr, onHookError: () => {} },
        )

        expect(result[0]).toBeNull()
        expect(result[1]).toBe(defaultErr)
      })

      it('parseError throwing during retry continues the loop', async () => {
        let callCount = 0
        const result = await safe.async(
          () => { callCount++; return Promise.reject(new Error(`fail ${callCount}`)) },
          () => { throw new Error('parseError broke') },
          {
            retry: { times: 2 },
            defaultError: { code: 'FALLBACK' },
            onHookError: () => {},
          },
        )

        expect(callCount).toBe(3)
        expect(result[0]).toBeNull()
        expect(result[1]).toEqual({ code: 'FALLBACK' })
      })

      it('no parseError + non-Error thrown value returns Error wrapping the value', async () => {
        const result = await safe.async(() => Promise.reject('async string'))

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect((result[1] as Error).message).toBe('async string')
        expect((result[1] as Error).cause).toBe('async string')
      })

      it('onHookError throwing during parseError failure does not crash', async () => {
        const result = await safe.async(
          () => Promise.reject('oops'),
          () => { throw new Error('parseError broke') },
          { onHookError: () => { throw new Error('onHookError also broke') } },
        )

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect((result[1] as Error).message).toBe('oops')
      })
    })

    describe('wrap', () => {
      it('parseError throwing returns toError(e) as fallback (no defaultError)', () => {
        const wrapped = safe.wrap(
          () => { throw 'wrapped error' },
          () => { throw new Error('parseError broke') },
        )
        const result = wrapped()

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect((result[1] as Error).message).toBe('wrapped error')
      })

      it('parseError throwing returns defaultError when provided', () => {
        const defaultErr = { code: 'WRAP_FALLBACK' }
        const wrapped = safe.wrap(
          () => { throw new Error('original') },
          () => { throw new Error('parseError broke') },
          { defaultError: defaultErr, onHookError: () => {} },
        )
        const result = wrapped()

        expect(result[0]).toBeNull()
        expect(result[1]).toBe(defaultErr)
      })

      it('no parseError + non-Error thrown value returns Error wrapping the value', () => {
        const wrapped = safe.wrap(() => { throw 'wrap string' })
        const result = wrapped()

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect((result[1] as Error).message).toBe('wrap string')
        expect((result[1] as Error).cause).toBe('wrap string')
      })

      it('onHookError throwing during parseError failure does not crash', () => {
        const wrapped = safe.wrap(
          () => { throw 'oops' },
          () => { throw new Error('parseError broke') },
          { onHookError: () => { throw new Error('onHookError also broke') } },
        )
        const result = wrapped()

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect((result[1] as Error).message).toBe('oops')
      })
    })

    describe('wrapAsync', () => {
      it('parseError throwing returns toError(e) as fallback (no defaultError)', async () => {
        const wrapped = safe.wrapAsync(
          () => Promise.reject('wrapped async error'),
          () => { throw new Error('parseError broke') },
        )
        const result = await wrapped()

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect((result[1] as Error).message).toBe('wrapped async error')
      })

      it('parseError throwing returns defaultError when provided', async () => {
        const defaultErr = { code: 'WRAP_ASYNC_FALLBACK' }
        const wrapped = safe.wrapAsync(
          () => Promise.reject(new Error('original')),
          () => { throw new Error('parseError broke') },
          { defaultError: defaultErr, onHookError: () => {} },
        )
        const result = await wrapped()

        expect(result[0]).toBeNull()
        expect(result[1]).toBe(defaultErr)
      })

      it('parseError throwing during retry continues the loop', async () => {
        let callCount = 0
        const wrapped = safe.wrapAsync(
          () => { callCount++; return Promise.reject(new Error(`fail ${callCount}`)) },
          () => { throw new Error('parseError broke') },
          {
            retry: { times: 2 },
            defaultError: { code: 'WRAP_ASYNC_FALLBACK' },
            onHookError: () => {},
          },
        )
        const result = await wrapped()

        expect(callCount).toBe(3)
        expect(result[0]).toBeNull()
        expect(result[1]).toEqual({ code: 'WRAP_ASYNC_FALLBACK' })
      })

      it('no parseError + non-Error thrown value returns Error wrapping the value', async () => {
        const wrapped = safe.wrapAsync(() => Promise.reject(404))
        const result = await wrapped()

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect((result[1] as Error).message).toBe('404')
        expect((result[1] as Error).cause).toBe(404)
      })

      it('onHookError throwing during parseError failure does not crash', async () => {
        const wrapped = safe.wrapAsync(
          () => Promise.reject('oops'),
          () => { throw new Error('parseError broke') },
          { onHookError: () => { throw new Error('onHookError also broke') } },
        )
        const result = await wrapped()

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect((result[1] as Error).message).toBe('oops')
      })
    })
  })

  describe('edge cases', () => {
    describe('empty object {} is not treated as hooks', () => {
      it('sync: treats {} as parseError (not hooks)', () => {
        // {} should NOT be detected as a hooks object.
        // When passed as the second arg it falls into the parseError branch,
        // which is undefined-ish (not a function), so on success it is ignored.
        const [value, error] = safe.sync(() => 42, {} as any)
        expect(value).toBe(42)
        expect(error).toBeNull()
      })

      it('async: treats {} as parseError (not hooks)', async () => {
        const [value, error] = await safe.async(async () => 42, {} as any)
        expect(value).toBe(42)
        expect(error).toBeNull()
      })

      it('wrap: treats {} as parseError (not hooks)', () => {
        const fn = safe.wrap((x: number) => x * 2, {} as any)
        const [value, error] = fn(5)
        expect(value).toBe(10)
        expect(error).toBeNull()
      })

      it('wrapAsync: treats {} as parseError (not hooks)', async () => {
        const fn = safe.wrapAsync(async (x: number) => x * 2, {} as any)
        const [value, error] = await fn(5)
        expect(value).toBe(10)
        expect(error).toBeNull()
      })
    })

    describe('abortAfter: 0', () => {
      it('times out on next tick', async () => {
        vi.useFakeTimers()

        const resultPromise = safe.async(
          () => new Promise<never>(() => {}),
          { abortAfter: 0 },
        )

        await vi.advanceTimersByTimeAsync(0)

        const [value, error] = await resultPromise
        expect(value).toBeNull()
        expect(error).toBeInstanceOf(TimeoutError)
        expect((error as TimeoutError).message).toBe('Operation timed out after 0ms')

        vi.useRealTimers()
      })
    })

    describe('abortAfter: non-integer (1.5)', () => {
      it('treats fractional timeout as-is (setTimeout rounds down)', async () => {
        vi.useFakeTimers()

        const resultPromise = safe.async(
          () => new Promise<never>(() => {}),
          { abortAfter: 1.5 },
        )

        await vi.advanceTimersByTimeAsync(2)

        const [value, error] = await resultPromise
        expect(value).toBeNull()
        expect(error).toBeInstanceOf(TimeoutError)
        expect((error as TimeoutError).message).toBe('Operation timed out after 1.5ms')

        vi.useRealTimers()
      })
    })

    describe('abortAfter: -1', () => {
      it('throws RangeError for negative abortAfter', async () => {
        await expect(
          safe.async(
            () => new Promise<never>(() => {}),
            { abortAfter: -1 },
          )
        ).rejects.toThrow(RangeError)
      })
    })

    describe('retry.times as float', () => {
      it('times: 2.5 is floored to 2 (maxAttempts = 3, loop runs 3 times)', async () => {
        const fn = vi.fn(() => Promise.reject(new Error('fail')))

        const [value, error] = await safe.async(fn, {
          retry: { times: 2.5 },
        })

        expect(value).toBeNull()
        expect(error).toBeInstanceOf(Error)
        expect(fn).toHaveBeenCalledTimes(3)
      })

      it('times: 0.5 is floored to 0 (maxAttempts = 1, loop runs once)', async () => {
        const fn = vi.fn(() => Promise.reject(new Error('fail')))

        const [value, error] = await safe.async(fn, {
          retry: { times: 0.5 },
        })

        expect(value).toBeNull()
        expect(error).toBeInstanceOf(Error)
        expect(fn).toHaveBeenCalledTimes(1)
      })
    })

    describe('retry.times as negative', () => {
      it('times: -1 is clamped to 0 (1 attempt, no retries)', async () => {
        const fn = vi.fn(() => Promise.reject(new Error('fail')))

        const result = await safe.async(fn, {
          retry: { times: -1 },
        })

        // Negative times clamped to 0 → maxAttempts = 1 → fn called once
        expect(fn).toHaveBeenCalledTimes(1)
        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect((result[1] as Error).message).toBe('fail')
        expect(result.ok).toBe(false)
      })

      it('times: -100 is clamped to 0 (same as -1)', async () => {
        const fn = vi.fn(() => Promise.reject(new Error('fail')))

        const result = await safe.async(fn, {
          retry: { times: -100 },
        })

        expect(fn).toHaveBeenCalledTimes(1)
        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect((result[1] as Error).message).toBe('fail')
        expect(result.ok).toBe(false)
      })
    })

    describe('very large retry.times', () => {
      it('times: 10000 does not blow up (fn succeeds on first try)', async () => {
        const fn = vi.fn(() => Promise.resolve('ok'))

        const [value, error] = await safe.async(fn, {
          retry: { times: 10000 },
        })

        expect(value).toBe('ok')
        expect(error).toBeNull()
        expect(fn).toHaveBeenCalledTimes(1)
      })

      it('times: 10000 retries until success without stack overflow', async () => {
        let callCount = 0
        const fn = vi.fn(async () => {
          callCount++
          if (callCount < 50) throw new Error(`fail ${callCount}`)
          return 'finally'
        })

        const [value, error] = await safe.async(fn, {
          retry: { times: 10000 },
        })

        expect(value).toBe('finally')
        expect(error).toBeNull()
        expect(fn).toHaveBeenCalledTimes(50)
      })
    })

    describe('waitBefore returning negative', () => {
      it('negative waitBefore causes no delay (guarded by waitMs > 0)', async () => {
        vi.useFakeTimers()
        let callCount = 0

        const fn = vi.fn(async () => {
          callCount++
          if (callCount < 3) throw new Error(`fail ${callCount}`)
          return 'success'
        })

        const resultPromise = safe.async(fn, {
          retry: { times: 2, waitBefore: () => -100 },
        })

        // No timer advance needed — negative waitBefore skips sleep
        const [value, error] = await resultPromise

        expect(value).toBe('success')
        expect(error).toBeNull()
        expect(fn).toHaveBeenCalledTimes(3)

        vi.useRealTimers()
      })
    })

    describe('parseResult returning a Promise in sync context', () => {
      it('returns the Promise object itself as the value (not awaited)', () => {
        const result = safe.sync(() => 42, {
          parseResult: () => Promise.resolve(99),
        })

        expect(result[0]).toBeInstanceOf(Promise)
        expect(result[1]).toBeNull()
        expect(result.ok).toBe(true)
      })
    })

    describe('safe.all short-circuit ignores late results', () => {
      it('resolves with error immediately and ignores slow op that resolves later', async () => {
        vi.useFakeTimers()
        const slowResolved = vi.fn()

        const resultPromise = safe.all({
          fast: safe.async(() => Promise.reject(new Error('fast fail'))),
          slow: safe.async(
            () =>
              new Promise<string>((resolve) => {
                setTimeout(() => {
                  slowResolved()
                  resolve('done')
                }, 10_000)
              }),
          ),
        })

        // Let the microtask queue flush so the fast rejection is processed
        await vi.advanceTimersByTimeAsync(0)

        const [data, error] = await resultPromise
        expect(data).toBeNull()
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('fast fail')

        // Advance past the slow op's timer — its callback fires, but safe.all already resolved
        await vi.advanceTimersByTimeAsync(10_000)
        expect(slowResolved).toHaveBeenCalled()

        // The result hasn't changed — still the same error
        expect(data).toBeNull()
        expect(error).toBeInstanceOf(Error)

        vi.useRealTimers()
      })
    })

    describe('safe.all handles rejecting promises', () => {
      it('returns error when a promise rejects with an Error', async () => {
        const [data, error] = await safe.all({
          good: safe.async(() => Promise.resolve('ok')),
          bad: Promise.reject(new Error('unexpected rejection')),
        })
        expect(data).toBeNull()
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('unexpected rejection')
      })

      it('wraps non-Error rejections in an Error', async () => {
        const [data, error] = await safe.all({
          bad: Promise.reject('string rejection'),
        })
        expect(data).toBeNull()
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('string rejection')
        expect((error as Error).cause).toBe('string rejection')
      })
    })

    describe('safe.all concurrent error ordering', () => {
      it('returns the first error to settle, not necessarily the first key', async () => {
        vi.useFakeTimers()

        const resultPromise = safe.all({
          // 'a' fails slowly (after 200ms)
          a: safe.async(() => new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('slow error')), 200)
          )),
          // 'b' fails quickly (after 50ms)
          b: safe.async(() => new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('fast error')), 50)
          )),
        })

        await vi.advanceTimersByTimeAsync(50)
        const [data, error] = await resultPromise

        expect(data).toBeNull()
        expect((error as Error).message).toBe('fast error')

        vi.useRealTimers()
      })
    })

    describe('withTimeout late resolution after timeout (coverage for .finally cleanup)', () => {
      it('clearTimeout fires in .finally even when original promise resolves after timeout', async () => {
        vi.useFakeTimers()

        let resolveManually!: (value: string) => void
        const fn = vi.fn().mockImplementation(
          () => new Promise<string>((resolve) => { resolveManually = resolve })
        )

        const promise = safe.async(fn, { abortAfter: 50 })

        // Timeout fires
        await vi.advanceTimersByTimeAsync(50)
        const result = await promise

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(TimeoutError)

        // Late resolution after timeout — exercises the .finally() cleanup path
        resolveManually('late value')

        // Flush microtasks to ensure late resolution is processed
        await vi.advanceTimersByTimeAsync(0)

        // No unhandled rejection or crash
        expect(result[1]).toBeInstanceOf(TimeoutError)

        vi.useRealTimers()
      })

      it('clearTimeout fires in .finally even when original promise rejects after timeout', async () => {
        vi.useFakeTimers()

        let rejectManually!: (reason: Error) => void
        const fn = vi.fn().mockImplementation(
          () => new Promise<string>((_, reject) => { rejectManually = reject })
        )

        const promise = safe.async(fn, { abortAfter: 50 })

        // Timeout fires
        await vi.advanceTimersByTimeAsync(50)
        const result = await promise

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(TimeoutError)

        // Late rejection after timeout — exercises the .finally() cleanup path
        rejectManually(new Error('late rejection'))

        // Flush microtasks
        await vi.advanceTimersByTimeAsync(0)

        // No unhandled rejection or crash
        expect(result[1]).toBeInstanceOf(TimeoutError)

        vi.useRealTimers()
      })
    })

    describe('safe.allSettled handles rejecting promises', () => {
      it('returns error result for a rejecting promise', async () => {
        const results = await safe.allSettled({
          good: safe.async(() => Promise.resolve('ok')),
          bad: Promise.reject(new Error('unexpected rejection')),
        })
        expect(results.good.ok).toBe(true)
        expect(results.good.value).toBe('ok')
        expect(results.bad.ok).toBe(false)
        expect(results.bad.error).toBeInstanceOf(Error)
        expect((results.bad.error as Error).message).toBe('unexpected rejection')
      })

      it('wraps non-Error rejections in an Error', async () => {
        const results = await safe.allSettled({
          bad: Promise.reject('string rejection'),
        })
        expect(results.bad.ok).toBe(false)
        expect(results.bad.error).toBeInstanceOf(Error)
        expect((results.bad.error as Error).message).toBe('string rejection')
        expect((results.bad.error as Error).cause).toBe('string rejection')
      })
    })

    describe('ok(undefined) vs err(undefined) discriminant', () => {
      it('ok(undefined) and err(undefined) are distinguishable via .ok', () => {
        const success = ok(undefined)
        const failure = err(undefined)

        // Both have undefined in the tuple, but discriminants differ
        expect(success[0]).toBeUndefined()
        expect(success[1]).toBeNull()
        expect(success.ok).toBe(true)
        expect(success.value).toBeUndefined()
        expect(success.error).toBeNull()

        expect(failure[0]).toBeNull()
        expect(failure[1]).toBeUndefined()
        expect(failure.ok).toBe(false)
        expect(failure.value).toBeNull()
        expect(failure.error).toBeUndefined()
      })

      it('tuple destructuring of err(undefined) gives falsy error', () => {
        const result = err(undefined)
        const [value, error] = result

        // error is undefined — falsy! Only .ok is reliable for discrimination
        expect(value).toBeNull()
        expect(error).toBeUndefined()
        expect(!error).toBe(true)
        expect(result.ok).toBe(false)
      })
    })

    describe('parseError that returns a falsy type is a compile error', () => {
      it('rejects parseError returning undefined at compile time', () => {
        // @ts-expect-error — parseError must not return a falsy type
        safe.async(() => Promise.reject(new Error('x')), () => undefined)
      })

      it('rejects parseError returning null at compile time', () => {
        // @ts-expect-error — parseError must not return a falsy type
        safe.async(() => Promise.reject(new Error('x')), () => null)
      })

      it('rejects parseError returning false at compile time', () => {
        // @ts-expect-error — parseError must not return a falsy type
        safe.async(() => Promise.reject(new Error('x')), () => false)
      })

      it('rejects parseError returning 0 at compile time', () => {
        // @ts-expect-error — parseError must not return a falsy type
        safe.async(() => Promise.reject(new Error('x')), () => 0 as const)
      })

      it('rejects parseError returning empty string at compile time', () => {
        // @ts-expect-error — parseError must not return a falsy type
        safe.async(() => Promise.reject(new Error('x')), () => '' as const)
      })

      it('still allows truthy error types', () => {
        // These should compile fine
        safe.async(() => Promise.reject(new Error('x')), (e) => ({ message: String(e) }))
        safe.async(() => Promise.reject(new Error('x')), (e) => String(e))
        safe.async(() => Promise.reject(new Error('x')), (e) => e instanceof Error ? e : new Error(String(e)))
      })
    })

    describe('concurrent calls to same wrapAsync result', () => {
      it('all calls complete independently with correct mutable closure state', async () => {
        let counter = 0

        const wrapped = safe.wrapAsync(async (id: number) => {
          counter++
          // Simulate async work
          await new Promise((r) => setTimeout(r, 10))
          return `result-${id}`
        })

        // Fire all calls concurrently
        const results = await Promise.all([
          wrapped(1),
          wrapped(2),
          wrapped(3),
          wrapped(4),
          wrapped(5),
        ])

        // All calls completed independently
        expect(counter).toBe(5)
        for (let i = 0; i < results.length; i++) {
          expect(results[i].ok).toBe(true)
          expect(results[i][0]).toBe(`result-${i + 1}`)
          expect(results[i][1]).toBeNull()
        }
      })
    })

    describe('retry.times with NaN', () => {
      it('times: NaN is treated as 0 (1 attempt, no retries)', async () => {
        const fn = vi.fn(() => Promise.reject(new Error('fail')))

        const result = await safe.async(fn, {
          retry: { times: NaN },
        })

        // NaN is sanitised to 0 → maxAttempts = 1 → fn called once
        expect(fn).toHaveBeenCalledTimes(1)
        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect((result[1] as Error).message).toBe('fail')
        expect(result.ok).toBe(false)
      })
    })

    describe('retry.times with Infinity', () => {
      it('times: Infinity is treated as 0 (1 attempt, no retries)', async () => {
        const fn = vi.fn(() => Promise.reject(new Error('fail')))

        const result = await safe.async(fn, {
          retry: { times: Infinity },
        })

        // Infinity is not finite → sanitised to 0 → maxAttempts = 1
        expect(fn).toHaveBeenCalledTimes(1)
        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
        expect((result[1] as Error).message).toBe('fail')
        expect(result.ok).toBe(false)
      })
    })

    describe('abortAfter: NaN', () => {
      it('throws RangeError for NaN abortAfter', async () => {
        await expect(
          safe.async(
            () => new Promise<never>(() => {}),
            { abortAfter: NaN },
          )
        ).rejects.toThrow(RangeError)
      })
    })

    describe('toError() with a plain object throw', () => {
      it('wraps thrown plain object in Error with [object Object] message', () => {
        const [, error] = safe.sync(() => {
          throw { code: 500 }
        })

        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('[object Object]')
        expect((error as any).cause).toEqual({ code: 500 })
      })

      it('wraps thrown number in Error with string message', () => {
        const [, error] = safe.sync(() => {
          throw 42
        })

        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('42')
        expect((error as any).cause).toBe(42)
      })

      it('wraps thrown symbol in Error', () => {
        const sym = Symbol('test')
        const [, error] = safe.sync(() => {
          throw sym
        })

        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('Symbol(test)')
        expect((error as any).cause).toBe(sym)
      })
    })

    describe('SafeResult spreading and serialization', () => {
      it('tagged properties (.ok, .value, .error) are non-enumerable and lost on spread', () => {
        const result = safe.sync(() => 42)
        const spread = { ...result }

        // Tuple indices are enumerable
        expect(spread).toEqual({ '0': 42, '1': null })
        // Tagged properties are non-enumerable and lost
        expect('ok' in spread).toBe(false)
        expect('value' in spread).toBe(false)
        expect('error' in spread).toBe(false)
      })

      it('JSON.stringify only includes tuple indices', () => {
        const result = safe.sync(() => 'hello')
        const json = JSON.stringify(result)

        expect(json).toBe('["hello",null]')
      })

      it('Object.keys only returns tuple indices', () => {
        const result = safe.sync(() => 'test')

        expect(Object.keys(result)).toEqual(['0', '1'])
      })

      it('Array.from preserves tuple values but not tagged properties', () => {
        const result = safe.sync(() => 99)
        const arr = Array.from(result)

        expect(arr).toEqual([99, null])
        expect((arr as any).ok).toBeUndefined()
      })
    })

    describe('parseResult throwing goes through the error path', () => {
      it('onError IS called when parseResult throws in sync', () => {
        const onError = vi.fn()
        const parseResultError = new Error('parseResult blew up')

        const result = safe.sync(() => 'data', {
          parseResult: () => { throw parseResultError },
          onError,
        })

        expect(onError).toHaveBeenCalledWith(parseResultError, [])
        expect(result[0]).toBeNull()
        expect(result[1]).toBe(parseResultError)
      })

      it('onError IS called when parseResult throws in async', async () => {
        const onError = vi.fn()
        const parseResultError = new Error('parseResult blew up')

        const result = await safe.async(() => Promise.resolve('data'), {
          parseResult: () => { throw parseResultError },
          onError,
        })

        expect(onError).toHaveBeenCalledWith(parseResultError, [])
        expect(result[0]).toBeNull()
        expect(result[1]).toBe(parseResultError)
      })

      it('parseError transforms parseResult error when provided', () => {
        const onError = vi.fn()

        const result = safe.sync(
          () => 'data',
          (e) => ({ code: 'MAPPED', msg: e instanceof Error ? e.message : 'unknown' }),
          {
            parseResult: () => { throw new Error('transform failed') },
            onError,
          },
        )

        expect(onError).toHaveBeenCalledWith({ code: 'MAPPED', msg: 'transform failed' }, [])
        expect(result[0]).toBeNull()
        expect(result[1]).toEqual({ code: 'MAPPED', msg: 'transform failed' })
      })
    })

    describe('wrapAsync with abortAfter does not pass signal to fn', () => {
      it('wrapped function receives only user args, not an AbortSignal', async () => {
        const receivedArgs: unknown[] = []
        const fn = async (...args: unknown[]) => {
          receivedArgs.push(...args)
          return 'ok'
        }

        const wrapped = safe.wrapAsync(fn, { abortAfter: 5000 })
        await wrapped()

        // wrapAsync does not inject a signal into the function arguments
        expect(receivedArgs).toEqual([])
      })

      it('fn receives only the user-provided arguments when abortAfter is set', async () => {
        const receivedArgs: unknown[] = []
        const fn = async (a: number, b: string) => {
          receivedArgs.push(a, b)
          return `${a}-${b}`
        }

        const wrapped = safe.wrapAsync(fn, { abortAfter: 5000 })
        await wrapped(42, 'hello')

        expect(receivedArgs).toEqual([42, 'hello'])
      })
    })

    describe('retry + abortAfter combined on wrapAsync', () => {
      it('retries with timeout on each attempt, succeeding on third try', async () => {
        let callCount = 0
        const fn = vi.fn(async () => {
          callCount++
          if (callCount < 3) throw new Error(`fail ${callCount}`)
          return 'success'
        })

        const wrapped = safe.wrapAsync(fn, {
          retry: { times: 3 },
          abortAfter: 5000,
        })

        const [value, error] = await wrapped()

        expect(value).toBe('success')
        expect(error).toBeNull()
        expect(fn).toHaveBeenCalledTimes(3)
      })

      it('timeout fires on each attempt, all retries exhausted', async () => {
        vi.useFakeTimers()

        const fn = vi.fn(() => new Promise<never>(() => {})) // never resolves

        const wrapped = safe.wrapAsync(fn, {
          retry: { times: 2 },
          abortAfter: 100,
        })

        const resultPromise = wrapped()

        // Each attempt times out after 100ms, 3 total attempts (initial + 2 retries)
        for (let i = 0; i < 3; i++) {
          await vi.advanceTimersByTimeAsync(100)
        }

        const [value, error] = await resultPromise

        expect(value).toBeNull()
        expect(error).toBeInstanceOf(TimeoutError)
        expect(fn).toHaveBeenCalledTimes(3)

        vi.useRealTimers()
      })

      it('retry succeeds after timeout on first attempt', async () => {
        vi.useFakeTimers()

        let callCount = 0
        const fn = vi.fn(async () => {
          callCount++
          if (callCount === 1) return new Promise<never>(() => {}) // hangs
          return 'recovered'
        })

        const wrapped = safe.wrapAsync(fn, {
          retry: { times: 1 },
          abortAfter: 50,
        })

        const resultPromise = wrapped()

        // First attempt times out
        await vi.advanceTimersByTimeAsync(50)
        // Second attempt resolves immediately
        await vi.advanceTimersByTimeAsync(0)

        const [value, error] = await resultPromise

        expect(value).toBe('recovered')
        expect(error).toBeNull()
        expect(fn).toHaveBeenCalledTimes(2)

        vi.useRealTimers()
      })
    })

    describe('isHooks value-type validation', () => {
      it('rejects { retry: 3 } — retry must be an object', () => {
        // If isHooks incorrectly accepted { retry: 3 }, this would be
        // treated as hooks instead of parseError. Since parseError must be
        // a function, passing an object causes a different code path.
        // We verify the object is NOT treated as hooks by ensuring the
        // function is called as parseError (which will fail since it's not a function).
        const result = safe.sync(
          () => { throw new Error('fail') },
          // @ts-expect-error - intentionally wrong shape to test runtime guard
          { retry: 3 },
        )

        // { retry: 3 } is not detected as hooks, so it's treated as parseError.
        // Since it's not a function, parseError is undefined, and toError is used.
        expect(result[1]).toBeInstanceOf(Error)
      })

      it('rejects { onSuccess: "hello" } — onSuccess must be a function', () => {
        const result = safe.sync(
          () => 42,
          // @ts-expect-error - intentionally wrong type
          { onSuccess: 'hello' },
        )

        // Not detected as hooks, falls through as parseError (undefined)
        expect(result[0]).toBe(42)
      })

      it('rejects { abortAfter: "slow" } — abortAfter must be a number', async () => {
        const result = await safe.async(
          () => Promise.resolve(42),
          // @ts-expect-error - intentionally wrong type
          { abortAfter: 'slow' },
        )

        // Not detected as hooks
        expect(result[0]).toBe(42)
      })

      it('accepts valid hooks with function values', () => {
        const onSuccess = vi.fn()
        const result = safe.sync(() => 42, { onSuccess })

        expect(result[0]).toBe(42)
        expect(onSuccess).toHaveBeenCalledWith(42, [])
      })

      it('accepts { retry: { times: 3 } } as valid hooks', async () => {
        let attempts = 0
        const result = await safe.async(
          () => {
            attempts++
            if (attempts < 3) return Promise.reject(new Error('not yet'))
            return Promise.resolve('done')
          },
          { retry: { times: 3 } },
        )

        expect(result[0]).toBe('done')
      })

      it('accepts { defaultError: anyValue } as valid hooks', () => {
        const result = safe.sync(
          () => { throw new Error('fail') },
          { defaultError: new Error('fallback') },
        )

        expect(result[1]).toBeInstanceOf(Error)
      })
    })

    describe('isHooks with undefined hook values (lines 38-40)', () => {
      it('treats { onSuccess: undefined } as hooks, not parseError', () => {
        const result = safe.sync(() => 42, { onSuccess: undefined })

        expect(result).toEqual([42, null])
        expect(result.ok).toBe(true)
      })

      it('treats { onError: undefined, onSettled: undefined } as hooks', () => {
        const result = safe.sync(
          () => { throw new Error('fail') },
          { onError: undefined, onSettled: undefined },
        )

        expect(result[0]).toBeNull()
        expect(result[1]).toBeInstanceOf(Error)
      })

      it('treats { onSuccess: undefined, onHookError: undefined } as hooks in async', async () => {
        const result = await safe.async(
          () => Promise.resolve('ok'),
          { onSuccess: undefined, onHookError: undefined },
        )

        expect(result).toEqual(['ok', null])
      })

      it('treats { retry: undefined } as hooks (non-function key with undefined value)', async () => {
        const result = await safe.async(
          () => Promise.resolve(99),
          { retry: undefined } as any,
        )

        expect(result).toEqual([99, null])
      })
    })

    describe('callHook: onHookError itself throws (line 65)', () => {
      it('swallows onHookError exception on error path in sync', () => {
        const result = safe.sync(
          () => { throw new Error('original') },
          {
            onError: () => { throw new Error('onError broke') },
            onHookError: () => { throw new Error('onHookError also broke') },
          },
        )

        expect(result[0]).toBeNull()
        expect((result[1] as Error).message).toBe('original')
      })

      it('swallows onHookError exception on error path in async', async () => {
        const result = await safe.async(
          () => Promise.reject(new Error('original')),
          {
            onError: () => { throw new Error('onError broke') },
            onHookError: () => { throw new Error('onHookError also broke') },
          },
        )

        expect(result[0]).toBeNull()
        expect((result[1] as Error).message).toBe('original')
      })

      it('swallows onHookError exception when onSettled throws on success path', () => {
        const result = safe.sync(() => 42, {
          onSettled: () => { throw new Error('onSettled broke') },
          onHookError: () => { throw new Error('onHookError also broke') },
        })

        expect(result).toEqual([42, null])
      })

      it('swallows onHookError exception when onSettled throws on error path', () => {
        const result = safe.sync(
          () => { throw new Error('original') },
          {
            onSettled: () => { throw new Error('onSettled broke') },
            onHookError: () => { throw new Error('onHookError also broke') },
          },
        )

        expect(result[0]).toBeNull()
        expect((result[1] as Error).message).toBe('original')
      })

      it('swallows onHookError exception in wrap', () => {
        const wrapped = safe.wrap(
          () => { throw new Error('original') },
          {
            onError: () => { throw new Error('onError broke') },
            onHookError: () => { throw new Error('onHookError also broke') },
          },
        )
        const result = wrapped()

        expect(result[0]).toBeNull()
        expect((result[1] as Error).message).toBe('original')
      })

      it('swallows onHookError exception in wrapAsync', async () => {
        const wrapped = safe.wrapAsync(
          async () => { throw new Error('original') },
          {
            onError: () => { throw new Error('onError broke') },
            onHookError: () => { throw new Error('onHookError also broke') },
          },
        )
        const result = await wrapped()

        expect(result[0]).toBeNull()
        expect((result[1] as Error).message).toBe('original')
      })
    })

    describe('safeAll rejection handler safety-net (line 590)', () => {
      it('catches a raw rejection from a non-safe-wrapped promise', async () => {
        const [data, error] = await safe.all({
          good: safe.async(() => Promise.resolve('ok')),
          bad: Promise.reject(new Error('raw rejection')) as any,
        })

        expect(data).toBeNull()
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('raw rejection')
      })

      it('handles rejection after done flag is already set', async () => {
        vi.useFakeTimers()

        const resultPromise = safe.all({
          // This one errors immediately via SafeResult
          fast: safe.async(() => Promise.reject(new Error('safe error'))),
          // This one rejects as a raw promise after a delay
          slow: new Promise<any>((_, reject) => {
            setTimeout(() => reject(new Error('late raw rejection')), 100)
          }),
        })

        await vi.advanceTimersByTimeAsync(0)
        const [data, error] = await resultPromise

        // First error wins
        expect(data).toBeNull()
        expect((error as Error).message).toBe('safe error')

        // Advance so the slow rejection fires — should not crash
        await vi.advanceTimersByTimeAsync(100)

        vi.useRealTimers()
      })

      it('wraps non-Error raw rejections via toError', async () => {
        const [data, error] = await safe.all({
          bad: Promise.reject(42) as any,
        })

        expect(data).toBeNull()
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('42')
        expect((error as any).cause).toBe(42)
      })
    })

    describe('concurrent safeAll with mixed error types', () => {
      it('returns the error from whichever operation settles first', async () => {
        vi.useFakeTimers()

        const resultPromise = safe.all({
          // Fails fast with a TypeError
          a: safe.async(() => new Promise<never>((_, reject) =>
            setTimeout(() => reject(new TypeError('type error')), 10)
          )),
          // Fails slower with a RangeError
          b: safe.async(() => new Promise<never>((_, reject) =>
            setTimeout(() => reject(new RangeError('range error')), 100)
          )),
          // Succeeds very late
          c: safe.async(() => new Promise<string>(resolve =>
            setTimeout(() => resolve('done'), 500)
          )),
        })

        await vi.advanceTimersByTimeAsync(10)
        const [data, error] = await resultPromise

        expect(data).toBeNull()
        expect(error).toBeInstanceOf(TypeError)
        expect((error as Error).message).toBe('type error')

        vi.useRealTimers()
      })

      it('returns first safe-result error when mixed with raw rejections', async () => {
        vi.useFakeTimers()

        const resultPromise = safe.all({
          // SafeResult error arrives first
          a: safe.async(() => Promise.reject(new Error('safe error'))),
          // Raw rejection arrives later
          b: new Promise<any>((_, reject) =>
            setTimeout(() => reject(new Error('raw rejection')), 100)
          ),
        })

        await vi.advanceTimersByTimeAsync(0)
        const [data, error] = await resultPromise

        expect(data).toBeNull()
        expect((error as Error).message).toBe('safe error')

        await vi.advanceTimersByTimeAsync(100)
        vi.useRealTimers()
      })
    })

    describe('retry with waitBefore returning negative/NaN/Infinity via wrapAsync', () => {
      it('waitBefore returning negative skips the wait', async () => {
        let attempts = 0
        const wrapped = safe.wrapAsync(
          async () => {
            attempts++
            if (attempts < 2) throw new Error('fail')
            return 'done'
          },
          { retry: { times: 1, waitBefore: () => -100 } },
        )

        const [value, error] = await wrapped()
        expect(value).toBe('done')
        expect(error).toBeNull()
        expect(attempts).toBe(2)
      })

      it('waitBefore returning NaN skips the wait', async () => {
        let attempts = 0
        const wrapped = safe.wrapAsync(
          async () => {
            attempts++
            if (attempts < 2) throw new Error('fail')
            return 'done'
          },
          { retry: { times: 1, waitBefore: () => NaN } },
        )

        const [value, error] = await wrapped()
        expect(value).toBe('done')
        expect(error).toBeNull()
        expect(attempts).toBe(2)
      })

      it('waitBefore returning Infinity skips the wait', async () => {
        let attempts = 0
        const wrapped = safe.wrapAsync(
          async () => {
            attempts++
            if (attempts < 2) throw new Error('fail')
            return 'done'
          },
          { retry: { times: 1, waitBefore: () => Infinity } },
        )

        const [value, error] = await wrapped()
        expect(value).toBe('done')
        expect(error).toBeNull()
        expect(attempts).toBe(2)
      })

      it('waitBefore returning -Infinity skips the wait', async () => {
        let attempts = 0
        const wrapped = safe.wrapAsync(
          async () => {
            attempts++
            if (attempts < 2) throw new Error('fail')
            return 'done'
          },
          { retry: { times: 1, waitBefore: () => -Infinity } },
        )

        const [value, error] = await wrapped()
        expect(value).toBe('done')
        expect(error).toBeNull()
        expect(attempts).toBe(2)
      })

      it('waitBefore returning 0 skips the wait', async () => {
        let attempts = 0
        const wrapped = safe.wrapAsync(
          async () => {
            attempts++
            if (attempts < 2) throw new Error('fail')
            return 'done'
          },
          { retry: { times: 1, waitBefore: () => 0 } },
        )

        const [value, error] = await wrapped()
        expect(value).toBe('done')
        expect(error).toBeNull()
        expect(attempts).toBe(2)
      })
    })
  })
})
