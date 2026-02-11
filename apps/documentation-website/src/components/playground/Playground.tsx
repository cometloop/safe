'use client'

import { useState, useCallback, useRef } from 'react'
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react'
import { safe, createSafe, TimeoutError } from '@cometloop/safe'
import {
  PlaygroundPanel,
  DemoButton,
  DemoInput,
  DemoToggle,
  DemoRadioGroup,
  type LogEntry,
} from './PlaygroundPanel'

function useLog() {
  const [log, setLog] = useState<LogEntry[]>([])
  const startRef = { current: 0 }

  const clear = useCallback(() => {
    startRef.current = Date.now()
    setLog([])
  }, [])

  const append = useCallback((type: LogEntry['type'], message: string) => {
    setLog((prev) => [...prev, { type, message, timestamp: Date.now() }])
  }, [])

  return { log, clear, append }
}

// ---------------------------------------------------------------------------
// Tab 1: Basics
// ---------------------------------------------------------------------------

function SyncDemo() {
  const { log, clear, append } = useLog()
  const [input, setInput] = useState('{"name": "Alice", "age": 30}')

  const code = `import { safe } from '@cometloop/safe'

const parseJson = (input: string) => {
  return JSON.parse(input)
}

const safeParseJson = safe.wrap(parseJson)

const [data, error] = safeParseJson('{"name": "Alice", "age": 30}')

if (error) {
  console.log('Parse failed:', error.message)
} else {
  console.log('Parsed:', data)
}`

  const safeParseJson = safe.wrap((value: string) => JSON.parse(value))

  function run(value: string) {
    clear()
    setTimeout(() => {
      const [data, error] = safeParseJson(value)
      if (error) {
        append('error', `Parse failed: ${error.message}`)
      } else {
        append('success', `Parsed: ${JSON.stringify(data)}`)
      }
    }, 0)
  }

  return (
    <PlaygroundPanel
      title="safe.wrap"
      description="Wraps a synchronous function so it returns a [data, error] tuple instead of throwing."
      code={code}
      log={log}
      controls={
        <>
          <DemoInput
            label="JSON"
            value={input}
            onChange={setInput}
            multiline
            className="w-full"
          />
          <DemoButton onClick={() => run(input)}>Parse JSON</DemoButton>
          <DemoButton variant="danger" onClick={() => run('{bad json}')}>
            Try Invalid
          </DemoButton>
        </>
      }
    />
  )
}

function AsyncDemo() {
  const { log, clear, append } = useLog()
  const [running, setRunning] = useState(false)

  const code = `import { safe } from '@cometloop/safe'

// Toggle this to simulate success or failure
const shouldFail = false

const fetchUser = async () => {
  return new Promise<{ id: number; name: string }>((resolve, reject) => {
    setTimeout(() => {
      if (shouldFail) {
        reject(new Error('Network timeout'))
      } else {
        resolve({ id: 1, name: 'Alice' })
      }
    }, 1000)
  })
}

const safeFetchUser = safe.wrapAsync(fetchUser)

const [user, error] = await safeFetchUser()

if (error) {
  console.log('Fetch failed:', error.message)
} else {
  console.log('User:', user)
}`

  async function run(shouldFail: boolean) {
    clear()
    setRunning(true)
    append('info', 'Fetching user...')

    const safeFetchUser = safe.wrapAsync(async () => {
      return new Promise<{ id: number; name: string }>((resolve, reject) => {
        setTimeout(() => {
          if (shouldFail) {
            reject(new Error('Network timeout'))
          } else {
            resolve({ id: 1, name: 'Alice' })
          }
        }, 1000)
      })
    })

    const [user, error] = await safeFetchUser()

    if (error) {
      append('error', `Fetch failed: ${error.message}`)
    } else {
      append('success', `User: ${JSON.stringify(user)}`)
    }
    setRunning(false)
  }

  return (
    <PlaygroundPanel
      title="safe.wrapAsync"
      description="Wraps an async function so it returns a Promise<[data, error]> tuple instead of rejecting."
      code={code}
      log={log}
      controls={
        <>
          <DemoButton onClick={() => run(false)} disabled={running}>
            Fetch User (Success)
          </DemoButton>
          <DemoButton
            variant="danger"
            onClick={() => run(true)}
            disabled={running}
          >
            Fetch User (Fail)
          </DemoButton>
        </>
      }
    />
  )
}

