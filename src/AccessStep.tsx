import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";
import { ChevronDownIcon, TrashIcon } from "./icons";

type AccessLevel = "full" | "limited" | "view";

type AccessMember = {
  id: string;
  name: string;
  email: string;
  initials: string;
  access: AccessLevel;
  isAdmin?: boolean;
};

type InviteCandidate = {
  id: string;
  name: string;
  email: string;
  initials: string;
};

const ACCESS_LEVELS: { value: AccessLevel; label: string }[] = [
  { value: "full", label: "Full access" },
  { value: "limited", label: "Limited access" },
  { value: "view", label: "View only" },
];

const INVITE_ACCESS_LEVELS: { value: AccessLevel; label: string }[] = [
  { value: "view", label: "Can view" },
  { value: "limited", label: "Limited access" },
  { value: "full", label: "Full access" },
];

const INVITE_DIRECTORY: InviteCandidate[] = [
  {
    id: "dir-jane",
    name: "Jane Cooper",
    email: "jane.cooper@llumen.com",
    initials: "JC",
  },
  {
    id: "dir-michael",
    name: "Michael Chen",
    email: "michael.chen@llumen.com",
    initials: "MC",
  },
  {
    id: "dir-sarah",
    name: "Sarah Williams",
    email: "sarah.williams@llumen.com",
    initials: "SW",
  },
  {
    id: "dir-david",
    name: "David Patel",
    email: "david.patel@llumen.com",
    initials: "DP",
  },
];

