---
title: safe.async
---

Executes an asynchronous function and returns a `Promise<SafeResult>` tuple. Supports automatic retry with configurable backoff. {% .lead %}

---

## Signatures

```ts
safe.async<T>(fn: () => Promise<T>): Promise<SafeResult<T, Error>>
safe.async<T>(fn: () => Promise<T>, hooks: SafeAsyncHooks<T, Error, []>): Promise<SafeResult<T, Error>>
safe.async<T, E>(fn: () => Promise<T>, parseError: (e: unknown) => NonFalsy<E>): Promise<SafeResult<T, E>>
safe.async<T, E>(fn: () => Promise<T>, parseError: (e: unknown) => NonFalsy<E>, hooks: SafeAsyncHooks<T, E, []> & { defaultError: E }): Promise<SafeResult<T, E>>
```

{% callout title="Error normalization" type="note" %}
When no `parseError` is provided, non-`Error` thrown values (strings, numbers, etc.) are automatically normalized to `Error` instances via `new Error(String(e))`. The original thrown value is preserved as `error.cause`.
{% /callout %}

---

## Basic usage

```ts
const [user, error] = await safe.async(() => fetchUser(userId))

if (error) {
  console.error('Fetch failed:', error.message)
  return
}
console.log(user) // user is typed
```

---

## With error mapping

```ts
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
```

---

## With hooks

```ts
const [user, error] = await safe.async(() => fetchUser(userId), {
  onSuccess: (user, []) => console.log('Fetched user:', user.name),
  onError: (error, []) => reportToSentry(error),
})
```

---

## With error mapping and hooks

```ts
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
```

---

## With retry

`safe.async` supports automatic retry via the `retry` option in hooks. See [Retry support](/docs/retry-support) for full details.

```ts
const [data, error] = await safe.async(() => fetchWithRetry('/api/data'), {
  retry: { times: 3, waitBefore: (attempt) => attempt * 1000 },
  onRetry: (error, attempt, []) => {
    console.log(`Attempt ${attempt} failed, retrying...`)
  },
})
```

---

## With timeout

`safe.async` supports automatic timeout via the `abortAfter` option. See [Timeout / Abort](/docs/timeout-abort) for full details.

```ts
const [data, error] = await safe.async(
  (signal) => fetch('/api/data', { signal }),
  { abortAfter: 5000 }
)
```

When `abortAfter` is configured, an `AbortSignal` is passed as the first parameter to your function.
