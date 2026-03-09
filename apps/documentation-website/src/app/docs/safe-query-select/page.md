---
title: Select / Transform
---

Derive views from cached data without affecting the cache. Each subscriber can apply its own `select` function to transform data at notification time. {% .lead %}

---

## Basic usage

Pass a `select` function to `subscribe` to transform the data before it reaches your callback:

```ts
type User = { id: string; name: string; email: string }

const getUsers = api.query({
  key: '/users',
  fn: () => fetchJson<User[]>('/api/users'),
})

// Subscriber that only sees user names
getUsers.subscribe(
  (state) => {
    console.log(state.data) // string[] | undefined
  },
  { select: (users) => users.map(u => u.name) },
)
```

The `select` function is only called when `data` is defined. When data is `undefined` (idle/loading state), the subscriber receives `undefined` as usual.

---

## Multiple views

Different subscribers can have different `select` functions on the same query. The cache always stores the full data — `select` is applied per-subscriber at notification time.

```ts
// Names only
getUsers.subscribe(
  (state) => renderNameList(state.data),
  { select: (users) => users.map(u => u.name) },
)

// Count only
getUsers.subscribe(
  (state) => updateBadge(state.data),
  { select: (users) => users.length },
)

// IDs only
getUsers.subscribe(
  (state) => syncIds(state.data),
  { select: (users) => users.map(u => u.id) },
)
```

---

## Combining with other options

`select` can be combined with `params`, `searchParams`, and `enabled`:

```ts
getUsers.subscribe(
  (state) => { /* state.data is string[] */ },
  {
    searchParams: { page: 1 },
    select: (users) => users.map(u => u.name),
    enabled: false, // passive subscriber
  },
)
```

---

## How it works

1. Query fetches and stores data in the cache as normal
2. When subscribers are notified, the full `QueryState` is computed
3. If `select` is provided and `data` is not `undefined`, `select(data)` replaces `data` in the state passed to the callback
4. The cache is never modified — only the subscriber's view changes

{% callout title="Performance tip" type="note" %}
Keep `select` functions pure and lightweight. They run on every notification, so avoid expensive computations. If you need memoization, handle it in your subscriber callback.
{% /callout %}
