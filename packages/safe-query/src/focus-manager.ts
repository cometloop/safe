type FocusCallback = () => void

declare const document: {
  visibilityState: string
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
} | undefined

export class FocusManager {
  private listeners = new Set<FocusCallback>()
  private handleVisibilityChange: (() => void) | null = null
  private removeListener: (() => void) | null = null

  constructor() {
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      this.handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          for (const cb of this.listeners) {
            cb()
          }
        }
      }
      document.addEventListener('visibilitychange', this.handleVisibilityChange)
      this.removeListener = () => {
        document.removeEventListener('visibilitychange', this.handleVisibilityChange!)
      }
    }
  }

  subscribe(callback: FocusCallback): () => void {
    this.listeners.add(callback)
    return () => {
      this.listeners.delete(callback)
    }
  }

  isFocused(): boolean {
    if (typeof document === 'undefined') return true
    return document.visibilityState === 'visible'
  }

  destroy(): void {
    this.removeListener?.()
    this.removeListener = null
    this.handleVisibilityChange = null
    this.listeners.clear()
  }
}
