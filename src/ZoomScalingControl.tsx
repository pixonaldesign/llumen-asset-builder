import { PlusIcon, TrashIcon } from "./icons";
import Dropdown from "./Dropdown";
import { fieldOptionsFor } from "./mockDataset";
import {
  ZOOM_RATES,
  asZoomScaling,
  parsedZoomStops,
  type ZoomRate,
  type ZoomScalingStop,
  type ZoomScalingValue,
} from "./previewTheme";

type Props = {
  value: unknown;
  onChange: (next: ZoomScalingValue) => void;
  dataRangeOnly?: boolean;
};

const RATE_OPTIONS = ZOOM_RATES.map((rate) => ({ value: rate, label: rate }));
const DATA_FIELD_OPTIONS = fieldOptionsFor("Y axis");

function meterSuffix(scale: string): string {
  const n = Number(scale);
  return n === 1 ? "Meter" : "Meters";
}

function catmullRomPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function curvePath(
  pts: { x: number; y: number }[],
  rate: ZoomRate,
  first: { x: number; y: number },
  last: { x: number; y: number },
): string {
  if (rate === "Custom") return catmullRomPath(pts);
  if (rate === "Linear") return `M ${first.x} ${first.y} L ${last.x} ${last.y}`;
  const n = 36;
  const parts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const eased = (8 ** t - 1) / 7;
    const x = first.x + (last.x - first.x) * t;
    const y = first.y + (last.y - first.y) * eased;
    parts.push(`${i ? "L" : "M"} ${x} ${y}`);
  }
  return parts.join(" ");
}

function ScaleChart({ value }: { value: ZoomScalingValue }) {
  const parsed = parsedZoomStops(value);
  const W = 400;
  const H = 210;
  const padL = 8;
  const padR = 8;
  const padT = 10;
  const padB = 32;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const zooms = parsed.map((p) => p.zoom);
  const scales = parsed.map((p) => p.scale);
  const zMin = zooms.length ? Math.min(...zooms) : 0;
  const zMax = zooms.length ? Math.max(...zooms) : 1;
  const sMin = scales.length ? Math.min(...scales) : 0;
  const sMax = scales.length ? Math.max(...scales) : 1;
  const zSpan = zMax - zMin || 1;
  const sSpan = sMax - sMin || 1;
  const xOf = (z: number) => padL + ((z - zMin) / zSpan) * plotW;
  const yOf = (s: number) => padT + plotH - ((s - sMin) / sSpan) * plotH;
  const pts = parsed.map((p) => ({ x: xOf(p.zoom), y: yOf(p.scale) }));
  const first = pts[0] ?? { x: padL, y: padT + plotH };
  const last = pts[pts.length - 1] ?? { x: padL + plotW, y: padT };
  const ticks = Array.from({ length: 5 }, (_, i) => {
    const t = i / 4;
    const raw = zMin + zSpan * t;
    const value = i === 0 ? zMin : i === 4 ? zMax : Math.round(raw / 50) * 50;
    return { value, x: padL + plotW * t };
  });
  const mids = ticks.slice(0, -1).map((tick, i) => (tick.x + ticks[i + 1].x) / 2);
  const baseline = padT + plotH;

  return (
    <svg className="zs-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Zoom scale curve">
      <line className="zs-chart__axis" x1={padL} y1={baseline} x2={W - padR} y2={baseline} />
      {mids.map((x) => (
        <line
          key={`mid-${x}`}
          className="zs-chart__grid zs-chart__grid--minor"
          x1={x}
          y1={baseline}
          x2={x}
          y2={baseline + 9}
        />
      ))}
      {ticks.map((tick, i) => {
        const { value, x } = tick;
        return (
          <g key={`${value}-${i}`}>
            <line className="zs-chart__grid" x1={x} y1={padT} x2={x} y2={baseline + 9} />
            <text
              className="zs-chart__tick"
              x={x}
              y={H - 6}
              textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}
            >
              {Number.isInteger(value) ? value : value.toFixed(1)}
            </text>
          </g>
        );
      })}
      {pts.length >= 2 && (
        <path className="zs-chart__line" d={curvePath(pts, value.rate, first, last)} />
      )}
      {pts.length >= 2 && (
        <>
          <circle className="zs-chart__endpoint" cx={first.x} cy={first.y} r={6} />
          <circle className="zs-chart__endpoint" cx={last.x} cy={last.y} r={6} />
        </>
      )}
      {value.rate === "Custom" &&
        pts.slice(1, -1).map((p, i) => (
          <circle key={i} className="zs-chart__dot" cx={p.x} cy={p.y} r={5} />
        ))}
    </svg>
  );
}

