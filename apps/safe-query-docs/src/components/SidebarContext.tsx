'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { usePathname } from 'next/navigation'

const COLLAPSED_PATHS: string[] = []

type SidebarContextValue = {
  isCollapsed: boolean
  toggle: () => void
}

const SidebarContext = createContext<SidebarContextValue>({
  isCollapsed: false,
  toggle: () => {},
})

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const shouldCollapse = COLLAPSED_PATHS.includes(pathname)
  const [manualOverride, setManualOverride] = useState<boolean | null>(null)

  useEffect(() => {
    setManualOverride(null)
  }, [pathname])

  const isCollapsed = manualOverride ?? shouldCollapse

  const toggle = useCallback(() => {
    setManualOverride((prev) => {
      if (prev === null) return !shouldCollapse
      return !prev
    })
  }, [shouldCollapse])

  return (
    <SidebarContext.Provider value={{ isCollapsed, toggle }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  return useContext(SidebarContext)
}
