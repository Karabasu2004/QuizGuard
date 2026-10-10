import React from 'react';

interface PieChartProps {
  title: string;
  data: Array<{ label: string; value: number; color: string }>;
  isLight?: boolean;
}

export const PieChart: React.FC<PieChartProps> = ({ title, data, isLight = false }) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let accumulatedAngle = 0;

  const cardBg = isLight ? 'bg-white border-slate-200 text-slate-900 shadow-sm' : 'bg-slate-900/60 border-slate-800 text-white';
  const textMuted = isLight ? 'text-slate-500' : 'text-slate-400';

  return (
    <div className={`p-6 rounded-3xl border space-y-4 transition-colors ${cardBg}`}>
      <h3 className="text-sm font-bold flex items-center justify-between">
        <span>{title}</span>
        <span className={`text-xs font-mono ${textMuted}`}>Total: {total}</span>
      </h3>

      <div className="flex flex-col sm:flex-row items-center gap-6 justify-center">
        <svg viewBox="0 0 100 100" className="w-32 h-32 -rotate-90">
          {total === 0 ? (
            <circle cx="50" cy="50" r="40" fill="transparent" stroke={isLight ? '#E2E8F0' : '#1E293B'} strokeWidth="18" />
          ) : (
            data.map((slice, i) => {
              if (slice.value === 0) return null;
              const percentage = slice.value / total;
              const strokeDasharray = `${percentage * 251.2} 251.2`;
              const strokeDashoffset = -accumulatedAngle * 251.2;
              accumulatedAngle += percentage;

              return (
                <circle
                  key={i}
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke={slice.color}
                  strokeWidth="18"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-500"
                />
              );
            })
          )}
        </svg>

        <div className="space-y-2 text-xs font-mono">
          {data.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
              <span className={textMuted}>{item.label}:</span>
              <strong className="font-bold">{item.value}</strong>
              <span className={textMuted}>
                ({total > 0 ? Math.round((item.value / total) * 100) : 0}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
