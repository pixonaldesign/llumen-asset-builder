import { useState, useRef, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import {
  AlignBottomSimple,
  AlignLeftSimple,
  AlignRightSimple,
  AlignTopSimple,
  Lock,
  LockOpen,
} from "@phosphor-icons/react";
import {
  CloseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  MapIcon,
  PaletteIcon,
  InsightsIcon,
  ReadoutIcon,
  SearchIcon,
  RequiredIcon,
  FieldAlertIcon,
  InfoIcon,
} from "./icons";
import { charts, sectionMeta, isAdvancedLike } from "./chartModel";
import type { Opt, SectionId } from "./chartModel";
import ChartPreview from "./ChartPreview";
import ChartDataQueryPreview from "./ChartDataQueryPreview";
import StaticVisualPreview from "./StaticVisualPreview";
import ColorPalette from "./ColorPalette";
import Dropdown from "./Dropdown";
import DataSourceStep from "./DataSourceStep";
import FiltersStep from "./FiltersStep";
import DeepDiveStep from "./DeepDiveStep";
import AccessStep from "./AccessStep";
import GeneralInfoStep, { type GeneralInfo } from "./GeneralInfoStep";
import ApiResponsePreview from "./ApiResponsePreview";
import VisualTypePicker from "./VisualTypePicker";
import SelectedVisualBar from "./SelectedVisualBar";
import { visualTypeByChartId, visualTypeById } from "./visualCatalog";
import type { VisualCategoryId, VisualType } from "./visualCatalog";

type VizPhase = "picker" | "settings";

type PreviewSize = "small" | "medium" | "large";

type PreviewMode = "visualization" | "data-query";

const SECTION_ICONS: Record<SectionId, typeof MapIcon> = {
  data: MapIcon,
  design: PaletteIcon,
  insights: InsightsIcon,
  advanced: ReadoutIcon,
};

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
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return !Number.isNaN(value);
  return value !== undefined && value !== null && value !== "";
}

function isOptSatisfied(o: Opt, getVal: (o: Opt) => unknown): boolean {
  if (o.level !== "required") return true;
  return isValueFilled(o, getVal(o));
}

function sectionHasErrors(sectionId: SectionId, chart: (typeof charts)[string], getVal: (o: Opt) => unknown): boolean {
  return (chart.sections[sectionId] ?? []).some((o) => o.level === "required" && !isOptSatisfied(o, getVal));
}

type WizardStepState = "disabled" | "active" | "selected";

function wizardStepState(index: number, currentStep: number, maxUnlockedStep: number): WizardStepState {
  if (index > maxUnlockedStep) return "disabled";
  if (index === currentStep) return "selected";
  return "active";
}

const SAMPLE_COLUMNS = ["value", "category", "timestamp", "unit", "status", "region", "amount"];

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

