---
title: Retry support
---

safe-query supports automatic retries for failed queries and mutations. Retry behavior is configured using `RetryConfig` from `@cometloop/safe`, giving you control over how many times to retry and how long to wait between attempts.

---

## RetryConfig

The `retry` option accepts a `RetryConfig` object from `@cometloop/safe`:

```ts
type RetryConfig = {
  times: number
  waitBefore?: number | ((attempt: number) => number)
}
```

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `times` | `number` | **(required)** | The number of retry attempts. A value of `3` means up to 3 retries after the initial attempt (4 total attempts). |
| `waitBefore` | `number \| (attempt) => number` | `undefined` | Delay in milliseconds before each retry. Can be a fixed number or a function that receives the current attempt number (starting at 1). |

---

## Per-query retry

Add a `retry` option to any query config:

```ts
const getUsers = api.query({
  key: '/users',
  fn: () => fetchJson<User[]>(buildUrl(BASE_URL, '/users')),
  retry: {
    times: 3,
  },
})
```

If the fetch fails, safe-query will retry up to 3 more times before returning an error result.

### With a fixed delay

```ts
const getUsers = api.query({
  key: '/users',
  fn: () => fetchJson<User[]>(buildUrl(BASE_URL, '/users')),
  retry: {
    times: 3,
    waitBefore: 1000, // Wait 1 second between retries
  },
})
```

### With exponential backoff

Use a function for `waitBefore` to implement exponential backoff:

```ts
const getUsers = api.query({
  key: '/users',
  fn: () => fetchJson<User[]>(buildUrl(BASE_URL, '/users')),
  retry: {
    times: 3,
    waitBefore: (attempt) => Math.min(1000 * 2 ** (attempt - 1), 10_000),
  },
})
```

This produces the following delays:
- Attempt 1: 1000ms (1 second)
- Attempt 2: 2000ms (2 seconds)
- Attempt 3: 4000ms (4 seconds, capped at 10s)

---

## Per-mutation retry

Mutations also support the `retry` option:

```ts
const createUser = api.mutate<User, { name: string; email: string }>({
  key: '/users',
  method: 'POST',
  fn: (ctx) => fetchJson<User>(buildUrl(BASE_URL, '/users'), {
    method: 'POST',
    body: ctx.body,
  }),
  retry: {
    times: 2,
    waitBefore: 500,
  },
})
```

{% callout type="warning" %}
Be cautious when retrying mutations that are not idempotent. A `POST` mutation that creates a resource may create duplicates if retried. `PUT` and `DELETE` are generally safe to retry because they are idempotent by convention.
{% /callout %}

---

## Retry patterns

### No retry (default)

When no `retry` option is provided, queries and mutations do not retry on failure. The error is returned immediately.

```ts
const getUsers = api.query({
  key: '/users',
  fn: () => fetchJson<User[]>(buildUrl(BASE_URL, '/users')),
  // No retry -- failure returns immediately
})
```

### Simple retry

Retry a fixed number of times with no delay:

```ts
const getUsers = api.query({
  key: '/users',
  fn: () => fetchJson<User[]>(buildUrl(BASE_URL, '/users')),
  retry: { times: 2 },
})
```

### Fixed delay

Retry with a constant delay between attempts:

```ts
const getUsers = api.query({
  key: '/users',
  fn: () => fetchJson<User[]>(buildUrl(BASE_URL, '/users')),
  retry: {
    times: 3,
    waitBefore: 2000, // 2 seconds between each retry
  },
})
```

### Exponential backoff

Increase the delay exponentially with each attempt:

```ts
const getUsers = api.query({
  key: '/users',
  fn: () => fetchJson<User[]>(buildUrl(BASE_URL, '/users')),
  retry: {
    times: 4,
    waitBefore: (attempt) => 1000 * 2 ** (attempt - 1),
    // Attempt 1: 1s, Attempt 2: 2s, Attempt 3: 4s, Attempt 4: 8s
  },
})
```

### Exponential backoff with jitter

Add randomness to prevent thundering herd problems when many clients retry simultaneously:

```ts
const getUsers = api.query({
  key: '/users',
  fn: () => fetchJson<User[]>(buildUrl(BASE_URL, '/users')),
  retry: {
    times: 4,
    waitBefore: (attempt) => {
      const base = 1000 * 2 ** (attempt - 1)
      const jitter = Math.random() * 500
      return Math.min(base + jitter, 30_000)
    },
  },
})
```

### Conservative mutation retry

For mutations, use fewer retries with longer delays:

```ts
const updateProfile = api.mutate<User, { name: string }>({
  key: '/profile',
  method: 'PUT',
  fn: (ctx) => fetchJson<User>(buildUrl(BASE_URL, '/profile'), {
    method: 'PUT',
    body: ctx.body,
  }),
  retry: {
    times: 2,
    waitBefore: (attempt) => 2000 * attempt, // 2s, 4s
  },
})
```

---

## How retries interact with other features

### Retries and optimistic updates

When a mutation with optimistic updates fails and is retried, the optimistic state remains in place during retries. The rollback only occurs when the final retry attempt fails. This means the UI stays optimistic throughout the entire retry sequence.

### Retries and subscriptions

Subscribers are not notified during retries. They only receive updates when the final result (success or failure after all retries) is determined.

### Retries and abort signals

If an abort signal fires during a retry sequence, the entire retry chain is cancelled. No further attempts are made.

---

## What's next?

- [Lifecycle callbacks](/docs/lifecycle-callbacks) -- run code when queries and mutations succeed, fail, or settle
- [Queries](/docs/queries) -- full query configuration reference
- [Mutations](/docs/mutations) -- full mutation configuration reference
