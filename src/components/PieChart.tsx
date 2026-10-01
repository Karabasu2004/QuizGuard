import React from 'react';

export interface PieChartSegment {
  label: string;
  value: number;
  color: string;
}

interface PieChartProps {
  title: string;
  data: PieChartSegment[];
  size?: number;
}

export const PieChart: React.FC<PieChartProps> = ({ title, data, size = 160 }) => {
  const total = data.reduce((acc, curr) => acc + curr.value, 0);
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;

  return (
    <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-3xl flex flex-col items-center justify-between">
      <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-3 text-center">{title}</h4>
      
      {total === 0 ? (
        <div className="h-36 flex items-center justify-center text-xs text-slate-500 font-mono">
          No assessment data yet
        </div>
      ) : (
        <div className="flex items-center gap-6">
          <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
              {data.map((segment, idx) => {
                const percent = segment.value / total;
                const dashOffset = circumference * (1 - accumulatedPercent);
                const dashArray = `${circumference * percent} ${circumference * (1 - percent)}`;
                accumulatedPercent += percent;

                return (
                  <circle
                    key={idx}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="transparent"
                    stroke={segment.color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={dashArray}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                    className="transition-all duration-700 ease-out"
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-lg font-black font-mono text-white leading-none">{total}</span>
              <span className="text-[10px] text-slate-400 font-mono uppercase mt-0.5">Total</span>
            </div>
          </div>

          <div className="space-y-2 text-xs">
            {data.map((seg, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-md shrink-0" style={{ backgroundColor: seg.color }}></span>
                <span className="text-slate-300 font-medium">{seg.label}:</span>
                <span className="font-mono font-bold text-white">
                  {seg.value} ({total > 0 ? Math.round((seg.value / total) * 100) : 0}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
