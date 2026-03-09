---
title: Stale time & garbage collection
---

Data fetching libraries exist to solve a deceptively hard problem: **when should you re-fetch, and when should you throw away old data?** safe-query gives you two knobs to control this — `staleTime` and `gcTime` — and a stale-while-revalidate strategy that keeps your UI responsive while keeping data fresh.

---

## Core concepts

### staleTime — when data becomes stale

`staleTime` controls how long data is considered **fresh** after it is fetched. While data is fresh, safe-query will return the cached value and will **not** re-fetch.

```ts
const api = safeQuery<AppError>({
  safe,
  staleTime: 30_000, // 30 seconds — the global default for all queries
})
```

Once `Date.now() - dataUpdatedAt > staleTime`, the cache entry is marked **stale**. The next time that query is invoked or a subscriber triggers a refetch, safe-query will go to the network.

### gcTime — when unused data is removed

`gcTime` (garbage collection time) controls how long a cache entry is **kept in memory after its last subscriber unsubscribes**. The default is `300000` (5 minutes).

```ts
const api = safeQuery<AppError>({
  safe,
  gcTime: 5 * 60_000, // 5 minutes
})
```

When a cache entry has zero subscribers, a GC timer is scheduled. If no new subscriber arrives before the timer fires, the entry is permanently removed from the cache.

{% callout type="note" %}
GC only applies to entries with **zero subscribers**. As long as at least one subscriber is listening, the entry will never be garbage collected, regardless of `gcTime`.
{% /callout %}

---

## Stale-while-revalidate

safe-query implements the **stale-while-revalidate** pattern:

1. A query is invoked.
2. If there is a cached value (even if stale), return it immediately.
3. If the cached value is stale, kick off a background re-fetch.
4. When the re-fetch completes, update the cache and notify subscribers.

This means your UI is **never blocked** waiting for a network request when cached data exists. Users see the old data instantly and get seamlessly updated when the fresh data arrives.

```ts
// First call — no cache, goes to network
const [users, err] = await getUsers()

// Called again 10 seconds later (staleTime is 30s) — returns cached value, no fetch
const [users2, err2] = await getUsers()

// Called again 45 seconds later — returns cached value AND re-fetches in background
const [users3, err3] = await getUsers()
```

---

## CacheEntry lifecycle

Every cache entry goes through a predictable lifecycle:

```ts
// 1. CREATED — entry is created when a query is first invoked
//    dataUpdatedAt is set to Date.now()
//    subscriberCount starts at 0 (or 1 if a subscriber triggered it)

// 2. FRESH — Date.now() - dataUpdatedAt <= staleTime
//    Subsequent invocations return cached data without fetching

// 3. STALE — Date.now() - dataUpdatedAt > staleTime
//    Cached data is still returned, but a background re-fetch is triggered
//    After re-fetch, dataUpdatedAt is reset and the entry becomes FRESH again

// 4. GC'd — subscriberCount drops to 0 and gcTime elapses
//    Entry is permanently removed from the cache
```

A `CacheEntry` tracks everything safe-query needs:

```ts
// Internal CacheEntry structure
{
  data,              // The cached response
  normalizedData,    // Normalized version (if entity normalization is enabled)
  error,             // The last error, if any
  dataUpdatedAt,     // Timestamp of last successful fetch
  staleTime,         // Per-entry stale time
  gcTime,            // Per-entry GC time
  gcTimer,           // The scheduled GC timeout (if subscriberCount is 0)
  subscriberCount,   // Number of active subscribers
  generation,        // Incremented on each fetch to detect stale responses
  inflightPromise,   // Deduplication — shared across concurrent callers
  abortController,   // Used to cancel inflight requests
}
```

---

## Subscriber counting and GC

The garbage collector is driven by **subscriber count**:

1. When a subscriber is added (`subscribe()`), `subscriberCount` increments and any pending GC timer is **cancelled**.
2. When a subscriber is removed (the unsubscribe function is called), `subscriberCount` decrements.
3. When `subscriberCount` drops to **0**, a GC timer is scheduled for `gcTime` milliseconds in the future.
4. If a new subscriber arrives before the timer fires, the timer is cancelled and the entry stays alive.
5. If the timer fires, the entry is removed from the cache entirely.

```ts
const unsubscribe = getUsers.subscribe((state) => {
  // subscriberCount is now >= 1
  // GC timer is cancelled (if one was pending)
  renderUI(state)
})

// Later, when the component unmounts:
unsubscribe()
// subscriberCount drops by 1
// If it hits 0, a GC timer is scheduled for gcTime ms
```

{% callout type="warning" %}
If you invoke a query without subscribing, the cache entry will have `subscriberCount: 0` and the GC timer starts immediately after the data is cached. Make sure to subscribe if you need the data to stay alive.
{% /callout %}

