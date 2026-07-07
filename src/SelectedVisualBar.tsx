import VisualArtwork from "./VisualArtwork";
import type { VisualCategoryId } from "./visualCatalog";

type Props = {
  label: string;
  visualId: string;
  category: VisualCategoryId;
  onChange: () => void;
};

export default function SelectedVisualBar({ label, visualId, category, onChange }: Props) {
  return (
    <div className="selected-visual">
      <p className="selected-visual__label">Selected Visualization Type</p>
      <div className="selected-visual__bar">
        <div className="selected-visual__info">
          <VisualArtwork visualId={visualId} category={category} size="bar" />
          <span className="selected-visual__name">{label}</span>
        </div>
        <button type="button" className="selected-visual__change" onClick={onChange}>
          Change
        </button>
      </div>
    </div>
  );
}
