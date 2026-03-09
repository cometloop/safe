---
title: Query Cancellation
---

Cancel in-flight requests from outside the query using `cancel()` on the query callable or `cancelQuery()` on the client. {% .lead %}

---

## Per-query cancellation

Every query callable has a `cancel()` method that aborts the in-flight request and notifies subscribers:

```ts
const getUsers = api.query({
  key: '/users',
  fn: ({ signal }) => fetch('/api/users', { signal }).then(r => r.json()),
})

getUsers() // starts fetch
getUsers.cancel() // aborts it — signal.aborted becomes true
```

The `signal` passed to your `fn` is an `AbortSignal` that will be aborted when `cancel()` is called. Pass it to `fetch` or any other API that supports abort signals.

---

## Cancelling parameterized queries

For queries with path params, pass the same params to `cancel()`:

```ts
const getUser = api.query({
  key: '/users/:id',
  fn: ({ params, signal }) =>
    fetch(`/api/users/${params.id}`, { signal }).then(r => r.json()),
})

getUser({ params: { id: '1' } }) // starts fetch for user 1
getUser({ params: { id: '2' } }) // starts fetch for user 2

getUser.cancel({ params: { id: '1' } }) // cancels only user 1's fetch
```

---

## Client-level cancellation

Cancel any query by path using `cancelQuery()` on the client:

```ts
api.cancelQuery('/users')
api.cancelQuery('/users/:id', { params: { id: '1' } })
api.cancelQuery('/users', { searchParams: { page: 2 } })
```

---

## After cancellation

After cancellation:
- Subscribers are notified immediately
- The query's `isFetching` becomes `false`
- The query can be fetched again normally on the next invoke
- Any cached data from before the cancelled request is preserved

```ts
getUsers.cancel()

// Subsequent fetch proceeds normally
const [result, err] = await getUsers()
```

{% callout title="Automatic cancellation" type="note" %}
Queries are also automatically cancelled by `invalidate()`, `refetch()`, and `destroy()`. The `cancel()` method is for explicit cancellation when you need to abort a request without triggering a new one.
{% /callout %}
