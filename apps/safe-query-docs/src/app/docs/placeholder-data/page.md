---
title: Placeholder data
---

Placeholder data lets you show **transient data** to the user while a query is fetching. Unlike `initialData`, placeholder data is **not stored in the cache** — it exists only as a temporary stand-in until the real data arrives.

This is useful when you can provide a reasonable approximation of the data (from a list view, a previous page, or a skeleton shape) and want to avoid showing a loading spinner.

---

## How it works

When a query is invoked and there is no cached data, safe-query checks for `placeholderData`:

1. If `placeholderData` is provided and there is no cache entry, the query state is set to `status: 'success'` with `isPlaceholderData: true`.
2. The fetch proceeds normally in the background.
3. When the real data arrives, the placeholder is replaced and `isPlaceholderData` becomes `false`.

```ts
const getUser = api.query({
  key: '/users/:id',
  fn: (ctx) => fetchJson<User>(buildUrl(BASE_URL, '/users/:id', ctx.params)),
  placeholderData: {
    id: 0,
    name: 'Loading...',
    email: '',
    __type: 'User',
  },
})
```

{% callout type="warning" %}
Placeholder data is **never written to the cache**. It exists only in the subscriber's state. If you need data that persists in the cache, use [`initialData`](/docs/initial-data) instead.
{% /callout %}

---

## Static placeholder data

The simplest form is a static value — a hardcoded object that matches the shape of your data:

```ts
const getUser = api.query({
  key: '/users/:id',
  fn: (ctx) => fetchJson<User>(buildUrl(BASE_URL, '/users/:id', ctx.params)),
  placeholderData: {
    id: 0,
    name: '—',
    email: '—',
    avatar: '/placeholder-avatar.png',
    __type: 'User',
  },
})
```

This works well for skeleton UIs where you want to show the page layout with placeholder content while the real data loads.

---

## Function form with DataFnContext

For dynamic placeholder data, use a function. The function receives a `DataFnContext` with access to query parameters and the entity store:

```ts
type DataFnContext = {
  getEntity: (type: string, id: string) => any | undefined
  params?: Record<string, string>
  searchParams?: Record<string, string>
}
```

This is where placeholder data becomes powerful — you can pull data from the entity store to show a preview while the full data loads.

```ts
const getUser = api.query({
  key: '/users/:id',
  fn: (ctx) => fetchJson<UserDetail>(buildUrl(BASE_URL, '/users/:id', ctx.params)),
  placeholderData: (ctx) => {
    // Pull the user from the entity store — may have been cached
    // by a list query with partial data
    const user = ctx.getEntity('User', ctx.params?.id)
    if (!user) return undefined // No placeholder available

    // Return what we have — the detail view may have more fields
    return {
      ...user,
      bio: '',
      joinedAt: '',
      posts: [],
    }
  },
})
```

If the function returns `undefined`, no placeholder is used and the query behaves as if `placeholderData` was not configured.

---

## The isPlaceholderData flag

When placeholder data is active, the query state includes `isPlaceholderData: true`. Use this to adjust your UI — for example, to show a subtle loading indicator or to disable interactions:

```ts
getUser.subscribe(
  (state) => {
    if (state.isPlaceholderData) {
      // Show the data but with a shimmer effect or reduced opacity
      renderUserDetail(state.data, { shimmer: true })
    } else {
      // Real data — render normally
      renderUserDetail(state.data)
    }
  },
  { params: { id: '42' } },
)
```

---

## Status during placeholder

While placeholder data is active, the query state shows `status: 'success'` — not `'loading'`. This is intentional: from the subscriber's perspective, there **is** data available, even though it is transient.

```ts
getUser.subscribe((state) => {
  console.log(state.status)           // 'success' (even during placeholder)
  console.log(state.data)             // The placeholder data
  console.log(state.isPlaceholderData) // true
  console.log(state.isFetching)       // true (fetch is in progress)
})
```

