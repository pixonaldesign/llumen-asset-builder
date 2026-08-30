import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DotsThreeVertical, GridFour, PencilSimple } from "@phosphor-icons/react";
import AddComponentModal from "./AddComponentModal";
import ComponentChartPreview from "./ComponentChartPreview";
import { componentById, type ComponentLibraryItem } from "./componentCatalog";
import {
  hasComponentPreviewImage,
  isCompactPreviewComponent,
  isLargeSquarePreviewComponent,
  isSquarePreviewComponent,
} from "./componentPreviewImages";
import { PlusIcon, TrashIcon } from "./icons";
import { visualTypeById } from "./visualCatalog";
import WidgetFrame from "./WidgetFrame";

export type DeepDiveComponentRef = {
  uid: number;
  componentId: string;
  compact: boolean;
};

export type DeepDiveTab = {
  id: number;
  name: string;
  components: DeepDiveComponentRef[];
};

type DeepDiveViewMode = "edit" | "preview";

let tabUid = 0;
const nextTabId = () => ++tabUid;
let componentUid = 0;
const nextComponentUid = () => ++componentUid;

function createTab(name = "New Tab"): DeepDiveTab {
  return { id: nextTabId(), name, components: [] };
}

let activeCardDragGhost: HTMLElement | null = null;

function clearCardDragGhost() {
  activeCardDragGhost?.remove();
  activeCardDragGhost = null;
}

function setCardDragImage(e: React.DragEvent, card: HTMLElement) {
  clearCardDragGhost();
  const rect = card.getBoundingClientRect();
  const ghost = card.cloneNode(true) as HTMLElement;
  ghost.classList.add("dd-component-card--ghost");
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.position = "fixed";
  ghost.style.top = "-9999px";
  ghost.style.left = "0";
  document.body.appendChild(ghost);
  activeCardDragGhost = ghost;
  e.dataTransfer.setDragImage(ghost, e.clientX - rect.left, e.clientY - rect.top);
}

type FlyoutPos = { top: number; left: number; width: number };

function measureCardMenuPosition(trigger: HTMLElement | null, menuWidth: number, gap = 6): FlyoutPos | null {
  if (!trigger) return null;
  const rect = trigger.getBoundingClientRect();
  const modalRect = trigger.closest(".modal")?.getBoundingClientRect();
  const preferredLeft = rect.right - menuWidth;
  const boundaryInset = 12;
  const left = modalRect
    ? Math.min(
        Math.max(preferredLeft, modalRect.left + boundaryInset),
        modalRect.right - menuWidth - boundaryInset,
      )
    : preferredLeft;
  return {
    top: rect.bottom + gap,
    left,
    width: menuWidth,
  };
}

function useCardActionMenu(menuWidth = 132) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<FlyoutPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const syncPosition = useCallback(() => {
    const next = measureCardMenuPosition(triggerRef.current, menuWidth);
    if (next) setPos(next);
  }, [menuWidth]);

  const toggle = useCallback(() => {
    setOpen((current) => {
      if (current) return false;
      syncPosition();
      return true;
    });
  }, [syncPosition]);

  useLayoutEffect(() => {
    if (!open) return;
    syncPosition();
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onLayout = () => syncPosition();
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [open, syncPosition]);

  useEffect(() => {
    if (!open) setPos(null);
  }, [open]);

  return { open, setOpen, toggle, pos, triggerRef, menuRef };
}

function DeepDiveTabActionMenu({
  open,
  menuRef,
  style,
  onEdit,
  onRemove,
}: {
  open: boolean;
  menuRef: React.RefObject<HTMLDivElement>;
  style?: React.CSSProperties;
  onEdit: () => void;
  onRemove: () => void;
}) {
  if (!open || !style) return null;

  return createPortal(
    <div ref={menuRef} className="dd-component-menu-flyout" style={style} role="menu" aria-label="Tab actions">
      <div className="dd-component-menu dd-tab-menu">
        <button type="button" className="dd-tab-menu__item" role="menuitem" onClick={onEdit}>
          <PencilSimple size={16} weight="regular" aria-hidden="true" />
          <span>Edit</span>
        </button>
        <button
          type="button"
          className="dd-tab-menu__item dd-tab-menu__item--danger"
          role="menuitem"
          onClick={onRemove}
        >
          <TrashIcon width={16} height={16} aria-hidden="true" />
          <span>Remove</span>
        </button>
      </div>
    </div>,
    document.body,
  );
}

