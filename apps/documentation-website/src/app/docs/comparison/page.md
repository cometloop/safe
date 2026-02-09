---
title: Comparison with try-catch
---

See how `safe` compares to traditional try-catch error handling. {% .lead %}

---

## Traditional try-catch

```ts
// Problems: error type is unknown, nested try-catch, easy to forget handling
async function processOrder(orderId: string) {
  let order
  try {
    order = await fetchOrder(orderId)
  } catch (e) {
    // e is unknown - need manual type narrowing
    console.error('Failed to fetch order')
    return null
  }

  let payment
  try {
    payment = await processPayment(order)
  } catch (e) {
    // Another catch block
    console.error('Payment failed')
    return null
  }

  return { order, payment }
}
```

**Issues with try-catch:**

- `catch (e)` gives you `unknown` — no type safety
- Nested try-catch blocks make code hard to read
- Easy to forget error handling entirely
- Error type varies between catch blocks
- Variables must be declared outside the try block (`let order`)

---

## With safe utilities

```ts
// Benefits: typed errors, flat structure, explicit handling
async function processOrder(orderId: string) {
  const [order, fetchError] = await safe.async(() => fetchOrder(orderId))
  if (fetchError) {
    console.error('Failed to fetch order:', fetchError.message)
    return null
  }

  const [payment, paymentError] = await safe.async(() => processPayment(order))
  if (paymentError) {
    console.error('Payment failed:', paymentError.message)
    return null
  }

  return { order, payment }
}
```

**Benefits of safe:**

- Errors are **typed** — TypeScript knows the exact error shape
- **Flat structure** — no nesting, reads top to bottom
- **Explicit** — errors are part of the return type, impossible to forget
- **Composable** — easy to chain operations
- Variables are `const` — no need for `let` declarations

---

## Side-by-side comparison

### Wrapping a function

**try-catch:**

```ts
function safeDivide(a: number, b: number): number | null {
  try {
    if (b === 0) throw new Error('Division by zero')
    return a / b
  } catch (e) {
    console.error(e)
    return null
  }
}

const result = safeDivide(10, 2)
if (result === null) {
  // Was it an error or did the function return null?
}
```

**safe.wrap:**

```ts
const safeDivide = safe.wrap((a: number, b: number) => {
  if (b === 0) throw new Error('Division by zero')
  return a / b
})

const [result, error] = safeDivide(10, 2)
if (error) {
  // Unambiguous: this was an error
  console.error(error.message)
}
```

### API request with error handling

**try-catch:**

```ts
async function getUser(id: string) {
  try {
    const response = await fetch(`/api/users/${id}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (e) {
    // e is unknown - is it a network error? HTTP error? JSON parse error?
    if (e instanceof TypeError) {
      console.error('Network error')
    } else if (e instanceof Error) {
      console.error('Request failed:', e.message)
    }
    return null
  }
}
```

**safe.async:**

```ts
type ApiError = {
  type: 'NETWORK' | 'HTTP' | 'PARSE' | 'UNKNOWN'
  message: string
}

const getUser = async (id: string) => {
  const [user, error] = await safe.async(
    async () => {
      const response = await fetch(`/api/users/${id}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    },
    (e): ApiError => ({
      type: e instanceof TypeError ? 'NETWORK' : 'HTTP',
      message: e instanceof Error ? e.message : 'Unknown error',
    })
  )

  if (error) {
    // error is fully typed as ApiError
    console.error(`${error.type}: ${error.message}`)
    return null
  }

  return user
}
```

{% callout title="When to use try-catch" type="note" %}
`safe` is not a complete replacement for try-catch. Use try-catch when you need to catch errors from a block of code and don't need typed errors. Use `safe` when you want type-safe, composable error handling with explicit error types.
{% /callout %}
