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
import { safe, createSafe, TimeoutError } from '@cometloop/safe'
```

The library exports three main items:

- **`safe`** — the core utility with `sync`, `async`, `wrap`, and `wrapAsync` methods
- **`createSafe`** — a factory function for creating pre-configured safe instances
- **`TimeoutError`** — error class thrown when an operation exceeds its timeout

---

## Project structure

The safe module is organized into separate files for maintainability:

```text
src/
├── index.ts              # Main entry point (re-exports all)
└── safe/
    ├── index.ts          # Barrel exports
    ├── types.ts          # Type definitions
    ├── safe.ts           # Core functions (sync, async, wrap, wrapAsync)
    ├── createSafe.ts     # Factory function for pre-configured instances
    ├── safe.test.ts      # Tests for core functions (345 tests)
    └── createSafe.test.ts # Tests for factory function (180 tests)
```

| File | Description |
| --- | --- |
| `types.ts` | Type definitions: `SafeResult`, `SafeHooks`, `SafeAsyncHooks`, `RetryConfig`, `TimeoutError`, `CreateSafeConfig`, `SafeInstance` |
| `safe.ts` | Core safe utilities: `sync`, `async`, `wrap`, `wrapAsync` with retry and timeout support |
| `createSafe.ts` | Factory function for creating pre-configured safe instances |
| `index.ts` | Barrel file that re-exports everything |

---

## Next steps

- [safe.sync](/docs/safe-sync) — synchronous error handling
- [safe.async](/docs/safe-async) — asynchronous error handling
- [Types](/docs/types) — full type reference
