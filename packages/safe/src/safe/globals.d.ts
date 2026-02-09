// Minimal type declarations for APIs available in both Node.js and browsers
// These avoid pulling in the full DOM lib which includes browser-only types

declare function setTimeout(callback: () => void, ms: number): unknown
declare function clearTimeout(id: unknown): void

declare class AbortController {
  readonly signal: AbortSignal
  abort(): void
}

declare class AbortSignal {
  readonly aborted: boolean
  addEventListener(type: 'abort', listener: () => void): void
  removeEventListener(type: 'abort', listener: () => void): void
}