function WrapDemo() {
  const { log, clear, append } = useLog()
  const [a, setA] = useState('10')
  const [b, setB] = useState('2')

  const code = `import { safe } from '@cometloop/safe'

const divide = (a: number, b: number) => {
  if (b === 0) throw new Error('Division by zero')
  return a / b
}

const safeDivide = safe.wrap(divide)

const [result, error] = safeDivide(10, 2)

if (error) {
  console.log('Error:', error.message)
} else {
  console.log('Result:', result) // 5
}`

  const safeDivide = safe.wrap((x: number, y: number) => {
    if (y === 0) throw new Error('Division by zero')
    return x / y
  })

  function run(dividend: number, divisor: number) {
    clear()
    setTimeout(() => {
      const [result, error] = safeDivide(dividend, divisor)
      if (error) {
        append('error', `Error: ${error.message}`)
      } else {
        append('success', `Result: ${result}`)
      }
    }, 0)
  }

  return (
    <PlaygroundPanel
      title="safe.wrap with args"
      description="Wrapped functions forward arguments and preserve type safety on inputs and outputs."
      code={code}
      log={log}
      controls={
        <>
          <DemoInput label="a" value={a} onChange={setA} type="number" />
          <DemoInput label="b" value={b} onChange={setB} type="number" />
          <DemoButton onClick={() => run(Number(a), Number(b))}>
            Divide
          </DemoButton>
          <DemoButton variant="danger" onClick={() => run(Number(a), 0)}>
            Divide by Zero
          </DemoButton>
        </>
      }
    />
  )
}

