---
title: Getting started
---

A TypeScript utility library providing type-safe error handling with the Result pattern. {% .lead %}

{% quick-links %}

{% quick-link title="Installation" icon="installation" href="/docs/installation" description="Install @cometloop/safe and get up and running in minutes." /%}

{% quick-link title="Core API" icon="presets" href="/docs/safe-wrap" description="Learn safe.wrap, safe.wrapAsync, safe.sync, safe.async, and createSafe." /%}

{% quick-link title="Retry & Timeout" icon="plugins" href="/docs/retry-support" description="Automatic retry with configurable backoff and timeout/abort support." /%}

{% quick-link title="Types" icon="theming" href="/docs/types" description="Full type reference for SafeResult, SafeOk, SafeErr, ok, err, and more." /%}

{% /quick-links %}

---

## Why @cometloop/safe?

The `safe` utility provides a functional approach to error handling using the Result pattern. Instead of throwing exceptions, functions return a `SafeResult` — a tuple `[value, null]` or `[null, error]` with tagged properties (`.ok`, `.value`, `.error`) for pattern matching.

- **Type-safe error handling** — TypeScript knows the exact error type
- **No try-catch blocks** — Cleaner, more composable code
- **Explicit error handling** — Errors are part of the return type, not hidden
- **Automatic retries** — Built-in retry with configurable backoff for async operations
- **Timeout support** — AbortSignal integration for cancellable operations
- **Factory pattern** — `createSafe` for consistent error handling across your app

---

## Quick example

```ts
import { safe } from '@cometloop/safe'

// Wrap any function to return SafeResult instead of throwing
const safeJsonParse = safe.wrap(JSON.parse)
const [data, error] = safeJsonParse('{"name": "Alice"}')

if (error) {
  console.error('Parse failed:', error.message)
  return
}

console.log(data) // { name: "Alice" }
```

```ts
// Wrap async functions the same way
const safeFetchUser = safe.wrapAsync(async (id: number) => {
  const res = await fetch(`/api/users/${id}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<User>
})

const [user, error] = await safeFetchUser(42)

// Tagged property access works too
const result = await safeFetchUser(42)
if (result.ok) {
  console.log(result.value.name)
} else {
  console.error(result.error.message)
}
```

---

## Next steps

- [Installation](/docs/installation) — add `@cometloop/safe` to your project
- [safe.wrap](/docs/safe-wrap) — wrap sync functions to return SafeResult
- [safe.wrapAsync](/docs/safe-wrap-async) — wrap async functions with retry and timeout
- [createSafe](/docs/create-safe) — factory for pre-configured instances
