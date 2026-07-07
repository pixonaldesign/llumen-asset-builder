import { Fragment, useState, type ReactNode } from "react";
import { ChartBar, MapTrifold } from "@phosphor-icons/react";
import { ChevronDownIcon } from "./icons";
import { VISUAL_CATEGORIES, visualTypeById, visualTypesForCategory } from "./visualCatalog";
import type { VisualCategoryId, VisualType } from "./visualCatalog";
import VisualArtwork from "./VisualArtwork";

const CATEGORY_ICONS: Record<VisualCategoryId, typeof ChartBar> = {
  chart: ChartBar,
  "map-layer": MapTrifold,
};

const CATEGORY_GRID_CLASS: Partial<Record<VisualCategoryId, string>> = {
  chart: "viz-type-grid--chart",
  "map-layer": "viz-type-grid--map",
};

type Props = {
  selectedId: string | null;
  onSelect: (visual: VisualType) => void;
  onConfirmSelection?: () => void;
  onExpandedChange?: (expanded: Record<VisualCategoryId, boolean>) => void;
};

function VisualCard({
  visual,
  selected,
  onSelect,
}: {
  visual: VisualType;
  selected: boolean;
  onSelect: (visual: VisualType) => void;
}) {
  const isChart = visual.category === "chart";
  const isMap = visual.category === "map-layer";

  return (
    <button
      type="button"
      className={
        "viz-type-card" +
        (selected ? " is-selected" : "") +
        (isChart ? " viz-type-card--chart" : "") +
        (isMap ? " viz-type-card--map" : "")
      }
      aria-pressed={selected}
      onClick={() => onSelect(visual)}
    >
      <span className="viz-type-card__artwrap">
        <VisualArtwork visualId={visual.id} category={visual.category} size={isMap ? "map" : "card"} />
      </span>
      <span className="viz-type-card__label">{visual.label}</span>
    </button>
  );
}

function CategorySection({
  categoryId,
  label,
  icon,
  open,
  showSelect,
  onToggle,
  onConfirm,
  children,
}: {
  categoryId: VisualCategoryId;
  label: string;
  icon: ReactNode;
  open: boolean;
  showSelect: boolean;
  onToggle: () => void;
  onConfirm: () => void;
  children: ReactNode;
}) {
  const gridClass = CATEGORY_GRID_CLASS[categoryId] ?? "";
  const gridId = `viz-cat-grid-${categoryId}`;

  return (
    <section
      className={"viz-type-section" + (open ? "" : " is-collapsed")}
      aria-labelledby={`viz-cat-${categoryId}`}
    >
      <div className="viz-type-section__head">
        <button
          type="button"
          className="viz-type-section__toggle"
          aria-expanded={open}
          aria-controls={gridId}
          onClick={onToggle}
        >
          <span className="viz-type-section__icon" aria-hidden="true">
            {icon}
          </span>
          <span id={`viz-cat-${categoryId}`} className="viz-type-section__title">
            {label}
          </span>
        </button>
        <div className="viz-type-section__actions">
          {showSelect && (
            <button
              type="button"
              className="pg-btn pg-btn--primary pg-btn--sm viz-type-section__select"
              onClick={onConfirm}
            >
              <span className="viz-type-section__select-label">Select</span>
            </button>
          )}
          <button
            type="button"
            className="viz-type-section__caret-btn"
            aria-expanded={open}
            aria-controls={gridId}
            aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
            onClick={onToggle}
          >
            <ChevronDownIcon className="viz-type-section__caret" width={16} height={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      {open && (
        <div id={gridId} className={"viz-type-grid" + (gridClass ? ` ${gridClass}` : "")}>
          {children}
        </div>
      )}
    </section>
  );
}

export default function VisualTypePicker({
  selectedId,
  onSelect,
  onConfirmSelection,
  onExpandedChange,
}: Props) {
  const [expanded, setExpanded] = useState<Record<VisualCategoryId, boolean>>({
    chart: true,
    "map-layer": true,
  });
  const selectedVisual = selectedId ? visualTypeById(selectedId) : null;

  const toggleCategory = (categoryId: VisualCategoryId) => {
    setExpanded((current) => {
      const next = { ...current, [categoryId]: !current[categoryId] };
      onExpandedChange?.(next);
      return next;
    });
  };

  return (
    <div className="viz-type-picker">
      <header className="viz-type-picker__head">
        <h2 className="viz-type-picker__title">Select Visualization Type</h2>
      </header>

      <div className="viz-type-picker__sections">
        {VISUAL_CATEGORIES.map((category, index) => {
          const CategoryIcon = CATEGORY_ICONS[category.id];
          const items = visualTypesForCategory(category.id);

          return (
            <Fragment key={category.id}>
              {index > 0 && <div className="viz-type-sections__divider" aria-hidden="true" />}
              <CategorySection
                categoryId={category.id}
                label={category.label}
                icon={<CategoryIcon size={18} weight="regular" />}
                open={expanded[category.id]}
                showSelect={selectedVisual?.category === category.id}
                onToggle={() => toggleCategory(category.id)}
                onConfirm={() => onConfirmSelection?.()}
              >
                {items.map((visual) => (
                  <VisualCard
                    key={visual.id}
                    visual={visual}
                    selected={selectedId === visual.id}
                    onSelect={onSelect}
                  />
                ))}
              </CategorySection>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