export default function ZoomScalingControl({ value, onChange, dataRangeOnly = false }: Props) {
  const current = asZoomScaling(value);
  const parsed = parsedZoomStops(current);
  const zMin = parsed.length ? parsed[0].zoom : 0;
  const zMax = parsed.length ? parsed[parsed.length - 1].zoom : 0;
  const custom = current.rate === "Custom";

  const commit = (patch: Partial<ZoomScalingValue>) =>
    onChange({
      dataField: patch.dataField ?? current.dataField,
      rate: patch.rate ?? current.rate,
      styleAcrossZoom: patch.styleAcrossZoom ?? current.styleAcrossZoom,
      stops: (patch.stops ?? current.stops).map((s) => ({ zoom: s.zoom, scale: s.scale })),
    });

  const updateStop = (index: number, patch: Partial<ZoomScalingStop>) =>
    commit({
      stops: current.stops.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    });

  const addStop = () => {
    const last = current.stops[current.stops.length - 1];
    const prev = current.stops[current.stops.length - 2];
    const lastZ = Number(last?.zoom);
    const prevZ = Number(prev?.zoom);
    const lastS = Number(last?.scale);
    const prevS = Number(prev?.scale);
    const step = Number.isFinite(lastZ) && Number.isFinite(prevZ) ? lastZ - prevZ : 50;
    const zoom = Number.isFinite(lastZ) ? lastZ + (step || 50) : current.stops.length * 50;
    const scale =
      Number.isFinite(lastS) && Number.isFinite(prevS)
        ? lastS + (lastS - prevS)
        : Number.isFinite(lastS)
          ? lastS
          : 1;
    commit({
      stops: [...current.stops, { zoom: String(zoom), scale: String(scale) }],
    });
  };

  return (
    <div className="zs">
      {!dataRangeOnly && <ScaleChart value={current} />}

      <div className="zs-block">
        {!dataRangeOnly && (
          <div className="zs-controls">
            <div className="zs-field">
              <div className="ia-field-name">Data field</div>
              <Dropdown
                value={current.dataField}
                onChange={(dataField) => commit({ dataField })}
                options={DATA_FIELD_OPTIONS}
                searchable
                ariaLabel="Data field"
                minMenuWidth={360}
              />
            </div>
            <div className="zs-field">
              <div className="ia-field-name">Rate of change</div>
              <Dropdown
                value={current.rate}
                onChange={(rate) => commit({ rate: rate as ZoomRate })}
                options={RATE_OPTIONS}
                ariaLabel="Rate of change"
              />
            </div>
          </div>
        )}

        <p className="zs-range">
          data range: {zMin} - {zMax}
        </p>

        <div className="zs-stops">
          {current.stops.map((stop, i) => (
            <div key={i} className="zs-row">
              {custom ? (
                <div className="zs-row__split">
                  <div className="zs-input">
                    <input
                      value={stop.zoom}
                      inputMode="decimal"
                      aria-label={`Stop ${i + 1} zoom`}
                      onChange={(e) => updateStop(i, { zoom: e.target.value })}
                    />
                  </div>
                  <div className="zs-input zs-input--scale">
                    <input
                      value={stop.scale}
                      inputMode="decimal"
                      aria-label={`Stop ${i + 1} scale`}
                      onChange={(e) => updateStop(i, { scale: e.target.value })}
                    />
                    <span className="zs-input__unit">{meterSuffix(stop.scale)}</span>
                  </div>
                </div>
              ) : (
                <div className="zs-input zs-input--combo">
                  <input
                    className="zs-input__zoom"
                    value={stop.zoom}
                    inputMode="decimal"
                    aria-label={`Stop ${i + 1} zoom`}
                    onChange={(e) => updateStop(i, { zoom: e.target.value })}
                  />
                  <span className="zs-input__derived">
                    <input
                      value={stop.scale}
                      inputMode="decimal"
                      aria-label={`Stop ${i + 1} scale`}
                      onChange={(e) => updateStop(i, { scale: e.target.value })}
                    />
                    <span className="zs-input__unit">{meterSuffix(stop.scale)}</span>
                  </span>
                </div>
              )}
              <button
                type="button"
                className="zs-row__del"
                aria-label={`Remove stop ${i + 1}`}
                disabled={current.stops.length <= 2}
                onClick={() =>
                  commit({ stops: current.stops.filter((_, j) => j !== i) })
                }
              >
                <TrashIcon width={20} height={20} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>

        <button type="button" className="cp-add" onClick={addStop}>
          <PlusIcon width={20} height={20} aria-hidden="true" />
          <span>Add Another Stop</span>
        </button>
      </div>

      {!dataRangeOnly && (
        <div className="ia-toggle-flat">
          <div className="ia-toggle-line">
            <div className="ia-toggle-line-label">
              <strong>Style Across Zoom Range</strong>
            </div>
            <span
              role="switch"
              aria-checked={current.styleAcrossZoom}
              className={"ia-mini-switch" + (current.styleAcrossZoom ? " on" : "")}
              onClick={() => commit({ styleAcrossZoom: !current.styleAcrossZoom })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
