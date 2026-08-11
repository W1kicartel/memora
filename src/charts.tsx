/**
 * Tiny dependency-free SVG charts. Built by hand (no chart library) to keep the
 * bundle small and demonstrate the underlying scaling/path math. Each chart is
 * a pure function of its data props.
 */

interface LinePoint {
  label: string;
  value: number; // 0..1 for accuracy, or any positive number
}

/** A smooth-ish line chart for a 0..1 series (e.g. accuracy over time). */
export function LineChart({
  data,
  height = 140,
  color = "var(--pink)",
  yMax = 1,
  format = (v: number) => `${Math.round(v * 100)}%`,
}: {
  data: LinePoint[];
  height?: number;
  color?: string;
  yMax?: number;
  format?: (v: number) => string;
}) {
  const width = 320;
  const padX = 8;
  const padY = 14;
  if (data.length === 0) return <Empty height={height} />;

  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  const x = (i: number) => padX + i * stepX;
  const y = (v: number) => padY + innerH * (1 - Math.min(v, yMax) / yMax);

  const path = data
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");
  const area = `${path} L ${x(data.length - 1).toFixed(1)} ${padY + innerH} L ${x(0).toFixed(1)} ${padY + innerH} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="chart" role="img" aria-label="line chart">
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <line key={g} x1={padX} x2={width - padX} y1={y(g * yMax)} y2={y(g * yMax)} className="grid" />
      ))}
      <path d={area} fill={color} opacity="0.12" />
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r="3" fill={color} />
      ))}
      <text x={padX} y={height - 2} className="axis">{data[0].label}</text>
      <text x={width - padX} y={height - 2} textAnchor="end" className="axis">
        {data[data.length - 1].label}
      </text>
      <text x={width - padX} y={padY} textAnchor="end" className="axis">
        {format(data[data.length - 1].value)}
      </text>
    </svg>
  );
}

interface Bar {
  label: string;
  value: number;
}

/** A simple vertical bar chart for counts (forecast, ease histogram, reviews). */
export function BarChart({
  data,
  height = 150,
  color = "var(--g-blue)",
}: {
  data: Bar[];
  height?: number;
  color?: string;
}) {
  const width = 320;
  const padX = 8;
  const padTop = 12;
  const padBottom = 28;
  if (data.length === 0) return <Empty height={height} />;

  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;
  const max = Math.max(1, ...data.map((d) => d.value));
  const slot = innerW / data.length;
  const barW = Math.min(40, slot * 0.6);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="chart" role="img" aria-label="bar chart">
      {data.map((d, i) => {
        const h = (d.value / max) * innerH;
        const cx = padX + slot * i + slot / 2;
        return (
          <g key={i}>
            <rect
              x={cx - barW / 2}
              y={padTop + innerH - h}
              width={barW}
              height={h}
              rx="4"
              fill={color}
              opacity={d.value === 0 ? 0.25 : 0.85}
            />
            {d.value > 0 && (
              <text x={cx} y={padTop + innerH - h - 4} textAnchor="middle" className="axis">
                {d.value}
              </text>
            )}
            {d.label.split("\n").map((line, li) => (
              <text
                key={li}
                x={cx}
                y={height - padBottom + 14 + li * 11}
                textAnchor="middle"
                className="axis"
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function Empty({ height }: { height: number }) {
  return (
    <svg viewBox={`0 0 320 ${height}`} className="chart">
      <text x="160" y={height / 2} textAnchor="middle" className="axis">
        No data yet — start studying!
      </text>
    </svg>
  );
}
