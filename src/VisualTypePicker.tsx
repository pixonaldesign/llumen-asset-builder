import { useState } from "react";
import { Check } from "@phosphor-icons/react";
import { VISUAL_CATEGORIES, visualTypeById, visualTypesForCategory } from "./visualCatalog";
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
  const selectedVisual = selectedId ? visualTypeById(selectedId) : null;
  const [activeTab, setActiveTab] = useState<VisualCategoryId>(
    selectedVisual?.category ?? "chart",
  );
  const items = visualTypesForCategory(activeTab);

  return (
    <div className="viz-type-picker">
      <header className="viz-type-picker__head">
        <h2 className="viz-type-picker__title">Select Visualization Type</h2>
        <div className="viz-type-picker__tabs" role="tablist" aria-label="Visualization category">
          {VISUAL_CATEGORIES.map((category) => {
            const selected = activeTab === category.id;
            return (
              <button
                key={category.id}
                type="button"
                role="tab"
                id={`viz-tab-${category.id}`}
                aria-selected={selected}
                aria-controls={`viz-panel-${category.id}`}
                className={"viz-type-picker__tab" + (selected ? " is-active" : "")}
                onClick={() => setActiveTab(category.id)}
              >
                {category.label}
              </button>
            );
          })}
        </div>
      </header>

      <div
        id={`viz-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`viz-tab-${activeTab}`}
        className="viz-type-grid"
      >
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
  );
}