function WrapAsyncDemo() {
  const { log, clear, append } = useLog()
  const [userId, setUserId] = useState('42')
  const [shouldFail, setShouldFail] = useState(false)
  const [running, setRunning] = useState(false)

  const code = `import { safe } from '@cometloop/safe'

// Toggle this to simulate a server error
const shouldFail = false

const fetchUser = async (id: string) => {
  return new Promise<{ id: string; name: string; email: string }>(
    (resolve, reject) => {
      setTimeout(() => {
        if (shouldFail) {
          reject(new Error('HTTP 500'))
        } else {
          resolve({ id, name: 'Alice', email: 'alice@example.com' })
        }
      }, 800)
    }
  )
}

const safeFetchUser = safe.wrapAsync(fetchUser)

const [user, error] = await safeFetchUser('42')

if (error) {
  console.log('Fetch failed:', error.message)
} else {
  console.log('User:', user)
}`

  const safeFetchUser = safe.wrapAsync(async (id: string) => {
    return new Promise<{ id: string; name: string; email: string }>(
      (resolve, reject) => {
        setTimeout(() => {
          if (shouldFail) {
            reject(new Error('HTTP 500'))
          } else {
            resolve({
              id,
              name: 'Alice',
              email: 'alice@example.com',
            })
          }
        }, 800)
      },
    )
  })

  async function run() {
    clear()
    setRunning(true)
    append('info', `Fetching user ${userId}...`)

    const [user, error] = await safeFetchUser(userId)
    if (error) {
      append('error', `Fetch failed: ${error.message}`)
    } else {
      append('success', `User: ${JSON.stringify(user)}`)
    }
    setRunning(false)
  }

  return (
    <PlaygroundPanel
      title="safe.wrapAsync with args"
      description="Wrapped async functions forward arguments and preserve type safety on inputs and outputs."
      code={code}
      log={log}
      controls={
        <>
          <DemoInput label="User ID" value={userId} onChange={setUserId} />
          <DemoToggle
            label="Simulate server error"
            checked={shouldFail}
            onChange={setShouldFail}
          />
          <DemoButton onClick={run} disabled={running}>
            Fetch User
          </DemoButton>
        </>
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Tab 2: Parallel
// ---------------------------------------------------------------------------

function AllDemo() {
  const { log, clear, append } = useLog()
  const [running, setRunning] = useState(false)

  const code = `import { safe } from '@cometloop/safe'

// Toggle this to make the posts request fail
const postsShouldFail = false

const fetchUser = async () => {
  return new Promise<{ id: number; name: string }>(resolve =>
    setTimeout(() => resolve({ id: 1, name: 'Alice' }), 500)
  )
}

const fetchPosts = async () => {
  return new Promise<{ title: string }[]>((resolve, reject) =>
    setTimeout(() => {
      if (postsShouldFail) {
        reject(new Error('Posts service unavailable'))
      } else {
        resolve([{ title: 'Hello World' }])
      }
    }, 800)
  )
}

const fetchComments = async () => {
  return new Promise<{ text: string }[]>(resolve =>
    setTimeout(() => resolve([{ text: 'Great post!' }]), 600)
  )
}

const safeFetchUser = safe.wrapAsync(fetchUser)
const safeFetchPosts = safe.wrapAsync(fetchPosts)
const safeFetchComments = safe.wrapAsync(fetchComments)

const [data, error] = await safe.all({
  user: safeFetchUser(),
  posts: safeFetchPosts(),
  comments: safeFetchComments(),
})

if (error) {
  console.log('One operation failed:', error.message)
} else {
  console.log('User:', data.user)
  console.log('Posts:', data.posts)
  console.log('Comments:', data.comments)
}`

  async function run(shouldFail: boolean) {
    clear()
    setRunning(true)
    append('info', 'Starting all operations...')

    const safeFetchUser = safe.wrapAsync(async () => {
      return new Promise<{ id: number; name: string }>((resolve) =>
        setTimeout(() => {
          append('info', 'User loaded')
          resolve({ id: 1, name: 'Alice' })
        }, 500),
      )
    })

    const safeFetchPosts = safe.wrapAsync(async () => {
      return new Promise<{ title: string }[]>((resolve, reject) =>
        setTimeout(() => {
          if (shouldFail) {
            append('error', 'Posts request failed')
            reject(new Error('Posts service unavailable'))
          } else {
            append('info', 'Posts loaded')
            resolve([{ title: 'Hello World' }])
          }
        }, 800),
      )
    })

    const safeFetchComments = safe.wrapAsync(async () => {
      return new Promise<{ text: string }[]>((resolve) =>
        setTimeout(() => {
          append('info', 'Comments loaded')
          resolve([{ text: 'Great post!' }])
        }, 600),
      )
    })

    const [data, error] = await safe.all({
      user: safeFetchUser(),
      posts: safeFetchPosts(),
      comments: safeFetchComments(),
    })

    if (error) {
      append('error', `One operation failed: ${error.message}`)
    } else {
      append('success', `User: ${JSON.stringify(data.user)}`)
      append('success', `Posts: ${JSON.stringify(data.posts)}`)
      append('success', `Comments: ${JSON.stringify(data.comments)}`)
    }
    setRunning(false)
  }

  return (
    <PlaygroundPanel
      title="safe.all"
      description="Runs multiple wrapped async operations in parallel. If any fails, returns the first error (like Promise.all)."
      code={code}
      log={log}
      controls={
        <>
          <DemoButton onClick={() => run(false)} disabled={running}>
            Run All (All Succeed)
          </DemoButton>
          <DemoButton
            variant="danger"
            onClick={() => run(true)}
            disabled={running}
          >
            Run All (Posts Fail)
          </DemoButton>
        </>
      }
    />
  )
}

function AllSettledDemo() {
  const { log, clear, append } = useLog()
  const [running, setRunning] = useState(false)

  const code = `import { safe } from '@cometloop/safe'

const fetchUser = async () => {
  return new Promise<{ id: number; name: string }>(resolve =>
    setTimeout(() => resolve({ id: 1, name: 'Alice' }), 500)
  )
}

const fetchPosts = async () => {
  return new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Posts service down')), 800)
  )
}

const fetchComments = async () => {
  return new Promise<{ text: string }[]>(resolve =>
    setTimeout(() => resolve([{ text: 'Great post!' }]), 600)
  )
}

const safeFetchUser = safe.wrapAsync(fetchUser)
const safeFetchPosts = safe.wrapAsync(fetchPosts)
const safeFetchComments = safe.wrapAsync(fetchComments)

const results = await safe.allSettled({
  user: safeFetchUser(),
  posts: safeFetchPosts(),
  comments: safeFetchComments(),
})

if (results.user.ok) {
  console.log('User:', results.user.value)
}
if (results.posts.ok) {
  console.log('Posts:', results.posts.value)
} else {
  console.log('Posts failed:', results.posts.error.message)
}
if (results.comments.ok) {
  console.log('Comments:', results.comments.value)
}`

  async function run() {
    clear()
    setRunning(true)
    append('info', 'Starting all operations (settled)...')

    const safeFetchUser = safe.wrapAsync(async () => {
      return new Promise<{ id: number; name: string }>((resolve) =>
        setTimeout(() => {
          append('info', 'User resolved')
          resolve({ id: 1, name: 'Alice' })
        }, 500),
      )
    })

    const safeFetchPosts = safe.wrapAsync(async () => {
      return new Promise<never>((_, reject) =>
        setTimeout(() => {
          append('retry', 'Posts rejected')
          reject(new Error('Posts service down'))
        }, 800),
      )
    })

    const safeFetchComments = safe.wrapAsync(async () => {
      return new Promise<{ text: string }[]>((resolve) =>
        setTimeout(() => {
          append('info', 'Comments resolved')
          resolve([{ text: 'Great post!' }])
        }, 600),
      )
    })

    const results = await safe.allSettled({
      user: safeFetchUser(),
      posts: safeFetchPosts(),
      comments: safeFetchComments(),
    })

    if (results.user.ok) {
      append('success', `User: ${JSON.stringify(results.user.value)}`)
    }
    if (results.posts.ok) {
      append('success', `Posts: ${JSON.stringify(results.posts.value)}`)
    } else {
      append('error', `Posts failed: ${results.posts.error.message}`)
    }
    if (results.comments.ok) {
      append('success', `Comments: ${JSON.stringify(results.comments.value)}`)
    }
    setRunning(false)
  }

  return (
    <PlaygroundPanel
      title="safe.allSettled"
      description="Runs multiple wrapped async operations in parallel. Returns individual results for each, regardless of failures."
      code={code}
      log={log}
      controls={
        <DemoButton onClick={run} disabled={running}>
          Run All Settled
        </DemoButton>
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Tab 3: Resilience
// ---------------------------------------------------------------------------

function RetryDemo() {
  const { log, clear, append } = useLog()
  const [succeedOn, setSucceedOn] = useState('3')
  const [maxRetries, setMaxRetries] = useState('3')
  const [running, setRunning] = useState(false)

  const code = `import { safe } from '@cometloop/safe'

let attempt = 0
const succeedOnAttempt = 3 // change to control when it succeeds
const maxRetries = 3       // change to control retry limit

const flakyOperation = async () => {
  return new Promise<string>((resolve, reject) => {
    attempt++
    setTimeout(() => {
      if (attempt < succeedOnAttempt) {
        reject(new Error(\`Attempt \${attempt} failed\`))
      } else {
        resolve('Operation succeeded!')
      }
    }, 300)
  })
}

const safeFlakyOperation = safe.wrapAsync(flakyOperation, {
  retry: {
    times: maxRetries,
    waitBefore: (retryAttempt) => retryAttempt * 500,
  },
  onRetry: (error, retryAttempt) => {
    console.log(\`Retry #\${retryAttempt}: \${error.message}\`)
  },
  onSuccess: (result) => {
    console.log('Final result:', result)
  },
  onError: (error) => {
    console.log('All retries exhausted:', error.message)
  },
})

const [data, error] = await safeFlakyOperation()`

  async function run() {
    clear()
    setRunning(true)
    let attempt = 0
    const target = Number(succeedOn)
    const retries = Number(maxRetries)

    append(
      'info',
      `Will succeed on attempt #${target}, max retries: ${retries}`,
    )

    const safeFlakyOperation = safe.wrapAsync(
      async () => {
        return new Promise<string>((resolve, reject) => {
          attempt++
          setTimeout(() => {
            if (attempt < target) {
              reject(new Error(`Attempt ${attempt} failed`))
            } else {
              resolve('Operation succeeded!')
            }
          }, 300)
        })
      },
      {
        retry: {
          times: retries,
          waitBefore: (retryAttempt) => retryAttempt * 500,
        },
        onRetry: (error, retryAttempt) => {
          append('retry', `Retry #${retryAttempt}: ${error.message}`)
        },
        onSuccess: (result) => {
          append('success', `Final result: ${result}`)
        },
        onError: (error) => {
          append('error', `All retries exhausted: ${error.message}`)
        },
      },
    )

    await safeFlakyOperation()
    setRunning(false)
  }

  return (
    <PlaygroundPanel
      title="Retry"
      description="Wrap with retry options to automatically retry failed operations with configurable backoff."
      code={code}
      log={log}
      controls={
        <>
          <DemoInput
            label="Succeed on attempt #"
            value={succeedOn}
            onChange={setSucceedOn}
            type="number"
            min={1}
            max={10}
          />
          <DemoInput
            label="Max retries"
            value={maxRetries}
            onChange={setMaxRetries}
            type="number"
            min={0}
            max={10}
          />
          <DemoButton onClick={run} disabled={running}>
            Run with Retry
          </DemoButton>
        </>
      }
    />
  )
}

function TimeoutDemo() {
  const { log, clear, append } = useLog()
  const [opDelay, setOpDelay] = useState('3000')
  const [timeout, setTimeout_] = useState('2000')
  const [running, setRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const code = `import { safe, TimeoutError } from '@cometloop/safe'

const operationDelay = 3000 // how long the operation takes
const timeoutLimit = 2000   // when to abort

const slowOperation = async (signal?: AbortSignal) => {
  return new Promise<string>((resolve) => {
    const timer = setTimeout(() => {
      resolve('Operation completed!')
    }, operationDelay)

    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
    })
  })
}

const safeSlowOperation = safe.wrapAsync(slowOperation, {
  abortAfter: timeoutLimit,
})

const [data, error] = await safeSlowOperation()

if (error) {
  if (error instanceof TimeoutError) {
    console.log('Operation timed out!')
  } else {
    console.log('Error:', error.message)
  }
} else {
  console.log('Result:', data)
}`

  async function run() {
    clear()
    setRunning(true)
    const delay = Number(opDelay)
    const timeoutMs = Number(timeout)
    const manualAbort = new AbortController()
    abortRef.current = manualAbort

    append('info', `Operation takes ${delay}ms, timeout at ${timeoutMs}ms`)

    const safeSlowOperation = safe.wrapAsync(
      async (signal?: AbortSignal) => {
        return new Promise<string>((resolve, reject) => {
          const timer = globalThis.setTimeout(() => {
            resolve('Operation completed!')
          }, delay)

          signal?.addEventListener('abort', () => {
            clearTimeout(timer)
          })

          manualAbort.signal.addEventListener('abort', () => {
            clearTimeout(timer)
            reject(new Error('Aborted by user'))
          })
        })
      },
      { abortAfter: timeoutMs },
    )

    const [data, error] = await safeSlowOperation()

    if (error) {
      if (error instanceof TimeoutError) {
        append('error', 'Operation timed out!')
      } else {
        append('error', `Error: ${error.message}`)
      }
    } else {
      append('success', `Result: ${data}`)
    }
    abortRef.current = null
    setRunning(false)
  }

  function abort() {
    abortRef.current?.abort()
  }

  return (
    <PlaygroundPanel
      title="Timeout / Abort"
      description="Wrap with abortAfter to automatically abort operations that take too long."
      code={code}
      log={log}
      controls={
        <>
          <DemoInput
            label="Operation delay (ms)"
            value={opDelay}
            onChange={setOpDelay}
            type="number"
            min={100}
            max={10000}
          />
          <DemoInput
            label="Timeout (ms)"
            value={timeout}
            onChange={setTimeout_}
            type="number"
            min={100}
            max={10000}
          />
          <DemoButton onClick={run} disabled={running}>
            Run with Timeout
          </DemoButton>
          <DemoButton variant="danger" onClick={abort} disabled={!running}>
            Abort
          </DemoButton>
        </>
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Tab 4: Advanced
// ---------------------------------------------------------------------------

function HooksDemo() {
  const { log, clear, append } = useLog()
  const [enableOnSuccess, setEnableOnSuccess] = useState(true)
  const [enableOnError, setEnableOnError] = useState(true)
  const [enableOnSettled, setEnableOnSettled] = useState(true)
  const [makeOnSuccessThrow, setMakeOnSuccessThrow] = useState(false)

  const code = `import { safe } from '@cometloop/safe'

// Toggle to simulate a parse error
const shouldFail = false
const input = shouldFail ? '{bad}' : '{"status": "ok"}'

const parseJson = () => JSON.parse(input)

const safeParseJson = safe.wrap(parseJson, {
  onSuccess: (result) => {
    // Uncomment to test onHookError:
    // throw new Error('Hook crashed!')
    console.log('onSuccess:', result)
  },
  onError: (error) => {
    console.log('onError:', error.message)
  },
  onSettled: (result, error) => {
    console.log('onSettled:', { result, error })
  },
  onHookError: (err, hookName) => {
    console.log(\`Hook "\${hookName}" threw:\`, err)
  },
})

const [data, error] = safeParseJson()`

  function run(shouldFail: boolean) {
    clear()
    setTimeout(() => {
      const fn = shouldFail
        ? () => JSON.parse('{bad}')
        : () => JSON.parse('{"status": "ok"}')

      const safeFn = safe.wrap(fn, {
        onSuccess: enableOnSuccess
          ? (result) => {
              if (makeOnSuccessThrow) {
                throw new Error('Hook crashed!')
              }
              append('success', `onSuccess: ${JSON.stringify(result)}`)
            }
          : undefined,
        onError: enableOnError
          ? (error) => {
              append('error', `onError: ${error.message}`)
            }
          : undefined,
        onSettled: enableOnSettled
          ? (result, error) => {
              append(
                'info',
                `onSettled: ${JSON.stringify({ result, error: error?.message ?? null })}`,
              )
            }
          : undefined,
        onHookError: (err, hookName) => {
          append(
            'retry',
            `Hook "${hookName}" threw: ${err instanceof Error ? err.message : String(err)}`,
          )
        },
      })

      const [data, error] = safeFn()

      if (error) {
        append('error', `Result: error — ${error.message}`)
      } else {
        append('success', `Result: ${JSON.stringify(data)}`)
      }
    }, 0)
  }

  return (
    <PlaygroundPanel
      title="Hooks"
      description="Pass lifecycle hooks when wrapping. onHookError catches errors thrown by your hooks."
      code={code}
      log={log}
      controls={
        <>
          <DemoToggle
            label="onSuccess"
            checked={enableOnSuccess}
            onChange={setEnableOnSuccess}
          />
          <DemoToggle
            label="onError"
            checked={enableOnError}
            onChange={setEnableOnError}
          />
          <DemoToggle
            label="onSettled"
            checked={enableOnSettled}
            onChange={setEnableOnSettled}
          />
          <DemoToggle
            label="Make onSuccess throw"
            checked={makeOnSuccessThrow}
            onChange={setMakeOnSuccessThrow}
          />
          <DemoButton onClick={() => run(false)}>Run (Success)</DemoButton>
          <DemoButton variant="danger" onClick={() => run(true)}>
            Run (Error)
          </DemoButton>
        </>
      }
    />
  )
}

function ErrorMappingDemo() {
  const { log, clear, append } = useLog()

  const code = `import { safe } from '@cometloop/safe'

type AppError = {
  code: string
  message: string
  originalType: string
}

// Try throwing different types: Error, string, number
const riskyOperation = () => {
  throw new Error('Connection refused')
  // or: throw 'something went wrong'
  // or: throw 42
}

const toAppError = (e: unknown): AppError => ({
  code: 'OPERATION_ERROR',
  message: e instanceof Error ? e.message : String(e),
  originalType: typeof e === 'object' && e instanceof Error
    ? 'Error' : typeof e,
})

const safeRiskyOperation = safe.wrap(riskyOperation, toAppError)

const [data, error] = safeRiskyOperation()

if (error) {
  console.log('Mapped error:', error)
  // { code: 'OPERATION_ERROR', message: '...', originalType: '...' }
}`

  function run(throwType: 'error' | 'string' | 'number') {
    clear()
    setTimeout(() => {
      type AppError = {
        code: string
        message: string
        originalType: string
      }

      const fn = () => {
        switch (throwType) {
          case 'error':
            throw new Error('Connection refused')
          case 'string':
            throw 'something went wrong'
          case 'number':
            throw 42
        }
      }

      const safeFn = safe.wrap(
        fn,
        (e): AppError => ({
          code: 'OPERATION_ERROR',
          message: e instanceof Error ? e.message : String(e),
          originalType:
            typeof e === 'object' && e instanceof Error ? 'Error' : typeof e,
        }),
      )

      const [data, error] = safeFn()

      if (error) {
        append('info', `Raw thrown value type: ${throwType}`)
        append('success', `Mapped error: ${JSON.stringify(error, null, 2)}`)
      }
    }, 0)
  }

  return (
    <PlaygroundPanel
      title="Error Mapping"
      description="Pass a parseError function when wrapping to transform any thrown value into a structured error type."
      code={code}
      log={log}
      controls={
        <>
          <DemoButton onClick={() => run('error')}>Throw Error</DemoButton>
          <DemoButton variant="secondary" onClick={() => run('string')}>
            Throw String
          </DemoButton>
          <DemoButton variant="secondary" onClick={() => run('number')}>
            Throw Number
          </DemoButton>
        </>
      }
    />
  )
}

function ResultTransformDemo() {
  const { log, clear, append } = useLog()
  const [input, setInput] = useState(
    '{"users": [{"name": "Alice"}, {"name": "Bob"}]}',
  )
  const [transformType, setTransformType] = useState('names')

  const code = `import { safe } from '@cometloop/safe'

const input = '{"users": [{"name": "Alice"}, {"name": "Bob"}]}'

type UserData = { users: { name: string }[] }

const parseInput = () => JSON.parse(input) as UserData

// Try different transforms:
//   data.users.map(u => u.name)               → ['Alice', 'Bob']
//   data.users.length                         → 2
//   data.users.map(u => u.name.toUpperCase()) → ['ALICE', 'BOB']
const extractNames = (data: UserData) => data.users.map(u => u.name)

const safeParseInput = safe.wrap(parseInput, {
  parseResult: extractNames,
  onSuccess: (transformedResult) => {
    console.log('Transformed:', transformedResult)
  },
})

const [result, error] = safeParseInput()

if (error) {
  console.log('Error:', error.message)
} else {
  console.log('Result:', result)
}`

  function run() {
    clear()
    setTimeout(() => {
      const parseInput = () =>
        JSON.parse(input) as { users: { name: string }[] }

      if (transformType === 'names') {
        const safeParse = safe.wrap(parseInput, {
          parseResult: (data) => data.users.map((u) => u.name),
          onSuccess: (transformedResult) => {
            append(
              'info',
              `parseResult applied, onSuccess received: ${JSON.stringify(transformedResult)}`,
            )
          },
        })
        const [names, error] = safeParse()
        if (error) {
          append('error', `Error: ${error.message}`)
        } else {
          append('success', `Names: ${JSON.stringify(names)}`)
        }
      } else if (transformType === 'count') {
        const safeParse = safe.wrap(parseInput, {
          parseResult: (data) => data.users.length,
          onSuccess: (transformedResult) => {
            append(
              'info',
              `parseResult applied, onSuccess received: ${transformedResult}`,
            )
          },
        })
        const [count, error] = safeParse()
        if (error) {
          append('error', `Error: ${error.message}`)
        } else {
          append('success', `User count: ${count}`)
        }
      } else {
        const safeParse = safe.wrap(parseInput, {
          parseResult: (data) => data.users.map((u) => u.name.toUpperCase()),
          onSuccess: (transformedResult) => {
            append(
              'info',
              `parseResult applied, onSuccess received: ${JSON.stringify(transformedResult)}`,
            )
          },
        })
        const [upper, error] = safeParse()
        if (error) {
          append('error', `Error: ${error.message}`)
        } else {
          append('success', `Uppercase names: ${JSON.stringify(upper)}`)
        }
      }
    }, 0)
  }

  return (
    <PlaygroundPanel
      title="Result Transformation"
      description="Pass parseResult when wrapping to transform successful data before it's returned."
      code={code}
      log={log}
      controls={
        <>
          <DemoInput
            label="JSON"
            value={input}
            onChange={setInput}
            multiline
            className="w-full"
          />
          <DemoRadioGroup
            label="Transform type"
            options={[
              { label: 'Extract names', value: 'names' },
              { label: 'Count users', value: 'count' },
              { label: 'Uppercase names', value: 'uppercase' },
            ]}
            value={transformType}
            onChange={setTransformType}
          />
          <DemoButton onClick={run}>Parse & Transform</DemoButton>
        </>
      }
    />
  )
}

function CreateSafeDemo() {
  const { log, clear, append } = useLog()
  const [enableHooks, setEnableHooks] = useState(true)

  const code = `import { createSafe } from '@cometloop/safe'

type AppError = {
  code: string
  message: string
}

const toAppError = (e: unknown): AppError => ({
  code: 'APP_ERROR',
  message: e instanceof Error ? e.message : String(e),
})

const appSafe = createSafe({
  parseError: toAppError,
  defaultError: { code: 'UNKNOWN', message: 'An unknown error occurred' },
  onSuccess: (result) => {
    console.log('Global onSuccess:', result)
  },
  onError: (error) => {
    console.log('Global onError:', error)
  },
})

// Sync — wrap, then call
const parseConfig = () => JSON.parse('{"status": "ok"}')
const safeParseConfig = appSafe.wrap(parseConfig)
const [data, error] = safeParseConfig()

// Async — wrap, then call
const fetchUser = async () => {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Network error: ECONNREFUSED')), 800)
  })
}
const safeFetchUser = appSafe.wrapAsync(fetchUser)
const [user, asyncError] = await safeFetchUser()`

  type AppError = {
    code: string
    message: string
  }

  function runSync() {
    clear()
    setTimeout(() => {
      const appSafe = createSafe<AppError>({
        parseError: (e): AppError => ({
          code: 'APP_ERROR',
          message: e instanceof Error ? e.message : String(e),
        }),
        defaultError: { code: 'UNKNOWN', message: 'An unknown error occurred' },
        onSuccess: enableHooks
          ? (result) => {
              append('info', `Global onSuccess: ${JSON.stringify(result)}`)
            }
          : undefined,
        onError: enableHooks
          ? (error) => {
              append('info', `Global onError: ${JSON.stringify(error)}`)
            }
          : undefined,
      })

      const safeParseConfig = appSafe.wrap(() => JSON.parse('{"status": "ok"}'))
      const [data, error] = safeParseConfig()
      if (error) {
        append('error', `Error: ${JSON.stringify(error)}`)
      } else {
        append('success', `Data: ${JSON.stringify(data)}`)
      }
    }, 0)
  }

  async function runAsync() {
    clear()
    const appSafe = createSafe<AppError>({
      parseError: (e): AppError => ({
        code: 'APP_ERROR',
        message: e instanceof Error ? e.message : String(e),
      }),
      defaultError: { code: 'UNKNOWN', message: 'An unknown error occurred' },
      onSuccess: enableHooks
        ? (result) => {
            append('info', `Global onSuccess: ${JSON.stringify(result)}`)
          }
        : undefined,
      onError: enableHooks
        ? (error) => {
            append('info', `Global onError: ${JSON.stringify(error)}`)
          }
        : undefined,
    })

    append('info', 'Fetching user (will fail)...')

    const safeFetchUser = appSafe.wrapAsync(async () => {
      return new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Network error: ECONNREFUSED')), 800)
      })
    })

    const [user, error] = await safeFetchUser()

    if (error) {
      append('error', `Mapped error: ${JSON.stringify(error)}`)
    } else {
      append('success', `User: ${JSON.stringify(user)}`)
    }
  }

  return (
    <PlaygroundPanel
      title="createSafe"
      description="Factory function to create a pre-configured safe instance. Wrap functions with built-in parseError, hooks, and defaults."
      code={code}
      log={log}
      controls={
        <>
          <DemoToggle
            label="Enable global hooks"
            checked={enableHooks}
            onChange={setEnableHooks}
          />
          <DemoButton onClick={runSync}>Run .wrap (sync)</DemoButton>
          <DemoButton variant="danger" onClick={runAsync}>
            Run .wrapAsync (fail)
          </DemoButton>
        </>
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Main Playground
// ---------------------------------------------------------------------------

const tabs = [
  { name: 'Basics', id: 'basics' },
  { name: 'Parallel', id: 'parallel' },
  { name: 'Resilience', id: 'resilience' },
  { name: 'Advanced', id: 'advanced' },
]

export function Playground() {
  return (
    <div className="not-prose mt-8">
      <TabGroup>
        <TabList className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {tabs.map((tab) => (
            <Tab
              key={tab.id}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 data-[selected]:bg-white data-[selected]:text-slate-900 data-[selected]:shadow-sm dark:text-slate-400 dark:hover:text-white dark:data-[selected]:bg-slate-700 dark:data-[selected]:text-white"
            >
              {tab.name}
            </Tab>
          ))}
        </TabList>

        <TabPanels className="mt-4">
          <TabPanel className="space-y-6">
            <SyncDemo />
            <AsyncDemo />
            <WrapDemo />
            <WrapAsyncDemo />
          </TabPanel>

          <TabPanel className="space-y-6">
            <AllDemo />
            <AllSettledDemo />
          </TabPanel>

          <TabPanel className="space-y-6">
            <RetryDemo />
            <TimeoutDemo />
          </TabPanel>

          <TabPanel className="space-y-6">
            <HooksDemo />
            <ErrorMappingDemo />
            <ResultTransformDemo />
            <CreateSafeDemo />
          </TabPanel>
        </TabPanels>
      </TabGroup>
    </div>
  )
}
