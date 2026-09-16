/**
 * ColorPalette — Color Palette Selector V2.
 *
 *   1. Color palette — picker popover (Sequential / Categorical / Diverging)
 *   2. Palette type  — Single / Per Category / Gradient / Steps
 *   3. Stops editor  — solid swatch, gradient ramp, or discrete steps
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import Dropdown from "./Dropdown";
import {
  ChevronDownIcon,
  ContrastIcon,
  GradientPillIcon,
  InfoIcon,
  PerCategoryPillsIcon,
  PlusIcon,
  CloseIcon,
  SearchIcon,
  SinglePillIcon,
  StepsDotsIcon,
  TrashIcon,
} from "./icons";
import {
  DEFAULT_COLOR_MODE,
  asColorMode,
  hexToRgb,
  rgbToHex,
  type ColorModeConfig,
  type ColorStop,
  type PaletteFamily,
  type PaletteStyle,
  type RepeatableRow,
} from "./previewTheme";

type PaletteType = "Sequential" | "Categorical" | "Diverging";

interface Stop {
  id: number;
  value: number;
  color: string;
  opacity: number;
  label?: string;
}

interface PalettePreset {
  name: string;
  type: PaletteType;
  colors: string[];
}

const PRESETS: PalettePreset[] = [
  { name: "Azure Horizon Sequential Palette", type: "Sequential", colors: ["#f7f9ff", "#edf3ff", "#e3edfe", "#d8e6fd", "#c8dcfc", "#b8d3fb", "#a8c9fa", "#96bdf8", "#86b2f7", "#76a7f5", "#6a9ef3", "#6095f0", "#578eed", "#4f86ea", "#457fe8", "#3d76e8", "#356eea", "#3068ef", "#2d64f2", "#2b61f5"] },
  { name: "Royal Purple Sequential Palette", type: "Sequential", colors: ["#f6f2ff", "#b899f5", "#5a2fc7"] },
  { name: "Coastal Teal Sequential Palette", type: "Sequential", colors: ["#eefcfa", "#d5f8f2", "#b8f0e6", "#94e8dc", "#7de0d0", "#45cdb9", "#23b899", "#159a7d"] },
  { name: "Crimson Spectrum Extended Sequential Palette for High-Density Data", type: "Sequential", colors: ["#fff7f7", "#fff0f0", "#ffe7e7", "#ffdddd", "#ffd5d5", "#ffc9c9", "#ffbbbb", "#ffadad", "#ff9f9f", "#ff9292", "#f98282", "#f57575", "#f56b6b", "#ef6060", "#eb5555", "#e64a4a", "#e03e3e", "#d93636", "#d13333", "#c62828"] },
  { name: "Golden Sunrise Sequential Palette", type: "Sequential", colors: ["#fffbeb", "#fef3c7", "#fde68a", "#fbbf24", "#f59e0b"] },
  { name: "Ocean and Violet Two-Step Categories", type: "Categorical", colors: ["#5b8df0", "#7c5cff"] },
  { name: "Traffic Light Three-Step Categories", type: "Categorical", colors: ["#e85c5c", "#e8b84d", "#3db89a"] },
  { name: "Festival Purple Four-Step Categories", type: "Categorical", colors: ["#8b5cf6", "#ec4899", "#a3e635", "#eab308"] },
  { name: "Crimson to Deep Ocean Diverging Palette", type: "Diverging", colors: ["#9f1d1d", "#c62828", "#df3f3f", "#ef5350", "#f7a0a0", "#f3f4f6", "#cce4fb", "#9dcef7", "#68b1ee", "#42a5f5", "#1565c0"] },
  { name: "Royal Purple to Coastal Teal Diverging Palette", type: "Diverging", colors: ["#6b21a8", "#9333c9", "#c084fc", "#f3e8ff", "#99f6e4", "#2dd4bf", "#0f766e"] },
];

const toHex = (c: string) => (c.startsWith("#") ? c : "#2b61f5");

function sameHex(a: string, b: string) {
  return toHex(a).toLowerCase() === toHex(b).toLowerCase();
}

type PaletteSelection = {
  name: string;
  type: PaletteType;
  colors: string[];
};

const DEFAULT_PRESET = PRESETS[0];
const DEFAULT_SELECTION: PaletteSelection = {
  name: DEFAULT_PRESET.name,
  type: DEFAULT_PRESET.type,
  colors: DEFAULT_PRESET.colors,
};

type DataRange = { min: number; max: number };

const PaletteContext = createContext<{
  selection: PaletteSelection;
  setSelection: (next: PaletteSelection) => void;
} | null>(null);

const DataRangeContext = createContext<DataRange | null>(null);
const PaletteCategoriesContext = createContext<string[]>([]);

export function ColorPaletteProvider({
  children,
  dataRange,
  categoryLabels = [],
}: {
  children: ReactNode;
  dataRange?: DataRange | null;
  categoryLabels?: string[];
}) {
  const [selection, setSelection] = useState<PaletteSelection>(DEFAULT_SELECTION);
  const value = useMemo(() => ({ selection, setSelection }), [selection]);
  return (
    <PaletteContext.Provider value={value}>
      <DataRangeContext.Provider value={dataRange ?? null}>
        <PaletteCategoriesContext.Provider value={categoryLabels}>
          {children}
        </PaletteCategoriesContext.Provider>
      </DataRangeContext.Provider>
    </PaletteContext.Provider>
  );
}

function usePaletteSelection(): [PaletteSelection, (preset: PalettePreset) => void] {
  const ctx = useContext(PaletteContext);
  const [local, setLocal] = useState<PaletteSelection>(DEFAULT_SELECTION);

  if (ctx) {
    return [
      ctx.selection,
      (preset) => ctx.setSelection({ name: preset.name, type: preset.type, colors: preset.colors }),
    ];
  }

  return [
    local,
    (preset) => setLocal({ name: preset.name, type: preset.type, colors: preset.colors }),
  ];
}

let uid = 0;
const nextId = () => ++uid;

const DISTRIBUTION_OPTIONS = ["Linear", "Exponential"] as const;

function niceNum(n: number, span: number): number {
  if (!Number.isFinite(n)) return 0;
  if (span >= 10) return Math.round(n);
  return Number(n.toFixed(2));
}

function unitAlong(i: number, count: number, distribution: string): number {
  if (count <= 1) return 0;
  const t = i / (count - 1);
  if (!distribution.toLowerCase().startsWith("exp")) return t;
  const k = 2.2;
  return (Math.exp(k * t) - 1) / (Math.exp(k) - 1);
}

function redistributeStops(stops: Stop[], min: number, max: number, distribution: string): Stop[] {
  const ordered = [...stops].sort((a, b) => a.value - b.value);
  const span = max - min;
  return ordered.map((s, i) => ({
    ...s,
    value: niceNum(min + unitAlong(i, ordered.length, distribution) * span, span),
  }));
}

function formatRangeNum(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
  return String(Number(n.toFixed(2)));
}

function isPlaceholderStops(stops: { value: number }[]): boolean {
  if (!stops.length) return true;
  const lo = Math.min(...stops.map((s) => s.value));
  const hi = Math.max(...stops.map((s) => s.value));
  return lo === 194 && hi === 600;
}

function remapStopValues(stops: Stop[], min: number, max: number): Stop[] {
  if (!stops.length) return spreadStops(["#f87171", "#fbbf24", "#34d399"], min, max, 3);
  const span = max - min;
  const lo = Math.min(...stops.map((s) => s.value));
  const hi = Math.max(...stops.map((s) => s.value));
  if (Math.abs(hi - lo) < 1e-6) {
    return stops.map((s, i) => ({
      ...s,
      value: niceNum(min + (stops.length === 1 ? 0 : i / (stops.length - 1)) * span, span),
    }));
  }
  return stops.map((s) => ({
    ...s,
    value: niceNum(min + ((s.value - lo) / (hi - lo)) * span, span),
  }));
}

function spreadStops(
  colors: string[],
  min: number,
  max: number,
  count: number,
  distribution = "Linear",
): Stop[] {
  const ramp = colors.length ? colors : ["#eff5fe", "#2b61f5"];
  const n = Math.max(2, count);
  const span = max - min;
  return Array.from({ length: n }, (_, i) => {
    const t = unitAlong(i, n, distribution);
    const colorIndex = Math.round((n === 1 ? 0 : i / (n - 1)) * (ramp.length - 1));
    return {
      id: nextId(),
      value: niceNum(min + t * span, span),
      color: ramp[Math.min(colorIndex, ramp.length - 1)],
      opacity: 100,
    };
  });
}

function gradientStops(colors: string[], min = 0, max = 100, distribution = "Linear"): Stop[] {
  return spreadStops(colors, min, max, 3, distribution);
}

function toUiStops(list: ColorStop[]): Stop[] {
  return list.map((s) => ({ id: nextId(), value: s.value, color: s.color, opacity: s.opacity }));
}

function persistable(list: Stop[]): ColorStop[] {
  return list.map(({ value, color, opacity }) => ({ value, color, opacity }));
}

function stepStops(colors: string[], min = 0, max = 100): Stop[] {
  return spreadStops(colors, min, max, 4);
}

function Field({
  label,
  children,
  inline,
}: {
  label: string;
  children: React.ReactNode;
  inline?: boolean;
}) {
  return (
    <div className={"cp-field" + (inline ? " cp-field--inline" : "")}>
      <span className="cp-label">{label}</span>
      {children}
    </div>
  );
}

type HsvColor = { h: number; s: number; v: number };
type HslColor = { h: number; s: number; l: number };
type ColorFormat = "HEX" | "RGB" | "HSL";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function validHex(value: string) {
  const trimmed = value.trim();
  if (!/^#?[0-9a-f]{6}$/i.test(trimmed)) return null;
  return `#${trimmed.replace("#", "").toLowerCase()}`;
}

function rgbToHsvColor(r: number, g: number, b: number): HsvColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToHex({ h, s, v }: HsvColor) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

function rgbToHslColor(r: number, g: number, b: number): HslColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;
  if (delta) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }
  if (h < 0) h += 360;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

function hslToHex({ h, s, l }: HslColor) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export function DirectColorPicker({
  value,
  onChange,
  opacity = 100,
  onOpacityChange,
}: {
  value: string;
  onChange: (color: string) => void;
  opacity?: number;
  onOpacityChange?: (opacity: number) => void;
}) {
  const normalizedValue = validHex(value) ?? DEFAULT_COLOR_MODE.color;
  const normalizedOpacity = clamp(Number(opacity) || 0, 0, 100);
  const [hexDraft, setHexDraft] = useState(normalizedValue);
  const [opacityDraft, setOpacityDraft] = useState(String(normalizedOpacity));
  const [pickerDraft, setPickerDraft] = useState(normalizedValue);
  const [recentColor, setRecentColor] = useState("#8f5065");
  const [format, setFormat] = useState<ColorFormat>("RGB");
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLElement>(null);

  const [r, g, b] = hexToRgb(pickerDraft);
  const hsv = rgbToHsvColor(r, g, b);
  const hsl = rgbToHslColor(r, g, b);
  const channels: Array<{
    label: string;
    value: number;
    update: (raw: string) => void;
  }> =
    format === "RGB"
      ? [
          { label: "R", value: r, update: (raw) => updateRgb(0, raw) },
          { label: "G", value: g, update: (raw) => updateRgb(1, raw) },
          { label: "B", value: b, update: (raw) => updateRgb(2, raw) },
        ]
      : [
          { label: "H", value: Math.round(hsl.h), update: (raw) => updateHsl("h", raw) },
          { label: "S", value: Math.round(hsl.s * 100), update: (raw) => updateHsl("s", raw) },
          { label: "L", value: Math.round(hsl.l * 100), update: (raw) => updateHsl("l", raw) },
        ];

  useEffect(() => {
    setHexDraft(normalizedValue);
    if (!open) setPickerDraft(normalizedValue);
  }, [normalizedValue, open]);

  useEffect(() => {
    setOpacityDraft(String(normalizedOpacity));
  }, [normalizedOpacity]);

  const syncPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = 240;
    const estimatedHeight = 430;
    const gap = 8;
    const left = clamp(rect.right - width, gap, window.innerWidth - width - gap);
    const below = rect.bottom + gap;
    setPosition({
      left,
      top:
        below + estimatedHeight <= window.innerHeight - gap
          ? below
          : Math.max(gap, rect.top - estimatedHeight - gap),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setPickerDraft(normalizedValue);
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPickerDraft(normalizedValue);
      setOpen(false);
    };
    const onLayout = () => syncPosition();
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [open, normalizedValue, syncPosition]);

  const setSvFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPickerDraft(
      hsvToHex({
        h: hsv.h,
        s: clamp((event.clientX - rect.left) / rect.width, 0, 1),
        v: clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1),
      }),
    );
  };

  const updateRgb = (channel: 0 | 1 | 2, raw: string) => {
    const channels: [number, number, number] = [r, g, b];
    channels[channel] = clamp(Number(raw) || 0, 0, 255);
    setPickerDraft(rgbToHex(...channels));
  };

  const updateHsl = (channel: "h" | "s" | "l", raw: string) => {
    const next = { ...hsl };
    next[channel] =
      channel === "h"
        ? clamp(Number(raw) || 0, 0, 360)
        : clamp(Number(raw) || 0, 0, 100) / 100;
    setPickerDraft(hslToHex(next));
  };

  return (
    <>
      <div className="cp-direct-color cp-stop">
        <div className="cp-stop-half cp-stop-half--color">
          <input
            className="cp-stop-hex"
            value={hexDraft.toUpperCase()}
            aria-label="Color hex value"
            spellCheck={false}
            onChange={(event) => {
              const next = event.target.value;
              setHexDraft(next);
              const parsed = validHex(next);
              if (parsed) onChange(parsed);
            }}
            onBlur={() => setHexDraft(normalizedValue)}
          />
          <button
            ref={triggerRef}
            type="button"
            className={"cp-swatch" + (open ? " is-open" : "")}
            aria-label="Open color picker"
            aria-expanded={open}
            onClick={() => {
              if (open) {
                setOpen(false);
                return;
              }
              setPickerDraft(normalizedValue);
              syncPosition();
              setOpen(true);
            }}
          >
            <span style={{ background: normalizedValue }} />
          </button>
        </div>

        <span className="cp-divider" />

        <div className="cp-stop-half cp-stop-half--slider">
          <ContrastIcon className="cp-opacity-ico" width={20} height={20} />
          <input
            type="range"
            className="cp-range"
            min={0}
            max={100}
            value={normalizedOpacity}
            aria-label="Color opacity"
            onChange={(event) => onOpacityChange?.(Number(event.target.value))}
          />
          <label className="cp-pct-input">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={opacityDraft}
              aria-label="Opacity percentage"
              onChange={(event) => {
                const draft = event.target.value;
                setOpacityDraft(draft);
                if (draft === "") return;
                const next = Number(draft);
                if (!Number.isFinite(next)) return;
                onOpacityChange?.(clamp(next, 0, 100));
              }}
              onBlur={() => {
                const next = Number(opacityDraft);
                if (!Number.isFinite(next) || opacityDraft === "") {
                  setOpacityDraft(String(normalizedOpacity));
                  return;
                }
                const clamped = clamp(next, 0, 100);
                setOpacityDraft(String(clamped));
                onOpacityChange?.(clamped);
              }}
            />
            <span>%</span>
          </label>
        </div>
      </div>
      {open &&
        createPortal(
          <section
            ref={popoverRef}
            className="cp-direct-picker-popover"
            role="dialog"
            aria-label="Choose color"
            style={{ top: position.top, left: position.left }}
          >
            <div
              className="cp-direct-picker__sv"
              style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setSvFromPointer(event);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  setSvFromPointer(event);
                }
              }}
            >
              <span
                className="cp-direct-picker__marker"
                style={{
                  left: `${hsv.s * 100}%`,
                  top: `${(1 - hsv.v) * 100}%`,
                }}
              />
            </div>

            <input
              className="cp-direct-picker__hue"
              type="range"
              min={0}
              max={359}
              value={Math.round(hsv.h)}
              aria-label="Hue"
              onChange={(event) =>
                setPickerDraft(
                  hsvToHex({ ...hsv, h: Number(event.target.value) }),
                )
              }
            />

            <div className="cp-direct-picker__format-head">
              <span
                className="cp-direct-picker__preview"
                style={{ background: pickerDraft }}
                aria-hidden="true"
              />
              <div className="cp-direct-picker__formats" role="tablist" aria-label="Color format">
                {(["HEX", "RGB", "HSL"] as ColorFormat[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="tab"
                    aria-selected={format === item}
                    className={format === item ? "is-active" : ""}
                    onClick={() => setFormat(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {format === "HEX" ? (
              <label className="cp-direct-picker__single-value">
                <span>HEX</span>
                <input
                  value={pickerDraft.toUpperCase()}
                  onChange={(event) => {
                    const parsed = validHex(event.target.value);
                    if (parsed) setPickerDraft(parsed);
                  }}
                />
              </label>
            ) : (
              <div className="cp-direct-picker__channels">
                {channels.map((channel) => (
                  <label key={channel.label}>
                    <span>{channel.label}</span>
                    <input
                      type="number"
                      value={channel.value}
                      onChange={(event) => channel.update(event.target.value)}
                    />
                  </label>
                ))}
              </div>
            )}

            <div className="cp-direct-picker__recent">
              <span className="cp-label">Recent</span>
              <button
                type="button"
                aria-label={`Use recent color ${recentColor}`}
                style={{ background: recentColor }}
                onClick={() => setPickerDraft(recentColor)}
              />
            </div>

            <footer>
              <button
                type="button"
                className="pg-btn pg-btn--secondary"
                onClick={() => {
                  setPickerDraft(normalizedValue);
                  setOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="pg-btn pg-btn--primary"
                onClick={() => {
                  setRecentColor(normalizedValue);
                  onChange(pickerDraft);
                  setOpen(false);
                }}
              >
                Apply
              </button>
            </footer>
          </section>,
          document.body,
        )}
    </>
  );
}

function PaletteSwatches({ colors, limit }: { colors: string[]; limit?: number }) {
  const visibleColors = typeof limit === "number" ? colors.slice(0, limit) : colors;
  return (
    <span className="cp-picker-dots">
      {visibleColors.map((c, index) => (
        <span key={`${c}-${index}`} className="cp-picker-dot" style={{ background: c }} />
      ))}
    </span>
  );
}

function PaletteDetailsPopover({
  preset,
  onClose,
  style,
}: {
  preset: PalettePreset;
  onClose: () => void;
  style: CSSProperties;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const middleColor = preset.colors[Math.floor(preset.colors.length / 2)];
  const baseColors =
    preset.type === "Sequential"
      ? [{ label: "", color: preset.colors[preset.colors.length - 1] }]
      : preset.type === "Diverging"
        ? [
            { label: "Negative", color: preset.colors[0] },
            { label: "Neutral", color: middleColor },
            { label: "Positive", color: preset.colors[preset.colors.length - 1] },
          ]
        : [];

  const basisDescription =
    preset.type === "Sequential"
      ? "The system generates this palette from shades of one base color."
      : preset.type === "Diverging"
        ? "The system generates this palette between negative and positive colors through a neutral midpoint."
        : "Each color in a categorical palette is an independent base color.";

  return (
    <section
      className="cp-palette-details-popover"
      role="dialog"
      aria-label={`${preset.name} palette details`}
      style={style}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <header>
        <div>
          <strong>{preset.name}</strong>
          <span>{preset.type}</span>
        </div>
        <button type="button" aria-label="Close palette details" onClick={onClose}>
          <CloseIcon width={18} height={18} strokeWidth={1} aria-hidden="true" />
        </button>
      </header>
      <section className="cp-palette-details-popover__basis">
        <strong>{preset.type === "Sequential" ? "Base color" : "Base colors"}</strong>
        {baseColors.length > 0 && (
          <div className="cp-palette-details-popover__base-swatches">
            {baseColors.map(({ label, color }) => (
              <div key={`${label}-${color}`}>
                <span style={{ background: color }} aria-hidden="true" />
                {label && <span>{label}</span>}
              </div>
            ))}
          </div>
        )}
        <p>{basisDescription}</p>
      </section>
      {preset.type === "Categorical" ? (
        <div className="cp-palette-details-popover__colors">
          {preset.colors.map((color, index) => (
            <div key={`${color}-${index}`}>
              <span
                className="cp-palette-details-popover__color-swatch"
                style={{ background: color }}
                aria-hidden="true"
              />
              <span className="cp-palette-details-popover__color-index">{index + 1}</span>
            </div>
          ))}
        </div>
      ) : (
        <section className="cp-palette-details-popover__preview">
          <h3>Preview</h3>
          <div className="cp-palette-details-popover__preview-swatches">
            {preset.colors.map((color, index) => (
              <span key={`${color}-${index}`} style={{ background: color }} aria-hidden="true" />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function PalettePickerMenu({
  open,
  tab,
  search,
  selectedName,
  selectedType,
  onTab,
  onSearch,
  onSelect,
  menuRef,
  style,
}: {
  open: boolean;
  tab: PaletteType;
  search: string;
  selectedName: string;
  selectedType: PaletteType;
  onTab: (t: PaletteType) => void;
  onSearch: (q: string) => void;
  onSelect: (preset: PalettePreset) => void;
  menuRef?: Ref<HTMLDivElement>;
  style?: CSSProperties;
}) {
  const [detailsPopover, setDetailsPopover] = useState<{
    preset: PalettePreset;
    top: number;
    left: number;
  } | null>(null);

  useEffect(() => {
    if (!detailsPopover) return;
    const closeDetails = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest(".cp-palette-details-popover") ||
        target.closest(".cp-palette-overflow-badge") ||
        target.closest(".cp-palette-info-button")
      ) {
        return;
      }
      setDetailsPopover(null);
    };
    document.addEventListener("mousedown", closeDetails);
    return () => document.removeEventListener("mousedown", closeDetails);
  }, [detailsPopover]);

  if (!open) return null;

  const q = search.trim().toLowerCase();
  const list = PRESETS.filter((p) => p.type === tab && (!q || p.name.toLowerCase().includes(q)));
  const showDetails = (preset: PalettePreset, anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    const width = 400;
    const estimatedHeight = 480;
    const below = rect.bottom + 6;
    setDetailsPopover((current) =>
      current?.preset.name === preset.name && current.preset.type === preset.type
        ? null
        : {
            preset,
            top:
              below + estimatedHeight <= window.innerHeight - 8
                ? below
                : Math.max(8, rect.top - estimatedHeight - 6),
            left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
          },
    );
  };

  return (
    <div className="cp-picker-menu cp-picker-menu--flyout" ref={menuRef} style={style} role="listbox">
      <div className="dropdown-menu__inner">
        <div className="cp-picker-tabs">
          {(["Sequential", "Categorical", "Diverging"] as PaletteType[]).map((t) => (
            <button
              key={t}
              type="button"
              className={"cp-picker-tab" + (tab === t ? " is-active" : "")}
              onClick={() => onTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="cp-picker-section-rule" />

        <div className="cp-picker-search">
          <input
            type="search"
            placeholder="Search Palette Name"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="cp-picker-search-clear"
              aria-label="Clear search"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSearch("")}
            >
              <CloseIcon width={14} height={14} strokeWidth={1} aria-hidden="true" />
            </button>
          )}
          <SearchIcon className="cp-picker-search-ico" width={14} height={14} />
        </div>

        <div className="cp-picker-list">
          {list.map((preset) => {
            const selected = preset.name === selectedName && preset.type === selectedType;
            const hasOverflow = preset.colors.length > 10;
            return (
              <div
                key={preset.name}
                role="option"
                tabIndex={0}
                aria-selected={selected}
                className={"cp-picker-row cp-palette-picker-row" + (selected ? " is-selected" : "")}
                onClick={() => onSelect(preset)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onSelect(preset);
                }}
              >
                <span className="cp-picker-row-name">{preset.name}</span>
                <span className="cp-palette-picker-row__end">
                  <span className="cp-palette-picker-row__palette">
                    <PaletteSwatches colors={preset.colors} limit={7} />
                    {hasOverflow && (
                      <button
                        type="button"
                        className="cp-palette-overflow-badge"
                        aria-label={`View all ${preset.colors.length} ${preset.name} colors`}
                        onClick={(event) => {
                          event.stopPropagation();
                          showDetails(preset, event.currentTarget);
                        }}
                      >
                        10+
                      </button>
                    )}
                  </span>
                  <button
                    type="button"
                    className="cp-palette-info-button"
                    aria-label={`View ${preset.name} palette details`}
                    onClick={(event) => {
                      event.stopPropagation();
                      showDetails(preset, event.currentTarget);
                    }}
                  >
                    <InfoIcon width={16} height={16} aria-hidden="true" />
                  </button>
                </span>
              </div>
            );
          })}
          {!list.length && <div className="cp-picker-empty">No palettes found</div>}
        </div>
      </div>
      {detailsPopover &&
        createPortal(
          <PaletteDetailsPopover
            preset={detailsPopover.preset}
            onClose={() => setDetailsPopover(null)}
            style={{ top: detailsPopover.top, left: detailsPopover.left }}
          />,
          document.body,
        )}
    </div>
  );
}

export function PaletteSelector({
  value,
  onSelectPreset,
}: {
  value?: PaletteSelection;
  onSelectPreset?: (preset: PalettePreset) => void;
}) {
  const [ctxSelection, applyPreset] = usePaletteSelection();
  const selection = value ?? ctxSelection;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<PaletteType>(selection.type);
  const [pickerSearch, setPickerSearch] = useState("");
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const syncMenuPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 8, left: rect.left, width: rect.width });
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    syncMenuPosition();
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest(".cp-palette-details-popover")
      ) {
        return;
      }
      setPickerOpen(false);
    };
    const onLayout = () => syncMenuPosition();
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [pickerOpen, syncMenuPosition]);

  return (
    <div className="cp-picker-wrap">
      <button
        ref={triggerRef}
        type="button"
        className={"cp-picker-trigger" + (pickerOpen ? " is-open" : "")}
        aria-expanded={pickerOpen}
        onClick={() => {
          if (pickerOpen) {
            setPickerOpen(false);
            return;
          }
          setPickerTab(selection.type);
          syncMenuPosition();
          setPickerOpen(true);
        }}
      >
        <span className="cp-picker-trigger-name">{selection.name}</span>
        <span className="cp-picker-trigger-end">
          <span className="cp-picker-trigger-badge">{selection.type}</span>
          <ChevronDownIcon className="cp-caret" width={16} height={16} aria-hidden="true" />
        </span>
      </button>
      {pickerOpen &&
        createPortal(
          <PalettePickerMenu
            open={pickerOpen}
            tab={pickerTab}
            search={pickerSearch}
            selectedName={selection.name}
            selectedType={selection.type}
            onTab={setPickerTab}
            onSearch={setPickerSearch}
            onSelect={(preset) => {
              applyPreset(preset);
              onSelectPreset?.(preset);
              setPickerSearch("");
              setPickerOpen(false);
            }}
            menuRef={menuRef}
            style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
          />,
          document.body,
        )}
    </div>
  );
}

function StopRow({
  stop,
  colors,
  showValue,
  showLabel,
  showRemove,
  removable,
  onChange,
  onRemove,
}: {
  stop: Stop;
  colors: string[];
  showValue: boolean;
  showLabel?: boolean;
  showRemove?: boolean;
  removable: boolean;
  onChange: (s: Stop) => void;
  onRemove: () => void;
}) {
  const committedHex = toHex(stop.color).toUpperCase();
  const [hexDraft, setHexDraft] = useState(committedHex);
  const [opacityDraft, setOpacityDraft] = useState(String(stop.opacity));
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const swatchRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHexDraft(committedHex);
  }, [committedHex]);

  useEffect(() => {
    setOpacityDraft(String(stop.opacity));
  }, [stop.opacity]);

  const syncMenuPosition = useCallback(() => {
    const el = swatchRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = 248;
    const estHeight = 196;
    const gap = 8;
    let left = rect.left;
    let top = rect.bottom + gap;
    left = Math.min(left, window.innerWidth - width - gap);
    left = Math.max(gap, left);
    if (top + estHeight > window.innerHeight - gap) {
      top = Math.max(gap, rect.top - estHeight - gap);
    }
    setMenuPos({ top, left });
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    syncMenuPosition();
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (swatchRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const onLayout = () => syncMenuPosition();
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [menuOpen, syncMenuPosition]);

  const pickColor = (next: string) => {
    onChange({ ...stop, color: next });
    setMenuOpen(false);
  };

  return (
    <div className="cp-stop-wrap">
      <div className="cp-stop">
        <div className="cp-stop-half cp-stop-half--color">
          {showLabel ? (
            <input
              className="cp-stop-value"
              aria-label="Status value"
              placeholder="Status"
              value={stop.label ?? ""}
              onChange={(e) => onChange({ ...stop, label: e.target.value })}
            />
          ) : showValue ? (
            <input
              className="cp-stop-value"
              inputMode="numeric"
              aria-label={`Data value for color ${committedHex}`}
              value={String(stop.value)}
              onChange={(e) => onChange({ ...stop, value: Number(e.target.value.replace(/[^\d-]/g, "")) || 0 })}
            />
          ) : (
            <input
              className="cp-stop-hex"
              aria-label="Hex color"
              spellCheck={false}
              value={hexDraft}
              onChange={(e) => {
                const next = e.target.value;
                setHexDraft(next);
                const trimmed = next.trim();
                if (/^#?[0-9a-fA-F]{6}$/.test(trimmed)) {
                  onChange({ ...stop, color: trimmed.startsWith("#") ? trimmed : `#${trimmed}` });
                }
              }}
              onBlur={() => setHexDraft(committedHex)}
            />
          )}

          <button
            ref={swatchRef}
            type="button"
            className={"cp-swatch" + (menuOpen ? " is-open" : "")}
            aria-label={`Choose color ${committedHex}`}
            aria-expanded={menuOpen}
            aria-haspopup="listbox"
            onClick={() => {
              if (menuOpen) {
                setMenuOpen(false);
                return;
              }
              syncMenuPosition();
              setMenuOpen(true);
            }}
          >
            <span style={{ background: stop.color }} />
          </button>
          {menuOpen &&
            createPortal(
              <div
                ref={menuRef}
                className="cp-picker-menu cp-picker-menu--flyout cp-swatch-menu"
                role="listbox"
                aria-label="Palette colors"
                style={{ top: menuPos.top, left: menuPos.left }}
              >
                <div className="dropdown-menu__inner">
                  <span className="cp-label">Selected color</span>
                  <div className="cp-swatch-menu__grid">
                    {colors.map((c, i) => {
                      const selected = sameHex(c, stop.color);
                      return (
                        <button
                          key={`${c}-${i}`}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          aria-label={toHex(c).toUpperCase()}
                          className={"cp-swatch-menu__dot" + (selected ? " is-selected" : "")}
                          style={{
                            background: c,
                            ["--cp-selected-swatch-color" as string]: c,
                          }}
                          onClick={() => pickColor(c)}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>,
              document.body,
            )}
        </div>

        <span className="cp-divider" />

        <div className="cp-stop-half cp-stop-half--slider">
          <ContrastIcon className="cp-opacity-ico" width={20} height={20} />

          <input
            type="range"
            className="cp-range"
            min={0}
            max={100}
            value={stop.opacity}
            onChange={(e) => onChange({ ...stop, opacity: Number(e.target.value) })}
          />
          <label className="cp-pct-input">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={opacityDraft}
              aria-label="Opacity percentage"
              onChange={(e) => {
                const draft = e.target.value;
                setOpacityDraft(draft);
                if (draft === "") return;
                const next = Number(draft);
                if (!Number.isFinite(next)) return;
                onChange({ ...stop, opacity: Math.max(0, Math.min(100, next)) });
              }}
              onBlur={() => {
                const next = Number(opacityDraft);
                if (!Number.isFinite(next) || opacityDraft === "") {
                  setOpacityDraft(String(stop.opacity));
                  return;
                }
                const clamped = Math.max(0, Math.min(100, next));
                setOpacityDraft(String(clamped));
                onChange({ ...stop, opacity: clamped });
              }}
            />
            <span>%</span>
          </label>
        </div>
      </div>

      {showRemove && (
        <button
          type="button"
          className="cp-stop-del"
          aria-label="Remove stop"
          disabled={!removable}
          onClick={onRemove}
        >
          <TrashIcon width={16} height={16} />
        </button>
      )}
    </div>
  );
}

function stopPercent(value: number, min: number, span: number) {
  return ((value - min) / span) * 100;
}

const TRACK_KNOB = 16;

function knobLeft(pct: number) {
  const t = Math.max(0, Math.min(100, pct));
  return `calc(${TRACK_KNOB / 2}px + ${t} * (100% - ${TRACK_KNOB}px) / 100)`;
}

function dragPercent(clientX: number, rect: DOMRect) {
  const inset = TRACK_KNOB / 2;
  const usable = Math.max(1, rect.width - TRACK_KNOB);
  return Math.max(0, Math.min(1, (clientX - rect.left - inset) / usable));
}

function markAlign(index: number, count: number): "start" | "center" | "end" {
  if (index === 0) return "start";
  if (index === count - 1) return "end";
  return "center";
}

function DataRangeEditor({
  sorted,
  colors,
  min,
  max,
  span,
  trackBg,
  stepsStyle,
  removable,
  onChange,
  onRemove,
}: {
  sorted: Stop[];
  colors: string[];
  min: number;
  max: number;
  span: number;
  trackBg: string;
  stepsStyle?: boolean;
  removable: boolean;
  onChange: (s: Stop) => void;
  onRemove: (id: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const marks = sorted.map((s) => ({
    id: s.id,
    label: formatRangeNum(s.value),
    value: s.value,
  }));

  const dragStop = (stopId: number, clientX: number) => {
    const track = trackRef.current;
    const stop = sorted.find((s) => s.id === stopId);
    if (!track || !stop) return;
    const rect = track.getBoundingClientRect();
    const pct = dragPercent(clientX, rect);
    const nextValue = niceNum(min + pct * span, span);
    if (nextValue !== stop.value) onChange({ ...stop, value: nextValue });
  };

  const onKnobPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, id: number) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStop(id, event.clientX);
    const move = (ev: PointerEvent) => dragStop(id, ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <>
      <div className="cp-range-block">
        <div className="cp-track-area cp-track-area--steps">
          {marks.map((mark, i) => {
            const pct = stopPercent(mark.value, min, span);
            const isEnd = markAlign(i, marks.length) === "end";
            return (
              <div key={`mark-${mark.id}`} className="cp-track-mark" style={{ left: knobLeft(pct) }}>
                <span className="cp-track-mark__tick" aria-hidden="true" />
                <span
                  className={
                    "cp-track-mark__label" + (isEnd ? " cp-track-mark__label--before" : " cp-track-mark__label--after")
                  }
                >
                  {mark.label}
                </span>
              </div>
            );
          })}
          <div
            ref={trackRef}
            className={"cp-track" + (stepsStyle ? " cp-track--steps" : " cp-track--gradient")}
            style={{ background: trackBg }}
          >
            {marks.map((mark) => {
              const pct = stopPercent(mark.value, min, span);
              return (
                <button
                  key={mark.id}
                  type="button"
                  className="cp-track-knob cp-track-knob--step"
                  style={{ left: knobLeft(pct) }}
                  aria-label={`Stop at ${mark.label}`}
                  onPointerDown={(e) => onKnobPointerDown(e, mark.id)}
                />
              );
            })}
          </div>
        </div>
        <div className="cp-range-head cp-range-head--combined">
          <span className="cp-range-combined">
            <span className="cp-label">Data range:</span> {formatRangeNum(min)} - {formatRangeNum(max)}
          </span>
        </div>
      </div>

      <div className="cp-stops">
        {sorted.map((s) => (
          <StopRow
            key={s.id}
            stop={s}
            colors={colors}
            showValue
            showRemove
            removable={removable}
            onChange={onChange}
            onRemove={() => onRemove(s.id)}
          />
        ))}
      </div>
    </>
  );
}

export function CategoryColorMap({
  rows,
  onChange,
}: {
  rows: RepeatableRow[];
  onChange: (next: RepeatableRow[]) => void;
}) {
  const [selection, applyPreset] = usePaletteSelection();
  const colors = selection.colors.length ? selection.colors : DEFAULT_COLOR_MODE.colors;

  const updateRow = (index: number, stop: Stop) => {
    onChange(
      rows.map((row, i) =>
        i === index
          ? {
              ...row,
              label: stop.label ?? row.label,
              color: stop.color,
              opacity: stop.opacity,
            }
          : row,
      ),
    );
  };

  return (
    <div className="cp">
      <div className="cp-field">
        <PaletteSelector
          value={selection}
          onSelectPreset={(preset) => {
            applyPreset(preset);
            onChange(
              rows.map((row, i) => ({
                ...row,
                color: preset.colors[i % preset.colors.length] ?? row.color,
              })),
            );
          }}
        />
      </div>
      <div className="cp-stops">
        {rows.map((row, i) => (
          <StopRow
            key={i}
            stop={{
              id: i,
              value: 0,
              color: row.color,
              opacity: Number.isFinite(Number(row.opacity)) ? Number(row.opacity) : 100,
              label: row.label,
            }}
            colors={colors}
            showValue={false}
            showLabel
            showRemove
            removable={rows.length > 1}
            onChange={(stop) => updateRow(i, stop)}
            onRemove={() => onChange(rows.filter((_, j) => j !== i))}
          />
        ))}
      </div>
      <button
        type="button"
        className="cp-add"
        onClick={() =>
          onChange([
            ...rows,
            {
              min: "",
              max: "",
              color: colors[rows.length % colors.length] ?? "#73adf5",
              label: `Status ${rows.length + 1}`,
              opacity: 100,
            },
          ])
        }
      >
        <PlusIcon width={16} height={16} />
        <span>Add Another Stop</span>
      </button>
    </div>
  );
}

export default function ColorPalette({
  color,
  setColor,
  variant = "full",
  value,
  onChange,
  styles,
}: {
  color: string;
  setColor: (c: string) => void;
  variant?: "full" | "simple" | "swatch" | "steps";
  value?: ColorModeConfig;
  onChange?: (next: ColorModeConfig) => void;
  styles?: PaletteStyle[];
}) {
  const isSimple = variant === "simple";
  const isSwatch = variant === "swatch";
  const isStepsOnly = variant === "steps";
  const isFull = !isSimple && !isSwatch && !isStepsOnly;
  const dataRange = useContext(DataRangeContext);
  const previewCategoryLabels = useContext(PaletteCategoriesContext);
  const [local, setLocal] = useState<ColorModeConfig>(() => asColorMode(value ?? { ...DEFAULT_COLOR_MODE, color }));
  const config = value ?? local;
  const commit = (patch: Partial<ColorModeConfig>) => {
    const next: ColorModeConfig = { ...config, ...patch };
    if (!value) setLocal(next);
    onChange?.(next);
    if (!onChange) {
      if (patch.color) setColor(patch.color);
      else if (next.color !== color) setColor(next.color);
    }
  };

  const domainMin = dataRange?.min;
  const domainMax = dataRange?.max;

  const [gStops, setGStops] = useState<Stop[]>(() =>
    config.style !== "Steps" && config.stops.length ? toUiStops(config.stops) : gradientStops(config.colors, domainMin ?? 0, domainMax ?? 100),
  );
  const [sStops, setSStops] = useState<Stop[]>(() =>
    config.style === "Steps" && config.stops.length ? toUiStops(config.stops) : stepStops(config.colors, domainMin ?? 0, domainMax ?? 100),
  );

  const [ctxSelection] = usePaletteSelection();
  const paletteColors =
    (isStepsOnly ? ctxSelection.colors : config.colors).length
      ? isStepsOnly
        ? ctxSelection.colors
        : config.colors
      : DEFAULT_COLOR_MODE.colors;
  const categoryLabels = previewCategoryLabels.length
    ? Array.from(new Set(previewCategoryLabels.filter(Boolean)))
    : Array.from({ length: 6 }, (_, i) => `Category ${i + 1}`);
  const allowedStyles =
    styles ?? (["Single", "Per Category", "Gradient", "Steps"] as PaletteStyle[]);
  const style = isStepsOnly
    ? "Steps"
    : allowedStyles.includes(config.style)
      ? config.style
      : allowedStyles[0];

  useEffect(() => {
    if (domainMin == null || domainMax == null) return;
    const current = style === "Steps" ? sStops : gStops;
    const lo = current.length ? Math.min(...current.map((s) => s.value)) : NaN;
    const hi = current.length ? Math.max(...current.map((s) => s.value)) : NaN;
    const aligned = Math.abs(lo - domainMin) < 1e-6 && Math.abs(hi - domainMax) < 1e-6;
    if (aligned && !isPlaceholderStops(current)) return;
    if (isStepsOnly) {
      const s = remapStopValues(current, domainMin, domainMax);
      setSStops(s);
      commit({ style: "Steps", stops: persistable(s) });
      return;
    }
    const g = spreadStops(paletteColors, domainMin, domainMax, Math.max(3, gStops.length), config.distribution);
    const s = spreadStops(paletteColors, domainMin, domainMax, Math.max(4, sStops.length));
    setGStops(g);
    setSStops(s);
    commit({ stops: persistable(style === "Steps" ? s : g) });
    // Domain identity only — stop lists are rebuilt here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainMin, domainMax]);

  const applyPreset = (preset: PalettePreset) => {
    const min = domainMin ?? 0;
    const max = domainMax ?? 100;
    const g = gradientStops(preset.colors, min, max, config.distribution);
    const s = stepStops(preset.colors, min, max);
    setGStops(g);
    setSStops(s);
    const last = preset.colors[preset.colors.length - 1] ?? config.color;
    commit({
      paletteName: preset.name,
      paletteFamily: preset.type as PaletteFamily,
      colors: preset.colors,
      color: last,
      categoryLabels: style === "Per Category" ? categoryLabels : config.categoryLabels,
      stops: persistable(style === "Steps" ? s : g),
    });
  };
  const paletteSelection: PaletteSelection = {
    name: config.paletteName,
    type: config.paletteFamily,
    colors: paletteColors,
  };
  const distribution = DISTRIBUTION_OPTIONS.includes(config.distribution as (typeof DISTRIBUTION_OPTIONS)[number])
    ? config.distribution
    : "Linear";
  const opacity = config.opacity;
  const stops = style === "Gradient" ? gStops : sStops;
  const setStops = style === "Gradient" ? setGStops : setSStops;
  const sorted = [...stops].sort((a, b) => a.value - b.value);
  const min = domainMin ?? sorted[0]?.value ?? 0;
  const max = domainMax ?? sorted[sorted.length - 1]?.value ?? 100;
  const span = Math.max(max - min, 1e-6);

  const trackBg =
    style === "Gradient"
      ? `linear-gradient(90deg, ${sorted
          .map((s) => `${s.color} ${(((s.value - min) / span) * 100).toFixed(1)}%`)
          .join(", ")})`
      : `linear-gradient(90deg, ${sorted
          .map((s, i) => {
            const start = ((s.value - min) / span) * 100;
            const end = i < sorted.length - 1 ? ((sorted[i + 1].value - min) / span) * 100 : 100;
            return `${s.color} ${start.toFixed(1)}% ${end.toFixed(1)}%`;
          })
          .join(", ")})`;

  const persistStops = (list: Stop[]) => {
    commit({
      stops: persistable(list),
      color: list[list.length - 1]?.color ?? config.color,
    });
  };

  const updateStop = (next: Stop) => {
    setStops((list) => {
      const updated = list.map((s) => (s.id === next.id ? next : s));
      persistStops(updated);
      return updated;
    });
  };
  const removeStop = (id: number) =>
    setStops((list) => {
      if (list.length <= 2) return list;
      let updated = list.filter((s) => s.id !== id);
      if (style === "Gradient") updated = redistributeStops(updated, min, max, distribution);
      persistStops(updated);
      return updated;
    });
  const addStop = () => {
    const mid = Math.round((min + max) / 2);
    setStops((list) => {
      let updated = [
        ...list,
        { id: nextId(), value: mid, color: paletteColors[1] ?? paletteColors[0], opacity: 100 },
      ];
      if (style === "Gradient") updated = redistributeStops(updated, min, max, distribution);
      persistStops(updated);
      return updated;
    });
  };
  const setStyle = (next: PaletteStyle) => {
    const src = next === "Steps" ? sStops : gStops;
    commit({
      style: next,
      categoryLabels: next === "Per Category" ? categoryLabels : config.categoryLabels,
      sequentialBasis:
        next === "Gradient" || next === "Steps"
          ? "Value"
          : config.sequentialBasis,
      stops: persistable(src),
    });
  };

  return (
    <div className={"cp" + (isSimple || isSwatch ? " cp--simple" : "") + (isSwatch ? " cp--swatch" : "")}>
      {!isSwatch && (
        <div className="cp-field">
          {!isStepsOnly && <span className="cp-label">Color palette</span>}
          {isFull || isStepsOnly ? (
            <PaletteSelector value={isStepsOnly ? ctxSelection : paletteSelection} onSelectPreset={applyPreset} />
          ) : (
            <PaletteSelector />
          )}
        </div>
      )}

      {isSwatch && (
        <StopRow
          stop={{ id: 0, value: min, color, opacity }}
          colors={paletteColors}
          showValue={false}
          removable={false}
          onChange={(s) => {
            setColor(s.color);
            commit({ color: s.color, opacity: s.opacity });
          }}
          onRemove={() => {}}
        />
      )}

      {isFull && (
        <Field label="Palette type">
          <div className="cp-type">
            {(allowedStyles).map((s) => {
              const Icon =
                s === "Single"
                  ? SinglePillIcon
                  : s === "Per Category"
                    ? PerCategoryPillsIcon
                    : s === "Gradient"
                      ? GradientPillIcon
                      : StepsDotsIcon;
              const label = s === "Single" && styles ? "Solid" : s;
              return (
                <button
                  key={s}
                  type="button"
                  className={"cp-type__btn" + (style === s ? " is-active" : "")}
                  aria-pressed={style === s}
                  onClick={() => setStyle(s)}
                >
                  <span>{label}</span>
                  <Icon className="cp-type__icon" />
                </button>
              );
            })}
          </div>
        </Field>
      )}

      {((isFull && style === "Single") || isSimple) && (
        <StopRow
          stop={{ id: 0, value: min, color: config.color || color, opacity }}
          colors={paletteColors}
          showValue={false}
          removable={false}
          onChange={(s) => {
            commit({ color: s.color, opacity: s.opacity });
            if (!onChange) setColor(s.color);
          }}
          onRemove={() => {}}
        />
      )}

      {isFull && style === "Gradient" && (
        <>
          <Field label="Distribution">
            <Dropdown
              value={distribution}
              onChange={(v) => {
                const next = redistributeStops(sorted, min, max, v);
                setGStops(next);
                commit({ distribution: v, stops: persistable(next) });
              }}
              options={DISTRIBUTION_OPTIONS.map((o) => ({ value: o, label: o }))}
            />
          </Field>
          <Field label="Reverse direction" inline>
            <span
              role="switch"
              aria-checked={Boolean(config.gradientReverse)}
              className={"ia-mini-switch" + (config.gradientReverse ? " on" : "")}
              onClick={() => commit({ gradientReverse: !config.gradientReverse })}
            />
          </Field>
          <DataRangeEditor
            sorted={sorted}
            colors={paletteColors}
            min={min}
            max={max}
            span={span}
            trackBg={trackBg}
            removable={stops.length > 2}
            onChange={updateStop}
            onRemove={removeStop}
          />
          <button type="button" className="cp-add" onClick={addStop}>
            <PlusIcon width={16} height={16} />
            <span>Add Another Stop</span>
          </button>
        </>
      )}

      {((isFull && style === "Steps") || isStepsOnly) && (
        <>
          <DataRangeEditor
            sorted={sorted}
            colors={paletteColors}
            min={min}
            max={max}
            span={span}
            trackBg={trackBg}
            stepsStyle
            removable={stops.length > 2}
            onChange={updateStop}
            onRemove={removeStop}
          />
          <button type="button" className="cp-add" onClick={addStop}>
            <PlusIcon width={16} height={16} />
            <span>Add Another Stop</span>
          </button>
        </>
      )}
    </div>
  );
}
