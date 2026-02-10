---
title: createSafe examples
---

The `createSafe` factory is ideal when you need consistent error handling across a module, service, or entire application layer. {% .lead %}

---

## Application-wide error handling

Create a centralized error handling instance for your entire application:

```ts
import { createSafe } from '@cometloop/safe'
import * as Sentry from '@sentry/node'

type AppError = {
  code: string
  message: string
  requestId?: string
  stack?: string
}

export const appSafe = createSafe({
  parseError: (e): AppError => {
    const error = e instanceof Error ? e : new Error(String(e))
    return {
      code: error.name === 'Error' ? 'UNKNOWN_ERROR' : error.name,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    }
  },
  defaultError: {
    code: 'UNKNOWN_ERROR',
    message: 'An unknown error occurred',
  },
  onSuccess: (result) => {
    metrics.increment('operation.success')
  },
  onError: (error) => {
    logger.error('Operation failed', {
      code: error.code,
      message: error.message,
    })

    Sentry.captureException(new Error(error.message), {
      tags: { errorCode: error.code },
    })

    metrics.increment('operation.error', { code: error.code })
  },
})

// Wrap functions for reuse throughout your application
const safeFindUser = appSafe.wrapAsync(userService.findById.bind(userService))
const safeJsonParse = appSafe.wrap(JSON.parse)

const [user, error] = await safeFindUser(id)
const [config, parseError] = safeJsonParse(configString)
```

---

## API layer with logging

Create a dedicated safe instance for HTTP/API operations:

```ts
import { createSafe } from '@cometloop/safe'

type ApiError = {
  type: 'NETWORK' | 'TIMEOUT' | 'AUTH' | 'SERVER' | 'UNKNOWN'
  statusCode: number
  message: string
  endpoint: string
}

export const apiSafe = createSafe({
  parseError: (e): ApiError => {
    if (e instanceof TypeError && e.message.includes('fetch')) {
      return {
        type: 'NETWORK',
        statusCode: 0,
        message: 'Network unavailable',
        endpoint: '',
      }
    }
    if (e instanceof DOMException && e.name === 'AbortError') {
      return {
        type: 'TIMEOUT',
        statusCode: 0,
        message: 'Request timed out',
        endpoint: '',
      }
    }
    if (e instanceof Response) {
      return {
        type: e.status === 401 ? 'AUTH' : 'SERVER',
        statusCode: e.status,
        message: e.statusText,
        endpoint: e.url,
      }
    }
    return {
      type: 'UNKNOWN',
      statusCode: 500,
      message: String(e),
      endpoint: '',
    }
  },
  defaultError: { type: 'UNKNOWN', statusCode: 500, message: 'Unknown error', endpoint: '' },
  onSuccess: (result) => {
    logger.debug('API request succeeded', { result })
  },
  onError: (error) => {
    logger.warn('API request failed', {
      type: error.type,
      statusCode: error.statusCode,
      endpoint: error.endpoint,
    })

    if (error.type === 'AUTH') {
      authStore.clearSession()
    }
  },
})

async function fetchJson<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    throw response
  }

  return response.json()
}

const safeFetch = apiSafe.wrapAsync(fetchJson)

// Usage - all API calls get consistent error handling
export const api = {
  users: {
    list: () => safeFetch<User[]>('/api/users'),
    get: (id: string) => safeFetch<User>(`/api/users/${id}`),
    create: (data: CreateUser) =>
      safeFetch<User>('/api/users', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  orders: {
    list: () => safeFetch<Order[]>('/api/orders'),
    submit: (data: OrderData) =>
      safeFetch<Order>('/api/orders', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
}

// In components
const [users, error] = await api.users.list()
if (error) {
  if (error.type === 'AUTH') showLoginModal()
  else showToast(error.message)
}
```

---

## Database layer

```ts
import { createSafe } from '@cometloop/safe'
import { db } from './drizzle'

type DbError = {
  code: 'CONNECTION' | 'CONSTRAINT' | 'NOT_FOUND' | 'DUPLICATE' | 'QUERY' | 'UNKNOWN'
  table?: string
  message: string
}

export const dbSafe = createSafe({
  parseError: (e): DbError => {
    const message = e instanceof Error ? e.message : String(e)

    if (message.includes('ECONNREFUSED') || message.includes('connection')) {
      return { code: 'CONNECTION', message: 'Database connection failed' }
    }
    if (message.includes('unique constraint') || message.includes('duplicate key')) {
      return { code: 'DUPLICATE', message: 'Record already exists' }
    }
    if (message.includes('foreign key constraint')) {
      return { code: 'CONSTRAINT', message: 'Related record not found' }
    }
    if (message.includes('not found') || message.includes('no rows')) {
      return { code: 'NOT_FOUND', message: 'Record not found' }
    }

    return { code: 'QUERY', message }
  },
  defaultError: { code: 'UNKNOWN', message: 'Database error' },
  onSuccess: () => {
    metrics.increment('db.query.success')
  },
  onError: (error) => {
    metrics.increment('db.query.error', { code: error.code })

    if (error.code === 'CONNECTION') {
      alerting.critical('Database connection failed', error)
    }

    logger.error('Database operation failed', {
      code: error.code,
      table: error.table,
      message: error.message,
    })
  },
})

export class UserRepository {
  private async _findById(id: string) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, id),
    })
    if (!user) throw new Error('not found')
    return user
  }

  private async _create(data: CreateUserDto) {
    const [user] = await db.insert(users).values(data).returning()
    return user
  }

  findById = dbSafe.wrapAsync(this._findById.bind(this))
  create = dbSafe.wrapAsync(this._create.bind(this))
}
```

