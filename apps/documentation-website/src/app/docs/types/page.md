---
title: Types
---

Complete type reference for all exported types in `@cometloop/safe`. {% .lead %}

---

## SafeResult

```ts
type SafeResult<T, E = Error> = SafeOk<T> | SafeErr<E>
```

A discriminated union that supports both tuple destructuring and tagged property access:

- On success: `[value, null]` with `.ok = true`, `.value = T`, `.error = null`
- On error: `[null, error]` with `.ok = false`, `.value = null`, `.error = E`

```ts
// Tuple destructuring
const [data, error] = safeParse('{"valid": true}')

// Tagged property access
const result = safeParse('{"valid": true}')
if (result.ok) {
  console.log(result.value)
} else {
  console.error(result.error)
}
```

---

## SafeOk

```ts
type SafeOk<T> = readonly [T, null] & {
  readonly ok: true
  readonly value: T
  readonly error: null
}
```

The success variant of `SafeResult`. Combines a readonly tuple `[T, null]` with tagged discriminant properties for pattern matching.

---

## SafeErr

```ts
type SafeErr<E> = readonly [null, E] & {
  readonly ok: false
  readonly value: null
  readonly error: E
}
```

The error variant of `SafeResult`. Combines a readonly tuple `[null, E]` with tagged discriminant properties for pattern matching.

---

## ok

```ts
function ok<T>(value: T): SafeOk<T>
```

Constructs a success result. Useful when building `SafeResult` values manually (e.g., in custom wrappers or adapters):

```ts
import { ok, err } from '@cometloop/safe'

function divide(a: number, b: number): SafeResult<number, string> {
  if (b === 0) return err('Division by zero')
  return ok(a / b)
}
```

---

## err

```ts
function err<E>(error: E): SafeErr<E>
```

