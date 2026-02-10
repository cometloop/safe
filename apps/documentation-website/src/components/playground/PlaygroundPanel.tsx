'use client'

import { useEffect, useRef } from 'react'
import { PlaygroundCodeBlock } from './PlaygroundCodeBlock'

export type LogEntry = {
  type: 'success' | 'error' | 'info' | 'retry'
  message: string
  timestamp: number
}

const logColors: Record<LogEntry['type'], string> = {
  success: 'text-emerald-600 dark:text-emerald-400',
  error: 'text-red-600 dark:text-red-400',
  info: 'text-sky-600 dark:text-sky-400',
  retry: 'text-amber-600 dark:text-amber-400',
}

export function PlaygroundPanel({
  title,
  description,
  code,
  controls,
  log,
}: {
  title: string
  description: string
  code: string
  controls: React.ReactNode
  log: LogEntry[]
}) {
  const logRef = useRef<HTMLDivElement>(null)
  const startTime = log.length > 0 ? log[0].timestamp : 0

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [log])

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
          {title}
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {description}
        </p>
      </div>

      <div className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
        <PlaygroundCodeBlock code={code} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2">
        <div className="border-b border-slate-200 p-4 sm:border-b-0 sm:border-r dark:border-slate-800">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Controls
          </p>
          <div className="flex flex-wrap gap-2">{controls}</div>
        </div>

        <div className="p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Output
          </p>
          <div
            ref={logRef}
            className="h-32 overflow-y-auto rounded-lg bg-slate-50 p-3 font-mono text-xs dark:bg-slate-800/50"
          >
            {log.length === 0 ? (
              <span className="text-slate-400 dark:text-slate-500">
                Click a button to run...
              </span>
            ) : (
              log.map((entry, i) => (
                <div key={i} className={logColors[entry.type]}>
                  <span className="text-slate-400 dark:text-slate-500">
                    +{entry.timestamp - startTime}ms
                  </span>{' '}
                  {entry.message}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function DemoButton({
  onClick,
  disabled,
  variant = 'primary',
  children,
}: {
  onClick: () => void
  disabled?: boolean
  variant?: 'primary' | 'danger' | 'secondary'
  children: React.ReactNode
}) {
  const styles = {
    primary:
      'bg-sky-500 text-white hover:bg-sky-600 disabled:bg-sky-300 dark:bg-sky-600 dark:hover:bg-sky-500 dark:disabled:bg-sky-800',
    danger:
      'bg-red-500 text-white hover:bg-red-600 disabled:bg-red-300 dark:bg-red-600 dark:hover:bg-red-500 dark:disabled:bg-red-800',
    secondary:
      'bg-slate-200 text-slate-700 hover:bg-slate-300 disabled:bg-slate-100 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 dark:disabled:bg-slate-800',
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${styles[variant]}`}
    >
      {children}
    </button>
  )
}

export function DemoInput({
  label,
  value,
  onChange,
  type = 'text',
  multiline,
  min,
  max,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'number'
  multiline?: boolean
  min?: number
  max?: number
  className?: string
}) {
  return (
    <label className={`flex ${multiline ? 'flex-col' : 'items-center'} gap-2 text-xs ${className ?? ''}`}>
      <span className="text-slate-600 dark:text-slate-400">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          max={max}
          className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
      )}
    </label>
  )
}

export function DemoToggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-slate-300 text-sky-500 dark:border-slate-600 dark:bg-slate-800"
      />
      <span className="text-slate-600 dark:text-slate-400">{label}</span>
    </label>
  )
}

export function DemoRadioGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { label: string; value: string }[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <fieldset className="text-xs">
      <legend className="mb-1 text-slate-600 dark:text-slate-400">
        {label}
      </legend>
      <div className="flex flex-wrap gap-3">
        {options.map((opt) => (
          <label key={opt.value} className="flex items-center gap-1.5">
            <input
              type="radio"
              name={label}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="border-slate-300 text-sky-500 dark:border-slate-600 dark:bg-slate-800"
            />
            <span className="text-slate-600 dark:text-slate-400">
              {opt.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
