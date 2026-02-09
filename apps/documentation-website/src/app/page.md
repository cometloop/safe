---
title: Getting started
---

A TypeScript utility library providing type-safe error handling with the Result pattern. {% .lead %}

{% quick-links %}

{% quick-link title="Installation" icon="installation" href="/docs/installation" description="Install @cometloop/safe and get up and running in minutes." /%}

{% quick-link title="Core API" icon="presets" href="/docs/safe-sync" description="Learn safe.sync, safe.async, safe.wrap, safe.wrapAsync, and createSafe." /%}

{% quick-link title="Retry & Timeout" icon="plugins" href="/docs/retry-support" description="Automatic retry with configurable backoff and timeout/abort support." /%}

{% quick-link title="Types" icon="theming" href="/docs/types" description="Full type reference for SafeResult, SafeHooks, RetryConfig, and more." /%}

{% /quick-links %}

---

## Why @cometloop/safe?

The `safe` utility provides a functional approach to error handling using the Result pattern. Instead of throwing exceptions, functions return a tuple `[result, error]` where exactly one value is non-null.

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

// Instead of try-catch
const [data, error] = safe.sync(() => JSON.parse(jsonString))

if (error) {
  console.error('Parse failed:', error.message)
  return
}

// TypeScript knows `data` is the parsed value here
console.log(data)
```

---

## Next steps

- [Installation](/docs/installation) — add `@cometloop/safe` to your project
- [safe.sync](/docs/safe-sync) — synchronous error handling
- [safe.async](/docs/safe-async) — asynchronous error handling with retry
- [safe.wrap](/docs/safe-wrap) — wrap functions to return SafeResult
- [createSafe](/docs/create-safe) — factory for pre-configured instances