const MODULAR_SLOT_COUNT = 24;

function widgetTypeLabel(item: ComponentLibraryItem): string {
  const visual = visualTypeById(item.visualId);
  return visual?.label ?? item.type.replace(/_/g, " ");
}

function DeepDiveTabChip({
  tab,
  active,
  editing,
  dragging,
  dropTarget,
  onSelect,
  onEdit,
  onRename,
  onFinishRename,
  onRemove,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  tab: DeepDiveTab;
  active: boolean;
  editing: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onRename: (name: string) => void;
  onFinishRename: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const { open, setOpen, toggle, pos, triggerRef, menuRef } = useCardActionMenu(148);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  return (
    <div
      ref={chipRef}
      draggable
      className={
        "dd-tab" +
        (active ? " is-active" : "") +
        (dragging ? " is-dragging" : "") +
        (dropTarget ? " is-drop-target" : "")
      }
      onDragStart={(e) => {
        if ((e.target as HTMLElement).closest(".dd-tab__menu-btn, .dd-tab__input")) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("application/x-dd-tab-id", String(tab.id));
        onDragStart();
      }}
      aria-label={`Reorder ${tab.name}`}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          className="dd-tab__input"
          value={tab.name}
          onChange={(e) => onRename(e.target.value)}
          onBlur={onFinishRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") onFinishRename();
            if (e.key === "Escape") onFinishRename();
          }}
        />
      ) : (
        <button type="button" className="dd-tab__label" onClick={onSelect}>
          {tab.name}
        </button>
      )}

      <button
        ref={triggerRef}
        type="button"
        className={"dd-tab__menu-btn" + (open ? " is-open" : "")}
        aria-label={`Actions for ${tab.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onClick={toggle}
      >
        <DotsThreeVertical size={16} weight="bold" aria-hidden="true" />
      </button>

      <DeepDiveTabActionMenu
        open={open}
        menuRef={menuRef}
        style={pos ? { top: pos.top, left: pos.left, width: pos.width } : undefined}
        onEdit={() => {
          setOpen(false);
          onEdit();
        }}
        onRemove={() => {
          setOpen(false);
          onRemove();
        }}
      />
    </div>
  );
}

function DeepDiveComponentCard({
  item,
  uid,
  compact,
  readOnly = false,
  dragging,
  dropTarget,
  onRemove,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  item: ComponentLibraryItem;
  uid: number;
  compact: boolean;
  readOnly?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
}) {
  const cardRef = useRef<HTMLElement>(null);

  const isCompactWidget = isCompactPreviewComponent(item.id);
  const isLargeSquareWidget = isLargeSquarePreviewComponent(item.id);
  const isSquareWidget = isSquarePreviewComponent(item.id);
  const isImageWidget = hasComponentPreviewImage(item.id);

  return (
    <article
      ref={cardRef}
      className={
        "dd-component-card" +
        (compact ? " dd-component-card--compact" : "") +
        (readOnly ? " dd-component-card--preview" : " dd-component-card--edit") +
        (isCompactWidget ? " dd-component-card--frame-compact" : "") +
        (isLargeSquareWidget ? " dd-component-card--frame-large-square" : "") +
        (isImageWidget ? " dd-component-card--frame-image" : "") +
        (dragging ? " is-dragging" : "") +
        (dropTarget ? " is-drop-target" : "")
      }
      aria-label={readOnly ? item.name : `Reorder ${item.name}`}
      draggable={!readOnly}
      style={{ height: "auto", aspectRatio: isSquareWidget ? "1 / 1" : "95 / 46" }}
      onDragStart={
        readOnly
          ? undefined
          : (e) => {
              if ((e.target as HTMLElement).closest(".dd-component-card__remove")) {
                e.preventDefault();
                return;
              }
              if (cardRef.current) setCardDragImage(e, cardRef.current);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("application/x-dd-component-uid", String(uid));
              onDragStart();
            }
      }
      onDragEnd={
        readOnly
          ? undefined
          : () => {
              clearCardDragGhost();
              onDragEnd();
            }
      }
      onDragOver={
        readOnly
          ? undefined
          : (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              onDragOver();
            }
      }
      onDrop={
        readOnly
          ? undefined
          : (e) => {
              e.preventDefault();
              onDrop();
            }
      }
    >
      {readOnly ? (
        <div className="dd-component-card__body">
          <div className="dd-component-card__preview" aria-hidden="true">
            <ComponentChartPreview item={item} />
          </div>
        </div>
      ) : (
        <WidgetFrame
          typeLabel={widgetTypeLabel(item)}
          visualMode={hasComponentPreviewImage(item.id) ? "image" : "live"}
          size={isCompactWidget ? "compact" : "full"}
          isSelected={dropTarget}
          isDragging={dragging}
        >
          <ComponentChartPreview item={item} />
        </WidgetFrame>
      )}

      {!readOnly && (
        <button
          type="button"
          className="dd-component-card__remove"
          aria-label={`Remove ${item.name}`}
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          <TrashIcon width={16} height={16} aria-hidden="true" />
        </button>
      )}
      {!readOnly && (
        <span
          className="resize-corner dd-component-card__resize-corner"
          aria-hidden="true"
        >
          <svg viewBox="0 0 32 32" fill="none">
            <path d="M31 4V16A16 16 0 0 1 16 31H4" />
          </svg>
        </span>
      )}
    </article>
  );
}

function DeepDiveComponentGrid({
  components,
  readOnly = false,
  onRemove,
  onReorder,
}: {
  components: DeepDiveComponentRef[];
  readOnly?: boolean;
  onRemove: (uid: number) => void;
  onReorder: (fromUid: number, toUid: number) => void;
}) {
  const [dragUid, setDragUid] = useState<number | null>(null);
  const [dropUid, setDropUid] = useState<number | null>(null);
  const lastOverUid = useRef<number | null>(null);
  const dragUidRef = useRef<number | null>(null);

  const renderComponentCard = (component: DeepDiveComponentRef) => {
    const item = componentById(component.componentId);
    if (!item) return null;
    return (
      <DeepDiveComponentCard
        key={component.uid}
        uid={component.uid}
        item={item}
        compact={component.compact}
        readOnly={readOnly}
        dragging={dragUid === component.uid}
        dropTarget={dropUid === component.uid && dragUid !== component.uid}
        onRemove={() => onRemove(component.uid)}
        onDragStart={() => {
          dragUidRef.current = component.uid;
          setDragUid(component.uid);
        }}
        onDragEnd={() => {
          dragUidRef.current = null;
          lastOverUid.current = null;
          setDragUid(null);
          setDropUid(null);
        }}
        onDragOver={() => {
          const fromUid = dragUidRef.current;
          if (
            fromUid !== null &&
            fromUid !== component.uid &&
            lastOverUid.current !== component.uid
          ) {
            lastOverUid.current = component.uid;
            onReorder(fromUid, component.uid);
          }
          setDropUid(component.uid);
        }}
        onDrop={() => {
          lastOverUid.current = null;
          setDragUid(null);
          setDropUid(null);
        }}
      />
    );
  };

  if (!readOnly) {
    const usedSlots = components.reduce(
      (total, component) =>
        total +
        (isLargeSquarePreviewComponent(component.componentId)
          ? 4
          : isSquarePreviewComponent(component.componentId)
            ? 1
            : 2),
      0,
    );
    const remainingSlots = Math.max(0, MODULAR_SLOT_COUNT - usedSlots);
    return (
      <div
        className={"dd-panel__grid" + (dragUid !== null ? " is-reordering" : "")}
      >
        <div
          className="dd-modular-grid"
          onDragOver={(event) => {
            if (dragUidRef.current === null) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
        >
          {components.map((component) => renderComponentCard(component))}
          {Array.from({ length: remainingSlots }, (_, index) => (
            <div className="dd-modular-grid__slot" key={`slot-${index}`} aria-hidden="true" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="dd-panel__grid dd-panel__grid--preview">
      <div className="dd-modular-grid dd-modular-grid--preview-content">
        {components.map((component) => renderComponentCard(component))}
      </div>
    </div>
  );
}

function DeepDivePreviewTabs({
  tabs,
  activeTabId,
  onSelect,
}: {
  tabs: DeepDiveTab[];
  activeTabId: number;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="dd-preview-tabs" role="tablist" aria-label="Deep dive tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className={"dd-preview-tab" + (tab.id === activeTabId ? " is-active" : "")}
          aria-selected={tab.id === activeTabId}
          onClick={() => onSelect(tab.id)}
        >
          {tab.name}
        </button>
      ))}
    </div>
  );
}

export default function DeepDiveStep() {
  const initialTab = createTab();
  const [tabs, setTabs] = useState<DeepDiveTab[]>([initialTab]);
  const [activeTabId, setActiveTabId] = useState(initialTab.id);
  const [viewMode, setViewMode] = useState<DeepDiveViewMode>("edit");
  const [editingTabId, setEditingTabId] = useState<number | null>(null);
  const [dragTabId, setDragTabId] = useState<number | null>(null);
  const [dropTabId, setDropTabId] = useState<number | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const lastOverTabId = useRef<number | null>(null);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const appliedIds = activeTab?.components.map((component) => component.componentId) ?? [];

  const updateActiveTabComponents = useCallback(
    (updater: (components: DeepDiveComponentRef[]) => DeepDiveComponentRef[]) => {
      setTabs((current) =>
        current.map((tab) =>
          tab.id === activeTabId ? { ...tab, components: updater(tab.components) } : tab,
        ),
      );
    },
    [activeTabId],
  );

  const addTab = () => {
    const tab = createTab(tabs.length > 0 ? `New Tab ${tabs.length + 1}` : "New Tab");
    setTabs((current) => [...current, tab]);
    setActiveTabId(tab.id);
    setEditingTabId(null);
  };

  const removeTab = (id: number) => {
    setTabs((current) => {
      if (current.length <= 1) return current;
      const next = current.filter((tab) => tab.id !== id);
      if (activeTabId === id) setActiveTabId(next[0]?.id ?? 0);
      if (editingTabId === id) setEditingTabId(null);
      return next;
    });
  };

  const renameTab = (id: number, name: string) => {
    setTabs((current) => current.map((tab) => (tab.id === id ? { ...tab, name } : tab)));
  };

  const startEditing = (id: number) => {
    setActiveTabId(id);
    setEditingTabId(id);
  };

  const finishEditing = () => {
    setTabs((current) =>
      current.map((tab) =>
        tab.id === editingTabId ? { ...tab, name: tab.name.trim() || "New Tab" } : tab,
      ),
    );
    setEditingTabId(null);
  };

  const reorderTabs = useCallback((fromId: number, toId: number) => {
    setTabs((current) => {
      const fromIndex = current.findIndex((tab) => tab.id === fromId);
      const toIndex = current.findIndex((tab) => tab.id === toId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const addComponents = (items: ComponentLibraryItem[]) => {
    if (!activeTab) return;
    setTabs((current) =>
      current.map((tab) => {
        if (tab.id !== activeTab.id) return tab;
        const existing = new Set(tab.components.map((component) => component.componentId));
        const additions = items
          .filter((item) => !existing.has(item.id))
          .map((item) => ({
            uid: nextComponentUid(),
            componentId: item.id,
            compact: false,
          }));
        return { ...tab, components: [...tab.components, ...additions] };
      }),
    );
  };

  const removeComponent = (uid: number) => {
    updateActiveTabComponents((components) => components.filter((component) => component.uid !== uid));
  };

  const reorderComponents = (fromUid: number, toUid: number) => {
    updateActiveTabComponents((components) => {
      const fromIndex = components.findIndex((component) => component.uid === fromUid);
      const toIndex = components.findIndex((component) => component.uid === toUid);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return components;
      const next = [...components];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  return (
    <div className={"dd-step" + (viewMode === "preview" ? " dd-step--preview" : "")}>
      <header className="dd-step__head">
        <h2 className="dd-step__title">Deep Dive</h2>
        <div className="seg-toggle dd-step__mode-toggle" role="group" aria-label="Deep dive view mode">
          <button
            type="button"
            className={"seg-toggle__btn" + (viewMode === "edit" ? " is-active" : "")}
            aria-pressed={viewMode === "edit"}
            onClick={() => setViewMode("edit")}
          >
            Edit
          </button>
          <button
            type="button"
            className={"seg-toggle__btn" + (viewMode === "preview" ? " is-active" : "")}
            aria-pressed={viewMode === "preview"}
            onClick={() => setViewMode("preview")}
          >
            Preview
          </button>
        </div>
      </header>

      {viewMode === "edit" ? (
        <>
          <div className={"dd-tabs" + (dragTabId !== null ? " is-reordering" : "")}>
            {tabs.map((tab) => (
              <DeepDiveTabChip
                key={tab.id}
                tab={tab}
                active={tab.id === activeTabId}
                editing={editingTabId === tab.id}
                dragging={dragTabId === tab.id}
                dropTarget={dropTabId === tab.id && dragTabId !== tab.id}
                onSelect={() => {
                  setActiveTabId(tab.id);
                  setEditingTabId(null);
                }}
                onEdit={() => startEditing(tab.id)}
                onRename={(name) => renameTab(tab.id, name)}
                onFinishRename={finishEditing}
                onRemove={() => removeTab(tab.id)}
                onDragStart={() => setDragTabId(tab.id)}
                onDragEnd={() => {
                  lastOverTabId.current = null;
                  setDragTabId(null);
                  setDropTabId(null);
                }}
                onDragOver={() => {
                  if (dragTabId !== null && dragTabId !== tab.id && lastOverTabId.current !== tab.id) {
                    lastOverTabId.current = tab.id;
                    reorderTabs(dragTabId, tab.id);
                  }
                  setDropTabId(tab.id);
                }}
                onDrop={() => {
                  lastOverTabId.current = null;
                  setDragTabId(null);
                  setDropTabId(null);
                }}
              />
            ))}

            <button type="button" className="dd-tab-add" onClick={addTab}>
              <PlusIcon width={14} height={14} aria-hidden="true" />
              <span>Add Tab</span>
            </button>
          </div>

          <section className="dd-panel" aria-label={activeTab ? `${activeTab.name} assets` : "Tab assets"}>
            <button type="button" className="dd-panel__add" onClick={() => setAddModalOpen(true)}>
              <PlusIcon width={14} height={14} aria-hidden="true" />
              <span>Add Asset</span>
            </button>

            {activeTab && activeTab.components.length > 0 ? (
              <DeepDiveComponentGrid
                components={activeTab.components}
                onRemove={removeComponent}
                onReorder={reorderComponents}
              />
            ) : (
              <div className="dd-panel__empty" aria-label="No assets added to this tab">
                <div className="dd-modular-grid dd-modular-grid--empty" aria-hidden="true">
                  {Array.from({ length: MODULAR_SLOT_COUNT }, (_, index) => (
                    <div className="dd-modular-grid__slot" key={index} />
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="dd-preview-stage" aria-label="Deep dive preview">
          <DeepDivePreviewTabs
            tabs={tabs}
            activeTabId={activeTabId}
            onSelect={setActiveTabId}
          />

          {activeTab && activeTab.components.length > 0 ? (
            <DeepDiveComponentGrid
              components={activeTab.components}
              readOnly
              onRemove={removeComponent}
              onReorder={reorderComponents}
            />
          ) : (
            <div className="dd-preview-stage__empty">
              <span className="dd-panel__empty-icon" aria-hidden="true">
                <GridFour size={28} weight="regular" />
              </span>
              <p>No assets added to this tab</p>
            </div>
          )}
        </section>
      )}

      {viewMode === "edit" && (
      <AddComponentModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        excludedIds={appliedIds}
        onAdd={(items) => {
          addComponents(items);
          setAddModalOpen(false);
        }}
      />
      )}
    </div>
  );
}
