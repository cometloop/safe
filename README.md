# @cometloop/safe

Type-safe error handling for TypeScript using the Result pattern. Zero dependencies.

Instead of `try/catch`, functions return a `SafeResult` tuple `[value, null]` or `[null, error]` — with full type inference and tagged access via `.ok`, `.value`, and `.error`.

## Installation

```bash
npm install @cometloop/safe
```

## Quick Start

```ts
import { safe } from '@cometloop/safe'

// Sync
const [data, error] = safe.sync(() => JSON.parse(jsonString))

if (error) {
  console.error(error.message)
  return
}

console.log(data)

// Async
const [user, error] = await safe.async(() => fetchUser(id))

// Tagged access
const result = safe.sync(() => JSON.parse(jsonString))

if (result.ok) {
  console.log(result.value)
} else {
  console.error(result.error.message)
}
```

## API

| Method | Description |
| --- | --- |
| `safe.sync(fn)` | Execute a sync function, return `SafeResult` |
| `safe.async(fn)` | Execute an async function, return `Promise<SafeResult>` |
| `safe.wrap(fn)` | Wrap a sync function to return `SafeResult` |
| `safe.wrapAsync(fn)` | Wrap an async function to return `Promise<SafeResult>` |
| `safe.all({...})` | Run multiple async operations in parallel, return all or first error |
| `safe.allSettled({...})` | Run multiple async operations in parallel, return all individual results |
| `createSafe(config)` | Create a pre-configured instance with fixed error mapping and hooks |

All methods support optional `parseError` for custom error types, `parseResult` for result transformation, and lifecycle hooks (`onSuccess`, `onError`, `onSettled`, `onHookError`). Async methods additionally support `retry`, `abortAfter` (timeout), and `onRetry`.

## Features

- **Result tuples** — `[value, null]` or `[null, error]` with TypeScript narrowing
- **Tagged results** — `.ok`, `.value`, `.error` properties for pattern matching
- **Custom error types** — `parseError` maps caught errors to your domain types
- **Result transformation** — `parseResult` transforms successful values
- **Lifecycle hooks** — `onSuccess`, `onError`, `onSettled`, `onRetry`, `onHookError`
- **Retry with backoff** — configurable retry for async operations
- **Timeout/abort** — `abortAfter` with `AbortSignal` integration
- **Factory pattern** — `createSafe` for consistent error handling across a module
- **Error normalization** — non-`Error` thrown values are automatically normalized
- **Zero dependencies**

## Documentation

Full API reference, examples, and guides:

**[https://cometloop.github.io/safe/](https://cometloop.github.io/safe/)**

## License

MIT
