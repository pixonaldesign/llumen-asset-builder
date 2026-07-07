/**
 * Live SVG chart preview.
 * Renders the active chart type and reflects the current control values
 * through the `cfg(group, name, fallback)` accessor.
 */

import type { PreviewSeries } from "./componentPreviewProfiles";

type Cfg = (group: string, name: string, fallback: unknown) => unknown;

const W = 240;
const H = 150;
const P = 16;
const BRAND = "#73adf5";

const num = (v: unknown, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const str = (v: unknown, d: string) => (typeof v === "string" && v ? v : d);

const PALETTE = (base: string) => [base, "#c6a7ff", "#ffd58a", "#7ee0c0", "#f0888c", "#9bd1ff"];

const pickerCfg: Cfg = (_group, _name, fallback) => fallback;

/* polar point — 0° points up, clockwise positive */
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function arcStroke(cx: number, cy: number, r: number, a0: number, a1: number) {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} ${sweep} ${x1} ${y1}`;
}
function wedge(cx: number, cy: number, rO: number, rI: number, a0: number, a1: number) {
  const [ox0, oy0] = polar(cx, cy, rO, a0);
  const [ox1, oy1] = polar(cx, cy, rO, a1);
  const [ix1, iy1] = polar(cx, cy, rI, a1);
  const [ix0, iy0] = polar(cx, cy, rI, a0);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${ox0} ${oy0} A ${rO} ${rO} 0 ${large} 1 ${ox1} ${oy1} L ${ix1} ${iy1} A ${rI} ${rI} 0 ${large} 0 ${ix0} ${iy0} Z`;
}

const pt = (p: [number, number]) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
function linearPath(pts: [number, number][]) {
  return "M " + pts.map(pt).join(" L ");
}
function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return linearPath(pts);
  let d = `M ${pt(pts[0])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${pt(p2)}`;
  }
  return d;
}
function stepPath(pts: [number, number][]) {
  let d = `M ${pt(pts[0])}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i][0].toFixed(1)} ${pts[i - 1][1].toFixed(1)} L ${pt(pts[i])}`;
  }
  return d;
}
function buildPath(pts: [number, number][], curve: string) {
  const c = curve.toLowerCase();
  if (c.includes("step")) return stepPath(pts);
  if (c.includes("linear")) return linearPath(pts);
  return smoothPath(pts);
}

type RenderProps = { cfg: Cfg; chartId: string; minimal?: boolean; compact?: boolean; series?: PreviewSeries };

function normalizeSeries(values: number[], maxHint?: number) {
  const max = maxHint ?? Math.max(...values, 1);
  return values.map((value) => value / max);
}

/* ---- per-type renderers ---- */
function Bars({ cfg, minimal, compact, series }: RenderProps) {
  const color = minimal && !series ? BRAND : str(cfg("Colors", "Single color", BRAND), BRAND);
  const sort = minimal && !series ? false : bool(cfg("Bar Styling", "Sort by value", true), true);
  const showLabels =
    !minimal &&
    !compact &&
    bool(cfg("Bar Styling", "Show values on bars", true), true) &&
    bool(cfg("Layout & Visibility", "Show data labels", true), true);
  const radiusPct = num(cfg("Bar Styling", "Corner radius", 30), 30);
  const widthPct = num(cfg("Bar Styling", "Bar width", 60), 60);
  const legend = !minimal && !compact && bool(cfg("Legend", "Show legend", false), false);

  let data = series?.values ?? [40, 72, 30, 58, 90, 64];
  if (sort) data = [...data].sort((a, b) => b - a);
  const n = data.length;
  const max = Math.max(...data);
  const legendH = legend ? 16 : 0;
  const plotW = W - 2 * P;
  const plotH = H - 2 * P - legendH;
  const slot = plotW / n;
  const bw = slot * (0.32 + 0.6 * (widthPct / 100));
  const r = Math.min(bw / 2, (radiusPct / 100) * (bw / 2));

  return (
    <>
      {data.map((d, i) => {
        const bh = (d / max) * plotH;
        const x = P + i * slot + (slot - bw) / 2;
        const y = P + plotH - bh;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={bh} rx={r} fill={color} />
            {showLabels && (
              <text x={x + bw / 2} y={y - 4} fill="rgba(255,255,255,.7)" fontSize="8" textAnchor="middle">
                {d}
              </text>
            )}
          </g>
        );
      })}
      {legend && (
        <g>
          <rect x={P} y={H - 12} width={9} height={9} rx={2} fill={color} />
          <text x={P + 13} y={H - 4} fill="rgba(255,255,255,.55)" fontSize="8">
            Series A
          </text>
        </g>
      )}
    </>
  );
}

