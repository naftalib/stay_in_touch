import { useCallback, useEffect, useState } from 'react'

export type TextSize = 'normal' | 'large' | 'extraLarge'

const STORAGE_KEY = 'stay-text-size'

const SIZE_TO_DATA: Record<TextSize, string> = {
  normal: 'normal',
  large: 'large',
  extraLarge: 'extra-large',
}

export function readTextSize(): TextSize {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'large' || stored === 'extraLarge' || stored === 'normal') {
      return stored
    }
  } catch {
    /* ignore */
  }
  return 'normal'
}

function applyTextSize(size: TextSize) {
  document.documentElement.dataset.textSize = SIZE_TO_DATA[size]
}

export function useTextSize() {
  const [size, setSizeState] = useState<TextSize>(() => {
    const initial = readTextSize()
    applyTextSize(initial)
    return initial
  })

  useEffect(() => {
    applyTextSize(size)
  }, [size])

  const setSize = useCallback((next: TextSize) => {
    setSizeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
    applyTextSize(next)
  }, [])

  return { size, setSize }
}
