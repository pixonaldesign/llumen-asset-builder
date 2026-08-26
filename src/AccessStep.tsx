import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";
import { PlusIcon, ChevronDownIcon } from "./icons";
import Dropdown from "./Dropdown";

type AccessLevel = "full" | "limited" | "view";

type AccessMember = {
  id: string;
  name: string;
  email: string;
  initials: string;
  access: AccessLevel;
  isAdmin?: boolean;
};

type AccessGroup = {
  id: string;
  label: string;
  members: AccessMember[];
};

const ACCESS_LEVELS: { value: AccessLevel; label: string }[] = [
  { value: "full", label: "Full access" },
  { value: "limited", label: "Limited access" },
  { value: "view", label: "View only" },
];

const INITIAL_GROUPS: AccessGroup[] = [
  {
    id: "planning",
    label: "Planning",
    members: [
      {
        id: "planning-1",
        name: "John Doe",
        email: "john.doe@example.com",
        initials: "JD",
        access: "full",
        isAdmin: true,
      },
      {
        id: "planning-2",
        name: "John Smith",
        email: "john.smith@example.com",
        initials: "JS",
        access: "limited",
      },
      {
        id: "planning-3",
        name: "John Doe",
        email: "john.doe@example.com",
        initials: "JD",
        access: "view",
      },
    ],
  },
  {
    id: "chairman",
    label: "Chairman Office",
    members: [
      {
        id: "chairman-1",
        name: "John Doe",
        email: "john.doe@example.com",
        initials: "JD",
        access: "full",
      },
      {
        id: "chairman-2",
        name: "John Doe",
        email: "john.doe@example.com",
        initials: "JD",
        access: "limited",
      },
      {
        id: "chairman-3",
        name: "John Smith",
        email: "john.smith@example.com",
        initials: "JS",
        access: "view",
      },
      {
        id: "chairman-4",
        name: "John Doe",
        email: "john.doe@example.com",
        initials: "JD",
        access: "full",
      },
    ],
  },
];

type FlyoutPos = { top: number; left: number; width: number };

function measureAccessMenuPosition(trigger: HTMLElement | null, menuWidth: number, gap = 6): FlyoutPos | null {
  if (!trigger) return null;
  const rect = trigger.getBoundingClientRect();
  return {
    top: rect.bottom + gap,
    left: rect.right - menuWidth,
    width: menuWidth,
  };
}

