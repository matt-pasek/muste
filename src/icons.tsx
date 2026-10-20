import type { ReactNode, SVGProps } from 'react'

function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1.25em"
      height="1.25em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  )
}

export const PenIcon = () => (
  <Icon>
    <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19l-4 1z" />
    <path d="M14.5 6.5l3 3" />
  </Icon>
)

export const EraserIcon = () => (
  <Icon>
    <path d="M8.5 20H20" />
    <path d="M5.6 15.4l8.5-8.5a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L11 20H8.5l-2.9-2.9a1.2 1.2 0 010-1.7z" />
    <path d="M9.5 11.5l5 5" />
  </Icon>
)

export const ExplainIcon = () => (
  <Icon>
    <path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2" />
    <path d="M12 8.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" />
  </Icon>
)

export const BookIcon = () => (
  <Icon>
    <path d="M4 5.5A1.5 1.5 0 015.5 4H11v16H5.5A1.5 1.5 0 014 18.5z" />
    <path d="M20 5.5A1.5 1.5 0 0018.5 4H13v16h5.5a1.5 1.5 0 001.5-1.5z" />
  </Icon>
)

export const SpeakerIcon = () => (
  <Icon>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" />
    <path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" />
  </Icon>
)

export const StopIcon = () => (
  <Icon>
    <rect x="7" y="7" width="10" height="10" rx="2" />
  </Icon>
)

export const SlowIcon = () => (
  <Icon>
    <path d="M3 17h13a4 4 0 004-4v0a4 4 0 00-4-4h-1" />
    <path d="M5 17a6 6 0 0112 0" />
    <path d="M18 9.5V7.5M20.5 10.5l1-1" />
  </Icon>
)

export const MicIcon = () => (
  <Icon>
    <rect x="9" y="3.5" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v2.5" />
  </Icon>
)

export const TalkIcon = () => (
  <Icon>
    <path d="M5 18.5V7a2.5 2.5 0 012.5-2.5h9A2.5 2.5 0 0119 7v6a2.5 2.5 0 01-2.5 2.5H9z" />
    <path d="M9 9.5v2M12 8.5v4M15 9.5v2" />
  </Icon>
)

export const SettingsIcon = () => (
  <Icon>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Icon>
)

export const AgainIcon = () => (
  <Icon>
    <path d="M4.5 12a7.5 7.5 0 101.8-4.9" />
    <path d="M4 4.5v3.5h3.5" />
  </Icon>
)

export const CloseIcon = () => (
  <Icon>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
)
