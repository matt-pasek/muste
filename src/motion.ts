export const HEAVE = [0.16, 0.84, 0.24, 1] as const

export const rise = {
  hidden: { opacity: 0, y: 10, filter: 'blur(6px)' },
  shown: { opacity: 1, y: 0, filter: 'blur(0px)' },
  gone: { opacity: 0, y: -6, filter: 'blur(4px)' },
}

export const riseCalm = {
  hidden: { opacity: 0 },
  shown: { opacity: 1 },
  gone: { opacity: 0 },
}

export const iconSwap = {
  initial: { opacity: 0, scale: 0.25, filter: 'blur(4px)' },
  animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
  exit: { opacity: 0, scale: 0.25, filter: 'blur(4px)' },
  transition: { type: 'spring', duration: 0.3, bounce: 0 },
} as const
