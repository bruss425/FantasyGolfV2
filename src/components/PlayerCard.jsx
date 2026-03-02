import { useState } from 'react'
import { getPlayerMeta, getHeadshotUrl } from '../data/players'

function fmt(n) {
  if (!n || n === 0) return '$0'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${n.toLocaleString()}`
}

// Compact row — used in locked picks view
function CompactCard({ player, showEarnings }) {
  const meta = getPlayerMeta(player.name)
  const [imgOk, setImgOk] = useState(true)

  return (
    <div className="flex items-center gap-3 bg-gray-800/70 border border-gray-700/60 rounded-xl px-4 py-3">
      <div className="w-11 h-11 rounded-full overflow-hidden bg-gray-700 shrink-0">
        {imgOk ? (
          <img
            src={getHeadshotUrl(player.name)}
            alt={player.name}
            className="w-full h-full object-cover object-top"
            onError={() => setImgOk(false)}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-gray-600 to-gray-800" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-white text-sm truncate">{player.name}</p>
        <p className="text-xs text-gray-400">{meta.flag} {meta.country}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs text-gray-500">${player.price?.toLocaleString()}</p>
        {showEarnings && player.earnings > 0 && (
          <p className="text-sm font-bold text-emerald-400">{fmt(player.earnings)}</p>
        )}
      </div>
    </div>
  )
}

// Grid card — used in player selection
function GridCard({ player, isSelected, canAdd, onToggle }) {
  const meta = getPlayerMeta(player.name)
  const [imgOk, setImgOk] = useState(true)
  const disabled = !isSelected && !canAdd

  return (
    <div
      onClick={() => onToggle(player)}
      className={`relative rounded-2xl border overflow-hidden transition-all cursor-pointer select-none ${
        isSelected
          ? 'border-emerald-500 shadow-lg shadow-emerald-500/20 ring-1 ring-emerald-500/40'
          : disabled
            ? 'border-gray-700/30 opacity-40 cursor-not-allowed'
            : 'border-gray-700/60 hover:border-gray-500 active:scale-[0.98]'
      }`}
    >
      {/* Photo */}
      <div className="relative aspect-[3/2] bg-gray-900 overflow-hidden">
        {imgOk ? (
          <img
            src={getHeadshotUrl(player.name)}
            alt={player.name}
            className="w-full h-full object-cover object-top"
            onError={() => setImgOk(false)}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-gray-700 to-gray-900" />
        )}

        {/* Selected overlay */}
        {isSelected && (
          <div className="absolute inset-0 bg-emerald-500/10" />
        )}

        {/* Price badge — top left */}
        <div className={`absolute top-2 left-2 text-xs font-black px-2 py-0.5 rounded-full ${
          isSelected
            ? 'bg-emerald-500 text-white'
            : 'bg-black/60 text-emerald-400 backdrop-blur-sm'
        }`}>
          ${player.price?.toLocaleString()}
        </div>

        {/* Checkmark — top right when selected */}
        {isSelected && (
          <div className="absolute top-2 right-2 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center shadow-md">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
      </div>

      {/* Info */}
      <div className={`px-3 py-2.5 ${isSelected ? 'bg-emerald-950/60' : 'bg-gray-800'}`}>
        <p className="font-bold text-white text-sm leading-tight truncate">{player.name}</p>
        <p className="text-xs text-gray-400 mt-0.5 truncate">{meta.flag} {meta.country}</p>
      </div>
    </div>
  )
}

export default function PlayerCard({ player, isSelected, canAdd, onToggle, readOnly, showEarnings }) {
  if (readOnly) {
    return <CompactCard player={player} showEarnings={showEarnings} />
  }
  return <GridCard player={player} isSelected={isSelected} canAdd={canAdd} onToggle={onToggle} />
}
