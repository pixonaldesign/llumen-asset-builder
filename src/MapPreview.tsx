import { Flag, MapPin, WarningCircle, Circle as CircleIcon } from "@phosphor-icons/react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { PreviewSeries } from "./componentPreviewProfiles";
import {
  BRAND,
  PALETTE,
  asColorMode,
  asRecord,
  asRepeatable,
  asZoomScaling,
  resolveColorMode,
  sampleZoomScale,
  sequentialRamp,
  sliderMapped,
} from "./previewTheme";

type Cfg = (group: string, name: string, fallback: unknown) => unknown;

const W = 240;
const H = 150;
const P = 16;

const str = (v: unknown, d: string) => (typeof v === "string" && v ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

function mapPalette(cfg: Cfg) {
  return asColorMode(cfg("Color", "Palette", cfg("Color", "Solid color", BRAND)));
}

function mapColor(cfg: Cfg, value: number, max: number, category: string, index: number): string {
  const catMap = asRecord(cfg("Color", "Categorical color stops + Other", {}));
  if (category && catMap[category]) return catMap[category];
  const mode = mapPalette(cfg);
  const t = max ? value / max : 0;
  const dist = str(cfg("Color", "Distribution", "Linear"), "Linear");
  const stepped = dist === "Quantize" ? Math.round(t * 4) / 4 : dist === "Quantile" ? Math.ceil(t * 3) / 3 : t;
  return resolveColorMode(mode, stepped, index);
}

function catColor(cfg: Cfg, category: string, fallback: string, index: number) {
  const map = {
    ...asRecord(cfg("Color", "Categorical color stops + Other", {})),
    ...asRecord(cfg("Marker Shape", "Icon category field + mapping", {})),
  };
  if (category && map[category]) return map[category];
  return PALETTE(fallback)[index % 6];
}

type Props = {
  cfg: Cfg;
  visualId: string;
  series?: PreviewSeries;
  compact?: boolean;
  onMarkEnter?: (index: number, e: ReactMouseEvent) => void;
  onMarkLeave?: () => void;
};

function markHit(
  index: number,
  onMarkEnter?: (index: number, e: ReactMouseEvent) => void,
  onMarkLeave?: () => void,
) {
  if (!onMarkEnter) return {};
  return {
    style: { cursor: "pointer" as const },
    onMouseEnter: (e: ReactMouseEvent) => onMarkEnter(index, e),
    onMouseMove: (e: ReactMouseEvent) => onMarkEnter(index, e),
    onMouseLeave: () => onMarkLeave?.(),
  };
}

function Ground({ cfg }: { cfg: Cfg }) {
  const show = bool(cfg("Ground disc", "Show ground disc", true), true);
  if (!show) return <ellipse cx={W / 2} cy={H - 22} rx={92} ry={10} fill="rgba(255,255,255,.06)" />;
  const fill = str(cfg("Ground disc", "Fill style", "Solid"), "Solid");
  const color = str(cfg("Ground disc", "Disc color", BRAND), BRAND);
  const r = sliderMapped(cfg("Ground disc", "Disc radius multiplier", 30), 0.2, 4, 1.2);
  const op = sliderMapped(cfg("Ground disc", "Disc fill opacity", 18), 0, 1, 0.18);
  return (
    <ellipse
      cx={W / 2}
      cy={H - 22}
      rx={86 * r}
      ry={10 * r}
      fill={fill === "None" ? "none" : color}
      stroke={color}
      strokeWidth={fill === "None" ? 1.5 : 0}
      opacity={fill === "None" ? 0.7 : op}
    />
  );
}

function MarkerIcon({ name, color, size }: { name: string; color: string; size: number }) {
  const props = { size, color, weight: "fill" as const };
  if (name === "Warning") return <WarningCircle {...props} />;
  if (name === "Flag") return <Flag {...props} />;
  if (name === "Circle") return <CircleIcon {...props} />;
  return <MapPin {...props} />;
}

export default function MapPreview({ cfg, visualId, series, compact, onMarkEnter, onMarkLeave }: Props) {
  const points = series?.mapPoints ?? [];
  const arcs = series?.mapArcs ?? [];
  const max = Math.max(...points.map((p) => p.value), 1);
  const solid = mapPalette(cfg).color;
  const showLegend = !compact && bool(cfg("Map Legend", "Show legend in Map Data", true), true);
  const lod = sliderMapped(cfg("Advanced", "Level of distance (zoom visibility)", 0), 0, 100, 0);
  const visible = lod <= 0 ? points : points.filter((_, i) => i % Math.max(1, Math.round(lod / 25 + 1)) === 0);
  const highlight = bool(cfg("Advanced", "Highlight borders", false), false);
  const hit = (index: number) => markHit(index, onMarkEnter, onMarkLeave);
  const orig = (p: (typeof points)[number]) => Math.max(0, points.findIndex((pt) => pt.id === p.id));

  let layer: React.ReactNode = null;

  if (visualId === "arcs") {
    const stroke = sliderMapped(cfg("Color", "Border Thickness", 40), 0, 10, 3);
    const ends = bool(cfg("Disc ring", "Show endpoint discs", false), false);
    const indicator = bool(cfg("Line Customization", "Source → Destination Indicator", false), false);
    const endScale = sliderMapped(cfg("Disc ring", "Endpoint disc scaling", 30), 0.2, 4, 1.2);
    const endR = 6 * endScale;
    layer = (
      <>
        <Ground cfg={cfg} />
        {arcs.map((a, i) => {
          const from = points.find((p) => p.label === a.from) ?? points[i];
          const to = points.find((p) => p.label === a.to) ?? points[(i + 1) % Math.max(points.length, 1)];
          if (!from || !to) return null;
          const x1 = P + from.x * (W - 2 * P);
          const y1 = P + from.y * (H - 2 * P);
          const x2 = P + to.x * (W - 2 * P);
          const y2 = P + to.y * (H - 2 * P);
          const color = mapColor(cfg, a.value, max, from.category, i);
          const d = `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${Math.min(y1, y2) - 28} ${x2} ${y2}`;
          const sw = Math.max(1, stroke);
          return (
            <g key={i} {...hit(orig(from))}>
              <path d={d} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
              {indicator && (
                <path
                  className="map-arc-shimmer"
                  d={d}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={Math.max(1.5, sw * 0.7)}
                  strokeLinecap="round"
                  strokeDasharray="14 72"
                  opacity="0.85"
                />
              )}
              {ends && (
                <>
                  <circle cx={x1} cy={y1} r={endR} fill={color} opacity={0.85} />
                  <circle cx={x2} cy={y2} r={endR} fill={color} opacity={0.85} />
                </>
              )}
            </g>
          );
        })}
      </>
    );
  } else if (visualId === "fences") {
    const exaggerate = bool(cfg("Height", "Height Exaggeration", false), false);
    const h = sliderMapped(cfg("Height", "Fence height", 40), 0, 5000, 2000);
    const zoom = asZoomScaling(
      cfg("Zoom Scaling", "Fence zoom scaling", cfg("Advanced", "Fence zoom scaling", undefined)),
    );
    const width = (exaggerate ? 10 : 6) + h / 900 + sampleZoomScale(zoom, 350) * 0.35;
    const d = visible
      .map((p, i) => `${i ? "L" : "M"} ${P + p.x * (W - 2 * P)} ${P + p.y * (H - 2 * P)}`)
      .join(" ");
    layer = (
      <>
        <Ground cfg={cfg} />
        <path d={d} fill="none" stroke={solid} strokeWidth={width} strokeLinecap="round" opacity={0.85} />
        {visible.map((p) => (
          <circle
            key={p.id}
            cx={P + p.x * (W - 2 * P)}
            cy={P + p.y * (H - 2 * P)}
            r={Math.max(8, width / 2)}
            fill="transparent"
            {...hit(orig(p))}
          />
        ))}
      </>
    );
  } else if (visualId === "pillars") {
    const maxH = sliderMapped(cfg("Size", "Max Height", 38), 0, 8000, 3000);
    const zoom = asZoomScaling(cfg("Size", "Zoom scaling", undefined));
    const zScale = sampleZoomScale(zoom, 350);
    const normalize = bool(cfg("Color", "Normalize values", true), true);
    const peak = normalize ? max : Math.max(max, 80);
    layer = (
      <>
        <Ground cfg={cfg} />
        {visible.map((p, i) => {
          const x = P + p.x * (W - 2 * P);
          const bh = (p.value / peak) * (28 + maxH / 220 + zScale * 0.4);
          const color = mapColor(cfg, p.value, max, p.category, i);
          return <rect key={p.id} x={x - 7} y={H - 32 - bh} width={14} height={bh} rx={3} fill={color} opacity={0.86} {...hit(orig(p))} />;
        })}
      </>
    );
  } else if (visualId === "discs") {
    const mult = sliderMapped(
      cfg("Disc Scaling", "Disc radius multiplier", cfg("Disc ring", "Disc radius multiplier", 30)),
      0.2,
      4,
      1.2,
    );
    const zoom = asZoomScaling(cfg("Disc Scaling", "Disc scaling", undefined));
    const zScale = sampleZoomScale(zoom, 350);
    layer = (
      <>
        <Ground cfg={cfg} />
        {visible.map((p, i) => {
          const x = P + p.x * (W - 2 * P);
          const y = P + p.y * (H - 2 * P);
          const r = (6 + (p.value / max) * 16 + zScale * 0.35) * mult;
          const color = mapColor(cfg, p.value, max, p.category, i);
          return (
            <ellipse
              key={p.id}
              cx={x}
              cy={y}
              rx={r}
              ry={r * 0.38}
              fill={color}
              stroke={color}
              opacity={0.7}
              {...hit(orig(p))}
            />
          );
        })}
      </>
    );
  } else if (visualId === "map-area") {
    const extrusion = str(cfg("Extrusion", "Extrusion mode", "None"), "None");
    const extScale = asRepeatable(cfg("Extrusion", "Extrusion scaling", undefined));
    const opSrc = str(cfg("Opacity source", "Opacity source", "Master"), "Master");
    const opScale = asRepeatable(cfg("Opacity source", "Opacity scaling", undefined));
    layer = (
      <>
        {visible.map((p, i) => {
          const x = P + p.x * (W - 2 * P);
          const y = P + p.y * (H - 2 * P);
          const lift = extrusion === "None" ? 0 : extrusion === "Height" ? 8 + extScale.length * 2 : (p.value / max) * 16;
          const color = catColor(cfg, p.category, mapColor(cfg, p.value, max, p.category, i), i);
          const op = opSrc === "Data" ? 0.35 + (p.value / max) * 0.55 : 0.45 + opScale.length * 0.08;
          return (
            <polygon
              key={p.id}
              points={`${x},${y - 18 - lift} ${x + 28},${y - lift} ${x},${y + 16 - lift} ${x - 28},${y - lift}`}
              fill={color}
              stroke={highlight ? "#fff" : "none"}
              strokeWidth={highlight ? 1.5 : 0}
              opacity={op}
              {...hit(orig(p))}
            />
          );
        })}
      </>
    );
  } else if (visualId === "heatmap") {
    const style = str(cfg("Heatmap Style", "Style", "Pond"), "Pond");
    const gradFill = bool(cfg("Bin & extrusion", "Gradient fill", false), false);
    const extrude = bool(cfg("Bin & extrusion", "3D extrusion", true), true);
    const elev = sliderMapped(cfg("Bin & extrusion", "Elevation Scale", 50), 0, 1000, 500);
    const coverage = sliderMapped(cfg("Bin & extrusion", "Coverage", 95), 0, 1, 0.95);
    const cell = sliderMapped(cfg("Bin & extrusion", "Cell size", 50), 200, 2000, 1000);
    const falloff = sliderMapped(cfg("Advanced", "Falloff Rate", 20), 0, 1, 0.2);
    const sprites = sliderMapped(cfg("Advanced", "Sprites per Point", 20), 1, 4, 1);
    const sizeMul = sliderMapped(cfg("Advanced", "Size Multiplier", 50), 0.4, 2, 1);
    const bands = Math.max(3, Math.round(sliderMapped(cfg("Contour Terrain", "Band count", 50), 3, 16, 8)));
    const cols = Math.max(6, Math.round(18 - cell / 220));
    const rowsN = Math.max(4, Math.round(11 - cell / 280));
    const gap = (1 - coverage) * 6;
    const cellW = (W - 2 * P - gap * (cols - 1)) / cols;
    const cellH = (H - 2 * P - gap * (rowsN - 1)) / rowsN;
    const palette = mapPalette(cfg);
    layer = (
      <>
        {Array.from({ length: rowsN * cols }).map((_, i) => {
          const row = Math.floor(i / cols);
          const col = i % cols;
          const x = P + col * (cellW + gap);
          const y = P + row * (cellH + gap);
          const nx = col / cols;
          const ny = row / rowsN;
          const heat = points.reduce((acc, p) => {
            const d = Math.hypot(p.x - nx, p.y - ny);
            return acc + (p.value / max) * Math.exp(-d * (2 + falloff * 8));
          }, 0);
          const nearest = points.reduce(
            (best, p, pi) => {
              const d = Math.hypot(p.x - nx, p.y - ny);
              return d < best.d ? { i: pi, d } : best;
            },
            { i: 0, d: Infinity },
          ).i;
          const t = Math.max(0, Math.min(1, heat));
          const color = gradFill ? resolveColorMode(palette, t, i) : mixOrSolid(solid, t);
          const hLift = extrude ? t * (elev / 80) : 0;
          if (style === "Contour") {
            const band = Math.round(t * bands);
            if (band <= 0) return null;
            return (
              <rect
                key={i}
                x={x}
                y={y - hLift}
                width={cellW * sizeMul}
                height={cellH * sizeMul}
                fill="none"
                stroke={color}
                strokeWidth={sliderMapped(cfg("Contour Terrain", "Band width", 50), 0.02, 0.2, 0.06) * 40}
                opacity={0.35 + t * 0.5}
                {...hit(nearest)}
              />
            );
          }
          const rx = style === "Grid" ? 0 : 3;
          return Array.from({ length: Math.max(1, Math.round(sprites)) }).map((__, s) => (
            <rect
              key={`${i}-${s}`}
              x={x + s}
              y={y - hLift - s}
              width={cellW * sizeMul}
              height={cellH * sizeMul}
              rx={rx}
              fill={color}
              opacity={0.2 + t * 0.75}
              {...hit(nearest)}
            />
          ));
        })}
      </>
    );
  } else if (visualId === "wind") {
    const density = sliderMapped(cfg("Animation", "Particle Density", 50), 2000, 32000, 16384);
    const trail = sliderMapped(cfg("Animation", "Trail Length", 50), 0.9, 1, 0.996);
    const speed = sliderMapped(cfg("Animation", "Animation Speed", 50), 0.05, 0.6, 0.2);
    const count = Math.max(8, Math.round(density / 1400));
    layer = (
      <>
        <Ground cfg={cfg} />
        {Array.from({ length: count }).map((_, i) => {
          const p = visible[i % Math.max(visible.length, 1)];
          const x = P + (p?.x ?? 0.2 + (i % 5) * 0.15) * (W - 2 * P);
          const y = P + (p?.y ?? 0.3) * (H - 2 * P) + (i % 4) * 6;
          const len = 10 + trail * 28;
          const color = mapColor(cfg, p?.value ?? 1, max, p?.category ?? "", i);
          return (
            <line
              key={i}
              className="cp-wind-particle"
              x1={x}
              y1={y}
              x2={x + len}
              y2={y - 6}
              stroke={color}
              strokeWidth="1.6"
              strokeLinecap="round"
              {...(p ? hit(orig(p)) : {})}
              style={{
                cursor: p ? "pointer" : undefined,
                animationDuration: `${1.6 / Math.max(speed, 0.05)}s`,
                animationDelay: `${(i % 7) * 0.12}s`,
              }}
            />
          );
        })}
      </>
    );
  } else {
    const size = sliderMapped(cfg("Marker appearance", "Point Size", 30), 0.2, 8, 1.2);
    const kind = str(cfg("Marker Shape", "Marker type", "2D"), "2D");
    const shape2d = str(cfg("Marker Shape", "2D shape", "Circle"), "Circle");
    const shape3d = str(cfg("Marker Shape", "3D shape", "Sphere"), "Sphere");
    const empty = bool(cfg("Marker Shape", "Empty filled shape (no icon)", false), false);
    const iconMode = str(cfg("Marker Shape", "Icon mode", "Static"), "Static");
    const icon = str(cfg("Marker Shape", "Static Phosphor icon", "MapPin"), "MapPin");
    const sizeRows = asRepeatable(cfg("Marker appearance", "Marker size by data", undefined));
    layer = (
      <>
        <Ground cfg={cfg} />
        {visible.map((p, i) => {
          const x = P + p.x * (W - 2 * P);
          const y = P + p.y * (H - 2 * P);
          const r = (4 + size * 2 + (p.value / max) * (2 + sizeRows.length)) ;
          const color = catColor(cfg, p.category, mapColor(cfg, p.value, max, p.category, i), i);
          const shape = kind === "3D" ? shape3d : shape2d;
          return (
            <g key={p.id} transform={`translate(${x} ${y})`} {...hit(orig(p))}>
              {shape === "Square" || shape === "Cube" ? (
                <rect x={-r} y={-r - (kind === "3D" ? 3 : 0)} width={r * 2} height={r * 2} rx={1} fill={empty ? "none" : color} stroke={color} />
              ) : shape === "Diamond" || shape === "Cone" ? (
                <polygon points={`0,${-r - 2} ${r},${r} ${-r},${r}`} fill={empty ? "none" : color} stroke={color} />
              ) : (
                <circle cx={0} cy={0} r={r} fill={empty ? "none" : color} stroke={color} opacity={kind === "3D" ? 0.95 : 0.88} />
              )}
              {kind === "3D" && shape === "Sphere" && <circle cx={-r * 0.3} cy={-r * 0.3} r={r * 0.25} fill="#fff" opacity={0.35} />}
              {!empty && iconMode !== "By category" && (
                <foreignObject x={-7} y={-18} width={14} height={14}>
                  <MarkerIcon name={icon} color={color} size={12} />
                </foreignObject>
              )}
            </g>
          );
        })}
      </>
    );
  }

  return (
    <>
      {layer}
      {showLegend && (
        <g>
          <rect x={P} y={H - 12} width={9} height={9} rx={2} fill={solid} />
          <text x={P + 13} y={H - 4} fill="rgba(255,255,255,.55)" fontSize="8">
            {series?.legend ?? "Value"}
          </text>
        </g>
      )}
    </>
  );
}

function mixOrSolid(base: string, t: number) {
  const ramp = sequentialRamp(base, 6);
  return ramp[Math.max(0, Math.min(5, Math.round(t * 5)))];
}
