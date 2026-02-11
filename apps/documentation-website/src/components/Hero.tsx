import { Fragment } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import { Highlight } from 'prism-react-renderer'

import { Button } from '@/components/Button'
import { HeroBackground } from '@/components/HeroBackground'
import blurCyanImage from '@/images/blur-cyan.png'
import blurIndigoImage from '@/images/blur-indigo.png'

const codeLanguage = 'typescript'

const code = `// Wrap any function — zero config
const safeParse = safe.wrap(JSON.parse)
const [data, err] = safeParse(rawInput)

// Shared config for a whole domain
const apiSafe = createSafe({
  parseError: errorParser,
  defaultError: fallbackError,
  onError: errorHook,
})

const fetchUser = apiSafe.wrapAsync(fetchUserAsync)
const fetchPosts = apiSafe.wrapAsync(fetchPostsAsync)

// Same config. Full type narrowing.
const [user, userErr] = await fetchUser('123')
if (userErr) return

const [posts, postsErr] = await fetchPosts(user.id)
console.log(user.name, posts.length)

// Prefer objects? One call to switch.
const objSafe = withObjects(apiSafe)
const fetchPostsObj = objSafe.wrapAsync(fetchPostsAsync)
const { ok, data: posts2, error } = await fetchPostsObj('123')
`

// const code = `import { safe } from '@cometloop/safe'
// import { fetchUserAsync } from '@lib/api'
// import { myErrorParser } from '@lib/errors'

// const fetchUser = safe.wrap(fetchUserAsync)
// const [user, error] = await fetchUser('admin-456')

// // provied the same parsers and hooks to any wrapped func
// const apiSafe = createSafe({
//   parseError: myErrorParser,
//   onError: () => {
//     // log
//   }
//   onSuccess: () => {
//   // log
//   },
// })

// const apiFetchUser = apiSafe.wrap(fetchUserAsync)

// const [user, myErrorParserError] = await apiFetchUser('123') // typed to myErrorParser error type
// `

// const code = `import { safe } from '@cometloop/safe'

// // Instead of try-catch
// const [data, error] = safe.sync(() => JSON.parse(jsonString))

// if (error) {
//   console.error('Parse failed:', error.message)
//   return
// }

// console.log(data) // typed and safe

// // Async with retry and timeout
// const [user, fetchError] = await safe.async(
//   (signal) => fetch('/api/user', { signal }),
//   {
//     retry: { times: 3, waitBefore: (n) => n * 1000 },
//     abortAfter: 5000,
//   }
// )

// // Wrap any function for reuse
// const safeDivide = safe.wrap((a: number, b: number) => {
//   if (b === 0) throw new Error('Division by zero')
//   return a / b
// })

// const [result, divError] = safeDivide(10, 2) // [5, null]`

const tabs = [{ name: 'example.ts', isActive: true }]

function TrafficLightsIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 42 10" fill="none" {...props}>
      <circle cx="5" cy="5" r="4.5" />
      <circle cx="21" cy="5" r="4.5" />
      <circle cx="37" cy="5" r="4.5" />
    </svg>
  )
}

