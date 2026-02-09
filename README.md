# @cometloop/lib

A TypeScript utility library providing type-safe error handling with the Result pattern.

## Table of Contents

- <a href="#installation">Installation</a>
- <a href="#overview">Overview</a>
- <a href="#project-structure">Project Structure</a>
- <a href="#api-reference">API Reference</a>
  - <a href="#safesync">safe.sync</a>
  - <a href="#safeasync">safe.async</a>
  - <a href="#safewrap">safe.wrap</a>
  - <a href="#safewrapasync">safe.wrapAsync</a>
  - <a href="#safeall">safe.all</a>
  - <a href="#safeallsettled">safe.allSettled</a>
  - <a href="#createsafe">createSafe (Factory)</a>
- <a href="#retry-support">Retry Support</a>
  - <a href="#retry-configuration">Retry Configuration</a>
  - <a href="#retry-with-safeasync">Retry with safe.async</a>
  - <a href="#retry-with-safewrapasync">Retry with safe.wrapAsync</a>
  - <a href="#retry-with-createsafe">Retry with createSafe</a>
  - <a href="#exponential-backoff">Exponential Backoff</a>
- <a href="#timeout-abort-support">Timeout/Abort Support</a>
  - <a href="#abortafter-configuration">abortAfter Configuration</a>
  - <a href="#timeout-with-safeasync">Timeout with safe.async</a>
  - <a href="#timeout-with-safewrapasync">Timeout with safe.wrapAsync</a>
  - <a href="#timeout-with-createsafe">Timeout with createSafe</a>
  - <a href="#timeout-with-retry">Timeout with Retry</a>
  - <a href="#using-abortsignal">Using AbortSignal</a>
- <a href="#types">Types</a>
- <a href="#hooks">Hooks</a>
- <a href="#result-transformation">Result Transformation (parseResult)</a>
- <a href="#real-world-examples">Real-World Examples</a>
  - <a href="#json-parsing">JSON Parsing</a>
  - <a href="#api-requests">API Requests</a>
  - <a href="#form-validation">Form Validation</a>
  - <a href="#file-operations">File Operations</a>
  - <a href="#database-operations">Database Operations</a>
  - <a href="#authentication">Authentication</a>
- <a href="#createsafe-real-world-examples">createSafe Real-World Examples</a>
  - <a href="#application-wide-error-handling">Application-Wide Error Handling</a>
  - <a href="#api-layer-with-logging">API Layer with Logging</a>
  - <a href="#database-layer">Database Layer</a>
  - <a href="#third-party-integrations">Third-Party Integrations</a>
  - <a href="#multi-tenant-applications">Multi-Tenant Applications</a>
- <a href="#error-mapping-patterns">Error Mapping Patterns</a>
- <a href="#comparison-with-try-catch">Comparison with try-catch</a>

---

<h2 id="installation">Installation</h2>

```bash
pnpm add @cometloop/lib
```

---

<h2 id="overview">Overview</h2>

The `safe` utility provides a functional approach to error handling using the Result pattern. Instead of throwing exceptions, functions return a tuple `[result, error]` where exactly one value is non-null.

**Key Benefits:**

- **Type-safe error handling** - TypeScript knows the exact error type
- **No try-catch blocks** - Cleaner, more composable code
- **Explicit error handling** - Errors are part of the return type, not hidden
- **Automatic parameter type preservation** - Wrapped functions maintain their original signatures

```typescript
import { safe } from '@cometloop/lib'

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

<h2 id="project-structure">Project Structure</h2>

The safe module is organized into separate files for better maintainability:

```
src/
├── index.ts              # Main entry point (re-exports all)
└── safe/
    ├── index.ts          # Barrel exports
    ├── types.ts          # Type definitions (SafeResult, SafeHooks, SafeAsyncHooks, RetryConfig, TimeoutError, etc.)
    ├── safe.ts           # Core functions (sync, async, wrap, wrapAsync, all, allSettled) with retry and timeout support
    ├── createSafe.ts     # Factory function for pre-configured instances
    ├── safe.test.ts      # Tests for core functions (265 tests)
    └── createSafe.test.ts # Tests for factory function (145 tests)
```

| File                                    | Description                                                                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [types.ts](src/safe/types.ts)           | Type definitions: `SafeResult`, `SafeHooks`, `SafeAsyncHooks`, `RetryConfig`, `TimeoutError`, `CreateSafeConfig`, `SafeInstance`  |
| [safe.ts](src/safe/safe.ts)             | Core safe utilities: `sync`, `async`, `wrap`, `wrapAsync`, `all`, `allSettled` with retry and timeout support                     |
| [createSafe.ts](src/safe/createSafe.ts) | Factory function for creating pre-configured safe instances                                                                      |
| [index.ts](src/safe/index.ts)           | Barrel file that re-exports everything for backward compatibility                                                                |

---

<h2 id="api-reference">API Reference</h2>

<h3 id="safesync">safe.sync</h3>

Executes a synchronous function and returns a `SafeResult` tuple.

**Signatures:**

```typescript
safe.sync<T>(fn: () => T): SafeResult<T, Error>
safe.sync<T>(fn: () => T, hooks: SafeHooks<T, Error, []>): SafeResult<T, Error>
safe.sync<T, E>(fn: () => T, parseError: (e: unknown) => E): SafeResult<T, E>
safe.sync<T, E>(fn: () => T, parseError: (e: unknown) => E, hooks: SafeHooks<T, E, []>): SafeResult<T, E>
```

**Examples:**

```typescript
// 1. Basic
const [result, error] = safe.sync(() => JSON.parse('{"name": "John"}'))

if (error) {
  console.error('Parse failed:', error.message)
  return
}
console.log(result) // { name: "John" }

// 2. With error mapping
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

// 3. With hooks
const [result, error] = safe.sync(() => computeExpensiveValue(), {
  onSuccess: (value, []) => console.log('Computed:', value),
  onError: (error, []) => reportToSentry(error),
})

// 4. With error mapping and hooks
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

---

<h3 id="safeasync">safe.async</h3>

Executes an asynchronous function and returns a `Promise<SafeResult>` tuple. **Supports automatic retry with configurable backoff.**

**Signatures:**

```typescript
safe.async<T>(fn: () => Promise<T>): Promise<SafeResult<T, Error>>
safe.async<T>(fn: () => Promise<T>, hooks: SafeAsyncHooks<T, Error, []>): Promise<SafeResult<T, Error>>
safe.async<T, E>(fn: () => Promise<T>, parseError: (e: unknown) => E): Promise<SafeResult<T, E>>
safe.async<T, E>(fn: () => Promise<T>, parseError: (e: unknown) => E, hooks: SafeAsyncHooks<T, E, []>): Promise<SafeResult<T, E>>
```

**Examples:**

```typescript
// 1. Basic
const [user, error] = await safe.async(() => fetchUser(userId))

if (error) {
  console.error('Fetch failed:', error.message)
  return
}
console.log(user) // user is typed

// 2. With error mapping
type ApiError = { type: string; statusCode: number; message: string }

const [data, error] = await safe.async(
  () =>
    fetch('/api/data').then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    }),
  (e): ApiError => ({
    type: 'NETWORK_ERROR',
    statusCode: 500,
    message: e instanceof Error ? e.message : 'Unknown error',
  })
)

if (error) {
  console.error(error.type, error.statusCode) // error is typed as ApiError
}

// 3. With hooks
const [user, error] = await safe.async(() => fetchUser(userId), {
  onSuccess: (user, []) => console.log('Fetched user:', user.name),
  onError: (error, []) => reportToSentry(error),
})

// 4. With error mapping and hooks
const [result, error] = await safe.async(
  () => processPayment(amount),
  (e): PaymentError => ({ code: 'PAYMENT_FAILED', message: String(e) }),
  {
    onSuccess: (receipt, []) => {
      analytics.track('payment_success', { amount: receipt.amount })
    },
    onError: (error, []) => {
      analytics.track('payment_failed', { code: error.code })
      alertOpsTeam(error)
    },
  }
)

// 5. With retry support (see Retry Support section for details)
const [data, error] = await safe.async(() => fetchWithRetry('/api/data'), {
  retry: { times: 3, waitBefore: (attempt) => attempt * 1000 },
  onRetry: (error, attempt, []) => {
    console.log(`Attempt ${attempt} failed, retrying...`)
  },
})
```

---