This means you can write your rendering logic to check `status === 'success'` and always have data to display. Use `isPlaceholderData` to differentiate between placeholder and real data when it matters.

---

## Pattern: list-to-detail with placeholder data

The most common use case for placeholder data is showing a preview from a list query while a detail query loads. The list query returns partial data (name, avatar) and the detail query returns the full record (bio, settings, activity).

```ts
type UserSummary = {
  id: number
  name: string
  avatar: string
  __type: 'User'
}

type UserDetail = {
  id: number
  name: string
  avatar: string
  bio: string
  email: string
  joinedAt: string
  __type: 'User'
}

// List query returns summaries
const getUsers = api.query({
  key: '/users',
  fn: () => fetchJson<UserSummary[]>(buildUrl(BASE_URL, '/users')),
})

// Detail query uses list data as a placeholder
const getUser = api.query({
  key: '/users/:id',
  fn: (ctx) => fetchJson<UserDetail>(buildUrl(BASE_URL, '/users/:id', ctx.params)),
  placeholderData: (ctx) => {
    const user = ctx.getEntity('User', ctx.params?.id)
    if (!user) return undefined

    return {
      ...user,
      bio: '',
      email: '',
      joinedAt: '',
    }
  },
})
```

When a user clicks on a list item, the detail view immediately shows the name and avatar (from the entity store) while the full profile loads in the background. No loading spinner, no layout shift.

---

## Pattern: skeleton data

When you have no prior data but still want to avoid a loading state, use static skeleton data:

```ts
const getDashboard = api.query({
  key: '/dashboard',
  fn: () => fetchJson<Dashboard>(buildUrl(BASE_URL, '/dashboard')),
  placeholderData: {
    totalRevenue: 0,
    activeUsers: 0,
    recentOrders: [],
    chartData: [],
  },
})

getDashboard.subscribe((state) => {
  if (state.isPlaceholderData) {
    // Render the dashboard layout with zeroed-out values and a shimmer
    renderDashboard(state.data, { loading: true })
  } else {
    renderDashboard(state.data)
  }
})
```

---

## Placeholder data vs initial data

These two features serve different purposes. Choosing the wrong one leads to subtle bugs.

| | `placeholderData` | `initialData` |
|---|---|---|
| **Stored in cache** | No | Yes |
| **Affects staleness** | No | Yes (via `initialDataUpdatedAt`) |
| **Visible to other subscribers** | No (per-subscription) | Yes (all subscribers see it) |
| **Replaced when real data arrives** | Yes | Only if refetch occurs |
| **`isPlaceholderData` flag** | `true` | `false` |
| **Use case** | Transient preview while fetching | Pre-populated cache (SSR, seeding) |

**Use `placeholderData` when:**
- You want to show *something* while data loads
- The placeholder is approximate or incomplete
- You do not want the placeholder to persist if the fetch fails

**Use `initialData` when:**
- You have real, valid data to seed the cache with
- You want to prevent a fetch entirely (if the data is still fresh)
- You want other subscribers to see the same seeded data
- You are hydrating from SSR or localStorage

```ts
// placeholderData — transient, not cached
const getUser = api.query({
  key: '/users/:id',
  fn: (ctx) => fetchJson<UserDetail>(buildUrl(BASE_URL, '/users/:id', ctx.params)),
  placeholderData: (ctx) => ctx.getEntity('User', ctx.params?.id),
})

// initialData — cached, affects staleness
const getUser = api.query({
  key: '/users/:id',
  fn: (ctx) => fetchJson<UserDetail>(buildUrl(BASE_URL, '/users/:id', ctx.params)),
  initialData: (ctx) => ctx.getEntity('User', ctx.params?.id),
  initialDataUpdatedAt: Date.now(), // Treat as freshly fetched
})
```

See [Initial data](/docs/initial-data) for more on cache seeding.
