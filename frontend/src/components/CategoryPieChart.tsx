import React, { useState } from 'react';
import { PieChart as PieIcon, Layers } from 'lucide-react';

export interface CategoryData {
  category_name: string;
  category_color?: string;
  revenue: number;
  units_sold: number;
  profit?: number;
  percentage: number;
}

interface CategoryPieChartProps {
  categories: CategoryData[];
  currency: string;
  title?: string;
}

const DEFAULT_PALETTE = [
  '#10b981', // emerald-500
  '#3b82f6', // blue-500
  '#8b5cf6', // purple-500
  '#f59e0b', // amber-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#6366f1', // indigo-500
  '#14b8a6', // teal-500
  '#e11d48', // rose-600
];

export const CategoryPieChart: React.FC<CategoryPieChartProps> = ({
  categories,
  currency,
  title = 'Sales by Product Category',
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const totalRevenue = categories.reduce((sum, c) => sum + Number(c.revenue || 0), 0);

  if (!categories || categories.length === 0 || totalRevenue === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center min-h-[300px] text-center">
        <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-500 mb-3">
          <PieIcon className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-slate-300">{title}</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-xs">
          No category sales recorded for this period. Completed sales will generate a live breakdown here.
        </p>
      </div>
    );
  }

  // Calculate SVG Pie/Donut Slices
  const size = 260;
  const center = size / 2;
  const radius = 95;
  const innerRadius = 60; // Donut hole radius

  let cumulativeAngle = -Math.PI / 2; // Start from top (-90 degrees)

  const slices = categories.map((cat, idx) => {
    const fraction = totalRevenue > 0 ? (Number(cat.revenue) / totalRevenue) : 0;
    const angle = fraction * 2 * Math.PI;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + angle;
    cumulativeAngle = endAngle;

    // Outer arc points
    const x1 = center + radius * Math.cos(startAngle);
    const y1 = center + radius * Math.sin(startAngle);
    const x2 = center + radius * Math.cos(endAngle);
    const y2 = center + radius * Math.sin(endAngle);

    // Inner arc points
    const ix1 = center + innerRadius * Math.cos(endAngle);
    const iy1 = center + innerRadius * Math.sin(endAngle);
    const ix2 = center + innerRadius * Math.cos(startAngle);
    const iy2 = center + innerRadius * Math.sin(startAngle);

    const largeArcFlag = angle > Math.PI ? 1 : 0;

    // SVG path: move to outer start -> arc to outer end -> line to inner end -> arc to inner start -> close
    // If only 1 category fills 100%, render two half arcs to avoid SVG 360-deg collapse
    let pathData = '';
    if (fraction >= 0.999) {
      pathData = `
        M ${center} ${center - radius}
        A ${radius} ${radius} 0 1 0 ${center} ${center + radius}
        A ${radius} ${radius} 0 1 0 ${center} ${center - radius}
        M ${center} ${center - innerRadius}
        A ${innerRadius} ${innerRadius} 0 1 1 ${center} ${center + innerRadius}
        A ${innerRadius} ${innerRadius} 0 1 1 ${center} ${center - innerRadius}
        Z
      `;
    } else {
      pathData = `
        M ${x1} ${y1}
        A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}
        L ${ix1} ${iy1}
        A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${ix2} ${iy2}
        Z
      `;
    }

    const color = cat.category_color && cat.category_color.startsWith('#')
      ? cat.category_color
      : DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length];

    return {
      ...cat,
      color,
      pathData,
      fraction,
    };
  });

  const activeCategory = hoveredIdx !== null ? slices[hoveredIdx] : null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
            <PieIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">{title}</h3>
            <span className="text-[11px] text-slate-400">Revenue split across department categories</span>
          </div>
        </div>
        <span className="text-xs font-mono font-bold text-slate-300 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
          {categories.length} {categories.length === 1 ? 'Category' : 'Categories'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center py-4">
        {/* SVG Donut Chart */}
        <div className="md:col-span-6 flex flex-col items-center justify-center relative">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="overflow-visible drop-shadow-md"
          >
            {slices.map((slice, idx) => {
              const isHovered = hoveredIdx === idx;
              return (
                <path
                  key={idx}
                  d={slice.pathData}
                  fill={slice.color}
                  className="transition-all duration-200 cursor-pointer"
                  style={{
                    transform: isHovered ? 'scale(1.04)' : 'scale(1)',
                    transformOrigin: `${center}px ${center}px`,
                    opacity: hoveredIdx === null || isHovered ? 1 : 0.45,
                    filter: isHovered ? 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))' : 'none',
                  }}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              );
            })}
          </svg>

          {/* Donut Center Display */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
            {activeCategory ? (
              <>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold truncate max-w-[110px]">
                  {activeCategory.category_name}
                </span>
                <span className="text-base font-black text-white font-mono leading-tight">
                  {currency}{Number(activeCategory.revenue).toFixed(2)}
                </span>
                <span className="text-xs font-bold text-emerald-400 font-mono">
                  {activeCategory.percentage}%
                </span>
              </>
            ) : (
              <>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                  Total
                </span>
                <span className="text-base font-black text-white font-mono leading-tight">
                  {currency}{totalRevenue.toFixed(2)}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  {categories.length} Depts
                </span>
              </>
            )}
          </div>
        </div>

        {/* Legend with percentages and amounts */}
        <div className="md:col-span-6 space-y-2 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
          {slices.map((cat, idx) => {
            const isHovered = hoveredIdx === idx;
            return (
              <div
                key={idx}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className={`flex items-center justify-between p-2 rounded-xl transition cursor-pointer text-xs ${
                  isHovered
                    ? 'bg-slate-800 border border-slate-700 shadow-sm'
                    : 'hover:bg-slate-850 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-3 h-3 rounded-full shrink-0 shadow-xs"
                    style={{ backgroundColor: cat.color }}
                  />
                  <div className="min-w-0">
                    <p className="font-bold text-slate-200 truncate leading-tight">
                      {cat.category_name}
                    </p>
                    <span className="text-[10px] text-slate-400">
                      {cat.units_sold} units sold
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0 pl-2">
                  <span className="font-mono font-bold text-slate-100 block leading-tight">
                    {currency}{Number(cat.revenue).toFixed(2)}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 font-mono">
                    {cat.percentage}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
