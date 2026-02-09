---
title: safe.sync
---

Executes a synchronous function and returns a `SafeResult` tuple. {% .lead %}

---

## Signatures

```ts
safe.sync<T>(fn: () => T): SafeResult<T, Error>
safe.sync<T>(fn: () => T, hooks: SafeHooks<T, Error, []>): SafeResult<T, Error>
safe.sync<T, E>(fn: () => T, parseError: (e: unknown) => NonFalsy<E>): SafeResult<T, E>
safe.sync<T, E>(fn: () => T, parseError: (e: unknown) => NonFalsy<E>, hooks: SafeHooks<T, E, []> & { defaultError: E }): SafeResult<T, E>
```

---

## Basic usage

```ts
const [result, error] = safe.sync(() => JSON.parse('{"name": "John"}'))

if (error) {
  console.error('Parse failed:', error.message)
  return
}
console.log(result) // { name: "John" }
```

On success, `result` contains the return value and `error` is `null`. On failure, `result` is `null` and `error` is the caught `Error`.

{% callout title="Error normalization" type="note" %}
When no `parseError` is provided, non-`Error` thrown values (strings, numbers, etc.) are automatically normalized to `Error` instances via `new Error(String(e))`. The original thrown value is preserved as `error.cause`. This ensures the default `SafeResult<T, Error>` type is always truthful.
{% /callout %}

---

## With error mapping

Transform the caught error into a custom type using the `parseError` parameter:

```ts
type ParseError = { code: string; message: string }

const [result, error] = safe.sync(
  () => JSON.parse(invalidJson),
  (e): ParseError => ({
    code: 'PARSE_ERROR',
    message: e instanceof Error ? e.message : 'Unknown error',
  })
)

if (error) {
  console.error(error.code, error.message) // error is typed as ParseError
}
```

---

## With hooks

Hooks let you execute side effects (logging, analytics, error reporting) without affecting the return value:

```ts
const [result, error] = safe.sync(() => computeExpensiveValue(), {
  onSuccess: (value, []) => console.log('Computed:', value),
  onError: (error, []) => reportToSentry(error),
})
```

The second parameter in each hook is the context tuple. For `safe.sync`, this is always an empty tuple `[]`.

---

## With error mapping and hooks

Combine both for full control:

```ts
const [result, error] = safe.sync(
  () => JSON.parse(jsonString),
  (e): ParseError => ({ code: 'PARSE_ERROR', message: String(e) }),
  {
    onSuccess: (data, []) => analytics.track('parse_success'),
    onError: (error, []) =>
      analytics.track('parse_failed', { code: error.code }),
  }
)
```

{% callout title="Hook execution" type="note" %}
Hooks run after the operation completes but before the result is returned. They do not affect the return value.
{% /callout %}
