---
title: Error mapping patterns
---

Transform unknown caught errors into structured, typed error objects using the `parseError` parameter. {% .lead %}

---

## Structured error types

Define a union of possible errors and map them from caught exceptions:

```ts
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

---

## Error codes pattern

Use string literal types for exhaustive error handling:

```ts
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

## Reusable error mappers

Create error mapper factories that can be shared across your codebase:

```ts
// Factory for table-specific database error mappers
function createDbErrorMapper(table: string) {
  return (e: unknown) => {
    if (e instanceof Error) {
      if (e.message.includes('unique constraint')) {
        return { code: 'DUPLICATE' as const, table, message: 'Record already exists' }
      }
      if (e.message.includes('not found')) {
        return { code: 'NOT_FOUND' as const, table, message: 'Record not found' }
      }
    }
    return { code: 'UNKNOWN' as const, table, message: String(e) }
  }
}

// Use in different repositories
const userErrorMapper = createDbErrorMapper('users')
const orderErrorMapper = createDbErrorMapper('orders')

const safeFindUser = safe.wrapAsync(findUserById, userErrorMapper)
const safeFindOrder = safe.wrapAsync(findOrderById, orderErrorMapper)
```

---

## With createSafe

The `createSafe` factory lets you set a single `parseError` for an entire module:

```ts
const dbSafe = createSafe({
  parseError: (e) => ({
    code: e instanceof Error ? e.name : 'UNKNOWN',
    message: e instanceof Error ? e.message : String(e),
    timestamp: new Date(),
  }),
  defaultError: { code: 'UNKNOWN', message: 'Unknown error', timestamp: new Date() },
})

// All operations use the same error mapper
const safeFindUser = dbSafe.wrapAsync(db.user.findById.bind(db.user))
const safeFindOrder = dbSafe.wrapAsync(db.order.findById.bind(db.order))

const [user, error] = await safeFindUser(id)
const [order, error2] = await safeFindOrder(orderId)
```

{% callout title="TypeScript inference" type="note" %}
The error type `E` is automatically inferred from the `parseError` return type. You don't need to specify it explicitly — TypeScript will determine the exact error shape from your mapper function.
{% /callout %}

---

## Error normalization

When no `parseError` is provided, all non-`Error` thrown values are automatically normalized to `Error` instances. This makes the default `SafeResult<T, Error>` return type truthful:

```ts
const [, error] = safe.sync(() => { throw 'string error' })
// error is Error with message "string error" (not a raw string)
// error.cause preserves the original thrown value

const [, error2] = safe.sync(() => { throw new TypeError('bad type') })
// error2 is the original TypeError — Error instances pass through unchanged
```

---

## parseError safety

The `parseError` function is wrapped in try/catch. If it throws:

1. The error is reported via `onHookError` with hookName `'parseError'`
2. `defaultError` is returned as the error result (if provided)
3. Otherwise, the original caught error is normalized to an `Error` instance

```ts
const [, error] = safe.sync(
  () => { throw new Error('original') },
  (e) => { throw new Error('parseError crashed') },
  {
    defaultError: { code: 'FALLBACK', message: 'default' },
    onHookError: (err, hookName) => {
      // hookName === 'parseError'
    },
  }
)
// error is { code: 'FALLBACK', message: 'default' }
```

---

## NonFalsy constraint

The `parseError` return type uses `NonFalsy<E>` to prevent returning falsy values (`null`, `undefined`, `false`, `0`, `''`) that would break `if (error)` truthiness checks:

```ts
// Compile error — null is falsy
safe.sync(() => risky(), (e) => null)

// Compile error — null member stripped from union
safe.sync(() => risky(), (e): string | null => e?.message ?? null)

// OK — string is always truthy (non-empty enforced by your logic)
safe.sync(() => risky(), (e) => String(e))
```
