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

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return THEME_LIGHT
    const persistedTheme = window.localStorage.getItem(STORAGE_KEY)
    return persistedTheme ? sanitizeTheme(persistedTheme) : detectSystemTheme()
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, theme)
    }

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