---

## Per-query overrides

The global `staleTime` and `gcTime` are defaults. You can override them on individual queries:

```ts
// This query has data that rarely changes — keep it fresh for 10 minutes
const getCountries = api.query({
  key: '/countries',
  fn: () => fetchJson<Country[]>(buildUrl(BASE_URL, '/countries')),
  staleTime: 10 * 60_000,
  gcTime: 30 * 60_000,
})

// This query has rapidly changing data — always re-fetch
const getStockPrice = api.query({
  key: '/stocks/:symbol',
  fn: (ctx) => fetchJson<Stock>(buildUrl(BASE_URL, '/stocks/:symbol', ctx.params)),
  staleTime: 0,
  gcTime: 60_000,
})
```

---

## Recommended values by data type

Different types of data have different freshness requirements. Here are practical starting points:

| Data type | staleTime | gcTime | Rationale |
|---|---|---|---|
| **Auth / session** | `Infinity` | `Infinity` | Fetched once, never re-fetched automatically. Invalidated explicitly on logout. |
| **Reference data** (countries, categories) | `5–10 min` | `30 min` | Rarely changes. Keep it around. |
| **Lists** (users, orders, search results) | `30s–2 min` | `5 min` | Changes moderately. Short staleness keeps data current without hammering the API. |
| **Detail views** | `1–5 min` | `5 min` | Often seeded from list data via `initialData`. |
| **Real-time data** (stock prices, live scores) | `0` | `30s–1 min` | Always stale — every access triggers a re-fetch. Pair with `refetchInterval`. |

```ts
// Auth — fetch once, never auto-refetch
const getSession = api.query({
  key: '/session',
  fn: () => fetchJson<Session>(buildUrl(BASE_URL, '/session')),
  staleTime: Infinity,
  gcTime: Infinity,
})

// Reference data — fresh for 10 minutes
const getCategories = api.query({
  key: '/categories',
  fn: () => fetchJson<Category[]>(buildUrl(BASE_URL, '/categories')),
  staleTime: 10 * 60_000,
  gcTime: 30 * 60_000,
})

// Lists — fresh for 1 minute
const getOrders = api.query({
  key: '/orders',
  fn: () => fetchJson<Order[]>(buildUrl(BASE_URL, '/orders')),
  staleTime: 60_000,
  gcTime: 5 * 60_000,
})

// Real-time — always re-fetch, auto-poll every 5 seconds
const getLiveScore = api.query({
  key: '/games/:id/score',
  fn: (ctx) => fetchJson<Score>(buildUrl(BASE_URL, '/games/:id/score', ctx.params)),
  staleTime: 0,
  gcTime: 60_000,
  refetchInterval: 5_000,
})
```

---

## staleTime: 0 vs staleTime: Infinity

These are the two extremes, and both are useful:

**`staleTime: 0`** (the default) — data is stale the moment it is cached. Every query invocation with a subscriber will trigger a background re-fetch. This is the safest default because you will always get fresh data, at the cost of more network requests.

**`staleTime: Infinity`** — data is never automatically considered stale. It will be fetched once and served from cache forever (until explicitly invalidated or garbage collected). Use this for data that doesn't change during a session, like auth tokens or application config.

```ts
// Explicitly invalidate when needed
const getSession = api.query({
  key: '/session',
  fn: () => fetchJson<Session>(buildUrl(BASE_URL, '/session')),
  staleTime: Infinity,
})

// Force a re-fetch after login
await getSession.invalidate()
```

---

## Interaction between staleTime and gcTime

It is important to understand how these two timers interact:

- `staleTime` controls **freshness** — whether a background re-fetch is triggered.
- `gcTime` controls **retention** — whether the entry stays in memory at all.

`gcTime` should always be **greater than or equal to** `staleTime`. If `gcTime` is shorter than `staleTime`, you could end up in a situation where an entry is garbage collected while it is still considered fresh (though this would only happen if it has no subscribers).

```ts
// Good — gcTime > staleTime
const api = safeQuery<AppError>({
  safe,
  staleTime: 60_000,    // 1 minute
  gcTime: 5 * 60_000,   // 5 minutes
})

// Avoid — gcTime < staleTime doesn't make practical sense
const api = safeQuery<AppError>({
  safe,
  staleTime: 5 * 60_000,  // 5 minutes
  gcTime: 60_000,          // 1 minute — entry could be GC'd while "fresh"
})
```

{% callout type="note" %}
Remember: GC only runs when `subscriberCount` is 0. If your query has active subscribers, `gcTime` is irrelevant — the entry stays alive until every subscriber unsubscribes.
{% /callout %}
