import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'velvora:theme'
const THEME_LIGHT = 'light'
const THEME_DARK = 'dark'

const ThemeContext = createContext(null)

function detectSystemTheme() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return THEME_LIGHT
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? THEME_DARK : THEME_LIGHT
}

function sanitizeTheme(value) {
  return value === THEME_DARK ? THEME_DARK : THEME_LIGHT
}

function readStoredTheme() {
  if (typeof window === 'undefined') return ''
  try {
    return String(window.localStorage.getItem(STORAGE_KEY) || '')
  } catch {
    return ''
  }
}

function writeStoredTheme(nextTheme) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, nextTheme)
  } catch {
    // Ignore storage write failures (common in restrictive in-app browsers).
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return THEME_LIGHT
    const persistedTheme = readStoredTheme()
    return persistedTheme ? sanitizeTheme(persistedTheme) : detectSystemTheme()
  })

  useEffect(() => {
    writeStoredTheme(theme)

    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme)
    }
  }, [theme])

  const value = useMemo(
    () => ({
      theme,
      isDark: theme === THEME_DARK,
      setTheme: (nextTheme) => setTheme(sanitizeTheme(nextTheme)),
      toggleTheme: () => setTheme((currentTheme) => (currentTheme === THEME_DARK ? THEME_LIGHT : THEME_DARK)),
    }),
    [theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider.')
  }
  return context
}
