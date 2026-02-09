---
title: safe.all
---

Runs multiple safe-wrapped async operations in parallel and returns all values as a named object, or the first error encountered. {% .lead %}

---

## Signature

```ts
safe.all<T extends Record<string, Promise<SafeResult<any, any>>>>(
  promises: T
): Promise<SafeResult<
  { [K in keyof T]: T[K] extends Promise<SafeResult<infer V, any>> ? V : never },
  T[keyof T] extends Promise<SafeResult<any, infer E>> ? E : never
>>
```

Accepts an object map of `Promise<SafeResult>` entries. The keys you choose become the named properties on the result.

- On all-success: returns `ok({ key: value, ... })` with unwrapped values
- On any failure: returns `err(firstError)`

---

## Basic usage

```ts
const [data, error] = await safe.all({
  user: safe.async(() => fetchUser(userId)),
  posts: safe.async(() => fetchPosts(userId)),
})

if (error) {
  console.error('Something failed:', error.message)
  return
}

data.user   // User
data.posts  // Post[]
```

---

## Error handling

If any operation fails, `safe.all` short-circuits and returns the first error. The remaining results are discarded.

```ts
const [data, error] = await safe.all({
  user: safe.async(() => fetchUser(userId)),
  posts: safe.async(() => Promise.reject(new Error('posts failed'))),
})

if (error) {
  console.error(error.message) // "posts failed"
}
```

{% callout title="First error wins" type="note" %}
All promises run in parallel via `Promise.all`. If multiple operations fail, the error from the first key (in object key order) that failed is returned.
{% /callout %}

---

## With per-operation error mapping

Each operation can have its own `parseError`, hooks, retry, and timeout configuration — they are fully independent `safe.async` calls.

```ts
const [data, error] = await safe.all({
  config: safe.async(() => loadConfig()),
  user: safe.async(
    () => fetchUser(userId),
    (e) => ({ code: 'USER_ERROR', message: String(e) })
  ),
})
```

---

## With createSafe

Works the same way on a `createSafe` instance — individual operations use the instance's `parseError` and hooks.

```ts
const appSafe = createSafe({
  parseError: (e) => ({
    code: 'ERR',
    message: e instanceof Error ? e.message : 'Unknown',
  }),
})

const [data, error] = await appSafe.all({
  user: appSafe.async(() => fetchUser(userId)),
  posts: appSafe.async(() => fetchPosts(userId)),
})

if (error) {
  console.error(error.code) // typed as { code: string; message: string }
}
```

---

## Tagged result properties

The result from `safe.all` is a full `SafeResult` with tagged properties:

```ts
const result = await safe.all({
  user: safe.async(() => fetchUser(userId)),
  posts: safe.async(() => fetchPosts(userId)),
})

if (result.ok) {
  result.value.user   // User
  result.value.posts  // Post[]
}

// Or use destructuring
const [data, error] = result
```

---

## Empty input

Passing an empty object returns `ok({})`:

```ts
const [data, error] = await safe.all({})
// data = {}, error = null
```

{% callout title="When to use safe.all vs safe.allSettled" type="note" %}
Use `safe.all` when all operations must succeed for the result to be useful (e.g., loading a page that requires both user data and permissions). Use [`safe.allSettled`](/docs/safe-all-settled) when you want to handle each result independently (e.g., loading optional sidebar widgets).
{% /callout %}
