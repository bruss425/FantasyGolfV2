export default function Cart({ picks, onRemove, canSubmit, onSubmit, submitting }) {
  const filled = picks.length
  const total = 5

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur border-t border-gray-700 shadow-2xl z-20">
      <div className="max-w-2xl mx-auto px-4 py-3">
        {/* Header row */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {Array.from({ length: total }).map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i < filled ? 'bg-emerald-400' : 'bg-gray-700'
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-gray-400 font-medium">{filled}/{total} picks</span>
          </div>
          <button
            onClick={onSubmit}
            disabled={!canSubmit || submitting}
            className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-700 disabled:text-gray-500 text-white disabled:cursor-not-allowed text-sm font-bold px-6 py-2 rounded-xl transition"
          >
            {submitting ? 'Saving...' : 'Submit Picks'}
          </button>
        </div>

        {/* Pick chips */}
        {picks.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {picks.map(p => (
              <button
                key={p.id}
                onClick={() => onRemove(p)}
                className="text-xs bg-emerald-900/40 text-emerald-300 border border-emerald-700/50 px-2.5 py-1 rounded-full hover:bg-red-900/30 hover:text-red-300 hover:border-red-700/50 transition"
                title="Click to remove"
              >
                {p.name} · ${p.price?.toLocaleString()} ×
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-600">Select 5 golfers within budget to submit.</p>
        )}
      </div>
    </div>
  )
}
