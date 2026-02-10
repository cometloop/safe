---
title: Result transformation
---

Transform successful results into a new type using `parseResult` — the counterpart to `parseError` for the success path. {% .lead %}

---

## Overview

While `parseError` transforms caught errors into a structured error type, `parseResult` transforms successful results into a new type. Both are optional and maintain full type inference.

```ts
import { safe } from '@cometloop/safe'

// parseError transforms the error side
// parseResult transforms the success side
const [user, error] = safe.sync(
  () => '{"name": "Alice", "age": 30}',
  (e) => ({ code: 'PARSE_ERROR', message: String(e) }),
  {
    parseResult: (raw) => JSON.parse(raw) as { name: string; age: number },
  }
)
// user is typed as { name: string; age: number }
// error is typed as { code: string; message: string }
```

---

## Basic usage

### Sync

```ts
// Transform a string to its length
const [length, error] = safe.sync(
  () => 'hello world',
  {
    parseResult: (raw) => raw.length,
  }
)
// length is typed as number

// Parse and validate JSON
const [config, error2] = safe.sync(
  () => fs.readFileSync('config.json', 'utf-8'),
  {
    parseResult: (raw) => JSON.parse(raw) as AppConfig,
  }
)
```

### Async

```ts
// Extract specific fields from an API response
const [userName, error] = await safe.async(
  () => fetch('/api/user').then((r) => r.json()),
  {
    parseResult: (data) => data.name as string,
  }
)
// userName is typed as string
```

### Wrap

```ts
const safeAdd = safe.wrap(
  (a: number, b: number) => a + b,
  {
    parseResult: (sum) => `Result: ${sum}`,
  }
)

const [message, error] = safeAdd(2, 3)
// message is typed as string — "Result: 5"
```

### WrapAsync

```ts
const safeFetchUser = safe.wrapAsync(
  async (id: number) => {
    const res = await fetch(`/api/users/${id}`)
    return res.json()
  },
  {
    parseResult: (data) => data.name as string,
  }
)

const [name, error] = await safeFetchUser(42)
// name is typed as string
```

---

## With parseError

Both transforms work together — `parseError` for the error side, `parseResult` for the success side:

```ts
type AppError = { code: string; message: string }

const [count, error] = safe.sync(
  () => someRiskyOperation(),
  (e): AppError => ({
    code: 'OPERATION_ERROR',
    message: e instanceof Error ? e.message : String(e),
  }),
  {
    parseResult: (raw) => raw.items.length,
  }
)
// count is number, error is AppError
```

---

## With createSafe

Set a factory-level `parseResult` that applies to all methods:

```ts
import { createSafe } from '@cometloop/safe'
import { z } from 'zod'

const userSchema = z.object({ id: z.number(), name: z.string() })

const validatedSafe = createSafe({
  parseError: (e) => ({
    code: 'ERROR',
    message: e instanceof Error ? e.message : String(e),
  }),
  defaultError: { code: 'ERROR', message: 'Unknown error' },
  parseResult: (result) => userSchema.parse(result),
})

// All methods validate results through the schema
const [user, error] = validatedSafe.sync(() => JSON.parse(data))
// user is typed as z.infer<typeof userSchema>
```

### Per-call override

Per-call `parseResult` completely overrides the factory default:

```ts
// Override factory parseResult for this call
const [raw, error] = validatedSafe.sync(() => fetchData(), {
  parseResult: (result) => result, // bypass factory validation
})
```

---

## Execution order

When `parseResult` is provided, the execution order is:

1. Function executes and returns raw result (`T`)
2. **`parseResult`** transforms the result (`T` → `TOut`)
3. `onSuccess` receives the **transformed** result (`TOut`)
4. `onSettled` receives the **transformed** result (`TOut`)
5. Return `[transformedResult, null]`

```ts
const callOrder: string[] = []

safe.sync(
  () => 42,
  {
    parseResult: (n) => {
      callOrder.push('parseResult')
      return n * 2
    },
    onSuccess: (result) => {
      callOrder.push('onSuccess')
      // result is 84 (transformed)
    },
    onSettled: (result) => {
      callOrder.push('onSettled')
    },
  }
)

// callOrder: ['parseResult', 'onSuccess', 'onSettled']
```

---

## Error handling

If `parseResult` throws, the error is **not** treated as a failure. Instead, the raw (untransformed) result is returned as a fallback. The error is reported via `onHookError` with hookName `'parseResult'`:

```ts
const [data, error] = safe.sync(
  () => '{"valid": false}',
  {
    parseResult: (raw) => {
      throw new Error('transform failed')
    },
    onHookError: (err, hookName) => {
      // hookName === 'parseResult'
      console.warn('parseResult threw:', err)
    },
  }
)
// data is '{"valid": false}' (the raw result, untransformed)
// error is null — this is still a success
```

{% callout title="parseResult is safe" type="note" %}
A failing `parseResult` never turns a successful operation into an error. The raw result is returned instead, and the failure is only observable through `onHookError`. This matches the safety guarantee of other hooks.
{% /callout %}

---

## Type inference

The return type is automatically inferred from the `parseResult` function:

```ts
// TOut inferred as number
const [n, e1] = safe.sync(() => 'hello', {
  parseResult: (s) => s.length,
})

// TOut inferred as { id: number; name: string }
const [user, e2] = safe.sync(() => rawData, {
  parseResult: (data) => ({ id: data.id as number, name: data.name as string }),
})
```

With `createSafe`, the factory `parseResult` return type becomes the default `TResult` for all methods:

```ts
const appSafe = createSafe({
  parseError: (e) => String(e),
  defaultError: 'unknown error',
  parseResult: (result) => ({ wrapped: result }),
})

const [data, error] = appSafe.sync(() => 42)
// data is typed as { wrapped: unknown }
```

{% callout title="parseResult is optional" type="note" %}
When `parseResult` is not provided, the result type is unchanged — `TOut` defaults to `T`. All existing code without `parseResult` continues to work exactly the same.
{% /callout %}
