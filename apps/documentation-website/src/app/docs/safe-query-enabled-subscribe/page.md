---
title: Enabled on Subscribe
---

Control whether a subscriber participates in the query's refetch lifecycle by passing `enabled` to `subscribe`. {% .lead %}

---

## Passive subscribers

Pass `enabled: false` to create a subscriber that receives state updates but doesn't contribute to subscriber count, interval refetching, or focus refetching:

```ts
const getUsers = api.query({
  key: '/users',
  fn: () => fetchJson<User[]>('/api/users'),
  refetchInterval: 5000,
})

// Passive — watches for updates but doesn't trigger refetching
const unsub = getUsers.subscribe(
  (state) => { console.log('Observer:', state.data) },
  { enabled: false },
)
```

The passive subscriber still receives:
- The initial state notification (idle, success, etc.)
- All subsequent notifications from fetches, cache updates, or invalidations triggered by other sources

It does **not**:
- Increment the subscriber count (so interval/focus refetching won't start on its behalf)
- Prevent garbage collection of the cache entry

---

## Active subscribers (default)

When `enabled` is `true` or not provided, the subscriber behaves normally — incrementing the subscriber count and enabling interval/focus refetching:

```ts
// Active subscriber — counts toward subscriber total
const unsub = getUsers.subscribe(
  (state) => { renderUI(state) },
  // enabled defaults to true
)
```

---

## Use cases

### Observing from unrelated components

```ts
// A header component wants to show user count without
// keeping the query alive for refetching
getUsers.subscribe(
  (state) => { badge.textContent = String(state.data?.length ?? 0) },
  { enabled: false },
)
```

### Combining with select

```ts
getUsers.subscribe(
  (state) => { console.log('Count:', state.data) },
  { enabled: false, select: (users) => users.length },
)
```

### Conditional subscription

```ts
function useQuery(enabled: boolean) {
  const unsub = getUsers.subscribe(
    (state) => { render(state) },
    { enabled },
  )
  return unsub
}
```

{% callout title="Note" type="note" %}
`enabled` on subscribe controls the subscriber's participation in the refetch lifecycle. It does **not** control whether the query can be fetched — use `enabled` on the invoke call for that (e.g., `getUsers({ enabled: false })`).
{% /callout %}
