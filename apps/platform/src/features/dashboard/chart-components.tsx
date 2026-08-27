import { useId } from "react";

type ChartPoint = { label: string; value: number };

const formatNumber = new Intl.NumberFormat("vi-VN");

export function LineChart({ points, title }: { points: ChartPoint[]; title: string }) {
  const gradientId = useId().replace(/:/g, "");
  const width = 620;
  const height = 280;
  const plot = { left: 54, right: 18, top: 20, bottom: 52 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const rawMax = Math.max(...points.map((point) => point.value), 1);
  const max = Math.ceil(rawMax / 600) * 600;
  const coordinates = points.map((point, index) => ({
    ...point,
    x: plot.left + (index * plotWidth) / Math.max(points.length - 1, 1),
    y: plot.top + plotHeight - (point.value / max) * plotHeight,
  }));
  const linePath = coordinates
    .map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`)
    .join(" ");
  const areaPath = coordinates.length
    ? `${linePath} L${coordinates.at(-1)?.x},${plot.top + plotHeight} L${coordinates[0]?.x},${plot.top + plotHeight} Z`
    : "";

  return (
    <svg className="aeck-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e51b2b" stopOpacity="0.2" />
          <stop offset="1" stopColor="#e51b2b" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {Array.from({ length: 5 }, (_, index) => {
        const y = plot.top + (index * plotHeight) / 4;
        const value = Math.round(max - (index * max) / 4);
        return (
          <g key={value}>
            <line x1={plot.left} y1={y} x2={width - plot.right} y2={y} className="chart-grid-line" />
            <text x={plot.left - 10} y={y + 4} textAnchor="end" className="chart-axis-label">
              {formatNumber.format(value)}
            </text>
          </g>
        );
      })}
      {areaPath ? <path d={areaPath} fill={`url(#${gradientId})`} /> : null}
      {linePath ? <path d={linePath} className="chart-line" /> : null}
      {coordinates.map((point) => (
        <g key={point.label}>
          <circle cx={point.x} cy={point.y} r="5" className="chart-point" />
          <text x={point.x} y={height - 18} textAnchor="middle" className="chart-axis-label">
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function BarChart({
  points,
  title,
  neutralAfterFirst = false,
}: {
  points: ChartPoint[];
  title: string;
  neutralAfterFirst?: boolean;
}) {
  const width = 620;
  const height = 280;
  const plot = { left: 48, right: 16, top: 28, bottom: 54 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const max = Math.max(...points.map((point) => point.value), 1);
  const slotWidth = plotWidth / Math.max(points.length, 1);
  const barWidth = Math.min(52, slotWidth * 0.58);

  return (
    <svg className="aeck-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
      {Array.from({ length: 5 }, (_, index) => {
        const y = plot.top + (index * plotHeight) / 4;
        return <line key={y} x1={plot.left} y1={y} x2={width - plot.right} y2={y} className="chart-grid-line" />;
      })}
      {points.map((point, index) => {
        const barHeight = (point.value / max) * (plotHeight - 8);
        const x = plot.left + index * slotWidth + (slotWidth - barWidth) / 2;
        const y = plot.top + plotHeight - barHeight;
        return (
          <g key={point.label}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx="1.5"
              className={neutralAfterFirst && index > 0 ? "chart-bar chart-bar-neutral" : "chart-bar"}
            />
            <text x={x + barWidth / 2} y={y - 8} textAnchor="middle" className="chart-value-label">
              {formatNumber.format(point.value)}
            </text>
            <text x={x + barWidth / 2} y={height - 18} textAnchor="middle" className="chart-axis-label">
              {point.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function DonutChart({
  percentage,
  label,
  tone,
}: {
  percentage: number;
  label: string;
  tone: "green" | "red";
}) {
  return (
    <div
      className={`aeck-donut aeck-donut-${tone}`}
      style={{ "--donut-value": `${Math.max(0, Math.min(100, percentage)) * 3.6}deg` } as React.CSSProperties}
      role="img"
      aria-label={`${label}: ${percentage}%`}
    >
      <div>
        <strong>{percentage}%</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}
