/**
 * ColorPalette — unified color picking system for the chart builder.
 *
 *   1. Color palette — picker popover (Sequential / Categorical / Diverging)
 *   2. Palette type  — Single / Gradient / Steps
 *   3. Stops editor  — solid swatch, gradient ramp, or discrete steps
 *
 * The primary color is mirrored to the host config under
 * `Colors::Single color` so the live chart preview stays in sync.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
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

type PaletteType = "Sequential" | "Categorical" | "Diverging";
type Style = "Single" | "Gradient" | "Steps";

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

const PaletteContext = createContext<{
  selection: PaletteSelection;
  setSelection: (next: PaletteSelection) => void;
} | null>(null);

export function ColorPaletteProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<PaletteSelection>(DEFAULT_SELECTION);
  const value = useMemo(() => ({ selection, setSelection }), [selection]);
  return <PaletteContext.Provider value={value}>{children}</PaletteContext.Provider>;
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

function gradientStops(colors: string[]): Stop[] {
  const ramp = colors.length ? colors : ["#e8f0ff", "#2b61f5"];
  return [
    { id: nextId(), value: 194, color: ramp[0], opacity: 100 },
    { id: nextId(), value: 600, color: ramp[ramp.length - 1], opacity: 100 },
  ];
}

function stepStops(colors: string[]): Stop[] {
  const ramp = colors.length ? colors : ["#e8f0ff", "#9cc0fb", "#5b8df0", "#2b61f5"];
  const values = [194, 350, 520, 600];
  return values.slice(0, Math.max(2, ramp.length)).map((v, i) => ({
    id: nextId(),
    value: v,
    color: ramp[i % ramp.length],
    opacity: 100,
  }));
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="cp-field">
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

function SwatchPicker({
  colors,
  color,
  onSelect,
}: {
  colors: string[];
  color: string;
  onSelect: (c: string) => void;
}) {
  return (
    <div className="cp-swatch-grid" role="listbox" aria-label="Palette colors">
      {colors.map((c) => {
        const selected = sameHex(c, color);
        return (
          <button
            key={c}
            type="button"
            role="option"
            aria-selected={selected}
            aria-label={c}
            className={"cp-swatch-btn" + (selected ? " is-selected" : "")}
            style={{ background: c }}
            onClick={() => onSelect(c)}
          />
        );
      })}
    </div>
  );
}

function OverrideButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={"pg-btn pg-btn--ghost pg-btn--sm cp-override" + (on ? " is-on" : "")}
      aria-pressed={on}
      onClick={onToggle}
    >
      {on ? "Use palette" : "Override"}
    </button>
  );
}

export function PaletteSelector() {
  const [selection, applyPreset] = usePaletteSelection();
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
          <PaletteSwatches colors={selection.colors} />
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
  showValue,
  removable,
  onChange,
  onRemove,
}: {
  stop: Stop;
  showValue: boolean;
  removable: boolean;
  onChange: (s: Stop) => void;
  onRemove: () => void;
}) {
  return (
    <div className="cp-stop-wrap">
      <div className="cp-stop">
        <div className="cp-stop-half cp-stop-half--color">
          {showValue ? (
            <input
              className="cp-stop-value"
              inputMode="numeric"
              aria-label={`Data value for color ${toHex(stop.color)}`}
              value={String(stop.value)}
              onChange={(e) => onChange({ ...stop, value: Number(e.target.value.replace(/[^\d-]/g, "")) || 0 })}
            />
          ) : (
            <span className="cp-stop-hex">{toHex(stop.color).toUpperCase()}</span>
          )}

          <label className="cp-swatch">
            <input
              type="color"
              value={toHex(stop.color)}
              onChange={(e) => onChange({ ...stop, color: e.target.value })}
            />
            <span style={{ background: stop.color }} />
          </label>
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

      {removable && (
        <button className="cp-stop-del" aria-label="Remove stop" onClick={onRemove}>
          <TrashIcon width={16} height={16} />
        </button>
      )}
    </div>
  );
}

function stopPercent(value: number, min: number, span: number) {
  return ((value - min) / span) * 100;
}

function markAlign(index: number, count: number): "start" | "center" | "end" {
  if (index === 0) return "start";
  if (index === count - 1) return "end";
  return "center";
}

function DataRangeEditor({
  sorted,
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
  min: number;
  max: number;
  span: number;
  trackBg: string;
  stepsStyle?: boolean;
  removable: boolean;
  onChange: (s: Stop) => void;
  onRemove: (id: number) => void;
}) {
  const marks = sorted.map((s) => ({
    id: s.id,
    label: String(s.value),
    value: s.value,
  }));

  return (
    <>
      <div className="cp-range-head cp-range-head--combined">
        <span className="cp-range-combined">
          <span className="cp-label">Data range:</span> {min} - {max}
        </span>
      </div>

      <div className="cp-track-area cp-track-area--steps">
        {marks.map((mark, i) => {
          const pct = stopPercent(mark.value, min, span);
          const isEnd = markAlign(i, marks.length) === "end";
          return (
            <div key={`mark-${mark.id}`} className="cp-track-mark" style={{ left: `${pct}%` }}>
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
          className={"cp-track" + (stepsStyle ? " cp-track--steps" : " cp-track--gradient")}
          style={{ background: trackBg }}
        >
          {marks.map((mark) => {
            const pct = stopPercent(mark.value, min, span);
            return (
              <span
                key={mark.id}
                className="cp-track-knob cp-track-knob--step"
                style={{ left: `${pct}%` }}
                aria-hidden="true"
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
            showValue
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
}: {
  color: string;
  setColor: (c: string) => void;
  variant?: "full" | "simple" | "swatch";
}) {
  const isSimple = variant === "simple";
  const isSwatch = variant === "swatch";
  const [selection] = usePaletteSelection();
  const [override, setOverride] = useState(false);
  const [style, setStyle] = useState<Style>("Single");
  const [distribution, setDistribution] = useState("Linear");
  const [opacity, setOpacity] = useState(100);
  const [gStops, setGStops] = useState<Stop[]>(() => gradientStops(selection.colors));
  const [sStops, setSStops] = useState<Stop[]>(() => stepStops(selection.colors));

  const paletteColors = selection.colors;
  const showSwatches = !override && (isSimple || isSwatch || style === "Single");
  const showPicker = override && (isSimple || isSwatch || style === "Single");

  useEffect(() => {
    setGStops(gradientStops(selection.colors));
    setSStops(stepStops(selection.colors));
  }, [selection.colors]);

  const stops = style === "Gradient" ? gStops : sStops;
  const setStops = style === "Gradient" ? setGStops : setSStops;

  const sorted = [...stops].sort((a, b) => a.value - b.value);
  const min = sorted[0]?.value ?? 0;
  const max = sorted[sorted.length - 1]?.value ?? 100;
  const span = Math.max(1, max - min);

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

  const updateStop = (next: Stop) => {
    setStops((list) => list.map((s) => (s.id === next.id ? next : s)));
    if (next.id === sorted[sorted.length - 1]?.id) setColor(next.color);
  };
  const removeStop = (id: number) => setStops((list) => (list.length > 2 ? list.filter((s) => s.id !== id) : list));
  const addStop = () => {
    const mid = Math.round((min + max) / 2);
    setStops((list) => [...list, { id: nextId(), value: mid, color: paletteColors[1] ?? paletteColors[0], opacity: 100 }]);
  };

  return (
    <div className={"cp" + (isSimple || isSwatch ? " cp--simple" : "") + (isSwatch ? " cp--swatch" : "")}>
      {!isSwatch && (
        <div className="cp-field">
          <div className="cp-field-head">
            <span className="cp-label">Color palette</span>
            {(isSimple || style === "Single") && (
              <OverrideButton on={override} onToggle={() => setOverride((v) => !v)} />
            )}
          </div>
          <PaletteSelector />
        </div>
      )}

      {isSwatch && (
        <div className="cp-swatch-line">
          {showSwatches && <SwatchPicker colors={paletteColors} color={color} onSelect={setColor} />}
          {showPicker && (
            <StopRow
              stop={{ id: 0, value: min, color, opacity }}
              showValue={false}
              removable={false}
              onChange={(s) => {
                setColor(s.color);
                setOpacity(s.opacity);
              }}
              onRemove={() => {}}
            />
          )}
          <OverrideButton on={override} onToggle={() => setOverride((v) => !v)} />
        </div>
      )}

      {!isSimple && !isSwatch && (
        <Field label="Palette type">
          <div className="cp-segmented">
            {(["Single", "Gradient", "Steps"] as Style[]).map((s) => {
              const Icon = s === "Single" ? SinglePillIcon : s === "Gradient" ? GradientPillIcon : StepsDotsIcon;
              return (
                <button
                  key={s}
                  type="button"
                  className={
                    "pg-btn pg-btn--outline pg-btn--icon-right cp-seg " +
                    (style === s ? "pg-btn--primary" : "pg-btn--secondary")
                  }
                  aria-pressed={style === s}
                  onClick={() => setStyle(s)}
                >
                  <span>{s}</span>
                  <Icon className="pg-btn__icon" width={16} height={16} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </Field>
      )}

      {!isSwatch && showSwatches && (
        <SwatchPicker colors={paletteColors} color={color} onSelect={setColor} />
      )}

      {!isSwatch && showPicker && (
        <StopRow
          stop={{ id: 0, value: min, color, opacity }}
          showValue={false}
          removable={false}
          onChange={(s) => {
            setColor(s.color);
            setOpacity(s.opacity);
          }}
          onRemove={() => {}}
        />
      )}

      {!isSimple && !isSwatch && style === "Gradient" && (
        <>
          <Field label="Distribution">
            <Dropdown
              value={distribution}
              onChange={setDistribution}
              options={["Linear", "Radial"].map((o) => ({ value: o, label: o }))}
            />
          </Field>
          <DataRangeEditor
            sorted={sorted}
            min={min}
            max={max}
            span={span}
            trackBg={trackBg}
            removable={stops.length > 2}
            onChange={updateStop}
            onRemove={removeStop}
          />
          <button type="button" className="cp-add" onClick={addStop}>
            <PlusIcon width={15} height={15} />
            <span>Add Another Stop</span>
          </button>
        </>
      )}

      {!isSimple && !isSwatch && style === "Steps" && (
        <>
          <DataRangeEditor
            sorted={sorted}
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
            <PlusIcon width={15} height={15} />
            <span>Add Another Stop</span>
          </button>
        </>
      )}
    </div>
  );
}