export function Hero() {
  return (
    <div className="overflow-hidden bg-slate-900 dark:-mt-19 dark:-mb-32 dark:pt-19 dark:pb-32">
      <div className="py-16 sm:px-2 lg:relative lg:px-0 lg:py-20">
        <div className="mx-auto grid max-w-2xl grid-cols-1 items-center gap-x-8 gap-y-16 px-4 lg:max-w-400 lg:grid-cols-2 lg:px-8 xl:gap-x-16 xl:px-12">
          <div className="relative z-10 md:text-center lg:text-left">
            <Image
              className="absolute right-full bottom-full -mr-72 -mb-56 opacity-50"
              src={blurCyanImage}
              alt=""
              width={530}
              height={530}
              unoptimized
              priority
            />
            <div className="relative">
              <p className="inline bg-linear-to-r from-indigo-200 via-sky-400 to-indigo-200 bg-clip-text font-display text-6xl tracking-tight text-transparent">
                Type-safe error handling for TypeScript.
              </p>
              <section className="py-10 text-white">
                <h1 className="mb-6 bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-3xl font-extrabold text-transparent">
                  Wrap any function
                </h1>
                {/* <p className="mx-auto mb-10 max-w-2xl text-2xl text-gray-300">
                  Return type-safe results with zero try/catch, hooks, and clean
                  call sites
                </p> */}

                <ul className="max-w-3xl list-inside list-disc space-y-2 gap-x-10 gap-y-4 text-left text-lg text-gray-300">
                  <li>
                    <strong>Flexible wrapping</strong> — single function, domain
                    scope, or app-wide
                  </li>

                  <li>
                    <strong>Type-safe results</strong> — tuples or objects
                  </li>
                  <li>
                    <strong>Flexible parsing</strong> — transform results and
                    errors with full type inference
                  </li>
                  <li>
                    <strong>Built in hooks</strong> — run side effects
                    automatically
                  </li>
                  <li>
                    <strong>Async utils included</strong> — retry, timeout,
                    abort, all, allSettled
                  </li>
                  <li>
                    <strong>No try/catch clutter</strong> — clean, concise call
                    sites
                  </li>
                </ul>
              </section>
              {/* <p className="mt-3 text-2xl tracking-tight text-slate-400">
                <span className="">Wrap any function.</span> Get type-safe
                tuples or objects.
                <br />
                Zero try/catch, built-in hooks, automatic error and result
                parsing, and clean call sites.
              </p> */}
              <div className="mt-8 flex gap-4 md:justify-center lg:justify-start">
                <Button href="/docs/installation">Get started</Button>
                <Button href="/docs/safe-sync" variant="secondary">
                  API Reference
                </Button>
              </div>
            </div>
          </div>
          <div className="relative lg:static xl:pl-10">
            <div className="absolute inset-x-[-50vw] -top-32 -bottom-48 mask-[linear-gradient(transparent,white,white)] lg:-top-32 lg:right-0 lg:-bottom-32 lg:left-[calc(50%+14rem)] lg:mask-none dark:mask-[linear-gradient(transparent,white,transparent)] lg:dark:mask-[linear-gradient(white,white,transparent)]">
              <HeroBackground className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 lg:left-0 lg:translate-x-0 lg:translate-y-[-60%]" />
            </div>
            <div className="relative">
              <Image
                className="absolute -top-64 -right-64"
                src={blurCyanImage}
                alt=""
                width={530}
                height={530}
                unoptimized
                priority
              />
              <Image
                className="absolute -right-44 -bottom-40"
                src={blurIndigoImage}
                alt=""
                width={567}
                height={567}
                unoptimized
                priority
              />
              <div className="absolute inset-0 rounded-2xl bg-linear-to-tr from-sky-300 via-sky-300/70 to-blue-300 opacity-10 blur-lg" />
              <div className="absolute inset-0 rounded-2xl bg-linear-to-tr from-sky-300 via-sky-300/70 to-blue-300 opacity-10" />
              <div className="relative rounded-2xl bg-[#0A101F]/80 ring-1 ring-white/10 backdrop-blur-sm">
                <div className="absolute -top-px right-11 left-20 h-px bg-linear-to-r from-sky-300/0 via-sky-300/70 to-sky-300/0" />
                <div className="absolute right-20 -bottom-px left-11 h-px bg-linear-to-r from-blue-400/0 via-blue-400 to-blue-400/0" />
                <div className="pt-4 pl-4">
                  <TrafficLightsIcon className="h-2.5 w-auto stroke-slate-500/30" />
                  <div className="mt-4 flex space-x-2 text-xs">
                    {tabs.map((tab) => (
                      <div
                        key={tab.name}
                        className={clsx(
                          'flex h-6 rounded-full',
                          tab.isActive
                            ? 'bg-linear-to-r from-sky-400/30 via-sky-400 to-sky-400/30 p-px font-medium text-sky-300'
                            : 'text-slate-500',
                        )}
                      >
                        <div
                          className={clsx(
                            'flex items-center rounded-full px-2.5',
                            tab.isActive && 'bg-slate-800',
                          )}
                        >
                          {tab.name}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 flex items-start px-1 text-sm">
                    <div
                      aria-hidden="true"
                      className="border-r border-slate-300/5 pr-4 font-mono text-slate-600 select-none"
                    >
                      {Array.from({
                        length: code.split('\n').length,
                      }).map((_, index) => (
                        <Fragment key={index}>
                          {(index + 1).toString().padStart(2, '0')}
                          <br />
                        </Fragment>
                      ))}
                    </div>
                    <Highlight
                      code={code}
                      language={codeLanguage}
                      theme={{ plain: {}, styles: [] }}
                    >
                      {({
                        className,
                        style,
                        tokens,
                        getLineProps,
                        getTokenProps,
                      }) => (
                        <pre
                          className={clsx(
                            className,
                            'flex overflow-x-auto pb-6',
                          )}
                          style={style}
                        >
                          <code className="px-4">
                            {tokens.map((line, lineIndex) => (
                              <div key={lineIndex} {...getLineProps({ line })}>
                                {line.map((token, tokenIndex) => (
                                  <span
                                    key={tokenIndex}
                                    {...getTokenProps({ token })}
                                  />
                                ))}
                              </div>
                            ))}
                          </code>
                        </pre>
                      )}
                    </Highlight>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
