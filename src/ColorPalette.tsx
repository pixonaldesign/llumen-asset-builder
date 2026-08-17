/**
 * ColorPalette — Color Palette Selector V2.
 *
 *   1. Color palette — picker popover (Sequential / Categorical / Diverging)
 *   2. Palette type  — Single / Gradient / Steps
 *   3. Stops editor  — solid swatch, gradient ramp, or discrete steps
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import Dropdown from "./Dropdown";
import {
  ChevronDownIcon,
  ContrastIcon,
  GradientPillIcon,
  PlusIcon,
  SearchIcon,
  SinglePillIcon,
  StepsDotsIcon,
  TrashIcon,
} from "./icons";
import {
  DEFAULT_COLOR_MODE,
  asColorMode,
  type ColorModeConfig,
  type ColorStop,
  type PaletteFamily,
  type PaletteStyle,
} from "./previewTheme";

type PaletteType = "Sequential" | "Categorical" | "Diverging";

interface Stop {
  id: number;
  value: number;
  color: string;
  opacity: number;
}

interface PalettePreset {
  name: string;
  type: PaletteType;
  colors: string[];
}

const PRESETS: PalettePreset[] = [
  { name: "Blue", type: "Sequential", colors: ["#f4f7ff", "#c8dcfc", "#96bdf8", "#6a9ef3", "#457fe8", "#2b61f5"] },
  { name: "Purple", type: "Sequential", colors: ["#f6f2ff", "#d8c4fc", "#b899f5", "#9670eb", "#7449df", "#5a2fc7"] },
  { name: "Teal", type: "Sequential", colors: ["#eefcfa", "#b8f0e6", "#7de0d0", "#45cdb9", "#23b899", "#159a7d"] },
  { name: "Red", type: "Sequential", colors: ["#fff0f0", "#ffc9c9", "#ff9a9a", "#f56b6b", "#e03e3e", "#c62828"] },
  { name: "Yellow", type: "Sequential", colors: ["#fffbeb", "#fef3c7", "#fde68a", "#fcd34d", "#fbbf24", "#f59e0b"] },
  { name: "Blue 2 Steps", type: "Categorical", colors: ["#5b8df0", "#7c5cff"] },
  { name: "Red 3 Steps", type: "Categorical", colors: ["#e85c5c", "#e8b84d", "#3db89a"] },
  { name: "Purple 4 Steps", type: "Categorical", colors: ["#8b5cf6", "#ec4899", "#a3e635", "#eab308"] },
  { name: "Red → Blue", type: "Diverging", colors: ["#c62828", "#ef5350", "#ffcdd2", "#bbdefb", "#42a5f5", "#1565c0"] },
  { name: "Purple → Teal", type: "Diverging", colors: ["#6b21a8", "#a855f7", "#e9d5ff", "#ccfbf1", "#2dd4bf", "#0f766e"] },
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

export function ColorPaletteProvider({
  children,
  dataRange,
}: {
  children: ReactNode;
  dataRange?: DataRange | null;
}) {
  const [selection, setSelection] = useState<PaletteSelection>(DEFAULT_SELECTION);
  const value = useMemo(() => ({ selection, setSelection }), [selection]);
  return (
    <PaletteContext.Provider value={value}>
      <DataRangeContext.Provider value={dataRange ?? null}>{children}</DataRangeContext.Provider>
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

function niceNum(n: number, span: number): number {
  if (!Number.isFinite(n)) return 0;
  if (span >= 10) return Math.round(n);
  return Number(n.toFixed(2));
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

function spreadStops(colors: string[], min: number, max: number, count: number): Stop[] {
  const ramp = colors.length ? colors : ["#eff5fe", "#2b61f5"];
  const n = Math.max(2, count);
  const span = max - min;
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : i / (n - 1);
    const colorIndex = Math.round(t * (ramp.length - 1));
    return {
      id: nextId(),
      value: niceNum(min + t * span, span),
      color: ramp[Math.min(colorIndex, ramp.length - 1)],
      opacity: 100,
    };
  });
}

function gradientStops(colors: string[], min = 0, max = 100): Stop[] {
  return spreadStops(colors, min, max, 3);
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

function PaletteSwatches({ colors }: { colors: string[] }) {
  return (
    <span className="cp-picker-dots">
      {colors.map((c) => (
        <span key={c} className="cp-picker-dot" style={{ background: c }} />
      ))}
    </span>
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
  if (!open) return null;

  const q = search.trim().toLowerCase();
  const list = PRESETS.filter((p) => p.type === tab && (!q || p.name.toLowerCase().includes(q)));

  return (
    <div className="cp-picker-menu cp-picker-menu--flyout" ref={menuRef} style={style} role="listbox">
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
        <SearchIcon className="cp-picker-search-ico" width={14} height={14} />
      </div>

      <div className="cp-picker-list">
        {list.map((preset) => (
          <button
            key={preset.name}
            type="button"
            role="option"
            aria-selected={preset.name === selectedName && preset.type === selectedType}
            className={
              "cp-picker-row" + (preset.name === selectedName && preset.type === selectedType ? " is-selected" : "")
            }
            onClick={() => onSelect(preset)}
          >
            <span className="cp-picker-row-name">{preset.name}</span>
            <PaletteSwatches colors={preset.colors} />
          </button>
        ))}
        {!list.length && <div className="cp-picker-empty">No palettes found</div>}
      </div>
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
  showRemove,
  removable,
  onChange,
  onRemove,
}: {
  stop: Stop;
  colors: string[];
  showValue: boolean;
  showRemove?: boolean;
  removable: boolean;
  onChange: (s: Stop) => void;
  onRemove: () => void;
}) {
  const committedHex = toHex(stop.color).toUpperCase();
  const [hexDraft, setHexDraft] = useState(committedHex);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const swatchRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const customRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHexDraft(committedHex);
  }, [committedHex]);

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

  const openCustomPicker = () => {
    customRef.current?.click();
    setMenuOpen(false);
  };

  return (
    <div className="cp-stop-wrap">
      <div className="cp-stop">
        <div className="cp-stop-half cp-stop-half--color">
          {showValue ? (
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
                        style={{ background: c }}
                        onClick={() => pickColor(c)}
                      />
                    );
                  })}
                </div>
                <button type="button" className="cp-add cp-swatch-menu__custom" onClick={openCustomPicker}>
                  <PlusIcon width={16} height={16} />
                  <span>Add a custom color</span>
                </button>
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
          <span className="cp-pct">{stop.opacity}%</span>
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
      <input
        ref={customRef}
        type="color"
        className="cp-swatch-native"
        value={toHex(stop.color)}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onChange({ ...stop, color: e.target.value })}
      />
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
      <div className="cp-range-head cp-range-head--combined">
        <span className="cp-range-combined">
          <span className="cp-label">Data range:</span> {formatRangeNum(min)} - {formatRangeNum(max)}
        </span>
      </div>

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

export default function ColorPalette({
  color,
  setColor,
  variant = "full",
  value,
  onChange,
}: {
  color: string;
  setColor: (c: string) => void;
  variant?: "full" | "simple" | "swatch" | "steps";
  value?: ColorModeConfig;
  onChange?: (next: ColorModeConfig) => void;
}) {
  const isSimple = variant === "simple";
  const isSwatch = variant === "swatch";
  const isStepsOnly = variant === "steps";
  const isFull = !isSimple && !isSwatch && !isStepsOnly;
  const dataRange = useContext(DataRangeContext);
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
  const style = isStepsOnly ? "Steps" : config.style;

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
    const g = spreadStops(paletteColors, domainMin, domainMax, Math.max(3, gStops.length));
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
    const g = gradientStops(preset.colors, min, max);
    const s = stepStops(preset.colors, min, max);
    setGStops(g);
    setSStops(s);
    const last = preset.colors[preset.colors.length - 1] ?? config.color;
    commit({
      paletteName: preset.name,
      paletteFamily: preset.type as PaletteFamily,
      colors: preset.colors,
      color: last,
      stops: persistable(style === "Steps" ? s : g),
    });
  };
  const paletteSelection: PaletteSelection = {
    name: config.paletteName,
    type: config.paletteFamily,
    colors: paletteColors,
  };
  const distribution = config.distribution || "Linear";
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
      const updated = list.filter((s) => s.id !== id);
      persistStops(updated);
      return updated;
    });
  const addStop = () => {
    const mid = Math.round((min + max) / 2);
    setStops((list) => {
      const updated = [
        ...list,
        { id: nextId(), value: mid, color: paletteColors[1] ?? paletteColors[0], opacity: 100 },
      ];
      persistStops(updated);
      return updated;
    });
  };
  const setStyle = (next: PaletteStyle) => {
    const src = next === "Steps" ? sStops : gStops;
    commit({
      style: next,
      stops: persistable(src),
    });
  };

  return (
    <div className={"cp" + (isSimple || isSwatch ? " cp--simple" : "") + (isSwatch ? " cp--swatch" : "")}>
      {!isSwatch && (
        <div className="cp-field">
          <span className="cp-label">Color palette</span>
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
            {(["Single", "Gradient", "Steps"] as PaletteStyle[]).map((s) => {
              const Icon = s === "Single" ? SinglePillIcon : s === "Gradient" ? GradientPillIcon : StepsDotsIcon;
              return (
                <button
                  key={s}
                  type="button"
                  className={"cp-type__btn" + (style === s ? " is-active" : "")}
                  aria-pressed={style === s}
                  onClick={() => setStyle(s)}
                >
                  <span>{s}</span>
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
              onChange={(v) => commit({ distribution: v })}
              options={["Linear", "Quantile", "Quantize"].map((o) => ({ value: o, label: o }))}
            />
          </Field>
          <Field label="Gradient axis">
            <div className="ia-segmented">
              {(["X", "Y"] as const).map((axis) => (
                <span
                  key={axis}
                  className={(config.gradientAxis || "Y") === axis ? "active" : ""}
                  onClick={() => commit({ gradientAxis: axis })}
                >
                  {axis}
                </span>
              ))}
            </div>
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
