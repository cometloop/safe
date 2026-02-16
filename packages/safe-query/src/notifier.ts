export type NotifierCallback = () => void

export class Notifier {
  private listeners = new Map<string, Set<NotifierCallback>>()

  subscribe(key: string, callback: NotifierCallback): () => void {
    let set = this.listeners.get(key)
    if (!set) {
      set = new Set()
      this.listeners.set(key, set)
    }
    set.add(callback)
    return () => {
      set!.delete(callback)
      if (set!.size === 0) {
        this.listeners.delete(key)
      }
    }
  }

  notify(key: string): void {
    const set = this.listeners.get(key)
    if (set) {
      for (const cb of set) {
        cb()
      }
    }
  }

  notifyMany(keys: Iterable<string>): void {
    const notified = new Set<NotifierCallback>()
    for (const key of keys) {
      const set = this.listeners.get(key)
      if (set) {
        for (const cb of set) {
          if (!notified.has(cb)) {
            notified.add(cb)
            cb()
          }
        }
      }
    }
  }

  hasListeners(key: string): boolean {
    const set = this.listeners.get(key)
    return set !== undefined && set.size > 0
  }

  clear(): void {
    this.listeners.clear()
  }
}
