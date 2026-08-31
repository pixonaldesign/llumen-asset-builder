import {
  useState,
  useRef,
  useCallback,
  useLayoutEffect,
  useEffect,
  useMemo,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  AlignBottomSimple,
  AlignLeftSimple,
  AlignRightSimple,
  AlignTopSimple,
  Info,
  Lock,
  LockOpen,
} from "@phosphor-icons/react";
import {
  CloseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  SearchIcon,
  RequiredIcon,
  FieldAlertIcon,
} from "./icons";
import { charts } from "./chartModel";
import type { Opt } from "./chartModel";
import {
  fieldsForVisual,
  isFeatureTabOn,
  isFieldVisible,
  settingsNavSections,
  subCategoriesForVisual,
  visualHasGradientAxis,
} from "./visualSettingsCatalog";
import ChartPreview from "./ChartPreview";
import ChartDataQueryPreview from "./ChartDataQueryPreview";
import DataSourceQueryPreview from "./DataSourceQueryPreview";
import ColorPalette, { CategoryColorMap, ColorPaletteProvider, PaletteSelector } from "./ColorPalette";
import ZoomScalingControl from "./ZoomScalingControl";
import { getSettingsTabIcon } from "./visualIcons";
import Dropdown from "./Dropdown";
import { derivePreviewSeries, mappedMeasureColumn } from "./derivePreviewSeries";
import { allColumnNames, defaultColumnForField, fieldOptionsFor, numericExtent, uniqueValues } from "./mockDataset";
import {
  DEFAULT_COLOR_MODE,
  DEFAULT_GRADIENT,
  DEFAULT_REPEATABLE,
  DEFAULT_ZOOM_SCALING,
  asColorMode,
  asGradient,
  asRepeatable,
  asStringArray,
  repeatableToStops,
  stopsToRepeatable,
  type GradientStop,
  type RepeatableRow,
} from "./previewTheme";
import DataSourceStep from "./DataSourceStep";
import FiltersStep from "./FiltersStep";
import DeepDiveStep from "./DeepDiveStep";
import AccessStep from "./AccessStep";
import GeneralInfoStep, { type GeneralInfo } from "./GeneralInfoStep";
import VisualTypePicker from "./VisualTypePicker";
import SelectedVisualBar from "./SelectedVisualBar";
import { visualTypeByChartId, visualTypeById } from "./visualCatalog";
import type { VisualType } from "./visualCatalog";

type VizPhase = "picker" | "settings";

type PreviewSize = "small" | "medium" | "large";

type PreviewMode = "visualization" | "data-query";

type WizardStepId =
  | "data-source"
  | "viz-mapping"
  | "filters"
  | "deep-dive"
  | "access"
  | "general-info";

const WIZARD_STEPS: { id: WizardStepId; label: string }[] = [
  { id: "data-source", label: "Data Source" },
  { id: "viz-mapping", label: "Visualization & Mapping" },
  { id: "filters", label: "Filters" },
  { id: "deep-dive", label: "Deep Dive" },
  { id: "access", label: "Access" },
  { id: "general-info", label: "General Info" },
];

function isValueFilled(o: Opt, value: unknown): boolean {
  if (o.type === "toggle") return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return !Number.isNaN(value);
  if (value && typeof value === "object") return Object.keys(value as object).length > 0;
  return value !== undefined && value !== null && value !== "";
}

function isOptSatisfied(o: Opt, getVal: (o: Opt) => unknown): boolean {
  if (o.level !== "required") return true;
  return isValueFilled(o, getVal(o));
}

function sectionHasErrors(fields: Opt[], getVal: (o: Opt) => unknown): boolean {
  return fields.some((o) => o.level === "required" && !isOptSatisfied(o, getVal));
}

type WizardStepState = "disabled" | "active" | "selected";

function wizardStepState(index: number, currentStep: number, maxUnlockedStep: number): WizardStepState {
  if (index > maxUnlockedStep) return "disabled";
  if (index === currentStep) return "selected";
  return "active";
}

const SAMPLE_COLUMNS = allColumnNames();

/* config keys & defaults ------------------------------------------------ */
type Config = Record<string, unknown>;
const keyOf = (o: Opt) => `${o.group}::${o.name}`;

type MarginsValue = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  locked: boolean;
};

const defaultMargins = (): MarginsValue => ({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  locked: true,
});

function parseMargins(v: unknown): MarginsValue {
  if (v && typeof v === "object" && "top" in v && "locked" in v) {
    const m = v as MarginsValue;
    return {
      top: Number(m.top) || 0,
      right: Number(m.right) || 0,
      bottom: Number(m.bottom) || 0,
      left: Number(m.left) || 0,
      locked: Boolean(m.locked),
    };
  }
  const n = Number(v) || 0;
  return { top: n, right: n, bottom: n, left: n, locked: true };
}

function splitMinMax(raw: unknown): { min: string; max: string } {
  const s = String(raw ?? "").trim();
  if (!s) return { min: "", max: "" };
  const m = s.match(/^(.*)\s*[/,–—-]\s*(.*)$/);
  if (m) return { min: m[1].trim(), max: m[2].trim() };
  return { min: s, max: "" };
}

function joinMinMax(min: string, max: string) {
  if (!min.trim() && !max.trim()) return "";
  return `${min.trim()} / ${max.trim()}`;
}

function isMinMaxNumber(o: Opt) {
  const n = o.name.toLowerCase();
  return n.includes("min/max") || (n.includes("range") && n.includes("min"));
}

function isMultiToggle(o: Opt, values: string[]) {
  return (
    o.name.toLowerCase().includes("show") ||
    o.name.toLowerCase() === "content" ||
    values.some((v) => v.toLowerCase().startsWith("show "))
  );
}

function multiChoices(o: Opt): string[] {
  return o.name === "Visible columns" ? SAMPLE_COLUMNS : o.values.length ? o.values : ["Field A", "Field B", "Field C"];
}

function defaultMulti(o: Opt): string[] {
  const values = multiChoices(o);
  if (isMultiToggle(o, values)) return [...values];
  if (o.name === "Visible columns") return values.slice(0, 4);
  return values.slice(0, Math.min(3, values.length));
}

function defaultColorList(o: Opt): Record<string, string> {
  const pal = ["#3FA7A0", "#73adf5", "#c6a7ff", "#ffd58a", "#f0888c", "#7ee0c0"];
  const n = o.name.toLowerCase();
  const keys = n.includes("status")
    ? uniqueValues("status")
    : n.includes("icon")
      ? uniqueValues("category")
      : uniqueValues("category");
  return Object.fromEntries(keys.map((k, i) => [k, pal[i % pal.length]]));
}

function isPaletteField(o: Opt): boolean {
  return o.type === "color" && o.name === "Palette" && (o.group === "Colors" || o.group === "Color");
}

function defaultSlider(o: Opt): number {
  const n = o.name.toLowerCase();
  if (n.includes("top n")) return 100;
  const range = o.desc.match(/(-?\d*\.?\d+)\s*[–—-]\s*(-?\d*\.?\d+)/);
  const def = o.desc.match(/Default\s+([\d.]+)/i);
  if (range && def) {
    const lo = parseFloat(range[1]);
    const hi = parseFloat(range[2]);
    const v = parseFloat(def[1]);
    if (hi !== lo) return Math.round(((v - lo) / (hi - lo)) * 100);
  }
  if (n.includes("opacity")) return 40;
  return 50;
}