function AccessLevelSelect({
  value,
  onChange,
}: {
  value: AccessLevel;
  onChange: (value: AccessLevel) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<FlyoutPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = ACCESS_LEVELS.find((level) => level.value === value);

  const syncPosition = useCallback(() => {
    const next = measureAccessMenuPosition(triggerRef.current, 168);
    if (next) setPos(next);
  }, []);

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

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={
          "access-level-select" +
          (open ? " is-open" : "") +
          (!selected ? " is-placeholder" : "")
        }
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={toggle}
      >
        <span className="access-level-select__label">{selected?.label ?? "Select access"}</span>
        <ChevronDownIcon className="access-level-select__caret" width={16} height={16} aria-hidden="true" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            className="access-level-menu"
            role="listbox"
            aria-label="Access level"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            <ul className="access-level-menu__list">
              {ACCESS_LEVELS.map((level) => (
                <li key={level.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={level.value === value}
                    className={"access-level-menu__option" + (level.value === value ? " is-selected" : "")}
                    onClick={() => {
                      onChange(level.value);
                      setOpen(false);
                    }}
                  >
                    {level.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}

function AccessMemberRow({
  member,
  onAccessChange,
}: {
  member: AccessMember;
  onAccessChange: (access: AccessLevel) => void;
}) {
  return (
    <li className="access-row">
      <div className="access-row__identity">
        <span className="access-row__avatar" aria-hidden="true">
          {member.initials}
        </span>
        <div className="access-row__details">
          <div className="access-row__name-line">
            <span className="access-row__name">{member.name}</span>
            {member.isAdmin && <span className="access-row__badge">Admin</span>}
          </div>
          <span className="access-row__email">{member.email}</span>
        </div>
      </div>
      <AccessLevelSelect value={member.access} onChange={onAccessChange} />
    </li>
  );
}

export default function AccessStep() {
  const [inviteQuery, setInviteQuery] = useState("");
  const [groups, setGroups] = useState(INITIAL_GROUPS);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteTarget, setInviteTarget] = useState("");
  const [inviteAccess, setInviteAccess] = useState<AccessLevel>("view");
  const [inviteMessage, setInviteMessage] = useState("");

  useEffect(() => {
    if (!inviteModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setInviteModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inviteModalOpen]);

  const updateMemberAccess = (groupId: string, memberId: string, access: AccessLevel) => {
    setGroups((current) =>
      current.map((group) =>
        group.id !== groupId
          ? group
          : {
              ...group,
              members: group.members.map((member) =>
                member.id === memberId ? { ...member, access } : member,
              ),
            },
      ),
    );
  };

  const sendInvite = () => {
    const target = inviteTarget.trim();
    if (!target) return;
    const localName = target.includes("@") ? target.split("@")[0] : target;
    const name = localName
      .split(/[._\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    const initials =
      name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "IN";

    setGroups((current) =>
      current.map((group, index) =>
        index === 0
          ? {
              ...group,
              members: [
                ...group.members,
                {
                  id: `invite-${Date.now()}`,
                  name,
                  email: target,
                  initials,
                  access: inviteAccess,
                },
              ],
            }
          : group,
      ),
    );
    setInviteQuery("");
    setInviteTarget("");
    setInviteMessage("");
    setInviteAccess("view");
    setInviteModalOpen(false);
  };

  return (
    <>
      <div className="access-step">
      <h3 className="access-step__title">Access</h3>

      <div className="access-step__invite">
        <input
          className="access-step__invite-input"
          type="text"
          value={inviteQuery}
          onChange={(e) => setInviteQuery(e.target.value)}
          placeholder="Add workspaces or people"
          aria-label="Add workspaces or people"
        />
        <button
          type="button"
          className="access-step__invite-btn"
          onClick={() => {
            setInviteTarget(inviteQuery);
            setInviteModalOpen(true);
          }}
        >
          <PlusIcon width={14} height={14} aria-hidden="true" />
          <span>Invite</span>
        </button>
      </div>

      <div className="access-step__groups">
        {groups.map((group, index) => (
          <Fragment key={group.id}>
            {index > 0 && <hr className="access-step__separator" aria-hidden="true" />}
            <section className="access-group">
              <h4 className="access-group__label">{group.label}</h4>
              <ul className="access-group__list">
                {group.members.map((member) => (
                  <AccessMemberRow
                    key={member.id}
                    member={member}
                    onAccessChange={(access) => updateMemberAccess(group.id, member.id, access)}
                  />
                ))}
              </ul>
            </section>
          </Fragment>
        ))}
      </div>
      </div>

      {inviteModalOpen &&
        createPortal(
          <div
            className="access-invite-overlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setInviteModalOpen(false);
            }}
          >
            <form
              className="access-invite-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="access-invite-title"
              onSubmit={(event) => {
                event.preventDefault();
                sendInvite();
              }}
            >
              <header className="access-invite-modal__header">
                <div>
                  <h2 id="access-invite-title">Invite people or workspaces</h2>
                  <p>Grant access to this asset and choose their permission level.</p>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setInviteModalOpen(false)}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </header>

              <div className="access-invite-modal__fields">
                <label>
                  <span>
                    People or workspace <i>*</i>
                  </span>
                  <input
                    type="text"
                    value={inviteTarget}
                    onChange={(event) => setInviteTarget(event.target.value)}
                    placeholder="Enter an email or workspace name"
                    autoFocus
                  />
                </label>

                <label>
                  <span>Access level</span>
                  <Dropdown
                    value={inviteAccess}
                    onChange={(value) => setInviteAccess(value as AccessLevel)}
                    options={ACCESS_LEVELS}
                    ariaLabel="Access level"
                    menuClassName="access-invite-access-menu"
                    compact
                  />
                </label>

                <label>
                  <span>Message (Optional)</span>
                  <textarea
                    value={inviteMessage}
                    onChange={(event) => setInviteMessage(event.target.value)}
                    placeholder="Add a message to the invitation"
                    rows={3}
                  />
                </label>
              </div>

              <footer className="access-invite-modal__footer">
                <button type="button" onClick={() => setInviteModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={!inviteTarget.trim()}>
                  Send Invite
                </button>
              </footer>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}