function LineArea({ cfg, chartId, minimal, compact, series }: RenderProps) {
  const color = minimal && !series ? BRAND : str(cfg("Colors", "Single color", BRAND), BRAND);
  const grp = chartId === "area" ? "Line/Area Styling" : "Line Styling";
  const style = str(cfg(grp, "Chart style", chartId === "area" ? "Area" : "Line"), "Line");
  const isArea = chartId === "area" || style === "Area";
  const strokePct = num(cfg(grp, "Stroke width", 50), 50);
  const sw = minimal && !series ? 2.5 : 1.5 + (strokePct / 100) * 5;
  const showPoints = !minimal && !compact && bool(cfg(grp, "Show data points", true), true);
  const curve = str(cfg(grp, "Curve interpolation", "Smooth"), "Smooth");
  const fillPct = num(cfg("Line/Area Styling", "Fill opacity", 35), 35);

  const ys = series?.values ? normalizeSeries(series.values) : [0.5, 0.28, 0.42, 0.12, 0.34, 0.05, 0.2];
  const plotW = W - 2 * P;
  const plotH = H - 2 * P;
  const pts: [number, number][] = ys.map((v, i) => [P + (i / (ys.length - 1)) * plotW, P + v * plotH]);
  const line = buildPath(pts, curve);
  const baseY = P + plotH;
  const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${baseY} L ${pts[0][0].toFixed(1)} ${baseY} Z`;

  return (
    <>
      {isArea && <path d={area} fill={color} opacity={minimal ? 0.35 : 0.1 + (fillPct / 100) * 0.5} />}
      <path d={line} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      {showPoints &&
        pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={sw * 0.9 + 1} fill={color} stroke="#0c0f15" strokeWidth="1.5" />)}
    </>
  );
}

function PieDonut({ cfg, chartId, minimal, compact, series }: RenderProps) {
  const base = minimal && !series ? BRAND : str(cfg("Colors", "Single color", BRAND), BRAND);
  const palette = minimal && !series ? PALETTE(BRAND) : PALETTE(base);
  const style = str(cfg("Pie Styling", "Chart style", "Donut"), "Donut");
  const isDonut = chartId === "polar" ? true : style === "Donut";
  const innerPct = num(cfg("Pie Styling", "Inner radius", 55), 55);
  const startPct = num(cfg("Pie Styling", "Start angle", 0), 0);
  const padPct = num(cfg("Pie Styling", "Pad angle (slice gap)", 8), 8);
  const showCenter = !minimal && !compact && bool(cfg("Pie Styling", "Show center value", true), true);

  const cx = W / 2;
  const cy = H / 2;
  const rO = 56;
  const rI = isDonut ? rO * (0.3 + (innerPct / 100) * 0.55) : 0;
  const start = (startPct / 100) * 360;
  const pad = (padPct / 100) * 12;
  const data =
    series?.values ?? (chartId === "polar" ? [22, 18, 16, 14, 12, 10, 8] : [34, 24, 18, 14, 10]);
  const total = data.reduce((a, b) => a + b, 0);
  let cursor = start;
  const centerValue = series?.values
    ? `${Math.round((Math.max(...series.values) / total) * 100)}%`
    : "72%";

  return (
    <>
      {data.map((d, i) => {
        const sweep = (d / total) * 360;
        const a0 = cursor + pad / 2;
        const a1 = cursor + sweep - pad / 2;
        cursor += sweep;
        return <path key={i} d={wedge(cx, cy, rO, rI, a0, a1)} fill={palette[i % palette.length]} />;
      })}
      {isDonut && showCenter && (
        <text x={cx} y={cy + 5} fill="#fff" fontSize="18" fontWeight="500" textAnchor="middle">
          {centerValue}
        </text>
      )}
    </>
  );
}

function Gauge({ cfg, minimal, compact, series }: RenderProps) {
  const zonesOn = minimal && !series ? true : bool(cfg("Gauge — zone colors", "Color zones on dial", true), true);
  const startPct = num(cfg("Gauge — zone colors", "Arc start angle", 17), 17);
  const endPct = num(cfg("Gauge — zone colors", "Arc end angle", 83), 83);
  const showCenter = !minimal && !compact && bool(cfg("Gauge — meter & labels", "Show center value", true), true);
  const base = minimal && !series ? BRAND : str(cfg("Colors", "Single color", BRAND), BRAND);

  const a0 = -180 + (startPct / 100) * 360;
  const a1 = -180 + (endPct / 100) * 360;
  const cx = W / 2;
  const cy = H / 2 + 18;
  const r = 60;
  const value = series?.gaugeValue ?? 72;
  const va = a0 + ((a1 - a0) * value) / 100;
  const [nx, ny] = polar(cx, cy, r - 12, va);
  const zones = minimal ? [BRAND, "#9bd1ff", "#c6a7ff"] : ["#34d399", "#fbbf24", "#f87171"];

  return (
    <>
      <path d={arcStroke(cx, cy, r, a0, a1)} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="10" strokeLinecap="round" />
      {zonesOn ? (
        zones.map((c, i) => {
          const z0 = a0 + ((a1 - a0) * i) / 3;
          const z1 = a0 + ((a1 - a0) * (i + 1)) / 3;
          return <path key={i} d={arcStroke(cx, cy, r, z0, z1)} fill="none" stroke={c} strokeWidth="10" strokeLinecap="round" />;
        })
      ) : (
        <path d={arcStroke(cx, cy, r, a0, va)} fill="none" stroke={base} strokeWidth="10" strokeLinecap="round" />
      )}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="4" fill="#fff" />
      {showCenter && (
        <text x={cx} y={cy - 18} fill="#fff" fontSize="20" fontWeight="500" textAnchor="middle">
          {value}
        </text>
      )}
    </>
  );
}

function Scatter({ cfg, minimal }: RenderProps) {
  const color = minimal ? BRAND : str(cfg("Colors", "Single color", BRAND), BRAND);
  const radiusPct = num(cfg("Point Styling", "Radius", 40), 40);
  const shape = str(cfg("Point Styling", "Point shape", "Circle"), "Circle");
  const opacityPct = num(cfg("Point Styling", "Point opacity", 70), 70);
  const baseR = minimal ? 4 : 2 + (radiusPct / 100) * 5;
  const op = minimal ? 0.85 : 0.3 + (opacityPct / 100) * 0.7;

  return (
    <>
      {Array.from({ length: 22 }).map((_, i) => {
        const x = P + ((i * 53) % (W - 2 * P));
        const y = P + ((i * i * 19) % (H - 2 * P));
        const r = baseR + (i % 3) * (minimal ? 0.5 : 1);
        if (shape === "Square") return <rect key={i} x={x - r} y={y - r} width={r * 2} height={r * 2} rx={1} fill={color} opacity={op} />;
        if (shape === "Triangle")
          return <polygon key={i} points={`${x},${y - r} ${x - r},${y + r} ${x + r},${y + r}`} fill={color} opacity={op} />;
        return <circle key={i} cx={x} cy={y} r={r} fill={color} opacity={op} />;
      })}
    </>
  );
}

function HBars({ cfg, chartId, minimal, compact, series }: RenderProps) {
  const color = minimal && !series ? BRAND : str(cfg("Progress Styling", "Fill color", cfg("Colors", "Single color", BRAND)), BRAND);
  const showLabels = !minimal && !compact && bool(cfg("Layout & Visibility", "Show data labels", true), true);
  const corner = str(cfg("Progress Styling", "Corner radius", "Pill"), "Pill");
  const rad = corner === "Square" ? 2 : corner === "Rounded" ? 5 : 999;
  const data = series?.values ?? (chartId === "progress" ? [68] : [84, 72, 61, 44]);
  const n = data.length;
  const plotW = W - 2 * P;
  const gap = 12;
  const bh = Math.min(20, (H - 2 * P - gap * (n - 1)) / n);
  const max = Math.max(...data, 1);

  return (
    <>
      {data.map((v, i) => {
        const y = P + i * (bh + gap);
        return (
          <g key={i}>
            <rect x={P} y={y} width={plotW} height={bh} rx={Math.min(rad, bh / 2)} fill="rgba(255,255,255,.1)" />
            <rect x={P} y={y} width={(v / max) * plotW} height={bh} rx={Math.min(rad, bh / 2)} fill={color} />
            {showLabels && (
              <text x={P + plotW - 4} y={y + bh / 2 + 3} fill="rgba(255,255,255,.7)" fontSize="8" textAnchor="end">
                {max <= 100 ? `${v}%` : v}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}

function Kpi({ cfg, minimal, series }: RenderProps) {
  if (minimal && !series) {
    return (
      <>
        <rect x={P + 20} y={P + 18} width={W - 2 * P - 40} height={28} rx={6} fill="rgba(255,255,255,.08)" />
        <rect x={P + 20} y={P + 18} width={(W - 2 * P - 40) * 0.55} height={28} rx={6} fill={BRAND} opacity={0.9} />
        <path
          d={`M ${P + 24} ${H - P - 20} L ${P + 56} ${H - P - 36} L ${P + 92} ${H - P - 28} L ${P + 128} ${H - P - 44} L ${W - P - 24} ${H - P - 24}`}
          fill="none"
          stroke={BRAND}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    );
  }

  const showComparison = bool(cfg("KPI Card Display", "Show comparison vs last period", true), true);
  const showUnit = bool(cfg("KPI Card Display", "Show unit", true), true);
  const primary = series?.kpiPrimary ?? "84";
  const unit = showUnit ? (series?.kpiUnit ?? "%") : "";
  const comparison = series?.kpiComparison ?? "+6.2%";
  return (
    <>
      <text x={W / 2} y={H / 2 + 2} fill="#fff" fontSize="40" fontWeight="500" textAnchor="middle">
        {primary}
        {unit}
      </text>
      {showComparison && (
        <text x={W / 2} y={H / 2 + 24} fill="rgba(255,255,255,.5)" fontSize="9" textAnchor="middle">
          {comparison}
        </text>
      )}
    </>
  );
}

function Table({ minimal }: { minimal?: boolean }) {
  if (minimal) {
    const rowH = (H - 2 * P) / 5;
    return (
      <>
        <rect x={P} y={P} width={W - 2 * P} height={rowH} rx={4} fill="rgba(255,255,255,.08)" />
        {Array.from({ length: 4 }).map((_, i) => {
          const y = P + rowH + 4 + i * (rowH + 4);
          return (
            <g key={i}>
              <rect x={P} y={y} width={W - 2 * P} height={rowH - 2} rx={3} fill="rgba(255,255,255,.05)" />
              <rect x={P + 8} y={y + rowH / 2 - 3} width={(W - 2 * P) * 0.35} height={6} rx={3} fill="rgba(255,255,255,.12)" />
              <rect x={P + (W - 2 * P) * 0.55} y={y + rowH / 2 - 3} width={(W - 2 * P) * 0.28} height={6} rx={3} fill={BRAND} opacity={0.75} />
            </g>
          );
        })}
      </>
    );
  }

  const rows = [
    ["Metric", "Value", "Status"],
    ["Permits", "1,240", "Healthy"],
    ["Waste", "+15%", "Watch"],
    ["Complaints", "+12%", "Risk"],
  ];
  const rowH = (H - 2 * P) / rows.length;
  return (
    <>
      {rows.map((cols, i) => (
        <g key={i}>
          {i > 0 && <line x1={P} y1={P + i * rowH} x2={W - P} y2={P + i * rowH} stroke="rgba(255,255,255,.08)" />}
          {cols.map((c, j) => (
            <text
              key={j}
              x={P + 6 + j * ((W - 2 * P) / 3)}
              y={P + i * rowH + rowH / 2 + 3}
              fill={i === 0 ? "#fff" : "rgba(255,255,255,.5)"}
              fontSize="8"
            >
              {c}
            </text>
          ))}
        </g>
      ))}
    </>
  );
}

function RangeMinimal() {
  const y = H / 2;
  const x0 = P + 20;
  const x1 = W - P - 20;
  return (
    <>
      <line x1={x0} y1={y} x2={x1} y2={y} stroke="rgba(255,255,255,.15)" strokeWidth="8" strokeLinecap="round" />
      <line x1={x0 + 36} y1={y} x2={x1 - 48} y2={y} stroke={BRAND} strokeWidth="8" strokeLinecap="round" />
      <circle cx={x0 + 36} cy={y} r="7" fill="#fff" />
      <circle cx={x1 - 48} cy={y} r="7" fill="#fff" />
    </>
  );
}

function AvailabilityMinimal() {
  const cols = 10;
  const rows = 6;
  const gap = 4;
  const cellW = (W - 2 * P - gap * (cols - 1)) / cols;
  const cellH = (H - 2 * P - gap * (rows - 1)) / rows;
  const on = new Set([2, 5, 8, 11, 14, 17, 21, 24, 28, 31, 35, 38, 42, 45, 49, 52]);

  return (
    <>
      {Array.from({ length: rows * cols }).map((_, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const x = P + col * (cellW + gap);
        const y = P + row * (cellH + gap);
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={cellW}
            height={cellH}
            rx={2}
            fill={on.has(i) ? BRAND : "rgba(255,255,255,.08)"}
            opacity={on.has(i) ? 0.55 + (i % 3) * 0.15 : 1}
          />
        );
      })}
    </>
  );
}

function KpiGridMinimal() {
  const gap = 10;
  const cardW = (W - 2 * P - gap) / 2;
  const cardH = (H - 2 * P - gap) / 2;
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = P + col * (cardW + gap);
        const y = P + row * (cardH + gap);
        return (
          <g key={i}>
            <rect x={x} y={y} width={cardW} height={cardH} rx={6} fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.08)" />
            <rect x={x + 10} y={y + 12} width={cardW * 0.45} height={6} rx={3} fill="rgba(255,255,255,.12)" />
            <rect x={x + 10} y={y + cardH - 18} width={cardW - 20} height={6} rx={3} fill={BRAND} opacity={0.65 + (i % 2) * 0.2} />
          </g>
        );
      })}
    </>
  );
}

function LinearGaugeMinimal() {
  const y = H / 2 + 8;
  const x0 = P + 16;
  const x1 = W - P - 16;
  const mid = x0 + (x1 - x0) * 0.62;
  return (
    <>
      <rect x={x0} y={y - 8} width={x1 - x0} height={16} rx={8} fill="rgba(255,255,255,.1)" />
      <rect x={x0} y={y - 8} width={mid - x0} height={16} rx={8} fill={BRAND} />
      <circle cx={mid} cy={y} r="9" fill="#fff" stroke={BRAND} strokeWidth="2" />
    </>
  );
}

function MapArcsMinimal() {
  return (
    <>
      <ellipse cx={72} cy={H - 26} rx={20} ry={6} fill="rgba(255,255,255,.1)" />
      <ellipse cx={168} cy={H - 26} rx={20} ry={6} fill="rgba(255,255,255,.1)" />
      <path d={`M 72 94 Q 120 30 168 94`} fill="none" stroke={BRAND} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx={72} cy={94} r="11" fill={BRAND} opacity={0.85} />
      <circle cx={168} cy={94} r="11" fill={BRAND} opacity={0.85} />
    </>
  );
}

function MapFencesMinimal() {
  const d = `M ${P + 8} ${H - 42} Q 68 ${H - 98} 108 ${H - 58} T 188 ${H - 104} T ${W - P - 8} ${H - 46}`;
  return (
    <>
      <ellipse cx={W / 2} cy={H - 22} rx={92} ry={10} fill="rgba(255,255,255,.08)" />
      <path d={d} fill="none" stroke={BRAND} strokeWidth="16" strokeLinecap="round" opacity={0.82} />
    </>
  );
}

function MapPillarsMinimal() {
  const specs = [
    [14, 38],
    [22, 62],
    [18, 48],
    [28, 78],
    [16, 44],
    [20, 56],
  ];
  const base = H - 30;
  let x = 46;
  return (
    <>
      <ellipse cx={W / 2} cy={base + 8} rx={90} ry={10} fill="rgba(255,255,255,.08)" />
      {specs.map(([w, h], i) => {
        const el = <rect key={i} x={x} y={base - h} width={w} height={h} rx={3} fill={BRAND} opacity={0.68 + (i % 3) * 0.1} />;
        x += w + 8;
        return el;
      })}
    </>
  );
}

function MapDiscsMinimal() {
  const discs: [number, number, number][] = [
    [78, 90, 24],
    [118, 98, 15],
    [154, 86, 19],
    [102, 76, 11],
  ];
  return (
    <>
      <ellipse cx={W / 2} cy={H - 26} rx={86} ry={10} fill="rgba(255,255,255,.08)" />
      {discs.map(([cx, cy, r], i) => (
        <ellipse key={i} cx={cx} cy={cy} rx={r} ry={r * 0.34} fill={BRAND} opacity={0.62 + i * 0.09} />
      ))}
    </>
  );
}

function MapAreaMinimal() {
  return (
    <>
      <polygon points={`${P + 28},${H - 48} ${P + 88},${H - 68} ${P + 148},${H - 48} ${P + 88},${H - 28}`} fill={BRAND} opacity={0.48} />
      <polygon points={`${P + 58},${H - 54} ${P + 118},${H - 74} ${P + 178},${H - 54} ${P + 118},${H - 34}`} fill={BRAND} opacity={0.68} />
      <polygon points={`${P + 88},${H - 60} ${P + 148},${H - 80} ${P + 208},${H - 60} ${P + 148},${H - 40}`} fill={BRAND} opacity={0.88} />
    </>
  );
}

function MapHeatmapMinimal() {
  const cols = 16;
  const rows = 10;
  const gap = 3;
  const cellW = (W - 2 * P - gap * (cols - 1)) / cols;
  const cellH = (H - 2 * P - gap * (rows - 1)) / rows;
  return (
    <>
      {Array.from({ length: rows * cols }).map((_, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const x = P + col * (cellW + gap);
        const y = P + row * (cellH + gap);
        const intensity = 0.25 + ((row * 3 + col * 5) % 7) * 0.1;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={cellW}
            height={cellH}
            rx={1}
            fill={BRAND}
            opacity={intensity}
          />
        );
      })}
    </>
  );
}

type Props = {
  type: string;
  chartId: string;
  cfg?: Cfg;
  visualId?: string;
  minimal?: boolean;
  compact?: boolean;
  series?: PreviewSeries;
  chartTitle?: string;
};

export default function ChartPreview({
  type,
  chartId,
  cfg = pickerCfg,
  visualId,
  minimal = false,
  compact = false,
  series,
  chartTitle,
}: Props) {
  const showTitle = !minimal && !compact && bool(cfg("Layout & Visibility", "Show title", true), true);
  const renderProps = { cfg, chartId, minimal, compact, series };

  let body: React.ReactNode;
  if (minimal && visualId === "availability") body = <AvailabilityMinimal />;
  else if (minimal && visualId === "range") body = <RangeMinimal />;
  else if (minimal && visualId === "kpi-grid") body = <KpiGridMinimal />;
  else if (minimal && visualId === "gauge-linear") body = <LinearGaugeMinimal />;
  else if (minimal && visualId === "arcs") body = <MapArcsMinimal />;
  else if (minimal && visualId === "fences") body = <MapFencesMinimal />;
  else if (minimal && visualId === "pillars") body = <MapPillarsMinimal />;
  else if (minimal && visualId === "discs") body = <MapDiscsMinimal />;
  else if (minimal && visualId === "map-area") body = <MapAreaMinimal />;
  else if (minimal && visualId === "heatmap") body = <MapHeatmapMinimal />;
  else if (type === "line") body = <LineArea {...renderProps} />;
  else if (type === "donut") body = <PieDonut {...renderProps} />;
  else if (type === "gauge") body = <Gauge {...renderProps} />;
  else if (type === "scatter") body = <Scatter {...renderProps} />;
  else if (type === "horizontalBar") body = <HBars {...renderProps} />;
  else if (type === "kpi") body = <Kpi {...renderProps} />;
  else if (type === "table") body = <Table minimal={minimal} />;
  else body = <Bars {...renderProps} />;

  const showChartTitle = showTitle && type !== "kpi" && type !== "table";
  const title = chartTitle ?? "Average Response Time";

  return (
    <div
      className={
        "cp-preview" +
        (minimal ? " cp-preview--minimal" : "") +
        (compact ? " cp-preview--compact" : "")
      }
    >
      {showChartTitle && <p className="cp-preview__chart-title">{title}</p>}
      <svg className="cp-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        {body}
      </svg>
    </div>
  );
}
