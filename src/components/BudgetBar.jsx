export default function BudgetBar({ totalSpent, budget }) {
  const pct = budget > 0 ? Math.min((totalSpent / budget) * 100, 100) : 0
  const over = totalSpent > budget
  const remaining = budget - totalSpent

  return (
    <div className="px-4 py-3 bg-gray-900 border-b border-gray-700/60">
      <div className="flex justify-between items-center text-xs mb-2">
        <span className="text-gray-400 font-medium">Budget</span>
        <div className="flex items-center gap-3">
          <span className={`font-bold tabular-nums ${over ? 'text-red-400' : 'text-white'}`}>
            ${totalSpent.toLocaleString()}
            <span className="text-gray-600 font-normal"> / ${budget?.toLocaleString()}</span>
          </span>
          {!over && (
            <span className="text-gray-500 tabular-nums">${remaining.toLocaleString()} left</span>
          )}
          {over && (
            <span className="text-red-400 font-semibold">Over budget</span>
          )}
        </div>
      </div>
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${over ? 'bg-red-500' : 'bg-emerald-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