function isZoomScalingField(o: Opt) {
  return /zoom scaling/i.test(o.name) || o.name === "Disc scaling";
}

function defaultFor(o: Opt): unknown {
  if (o.defaultValue !== undefined) return o.defaultValue;
  switch (o.type) {
    case "toggle":
      return o.def !== false;
    case "segmented":
      return o.values[0] ?? "";
    case "posgrid":
      return "top-left";
    case "slider":
      return defaultSlider(o);
    case "margins":
      return defaultMargins();
    case "number":
      return o.name.toLowerCase().includes("range") ? "" : "24";
    case "color":
      return isPaletteField(o)
        ? { ...DEFAULT_COLOR_MODE, stops: DEFAULT_COLOR_MODE.stops.map((s) => ({ ...s })) }
        : "#3FA7A0";
    case "colorList":
      return defaultColorList(o);
    case "colorPair":
      return { stroke: "#3FA7A0", fill: "#3FA7A0" };
    case "multi":
      return defaultMulti(o);
    case "repeatable":
      if (isZoomScalingField(o)) return { ...DEFAULT_ZOOM_SCALING, stops: DEFAULT_ZOOM_SCALING.stops.map((s) => ({ ...s })) };
      if (o.name === "Color thresholds" || o.name.toLowerCase().includes("status")) {
        return [
          { min: "", max: "", color: "#f87171", label: "At risk", opacity: 100 },
          { min: "", max: "", color: "#fbbf24", label: "Watch", opacity: 100 },
          { min: "", max: "", color: "#34d399", label: "On track", opacity: 100 },
        ];
      }
      return DEFAULT_REPEATABLE.map((r) => ({ ...r }));
    case "gradient":
      return DEFAULT_GRADIENT.map((r) => ({ ...r }));
    case "dropdown":
      return o.values[0] ?? "";
    case "field":
      if (o.level === "required") return defaultColumnForField(o.name);
      if (o.group === "KPI Display") {
        if (o.name === "KPI value field") return defaultColumnForField("Y axis") || "value";
        if (/unit/i.test(o.name)) return "unit";
      }
      if (o.group === "Status badge" && /color source/i.test(o.name)) {
        return defaultColumnForField("Y axis") || "value";
      }
      if (o.group === "Status badge" && o.name === "Column") {
        return defaultColumnForField("Status") || "status";
      }
      return "";
    case "text":
    default:
      return "";
  }
}

/* slider display value derived from the option's range description */
function sliderDisplay(o: Opt, pct: number) {
  const m = o.desc.match(/(-?\d*\.?\d+)\s*[–—-]\s*(-?\d*\.?\d+)/);
  if (!m) return `${pct}%`;
  const lo = parseFloat(m[1]);
  const hi = parseFloat(m[2]);
  const val = lo + (pct / 100) * (hi - lo);
  const unit = o.desc.includes("px") ? " px" : o.desc.includes("°") ? "°" : lo === 0 && hi === 100 ? "%" : "";
  const dec = hi <= 1 ? 2 : 0;
  return `${val.toFixed(dec)}${unit}`;
}

/* ---------- low-level interactive primitives ---------- */
function Switch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <span
      role="switch"
      aria-checked={value}
      className={"ia-mini-switch" + (value ? " on" : "")}
      onClick={() => onChange(!value)}
    />
  );
}

function Segmented({ values, value, onChange }: { values: string[]; value: string; onChange: (v: string) => void }) {
  const vals = (values.length ? values : ["One", "Two", "Three"]).slice(0, 3);
  const cur = vals.includes(value) ? value : vals[0];
  return (
    <div className="ia-segmented">
      {vals.map((v) => (
        <span key={v} className={v === cur ? "active" : ""} onClick={() => onChange(v)}>
          {v}
        </span>
      ))}
    </div>
  );
}

const PLACEMENTS = [
  { value: "top-left", row: 0, col: 0 },
  { value: "top-right", row: 0, col: 1 },
  { value: "bottom-left", row: 1, col: 0 },
  { value: "bottom-right", row: 1, col: 1 },
] as const;

const MARGIN_SIDES = [
  { key: "left" as const, label: "Left margin", Icon: AlignLeftSimple },
  { key: "top" as const, label: "Top margin", Icon: AlignTopSimple },
  { key: "right" as const, label: "Right margin", Icon: AlignRightSimple },
  { key: "bottom" as const, label: "Bottom margin", Icon: AlignBottomSimple },
];

function MarginsController({
  value,
  onChange,
}: {
  value: MarginsValue;
  onChange: (v: MarginsValue) => void;
}) {
  const setSide = (side: keyof Omit<MarginsValue, "locked">, raw: string) => {
    const n = raw === "" || raw === "-" ? 0 : Number(raw);
    const next = Number.isFinite(n) ? n : 0;
    if (value.locked) {
      onChange({ top: next, right: next, bottom: next, left: next, locked: true });
      return;
    }
    onChange({ ...value, [side]: next });
  };

  const toggleLock = () => {
    if (value.locked) {
      onChange({ ...value, locked: false });
      return;
    }
    const sync = value.top;
    onChange({ top: sync, right: sync, bottom: sync, left: sync, locked: true });
  };

  const LockIcon = value.locked ? Lock : LockOpen;

  return (
    <div className="ia-margins">
      {MARGIN_SIDES.map(({ key, label, Icon }) => (
        <label key={key} className="ia-margins__cell">
          <Icon className="ia-margins__icon" size={16} weight="regular" aria-hidden="true" />
          <input
            className="ia-margins__input"
            type="number"
            inputMode="numeric"
            aria-label={label}
            value={value[key]}
            onChange={(e) => setSide(key, e.target.value)}
          />
        </label>
      ))}
      <button
        type="button"
        className={"ia-margins__link" + (value.locked ? " ia-margins__link--on" : "")}
        aria-label={value.locked ? "Unlock margins" : "Lock margins together"}
        aria-pressed={value.locked}
        onClick={toggleLock}
      >
        <LockIcon size={16} weight="regular" aria-hidden="true" />
      </button>
    </div>
  );
}

function PlacementPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="ia-placement" role="radiogroup" aria-label="Legend placement">
      {PLACEMENTS.map((p) => (
        <button
          key={p.value}
          type="button"
          role="radio"
          aria-checked={value === p.value}
          aria-label={`Legend ${p.value}`}
          className={"ia-placement-dot" + (value === p.value ? " active" : "")}
          onClick={() => onChange(p.value)}
        />
      ))}
    </div>
  );
}

function Chip({ label, selected, onToggle }: { label: string; selected: boolean; onToggle: () => void }) {
  return (
    <span className={"ia-chip" + (selected ? " selected" : "")} onClick={onToggle}>
      {label}
    </span>
  );
}

const CHIP_OVERFLOW_AT = 8;

