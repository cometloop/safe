---
title: Background refetching
---

Background refetching keeps your cached data fresh without requiring the user to manually trigger a fetch. safe-query provides three mechanisms: interval-based polling, visibility-aware polling, and window focus refetching.

---

## Overview

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `refetchInterval` | `number \| false` | `false` | Milliseconds between automatic refetches. Set to a number to enable polling. |
| `refetchIntervalInBackground` | `boolean` | `false` | When `true`, polling continues even when the browser tab is hidden. |
| `refetchOnWindowFocus` | `boolean` | `false` | When `true`, stale queries are refetched when the window regains focus. |

All three options can be set at the client level (applies to all queries) or per-query (overrides the client default).

{% callout type="note" %}
Background refetching is **subscriber-gated**. Polling and focus refetching only run while a query has at least one active subscriber. When the last subscriber unsubscribes, timers are cleaned up and focus listeners are removed.
{% /callout %}

---

## refetchInterval

Set `refetchInterval` to a number (in milliseconds) to enable automatic polling. Every N milliseconds, safe-query calls `invoke()` on the query, which triggers a network request if the cached data is stale.

### Client-level default

```ts
const api = safeQuery<AppError>({
  safe,
  refetchInterval: 30_000, // Poll every 30 seconds
})
```

Every query created from this client will poll every 30 seconds while it has subscribers.

### Per-query override

```ts
const getNotifications = api.query({
  key: '/notifications',
  fn: () => fetchJson<Notification[]>(buildUrl(BASE_URL, '/notifications')),
  refetchInterval: 10_000, // This query polls every 10 seconds
})

const getSettings = api.query({
  key: '/settings',
  fn: () => fetchJson<Settings>(buildUrl(BASE_URL, '/settings')),
  refetchInterval: false, // This query never polls, regardless of client default
})
```

### How it works

1. When the first subscriber is added to a query, an interval timer is started.
2. On each tick, safe-query checks:
   - Is the client still active (not disposed)?
   - Does the query still have subscribers?
   - If `refetchIntervalInBackground` is `false`, is the document visible?
3. If all checks pass, `invoke()` is called, which fetches fresh data from the server.
4. When the last subscriber unsubscribes, the interval timer is cleared.

---

## refetchIntervalInBackground

By default, interval-based polling pauses when the browser tab is hidden (`document.visibilityState !== 'visible'`). This saves network traffic and battery life when the user is not looking at your app.

Set `refetchIntervalInBackground` to `true` to continue polling even when the tab is hidden:

```ts
const api = safeQuery<AppError>({
  safe,
  refetchInterval: 5_000,
  refetchIntervalInBackground: true, // Keep polling even when tab is hidden
})
```

{% callout type="warning" %}
Enabling background polling generates network traffic even when the user is not looking at your app. This can impact battery life on mobile devices and increase server load. Only enable this when your use case truly requires it, such as a real-time monitoring dashboard that must stay current.
{% /callout %}

You can also set this per-query:

```ts
const getAlerts = api.query({
  key: '/alerts',
  fn: () => fetchJson<Alert[]>(buildUrl(BASE_URL, '/alerts')),
  refetchInterval: 5_000,
  refetchIntervalInBackground: true, // Critical alerts should poll even in background
})
```

---

## refetchOnWindowFocus

When `refetchOnWindowFocus` is `true`, safe-query refetches stale queries when the browser tab regains visibility. This is powered by the `FocusManager`, which listens for the `visibilitychange` event on `document`.

```ts
const api = safeQuery<AppError>({
  safe,
  staleTime: 30_000,
  refetchOnWindowFocus: true,
})
```

### How it works

1. When the first subscriber is added to a query, a focus listener is registered with the `FocusManager`.
2. When `document.visibilityState` changes to `'visible'`, the listener fires.
3. The listener checks:
   - Is the client still active (not disposed)?
   - Does the query still have subscribers?
   - Is the query stale?
4. If all checks pass, `invoke()` is called.
5. When the last subscriber unsubscribes, the focus listener is removed.

The staleness check is important. If the user switches tabs and comes back within the `staleTime` window, no refetch occurs because the data is still considered fresh.

### Per-query override

```ts
const getProfile = api.query({
  key: '/profile',
  fn: () => fetchJson<Profile>(buildUrl(BASE_URL, '/profile')),
  staleTime: 60_000,
  refetchOnWindowFocus: true, // Refetch when user comes back to the tab
})

const getStaticConfig = api.query({
  key: '/config',
  fn: () => fetchJson<Config>(buildUrl(BASE_URL, '/config')),
  staleTime: 10 * 60_000,
  refetchOnWindowFocus: false, // Config rarely changes, skip focus refetching
})
```

