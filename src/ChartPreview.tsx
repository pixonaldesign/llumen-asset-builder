/**
 * Live SVG chart preview.
 * Renders the active chart type and reflects the current control values
 * through the `cfg(group, name, fallback)` accessor.
 */

type Cfg = (group: string, name: string, fallback: unknown) => unknown;

const W = 240;
const H = 150;
const P = 16;

const num = (v: unknown, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const str = (v: unknown, d: string) => (typeof v === "string" && v ? v : d);

const PALETTE = (base: string) => [base, "#c6a7ff", "#ffd58a", "#7ee0c0", "#f0888c", "#9bd1ff"];

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

/* ---- per-type renderers ---- */
function Bars({ cfg }: { cfg: Cfg }) {
  const color = str(cfg("Colors", "Single color", "#73adf5"), "#73adf5");
  const sort = bool(cfg("Bar Styling", "Sort by value", true), true);
  const showLabels =
    bool(cfg("Bar Styling", "Show values on bars", true), true) &&
    bool(cfg("Layout & Visibility", "Show data labels", true), true);
  const radiusPct = num(cfg("Bar Styling", "Corner radius", 30), 30);
  const widthPct = num(cfg("Bar Styling", "Bar width", 60), 60);
  const legend = bool(cfg("Legend", "Show legend", false), false);

  let data = [40, 72, 30, 58, 90, 64];
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

function LineArea({ cfg, chartId }: { cfg: Cfg; chartId: string }) {
  const color = str(cfg("Colors", "Single color", "#73adf5"), "#73adf5");
  const grp = chartId === "area" ? "Line/Area Styling" : "Line Styling";
  const style = str(cfg(grp, "Chart style", chartId === "area" ? "Area" : "Line"), "Line");
  const isArea = chartId === "area" || style === "Area";
  const strokePct = num(cfg(grp, "Stroke width", 50), 50);
  const sw = 1.5 + (strokePct / 100) * 5;
  const showPoints = bool(cfg(grp, "Show data points", true), true);
  const curve = str(cfg(grp, "Curve interpolation", "Smooth"), "Smooth");
  const fillPct = num(cfg("Line/Area Styling", "Fill opacity", 35), 35);

  const ys = [0.5, 0.28, 0.42, 0.12, 0.34, 0.05, 0.2];
  const plotW = W - 2 * P;
  const plotH = H - 2 * P;
  const pts: [number, number][] = ys.map((v, i) => [P + (i / (ys.length - 1)) * plotW, P + v * plotH]);
  const line = buildPath(pts, curve);
  const baseY = P + plotH;
  const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${baseY} L ${pts[0][0].toFixed(1)} ${baseY} Z`;

  return (
    <>
      {isArea && <path d={area} fill={color} opacity={0.1 + (fillPct / 100) * 0.5} />}
      <path d={line} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      {showPoints &&
        pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={sw * 0.9 + 1} fill={color} stroke="#0c0f15" strokeWidth="1.5" />)}
    </>
  );
}

function PieDonut({ cfg, chartId }: { cfg: Cfg; chartId: string }) {
  const base = str(cfg("Colors", "Single color", "#73adf5"), "#73adf5");
  const palette = PALETTE(base);
  const style = str(cfg("Pie Styling", "Chart style", "Donut"), "Donut");
  const isDonut = chartId === "polar" ? true : style === "Donut";
  const innerPct = num(cfg("Pie Styling", "Inner radius", 55), 55);
  const startPct = num(cfg("Pie Styling", "Start angle", 0), 0);
  const padPct = num(cfg("Pie Styling", "Pad angle (slice gap)", 8), 8);
  const showCenter = bool(cfg("Pie Styling", "Show center value", true), true);

  const cx = W / 2;
  const cy = H / 2;
  const rO = 56;
  const rI = isDonut ? rO * (0.3 + (innerPct / 100) * 0.55) : 0;
  const start = (startPct / 100) * 360;
  const pad = (padPct / 100) * 12;
  const data = [34, 24, 18, 14, 10];
  const total = data.reduce((a, b) => a + b, 0);
  let cursor = start;

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
          72%
        </text>
      )}
    </>
  );
}

function Gauge({ cfg }: { cfg: Cfg }) {
  const zonesOn = bool(cfg("Gauge — zone colors", "Color zones on dial", true), true);
  const startPct = num(cfg("Gauge — zone colors", "Arc start angle", 17), 17);
  const endPct = num(cfg("Gauge — zone colors", "Arc end angle", 83), 83);
  const showCenter = bool(cfg("Gauge — meter & labels", "Show center value", true), true);
  const base = str(cfg("Colors", "Single color", "#73adf5"), "#73adf5");

  const a0 = -180 + (startPct / 100) * 360;
  const a1 = -180 + (endPct / 100) * 360;
  const cx = W / 2;
  const cy = H / 2 + 18;
  const r = 60;
  const value = 72;
  const va = a0 + ((a1 - a0) * value) / 100;
  const [nx, ny] = polar(cx, cy, r - 12, va);
  const zones = ["#34d399", "#fbbf24", "#f87171"];

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

function Scatter({ cfg }: { cfg: Cfg }) {
  const color = str(cfg("Colors", "Single color", "#73adf5"), "#73adf5");
  const radiusPct = num(cfg("Point Styling", "Radius", 40), 40);
  const shape = str(cfg("Point Styling", "Point shape", "Circle"), "Circle");
  const opacityPct = num(cfg("Point Styling", "Point opacity", 70), 70);
  const baseR = 2 + (radiusPct / 100) * 5;
  const op = 0.3 + (opacityPct / 100) * 0.7;

  return (
    <>
      {Array.from({ length: 22 }).map((_, i) => {
        const x = P + ((i * 53) % (W - 2 * P));
        const y = P + ((i * i * 19) % (H - 2 * P));
        const r = baseR + (i % 3);
        if (shape === "Square") return <rect key={i} x={x - r} y={y - r} width={r * 2} height={r * 2} rx={1} fill={color} opacity={op} />;
        if (shape === "Triangle")
          return <polygon key={i} points={`${x},${y - r} ${x - r},${y + r} ${x + r},${y + r}`} fill={color} opacity={op} />;
        return <circle key={i} cx={x} cy={y} r={r} fill={color} opacity={op} />;
      })}
    </>
  );
}

function HBars({ cfg, chartId }: { cfg: Cfg; chartId: string }) {
  const color = str(
    cfg("Progress Styling", "Fill color", cfg("Colors", "Single color", "#73adf5")),
    "#73adf5"
  );
  const showLabels = bool(cfg("Layout & Visibility", "Show data labels", true), true);
  const corner = str(cfg("Progress Styling", "Corner radius", "Pill"), "Pill");
  const rad = corner === "Square" ? 2 : corner === "Rounded" ? 5 : 999;
  const data = chartId === "progress" ? [68] : [84, 72, 61, 44];
  const n = data.length;
  const plotW = W - 2 * P;
  const gap = 12;
  const bh = Math.min(20, (H - 2 * P - gap * (n - 1)) / n);

  return (
    <>
      {data.map((v, i) => {
        const y = P + i * (bh + gap);
        return (
          <g key={i}>
            <rect x={P} y={y} width={plotW} height={bh} rx={Math.min(rad, bh / 2)} fill="rgba(255,255,255,.1)" />
            <rect x={P} y={y} width={(v / 100) * plotW} height={bh} rx={Math.min(rad, bh / 2)} fill={color} />
            {showLabels && (
              <text x={P + plotW - 4} y={y + bh / 2 + 3} fill="rgba(255,255,255,.7)" fontSize="8" textAnchor="end">
                {v}%
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}

function Kpi({ cfg }: { cfg: Cfg }) {
  const showComparison = bool(cfg("KPI Card Display", "Show comparison vs last period", true), true);
  const showUnit = bool(cfg("KPI Card Display", "Show unit", true), true);
  return (
    <>
      <text x={W / 2} y={H / 2 + 2} fill="#fff" fontSize="40" fontWeight="500" textAnchor="middle">
        84{showUnit ? "%" : ""}
      </text>
      <text x={W / 2} y={H / 2 + 24} fill="rgba(255,255,255,.5)" fontSize="9" textAnchor="middle">
        Service reliability{showComparison ? "  ·  +6.2%" : ""}
      </text>
    </>
  );
}

function Table() {
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

export default function ChartPreview({ type, chartId, cfg }: { type: string; chartId: string; cfg: Cfg }) {
  const showTitle = bool(cfg("Layout & Visibility", "Show title", true), true);

  let body: React.ReactNode;
  if (type === "line") body = <LineArea cfg={cfg} chartId={chartId} />;
  else if (type === "donut") body = <PieDonut cfg={cfg} chartId={chartId} />;
  else if (type === "gauge") body = <Gauge cfg={cfg} />;
  else if (type === "scatter") body = <Scatter cfg={cfg} />;
  else if (type === "horizontalBar") body = <HBars cfg={cfg} chartId={chartId} />;
  else if (type === "kpi") body = <Kpi cfg={cfg} />;
  else if (type === "table") body = <Table />;
  else body = <Bars cfg={cfg} />;

  const showChartTitle = showTitle && type !== "kpi" && type !== "table";

  return (
    <div className="cp-preview">
      {showChartTitle && <p className="cp-preview__chart-title">Average Response Time</p>}
      <svg className="cp-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        {body}
      </svg>
    </div>
  );
}
