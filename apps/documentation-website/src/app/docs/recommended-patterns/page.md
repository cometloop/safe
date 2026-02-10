---
title: Recommended patterns
---

Opinionated guidance for getting the most out of `@cometloop/safe`. The core idea: **keep your call sites clean and minimal**. Configure error handling once, wrap your functions, and call them like normal functions — without all the extra stuff. {% .lead %}

---

## Use createSafe as your entry point

`createSafe` is the best way to use this library. The whole point is to keep your call sites looking like normal function calls — no inline error mappers, no extra options objects, no lambda wrappers cluttering your business logic. All the configuration happens once, somewhere else.

```ts
import { createSafe } from '@cometloop/safe'

// All configuration lives here — once
const appSafe = createSafe({
  parseError: (e) => ({
    code: e instanceof Error ? e.name : 'UNKNOWN',
    message: e instanceof Error ? e.message : String(e),
  }),
  defaultError: {
    code: 'UNKNOWN',
    message: 'An unknown error occurred',
  },
})
```

Compare how this keeps call sites clean versus the alternative:

```ts
// With createSafe — clean, minimal call sites
const safeFetchUser = appSafe.wrapAsync(fetchUser)
const safeJsonParse = appSafe.wrap(JSON.parse)

const [user, error] = await safeFetchUser(id)      // just a function call
const [config, parseErr] = safeJsonParse(rawJson)   // just a function call
```

```ts
// Without createSafe — noisy, repetitive call sites
const [user, e1] = await safe.async(
  () => fetchUser(id),
  (e) => ({ code: 'ERROR', message: String(e) }) // duplicated everywhere
)
const [config, e2] = safe.sync(
  () => JSON.parse(raw),
  (e) => ({ code: 'ERROR', message: String(e) }) // same mapper, repeated
)
```

The second version works, but every call site is cluttered with configuration that has nothing to do with the business logic. `createSafe` moves all of that out of the way so your code reads like what it actually does.