<h3 id="safewrap">safe.wrap</h3>

Wraps a synchronous function to return `SafeResult` instead of throwing. **Automatically preserves function parameter types.**

**Signatures:**

```typescript
safe.wrap<TArgs, T>(fn: (...args: TArgs) => T): (...args: TArgs) => SafeResult<T, Error>
safe.wrap<TArgs, T>(fn: (...args: TArgs) => T, hooks: SafeHooks<T, Error, TArgs>): (...args: TArgs) => SafeResult<T, Error>
safe.wrap<TArgs, T, E>(fn: (...args: TArgs) => T, parseError: (e: unknown) => E): (...args: TArgs) => SafeResult<T, E>
safe.wrap<TArgs, T, E>(fn: (...args: TArgs) => T, parseError: (e: unknown) => E, hooks: SafeHooks<T, E, TArgs>): (...args: TArgs) => SafeResult<T, E>
```

**Examples:**

```typescript
// Setup: a function that can throw
const divide = (a: number, b: number) => {
  if (b === 0) throw new Error('Division by zero')
  return a / b
}

// 1. Basic
const safeDivide = safe.wrap(divide)
const [result, error] = safeDivide(10, 2) // Types inferred automatically!

if (error) {
  console.error('Division failed:', error.message)
  return
}
console.log(result) // 5

// Also works with built-in functions
const safeJsonParse = safe.wrap(JSON.parse)
const [data, error] = safeJsonParse('{"valid": true}')

// 2. With error mapping
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

// 3. With hooks - context contains the original arguments
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

// 4. With error mapping and hooks
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

---

<h3 id="safewrapasync">safe.wrapAsync</h3>

Wraps an asynchronous function to return `Promise<SafeResult>` instead of throwing. **Automatically preserves function parameter types. Supports automatic retry with configurable backoff.**

**Signatures:**

```typescript
safe.wrapAsync<TArgs, T>(fn: (...args: TArgs) => Promise<T>): (...args: TArgs) => Promise<SafeResult<T, Error>>
safe.wrapAsync<TArgs, T>(fn: (...args: TArgs) => Promise<T>, hooks: SafeAsyncHooks<T, Error, TArgs>): (...args: TArgs) => Promise<SafeResult<T, Error>>
safe.wrapAsync<TArgs, T, E>(fn: (...args: TArgs) => Promise<T>, parseError: (e: unknown) => E): (...args: TArgs) => Promise<SafeResult<T, E>>
safe.wrapAsync<TArgs, T, E>(fn: (...args: TArgs) => Promise<T>, parseError: (e: unknown) => E, hooks: SafeAsyncHooks<T, E, TArgs>): (...args: TArgs) => Promise<SafeResult<T, E>>
```

**Examples:**

```typescript
// Setup: an async function that can throw
const fetchUser = async (id: number) => {
  const response = await fetch(`/api/users/${id}`)
  if (!response.ok) throw new Error(`User ${id} not found`)
  return response.json() as Promise<User>
}

// 1. Basic
const safeFetchUser = safe.wrapAsync(fetchUser)
const [user, error] = await safeFetchUser(42) // Types inferred automatically!

if (error) {
  console.error('Fetch failed:', error.message)
  return
}
console.log(user.name) // user is typed as User

// 2. With error mapping
type ApiError = {
  statusCode: number
  message: string
  endpoint: string
}

const safeFetchUser = safe.wrapAsync(
  fetchUser,
  (e): ApiError => ({
    statusCode:
      e instanceof Error && e.message.includes('not found') ? 404 : 500,
    message: e instanceof Error ? e.message : 'Unknown error',
    endpoint: '/api/users',
  })
)

const [user, error] = await safeFetchUser(42)
if (error) {
  // error is typed as ApiError
  if (error.statusCode === 404) {
    showNotFound()
  } else {
    showServerError(error.message)
  }
}

// 3. With hooks - context contains the original arguments
const safeFetchUser = safe.wrapAsync(fetchUser, {
  onSuccess: (user, [id]) => {
    console.log(`Fetched user ${id}:`, user.name)
    cache.set(`user:${id}`, user)
  },
  onError: (error, [id]) => {
    console.error(`Failed to fetch user ${id}:`, error.message)
    metrics.increment('user_fetch_error')
  },
})

await safeFetchUser(42) // logs: "Fetched user 42: John"
await safeFetchUser(999) // logs: "Failed to fetch user 999: User 999 not found"

// 4. With error mapping and hooks
const safeFetchUser = safe.wrapAsync(
  fetchUser,
  (e): ApiError => ({
    statusCode: 500,
    message: e instanceof Error ? e.message : 'Unknown error',
    endpoint: '/api/users',
  }),
  {
    onSuccess: (user, [id]) => {
      analytics.track('user_fetched', { userId: id })
      logger.info(`User ${id} fetched successfully`)
    },
    onError: (error, [id]) => {
      // error is typed as ApiError here
      analytics.track('user_fetch_failed', {
        userId: id,
        statusCode: error.statusCode,
      })
      logger.error(`Failed to fetch user ${id}`, {
        endpoint: error.endpoint,
        message: error.message,
      })
    },
  }
)

// 5. With retry support (see Retry Support section for details)
const safeFetchWithRetry = safe.wrapAsync(fetchUser, {
  retry: { times: 3, waitBefore: (attempt) => attempt * 1000 },
  onRetry: (error, attempt, [id]) => {
    console.log(`Retry ${attempt} for user ${id}: ${error.message}`)
  },
})

const [user, error] = await safeFetchWithRetry(42)
```

---

<h3 id="safeall">safe.all</h3>

Runs multiple safe-wrapped async operations in parallel. Returns all unwrapped values as a named object on success, or the first error on failure.

**Signature:**

```typescript
safe.all<T extends Record<string, Promise<SafeResult<any, any>>>>(
  promises: T
): Promise<SafeResult<
  { [K in keyof T]: T[K] extends Promise<SafeResult<infer V, any>> ? V : never },
  T[keyof T] extends Promise<SafeResult<any, infer E>> ? E : never
>>
```

**Examples:**

```typescript
// 1. Basic — all succeed
const [data, error] = await safe.all({
  user: safe.async(() => fetchUser(userId)),
  posts: safe.async(() => fetchPosts(userId)),
})

if (error) {
  console.error('Something failed:', error.message)
  return
}

console.log(data.user)  // User
console.log(data.posts) // Post[]

// 2. First error is returned
const [data, error] = await safe.all({
  user: safe.async(() => fetchUser(userId)),
  posts: safe.async(() => Promise.reject(new Error('posts failed'))),
})

if (error) {
  console.error(error.message) // "posts failed"
}

// 3. With per-operation error mapping
const [data, error] = await safe.all({
  config: safe.async(() => loadConfig()),
  user: safe.async(
    () => fetchUser(userId),
    (e) => ({ code: 'USER_ERROR', message: String(e) })
  ),
})

// 4. With createSafe instance
const appSafe = createSafe({ parseError: (e) => toAppError(e) })

const [data, error] = await appSafe.all({
  user: appSafe.async(() => fetchUser(userId)),
  posts: appSafe.async(() => fetchPosts(userId)),
})
```

---

<h3 id="safeallsettled">safe.allSettled</h3>

Runs multiple safe-wrapped async operations in parallel. Always returns all individual results as named `SafeResult` entries — never fails at the group level.

**Signature:**

```typescript
safe.allSettled<T extends Record<string, Promise<SafeResult<any, any>>>>(
  promises: T
): Promise<{ [K in keyof T]: Awaited<T[K]> }>
```

**Examples:**

```typescript
// 1. Basic — inspect each result independently
const results = await safe.allSettled({
  user: safe.async(() => fetchUser(userId)),
  posts: safe.async(() => fetchPosts(userId)),
})

if (results.user.ok) {
  console.log(results.user.value) // User
}

if (!results.posts.ok) {
  console.error(results.posts.error) // Error
}

// 2. Mixed success and failure
const results = await safe.allSettled({
  config: safe.async(() => loadConfig()),
  user: safe.async(() => fetchUser(userId)),
  analytics: safe.async(() => trackEvent('page_view')),
})

// Each result is independent — failures don't affect other results
if (!results.analytics.ok) {
  // analytics failed, but config and user may have succeeded
  console.warn('Analytics failed:', results.analytics.error)
}

