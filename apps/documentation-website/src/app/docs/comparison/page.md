---
title: Comparison with try-catch
---

See how `@cometloop/safe` compares to traditional try-catch error handling — and how `createSafe` keeps call sites as clean as possible. {% .lead %}

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

## With createSafe (recommended)

The best way to use `@cometloop/safe` is with `createSafe`. Configure error handling once, wrap your functions, and the call site looks like normal code:

```ts
// Configure once — in a shared module like lib/safe.ts
const appSafe = createSafe({
  parseError: (e) => ({
    code: e instanceof Error ? e.name : 'UNKNOWN',
    message: e instanceof Error ? e.message : String(e),
  }),
  defaultError: { code: 'UNKNOWN', message: 'Unknown error' },
})

// Wrap functions once
const safeFetchOrder = appSafe.wrapAsync(fetchOrder)
const safeProcessPayment = appSafe.wrapAsync(processPayment)
```

```ts
// Call site — clean and minimal, just like normal function calls
async function processOrder(orderId: string) {
  const [order, fetchError] = await safeFetchOrder(orderId)
  if (fetchError) {
    console.error('Failed to fetch order:', fetchError.message)
    return null
  }

  const [payment, paymentError] = await safeProcessPayment(order)
  if (paymentError) {
    console.error('Payment failed:', paymentError.message)
    return null
  }

  return { order, payment }
}
```

**Benefits:**

- **Clean call sites** — looks like calling a normal function, no extra noise
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

**createSafe + wrap:**

```ts
const safeDivide = appSafe.wrap((a: number, b: number) => {
  if (b === 0) throw new Error('Division by zero')
  return a / b
})

// Call site is clean — just a function call
const [result, error] = safeDivide(10, 2)
if (error) {
  // Unambiguous: this was an error, fully typed
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

**createSafe + wrapAsync:**

```ts
// Error mapping is configured once in createSafe — not repeated here
const safeGetUser = appSafe.wrapAsync(async (id: string) => {
  const response = await fetch(`/api/users/${id}`)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
})

// Call site is minimal — just call the function
const [user, error] = await safeGetUser('42')
if (error) {
  // error is fully typed — no `unknown`, no manual narrowing
  console.error(`${error.code}: ${error.message}`)
}
```

{% callout title="When to use try-catch" type="note" %}
`safe` is not a complete replacement for try-catch. Use try-catch when you need to catch errors from a block of code and don't need typed errors. Use `safe` when you want type-safe, composable error handling with explicit error types.
{% /callout %}