---

## Third-party integrations

Create dedicated instances for each external service:

```ts
import { createSafe } from '@cometloop/safe'
import Stripe from 'stripe'

type StripeError = {
  code: 'CARD_DECLINED' | 'EXPIRED_CARD' | 'INVALID_REQUEST' | 'RATE_LIMIT' | 'API_ERROR'
  message: string
  declineCode?: string
  retryable: boolean
}

export const stripeSafe = createSafe({
  parseError: (e): StripeError => {
    if (e instanceof Stripe.errors.StripeCardError) {
      return {
        code: 'CARD_DECLINED',
        message: e.message,
        declineCode: e.decline_code ?? undefined,
        retryable: false,
      }
    }
    if (e instanceof Stripe.errors.StripeRateLimitError) {
      return {
        code: 'RATE_LIMIT',
        message: 'Too many requests to payment provider',
        retryable: true,
      }
    }
    if (e instanceof Stripe.errors.StripeAPIError) {
      return {
        code: 'API_ERROR',
        message: 'Payment provider unavailable',
        retryable: true,
      }
    }
    return {
      code: 'API_ERROR',
      message: e instanceof Error ? e.message : 'Unknown payment error',
      retryable: false,
    }
  },
  defaultError: { code: 'API_ERROR', message: 'Unknown payment error', retryable: false },
  onError: (error) => {
    logger.error('Stripe operation failed', {
      code: error.code,
      declineCode: error.declineCode,
      retryable: error.retryable,
    })
    metrics.increment('stripe.error', { code: error.code })
  },
})

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export const paymentService = {
  createCustomer: stripeSafe.wrapAsync(
    async (email: string, name: string) =>
      stripe.customers.create({ email, name })
  ),
  chargeCard: stripeSafe.wrapAsync(
    async (customerId: string, amount: number, currency: string) =>
      stripe.paymentIntents.create({
        customer: customerId,
        amount,
        currency,
        confirm: true,
      }),
    {
      retry: {
        times: 3,
        waitBefore: (attempt) => attempt * 1000,
      },
      onRetry: (error, attempt, [customerId, amount, currency]) => {
        if (error.retryable) {
          logger.info(`Payment retry ${attempt} for customer ${customerId}`, {
            amount,
            currency,
            errorCode: error.code,
          })
        }
      },
    }
  ),
}
```

---

## Multi-tenant applications

Create safe instances dynamically with tenant-specific context:

```ts
import { createSafe, SafeInstance } from '@cometloop/safe'

type TenantError = {
  code: string
  message: string
  tenantId: string
}

function createTenantSafe(tenantId: string): SafeInstance<TenantError> {
  return createSafe({
    parseError: (e): TenantError => ({
      code: e instanceof Error ? e.name : 'UNKNOWN',
      message: e instanceof Error ? e.message : String(e),
      tenantId,
    }),
    defaultError: {
      code: 'UNKNOWN',
      message: 'Unknown error',
      tenantId,
    },
    onSuccess: () => {
      metrics.increment('tenant.operation.success', { tenantId })
    },
    onError: (error) => {
      logger.error('Tenant operation failed', {
        tenantId: error.tenantId,
        code: error.code,
        message: error.message,
      })
      metrics.increment('tenant.operation.error', {
        tenantId: error.tenantId,
        code: error.code,
      })
    },
  })
}

class TenantContext {
  private safe: SafeInstance<TenantError>

  constructor(public readonly tenantId: string) {
    this.safe = createTenantSafe(tenantId)
  }

  private async _getUsers() {
    return db.users.findMany({ where: { tenantId: this.tenantId } })
  }

  private async _createDocument(data: CreateDocumentDto) {
    return db.documents.create({
      data: { ...data, tenantId: this.tenantId },
    })
  }

  getUsers = this.safe.wrapAsync(this._getUsers.bind(this))
  createDocument = this.safe.wrapAsync(this._createDocument.bind(this))
}

// Middleware creates tenant context per request
app.get('/api/users', async (req, res) => {
  const [users, error] = await req.tenant.getUsers()

  if (error) {
    // error.tenantId is automatically set
    return res.status(500).json({
      error: error.message,
      code: error.code,
    })
  }

  res.json(users)
})
```
