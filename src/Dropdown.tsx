import { useState, useRef, useEffect, useCallback, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon } from "./icons";

export type DropdownOption = {
  value: string;
  label: string;
};

type DropdownProps = {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  emptyLabel?: string;
  allowEmpty?: boolean;
  ariaLabel?: string;
  className?: string;
  compact?: boolean;
};

export default function Dropdown({
  value,
  onChange,
  options,
  placeholder = "Select…",
  emptyLabel = "None",
  allowEmpty = false,
  ariaLabel,
  className,
  compact = false,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const syncMenuPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    syncMenuPosition();
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
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
  }, [open, syncMenuPosition]);

  const selected = options.find((o) => o.value === value);
  const isEmptyChoice = allowEmpty && value === "";
  const isPlaceholder = !selected && !isEmptyChoice;
  const displayLabel =
    isEmptyChoice ? emptyLabel : selected?.label ?? (value || placeholder);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div className={"cp-picker-wrap" + (className ? ` ${className}` : "")}>
      <button
        ref={triggerRef}
        type="button"
        className={
          "cp-picker-trigger" +
          (open ? " is-open" : "") +
          (compact ? " cp-picker-trigger--compact" : "") +
          (isPlaceholder ? " is-placeholder" : "")
        }
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          syncMenuPosition();
          setOpen(true);
        }}
      >
        <span className="cp-picker-trigger-name">{displayLabel}</span>
        <span className="cp-picker-trigger-end">
          <ChevronDownIcon className="cp-caret" width={16} height={16} aria-hidden="true" />
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="cp-picker-menu cp-picker-menu--flyout"
            role="listbox"
            style={
              {
                top: menuPos.top,
                left: menuPos.left,
                width: menuPos.width,
              } as CSSProperties
            }
          >
            <div className="cp-picker-list">
              {allowEmpty && (
                <button
                  type="button"
                  role="option"
                  aria-selected={value === ""}
                  className={"cp-picker-row" + (value === "" ? " is-selected" : "")}
                  onClick={() => pick("")}
                >
                  <span className="cp-picker-row-name">{emptyLabel}</span>
                </button>
              )}
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={opt.value === value}
                  className={"cp-picker-row" + (opt.value === value ? " is-selected" : "")}
                  onClick={() => pick(opt.value)}
                >
                  <span className="cp-picker-row-name">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
