import { useState } from "react";
import { CaretDown, Check } from "@phosphor-icons/react";
import { VISUAL_CATEGORIES, visualTypesForCategory } from "./visualCatalog";
import type { VisualCategoryId, VisualType } from "./visualCatalog";
import VisualArtwork from "./VisualArtwork";

type Props = {
  selectedId: string | null;
  onSelect: (visual: VisualType) => void;
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
  return (
    <button
      type="button"
      className={"viz-type-card" + (selected ? " is-selected" : "")}
      aria-pressed={selected}
      onClick={() => onSelect(visual)}
    >
      <span className="viz-type-card__artwrap">
        <VisualArtwork
          visualId={visual.id}
          category={visual.category}
          size={visual.category === "map-layer" ? "map" : "card"}
        />
      </span>
      <span className="viz-type-card__body">
        <span className="viz-type-card__heading">
          <span className="viz-type-card__title">{visual.label}</span>
          {selected && (
            <Check className="viz-type-card__check" size={16} weight="bold" aria-hidden="true" />
          )}
        </span>
        <span className="viz-type-card__desc">{visual.description}</span>
      </span>
    </button>
  );
}

export default function VisualTypePicker({ selectedId, onSelect }: Props) {
  const [openGroups, setOpenGroups] = useState<Set<VisualCategoryId>>(
    () => new Set<VisualCategoryId>(["chart", "map-layer"]),
  );

  const toggleGroup = (id: VisualCategoryId) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="viz-type-picker">
      <header className="viz-type-picker__head">
        <h2 className="viz-type-picker__title">Select Visualization Type</h2>
      </header>

      {VISUAL_CATEGORIES.map((category) => {
        const open = openGroups.has(category.id);
        const items = visualTypesForCategory(category.id);
        return (
          <section
            key={category.id}
            className={"viz-type-group" + (open ? " is-open" : "")}
          >
            <button
              type="button"
              className="viz-type-group__head"
              aria-expanded={open}
              aria-controls={`viz-group-${category.id}`}
              onClick={() => toggleGroup(category.id)}
            >
              <span className="viz-type-group__label">{category.label}</span>
              <span className="viz-type-group__rule" aria-hidden="true" />
              <CaretDown className="viz-type-group__caret" size={16} weight="bold" aria-hidden="true" />
            </button>
            <div
              id={`viz-group-${category.id}`}
              className={"viz-type-group__panel" + (open ? " is-open" : "")}
              hidden={!open}
            >
              <div className="viz-type-grid">
                {items.map((visual) => (
                  <VisualCard
                    key={visual.id}
                    visual={visual}
                    selected={selectedId === visual.id}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
