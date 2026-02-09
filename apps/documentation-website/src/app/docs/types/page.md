---
title: Types
---

Complete type reference for all exported types in `@cometloop/safe`. {% .lead %}

---

## SafeResult

```ts
type SafeResult<T, E = Error> = readonly [T, null] | readonly [null, E]
```

A discriminated union tuple where:

- On success: `[value, null]`
- On error: `[null, error]`

---

## SafeHooks

```ts
type SafeHooks<T, E, TContext extends unknown[] = [], TOut = T> = {
  parseResult?: (result: T) => TOut
  onSuccess?: (result: TOut, context: TContext) => void
  onError?: (error: E, context: TContext) => void
  onSettled?: (result: TOut | null, error: E | null, context: TContext) => void
}
```

Lifecycle hooks and result transformation:

- `T` — The raw success result type
- `E` — The error type
- `TContext` — Tuple of function arguments (empty `[]` for sync/async, `TArgs` for wrap/wrapAsync)
- `TOut` — The transformed result type (defaults to `T` when `parseResult` is not provided)
- `parseResult` — Optional function that transforms the successful result from type `T` to type `TOut`. See [Result transformation](/docs/result-transformation)
- `onSettled` — Optional hook called after either success or error

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
- `abortAfter` — Optional timeout in milliseconds. When set, creates an `AbortController` and passes the signal to the function

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
  parseError: (e: unknown) => E
  parseResult?: (result: unknown) => TResult
  onSuccess?: (result: unknown) => void
  onError?: (error: E) => void
  onSettled?: (result: unknown, error: E | null) => void
  onRetry?: (error: E, attempt: number) => void
  retry?: RetryConfig
  abortAfter?: number
}
```

Configuration for creating a pre-configured safe instance:

- `parseError` — Required function that transforms caught errors to type `E`
- `parseResult` — Optional function that transforms successful results. When provided, `TResult` becomes the default result type for all methods. Per-call `parseResult` overrides the factory default
- `onSuccess` — Optional default hook called on every successful operation (result is `unknown` since `T` varies per call)
- `onError` — Optional default hook called on every error (receives the mapped error type `E`)
- `onSettled` — Optional default hook called after either success or error
- `onRetry` — Optional default hook called before each retry for async operations
- `retry` — Optional default retry configuration for async operations
- `abortAfter` — Optional default timeout for all async operations in milliseconds

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
}
```

A pre-configured safe instance with a fixed error type. Methods do not accept a `parseError` parameter (already configured). When `parseResult` is configured at the factory level, `TResult` becomes the default result type for all methods. Per-call `parseResult` (via hooks) overrides the factory default.

{% callout title="AbortSignal behavior" type="note" %}
When `abortAfter` is configured, the `async` method passes an `AbortSignal` as the first parameter to your function. For `wrapAsync`, the signal is appended as an additional argument.
{% /callout %}