function OverflowChipSelect({
  values,
  selected,
  onChange,
}: {
  values: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const remaining = values.filter((v) => !selected.includes(v));
  const compact = values.length > CHIP_OVERFLOW_AT;
  const shown = compact ? selected : values;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 240 });
  const moreRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const syncMenuPosition = useCallback(() => {
    const el = moreRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.max(240, rect.width);
    let left = rect.left;
    left = Math.min(left, window.innerWidth - width - 8);
    left = Math.max(8, left);
    setMenuPos({ top: rect.bottom + 8, left, width });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setSearch("");
  }, []);

  useEffect(() => {
    if (!open) return;
    syncMenuPosition();
    searchRef.current?.focus();
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (moreRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
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
  }, [open, syncMenuPosition, close]);

  useEffect(() => {
    if (open && remaining.length === 0) close();
  }, [open, remaining.length, close]);

  const query = search.trim().toLowerCase();
  const filtered = query ? remaining.filter((v) => v.toLowerCase().includes(query)) : remaining;

  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  };

  const add = (v: string) => {
    if (!selected.includes(v)) onChange([...selected, v]);
  };

  return (
    <div className="ia-chips">
      {shown.map((v) => (
        <Chip
          key={v}
          label={v}
          selected={compact || selected.includes(v)}
          onToggle={() => toggle(v)}
        />
      ))}
      {compact && remaining.length > 0 && (
        <>
          <button
            ref={moreRef}
            type="button"
            className={"ia-chip ia-chip--more" + (open ? " is-open" : "")}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-label={`Add ${remaining.length} more columns`}
            onClick={() => {
              if (open) {
                close();
                return;
              }
              setSearch("");
              syncMenuPosition();
              setOpen(true);
            }}
          >
            +{remaining.length}
          </button>
          {open &&
            createPortal(
              <div
                ref={menuRef}
                className="cp-picker-menu cp-picker-menu--flyout ia-chips-menu"
                role="listbox"
                aria-multiselectable="true"
                aria-label="Remaining columns"
                style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
              >
                <div className="cp-picker-search">
                  <input
                    ref={searchRef}
                    type="search"
                    placeholder="Search columns"
                    value={search}
                    aria-label="Search columns"
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Escape") {
                        close();
                        return;
                      }
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      if (filtered[0]) add(filtered[0]);
                    }}
                  />
                  <SearchIcon className="cp-picker-search-ico" width={14} height={14} />
                </div>
                <div className="cp-picker-list">
                  {filtered.map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="option"
                      aria-selected={false}
                      className="cp-picker-row"
                      onClick={() => add(v)}
                    >
                      <span className="cp-picker-row-name">{v}</span>
                    </button>
                  ))}
                  {!filtered.length && <div className="cp-picker-empty">No columns found</div>}
                </div>
              </div>,
              document.body,
            )}
        </>
      )}
    </div>
  );
}

function FieldInfoTip({ desc }: { desc: string }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const syncPosition = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({
      top: rect.top,
      left: rect.left + rect.width / 2,
    });
  }, []);

  const show = () => {
    syncPosition();
    setOpen(true);
  };

  const hide = () => setOpen(false);

  if (!desc.trim()) return null;

  return (
    <>
      <span className="ia-field-info">
        <button
          ref={btnRef}
          type="button"
          className="ia-field-info__btn"
          aria-label={desc}
          onMouseEnter={show}
          onMouseLeave={hide}
          onFocus={show}
          onBlur={hide}
        >
          <Info className="ia-field-info__icon" size={16} weight="fill" aria-hidden="true" />
        </button>
      </span>
      {open &&
        createPortal(
          <span
            className="ia-field-info__tip ia-field-info__tip--flyout"
            role="tooltip"
            style={{ top: coords.top, left: coords.left }}
          >
            {desc}
          </span>,
          document.body,
        )}
    </>
  );
}

