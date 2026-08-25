import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon, SearchIcon } from "./icons";

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
  searchable?: boolean;
  searchPlaceholder?: string;
  noResultsLabel?: string;
  ariaLabel?: string;
  className?: string;
  menuClassName?: string;
  endIcon?: ReactNode;
  compact?: boolean;
};

export default function Dropdown({
  value,
  onChange,
  options,
  placeholder = "Select…",
  emptyLabel = "None",
  allowEmpty = false,
  searchable = false,
  searchPlaceholder = "Search columns",
  noResultsLabel = "No columns found",
  ariaLabel,
  className,
  menuClassName,
  endIcon,
  compact = false,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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

  const close = useCallback(() => {
    setOpen(false);
    setSearch("");
  }, []);

  useEffect(() => {
    if (!open) return;
    syncMenuPosition();
    if (searchable) searchRef.current?.focus();
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      close();
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
  }, [open, searchable, syncMenuPosition, close]);

  const selected = options.find((o) => o.value === value);
  const isEmptyChoice = allowEmpty && value === "";
  const isPlaceholder = !selected && !isEmptyChoice;
  const displayLabel =
    isEmptyChoice ? emptyLabel : selected?.label ?? (value || placeholder);

  const query = search.trim().toLowerCase();
  const filtered = query
    ? options.filter(
        (o) => o.label.toLowerCase().includes(query) || o.value.toLowerCase().includes(query),
      )
    : options;
  const showEmpty = allowEmpty && (!query || emptyLabel.toLowerCase().includes(query));

  const pick = (next: string) => {
    onChange(next);
    close();
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
            close();
            return;
          }
          setSearch("");
          syncMenuPosition();
          setOpen(true);
        }}
      >
        <span className="cp-picker-trigger-name">{displayLabel}</span>
        <span className="cp-picker-trigger-end">
          {endIcon ?? (
            <ChevronDownIcon className="cp-caret" width={16} height={16} aria-hidden="true" />
          )}
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className={
              "cp-picker-menu cp-picker-menu--flyout" +
              (menuClassName ? ` ${menuClassName}` : "")
            }
            role="listbox"
            style={
              {
                top: menuPos.top,
                left: menuPos.left,
                width: menuPos.width,
              } as CSSProperties
            }
          >
            {searchable && (
              <div className="cp-picker-search">
                <input
                  ref={searchRef}
                  type="search"
                  placeholder={searchPlaceholder}
                  value={search}
                  aria-label={searchPlaceholder}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Escape") {
                      close();
                      return;
                    }
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    if (filtered[0]) pick(filtered[0].value);
                    else if (showEmpty) pick("");
                  }}
                />
                <SearchIcon className="cp-picker-search-ico" width={14} height={14} />
              </div>
            )}
            <div className="cp-picker-list">
              {showEmpty && (
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
              {filtered.map((opt) => (
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
              {searchable && !filtered.length && !showEmpty && (
                <div className="cp-picker-empty">{noResultsLabel}</div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