function defaultFor(o: Opt): unknown {
  switch (o.type) {
    case "toggle":
      return o.def !== false;
    case "segmented":
      return o.values[0] ?? "";
    case "posgrid":
      return "top-left";
    case "slider":
      return 58;
    case "margins":
      return defaultMargins();
    case "number":
      return "24";
    case "color":
      return "#73adf5";
    case "dropdown":
      return o.values[0] ?? "";
    case "field":
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
  const unit = o.desc.includes("px") ? " px" : o.desc.includes("°") ? "°" : "";
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

function LocalSwitch({ defaultOn }: { defaultOn?: boolean }) {
  const [on, setOn] = useState(!!defaultOn);
  return <Switch value={on} onChange={setOn} />;
}

function MiniSwitch({ on }: { on: boolean }) {
  return <span className={"ia-mini-switch" + (on ? " on" : "")} />;
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

function Chip({ label, defaultSel }: { label: string; defaultSel?: boolean }) {
  const [sel, setSel] = useState(!!defaultSel);
  return (
    <span className={"ia-chip" + (sel ? " selected" : "")} onClick={() => setSel((s) => !s)}>
      {label}
    </span>
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
          <InfoIcon className="ia-field-info__icon" width={14} height={14} aria-hidden="true" />
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
      return (
        <div className="ia-surface ia-slider">
          <div className="ia-slider-row">
            <input
              type="range"
              className="ia-range"
              min={0}
              max={100}
              value={pct}
              onChange={(e) => setVal(o, Number(e.target.value))}
            />
            <div className="ia-slider-val">{sliderDisplay(o, pct)}</div>
          </div>
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
            placeholder={o.name.toLowerCase().includes("format") ? ".0f" : "Manual value"}
            onChange={(e) => setVal(o, e.target.value)}
          />
        </div>
      );

    case "color":
      return <ColorPalette color={String(getVal(o))} setColor={(c) => setVal(o, c)} variant="simple" />;

    case "multi": {
      const values = o.values.length ? o.values : ["Field A", "Field B", "Field C"];
      const asToggles =
        o.name.toLowerCase().includes("show") ||
        o.name.toLowerCase() === "content" ||
        values.some((v) => v.toLowerCase().startsWith("show "));
      if (asToggles)
        return (
          <div className="ia-surface ia-toggle-list">
            {values.map((v, i) => (
              <div key={v} className="ia-toggle-flat">
                <div className="ia-toggle-line">
                  <strong>{v}</strong>
                  <LocalSwitch defaultOn={i !== 2} />
                </div>
              </div>
            ))}
          </div>
        );
      return (
        <div className="ia-surface">
          <div className="ia-chips">
            {values.map((v, i) => (
              <Chip key={v} label={v} defaultSel={i < 2} />
            ))}
          </div>
        </div>
      );
    }

    case "repeatable":
      return (
        <div className="ia-surface ia-repeat">
          <div className="ia-rule">
            <span>0–50</span>
            <span className="ia-rule-color" />
            <span className="ia-rule-x">×</span>
          </div>
          <div className="ia-rule">
            <span>51–100</span>
            <span className="ia-rule-color" style={{ background: "#ffd58a" }} />
            <span className="ia-rule-x">×</span>
          </div>
        </div>
      );

    case "gradient":
      return (
        <div className="ia-surface">
          <div className="ia-gradient" />
        </div>
      );

    case "dropdown":
    case "field":
    default: {
      const options = o.type === "field" ? SAMPLE_COLUMNS : o.values;
      const list = options.length ? options : [`Set ${o.name}`];
      return (
        <Dropdown
          value={String(getVal(o))}
          onChange={(v) => setVal(o, v)}
          allowEmpty={o.type === "field"}
          options={list.map((v) => ({ value: v, label: v }))}
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

/* Pair adjacent X / Y mapping fields so they render side-by-side. */
const isXField = (o: Opt) => /^x[\s-]?(axis|value|category)\b/i.test(o.name);
const isYField = (o: Opt) => /^y[\s-]?(axis|value|category)\b/i.test(o.name);
function pairAxes(items: Opt[]): (Opt | [Opt, Opt])[] {
  const rows: (Opt | [Opt, Opt])[] = [];
  for (let i = 0; i < items.length; i++) {
    const cur = items[i];
    const next = items[i + 1];
    if (next && isXField(cur) && isYField(next)) {
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

/* ---------- group card ---------- */
function GroupCard({
  title,
  items,
  showToggle,
  on,
  onToggle,
  getVal,
  setVal,
}: {
  title: string;
  items: Opt[];
  showToggle: boolean;
  on: boolean;
  onToggle: () => void;
  getVal: (o: Opt) => unknown;
  setVal: (o: Opt, v: unknown) => void;
}) {
  const isColors = title === "Colors";
  const colorOpt = isColors ? items.find((o) => o.name === "Single color") : undefined;
  const coreItems = items.filter((o) => !isAdvancedLike(o));
  const advancedItems = items.filter(isAdvancedLike);
  const hasAdvancedFields = advancedItems.length > 0;

  return (
    <section className="ia-group">
      <div className="ia-group-head">
        <div className="ia-group-title">{title}</div>
        {showToggle && !isColors && (
          <div className={"ia-grp-adv" + (on ? " on" : "")} onClick={onToggle}>
            <span>Advanced</span>
            <MiniSwitch on={on} />
          </div>
        )}
      </div>
      <div className="ia-card">
        <div className="ia-card-body">
          {isColors ? (
            <ColorPalette
              color={colorOpt ? String(getVal(colorOpt)) : "#73adf5"}
              setColor={(c) => colorOpt && setVal(colorOpt, c)}
              variant="full"
            />
          ) : (
            <>
              {coreItems.length > 0 && (
                <div className="ia-card-fields">{renderFieldRows(pairAxes(coreItems), getVal, setVal)}</div>
              )}
              {hasAdvancedFields && (
                <div
                  className={
                    "ia-adv-panel" +
                    (on ? " is-open" : "") +
                    (coreItems.length > 0 ? " ia-adv-panel--offset" : "")
                  }
                  aria-hidden={!on}
                >
                  <div className="ia-adv-panel__inner">
                    {renderFieldRows(pairAxes(advancedItems), getVal, setVal)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------- modal ---------- */
export default function EditComponentModal({
  onClose,
  componentName,
  componentCategory,
  startAtVisualPicker = false,
}: {
  onClose?: () => void;
  componentName?: string;
  componentCategory?: string;
  startAtVisualPicker?: boolean;
}) {
  const [activeChart, setActiveChart] = useState("bar");
  const [selectedVisualId, setSelectedVisualId] = useState<string | null>(
    startAtVisualPicker ? null : "vertical-bar",
  );
  const [vizSectionsExpanded, setVizSectionsExpanded] = useState<Record<VisualCategoryId, boolean>>({
    chart: true,
    "map-layer": true,
  });
  const [vizPhase, setVizPhase] = useState<VizPhase>(startAtVisualPicker ? "picker" : "settings");
  const [activeSection, setActiveSection] = useState<SectionId>("data");
  const [currentStep, setCurrentStep] = useState(startAtVisualPicker ? 0 : 1);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState(startAtVisualPicker ? 0 : 1);
  const [query, setQuery] = useState("");
  const [groupAdv, setGroupAdv] = useState<Record<string, boolean>>({});
  const [size, setSize] = useState<PreviewSize>("medium");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("visualization");
  const [config, setConfig] = useState<Config>({});
  const [generalInfo, setGeneralInfo] = useState<GeneralInfo>({
    name: componentName ?? "",
    description: "",
    category: componentCategory ?? "",
  });

  const chart = charts[activeChart];

  const getVal = (o: Opt) => {
    const v = config[keyOf(o)];
    return v === undefined ? defaultFor(o) : v;
  };
  const setVal = (o: Opt, v: unknown) => setConfig((c) => ({ ...c, [keyOf(o)]: v }));

  const cfg = (group: string, name: string, fallback: unknown) => {
    const v = config[`${group}::${name}`];
    return v === undefined ? fallback : v;
  };

  const all = chart.sections[activeSection].filter(
    (o) => !query || `${o.name} ${o.desc}`.toLowerCase().includes(query.toLowerCase())
  );

  // group, preserving insertion order
  const groups: { title: string; items: Opt[] }[] = [];
  for (const o of all) {
    let g = groups.find((x) => x.title === o.group);
    if (!g) {
      g = { title: o.group, items: [] };
      groups.push(g);
    }
    g.items.push(o);
  }

  const visibleGroups = groups
    .map((g) => {
      const key = `${activeChart}:${activeSection}:${g.title}`;
      const hasAdvanced = g.items.some(isAdvancedLike);
      const groupAdvanced = !!groupAdv[key];
      return { title: g.title, key, items: g.items, hasAdvanced, groupAdvanced };
    })
    .filter((g) => g.items.length > 0);

  const toggleGroup = (key: string) => setGroupAdv((s) => ({ ...s, [key]: !s[key] }));

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
        !generalInfo.category.trim()
      ) {
        return;
      }
      onClose?.();
      return;
    }
    if (isVizStep && vizPhase === "picker") {
      return;
    }
    if (isVizStep && vizPhase === "settings" && sectionHasErrors("data", chart, getVal)) {
      return;
    }
    goNext();
  };

  const selectVisual = (visual: VisualType) => {
    setSelectedVisualId(visual.id);
    setActiveChart(visual.chartId);
  };

  const returnToVisualPicker = () => setVizPhase("picker");

  const confirmVisualSelection = () => {
    if (!selectedVisualId) return;
    setVizPhase("settings");
  };

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
  const isPreviewVizOnly = isAccessStep || isGeneralInfoStep;
  const isVizPicker = isVizStep && vizPhase === "picker";
  const isVizSettings = isVizStep && vizPhase === "settings";
  const mappingIncomplete = sectionHasErrors("data", chart, getVal);
  const selectedVisual = selectedVisualId ? visualTypeById(selectedVisualId) : null;
  const displayVisual = selectedVisual ?? visualTypeByChartId(activeChart);
  const displayVisualId = displayVisual?.id ?? "vertical-bar";
  const displayVisualLabel = displayVisual?.label ?? chart.name;
  const displayVisualCategory = displayVisual?.category ?? "chart";
  const selectedCategoryExpanded =
    !selectedVisual || vizSectionsExpanded[selectedVisual.category];
  const showChartPreview =
    !isDataSourceStep &&
    !isDeepDiveStep &&
    (!isVizPicker || (!!selectedVisualId && selectedCategoryExpanded));

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
      <div className="modal">
        {/* Header */}
        <header className="modal__header">
          <div className="modal__heading">
            <h2 className="modal__title">Edit Component</h2>
            {(generalInfo.name || generalInfo.category) && (
              <p className="modal__subtitle">
                {[generalInfo.name, generalInfo.category].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon width={18} height={18} />
          </button>
        </header>

        <nav ref={stepperRef} className="wizard-stepper" aria-label="Component setup steps">
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
            (isDeepDiveStep ? " modal__body--deep-dive" : "")
          }
        >
          <section className={"settings" + (isVizPicker ? " settings--viz-picker" : "")}>
            {isVizPicker ? (
              <div className="settings__content settings__content--viz-picker">
                <VisualTypePicker
                  selectedId={selectedVisualId}
                  onSelect={selectVisual}
                  onConfirmSelection={confirmVisualSelection}
                  onExpandedChange={setVizSectionsExpanded}
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
                (isFiltersStep ? " settings__content--filters" : "") +
                (isDeepDiveStep ? " settings__content--deep-dive" : "") +
                (isAccessStep ? " settings__content--access" : "") +
                (isGeneralInfoStep ? " settings__content--general-info" : "")
              }
            >
              {isDataSourceStep && <DataSourceStep />}

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
                      <SearchIcon className="settings__search-ico" width={14} height={14} aria-hidden="true" />
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
                      {sectionMeta.map((s) => {
                        const Icon = SECTION_ICONS[s.id];
                        const selected = activeSection === s.id;
                        const hasErrors = sectionHasErrors(s.id, chart, getVal);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            className={"vs-tab" + (selected ? " is-selected" : "")}
                            aria-current={selected ? "true" : undefined}
                            onClick={() => setActiveSection(s.id)}
                          >
                            <span className="vs-tab__main">
                              <Icon className="vs-tab__icon" width={20} height={20} aria-hidden="true" />
                              <span className="vs-tab__label">{s.label}</span>
                            </span>
                            {hasErrors && (
                              <FieldAlertIcon className="vs-tab__alert" aria-label="Required fields incomplete" />
                            )}
                          </button>
                        );
                      })}
                    </nav>
                    <div className="vs-panel__content">
                      {visibleGroups.length === 0 ? (
                        <div className="ia-empty">No options for this visual in this section.</div>
                      ) : (
                        <div className="ia-stack">
                          {visibleGroups.map((g) => (
                            <GroupCard
                              key={g.key}
                              title={g.title}
                              items={g.items}
                              showToggle={g.hasAdvanced}
                              on={g.groupAdvanced}
                              onToggle={() => toggleGroup(g.key)}
                              getVal={getVal}
                              setVal={setVal}
                            />
                          ))}
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

          {!isDeepDiveStep && (
          <section className="preview">
            {isDataSourceStep ? (
              <ApiResponsePreview />
            ) : showChartPreview ? (
              <>
                <div className="preview__head">
                  <div className="preview__head-row">
                    <h3 className="preview__title">
                      {isVizPicker && selectedVisual ? selectedVisual.label : "Chart Preview"}
                    </h3>
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
                        {isVizPicker && selectedVisual ? (
                          <StaticVisualPreview visual={selectedVisual} />
                        ) : (
                          <ChartPreview type={chart.preview} chartId={activeChart} cfg={cfg} />
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="preview__stage preview__stage--table">
                    <ChartDataQueryPreview chartId={activeChart} />
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
              <ArrowLeftIcon className="pg-btn__icon" width={16} height={16} aria-hidden="true" />
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
              <span>{isGeneralInfoStep ? "Create component" : "Next"}</span>
              {!isGeneralInfoStep && (
                <ArrowRightIcon className="pg-btn__icon" width={16} height={16} aria-hidden="true" />
              )}
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}