function candidateFromQuery(query: string): InviteCandidate {
  const target = query.trim();
  const localName = target.includes("@") ? target.split("@")[0] : target;
  const name = localName
    .split(/[._\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || target;
  const initials =
    name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "IN";
  return {
    id: `typed-${target.toLowerCase()}`,
    name,
    email: target.includes("@") ? target : `${localName.toLowerCase().replace(/\s+/g, ".")}@llumen.com`,
    initials,
  };
}

const INITIAL_MEMBERS: AccessMember[] = [
  {
    id: "member-1",
    name: "John Doe",
    email: "john.doe@example.com",
    initials: "JD",
    access: "full",
    isAdmin: true,
  },
  {
    id: "member-2",
    name: "John Smith",
    email: "john.smith@example.com",
    initials: "JS",
    access: "limited",
  },
  {
    id: "member-3",
    name: "John Doe",
    email: "john.doe@example.com",
    initials: "JD",
    access: "view",
  },
  {
    id: "member-4",
    name: "John Doe",
    email: "john.doe@example.com",
    initials: "JD",
    access: "full",
  },
  {
    id: "member-5",
    name: "John Doe",
    email: "john.doe@example.com",
    initials: "JD",
    access: "limited",
  },
  {
    id: "member-6",
    name: "John Smith",
    email: "john.smith@example.com",
    initials: "JS",
    access: "view",
  },
  {
    id: "member-7",
    name: "John Doe",
    email: "john.doe@example.com",
    initials: "JD",
    access: "full",
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
  options = ACCESS_LEVELS,
  className,
}: {
  value: AccessLevel;
  onChange: (value: AccessLevel) => void;
  options?: { value: AccessLevel; label: string }[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<FlyoutPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((level) => level.value === value);

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
          (!selected ? " is-placeholder" : "") +
          (className ? ` ${className}` : "")
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
              {options.map((level) => (
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
  onRemove,
}: {
  member: AccessMember;
  onAccessChange: (access: AccessLevel) => void;
  onRemove: () => void;
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
      <div className="access-row__actions">
        <AccessLevelSelect value={member.access} onChange={onAccessChange} />
        {member.isAdmin ? (
          <span className="access-row__remove" aria-hidden="true" />
        ) : (
          <button
            type="button"
            className="access-row__remove"
            aria-label={`Remove ${member.name}`}
            onClick={onRemove}
          >
            <TrashIcon width={16} height={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </li>
  );
}

export default function AccessStep() {
  const [inviteQuery, setInviteQuery] = useState("");
  const [pendingInvites, setPendingInvites] = useState<InviteCandidate[]>([]);
  const [members, setMembers] = useState(INITIAL_MEMBERS);
  const [inviteAccess, setInviteAccess] = useState<AccessLevel>("view");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const inviteFieldRef = useRef<HTMLDivElement>(null);
  const inviteInputRef = useRef<HTMLInputElement>(null);

  const takenEmails = useMemo(() => {
    const emails = new Set(pendingInvites.map((item) => item.email.toLowerCase()));
    members.forEach((member) => emails.add(member.email.toLowerCase()));
    return emails;
  }, [members, pendingInvites]);

  const suggestions = useMemo(() => {
    const query = inviteQuery.trim().toLowerCase();
    return INVITE_DIRECTORY.filter((person) => {
      if (takenEmails.has(person.email.toLowerCase())) return false;
      if (!query) return true;
      return (
        person.name.toLowerCase().includes(query) ||
        person.email.toLowerCase().includes(query)
      );
    });
  }, [inviteQuery, takenEmails]);

  useEffect(() => {
    if (!suggestOpen) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (inviteFieldRef.current?.contains(target)) return;
      setSuggestOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [suggestOpen]);

  const addPending = (candidate: InviteCandidate) => {
    setPendingInvites((current) => {
      if (current.some((item) => item.email.toLowerCase() === candidate.email.toLowerCase())) {
        return current;
      }
      return [...current, candidate];
    });
    setInviteQuery("");
    setSuggestOpen(false);
    inviteInputRef.current?.focus();
  };

  const removePending = (id: string) => {
    setPendingInvites((current) => current.filter((item) => item.id !== id));
    inviteInputRef.current?.focus();
  };

  const updateMemberAccess = (memberId: string, access: AccessLevel) => {
    setMembers((current) =>
      current.map((member) => (member.id === memberId ? { ...member, access } : member)),
    );
  };

  const removeMember = (memberId: string) => {
    setMembers((current) => current.filter((member) => member.id !== memberId));
  };

  const sendInvite = () => {
    const toAdd =
      pendingInvites.length > 0
        ? pendingInvites
        : inviteQuery.trim()
          ? [candidateFromQuery(inviteQuery)]
          : [];
    if (!toAdd.length) return;

    setMembers((current) => [
      ...current,
      ...toAdd.map((person) => ({
        id: `invite-${person.id}-${Date.now()}`,
        name: person.name,
        email: person.email,
        initials: person.initials,
        access: inviteAccess,
      })),
    ]);
    setPendingInvites([]);
    setInviteQuery("");
    setInviteAccess("view");
    setSuggestOpen(false);
  };

  return (
    <div className="access-step">
      <h3 className="access-step__title">Access</h3>

      <div className="access-step__invite">
        <div
          ref={inviteFieldRef}
          className={"access-step__invite-field" + (suggestOpen ? " is-open" : "")}
          onMouseDown={(event) => {
            if ((event.target as HTMLElement).closest("button")) return;
            inviteInputRef.current?.focus();
          }}
        >
          <div className="access-step__invite-tokens">
            {pendingInvites.map((person) => (
              <span key={person.id} className="access-step__invite-chip">
                {person.name}
                <button
                  type="button"
                  aria-label={`Remove ${person.name}`}
                  onClick={() => removePending(person.id)}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </span>
            ))}
            <input
              ref={inviteInputRef}
              className="access-step__invite-input"
              type="text"
              value={inviteQuery}
              onChange={(event) => {
                setInviteQuery(event.target.value);
                setSuggestOpen(true);
              }}
              onFocus={() => setSuggestOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setSuggestOpen(false);
                  return;
                }
                if (event.key === "Backspace" && !inviteQuery && pendingInvites.length) {
                  event.preventDefault();
                  removePending(pendingInvites[pendingInvites.length - 1].id);
                  return;
                }
                if (event.key !== "Enter") return;
                event.preventDefault();
                if (suggestions[0]) addPending(suggestions[0]);
                else if (inviteQuery.trim()) addPending(candidateFromQuery(inviteQuery));
              }}
              placeholder={pendingInvites.length ? "" : "Add workspaces or people"}
              aria-label="Add workspaces or people"
              aria-autocomplete="list"
              aria-expanded={suggestOpen}
            />
          </div>
          {pendingInvites.length > 0 && (
            <AccessLevelSelect
              value={inviteAccess}
              onChange={setInviteAccess}
              options={INVITE_ACCESS_LEVELS}
              className="access-level-select--embed"
            />
          )}
          {suggestOpen && suggestions.length > 0 && (
            <div className="access-step__invite-suggest" role="listbox" aria-label="People and workspaces">
              {suggestions.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  role="option"
                  className="access-step__invite-suggest-row"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => addPending(person)}
                >
                  <span className="access-row__avatar" aria-hidden="true">
                    {person.initials}
                  </span>
                  <span>
                    <strong>{person.name}</strong>
                    <small>{person.email.startsWith("workspace:") ? "Workspace" : person.email}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className="pg-btn pg-btn--primary access-step__invite-btn"
          disabled={pendingInvites.length === 0 && !inviteQuery.trim()}
          onClick={sendInvite}
        >
          Invite
        </button>
      </div>

      <ul className="access-step__list">
        {members.map((member) => (
          <AccessMemberRow
            key={member.id}
            member={member}
            onAccessChange={(access) => updateMemberAccess(member.id, access)}
            onRemove={() => removeMember(member.id)}
          />
        ))}
      </ul>
    </div>
  );
}
