import { Sparkle } from "@phosphor-icons/react";
import Dropdown from "./Dropdown";

export type GeneralInfo = {
  name: string;
  description: string;
  category: string;
};

const CATEGORIES = [
  "Engineering",
  "Finance",
  "Operations",
  "People",
  "Product",
  "Sales",
  "Support",
  "Traffic",
] as const;

type Props = {
  value: GeneralInfo;
  onChange: (value: GeneralInfo) => void;
  onFillWithAI?: () => void;
};

export default function GeneralInfoStep({ value, onChange, onFillWithAI }: Props) {
  const set = (patch: Partial<GeneralInfo>) => onChange({ ...value, ...patch });

  return (
    <div className="general-info-step">
      <header className="general-info-step__head">
        <h3 className="general-info-step__title">General Info</h3>
        <button
          type="button"
          className="general-info-step__fill-ai"
          onClick={onFillWithAI}
        >
          <Sparkle size={14} weight="bold" aria-hidden="true" />
          Fill with AI
        </button>
      </header>

      <div className="general-info-step__fields">
        <div className="general-info-field">
          <label className="general-info-field__label" htmlFor="general-info-name">
            Asset Name<span className="general-info-field__required">*</span>
          </label>
          <input
            id="general-info-name"
            className="general-info-field__input"
            type="text"
            value={value.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. Average Response Time"
          />
        </div>

        <div className="general-info-field">
          <label className="general-info-field__label" htmlFor="general-info-description">
            Description<span className="general-info-field__required">*</span>
          </label>
          <textarea
            id="general-info-description"
            className="general-info-field__input general-info-field__textarea"
            value={value.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Describe what this asset shows and how it should be used"
            rows={4}
          />
        </div>

        <div className="general-info-field">
          <label className="general-info-field__label" htmlFor="general-info-category">
            Category<span className="general-info-field__required">*</span>
          </label>
          <Dropdown
            className="general-info-field__dropdown"
            value={value.category}
            onChange={(category) => set({ category })}
            options={CATEGORIES.map((category) => ({ value: category, label: category }))}
            placeholder="Select category"
            ariaLabel="Category"
          />
        </div>
      </div>
    </div>
  );
}
