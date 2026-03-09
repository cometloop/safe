---
title: Infinite Queries
---

Use `infiniteQuery` for cursor-based pagination with automatic page merging, bidirectional fetching, and familiar reactive state. {% .lead %}

---

## Basic usage

```ts
type Post = { id: string; title: string; cursor: string }

const getPosts = api.infiniteQuery({
  key: '/posts',
  fn: ({ pageParam }) =>
    fetch(`/api/posts?cursor=${pageParam ?? ''}`)
      .then(r => r.json()) as Promise<Post[]>,
  initialPageParam: null as string | null,
  getNextPageParam: (lastPage) => {
    const lastPost = lastPage[lastPage.length - 1]
    return lastPost?.cursor || undefined // undefined = no more pages
  },
})

// Fetch first page
const [result, err] = await getPosts()
result.pages     // Post[][] — array of page arrays
result.pageParams // unknown[] — the page param used for each page
```

---

## Fetching more pages

```ts
// Fetch and append the next page
await getPosts.fetchNextPage()

// Fetch and prepend the previous page (requires getPreviousPageParam)
await getPosts.fetchPreviousPage()
```

`fetchNextPage` calls `getNextPageParam` with the last page to determine the next page param. If it returns `undefined`, no fetch is made and the current data is returned.

---

## Bidirectional pagination

For feeds or chat-like UIs where you can scroll in both directions:

```ts
const getMessages = api.infiniteQuery({
  key: '/messages',
  fn: ({ pageParam }) => fetchMessages(pageParam),
  initialPageParam: 'latest',
  getNextPageParam: (lastPage) => lastPage.nextCursor,
  getPreviousPageParam: (firstPage) => firstPage.prevCursor,
})

await getMessages()
await getMessages.fetchNextPage()     // newer messages
await getMessages.fetchPreviousPage() // older messages
```

---

## Subscribing to state

```ts
getPosts.subscribe((state) => {
  state.data                   // { pages: Post[][], pageParams: unknown[] } | undefined
  state.status                 // 'idle' | 'loading' | 'success' | 'error'
  state.hasNextPage            // boolean — based on getNextPageParam
  state.hasPreviousPage        // boolean — based on getPreviousPageParam
  state.isFetching             // boolean — any fetch in progress
  state.isFetchingNextPage     // boolean — fetchNextPage in progress
  state.isFetchingPreviousPage // boolean — fetchPreviousPage in progress
  state.isStale                // boolean
  state.error                  // AppError | null
  state.dataUpdatedAt          // number | null
})
```

---

## Page limits

Use `maxPages` to cap the number of stored pages. When exceeded, the oldest pages are dropped (forward fetching) or newest pages are dropped (backward fetching):

```ts
const getPosts = api.infiniteQuery({
  key: '/posts',
  fn: ({ pageParam }) => fetchPosts(pageParam),
  initialPageParam: null,
  getNextPageParam: (lastPage) => lastPage.nextCursor,
  maxPages: 5, // only keep 5 pages in memory
})
```

This keeps memory usage bounded for infinite scroll UIs.

---

## Refetching

`refetch()` re-fetches all currently loaded pages in order, using the same page params:

```ts
await getPosts.refetch() // re-fetches every loaded page
```

`invalidate()` marks the data as stale so the next invoke triggers a refetch:

```ts
getPosts.invalidate()
```

---

## Cancellation

Cancel the current page fetch with `cancel()`:

```ts
getPosts.cancel()
```

---

## Path params

Infinite queries support path params just like regular queries:

```ts
const getUserPosts = api.infiniteQuery({
  key: '/users/:userId/posts',
  fn: ({ params, pageParam }) =>
    fetch(`/api/users/${params.userId}/posts?cursor=${pageParam}`)
      .then(r => r.json()),
  initialPageParam: null,
  getNextPageParam: (lastPage) => lastPage.nextCursor,
})

await getUserPosts({ params: { userId: 'u1' } })
await getUserPosts.fetchNextPage({ params: { userId: 'u1' } })
```

---

## Configuration

| Option | Required | Description |
|--------|----------|-------------|
| `key` | Yes | Path pattern (supports `:param` segments) |
| `fn` | Yes | Fetch function, receives `{ pageParam, params?, searchParams?, signal }` |
| `initialPageParam` | Yes | Page param for the first page |
| `getNextPageParam` | Yes | `(lastPage, allPages) => nextParam \| undefined` |
| `getPreviousPageParam` | No | `(firstPage, allPages) => prevParam \| undefined` |
| `maxPages` | No | Maximum number of pages to keep in memory |
| `staleTime` | No | Override client default |
| `gcTime` | No | Override client default |
| `parseResponse` | No | Transform raw response before normalization |
| `mapToEntities` | No | Transform data for entity normalization |
| `normalize` | No | Explicit entity extraction |

{% callout title="Entity normalization" type="note" %}
Infinite queries support entity normalization. Each page is normalized independently, so entities from any page are available in the entity store for other queries to reference.
{% /callout %}