/* ---------- control renderer (one per option type) ---------- */
function Control({
  o,
  getVal,
  setVal,
}: {
  o: Opt;
  getVal: (o: Opt) => unknown;
  setVal: (o: Opt, v: unknown) => void;
}) {
  switch (o.type) {
    case "segmented":
      return <Segmented values={o.values} value={String(getVal(o))} onChange={(v) => setVal(o, v)} />;

    case "posgrid":
      return <PlacementPicker value={String(getVal(o))} onChange={(v) => setVal(o, v)} />;

    case "slider": {
      const pct = Number(getVal(o));
      const thumb = 36;
      return (
        <div className="ia-slider">
          <div className="ia-slider-track">
            <div
              className="ia-slider-fill"
              style={{ width: `calc(${thumb}px + (100% - ${thumb}px) * ${Math.max(0, Math.min(100, pct))} / 100)` }}
            >
              <span className="ia-slider-thumb" aria-hidden="true" />
            </div>
            <input
              type="range"
              className="ia-range"
              min={0}
              max={100}
              value={pct}
              aria-label={o.name}
              onChange={(e) => setVal(o, Number(e.target.value))}
            />
          </div>
          <div className="ia-slider-val">{sliderDisplay(o, pct)}</div>
        </div>
      );
    }

    case "margins":
      return (
        <MarginsController
          value={parseMargins(getVal(o))}
          onChange={(v) => setVal(o, v)}
        />
      );

    case "number": {
      if (isMinMaxNumber(o)) {
        const { min, max } = splitMinMax(getVal(o));
        return (
          <div className="ia-two-col ia-minmax">
            <div className="ia-surface ia-text">
              <input
                value={min}
                placeholder="Min"
                aria-label="Min"
                inputMode="decimal"
                onChange={(e) => setVal(o, joinMinMax(e.target.value, max))}
              />
            </div>
            <div className="ia-surface ia-text">
              <input
                value={max}
                placeholder="Max"
                aria-label="Max"
                inputMode="decimal"
                onChange={(e) => setVal(o, joinMinMax(min, e.target.value))}
              />
            </div>
          </div>
        );
      }
      const v = String(getVal(o));
      const bump = (d: number) => setVal(o, String((Number(v) || 0) + d));
      return (
        <div className="ia-surface ia-number">
          <input value={v} onChange={(e) => setVal(o, e.target.value)} />
          <div className="ia-stepper">
            <span onClick={() => bump(-1)}>−</span>
            <span onClick={() => bump(1)}>+</span>
          </div>
        </div>
      );
    }

    case "text":
      return (
        <div className="ia-surface ia-text">
          <input
            value={String(getVal(o))}
            placeholder={
              o.name.toLowerCase().includes("format")
                ? ".0f"
                : o.name === "Template"
                  ? "{status} · {value}"
                  : o.name === "Fallback"
                    ? "Constant text"
                    : o.name === "X axis label" || o.name === "Y axis label" || o.group === "KPI Display"
                      ? o.name
                      : "Manual value"
            }
            onChange={(e) => setVal(o, e.target.value)}
          />
        </div>
      );

    case "color":
      if (isPaletteField(o)) {
        const current = asColorMode(getVal(o));
        return (
          <ColorPalette
            variant="full"
            color={current.color}
            setColor={() => {}}
            value={current}
            onChange={(next) => setVal(o, next)}
            styles={o.group === "Color" ? ["Single", "Gradient", "Steps"] : undefined}
          />
        );
      }
      return <ColorPalette color={String(getVal(o))} setColor={(c) => setVal(o, c)} variant="simple" />;

    case "colorPair": {
      const pair = (getVal(o) as { stroke?: string; fill?: string }) ?? {};
      return (
        <div className="ia-color-pair">
          <div className="ia-color-list__palette">
            <span className="cp-label">Color palette</span>
            <PaletteSelector />
          </div>
          <label className="ia-color-pair__item">
            <span>Stroke</span>
            <ColorPalette
              color={pair.stroke || "#2de8c8"}
              setColor={(c) => setVal(o, { ...pair, stroke: c })}
              variant="swatch"
            />
          </label>
          <label className="ia-color-pair__item">
            <span>Fill</span>
            <ColorPalette
              color={pair.fill || "#2de8c8"}
              setColor={(c) => setVal(o, { ...pair, fill: c })}
              variant="swatch"
            />
          </label>
        </div>
      );
    }

    case "colorList": {
      const map = (getVal(o) as Record<string, string>) ?? {};
      const entries = Object.keys(map).length ? Object.entries(map) : Object.entries(defaultColorList(o));
      return (
        <div className="ia-surface ia-color-list">
          <div className="ia-color-list__palette">
            <span className="cp-label">Color palette</span>
            <PaletteSelector />
          </div>
          {entries.map(([label, color]) => (
            <div key={label} className="ia-color-list__row">
              <span className="ia-color-list__label">{label}</span>
              <ColorPalette
                color={color}
                setColor={(c) => setVal(o, { ...map, [label]: c })}
                variant="swatch"
              />
            </div>
          ))}
        </div>
      );
    }

    case "multi": {
      const values = multiChoices(o);
      const selected = asStringArray(getVal(o));
      const toggle = (v: string) =>
        setVal(o, selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
      if (isMultiToggle(o, values))
        return (
          <>
            {values.map((v) => (
              <div key={v} className="ia-toggle-flat">
                <div className="ia-toggle-line">
                  <strong>{v}</strong>
                  <Switch value={selected.includes(v)} onChange={() => toggle(v)} />
                </div>
              </div>
            ))}
          </>
        );
      return (
        <OverflowChipSelect values={values} selected={selected} onChange={(next) => setVal(o, next)} />
      );
    }

    case "repeatable": {
      if (isZoomScalingField(o)) {
        return <ZoomScalingControl value={getVal(o)} onChange={(next) => setVal(o, next)} />;
      }
      const rows = asRepeatable(getVal(o));
      const update = (next: RepeatableRow[]) => setVal(o, next);
      if (o.name === "Color thresholds") {
        const current = {
          ...DEFAULT_COLOR_MODE,
          style: "Steps" as const,
          color: rows[rows.length - 1]?.color ?? DEFAULT_COLOR_MODE.color,
          stops: repeatableToStops(rows),
        };
        return (
          <ColorPalette
            variant="steps"
            color={current.color}
            setColor={() => {}}
            value={current}
            onChange={(next) => update(stopsToRepeatable(next.stops, rows))}
          />
        );
      }
      if (o.name === "Status → tile accent color") {
        return <CategoryColorMap rows={rows} onChange={update} />;
      }
      return (
        <div className="ia-surface ia-repeat">
          {rows.map((row, i) => (
            <div key={i} className="ia-rule ia-rule--edit">
              <input
                className="ia-rule-input"
                value={row.label}
                aria-label="Label"
                onChange={(e) => {
                  const next = rows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r));
                  update(next);
                }}
              />
              <input
                className="ia-rule-input ia-rule-input--num"
                value={row.min}
                aria-label="Min"
                onChange={(e) => {
                  const next = rows.map((r, j) => (j === i ? { ...r, min: e.target.value } : r));
                  update(next);
                }}
              />
              <input
                className="ia-rule-input ia-rule-input--num"
                value={row.max}
                aria-label="Max"
                onChange={(e) => {
                  const next = rows.map((r, j) => (j === i ? { ...r, max: e.target.value } : r));
                  update(next);
                }}
              />
              <ColorPalette
                color={row.color}
                setColor={(c) => update(rows.map((r, j) => (j === i ? { ...r, color: c } : r)))}
                variant="swatch"
              />
              <span
                className="ia-rule-x"
                role="button"
                onClick={() => update(rows.filter((_, j) => j !== i))}
              >
                ×
              </span>
            </div>
          ))}
          <button
            type="button"
            className="cp-add"
            onClick={() =>
              update([
                ...rows,
                {
                  min: String(rows.length * 50),
                  max: String(rows.length * 50 + 50),
                  color: ["#3FA7A0", "#73adf5", "#c6a7ff", "#f0888c"][rows.length % 4],
                  label: `Stop ${rows.length + 1}`,
                },
              ])
            }
          >
            Add row
          </button>
        </div>
      );
    }

    case "gradient": {
      const stops = asGradient(getVal(o));
      const update = (next: GradientStop[]) => setVal(o, next);
      return (
        <div className="ia-surface ia-gradient-edit">
          <div
            className="ia-gradient"
            style={{
              background: `linear-gradient(90deg, ${stops
                .map((s) => `${s.color} ${s.at}%`)
                .join(", ")})`,
            }}
          />
          {stops.map((stop, i) => (
            <div key={i} className="ia-rule ia-rule--edit">
              <input
                className="ia-rule-input ia-rule-input--num"
                type="number"
                min={0}
                max={100}
                value={stop.at}
                aria-label="Stop position"
                onChange={(e) =>
                  update(stops.map((s, j) => (j === i ? { ...s, at: Number(e.target.value) } : s)))
                }
              />
              <ColorPalette
                color={stop.color}
                setColor={(c) => update(stops.map((s, j) => (j === i ? { ...s, color: c } : s)))}
                variant="swatch"
              />
              <span
                className="ia-rule-x"
                role="button"
                onClick={() => update(stops.filter((_, j) => j !== i))}
              >
                ×
              </span>
            </div>
          ))}
          <button
            type="button"
            className="cp-add"
            onClick={() =>
              update([...stops, { color: "#ffd58a", at: Math.min(100, (stops[stops.length - 1]?.at ?? 0) + 25) }])
            }
          >
            Add stop
          </button>
        </div>
      );
    }

    case "dropdown":
    case "field":
    default: {
      const options = o.type === "field" ? fieldOptionsFor(o.name) : o.values.map((v) => ({ value: v, label: v }));
      const list = options.length ? options : [{ value: `Set ${o.name}`, label: `Set ${o.name}` }];
      return (
        <Dropdown
          value={String(getVal(o))}
          onChange={(v) => setVal(o, v)}
          allowEmpty={o.type === "field" && o.level !== "required"}
          searchable={o.type === "field"}
          options={list}
        />
      );
    }
  }
}

/* ---------- field block (name + level icon + control) ---------- */
function FieldBlock({
  o,
  getVal,
  setVal,
}: {
  o: Opt;
  getVal: (o: Opt) => unknown;
  setVal: (o: Opt, v: unknown) => void;
}) {
  if (isPaletteField(o)) {
    return (
      <div className="ia-color-mode">
        <Control o={o} getVal={getVal} setVal={setVal} />
      </div>
    );
  }
  if (o.type === "toggle") {
    return (
      <div className="ia-toggle-flat">
        <div className="ia-toggle-line">
          <div className="ia-toggle-line-label">
            <strong>{o.name}</strong>
            <FieldInfoTip desc={o.desc} />
          </div>
          <Switch value={Boolean(getVal(o))} onChange={(v) => setVal(o, v)} />
        </div>
      </div>
    );
  }
  if (o.type === "multi" && isMultiToggle(o, multiChoices(o))) {
    return <Control o={o} getVal={getVal} setVal={setVal} />;
  }
  if (o.type === "posgrid") {
    return (
      <div className="ia-toggle-flat">
        <div className="ia-toggle-line">
          <div className="ia-toggle-line-label">
            <strong>{o.name}</strong>
            <FieldInfoTip desc={o.desc} />
          </div>
          <PlacementPicker value={String(getVal(o))} onChange={(v) => setVal(o, v)} />
        </div>
      </div>
    );
  }
  return (
    <div className="ia-field">
      <div className="ia-field-top">
        <div className="ia-field-label">
          <div className="ia-field-name">{o.name}</div>
          <FieldInfoTip desc={o.desc} />
        </div>
        {o.level === "required" && (
          <div className="ia-pill ia-pill--required">
            <RequiredIcon width={12} height={12} />
            <span>required</span>
          </div>
        )}
      </div>
      <Control o={o} getVal={getVal} setVal={setVal} />
    </div>
  );
}

