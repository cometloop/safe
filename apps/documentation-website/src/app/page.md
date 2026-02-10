---
title: Getting started
---

A TypeScript utility library providing type-safe error handling with the Result pattern. Configure error handling once, then keep every call site clean and minimal — just like calling a normal function. {% .lead %}

{% quick-links %}

{% quick-link title="Installation" icon="installation" href="/docs/installation" description="Install @cometloop/safe and get up and running in minutes." /%}

{% quick-link title="Recommended patterns" icon="presets" href="/docs/recommended-patterns" description="The best way to use @cometloop/safe — createSafe with wrap and wrapAsync." /%}

{% quick-link title="Retry & Timeout" icon="plugins" href="/docs/retry-support" description="Automatic retry with configurable backoff and timeout/abort support." /%}

{% quick-link title="Types" icon="theming" href="/docs/types" description="Full type reference for SafeResult, SafeOk, SafeErr, ok, err, and more." /%}

{% /quick-links %}

---

## Why @cometloop/safe?

Error handling in TypeScript is noisy. Between try-catch blocks, manual type narrowing, and repeated boilerplate, the actual intent of your code gets buried. `@cometloop/safe` fixes this with a simple idea: **configure error handling once, then forget about it at the call site.**

With `createSafe`, you define your error type, error mapping, and observability hooks in one place. Then you wrap your functions and call them normally — no inline options, no lambda wrappers, no repeated configuration. The call site looks like a regular function call that happens to return a `[value, error]` tuple.

- **Clean call sites** — wrap your functions once, call them like any other function
- **Type-safe errors** — TypeScript knows the exact error shape at every call site
- **No try-catch blocks** — flat, composable code that reads top to bottom
- **Explicit error handling** — errors are part of the return type, impossible to forget
- **Automatic retries & timeout** — built-in retry with backoff and AbortSignal support
- **Object results** — prefer `{ ok, data, error }` over tuples? Use [`withObjects`](/docs/object-results)
- **Zero dependencies**

---

## Quick example

The best way to use `@cometloop/safe` is with `createSafe`. Configure once, then every call site is just a function call:

```ts
import { createSafe } from '@cometloop/safe'

// 1. Configure once — error mapping, logging, and hooks live here
const appSafe = createSafe({
  parseError: (e) => ({
    code: e instanceof Error ? e.name : 'UNKNOWN',
    message: e instanceof Error ? e.message : String(e),
  }),
  defaultError: { code: 'UNKNOWN', message: 'An unknown error occurred' },
  onError: (error) => logger.error(error.code, error.message),
})

// 2. Wrap your functions
const safeFetchUser = appSafe.wrapAsync(fetchUser)
const safeJsonParse = appSafe.wrap(JSON.parse)
```

```ts
// 3. Call sites stay clean — just like calling a normal function
const [user, error] = await safeFetchUser(id)

if (error) {
  // error is fully typed — no `unknown`, no manual narrowing
  console.error(error.code, error.message)
  return
}

console.log(user)
```

No inline error mappers. No extra options. No lambda wrappers cluttering your logic. Just call the function and handle the result.

The standalone API is also available for quick one-off operations:

```ts
import { safe } from '@cometloop/safe'

const [data, error] = safe.sync(() => JSON.parse(jsonString))
const [user, error] = await safe.async(() => fetchUser(id))
```

---

## Next steps

- [Installation](/docs/installation) — add `@cometloop/safe` to your project
- [Recommended patterns](/docs/recommended-patterns) — the best way to use this library
- [createSafe](/docs/create-safe) — factory for pre-configured instances
- [Core API](/docs/safe-wrap) — safe.wrap, safe.wrapAsync, safe.sync, safe.async
- [What if I don't like tuples?](/docs/object-results) — use object-style `{ ok, data, error }` results instead