// 3. With destructured tuple access
const results = await safe.allSettled({
  a: safe.async(() => Promise.resolve(42)),
  b: safe.async(() => Promise.reject(new Error('fail'))),
})

const [aValue, aError] = results.a // [42, null]
const [bValue, bError] = results.b // [null, Error]

// 4. With createSafe instance
const appSafe = createSafe({ parseError: (e) => toAppError(e) })

const results = await appSafe.allSettled({
  user: appSafe.async(() => fetchUser(userId)),
  posts: appSafe.async(() => fetchPosts(userId)),
})
```

---

<h3 id="createsafe">createSafe (Factory)</h3>

Creates a pre-configured safe instance with a fixed error mapping function and optional default hooks. The error type is automatically inferred from the `parseError` return type.

**Use this when:**

- You want consistent error mapping across multiple operations
- You need default logging/analytics hooks for all operations
- You want to avoid repeating `parseError` on every call

**Signature:**

```typescript
function createSafe<E, TResult = never>(
  config: CreateSafeConfig<E, TResult>
): SafeInstance<E, TResult>

type CreateSafeConfig<E, TResult = never> = {
  parseError: (e: unknown) => E            // Required: transforms caught errors
  parseResult?: (result: unknown) => TResult // Optional: transforms successful results
  onSuccess?: (result: unknown) => void    // Optional: called on every success
  onError?: (error: E) => void             // Optional: called on every error
  onRetry?: (error: E, attempt: number) => void // Optional: called before each retry (async only)
  retry?: RetryConfig                      // Optional: default retry configuration (async only)
  abortAfter?: number                      // Optional: default timeout (async only)
}
```

**Examples:**

```typescript
import { createSafe } from '@cometloop/lib'

// 1. Basic: Create an instance with typed errors
type AppError = {
  code: string
  message: string
  timestamp: Date
}

const appSafe = createSafe({
  parseError: (e): AppError => ({
    code: 'UNKNOWN_ERROR',
    message: e instanceof Error ? e.message : 'An unknown error occurred',
    timestamp: new Date(),
  }),
})

// All methods now return AppError on failure - no need to pass parseError each time
const [data, error] = appSafe.sync(() => JSON.parse(jsonString))
if (error) {
  console.error(error.code, error.message) // error is typed as AppError
}

const [user, err] = await appSafe.async(() => fetchUser(id))
if (err) {
  console.error(err.code) // err is typed as AppError
}

// 2. With default hooks: Global logging for all operations
const loggingSafe = createSafe({
  parseError: (e): AppError => ({
    code: 'ERROR',
    message: e instanceof Error ? e.message : String(e),
    timestamp: new Date(),
  }),
  onSuccess: (result) => {
    console.log('Operation succeeded:', result)
    analytics.track('operation_success')
  },
  onError: (error) => {
    console.error('Operation failed:', error.code)
    analytics.track('operation_failed', { code: error.code })
    Sentry.captureException(error)
  },
})

// Default hooks are called automatically
loggingSafe.sync(() => processData()) // logs success or error

// 3. Per-call hooks: Override or extend default behavior
const [result, error] = loggingSafe.sync(() => riskyOperation(), {
  // Per-call hooks run AFTER default hooks
  onSuccess: (result, []) => {
    // result is fully typed
    cache.set('result', result)
  },
  onError: (error, []) => {
    // error is typed as AppError
    showUserNotification(error.message)
  },
})

// 4. Wrapping functions with the factory
const apiSafe = createSafe({
  parseError: (e) => ({
    type: 'API_ERROR' as const,
    status: 500,
    message: e instanceof Error ? e.message : 'Request failed',
  }),
  onError: (error) => metrics.increment('api_error', { type: error.type }),
})

// Wrap functions - they inherit the configured parseError
const safeFetch = apiSafe.wrapAsync(async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
})

const [data, error] = await safeFetch('/api/users')
// error is typed as { type: 'API_ERROR'; status: number; message: string }

// 5. Multiple instances for different contexts
const dbSafe = createSafe({
  parseError: (e) => ({
    type: 'DB_ERROR' as const,
    query: 'unknown',
    message: e instanceof Error ? e.message : String(e),
  }),
})

const authSafe = createSafe({
  parseError: (e) => ({
    type: 'AUTH_ERROR' as const,
    code: e instanceof TokenExpiredError ? 'EXPIRED' : 'INVALID',
    message: e instanceof Error ? e.message : 'Authentication failed',
  }),
})

// Each instance has its own error type
const [user, dbError] = await dbSafe.async(() => db.user.findById(id))
const [token, authError] = authSafe.sync(() => verifyToken(jwt))
// dbError is { type: 'DB_ERROR'; ... }
// authError is { type: 'AUTH_ERROR'; ... }
```

**Hook Execution Order:**

When both default hooks (from config) and per-call hooks are provided, they execute in order:

1. Default hook (from `createSafe` config)
2. Per-call hook (from method call)

```typescript
const appSafe = createSafe({
  parseError: (e) => String(e),
  onSuccess: () => console.log('1. Default hook'),
})

appSafe.sync(() => 'result', {
  onSuccess: () => console.log('2. Per-call hook'),
})

// Output:
// 1. Default hook
// 2. Per-call hook
```

**Type Inference:**

The error type `E` is automatically inferred from the `parseError` return type:

```typescript
// Error type is inferred as { code: string; message: string }
const appSafe = createSafe({
  parseError: (e) => ({
    code: 'ERR',
    message: e instanceof Error ? e.message : 'Unknown',
  }),
})

// Per-call hooks receive the correctly typed error
appSafe.sync(
  () => {
    throw new Error('fail')
  },
  {
    onError: (error) => {
      // TypeScript knows: error.code is string, error.message is string
      console.log(error.code, error.message)
    },
  }
)
```

---

<h2 id="retry-support">Retry Support</h2>

The `safe.async` and `safe.wrapAsync` functions support automatic retry with configurable backoff. This is useful for handling transient failures like network timeouts, rate limits, or temporary service unavailability.

<h3 id="retry-configuration">Retry Configuration</h3>

```typescript
type RetryConfig = {
  times: number // Number of retry attempts (not including initial)
  waitBefore?: (attempt: number) => number // Returns ms to wait before retry (1-indexed)
}
```

**Key behaviors:**

- `times` specifies the number of **retry** attempts, not total attempts. With `times: 3`, you get 4 total attempts (1 initial + 3 retries)
- `waitBefore` receives a **1-indexed** attempt number (first retry = 1, second retry = 2, etc.)
- `onRetry` hook is called **before** each retry, not after the final failure
- `onError` hook is only called **after all retries are exhausted**

---

<h3 id="retry-with-safeasync">Retry with safe.async</h3>

```typescript
import { safe } from '@cometloop/lib'

// Basic retry - 3 retries with no delay
const [data, error] = await safe.async(() => fetchUnstableApi(), {
  retry: { times: 3 },
})

// Retry with fixed delay
const [data, error] = await safe.async(() => fetchUnstableApi(), {
  retry: {
    times: 3,
    waitBefore: () => 1000, // Wait 1 second before each retry
  },
})

// Retry with logging
const [data, error] = await safe.async(() => fetchUnstableApi(), {
  retry: { times: 3 },
  onRetry: (error, attempt, []) => {
    console.log(`Attempt ${attempt} failed: ${error.message}. Retrying...`)
  },
  onError: (error, []) => {
    console.error(`All attempts failed: ${error.message}`)
  },
})

// Retry with error mapping
const [data, error] = await safe.async(
  () => fetchUnstableApi(),
  (e) => ({ code: 'API_ERROR', message: String(e) }),
  {
    retry: { times: 2 },
    onRetry: (error, attempt, []) => {
      // error is typed as { code: string; message: string }
      console.log(`Retry ${attempt}: ${error.code}`)
    },
  }
)
```

---

<h3 id="retry-with-safewrapasync">Retry with safe.wrapAsync</h3>

```typescript
import { safe } from '@cometloop/lib'

// Wrap a function with retry logic
const fetchWithRetry = safe.wrapAsync(
  async (url: string) => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },
  {
    retry: { times: 3, waitBefore: (attempt) => attempt * 500 },
    onRetry: (error, attempt, [url]) => {
      console.log(`Retry ${attempt} for ${url}`)
    },
  }
)

// Each call gets its own independent retry attempts
const [data1, error1] = await fetchWithRetry('/api/users')
const [data2, error2] = await fetchWithRetry('/api/orders')

