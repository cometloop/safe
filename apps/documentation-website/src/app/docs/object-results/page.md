---
title: What if I don't like tuples?
---

Some developers prefer plain objects over tuple destructuring. The `withObjects` function converts any safe result, wrapped function, or entire `SafeInstance` into object-style results — `{ ok, data, error }` — that are enumerable, spreadable, and JSON-serializable. {% .lead %}

---

## Use withObjects

Safe's default result format is a tagged tuple:

```ts
const [value, error] = safe.sync(() => 42)
```

Tuples are great for destructuring, but they have some rough edges:

- The `.ok`, `.value`, `.error` properties are non-enumerable — they don't show up in `Object.keys()`, `JSON.stringify()`, or spreads
- You can't easily log or serialize a result without manually extracting fields
- Some teams prefer the explicit naming of `result.data` over positional `result[0]`

`withObjects` solves all of this.

---

## Basic usage

Wrap any safe result to get an object:

```ts
import { safe, withObjects } from '@cometloop/safe'

const result = withObjects(safe.sync(() => 42))
// { ok: true, data: 42, error: null }

if (result.ok) {
  console.log(result.data) // 42
} else {
  console.error(result.error)
}
```

The returned object is a plain `SafeResultObj<T, E>` — fully enumerable, spreadable, and serializable:

```ts
Object.keys(result)    // ['ok', 'data', 'error']
JSON.stringify(result)  // '{"ok":true,"data":42,"error":null}'
const copy = { ...result } // works as expected
```

---

## What can you wrap?

`withObjects` accepts five input types. TypeScript resolves the correct overload automatically.

### 1. A single result tuple

```ts
const result = withObjects(safe.sync(() => JSON.parse('{"a":1}')))
// SafeResultObj<any, Error>  →  { ok: true, data: { a: 1 }, error: null }
```

### 2. A Promise of a result

```ts
const result = await withObjects(safe.async(() => fetchUser()))
// Promise<SafeResultObj<User, Error>>
```

### 3. A sync wrapped function

```ts
const safeParse = withObjects(safe.wrap(JSON.parse))
// (text: string, reviver?: ...) => SafeResultObj<any, Error>

safeParse('{"a":1}')  // { ok: true, data: { a: 1 }, error: null }
safeParse('bad json')  // { ok: false, data: null, error: SyntaxError }
```

### 4. An async wrapped function

```ts
const safeFetch = withObjects(safe.wrapAsync(fetchUser))
// (id: string) => Promise<SafeResultObj<User, Error>>

const result = await safeFetch('123')
```

### 5. An entire SafeInstance

This is the most powerful form — wrap a `createSafe` instance and all its methods return objects:

```ts
import { createSafe, withObjects } from '@cometloop/safe'

const appSafe = withObjects(
  createSafe({
    parseError: (e) => ({
      code: e instanceof Error ? e.name : 'UNKNOWN',
      message: e instanceof Error ? e.message : String(e),
    }),
    defaultError: { code: 'UNKNOWN', message: 'An unknown error occurred' },
  })
)

// Every method now returns SafeResultObj instead of SafeResult tuples
const result = appSafe.sync(() => 42)
// { ok: true, data: 42, error: null }

const safeParse = appSafe.wrap(JSON.parse)
safeParse('{"a":1}')  // { ok: true, data: { a: 1 }, error: null }

const users = await appSafe.all({
  alice: () => fetchUser('alice'),
  bob: () => fetchUser('bob'),
})
// { ok: true, data: { alice: User, bob: User }, error: null }
```

{% callout title="Full feature parity" type="note" %}
A wrapped `SafeObjectInstance` supports everything the original does — hooks, `parseResult`, retry, `abortAfter`, `all`, and `allSettled`. The only difference is the return shape.
{% /callout %}

---

## Type narrowing

Object results use the `ok` discriminant just like tuples:

```ts
const result = withObjects(safe.sync(() => fetchConfig()))

if (result.ok) {
  result.data   // Config (narrowed)
  result.error  // null
} else {
  result.data   // null
  result.error  // Error (narrowed)
}
```

---

## okObj and errObj constructors

If you need to construct object results manually (e.g. in tests or utility functions), use `okObj` and `errObj`:

```ts
import { okObj, errObj, type SafeResultObj } from '@cometloop/safe'

function validate(input: string): SafeResultObj<number, string> {
  const n = Number(input)
  if (Number.isNaN(n)) return errObj('not a number')
  return okObj(n)
}

const result = validate('42')
// { ok: true, data: 42, error: null }
```

---

## Type reference

```ts
type SafeOkObj<T> = {
  readonly ok: true
  readonly data: T
  readonly error: null
}

type SafeErrObj<E> = {
  readonly ok: false
  readonly data: null
  readonly error: E
}

type SafeResultObj<T, E = Error> = SafeOkObj<T> | SafeErrObj<E>
```

`SafeObjectInstance<E, TResult>` mirrors `SafeInstance<E, TResult>` exactly, with every `SafeResult` replaced by `SafeResultObj`.

---

## When to use which?

|                       | Tuples (`SafeResult`)                             | Objects (`SafeResultObj`)                          |
| --------------------- | ------------------------------------------------- | -------------------------------------------------- |
| Destructuring         | `const [data, err] = ...`                         | `const { data, error } = ...`                      |
| Enumerable properties | No (`.ok`, `.value`, `.error` are non-enumerable) | Yes                                                |
| JSON serializable     | Serializes as array `[42, null]`                  | Serializes as `{"ok":true,"data":42,"error":null}` |
| Spreadable            | Spread loses tagged properties                    | Spread preserves all properties                    |
| Performance           | Marginally faster (no wrapper overhead)           | Tiny overhead from `withObjects` conversion        |

Both formats support the same type narrowing via the `ok` discriminant. Choose whichever fits your team's style — the library doesn't judge.
