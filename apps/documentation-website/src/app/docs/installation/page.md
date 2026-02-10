---
title: Installation
---

Get `@cometloop/safe` installed in your project. {% .lead %}

---

## Install

```bash
pnpm add @cometloop/safe
```

Or with npm:

```bash
npm install @cometloop/safe
```

Or with yarn:

```bash
yarn add @cometloop/safe
```

---

## Import

```ts
// Core utilities
import { safe, createSafe } from '@cometloop/safe'

// Result constructors (for building SafeResult values manually)
import { ok, err } from '@cometloop/safe'

// Error class
import { TimeoutError } from '@cometloop/safe'

// Types
import type { SafeResult, SafeOk, SafeErr, SafeHooks, SafeAsyncHooks,
  RetryConfig, CreateSafeConfig, SafeInstance, NonFalsy } from '@cometloop/safe'
```

**Key exports:**

- **`safe`** — core utility with `sync`, `async`, `wrap`, `wrapAsync`, `all`, and `allSettled` methods
- **`createSafe`** — factory function for creating pre-configured safe instances
- **`ok`** / **`err`** — construct `SafeResult` values manually
- **`TimeoutError`** — error class thrown when an operation exceeds its timeout
- **Types** — `SafeResult`, `SafeOk`, `SafeErr`, `SafeHooks`, `SafeAsyncHooks`, `RetryConfig`, `CreateSafeConfig`, `SafeInstance`, `NonFalsy`

---

## Next steps

- [safe.wrap](/docs/safe-wrap) — wrap sync functions to return SafeResult
- [safe.wrapAsync](/docs/safe-wrap-async) — wrap async functions to return SafeResult
- [createSafe](/docs/create-safe) — factory for pre-configured instances
- [Types](/docs/types) — full type reference