// With error mapping and retry
type ApiError = { code: string; message: string; retryable: boolean }

const safeFetch = safe.wrapAsync(
  async (url: string) => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },
  (e): ApiError => ({
    code: 'FETCH_ERROR',
    message: e instanceof Error ? e.message : 'Unknown error',
    retryable: true,
  }),
  {
    retry: { times: 2 },
    onRetry: (error, attempt, [url]) => {
      if (error.retryable) {
        console.log(`Retrying ${url} (attempt ${attempt})`)
      }
    },
  }
)
```

---

<h3 id="retry-with-createsafe">Retry with createSafe</h3>

The `createSafe` factory supports default retry configuration that applies to all `async` and `wrapAsync` calls.

```typescript
import { createSafe } from '@cometloop/lib'

// Create instance with default retry for all async operations
const apiSafe = createSafe({
  parseError: (e) => ({
    code: 'API_ERROR',
    message: e instanceof Error ? e.message : 'Unknown',
  }),
  retry: {
    times: 3,
    waitBefore: (attempt) => attempt * 1000, // 1s, 2s, 3s
  },
  onRetry: (error, attempt) => {
    console.log(`Default retry ${attempt}: ${error.code}`)
  },
})

// All async calls use the default retry config
const [users, error] = await apiSafe.async(() => fetchUsers())
const safeFetch = apiSafe.wrapAsync(fetchJson)

// Per-call retry COMPLETELY OVERRIDES the default
const [data, error] = await apiSafe.async(() => criticalOperation(), {
  retry: { times: 5 }, // Overrides default times: 3
})

// Disable retry for a specific call
const [result, error] = await apiSafe.async(() => oneTimeOperation(), {
  retry: { times: 0 }, // No retries
})

// Both default and per-call onRetry hooks are called
const [data, error] = await apiSafe.async(() => fetchData(), {
  onRetry: (error, attempt, []) => {
    // Called AFTER default onRetry
    customMetrics.track('retry', { attempt })
  },
})
```

**Hook merging behavior:**

- `onSuccess`: Default hook called first, then per-call hook
- `onError`: Default hook called first, then per-call hook
- `onRetry`: Default hook called first, then per-call hook
- `retry`: Per-call config **completely overrides** default config (not merged)

---

<h3 id="exponential-backoff">Exponential Backoff</h3>

Common retry patterns using `waitBefore`:

```typescript
// Linear backoff: 1s, 2s, 3s, 4s...
const linearBackoff = (attempt: number) => attempt * 1000

// Exponential backoff: 1s, 2s, 4s, 8s...
const exponentialBackoff = (attempt: number) => Math.pow(2, attempt - 1) * 1000

// Exponential with jitter (recommended for distributed systems)
const exponentialWithJitter = (attempt: number) => {
  const base = Math.pow(2, attempt - 1) * 1000
  const jitter = Math.random() * 500 // 0-500ms random jitter
  return base + jitter
}

// Capped exponential: grows but caps at 30s
const cappedExponential = (attempt: number) =>
  Math.min(Math.pow(2, attempt - 1) * 1000, 30000)

// Usage
const [data, error] = await safe.async(() => fetchData(), {
  retry: { times: 5, waitBefore: exponentialWithJitter },
  onRetry: (error, attempt, []) => {
    console.log(`Retry ${attempt} after backoff`)
  },
})
```

---

<h2 id="timeout-abort-support">Timeout/Abort Support</h2>

The `safe.async` and `safe.wrapAsync` functions support automatic timeout with `AbortSignal` integration. This is useful for preventing operations from hanging indefinitely and for implementing cancellable requests.

<h3 id="abortafter-configuration">abortAfter Configuration</h3>

The `abortAfter` option specifies a timeout in milliseconds. When the timeout is reached:

1. A `TimeoutError` is thrown (which can be transformed via `parseError`)
2. The `AbortController` is aborted, signaling to the function that it should cancel
3. If retry is configured, each attempt gets its own fresh timeout

```typescript
import { safe, TimeoutError } from '@cometloop/lib'

// Basic timeout - operation must complete within 5 seconds
const [data, error] = await safe.async(() => fetchSlowApi(), {
  abortAfter: 5000,
})

if (error instanceof TimeoutError) {
  console.log('Operation timed out')
}
```

**Key behaviors:**

- `abortAfter` specifies milliseconds before timeout
- A fresh `AbortController` is created for each attempt (including retries)
- The `AbortSignal` is passed to the function as an optional parameter
- Functions can use the signal to actually cancel in-flight operations (e.g., `fetch`)
- `TimeoutError` is thrown when timeout occurs, which can be transformed via `parseError`

---

<h3 id="timeout-with-safeasync">Timeout with safe.async</h3>

```typescript
import { safe, TimeoutError } from '@cometloop/lib'

// Basic timeout
const [data, error] = await safe.async(() => slowOperation(), {
  abortAfter: 5000,
})

// With error mapping
const [data, error] = await safe.async(
  () => slowOperation(),
  (e) => ({
    code: e instanceof TimeoutError ? 'TIMEOUT' : 'UNKNOWN',
    message: e instanceof Error ? e.message : 'Unknown error',
  }),
  { abortAfter: 5000 }
)

if (error?.code === 'TIMEOUT') {
  console.log('Operation timed out after 5 seconds')
}

// Using the AbortSignal in your function
const [data, error] = await safe.async(
  (signal) => fetch('/api/data', { signal }),
  { abortAfter: 5000 }
)
```

---

<h3 id="timeout-with-safewrapasync">Timeout with safe.wrapAsync</h3>

```typescript
import { safe, TimeoutError } from '@cometloop/lib'

// Wrap a function with timeout
const safeFetch = safe.wrapAsync(
  async (url: string) => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },
  { abortAfter: 10000 }
)

const [data, error] = await safeFetch('/api/users')