/* Pair adjacent X / Y mapping fields and min / max siblings so they render side-by-side. */
const isXField = (o: Opt) => /^x[\s-]?(axis|value|category)\b/i.test(o.name);
const isYField = (o: Opt) => /^y[\s-]?(axis|value|category)\b/i.test(o.name);
const minMaxPairKey = (name: string) =>
  name.replace(/\bmin(?:imum)?\b/gi, "§").replace(/\bmax(?:imum)?\b/gi, "§");
const isMinName = (name: string) => /\bmin(?:imum)?\b/i.test(name) && !/\bmax(?:imum)?\b/i.test(name);
const isMaxName = (name: string) => /\bmax(?:imum)?\b/i.test(name) && !/\bmin(?:imum)?\b/i.test(name);
function pairAxes(items: Opt[]): (Opt | [Opt, Opt])[] {
  const rows: (Opt | [Opt, Opt])[] = [];
  for (let i = 0; i < items.length; i++) {
    const cur = items[i];
    const next = items[i + 1];
    if (next && isXField(cur) && isYField(next)) {
      rows.push([cur, next]);
      i++;
    } else if (next && isMinName(cur.name) && isMaxName(next.name) && minMaxPairKey(cur.name) === minMaxPairKey(next.name)) {
      rows.push([cur, next]);
      i++;
    } else if (next && cur.name === "Wind speed" && next.name === "Band") {
      rows.push([cur, next]);
      i++;
    } else {
      rows.push(cur);
    }
  }
  return rows;
}

function renderFieldRows(
  rows: (Opt | [Opt, Opt])[],
  getVal: (o: Opt) => unknown,
  setVal: (o: Opt, v: unknown) => void,
) {
  return rows.map((row) =>
    Array.isArray(row) ? (
      <div className="ia-two-col" key={row[0].group + row[0].name}>
        <FieldBlock o={row[0]} getVal={getVal} setVal={setVal} />
        <FieldBlock o={row[1]} getVal={getVal} setVal={setVal} />
      </div>
    ) : (
      <FieldBlock key={row.group + row.name} o={row} getVal={getVal} setVal={setVal} />
    ),
  );
}

function visibleWhenKey(o: Opt): string | null {
  if (!o.visibleWhen) return null;
  const expected = o.visibleWhen.is;
  return `${o.visibleWhen.group}::${o.visibleWhen.name}::${Array.isArray(expected) ? expected.join("|") : expected}`;
}

type RevealGroup = { key: string; fields: Opt[] };
type FieldCluster = { parent: Opt | null; reveals: RevealGroup[] };

function clusterFields(items: Opt[]): FieldCluster[] {
  const clusters: FieldCluster[] = [];
  let i = 0;
  while (i < items.length) {
    const o = items[i];
    if (o.visibleWhen) {
      const key = visibleWhenKey(o)!;
      const fields: Opt[] = [];
      while (i < items.length && visibleWhenKey(items[i]) === key) fields.push(items[i++]);
      clusters.push({ parent: null, reveals: [{ key, fields }] });
      continue;
    }
    i += 1;
    const reveals: RevealGroup[] = [];
    while (i < items.length && items[i].visibleWhen?.group === o.group && items[i].visibleWhen?.name === o.name) {
      const key = visibleWhenKey(items[i])!;
      const fields: Opt[] = [];
      while (i < items.length && visibleWhenKey(items[i]) === key) fields.push(items[i++]);
      reveals.push({ key, fields });
    }
    clusters.push({ parent: o, reveals });
  }
  return clusters;
}

function RevealPanel({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  const inertProps = { inert: !open || undefined } as HTMLAttributes<HTMLDivElement>;
  return (
    <div className={"ia-reveal" + (open ? " is-open" : "")} aria-hidden={!open} {...inertProps}>
      <div className="ia-reveal__inner">{children}</div>
    </div>
  );
}

function fieldClusterNodes(
  items: Opt[],
  getVal: (o: Opt) => unknown,
  setVal: (o: Opt, v: unknown) => void,
  getValByKey: (group: string, name: string) => unknown,
): ReactNode[] {
  const clusters = clusterFields(items);
  const nodes: ReactNode[] = [];
  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];
    const next = clusters[i + 1];
    if (
      cluster.parent &&
      !cluster.reveals.length &&
      next?.parent &&
      !next.reveals.length &&
      isXField(cluster.parent) &&
      isYField(next.parent)
    ) {
      nodes.push(
        <div className="ia-two-col" key={cluster.parent.group + cluster.parent.name}>
          <FieldBlock o={cluster.parent} getVal={getVal} setVal={setVal} />
          <FieldBlock o={next.parent} getVal={getVal} setVal={setVal} />
        </div>,
      );
      i += 1;
      continue;
    }
    const reveals = cluster.reveals.map((group) => (
      <RevealPanel key={group.key} open={isFieldVisible(group.fields[0], getValByKey)}>
        {renderFieldRows(pairAxes(group.fields), getVal, setVal)}
      </RevealPanel>
    ));
    if (!cluster.parent) {
      nodes.push(<div key={cluster.reveals[0]?.key ?? i}>{reveals}</div>);
      continue;
    }
    if (!cluster.reveals.length) {
      nodes.push(<FieldBlock key={cluster.parent.group + cluster.parent.name} o={cluster.parent} getVal={getVal} setVal={setVal} />);
      continue;
    }
    nodes.push(
      <div className="ia-field-cluster" key={cluster.parent.group + cluster.parent.name}>
        <FieldBlock o={cluster.parent} getVal={getVal} setVal={setVal} />
        {reveals}
      </div>,
    );
  }
  return nodes;
}

