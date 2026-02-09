---
title: safe.wrap
---

Wraps a synchronous function to return `SafeResult` instead of throwing. Automatically preserves function parameter types. {% .lead %}

---

## Signatures

```ts
safe.wrap<TArgs, T>(fn: (...args: TArgs) => T): (...args: TArgs) => SafeResult<T, Error>
safe.wrap<TArgs, T>(fn: (...args: TArgs) => T, hooks: SafeHooks<T, Error, TArgs>): (...args: TArgs) => SafeResult<T, Error>
safe.wrap<TArgs, T, E>(fn: (...args: TArgs) => T, parseError: (e: unknown) => E): (...args: TArgs) => SafeResult<T, E>
safe.wrap<TArgs, T, E>(fn: (...args: TArgs) => T, parseError: (e: unknown) => E, hooks: SafeHooks<T, E, TArgs>): (...args: TArgs) => SafeResult<T, E>
```

---

## Basic usage

```ts
// Setup: a function that can throw
const divide = (a: number, b: number) => {
  if (b === 0) throw new Error('Division by zero')
  return a / b
}

// Wrap it
const safeDivide = safe.wrap(divide)
const [result, error] = safeDivide(10, 2) // Types inferred automatically!

if (error) {
  console.error('Division failed:', error.message)
  return
}
console.log(result) // 5
```

Also works with built-in functions:

```ts
const safeJsonParse = safe.wrap(JSON.parse)
const [data, error] = safeJsonParse('{"valid": true}')
```

---

## With error mapping

```ts
type MathError = { code: string; operation: string; message: string }

const safeDivide = safe.wrap(
  divide,
  (e): MathError => ({
    code: 'DIVISION_ERROR',
    operation: 'divide',
    message: e instanceof Error ? e.message : 'Unknown error',
  })
)

const [result, error] = safeDivide(10, 0)
if (error) {
  console.error(error.code, error.message) // error is typed as MathError
}
```

---

## With hooks

For `safe.wrap`, the hook context contains the **original arguments** passed to the wrapped function:

```ts
const safeDivide = safe.wrap(divide, {
  onSuccess: (result, [a, b]) => {
    console.log(`${a} / ${b} = ${result}`)
    metrics.record('division_success')
  },
  onError: (error, [a, b]) => {
    console.error(`Failed to divide ${a} by ${b}: ${error.message}`)
    metrics.record('division_error')
  },
})

safeDivide(10, 2) // logs: "10 / 2 = 5"
safeDivide(10, 0) // logs: "Failed to divide 10 by 0: Division by zero"
```

{% callout title="Context in hooks" type="note" %}
Unlike `safe.sync` where context is always `[]`, `safe.wrap` hooks receive the original function arguments as context. This is useful for logging which inputs caused an error.
{% /callout %}

---

## With error mapping and hooks

```ts
const safeDivide = safe.wrap(
  divide,
  (e): MathError => ({
    code: 'DIVISION_ERROR',
    operation: 'divide',
    message: e instanceof Error ? e.message : 'Unknown error',
  }),
  {
    onSuccess: (result, [a, b]) => {
      audit.log('division', { a, b, result })
    },
    onError: (error, [a, b]) => {
      // error is typed as MathError here
      audit.log('division_failed', { a, b, code: error.code })
      alertIfCritical(error)
    },
  }
)
```
