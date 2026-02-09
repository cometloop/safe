---
title: Real-world examples
---

Practical examples showing how to use `safe` in common application scenarios. {% .lead %}

---

## JSON parsing

```ts
import { safe } from '@cometloop/safe'

type ParseError = { type: 'PARSE_ERROR'; input: string; message: string }

function parseConfig(jsonString: string) {
  const [config, error] = safe.sync(
    () => JSON.parse(jsonString) as AppConfig,
    (e): ParseError => ({
      type: 'PARSE_ERROR',
      input: jsonString.slice(0, 100),
      message: e instanceof SyntaxError ? e.message : 'Unknown parse error',
    })
  )

  if (error) {
    console.error('Invalid config:', error.message)
    return getDefaultConfig()
  }

  return config
}
```

---

## API requests

```ts
import { safe } from '@cometloop/safe'

type ApiError = {
  statusCode: number
  message: string
  endpoint: string
}

// 1. Define the normal function first
async function fetchJson<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(endpoint, options)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  return response.json()
}

// 2. Define the error mapper
const toApiError = (e: unknown): ApiError => ({
  statusCode: 500,
  message: e instanceof Error ? e.message : 'Network error',
  endpoint: '',
})

// 3. Wrap it for safe usage
const safeFetch = safe.wrapAsync(fetchJson, toApiError)

// Usage in a service
async function getUsers() {
  const [users, error] = await safeFetch<User[]>('/api/users')

  if (error) {
    if (error.statusCode === 401) {
      redirectToLogin()
    }
    return []
  }

  return users
}
```

---

## Form validation

```ts
import { safe } from '@cometloop/safe'
import { z } from 'zod'

const UserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  age: z.number().min(18),
})

type ValidationError = {
  field: string
  message: string
}[]

// 1. Define the normal validation function
function parseUser(data: unknown) {
  return UserSchema.parse(data)
}

// 2. Define the error mapper
const toValidationError = (e: unknown): ValidationError => {
  if (e instanceof z.ZodError) {
    return e.errors.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
    }))
  }
  return [{ field: 'unknown', message: 'Validation failed' }]
}

// 3. Wrap it for safe usage
const validateUser = safe.wrap(parseUser, toValidationError)

// Usage in form handler
function handleSubmit(formData: FormData) {
  const [user, errors] = validateUser(Object.fromEntries(formData))

  if (errors) {
    errors.forEach((err) => setFieldError(err.field, err.message))
    return
  }

  // user is fully validated and typed
  createUser(user)
}
```

---

## File operations

```ts
import { safe } from '@cometloop/safe'
import * as fs from 'fs/promises'

type FileError = {
  operation: 'read' | 'write' | 'delete'
  path: string
  code: string
  message: string
}

const toFileError = (e: unknown): FileError => ({
  operation: 'read',
  path: '',
  code: (e as NodeJS.ErrnoException).code ?? 'UNKNOWN',
  message: e instanceof Error ? e.message : 'File read failed',
})

const fileHooks = {
  onSuccess: (content: Buffer | string, [path]: [string, ...unknown[]]) =>
    console.log(
      `Read ${path}: ${typeof content === 'string' ? content.length : content.byteLength} bytes`
    ),
  onError: (error: FileError, [path]: [string, ...unknown[]]) =>
    console.error(`Failed to read ${path}: ${error.code}`),
}

const safeReadFile = safe.wrapAsync(fs.readFile, toFileError, fileHooks)

// Usage
async function loadConfig(configPath: string) {
  const [content, error] = await safeReadFile(configPath, 'utf-8')

  if (error) {
    if (error.code === 'ENOENT') {
      return createDefaultConfig(configPath)
    }
    throw new Error(`Cannot load config: ${error.message}`)
  }

  return JSON.parse(content)
}
```

---

## Database operations

```ts
import { safe } from '@cometloop/safe'

type DbError = {
  code: 'NOT_FOUND' | 'DUPLICATE' | 'CONNECTION' | 'UNKNOWN'
  table: string
  message: string
}

function createDbErrorMapper(table: string) {
  return (e: unknown): DbError => {
    if (e instanceof Error) {
      if (e.message.includes('unique constraint')) {
        return { code: 'DUPLICATE', table, message: 'Record already exists' }
      }
      if (e.message.includes('not found')) {
        return { code: 'NOT_FOUND', table, message: 'Record not found' }
      }
    }
    return { code: 'UNKNOWN', table, message: String(e) }
  }
}

class UserRepository {
  private async createUser(data: CreateUserDto) {
    return db.user.create({ data })
  }

  private async findUserById(id: string) {
    const user = await db.user.findUnique({ where: { id } })
    if (!user) throw new Error('not found')
    return user
  }

  private toDbError = createDbErrorMapper('users')

  private safeCreate = safe.wrapAsync(
    this.createUser.bind(this),
    this.toDbError
  )
  private safeFindById = safe.wrapAsync(
    this.findUserById.bind(this),
    this.toDbError
  )

  async create(data: CreateUserDto) {
    const [user, error] = await this.safeCreate(data)
    if (error) return { success: false, error }
    return { success: true, data: user }
  }

  async findById(id: string) {
    const [user, error] = await this.safeFindById(id)
    if (error) return { success: false, error }
    return { success: true, data: user }
  }
}
```

---

## Authentication

```ts
import { safe } from '@cometloop/safe'
import jwt from 'jsonwebtoken'

type AuthError = {
  code: 'INVALID_TOKEN' | 'EXPIRED' | 'MISSING_CLAIMS'
  message: string
}

function verifyJwt(token: string, secret: string): JwtPayload {
  return jwt.verify(token, secret) as JwtPayload
}

const toAuthError = (e: unknown): AuthError => {
  if (e instanceof jwt.TokenExpiredError) {
    return { code: 'EXPIRED', message: 'Token has expired' }
  }
  if (e instanceof jwt.JsonWebTokenError) {
    return { code: 'INVALID_TOKEN', message: e.message }
  }
  return { code: 'INVALID_TOKEN', message: 'Token verification failed' }
}

const authHooks = {
  onSuccess: (payload: JwtPayload, [token]: [string, string]) => {
    console.log(`Token verified for user: ${payload.sub}`)
  },
  onError: (error: AuthError, [token]: [string, string]) => {
    console.warn(`Auth failed: ${error.code}`)
  },
}

const verifyToken = safe.wrap(verifyJwt, toAuthError, authHooks)

// Middleware usage
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({ error: 'No token provided' })
  }

  const [payload, error] = verifyToken(token, process.env.JWT_SECRET!)

  if (error) {
    const status = error.code === 'EXPIRED' ? 401 : 403
    return res.status(status).json({ error: error.message })
  }

  req.user = payload
  next()
}
```