/* ---------- group card ---------- */
function GroupCard({
  items,
  advancedOpen,
  getVal,
  setVal,
  getValByKey,
}: {
  items: Opt[];
  advancedOpen: boolean;
  getVal: (o: Opt) => unknown;
  setVal: (o: Opt, v: unknown) => void;
  getValByKey: (group: string, name: string) => unknown;
}) {
  const regular = items.filter((o) => o.level !== "advanced");
  const advanced = items.filter((o) => o.level === "advanced");

  return (
    <section className="ia-group">
      <div className="ia-card-fields">
        {fieldClusterNodes(regular, getVal, setVal, getValByKey)}
        {advancedOpen && advanced.length > 0 && (
          <div className="ia-advanced">
            {fieldClusterNodes(advanced, getVal, setVal, getValByKey)}
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------- modal ---------- */
const WIZARD_PROGRESS_KEY = "llumen.dev.wizard-progress";

function readWizardProgress(): { currentStep?: number; maxUnlockedStep?: number } {
  try {
    return JSON.parse(sessionStorage.getItem(WIZARD_PROGRESS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export default function EditComponentModal({
  onClose,
  componentName,
  componentCategory,
  startAtVisualPicker = false,
  creating = false,
}: {
  onClose?: () => void;
  componentName?: string;
  componentCategory?: string;
  startAtVisualPicker?: boolean;
  creating?: boolean;
}) {
  const [restoredWizardProgress] = useState(readWizardProgress);
  const [activeChart, setActiveChart] = useState("bar");
  const [selectedVisualId, setSelectedVisualId] = useState<string | null>(
    startAtVisualPicker ? null : "vertical-bar",
  );
  const [vizPhase, setVizPhase] = useState<VizPhase>(startAtVisualPicker ? "picker" : "settings");
  const [activeSubCategory, setActiveSubCategory] = useState("Mapping");
  const [currentStep, setCurrentStep] = useState(
    restoredWizardProgress.currentStep ?? (startAtVisualPicker ? 0 : 1),
  );
  const [maxUnlockedStep, setMaxUnlockedStep] = useState(
    restoredWizardProgress.maxUnlockedStep ?? (startAtVisualPicker ? 0 : 1),
  );
  const [query, setQuery] = useState("");
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);
  const [size, setSize] = useState<PreviewSize>("medium");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("visualization");
  const [config, setConfig] = useState<Config>({});
  const [dataSourceConfigured, setDataSourceConfigured] = useState(false);
  const [dataSourceTypeSelected, setDataSourceTypeSelected] = useState(false);
  const [dataSourceQuery, setDataSourceQuery] = useState("");
  const [dataSourceLoading, setDataSourceLoading] = useState(false);
  const [generalInfo, setGeneralInfo] = useState<GeneralInfo>({
    name: componentName ?? "",
    description: "",
    insight: "",
    location: [],
    tags: [],
    updateFrequency: "",
    customUpdateFrequency: "",
    scheduleAutoRefresh: false,
    category: componentCategory ?? "",
  });

  const chart = charts[activeChart];
  const selectedVisual = selectedVisualId ? visualTypeById(selectedVisualId) : null;
  const displayVisual = selectedVisual ?? visualTypeByChartId(activeChart);
  const displayVisualId = displayVisual?.id ?? "vertical-bar";

  const visualFields = useMemo(() => fieldsForVisual(displayVisualId), [displayVisualId]);
  const subCategories = useMemo(() => subCategoriesForVisual(displayVisualId), [displayVisualId]);
  const navSections = useMemo(() => settingsNavSections(displayVisualId), [displayVisualId]);

  useEffect(() => {
    sessionStorage.setItem(
      WIZARD_PROGRESS_KEY,
      JSON.stringify({ currentStep, maxUnlockedStep }),
    );
  }, [currentStep, maxUnlockedStep]);

  useEffect(() => {
    if (!subCategories.includes(activeSubCategory)) {
      setActiveSubCategory(subCategories[0] ?? "Mapping");
    }
  }, [displayVisualId, subCategories, activeSubCategory]);

  useEffect(() => {
    let handledOnKeyDown = false;
    const isAdvancedShortcut = (e: KeyboardEvent) => {
      const isO = e.code === "KeyO" || e.key === "o" || e.key === "O" || e.key === "\u000f";
      if (!isO) return false;
      const cmd = e.metaKey || e.getModifierState("Meta");
      const ctrl = e.ctrlKey || e.getModifierState("Control");
      return cmd && ctrl;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isAdvancedShortcut(e) || e.repeat) return;
      e.preventDefault();
      e.stopPropagation();
      handledOnKeyDown = true;
      setAdvancedSettingsOpen((open) => !open);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const isO = e.code === "KeyO" || e.key === "o" || e.key === "O" || e.key === "\u000f";
      if (!isO) return;
      if (handledOnKeyDown) {
        handledOnKeyDown = false;
        return;
      }
      if (!isAdvancedShortcut(e)) return;
      e.preventDefault();
      e.stopPropagation();
      setAdvancedSettingsOpen((open) => !open);
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
    };
  }, []);

  const getVal = (o: Opt) => {
    const v = config[keyOf(o)];
    if (o.type === "field" && o.level === "required" && !isValueFilled(o, v)) {
      return defaultFor(o);
    }
    return v === undefined ? defaultFor(o) : v;
  };
  const setVal = (o: Opt, v: unknown) => setConfig((c) => ({ ...c, [keyOf(o)]: v }));

  const cfg = (group: string, name: string, fallback: unknown) => {
    const field = visualFields.find((o) => o.group === group && o.name === name);
    if (field) return getVal(field);
    const v = config[`${group}::${name}`];
    return v === undefined ? fallback : v;
  };

  const getValByKey = (group: string, name: string) => {
    const field = visualFields.find((o) => o.group === group && o.name === name);
    if (!field) return "";
    return getVal(field);
  };

  const tabFields = visualFields.filter((o) => {
    if (o.group !== activeSubCategory) return false;
    if (query && !`${o.name} ${o.desc}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const mappingFields = visualFields.filter((o) => o.group === "Mapping");

  const resolvedConfig = useMemo(() => {
    const next: Config = { ...config };
    for (const o of visualFields) {
      const k = keyOf(o);
      if (
        next[k] === undefined ||
        (o.type === "field" && o.level === "required" && !isValueFilled(o, next[k]))
      ) {
        next[k] = defaultFor(o);
      }
    }
    return next;
  }, [config, visualFields]);

  const previewSeries = useMemo(
    () =>
      derivePreviewSeries({
        visualId: displayVisualId,
        chartId: activeChart,
        config: resolvedConfig,
        title: generalInfo.name,
        insight: generalInfo.insight || generalInfo.description,
      }),
    [
      displayVisualId,
      activeChart,
      resolvedConfig,
      generalInfo.name,
      generalInfo.description,
      generalInfo.insight,
    ],
  );

  const colorDataRange = useMemo(
    () => numericExtent(mappedMeasureColumn(resolvedConfig)),
    [resolvedConfig],
  );

  const goNext = () => {
    if (currentStep >= WIZARD_STEPS.length - 1) return;
    const next = currentStep + 1;
    setCurrentStep(next);
    setMaxUnlockedStep((m) => Math.max(m, next));
  };

  const goPrev = () => {
    if (currentStep <= 0) return;
    setCurrentStep(currentStep - 1);
  };

  const handlePrev = () => {
    if (isVizStep && vizPhase === "settings") {
      setVizPhase("picker");
      return;
    }
    goPrev();
  };

  const handleNext = () => {
    if (WIZARD_STEPS[currentStep]?.id === "general-info") {
      if (
        !generalInfo.name.trim() ||
        !generalInfo.description.trim() ||
        !generalInfo.tags.length
      ) {
        return;
      }
      onClose?.();
      return;
    }
    if (isVizStep && vizPhase === "settings" && sectionHasErrors(mappingFields, getVal)) {
      return;
    }
    goNext();
  };

  const selectVisual = (visual: VisualType) => {
    setSelectedVisualId(visual.id);
    setActiveChart(visual.chartId);
    setVizPhase("settings");
    const requiredMaps = fieldsForVisual(visual.id).filter(
      (o) => o.group === "Mapping" && o.level === "required" && o.type === "field",
    );
    setConfig((c) => {
      const next = { ...c };
      for (const o of requiredMaps) {
        const k = keyOf(o);
        if (!isValueFilled(o, next[k])) next[k] = defaultColumnForField(o.name);
      }
      return next;
    });
  };

  const returnToVisualPicker = () => setVizPhase("picker");

  const selectStep = (index: number) => {
    if (index > maxUnlockedStep) return;
    setCurrentStep(index);
  };

  const wizardStepId = WIZARD_STEPS[currentStep]?.id ?? "viz-mapping";
  const isDataSourceStep = wizardStepId === "data-source";
  const isVizStep = wizardStepId === "viz-mapping";
  const isFiltersStep = wizardStepId === "filters";
  const isDeepDiveStep = wizardStepId === "deep-dive";
  const isAccessStep = wizardStepId === "access";
  const isGeneralInfoStep = wizardStepId === "general-info";
  const isDataSourcePicker = isDataSourceStep && !dataSourceTypeSelected;
  const isPreviewVizOnly = isAccessStep || isGeneralInfoStep;
  const isVizPicker = isVizStep && vizPhase === "picker";
  const isVizSettings = isVizStep && vizPhase === "settings";
  const mappingIncomplete = sectionHasErrors(mappingFields, getVal);
  const displayVisualLabel = displayVisual?.label ?? chart.name;
  const displayVisualCategory = displayVisual?.category ?? "chart";
  const showChartPreview = !isDataSourceStep && !isDeepDiveStep && !isVizPicker;

  const stepperRef = useRef<HTMLElement>(null);
  const stepRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [stepGlow, setStepGlow] = useState({ x: 0, width: 0 });

  const updateStepGlow = useCallback(() => {
    const stepper = stepperRef.current;
    const step = stepRefs.current[currentStep];
    if (!stepper || !step) return;
    const stepperRect = stepper.getBoundingClientRect();
    const stepRect = step.getBoundingClientRect();
    setStepGlow({
      x: stepRect.left - stepperRect.left,
      width: stepRect.width,
    });
  }, [currentStep]);

  useLayoutEffect(() => {
    updateStepGlow();
    const stepper = stepperRef.current;
    if (!stepper) return;
    const ro = new ResizeObserver(updateStepGlow);
    ro.observe(stepper);
    window.addEventListener("resize", updateStepGlow);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateStepGlow);
    };
  }, [updateStepGlow]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <ColorPaletteProvider dataRange={colorDataRange} hideGradientAxis={!visualHasGradientAxis(displayVisualId)}>
      <div className="modal">
        {/* Header */}
        <header className="modal__header">
          <div className="modal__heading">
            <h2 className="modal__title">{creating ? "Create Asset" : "Edit Asset"}</h2>
            {(generalInfo.name || generalInfo.category) && (
              <p className="modal__subtitle">
                {[generalInfo.name, generalInfo.category].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <div className="modal__header-actions">
            <button
              type="button"
              className={"modal__dev-hint" + (advancedSettingsOpen ? " is-on" : "")}
              onClick={() => setAdvancedSettingsOpen((open) => !open)}
            >
              For Dev only: <kbd>Cmd</kbd>+<kbd>Ctrl</kbd>+<kbd>O</kbd> toggles advanced settings
            </button>
            <button className="icon-btn" aria-label="Close" onClick={onClose}>
              <CloseIcon width={18} height={18} />
            </button>
          </div>
        </header>

        <nav ref={stepperRef} className="wizard-stepper" aria-label="Asset setup steps">
          <div
            className="wizard-stepper__glow"
            aria-hidden="true"
            style={{
              transform: `translate(${stepGlow.x}px, 50%)`,
              width: stepGlow.width,
            }}
          >
            <div className="wizard-stepper__glow-bloom" />
          </div>
          {WIZARD_STEPS.map((step, i) => {
            const state = wizardStepState(i, currentStep, maxUnlockedStep);
            return (
              <div key={step.id} className="wizard-stepper__slot">
                {i > 0 && (
                  <span className="wizard-stepper__sep" aria-hidden="true">
                    <ArrowRightIcon width={14} height={14} />
                  </span>
                )}
                <button
                  ref={(el) => {
                    stepRefs.current[i] = el;
                  }}
                  type="button"
                  className={"wizard-step wizard-step--" + state}
                  disabled={state === "disabled"}
                  aria-current={state === "selected" ? "step" : undefined}
                  onClick={() => selectStep(i)}
                >
                  <span className="wizard-step__marker">{i + 1}</span>
                  <span className="wizard-step__label">{step.label}</span>
                </button>
              </div>
            );
          })}
        </nav>

        <div
          className={
            "modal__body" +
            (isDeepDiveStep ? " modal__body--deep-dive" : "") +
            (isVizPicker ? " modal__body--viz-picker" : "") +
            (isDataSourcePicker ? " modal__body--single-pane" : "")
          }
        >
          <section className={"settings" + (isVizPicker ? " settings--viz-picker" : "")}>
            {isVizPicker ? (
              <div className="settings__content settings__content--viz-picker">
                <VisualTypePicker
                  selectedId={selectedVisualId}
                  onSelect={selectVisual}
                />
              </div>
            ) : (
              <>
            {isVizStep && (
              <SelectedVisualBar
                label={displayVisualLabel}
                visualId={displayVisualId}
                category={displayVisualCategory}
                onChange={returnToVisualPicker}
              />
            )}

            <div
              className={
                "settings__content" +
                (isDataSourceStep ? " settings__content--data-source" : "") +
                (isDataSourceStep && dataSourceQuery.trim()
                  ? " settings__content--query-fill"
                  : "") +
                (isFiltersStep ? " settings__content--filters" : "") +
                (isDeepDiveStep ? " settings__content--deep-dive" : "") +
                (isAccessStep ? " settings__content--access" : "") +
                (isGeneralInfoStep ? " settings__content--general-info" : "")
              }
            >
              {isDataSourceStep && (
                <DataSourceStep
                  onConfigurationChange={setDataSourceConfigured}
                  onSourceTypeChange={setDataSourceTypeSelected}
                  onQueryPreviewChange={setDataSourceQuery}
                  onLoadingChange={setDataSourceLoading}
                />
              )}

              {isFiltersStep && <FiltersStep />}

              {isDeepDiveStep && <DeepDiveStep />}

              {isAccessStep && <AccessStep />}

              {isGeneralInfoStep && (
                <GeneralInfoStep
                  value={generalInfo}
                  onChange={setGeneralInfo}
                  onFillWithAI={() =>
                    setGeneralInfo({
                      name: chart.name,
                      description: `Shows ${chart.name.toLowerCase()} using the configured data source and visualization settings.`,
                      insight:
                        generalInfo.insight ||
                        `Monitor ${chart.name.toLowerCase()} to identify meaningful changes and trends.`,
                      location: generalInfo.location,
                      tags:
                        generalInfo.tags.length > 0
                          ? generalInfo.tags
                          : [componentCategory || "Analytics"],
                      updateFrequency: generalInfo.updateFrequency,
                      customUpdateFrequency: generalInfo.customUpdateFrequency,
                      scheduleAutoRefresh: generalInfo.scheduleAutoRefresh,
                      category: generalInfo.category || componentCategory || "Operations",
                    })
                  }
                />
              )}

              {isVizStep && (
                <>
                  <div className="settings__subbar">
                    <p className="settings__subbar-label">Visual Settings</p>
                    <label className="settings__search">
                      <SearchIcon className="settings__search-ico" width={20} height={20} aria-hidden="true" />
                      <input
                        className="settings__search-input"
                        type="search"
                        placeholder="Search options…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="vs-panel">
                    <nav className="vs-panel__nav" aria-label="Visual settings">
                      {navSections.map((section) => (
                        <div key={section.id} className="vs-nav-section">
                          <div className="vs-nav-section__head">
                            <p className="vs-nav-section__label">{section.label}</p>
                            <span className="vs-nav-section__rule" aria-hidden="true" />
                          </div>
                          {section.tabs.map((label) => {
                            const selected = activeSubCategory === label;
                            const catFields = visualFields.filter((o) => o.group === label);
                            const hasErrors = sectionHasErrors(catFields, getVal);
                            const TabIcon = getSettingsTabIcon(label);
                            const featureOn = isFeatureTabOn(label, getValByKey, catFields);
                            return (
                              <button
                                key={label}
                                type="button"
                                className={"vs-tab" + (selected ? " is-selected" : "")}
                                aria-current={selected ? "true" : undefined}
                                onClick={() => setActiveSubCategory(label)}
                              >
                                <span className="vs-tab__main">
                                  <TabIcon className="vs-tab__icon" size={16} weight="regular" aria-hidden="true" />
                                  <span className="vs-tab__label">{label}</span>
                                </span>
                                {(featureOn !== null || hasErrors) && (
                                <span className="vs-tab__meta">
                                  {featureOn !== null && (
                                    <span className={"vs-tab__state" + (featureOn ? " is-on" : "")}>
                                      {featureOn ? "On" : "Off"}
                                    </span>
                                  )}
                                  {hasErrors && (
                                    <FieldAlertIcon className="vs-tab__alert" aria-label="Required fields incomplete" />
                                  )}
                                </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </nav>
                    <div className="vs-panel__content">
                      {tabFields.length === 0 ? (
                        <div className="ia-empty">No options for this visual in this section.</div>
                      ) : (
                        <div className="ia-stack">
                          <GroupCard
                            key={`${displayVisualId}:${activeSubCategory}`}
                            items={tabFields}
                            advancedOpen={advancedSettingsOpen}
                            getVal={getVal}
                            setVal={setVal}
                            getValByKey={getValByKey}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {!isDataSourceStep &&
                !isVizStep &&
                !isFiltersStep &&
                !isDeepDiveStep &&
                !isAccessStep &&
                !isGeneralInfoStep && (
                <div className="ia-empty">{WIZARD_STEPS[currentStep]?.label} — coming soon.</div>
              )}
            </div>
              </>
            )}
          </section>

          {!isDeepDiveStep && !isVizPicker && !isDataSourcePicker && (
          <section className="preview">
            {isDataSourceStep ? (
              <>
                <div className="preview__head">
                  <div className="preview__head-row">
                    <h3 className="preview__title">Data query</h3>
                  </div>
                </div>
                {dataSourceLoading ? (
                  <div className="preview__empty preview__empty--loading" role="status">
                    <span className="preview__loading-spinner" aria-hidden="true" />
                    <p className="preview__empty-title">Loading query results...</p>
                  </div>
                ) : dataSourceConfigured ? (
                  dataSourceQuery.trim() ? (
                    <div className="preview__stage preview__stage--query">
                      <DataSourceQueryPreview />
                    </div>
                  ) : (
                    <div className="preview__empty">
                      <p className="preview__empty-title">Query will show here</p>
                      <p className="preview__empty-copy">
                        This data source does not have a generated query.
                      </p>
                    </div>
                  )
                ) : (
                  <div className="preview__empty">
                    <p className="preview__empty-title">No data query yet</p>
                    <p className="preview__empty-copy">
                      Select and configure a data source to preview its query results.
                    </p>
                  </div>
                )}
              </>
            ) : showChartPreview ? (
              <>
                <div className="preview__head">
                  <div className="preview__head-row">
                    <h3 className="preview__title">Chart Preview</h3>
                    {!isPreviewVizOnly && (
                    <div
                      className="seg-toggle preview__mode-toggle"
                      role="group"
                      aria-label="Preview mode"
                    >
                      <button
                        type="button"
                        className={
                          "seg-toggle__btn" + (previewMode === "visualization" ? " is-active" : "")
                        }
                        onClick={() => setPreviewMode("visualization")}
                      >
                        Visualization
                      </button>
                      <button
                        type="button"
                        className={
                          "seg-toggle__btn" + (previewMode === "data-query" ? " is-active" : "")
                        }
                        onClick={() => setPreviewMode("data-query")}
                      >
                        Data query
                      </button>
                    </div>
                    )}
                  </div>
                </div>

                {previewMode === "visualization" || isPreviewVizOnly ? (
                  <div className="preview__stage preview__stage--viz">
                    <div className="preview__size-toggle">
                      <div className="seg-toggle" role="group" aria-label="Preview size">
                        {(["small", "medium", "large"] as PreviewSize[]).map((s) => (
                          <button
                            key={s}
                            type="button"
                            className={"seg-toggle__btn" + (size === s ? " is-active" : "")}
                            onClick={() => setSize(s)}
                          >
                            {s[0].toUpperCase() + s.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="preview__chart-slot">
                      <div className={"chart-card chart-card--" + size}>
                        <ChartPreview
                          type={chart.preview}
                          chartId={activeChart}
                          visualId={displayVisualId}
                          cfg={cfg}
                          series={previewSeries}
                          chartTitle={generalInfo.name || undefined}
                          size={size}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="preview__stage preview__stage--table">
                    <ChartDataQueryPreview />
                  </div>
                )}
              </>
            ) : (
              <div className="preview__empty">
                <p className="preview__empty-title">Chart Preview</p>
                <p className="preview__empty-copy">Select a visualization to see a live preview.</p>
              </div>
            )}
          </section>
          )}

          <footer className="settings__footer">
            <button
              type="button"
              className="pg-btn pg-btn--secondary pg-btn--icon-left"
              disabled={currentStep === 0 && !(isVizStep && vizPhase === "settings")}
              onClick={handlePrev}
            >
              <ArrowLeftIcon className="pg-btn__icon" width={20} height={20} aria-hidden="true" />
              <span>Previous</span>
            </button>
            <button
              type="button"
              className={
                "pg-btn pg-btn--primary" +
                (isGeneralInfoStep ? " pg-btn--create" : " pg-btn--icon-right")
              }
              disabled={
                isVizPicker
                  ? true
                  : isVizSettings
                    ? mappingIncomplete
                    : isGeneralInfoStep
                      ? false
                      : currentStep >= WIZARD_STEPS.length - 1
              }
              onClick={handleNext}
            >
              <span>{isGeneralInfoStep ? "Create asset" : "Next"}</span>
              {!isGeneralInfoStep && (
                <ArrowRightIcon className="pg-btn__icon" width={20} height={20} aria-hidden="true" />
              )}
            </button>
          </footer>
        </div>
      </div>
      </ColorPaletteProvider>
    </div>
  );
}