Constructs an error result. See [ok](#ok) for a usage example.

---

## SafeHooks

```ts
type SafeHooks<T, E, TContext extends unknown[] = [], TOut = T> = {
  parseResult?: (result: T) => TOut
  onSuccess?: (result: TOut, context: TContext) => void
  onError?: (error: E, context: TContext) => void
  onSettled?: (result: TOut | null, error: E | null, context: TContext) => void
  onHookError?: (error: unknown, hookName: string) => void
  defaultError?: E
}
```

Lifecycle hooks and result transformation:

- `T` — The raw success result type
- `E` — The error type
- `TContext` — Tuple of function arguments (empty `[]` for sync/async, `TArgs` for wrap/wrapAsync)
- `TOut` — The transformed result type (defaults to `T` when `parseResult` is not provided)
- `parseResult` — Optional function that transforms the successful result from type `T` to type `TOut`. See [Result transformation](/docs/result-transformation)
- `onSettled` — Optional hook called after either success or error
- `onHookError` — Optional callback invoked when any hook throws. Receives the thrown error and the hook name. See [Hooks](/docs/hooks#onhookerror)
- `defaultError` — Optional fallback error value returned when `parseError` throws

---

## SafeAsyncHooks

```ts
type SafeAsyncHooks<T, E, TContext extends unknown[] = [], TOut = T> = SafeHooks<
  T,
  E,
  TContext,
  TOut
> & {
  onRetry?: (error: E, attempt: number, context: TContext) => void
  retry?: RetryConfig
  abortAfter?: number // timeout in milliseconds
}
```

Extended hooks for async operations with retry and timeout support:

- Extends `SafeHooks` with all its properties (including `parseResult`)
- `onRetry` — Called before each retry attempt with the error, 1-indexed attempt number, and context
- `retry` — Optional retry configuration
- `abortAfter` — Optional timeout in milliseconds. When set, creates an `AbortController` for deadline enforcement

{% callout title="AbortSignal and abortAfter" type="note" %}
When `abortAfter` is configured, `safe.async` passes an `AbortSignal` as the first parameter to your function for cooperative cancellation. `safe.wrapAsync` does **not** pass a signal — it only enforces an external deadline. See [Timeout / Abort](/docs/timeout-abort) for details.
{% /callout %}

---

## RetryConfig

```ts
type RetryConfig = {
  times: number                        // Number of retry attempts (not including initial)
  waitBefore?: (attempt: number) => number // Returns ms to wait before retry (1-indexed)
}
```

Configuration for automatic retry:

- `times` — Number of retry attempts. Total attempts = `times + 1` (initial + retries)
- `waitBefore` — Optional function that returns milliseconds to wait before each retry. Receives 1-indexed attempt number.

---

## NonFalsy

```ts
type NonFalsy<E> = E extends Falsy ? never : E
```

A utility type that strips falsy members (`false`, `0`, `''`, `null`, `undefined`, `0n`, `void`) from `E`. Used as the return type constraint for `parseError` to prevent returning falsy error values that would break `if (error)` truthiness checks.

- For union types like `string | null`, the falsy member (`null`) is stripped — `parseError` must return `string`
- For purely falsy types (e.g. `null`, `false`), the result is `never`, making the `parseError` return type unsatisfiable (compile error)

---

## TimeoutError

```ts
class TimeoutError extends Error {
  constructor(ms: number)
  name: 'TimeoutError'
  message: `Operation timed out after ${ms}ms`
}
```

Error class thrown when an operation exceeds its `abortAfter` timeout:

- Extends the built-in `Error` class
- `name` is always `'TimeoutError'`
- `message` includes the timeout duration in milliseconds
- Can be checked with `instanceof TimeoutError`

---

## CreateSafeConfig

```ts
type CreateSafeConfig<E, TResult = never> = {
  parseError: (e: unknown) => NonFalsy<E>
  defaultError: E
  parseResult?: (result: unknown) => TResult
  onSuccess?: (result: unknown) => void
  onError?: (error: E) => void
  onSettled?: (result: unknown, error: E | null) => void
  onRetry?: (error: E, attempt: number) => void
  retry?: RetryConfig
  abortAfter?: number
  onHookError?: (error: unknown, hookName: string) => void
}
```

Configuration for creating a pre-configured safe instance:

- `parseError` — Required function that transforms caught errors to type `E`. Uses `NonFalsy<E>` to prevent falsy return values. If `parseError` throws, the error is caught, reported via `onHookError('parseError')`, and `defaultError` is returned
- `defaultError` — Required fallback error value returned when `parseError` throws
- `parseResult` — Optional function that transforms successful results. When provided, `TResult` becomes the default result type for all methods. Per-call `parseResult` overrides the factory default
- `onSuccess` — Optional default hook called on every successful operation (result is `unknown` since `T` varies per call)
- `onError` — Optional default hook called on every error (receives the mapped error type `E`)
- `onSettled` — Optional default hook called after either success or error
- `onRetry` — Optional default hook called before each retry for async operations
- `retry` — Optional default retry configuration for async operations
- `abortAfter` — Optional default timeout for all async operations in milliseconds
- `onHookError` — Optional callback invoked when any hook or `parseError` throws. Per-call `onHookError` overrides the factory-level callback. See [Hooks](/docs/hooks#onhookerror)

---

## SafeInstance

```ts
type SafeInstance<E, TResult = never> = {
  sync: <T, TOut = [TResult] extends [never] ? T : TResult>(
    fn: () => T,
    hooks?: SafeHooks<T, E, [], TOut>
  ) => SafeResult<TOut, E>
  async: <T, TOut = [TResult] extends [never] ? T : TResult>(
    fn: (signal?: AbortSignal) => Promise<T>,
    hooks?: SafeAsyncHooks<T, E, [], TOut>
  ) => Promise<SafeResult<TOut, E>>
  wrap: <TArgs extends unknown[], T, TOut = [TResult] extends [never] ? T : TResult>(
    fn: (...args: TArgs) => T,
    hooks?: SafeHooks<T, E, TArgs, TOut>
  ) => (...args: TArgs) => SafeResult<TOut, E>
  wrapAsync: <TArgs extends unknown[], T, TOut = [TResult] extends [never] ? T : TResult>(
    fn: (...args: TArgs) => Promise<T>,
    hooks?: SafeAsyncHooks<T, E, TArgs, TOut>
  ) => (...args: TArgs) => Promise<SafeResult<TOut, E>>
  all: <T extends Record<string, (signal?: AbortSignal) => Promise<any>>>(
    fns: T
  ) => Promise<SafeResult<
    { [K in keyof T]: [TResult] extends [never]
      ? (T[K] extends (signal?: AbortSignal) => Promise<infer V> ? V : never)
      : TResult
    },
    E
  >>
  allSettled: <T extends Record<string, (signal?: AbortSignal) => Promise<any>>>(
    fns: T
  ) => Promise<{
    [K in keyof T]: SafeResult<
      [TResult] extends [never]
        ? (T[K] extends (signal?: AbortSignal) => Promise<infer V> ? V : never)
        : TResult,
      E
    >
  }>
}
```

A pre-configured safe instance with a fixed error type. Methods do not accept a `parseError` parameter (already configured). When `parseResult` is configured at the factory level, `TResult` becomes the default result type for all methods. Per-call `parseResult` (via hooks) overrides the factory default.

{% callout title="all and allSettled" type="note" %}
On a `createSafe` instance, `all` and `allSettled` accept **raw async functions** — not pre-wrapped `Promise<SafeResult>` entries. The instance applies its own `parseError`, hooks, retry, and timeout configuration to each function automatically. The standalone `safe.all` and `safe.allSettled` accept `Promise<SafeResult>` entries instead.
{% /callout %}

{% callout title="AbortSignal behavior" type="note" %}
When `abortAfter` is configured, the `async` method passes an `AbortSignal` as the first parameter to your function. `wrapAsync` does **not** pass a signal — it enforces an external deadline only. See [Timeout / Abort](/docs/timeout-abort) for details.
{% /callout %}