{% callout title="Multiple instances" type="note" %}
Creating separate `createSafe` instances for different domains is encouraged — e.g., `dbSafe`, `apiSafe`, `authSafe`. Each gets its own error type and hooks. See [createSafe — Multiple instances](/docs/create-safe#multiple-instances).
{% /callout %}

---

## Prefer wrap and wrapAsync

`wrap` and `wrapAsync` are how you get the cleanest possible call sites. Wrap a function once, then call it everywhere like any other function — same arguments, same feel, just with a `[value, error]` return.

```ts
// Wrap once
const safeFetchUser = appSafe.wrapAsync(fetchUser)
const safeJsonParse = appSafe.wrap(JSON.parse)

// Call like a normal function — no lambda, no options, no noise
const [user, error] = await safeFetchUser(id)
const [config, parseErr] = safeJsonParse(rawJson)
```

The inline `appSafe.async(() => ...)` alternative works, but it adds a lambda wrapper at the call site that obscures the actual function call:

```ts
// Works, but the lambda wrapper adds noise and hooks lose argument context
const [user, error] = await appSafe.async(() => fetchUser(id))
```

{% callout title="Hook context" type="note" %}
`wrap` and `wrapAsync` hooks receive the original function arguments as context — useful for logging which user ID failed, caching by key, etc. See [Hooks — Context](/docs/hooks#context-differences).
{% /callout %}

---

## Always provide parseError and defaultError

`parseError` transforms the unknown `catch` value into a structured, typed error — this is what gives you type safety. `defaultError` is the safety net: if `parseError` itself throws, `defaultError` is returned instead, preventing a double-fault.

### Design your error type as a discriminated union

Define a single error type that covers every failure mode in your app. Use a `type` discriminant so consumers can narrow with `switch` or `if` checks:

```ts
type AppError =
  | { type: 'STATUS_CODE'; status: number; message: string }
  | { type: 'FORM_VALIDATION'; fields: Record<string, string[]> }
  | { type: 'UNKNOWN'; message: string }
```

This gives you one consistent shape across HTTP errors, validation errors, and everything else. Callers handle errors with exhaustive `switch` statements and TypeScript narrows the fields for each branch.

### Write a parseError that never throws

Your `parseError` should be a pure mapping function — check from most specific to most general and always return a default at the bottom. Ordering narrow checks first lets a single parser work app-wide:

```ts
// Hypothetical error shapes thrown by your HTTP client and backend
interface HttpError {
  response: { status: number; data?: { errors?: Record<string, string[]> } }
}

function isHttpError(e: unknown): e is HttpError {
  return (
    typeof e === 'object' &&
    e !== null &&
    'response' in e &&
    typeof (e as HttpError).response?.status === 'number'
  )
}

function parseError(e: unknown): AppError {
  // 1. Most narrow — form validation errors from the backend
  if (isHttpError(e) && e.response.data?.errors) {
    return {
      type: 'FORM_VALIDATION',
      fields: e.response.data.errors,
    }
  }

  // 2. Broader — any HTTP status code error
  if (isHttpError(e)) {
    return {
      type: 'STATUS_CODE',
      status: e.response.status,
      message: `Request failed with status ${e.response.status}`,
    }
  }

  // 3. Default — catch-all for anything else
  return {
    type: 'UNKNOWN',
    message: e instanceof Error ? e.message : String(e),
  }
}
```

Notice the pattern: narrow checks first (form validation errors that happen to also be HTTP errors), then broader checks (any HTTP error), then a default. Every path returns — the function never throws.

You can also use Zod to validate the caught error before mapping it:

```ts
import { z } from 'zod'

const HttpErrorSchema = z.object({
  response: z.object({
    status: z.number(),
    data: z
      .object({
        errors: z.record(z.array(z.string())),
      })
      .optional(),
  }),
})

function parseError(e: unknown): AppError {
  // Use Zod to safely parse the error shape
  const httpError = HttpErrorSchema.safeParse(e)

  if (httpError.success) {
    const { response } = httpError.data

    // 1. Most narrow — form validation errors
    if (response.data?.errors) {
      return { type: 'FORM_VALIDATION', fields: response.data.errors }
    }

    // 2. Broader — any HTTP status code error
    return {
      type: 'STATUS_CODE',
      status: response.status,
      message: `Request failed with status ${response.status}`,
    }
  }

  // 3. Default — catch-all for anything else
  return {
    type: 'UNKNOWN',
    message: e instanceof Error ? e.message : String(e),
  }
}
```

Zod's `safeParse` never throws — it returns `{ success: false }` on mismatch, which makes it a natural fit for a `parseError` that should never throw either.

### Wire it into createSafe

Pass the parser and a `defaultError` to `createSafe`. The `defaultError` is a last resort if `parseError` ever does throw despite your best efforts:

```ts
import { createSafe } from '@cometloop/safe'

const appSafe = createSafe({
  parseError,
  defaultError: { type: 'UNKNOWN', message: 'An unexpected error occurred' },
})
```

Now every operation produces `AppError` on failure:

```ts
const safeFetchUser = appSafe.wrapAsync(fetchUser)
const [user, error] = await safeFetchUser(id)

if (error) {
  switch (error.type) {
    case 'STATUS_CODE':
      console.error(`HTTP ${error.status}: ${error.message}`)
      break
    case 'FORM_VALIDATION':
      highlightFields(error.fields)
      break
    case 'UNKNOWN':
      showGenericError(error.message)
      break
  }
}
```

{% callout title="parseError receives unknown" type="warning" %}
The caught value can be anything — a string, number, object, or `Error`. Always handle the non-`Error` case and always end with a default return. See [Error mapping patterns](/docs/error-mapping) and [parseError safety](/docs/error-mapping#parseerror-safety) for more detail.
{% /callout %}

---

## Use parseResult for data validation

`parseResult` is optional but powerful. It transforms the raw success result before it reaches hooks or the return value. The primary use case is runtime validation — ensuring API responses match expected shapes. If `parseResult` throws, the error is routed through the standard error path (`parseError` → `onError` → `onSettled` → `[null, error]`).

```ts
import { createSafe } from '@cometloop/safe'
import { z } from 'zod'

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
})

const apiSafe = createSafe({
  parseError: (e) => ({
    code: 'API_ERROR',
    message: e instanceof Error ? e.message : String(e),
  }),
  defaultError: { code: 'API_ERROR', message: 'Request failed' },
  parseResult: (data) => UserSchema.parse(data),
})

const safeFetchUser = apiSafe.wrapAsync(async (id: string) => {
  const res = await fetch(`/api/users/${id}`)
  return res.json()
})

const [user, error] = await safeFetchUser('123')
// user is typed as { id: number; name: string; email: string }
```

{% callout title="Per-call override" type="note" %}
Per-call `parseResult` overrides the factory default — useful for bypassing validation in specific cases. A failing `parseResult` is treated as an error and goes through the standard error path. See [Result transformation](/docs/result-transformation).
{% /callout %}

---

## Centralize hooks for observability

Logging, analytics, metrics, and error reporting belong at the `createSafe` factory level. Factory hooks run for every operation automatically. Reserve per-call hooks for operation-specific side effects like caching a result or showing a UI notification.

```ts
import { createSafe } from '@cometloop/safe'
import * as Sentry from '@sentry/node'

const appSafe = createSafe({
  parseError: (e) => ({
    code: e instanceof Error ? e.name : 'UNKNOWN',
    message: e instanceof Error ? e.message : String(e),
  }),
  defaultError: { code: 'UNKNOWN', message: 'Unknown error' },

  // Centralized observability — runs for every operation
  onSuccess: (result) => {
    metrics.increment('operation.success')
  },
  onError: (error) => {
    logger.error('Operation failed', { code: error.code })
    Sentry.captureException(new Error(error.message))
    metrics.increment('operation.error', { code: error.code })
  },
  onHookError: (err, hookName) => {
    logger.warn(`Hook "${hookName}" threw`, { error: err })
  },
})
```

Per-call hooks should be the exception, not the rule:

```ts
// Per-call hook for operation-specific side effects
const safeFetchUser = appSafe.wrapAsync(fetchUser, {
  onSuccess: (user, [id]) => {
    cache.set(`user:${id}`, user) // caching is specific to this operation
  },
})
```

Avoid duplicating observability at every call site:

```ts
// Avoid: repeating logging/tracking at every call
const [user, e1] = await appSafe.async(() => fetchUser(id), {
  onError: (err) => { logger.error(err); Sentry.captureException(err) },
})
const [order, e2] = await appSafe.async(() => fetchOrder(id), {
  onError: (err) => { logger.error(err); Sentry.captureException(err) },
})
```

{% callout title="Hook execution order" type="note" %}
Factory hooks always run first, then per-call hooks. See [Hooks](/docs/hooks) and [createSafe — Hook execution order](/docs/create-safe#hook-execution-order).
{% /callout %}

---

## Putting it all together

Here is a complete example combining all the recommendations. Notice how the configuration and the call site are completely separate — the call site looks like a normal function call:

```ts
import { createSafe } from '@cometloop/safe'
import * as Sentry from '@sentry/node'

// --- Configuration (lives in a shared module, e.g. lib/safe.ts) ---

type AppError =
  | { type: 'STATUS_CODE'; status: number; message: string }
  | { type: 'FORM_VALIDATION'; fields: Record<string, string[]> }
  | { type: 'UNKNOWN'; message: string }

function parseError(e: unknown): AppError {
  if (isHttpError(e) && e.response.data?.errors) {
    return { type: 'FORM_VALIDATION', fields: e.response.data.errors }
  }
  if (isHttpError(e)) {
    return {
      type: 'STATUS_CODE',
      status: e.response.status,
      message: `Request failed with status ${e.response.status}`,
    }
  }
  return {
    type: 'UNKNOWN',
    message: e instanceof Error ? e.message : String(e),
  }
}

export const appSafe = createSafe({
  parseError,
  defaultError: { type: 'UNKNOWN', message: 'An unexpected error occurred' },
  onError: (error) => {
    logger.error(error.type, error.message)
    Sentry.captureException(new Error(error.message))
  },
  onHookError: (err, hookName) => {
    logger.warn(`Hook "${hookName}" failed`, err)
  },
})

// Wrap functions once
export const safeFetchUser = appSafe.wrapAsync(fetchUser)
export const safeFetchOrders = appSafe.wrapAsync(fetchOrders)
export const safeParseConfig = appSafe.wrap(JSON.parse)
```

```ts
// --- Call site (your actual business logic) ---
// Clean and minimal — just function calls and error handling

const [user, error] = await safeFetchUser(userId)
if (error) {
  switch (error.type) {
    case 'FORM_VALIDATION':
      highlightFields(error.fields)
      break
    case 'STATUS_CODE':
      showHttpError(error.status)
      break
    case 'UNKNOWN':
      showGenericError(error.message)
      break
  }
}
```

See [createSafe examples](/docs/create-safe-examples) for more real-world patterns.
