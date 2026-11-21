export function SearchIcon({ size = 20 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.6" />
      <path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function ArrowIcon({ size = 16 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function BackIcon({ size = 16 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M19 12H6M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ImageIcon({ size = 16 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="9.5" r="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="m5.5 17 4.2-4.2a1.8 1.8 0 0 1 2.6 0l1.4 1.4 1.3-1.3a1.8 1.8 0 0 1 2.6 0l1.9 1.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function CaptureIcon({ size = 16 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M8 4.5H6.5A2 2 0 0 0 4.5 6.5V8M16 4.5h1.5a2 2 0 0 1 2 2V8M8 19.5H6.5a2 2 0 0 1-2-2V16M16 19.5h1.5a2 2 0 0 0 2-2V16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="8" y="8" width="8" height="8" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function VolumeIcon({ size = 18, muted = false }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 9v6h4l5 4V5L9 9H5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      {!muted && (
        <>
          <path d="M17 9.2a4.2 4.2 0 0 1 0 5.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M19.2 6.8a7.4 7.4 0 0 1 0 10.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}

export function CloseIcon({ size = 16 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

export function PinIcon({ size = 16, filled = false }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 17v4M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.8a2 2 0 0 0-1.1-1.8l-1.8-.9A2 2 0 0 1 15 10.8V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1v3.8Z"
        fill={filled ? 'currentColor' : 'none'}
        fillOpacity={filled ? 0.18 : 0}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SparkIcon({ size = 18 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2.8 13.7 9l6.2 1.7-6.2 1.7L12 18.6l-1.7-6.2L4.1 10.7 10.3 9 12 2.8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M18.5 16.5v3M17 18h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function HistoryIcon({ size = 18 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4.6 8.1A8.3 8.3 0 1 1 4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 4.5v4.2h4.2M12 7.7V12l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function QuoteIcon({ size = 24 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M9.4 5.8c-2.6 1.2-4 3.4-4 6.5v5.9h5.8v-6H7.6c.1-2.1.9-3.5 2.6-4.4L9.4 5.8Zm9 0c-2.6 1.2-4 3.4-4 6.5v5.9h5.8v-6h-3.6c.1-2.1.9-3.5 2.6-4.4l-.8-2Z" fill="currentColor" opacity=".28" />
    </svg>
  )
}

export function RotateIcon({ size = 17 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M20 11a8 8 0 1 0-2.3 6.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M20 5v6h-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ExternalIcon({ size = 14 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M14 4h6v6M20 4l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
