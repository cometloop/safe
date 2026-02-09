---
title: safe.allSettled
---

Runs multiple safe-wrapped async operations in parallel and returns all individual results as named `SafeResult` entries. Never fails at the group level. {% .lead %}

---

## Signature

```ts
safe.allSettled<T extends Record<string, Promise<SafeResult<any, any>>>>(
  promises: T
): Promise<{ [K in keyof T]: Awaited<T[K]> }>
```

Accepts an object map of `Promise<SafeResult>` entries. Always returns an object where each key maps to its individual `SafeResult` — there is no group-level error wrapper.

---

## Basic usage

```ts
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
```

---

## Mixed success and failure

Unlike `safe.all`, failures don't affect other results. Each operation is independent.

```ts
const results = await safe.allSettled({
  config: safe.async(() => loadConfig()),
  user: safe.async(() => fetchUser(userId)),
  analytics: safe.async(() => trackEvent('page_view')),
})

// analytics failed, but config and user may have succeeded
if (!results.analytics.ok) {
  console.warn('Analytics failed:', results.analytics.error)
}

if (results.config.ok) {
  applyConfig(results.config.value)
}
```

---

## Tagged result properties

Each result is a full `SafeResult` with tagged properties (`.ok`, `.value`, `.error`) and tuple access (`[0]`, `[1]`):

```ts
const results = await safe.allSettled({
  val: safe.async(() => Promise.resolve(42)),
})

// Tagged property access
results.val.ok     // true
results.val.value  // 42
results.val.error  // null

// Tuple destructuring
const [value, error] = results.val // [42, null]
```

---

## With per-operation error mapping

Each operation can use its own `parseError`, hooks, and configuration:

```ts
const results = await safe.allSettled({
  user: safe.async(
    () => fetchUser(userId),
    (e) => ({ code: 'USER_ERROR', message: String(e) })
  ),
  posts: safe.async(
    () => fetchPosts(userId),
    (e) => ({ code: 'POSTS_ERROR', message: String(e) })
  ),
})

if (!results.user.ok) {
  console.error(results.user.error.code) // 'USER_ERROR'
}
```

---

## With createSafe

Works the same way on a `createSafe` instance:

```ts
const appSafe = createSafe({
  parseError: (e) => ({
    code: 'ERR',
    message: e instanceof Error ? e.message : 'Unknown',
  }),
})

const results = await appSafe.allSettled({
  user: appSafe.async(() => fetchUser(userId)),
  posts: appSafe.async(() => fetchPosts(userId)),
})

if (results.user.ok) {
  console.log(results.user.value)
}

if (!results.posts.ok) {
  console.error(results.posts.error.code) // typed as { code: string; message: string }
}
```

---

## Empty input

Passing an empty object returns `{}`:

```ts
const results = await safe.allSettled({})
// results = {}
```

{% callout title="When to use safe.allSettled vs safe.all" type="note" %}
Use `safe.allSettled` when you want to handle each result independently (e.g., loading optional widgets where some can fail gracefully). Use [`safe.all`](/docs/safe-all) when all operations must succeed for the result to be useful.
{% /callout %}
