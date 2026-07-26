"use client";

import { useState } from "react";

export interface DailyPoint {
  label: string;
  count: number;
}

const WIDTH = 600;
const HEIGHT = 180;
const PADDING = 24;

export function IdeasChart({ data }: { data: DailyPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const max = Math.max(1, ...data.map((d) => d.count));
  const stepX = (WIDTH - PADDING * 2) / Math.max(1, data.length - 1);

  function xFor(i: number) {
    return PADDING + i * stepX;
  }
  function yFor(count: number) {
    return HEIGHT - PADDING - (count / max) * (HEIGHT - PADDING * 2);
  }

  const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(d.count)}`).join(" ");
  const areaPath = `${linePath} L${xFor(data.length - 1)},${HEIGHT - PADDING} L${xFor(0)},${HEIGHT - PADDING} Z`;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Ideas generated per day">
        {/* recessive baseline */}
        <line x1={PADDING} y1={HEIGHT - PADDING} x2={WIDTH - PADDING} y2={HEIGHT - PADDING} stroke="#c3c2b7" strokeWidth={1} />

        <path d={areaPath} fill="#2a78d6" fillOpacity={0.12} />
        <path d={linePath} fill="none" stroke="#2a78d6" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {data.map((d, i) => (
          <g key={d.label}>
            <circle
              cx={xFor(i)}
              cy={yFor(d.count)}
              r={hoverIndex === i ? 5 : 3}
              fill="#2a78d6"
              stroke="#fcfcfb"
              strokeWidth={1.5}
            />
            {/* generous hit target, bigger than the visible marker */}
            <rect
              x={xFor(i) - stepX / 2}
              y={0}
              width={stepX}
              height={HEIGHT}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex((current) => (current === i ? null : current))}
            />
          </g>
        ))}
      </svg>

      {hoverIndex !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs shadow-md"
          style={{
            left: `${(xFor(hoverIndex) / WIDTH) * 100}%`,
            top: `${(yFor(data[hoverIndex].count) / HEIGHT) * 100}%`,
          }}
        >
          <span className="font-semibold text-zinc-900">{data[hoverIndex].count}</span>{" "}
          <span className="text-fg-faint">{data[hoverIndex].label}</span>
        </div>
      )}

      <div className="mt-1 flex justify-between text-[10px] text-fg-subtle">
        {data.map((d) => (
          <span key={d.label}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}
