import { useState } from 'react'

const SIZES = {
  sm: 'w-7 h-7 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-16 h-16 text-xl',
}

export default function Avatar({ photoUrl, displayName, size = 'md' }) {
  const [imgOk, setImgOk] = useState(true)
  const initials = (displayName || '?')
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  if (photoUrl && imgOk) {
    return (
      <img
        src={photoUrl}
        alt={displayName}
        onError={() => setImgOk(false)}
        className={`rounded-full object-cover shrink-0 ${SIZES[size]}`}
      />
    )
  }

  return (
    <div className={`rounded-full bg-emerald-800 flex items-center justify-center font-bold text-emerald-200 shrink-0 ${SIZES[size]}`}>
      {initials}
    </div>
  )
}
