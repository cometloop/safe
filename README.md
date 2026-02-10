# @cometloop/safe

Type-safe error handling for TypeScript using the Result pattern. Zero dependencies.

Instead of `try/catch`, functions return a `SafeResult` tuple `[value, null]` or `[null, error]` — with full type inference and tagged access via `.ok`, `.value`, and `.error`.

## Installation

```bash
npm install @cometloop/safe
```

## Quick Start

The recommended way to use `@cometloop/safe` is with `createSafe`. Configure error handling once, then every call site stays clean — just a normal function call.

```ts
import { createSafe } from '@cometloop/safe'

// Configure once
const appSafe = createSafe({
  parseError: (e) => ({
    code: e instanceof Error ? e.name : 'UNKNOWN',
    message: e instanceof Error ? e.message : String(e),
  }),
  defaultError: { code: 'UNKNOWN', message: 'An unknown error occurred' },
})

// Wrap your functions
const safeFetchUser = appSafe.wrapAsync(fetchUser)
const safeJsonParse = appSafe.wrap(JSON.parse)

// Call sites are clean — just like calling a normal function
const [user, error] = await safeFetchUser(id)
const [config, parseErr] = safeJsonParse(rawJson)
```

No inline error mappers. No extra options objects. No lambda wrappers. Just call the function and handle the result.

You can also use the standalone API for quick one-off operations:

```ts
import { safe } from '@cometloop/safe'

const [data, error] = safe.sync(() => JSON.parse(jsonString))
const [user, error] = await safe.async(() => fetchUser(id))
```

## API

| Method | Description |
| --- | --- |
| `createSafe(config)` | Create a pre-configured instance — the recommended entry point |
| `safe.wrap(fn)` | Wrap a sync function to return `SafeResult` |
| `safe.wrapAsync(fn)` | Wrap an async function to return `Promise<SafeResult>` |
| `safe.sync(fn)` | Execute a sync function, return `SafeResult` |
| `safe.async(fn)` | Execute an async function, return `Promise<SafeResult>` |
| `safe.all({...})` | Run multiple async operations in parallel, return all or first error |
| `safe.allSettled({...})` | Run multiple async operations in parallel, return all individual results |
| `withObjects(...)` | Convert any result, function, or instance to object-style `{ ok, data, error }` |

All methods support optional `parseError` for custom error types, `parseResult` for result transformation, and lifecycle hooks (`onSuccess`, `onError`, `onSettled`, `onHookError`). Async methods additionally support `retry`, `abortAfter` (timeout), and `onRetry`.

## Features

- **Clean call sites** — configure once with `createSafe`, then call functions normally
- **Result tuples** — `[value, null]` or `[null, error]` with TypeScript narrowing
- **Tagged results** — `.ok`, `.value`, `.error` properties for pattern matching
- **Custom error types** — `parseError` maps caught errors to your domain types
- **Result transformation** — `parseResult` transforms successful values
- **Lifecycle hooks** — `onSuccess`, `onError`, `onSettled`, `onRetry`, `onHookError`
- **Retry with backoff** — configurable retry for async operations
- **Timeout/abort** — `abortAfter` with `AbortSignal` integration
- **Error normalization** — non-`Error` thrown values are automatically normalized
- **Object results** — prefer `{ ok, data, error }` over tuples? Use `withObjects`
- **Zero dependencies**

## Documentation

Full API reference, examples, and guides:

**[https://cometloop.github.io/safe/](https://cometloop.github.io/safe/)**

## License

MIT
