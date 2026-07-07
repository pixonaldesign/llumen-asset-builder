import { useState } from "react";
import { CloseIcon } from "./icons";

type Props = {
  onClose: () => void;
  onEditComponent: (name: string) => void;
};

export default function CreateComponentPopup({ onClose, onEditComponent }: Props) {
  const [name, setName] = useState("");

  const canContinue = name.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canContinue) return;
    onEditComponent(name.trim());
  };

  return (
    <div className="create-popup-overlay" role="dialog" aria-modal="true" aria-labelledby="create-popup-title">
      <div className="create-popup">
        <header className="create-popup__header">
          <h2 id="create-popup-title" className="create-popup__title">
            Create Component
          </h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon width={18} height={18} />
          </button>
        </header>

        <form className="create-popup__body" onSubmit={handleSubmit}>
          <div className="field">
            <label className="field__label" htmlFor="component-name">
              Name
            </label>
            <input
              id="component-name"
              className="input"
              type="text"
              placeholder="e.g. Average Response Time"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="create-popup__footer">
            <button type="submit" className="btn btn--primary" disabled={!canContinue}>
              Edit Component
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