---

## FocusManager

The `FocusManager` is an internal class that manages `visibilitychange` event listeners. It is created automatically by the `safeQuery` client and shared across all queries.

Key behaviors:
- It listens for `document.visibilitychange` and fires all registered callbacks when the document becomes visible.
- In server-side environments where `document` is not available, `isFocused()` always returns `true` and no event listeners are registered.
- When the client is destroyed via `api.destroy()`, the `FocusManager` is also destroyed, removing all event listeners.

You do not interact with the `FocusManager` directly. It is managed entirely by the client and individual queries.

---

## Subscriber-gated polling

Both `refetchInterval` and `refetchOnWindowFocus` are subscriber-gated: they only activate when a query has at least one subscriber. This prevents unnecessary network traffic for queries that nobody is listening to.

```ts
const getUsers = api.query({
  key: '/users',
  fn: () => fetchJson<User[]>(buildUrl(BASE_URL, '/users')),
  refetchInterval: 15_000,
  refetchOnWindowFocus: true,
})

// No polling or focus refetching yet -- no subscribers

const unsub = getUsers.subscribe((state) => {
  renderUserList(state.data)
})
// Polling starts now (every 15s). Focus refetching is active.

unsub()
// Polling stops. Focus listener is removed.
```

This means you can safely configure aggressive polling intervals on queries without worrying about wasted requests. The timers only run while your UI is actively consuming the data.

---

## Patterns

### Real-time feed

A social media feed that stays current while the user is viewing it:

```ts
const api = safeQuery<AppError>({
  safe,
  staleTime: 0,
})

const getFeed = api.query({
  key: '/feed',
  fn: () => fetchJson<FeedItem[]>(buildUrl(BASE_URL, '/feed')),
  refetchInterval: 10_000,
  refetchOnWindowFocus: true,
})

// Feed polls every 10 seconds while subscribed.
// When the user switches to another tab and comes back, it refetches immediately.
const unsub = getFeed.subscribe((state) => {
  if (state.data) {
    renderFeed(state.data)
  }
})

await getFeed()
```

### Notification polling

A notification badge that updates frequently but pauses when the tab is hidden:

```ts
const getUnreadCount = api.query({
  key: '/notifications/unread-count',
  fn: () => fetchJson<{ count: number }>(buildUrl(BASE_URL, '/notifications/unread-count')),
  refetchInterval: 15_000,
  refetchIntervalInBackground: false, // Pause when tab is hidden (default)
  refetchOnWindowFocus: true,         // Catch up immediately when user returns
  staleTime: 0,                       // Always refetch
})

const unsub = getUnreadCount.subscribe((state) => {
  if (state.data) {
    updateBadge(state.data.count)
  }
})

await getUnreadCount()
```

When the user switches to another tab, polling pauses. When they switch back, `refetchOnWindowFocus` immediately fires a request since `staleTime` is `0` (always stale). Then polling resumes on the next interval tick.

### Dashboard with mixed intervals

A dashboard where different sections have different freshness requirements:

```ts
const api = safeQuery<AppError>({
  safe,
  staleTime: 10_000,
  refetchOnWindowFocus: true,
})

// Revenue numbers update slowly -- poll every 60 seconds
const getRevenue = api.query({
  key: '/dashboard/revenue',
  fn: () => fetchJson<Revenue>(buildUrl(BASE_URL, '/dashboard/revenue')),
  refetchInterval: 60_000,
  staleTime: 30_000,
})

// Active user count changes fast -- poll every 5 seconds
const getActiveUsers = api.query({
  key: '/dashboard/active-users',
  fn: () => fetchJson<{ count: number }>(buildUrl(BASE_URL, '/dashboard/active-users')),
  refetchInterval: 5_000,
  staleTime: 0,
})

// System status is critical -- poll every 10 seconds even in background
const getSystemStatus = api.query({
  key: '/dashboard/status',
  fn: () => fetchJson<SystemStatus>(buildUrl(BASE_URL, '/dashboard/status')),
  refetchInterval: 10_000,
  refetchIntervalInBackground: true,
  staleTime: 0,
})
```

Each query independently manages its own polling interval and focus behavior. Per-query settings override the client defaults, so you can fine-tune freshness requirements for each data source.

---

## What's next?

- [Stale time](/docs/stale-time) -- understand how staleness affects refetching
- [Subscriptions](/docs/subscriptions) -- learn how subscribers control background behavior
- [Cache invalidation](/docs/cache-invalidation) -- manually trigger refetches when you know data has changed