// With AbortSignal passed to the function
// When abortAfter is configured, an AbortSignal is appended as the last argument
const safeFetchWithSignal = safe.wrapAsync(
  async (url: string, options?: RequestInit, signal?: AbortSignal) => {
    const res = await fetch(url, { ...options, signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },
  { abortAfter: 10000 }
)

// The signal is automatically passed when timeout is configured
const [data, error] = await safeFetchWithSignal('/api/users', { method: 'GET' })

// With error mapping and timeout
type ApiError = { code: string; message: string }

const safeFetch = safe.wrapAsync(
  async (url: string) => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },
  (e): ApiError => ({
    code: e instanceof TimeoutError ? 'TIMEOUT' : 'FETCH_ERROR',
    message: e instanceof Error ? e.message : 'Unknown error',
  }),
  { abortAfter: 10000 }
)
```

---

<h3 id="timeout-with-createsafe">Timeout with createSafe</h3>

The `createSafe` factory supports a default `abortAfter` configuration that applies to all `async` and `wrapAsync` calls.

```typescript
import { createSafe, TimeoutError } from '@cometloop/lib'

// Create instance with default timeout for all async operations
const apiSafe = createSafe({
  parseError: (e) => ({
    code: e instanceof TimeoutError ? 'TIMEOUT' : 'API_ERROR',
    message: e instanceof Error ? e.message : 'Unknown',
  }),
  abortAfter: 10000, // Default 10s timeout for all async operations
})

// All async calls use the default timeout
const [users, error] = await apiSafe.async(() => fetchUsers())

const safeFetch = apiSafe.wrapAsync(fetchJson)
const [data, error] = await safeFetch('/api/data')

// Per-call timeout OVERRIDES the default
const [data, error] = await apiSafe.async(
  () => slowOperation(),
  { abortAfter: 30000 } // Override: 30 seconds instead of 10
)

// Disable timeout for a specific call
const [result, error] = await apiSafe.async(
  () => longRunningTask(),
  { abortAfter: undefined } // Note: explicitly set to undefined to disable
)
```

---

<h3 id="timeout-with-retry">Timeout with Retry</h3>

When both `abortAfter` and `retry` are configured, each retry attempt gets its own fresh timeout. This is per-attempt timeout, not total timeout.

```typescript
import { safe, TimeoutError } from '@cometloop/lib'

// Each attempt gets 5 seconds, up to 3 retries (4 total attempts)
// Total maximum time: 4 × 5 seconds = 20 seconds
const [data, error] = await safe.async(
  (signal) => fetch('/api/data', { signal }),
  {
    abortAfter: 5000,
    retry: { times: 3 },
    onRetry: (error, attempt, []) => {
      if (error instanceof TimeoutError) {
        console.log(`Attempt ${attempt} timed out, retrying...`)
      }
    },
  }
)

// With createSafe - default timeout and retry
const apiSafe = createSafe({
  parseError: (e) => ({
    type: e instanceof TimeoutError ? 'timeout' : 'error',
    message: e instanceof Error ? e.message : 'Unknown',
  }),
  abortAfter: 5000,
  retry: { times: 2 },
  onRetry: (error, attempt) => {
    console.log(`Retry ${attempt}: ${error.type}`)
  },
})

// Each call gets 3 attempts (1 initial + 2 retries), each with 5s timeout
const [data, error] = await apiSafe.async(() => fetchData())
```

---

<h3 id="using-abortsignal">Using AbortSignal</h3>

When `abortAfter` is configured, an `AbortSignal` is passed to your function. You can use this signal to actually cancel in-flight operations.

**For `safe.async`:**

The signal is passed as the first parameter to your function:

```typescript
import { safe } from '@cometloop/lib'

// Function receives signal as first parameter
const [data, error] = await safe.async(
  (signal) => {
    // Pass signal to fetch to enable cancellation
    return fetch('/api/data', { signal })
  },
  { abortAfter: 5000 }
)

// The signal can be used with any AbortSignal-compatible API
const [result, error] = await safe.async(
  async (signal) => {
    const controller = new AbortController()

    // Link the safe signal to your own controller
    signal?.addEventListener('abort', () => controller.abort())

    // Use your controller with multiple operations
    const [users, orders] = await Promise.all([
      fetch('/api/users', { signal: controller.signal }),
      fetch('/api/orders', { signal: controller.signal }),
    ])

    return { users: await users.json(), orders: await orders.json() }
  },
  { abortAfter: 10000 }
)
```

**For `safe.wrapAsync`:**

When `abortAfter` is configured, the signal is appended as an additional argument:

```typescript
import { safe } from '@cometloop/lib'

// Define function that accepts signal as last parameter
async function fetchWithSignal(
  url: string,
  options?: RequestInit,
  signal?: AbortSignal
) {
  const res = await fetch(url, { ...options, signal })
  return res.json()
}

// Wrap with timeout - signal will be passed automatically
const safeFetch = safe.wrapAsync(fetchWithSignal, { abortAfter: 5000 })

// Call without signal - it's added automatically when timeout is configured
const [data, error] = await safeFetch('/api/users', { method: 'GET' })
```

**TimeoutError class:**

```typescript
import { TimeoutError } from '@cometloop/lib'

// TimeoutError is a subclass of Error
const error = new TimeoutError(5000)
console.log(error.name) // 'TimeoutError'
console.log(error.message) // 'Operation timed out after 5000ms'
console.log(error instanceof Error) // true
console.log(error instanceof TimeoutError) // true

// Use in error mapping
const parseError = (e: unknown) => {
  if (e instanceof TimeoutError) {
    return { code: 'TIMEOUT', retryable: true }
  }
  return { code: 'ERROR', retryable: false }
}
```

---

<h2 id="types">Types</h2>

### SafeResult

```typescript
type SafeResult<T, E = Error> = readonly [T, null] | readonly [null, E]
```

A discriminated union tuple where:

- On success: `[value, null]`
- On error: `[null, error]`

### SafeHooks

```typescript
type SafeHooks<T, E, TContext extends unknown[] = [], TOut = T> = {
  parseResult?: (result: T) => TOut
  onSuccess?: (result: TOut, context: TContext) => void
  onError?: (error: E, context: TContext) => void
  onSettled?: (result: TOut | null, error: E | null, context: TContext) => void
}
```

Lifecycle hooks and result transformation:

- `T` - The raw success result type
- `E` - The error type
- `TContext` - Tuple of function arguments (empty `[]` for sync/async, `TArgs` for wrap/wrapAsync)
- `TOut` - The transformed result type (defaults to `T` when `parseResult` is not provided)
- `parseResult` - Optional function that transforms the successful result from type `T` to type `TOut`
- `onSettled` - Optional hook called after either success or error

### SafeAsyncHooks

```typescript
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
- `onRetry` - Called before each retry attempt with the error, 1-indexed attempt number, and context
- `retry` - Optional retry configuration
- `abortAfter` - Optional timeout in milliseconds. When set, creates an `AbortController` and passes the signal to the function

### RetryConfig

```typescript
type RetryConfig = {
  times: number // Number of retry attempts (not including initial)
  waitBefore?: (attempt: number) => number // Returns ms to wait before retry (1-indexed)
}
```

Configuration for automatic retry:

- `times` - Number of retry attempts. Total attempts = `times + 1` (initial + retries)
- `waitBefore` - Optional function that returns milliseconds to wait before each retry. Receives 1-indexed attempt number.

### TimeoutError

```typescript
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

### CreateSafeConfig

```typescript
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

- `parseError` - Required function that transforms caught errors to type `E`
- `parseResult` - Optional function that transforms successful results. When provided, `TResult` becomes the default result type for all methods
- `onSuccess` - Optional default hook called on every successful operation (result is `unknown` since `T` varies per call)
- `onError` - Optional default hook called on every error (receives the mapped error type `E`)
- `onSettled` - Optional default hook called after either success or error
- `onRetry` - Optional default hook called before each retry for async operations
- `retry` - Optional default retry configuration for async operations
- `abortAfter` - Optional default timeout for all async operations in milliseconds

### SafeInstance

```typescript
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
  all: <T extends Record<string, Promise<SafeResult<any, any>>>>(
    promises: T
  ) => Promise<SafeResult<
    { [K in keyof T]: T[K] extends Promise<SafeResult<infer V, any>> ? V : never },
    T[keyof T] extends Promise<SafeResult<any, infer EE>> ? EE : never
  >>
  allSettled: <T extends Record<string, Promise<SafeResult<any, any>>>>(
    promises: T
  ) => Promise<{ [K in keyof T]: Awaited<T[K]> }>
}
```

A pre-configured safe instance with a fixed error type. Methods do not accept a `parseError` parameter (already configured). When `parseResult` is configured at the factory level, `TResult` becomes the default result type for all methods. Per-call `parseResult` (via hooks) overrides the factory default.

Note: When `abortAfter` is configured, the `async` method passes an `AbortSignal` as the first parameter to your function. For `wrapAsync`, the signal is appended as an additional argument.

---

<h2 id="hooks">Hooks</h2>

All safe functions support optional hooks for executing side effects on success or error without affecting the return value.

```typescript
// Hooks for sync/async - context is always empty tuple []
safe.sync(() => operation(), {
  onSuccess: (result, []) => {
    /* result is the return value */
  },
  onError: (error, []) => {
    /* error is the caught/mapped error */
  },
})

// Hooks for wrap/wrapAsync - context is the arguments tuple
const safeOp = safe.wrap(
  (a: number, b: string, c: boolean) => operation(a, b, c),
  {
    onSuccess: (result, [a, b, c]) => {
      // a: number, b: string, c: boolean - fully typed!
    },
    onError: (error, [a, b, c]) => {
      // Same context available for error logging
    },
  }
)
```

**Common use cases for hooks:**

- Logging and analytics
- Error reporting (Sentry, DataDog)
- Metrics collection
- Audit trails

---

<h2 id="result-transformation">Result Transformation (parseResult)</h2>

The `parseResult` option transforms successful results into a new type before they reach hooks or the return value. It mirrors `parseError` — while `parseError` transforms errors, `parseResult` transforms successes.

### Basic usage

```typescript
import { safe } from '@cometloop/safe'

// Parse JSON string and transform the result to a typed object
const [user, error] = safe.sync(
  () => '{"name": "Alice", "age": 30}',
  {
    parseResult: (raw) => JSON.parse(raw) as { name: string; age: number },
  }
)
// user is typed as { name: string; age: number }

// Transform an async response
const [count, error2] = await safe.async(
  () => fetch('/api/users').then((r) => r.json()),
  {
    parseResult: (data) => data.length,
  }
)
// count is typed as number
```

### With parseError

Both transforms can be used together:

```typescript
const [parsed, error] = safe.sync(
  () => someRiskyOperation(),
  (e) => ({ code: 'PARSE_ERROR', message: String(e) }),
  {
    parseResult: (raw) => normalize(raw),
  }
)
// parsed is the normalized type, error is { code: string; message: string }
```

### With createSafe

Set a factory-level `parseResult` that applies to all methods:

```typescript
import { createSafe } from '@cometloop/safe'

const validatedSafe = createSafe({
  parseError: (e) => ({
    code: 'ERROR',
    message: e instanceof Error ? e.message : String(e),
  }),
  parseResult: (result) => schema.parse(result),
})

// All methods return the schema-validated type
const [data, error] = validatedSafe.sync(() => fetchConfig())

// Per-call parseResult overrides factory default
const [raw, error2] = validatedSafe.sync(() => fetchConfig(), {
  parseResult: (result) => result, // bypass factory transform
})
```

### Execution order

1. Function executes and returns raw result
2. `parseResult` transforms the result (if provided)
3. `onSuccess` receives the **transformed** result
4. `onSettled` receives the **transformed** result

If `parseResult` throws, the error is caught and processed through `parseError` (or goes through retry logic for async operations).

---

<h2 id="real-world-examples">Real-World Examples</h2>

<h3 id="json-parsing">JSON Parsing</h3>

```typescript
import { safe } from '@cometloop/lib'

// Safe JSON parse with typed error
type ParseError = { type: 'PARSE_ERROR'; input: string; message: string }

function parseConfig(jsonString: string) {
  const [config, error] = safe.sync(
    () => JSON.parse(jsonString) as AppConfig,
    (e): ParseError => ({
      type: 'PARSE_ERROR',
      input: jsonString.slice(0, 100),
      message: e instanceof SyntaxError ? e.message : 'Unknown parse error',
    })
  )

  if (error) {
    console.error('Invalid config:', error.message)
    return getDefaultConfig()
  }

  return config
}
```

---

<h3 id="api-requests">API Requests</h3>

```typescript
import { safe } from '@cometloop/lib'

type ApiError = {
  statusCode: number
  message: string
  endpoint: string
}

// 1. Define the normal function first
async function fetchJson<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(endpoint, options)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  return response.json()
}

// 2. Define the error mapper
const toApiError = (e: unknown): ApiError => ({
  statusCode: 500,
  message: e instanceof Error ? e.message : 'Network error',
  endpoint: '',
})

// 3. Wrap it for safe usage
const safeFetch = safe.wrapAsync(fetchJson, toApiError)

// Usage in a service
async function getUsers() {
  const [users, error] = await safeFetch<User[]>('/api/users')

  if (error) {
    // error is typed as ApiError
    if (error.statusCode === 401) {
      redirectToLogin()
    }
    return []
  }

  return users
}
```

---

<h3 id="form-validation">Form Validation</h3>

```typescript
import { safe } from '@cometloop/lib'
import { z } from 'zod'

const UserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  age: z.number().min(18),
})

type ValidationError = {
  field: string
  message: string
}[]

// 1. Define the normal validation function
function parseUser(data: unknown) {
  return UserSchema.parse(data)
}

// 2. Define the error mapper
const toValidationError = (e: unknown): ValidationError => {
  if (e instanceof z.ZodError) {
    return e.errors.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
    }))
  }
  return [{ field: 'unknown', message: 'Validation failed' }]
}

// 3. Wrap it for safe usage
const validateUser = safe.wrap(parseUser, toValidationError)

// Usage in form handler
function handleSubmit(formData: FormData) {
  const [user, errors] = validateUser(Object.fromEntries(formData))

  if (errors) {
    // errors is ValidationError[] - show in UI
    errors.forEach((err) => setFieldError(err.field, err.message))
    return
  }

  // user is fully validated and typed
  createUser(user)
}
```

---

<h3 id="file-operations">File Operations</h3>

```typescript
import { safe } from '@cometloop/lib'
import * as fs from 'fs/promises'

type FileError = {
  operation: 'read' | 'write' | 'delete'
  path: string
  code: string
  message: string
}

// 1. Use existing fs functions directly, or define custom ones
// fs.readFile is already a normal async function

// 2. Define the error mapper
const toFileError = (e: unknown): FileError => ({
  operation: 'read',
  path: '',
  code: (e as NodeJS.ErrnoException).code ?? 'UNKNOWN',
  message: e instanceof Error ? e.message : 'File read failed',
})

// 3. Define hooks for logging
const fileHooks = {
  onSuccess: (content: Buffer | string, [path]: [string, ...unknown[]]) =>
    console.log(
      `Read ${path}: ${typeof content === 'string' ? content.length : content.byteLength} bytes`
    ),
  onError: (error: FileError, [path]: [string, ...unknown[]]) =>
    console.error(`Failed to read ${path}: ${error.code}`),
}

// 4. Wrap it for safe usage
const safeReadFile = safe.wrapAsync(fs.readFile, toFileError, fileHooks)

// Usage
async function loadConfig(configPath: string) {
  const [content, error] = await safeReadFile(configPath, 'utf-8')

  if (error) {
    if (error.code === 'ENOENT') {
      return createDefaultConfig(configPath)
    }
    throw new Error(`Cannot load config: ${error.message}`)
  }

  return JSON.parse(content)
}
```

---

<h3 id="database-operations">Database Operations</h3>

```typescript
import { safe } from '@cometloop/lib'

type DbError = {
  code: 'NOT_FOUND' | 'DUPLICATE' | 'CONNECTION' | 'UNKNOWN'
  table: string
  message: string
}

// 1. Define the error mapper factory (reusable across tables)
function createDbErrorMapper(table: string) {
  return (e: unknown): DbError => {
    if (e instanceof Error) {
      if (e.message.includes('unique constraint')) {
        return { code: 'DUPLICATE', table, message: 'Record already exists' }
      }
      if (e.message.includes('not found')) {
        return { code: 'NOT_FOUND', table, message: 'Record not found' }
      }
    }
    return { code: 'UNKNOWN', table, message: String(e) }
  }
}

// Repository pattern with safe wrappers
class UserRepository {
  // 2. Define normal repository methods
  private async createUser(data: CreateUserDto) {
    return db.user.create({ data })
  }

  private async findUserById(id: string) {
    const user = await db.user.findUnique({ where: { id } })
    if (!user) throw new Error('not found')
    return user
  }

  // 3. Create error mapper for this table
  private toDbError = createDbErrorMapper('users')

  // 4. Wrap the methods for safe usage
  private safeCreate = safe.wrapAsync(
    this.createUser.bind(this),
    this.toDbError
  )
  private safeFindById = safe.wrapAsync(
    this.findUserById.bind(this),
    this.toDbError
  )

  // Public API using the safe wrappers
  async create(data: CreateUserDto): Promise<ServiceResult<User, DbError>> {
    const [user, error] = await this.safeCreate(data)

    if (error) {
      return { success: false, error }
    }

    return { success: true, data: user }
  }

  async findById(id: string): Promise<ServiceResult<User, DbError>> {
    const [user, error] = await this.safeFindById(id)

    if (error) {
      return { success: false, error }
    }

    return { success: true, data: user }
  }
}
```

---

<h3 id="authentication">Authentication</h3>

```typescript
import { safe } from '@cometloop/lib'
import jwt from 'jsonwebtoken'

type AuthError = {
  code: 'INVALID_TOKEN' | 'EXPIRED' | 'MISSING_CLAIMS'
  message: string
}

// 1. Define the normal verification function
function verifyJwt(token: string, secret: string): JwtPayload {
  return jwt.verify(token, secret) as JwtPayload
}

// 2. Define the error mapper
const toAuthError = (e: unknown): AuthError => {
  if (e instanceof jwt.TokenExpiredError) {
    return { code: 'EXPIRED', message: 'Token has expired' }
  }
  if (e instanceof jwt.JsonWebTokenError) {
    return { code: 'INVALID_TOKEN', message: e.message }
  }
  return { code: 'INVALID_TOKEN', message: 'Token verification failed' }
}

// 3. Define hooks for logging
const authHooks = {
  onSuccess: (payload: JwtPayload, [token]: [string, string]) => {
    console.log(`Token verified for user: ${payload.sub}`)
  },
  onError: (error: AuthError, [token]: [string, string]) => {
    console.warn(`Auth failed: ${error.code}`)
  },
}

// 4. Wrap it for safe usage
const verifyToken = safe.wrap(verifyJwt, toAuthError, authHooks)

// Middleware usage
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({ error: 'No token provided' })
  }

  const [payload, error] = verifyToken(token, process.env.JWT_SECRET!)

  if (error) {
    const status = error.code === 'EXPIRED' ? 401 : 403
    return res.status(status).json({ error: error.message })
  }

  req.user = payload
  next()
}
```

---

<h2 id="createsafe-real-world-examples">createSafe Real-World Examples</h2>

The `createSafe` factory is ideal when you need consistent error handling across a module, service, or entire application layer. Here are practical examples showing when and how to use it.

<h3 id="application-wide-error-handling">Application-Wide Error Handling</h3>

Create a centralized error handling instance for your entire application with built-in logging and monitoring.

```typescript
import { createSafe } from '@cometloop/lib'
import * as Sentry from '@sentry/node'

// Define your application's standard error type
type AppError = {
  code: string
  message: string
  timestamp: Date
  requestId?: string
  stack?: string
}

// Create a single instance used throughout the app
export const appSafe = createSafe({
  parseError: (e): AppError => {
    const error = e instanceof Error ? e : new Error(String(e))
    return {
      code: error.name === 'Error' ? 'UNKNOWN_ERROR' : error.name,
      message: error.message,
      timestamp: new Date(),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    }
  },
  onSuccess: (result) => {
    // Optional: track success metrics
    metrics.increment('operation.success')
  },
  onError: (error) => {
    // Centralized error logging
    logger.error('Operation failed', {
      code: error.code,
      message: error.message,
      timestamp: error.timestamp,
    })

    // Report to error monitoring
    Sentry.captureException(new Error(error.message), {
      tags: { errorCode: error.code },
    })

    metrics.increment('operation.error', { code: error.code })
  },
})

// Usage throughout your application - consistent error handling everywhere
const [user, error] = await appSafe.async(() => userService.findById(id))
const [config, parseError] = appSafe.sync(() => JSON.parse(configString))
```

---

<h3 id="api-layer-with-logging">API Layer with Logging</h3>

Create a dedicated safe instance for all HTTP/API operations with request tracking.

```typescript
import { createSafe } from '@cometloop/lib'

type ApiError = {
  type: 'NETWORK' | 'TIMEOUT' | 'AUTH' | 'SERVER' | 'UNKNOWN'
  statusCode: number
  message: string
  endpoint: string
  duration?: number
}

// API-specific safe instance with request/response logging
export const apiSafe = createSafe({
  parseError: (e): ApiError => {
    if (e instanceof TypeError && e.message.includes('fetch')) {
      return {
        type: 'NETWORK',
        statusCode: 0,
        message: 'Network unavailable',
        endpoint: '',
      }
    }
    if (e instanceof DOMException && e.name === 'AbortError') {
      return {
        type: 'TIMEOUT',
        statusCode: 0,
        message: 'Request timed out',
        endpoint: '',
      }
    }
    if (e instanceof Response) {
      return {
        type: e.status === 401 ? 'AUTH' : 'SERVER',
        statusCode: e.status,
        message: e.statusText,
        endpoint: e.url,
      }
    }
    return {
      type: 'UNKNOWN',
      statusCode: 500,
      message: String(e),
      endpoint: '',
    }
  },
  onSuccess: (result) => {
    logger.debug('API request succeeded', { result })
  },
  onError: (error) => {
    logger.warn('API request failed', {
      type: error.type,
      statusCode: error.statusCode,
      endpoint: error.endpoint,
    })

    // Auto-redirect on auth errors
    if (error.type === 'AUTH') {
      authStore.clearSession()
    }
  },
})

// 1. Define the normal fetch function
async function fetchJson<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    throw response // Will be parsed by parseError
  }

  return response.json()
}

// 2. Wrap it with the apiSafe instance
const safeFetch = apiSafe.wrapAsync(fetchJson)

// Usage - all API calls get consistent error handling
export const api = {
  users: {
    list: () => safeFetch<User[]>('/api/users'),
    get: (id: string) => safeFetch<User>(`/api/users/${id}`),
    create: (data: CreateUser) =>
      safeFetch<User>('/api/users', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  orders: {
    list: () => safeFetch<Order[]>('/api/orders'),
    submit: (data: OrderData) =>
      safeFetch<Order>('/api/orders', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
}

// In components
const [users, error] = await api.users.list()
if (error) {
  // error is fully typed as ApiError
  if (error.type === 'AUTH') showLoginModal()
  else showToast(error.message)
}
```

---

<h3 id="database-layer">Database Layer</h3>

Create a database-specific safe instance with query tracking and connection error handling.

```typescript
import { createSafe } from '@cometloop/lib'
import { db } from './drizzle'

type DbError = {
  code:
    | 'CONNECTION'
    | 'CONSTRAINT'
    | 'NOT_FOUND'
    | 'DUPLICATE'
    | 'QUERY'
    | 'UNKNOWN'
  table?: string
  message: string
  query?: string
}

// Database-specific safe instance
export const dbSafe = createSafe({
  parseError: (e): DbError => {
    const message = e instanceof Error ? e.message : String(e)

    // PostgreSQL error codes
    if (message.includes('ECONNREFUSED') || message.includes('connection')) {
      return { code: 'CONNECTION', message: 'Database connection failed' }
    }
    if (
      message.includes('unique constraint') ||
      message.includes('duplicate key')
    ) {
      return { code: 'DUPLICATE', message: 'Record already exists' }
    }
    if (message.includes('foreign key constraint')) {
      return { code: 'CONSTRAINT', message: 'Related record not found' }
    }
    if (message.includes('not found') || message.includes('no rows')) {
      return { code: 'NOT_FOUND', message: 'Record not found' }
    }

    return { code: 'QUERY', message }
  },
  onSuccess: () => {
    metrics.increment('db.query.success')
  },
  onError: (error) => {
    metrics.increment('db.query.error', { code: error.code })

    if (error.code === 'CONNECTION') {
      // Alert on-call for connection issues
      alerting.critical('Database connection failed', error)
    }

    logger.error('Database operation failed', {
      code: error.code,
      table: error.table,
      message: error.message,
    })
  },
})

// Repository using the database safe instance
export class UserRepository {
  // 1. Define normal repository methods
  private async _findById(id: string) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, id),
    })
    if (!user) throw new Error('not found')
    return user
  }

  private async _findByEmail(email: string) {
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    })
    if (!user) throw new Error('not found')
    return user
  }

  private async _create(data: CreateUserDto) {
    const [user] = await db.insert(users).values(data).returning()
    return user
  }

  private async _update(id: string, data: UpdateUserDto) {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning()
    if (!user) throw new Error('not found')
    return user
  }

  // 2. Wrap them with dbSafe for safe public API
  findById = dbSafe.wrapAsync(this._findById.bind(this))
  findByEmail = dbSafe.wrapAsync(this._findByEmail.bind(this))
  create = dbSafe.wrapAsync(this._create.bind(this))
  update = dbSafe.wrapAsync(this._update.bind(this))
}

// Service layer usage
class UserService {
  constructor(private repo = new UserRepository()) {}

  async getUser(id: string): Promise<ServiceResult<User, DbError>> {
    const [user, error] = await this.repo.findById(id)

    if (error) {
      return { success: false, error }
    }

    return { success: true, data: user }
  }
}
```

---

<h3 id="third-party-integrations">Third-Party Integrations</h3>

Create dedicated safe instances for each external service with service-specific error handling.

```typescript
import { createSafe } from '@cometloop/lib'
import Stripe from 'stripe'

// Stripe-specific error handling
type StripeError = {
  code:
    | 'CARD_DECLINED'
    | 'EXPIRED_CARD'
    | 'INVALID_REQUEST'
    | 'RATE_LIMIT'
    | 'API_ERROR'
  message: string
  declineCode?: string
  retryable: boolean
}

export const stripeSafe = createSafe({
  parseError: (e): StripeError => {
    if (e instanceof Stripe.errors.StripeCardError) {
      return {
        code: 'CARD_DECLINED',
        message: e.message,
        declineCode: e.decline_code ?? undefined,
        retryable: false,
      }
    }
    if (e instanceof Stripe.errors.StripeInvalidRequestError) {
      return {
        code: 'INVALID_REQUEST',
        message: e.message,
        retryable: false,
      }
    }
    if (e instanceof Stripe.errors.StripeRateLimitError) {
      return {
        code: 'RATE_LIMIT',
        message: 'Too many requests to payment provider',
        retryable: true,
      }
    }
    if (e instanceof Stripe.errors.StripeAPIError) {
      return {
        code: 'API_ERROR',
        message: 'Payment provider unavailable',
        retryable: true,
      }
    }
    return {
      code: 'API_ERROR',
      message: e instanceof Error ? e.message : 'Unknown payment error',
      retryable: false,
    }
  },
  onError: (error) => {
    logger.error('Stripe operation failed', {
      code: error.code,
      declineCode: error.declineCode,
      retryable: error.retryable,
    })

    metrics.increment('stripe.error', { code: error.code })
  },
})

// Stripe client
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// 1. Define normal Stripe operations
async function createStripeCustomer(email: string, name: string) {
  return stripe.customers.create({ email, name })
}

async function createStripeSubscription(customerId: string, priceId: string) {
  return stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
  })
}

async function createStripePaymentIntent(
  customerId: string,
  amount: number,
  currency: string
) {
  return stripe.paymentIntents.create({
    customer: customerId,
    amount,
    currency,
    confirm: true,
  })
}

// 2. Wrap them with stripeSafe for consistent error handling
export const paymentService = {
  createCustomer: stripeSafe.wrapAsync(createStripeCustomer),
  createSubscription: stripeSafe.wrapAsync(createStripeSubscription),
  chargeCard: stripeSafe.wrapAsync(createStripePaymentIntent),
}

// Create a retryable payment service using built-in retry
const retryablePaymentService = {
  chargeCard: stripeSafe.wrapAsync(createStripePaymentIntent, {
    retry: {
      times: 3,
      waitBefore: (attempt) => attempt * 1000, // 1s, 2s, 3s exponential backoff
    },
    onRetry: (error, attempt, [customerId, amount, currency]) => {
      if (error.retryable) {
        logger.info(`Payment retry ${attempt} for customer ${customerId}`, {
          amount,
          currency,
          errorCode: error.code,
        })
      }
    },
  }),
}

// Usage - retries are handled automatically
async function processPayment(customerId: string, amount: number) {
  const [payment, error] = await retryablePaymentService.chargeCard(
    customerId,
    amount,
    'usd'
  )

  if (error) {
    return { success: false, error }
  }

  return { success: true, data: payment }
}
```

---

<h3 id="multi-tenant-applications">Multi-Tenant Applications</h3>

Create safe instances dynamically with tenant-specific context for multi-tenant applications.

```typescript
import { createSafe, SafeInstance } from '@cometloop/lib'

type TenantError = {
  code: string
  message: string
  tenantId: string
  timestamp: Date
}

// Factory to create tenant-specific safe instances
function createTenantSafe(tenantId: string): SafeInstance<TenantError> {
  return createSafe({
    parseError: (e): TenantError => ({
      code: e instanceof Error ? e.name : 'UNKNOWN',
      message: e instanceof Error ? e.message : String(e),
      tenantId,
      timestamp: new Date(),
    }),
    onSuccess: () => {
      metrics.increment('tenant.operation.success', { tenantId })
    },
    onError: (error) => {
      logger.error('Tenant operation failed', {
        tenantId: error.tenantId,
        code: error.code,
        message: error.message,
      })

      metrics.increment('tenant.operation.error', {
        tenantId: error.tenantId,
        code: error.code,
      })
    },
  })
}

// Request-scoped tenant context
class TenantContext {
  private safe: SafeInstance<TenantError>

  constructor(public readonly tenantId: string) {
    this.safe = createTenantSafe(tenantId)
  }

  // 1. Define normal database operations
  private async _getUsers() {
    return db.users.findMany({
      where: { tenantId: this.tenantId },
    })
  }

  private async _createDocument(data: CreateDocumentDto) {
    return db.documents.create({
      data: { ...data, tenantId: this.tenantId },
    })
  }

  // 2. Wrap them with tenant-scoped safe instance
  getUsers = () => this.safe.async(this._getUsers.bind(this))
  createDocument = (data: CreateDocumentDto) =>
    this.safe.async(() => this._createDocument(data))

  // Helper to wrap any service function with tenant error handling
  wrapService<TArgs extends unknown[], T>(fn: (...args: TArgs) => Promise<T>) {
    return this.safe.wrapAsync(fn)
  }
}

// Middleware creates tenant context per request
function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  const tenantId = req.headers['x-tenant-id'] as string

  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant ID required' })
  }

  req.tenant = new TenantContext(tenantId)
  next()
}

// Usage in route handlers
app.get('/api/users', async (req, res) => {
  const [users, error] = await req.tenant.getUsers()

  if (error) {
    // error.tenantId is automatically set
    return res.status(500).json({
      error: error.message,
      code: error.code,
    })
  }

  res.json(users)
})
```

---

<h2 id="error-mapping-patterns">Error Mapping Patterns</h2>

### Structured Error Types

```typescript
// Define a union of possible errors
type AppError =
  | { type: 'VALIDATION'; fields: string[] }
  | { type: 'NOT_FOUND'; resource: string; id: string }
  | { type: 'UNAUTHORIZED'; reason: string }
  | { type: 'INTERNAL'; message: string }

// Map unknown errors to structured types
function toAppError(e: unknown): AppError {
  if (e instanceof ValidationError) {
    return { type: 'VALIDATION', fields: e.fields }
  }
  if (e instanceof NotFoundError) {
    return { type: 'NOT_FOUND', resource: e.resource, id: e.id }
  }
  return { type: 'INTERNAL', message: String(e) }
}

const [result, error] = safe.sync(riskyOperation, toAppError)

if (error) {
  switch (error.type) {
    case 'VALIDATION':
      showFieldErrors(error.fields)
      break
    case 'NOT_FOUND':
      showNotFound(error.resource, error.id)
      break
    case 'UNAUTHORIZED':
      redirectToLogin()
      break
    case 'INTERNAL':
      showGenericError()
      break
  }
}
```

### Error Codes Pattern

```typescript
type ErrorCode = 'user.not_found' | 'user.invalid_email' | 'auth.expired'

type CodedError = {
  code: ErrorCode
  message: string
  details?: Record<string, unknown>
}

const safeGetUser = safe.wrapAsync(
  async (id: string) => getUserById(id),
  (e): CodedError => ({
    code: 'user.not_found',
    message: `User ${id} not found`,
    details: { id },
  })
)
```

---

<h2 id="comparison-with-try-catch">Comparison with try-catch</h2>

### Traditional try-catch

```typescript
// Problems: error type is unknown, nested try-catch, easy to forget handling
async function processOrder(orderId: string) {
  let order
  try {
    order = await fetchOrder(orderId)
  } catch (e) {
    // e is unknown - need manual type narrowing
    console.error('Failed to fetch order')
    return null
  }

  let payment
  try {
    payment = await processPayment(order)
  } catch (e) {
    // Another catch block
    console.error('Payment failed')
    return null
  }

  return { order, payment }
}
```

### With safe utilities

```typescript
// Benefits: typed errors, flat structure, explicit handling
async function processOrder(orderId: string) {
  const [order, fetchError] = await safe.async(() => fetchOrder(orderId))
  if (fetchError) {
    console.error('Failed to fetch order:', fetchError.message)
    return null
  }

  const [payment, paymentError] = await safe.async(() => processPayment(order))
  if (paymentError) {
    console.error('Payment failed:', paymentError.message)
    return null
  }

  return { order, payment }
}
```

---

## Source Code

| File                                                       | Description                                                                                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [src/safe/types.ts](src/safe/types.ts)                     | Type definitions (`SafeResult`, `SafeHooks`, `SafeAsyncHooks`, `RetryConfig`, `TimeoutError`, `CreateSafeConfig`, `SafeInstance`) |
| [src/safe/safe.ts](src/safe/safe.ts)                       | Core functions (`sync`, `async`, `wrap`, `wrapAsync`, `all`, `allSettled`) with retry and timeout support                         |
| [src/safe/createSafe.ts](src/safe/createSafe.ts)           | Factory function for pre-configured instances                                                                                     |
| [src/safe/index.ts](src/safe/index.ts)                     | Barrel exports                                                                                                                    |
| [src/safe/safe.test.ts](src/safe/safe.test.ts)             | Tests for core functions (265 tests)                                                                                              |
| [src/safe/createSafe.test.ts](src/safe/createSafe.test.ts) | Tests for factory function (145 tests)                                                                                            |

**Total: 410 tests**
