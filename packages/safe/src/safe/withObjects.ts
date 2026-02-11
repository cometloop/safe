import type {
  SafeResult,
  SafeResultObj,
  SafeInstance,
  SafeObjectInstance,
} from './types'
import { okObj, errObj } from './types'

function toObjectResult<T, E>(result: SafeResult<T, E>): SafeResultObj<T, E> {
  if (result.ok) return okObj(result.value as T)
  return errObj(result.error as E)
}

// Overload 1: Wrap a single SafeResult tuple → object
export function withObjects<T, E>(result: SafeResult<T, E>): SafeResultObj<T, E>
// Overload 2: Wrap a Promise<SafeResult>
export function withObjects<T, E>(
  result: Promise<SafeResult<T, E>>
): Promise<SafeResultObj<T, E>>
// Overload 3: Wrap a sync function returning SafeResult
export function withObjects<A extends unknown[], T, E>(
  fn: (...args: A) => SafeResult<T, E>
): (...args: A) => SafeResultObj<T, E>
// Overload 4: Wrap an async function returning Promise<SafeResult>
export function withObjects<A extends unknown[], T, E>(
  fn: (...args: A) => Promise<SafeResult<T, E>>
): (...args: A) => Promise<SafeResultObj<T, E>>
// Overload 5: Wrap a SafeInstance
export function withObjects<E, TResult>(
  instance: SafeInstance<E, TResult>
): SafeObjectInstance<E, TResult>
// Implementation
export function withObjects(input: unknown): unknown {
  // Overload 1: tuple result
  if (Array.isArray(input)) {
    return toObjectResult(input as unknown as SafeResult<unknown, unknown>)
  }

  // Overload 2: Promise
  if (input instanceof Promise) {
    return input.then((result) =>
      toObjectResult(result as SafeResult<unknown, unknown>)
    )
  }

  // Overloads 3/4: function
  if (typeof input === 'function') {
    return (...args: unknown[]) => {
      const result = (input as (...args: unknown[]) => unknown)(...args)
      if (result instanceof Promise) {
        return result.then((r) =>
          toObjectResult(r as SafeResult<unknown, unknown>)
        )
      }
      return toObjectResult(result as SafeResult<unknown, unknown>)
    }
  }

  // Overload 5: SafeInstance
  if (
    typeof input === 'object' &&
    input !== null &&
    'sync' in input &&
    'async' in input
  ) {
    const instance = input as SafeInstance<any, any>
    return {
      sync: (fn: any, hooks?: any) => toObjectResult(instance.sync(fn, hooks)),
      async: (fn: any, hooks?: any) =>
        instance.async(fn, hooks).then(toObjectResult),
      wrap: (fn: any, hooks?: any) => {
        const wrapped = instance.wrap(fn, hooks)
        return (...args: any[]) => toObjectResult(wrapped(...args))
      },
      wrapAsync: (fn: any, hooks?: any) => {
        const wrapped = instance.wrapAsync(fn, hooks)
        return (...args: any[]) => wrapped(...args).then(toObjectResult)
      },
      all: (fns: any) => instance.all(fns).then(toObjectResult),
      allSettled: async (fns: any) => {
        const results = (await instance.allSettled(fns)) as Record<
          string,
          SafeResult<unknown, unknown>
        >
        const obj: Record<string, SafeResultObj<unknown, unknown>> = {}
        for (const key of Object.keys(results)) {
          obj[key] = toObjectResult(results[key])
        }
        return obj
      },
    } as SafeObjectInstance<any, any>
  }

  throw new TypeError('withObjects: unsupported input type')
}
