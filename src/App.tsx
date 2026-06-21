import { useState } from "react";
import EditComponentModal from "./EditComponentModal";
import {
  SearchIcon,
  PlusIcon,
  BellIcon,
  InfoIcon,
  Glyph,
} from "./icons";

const NAV: { label: string; d: string }[] = [
  { label: "Organization", d: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4" },
  { label: "Components", d: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
  { label: "Filters", d: "M4 5h16l-6 8v6l-4-2v-4z" },
  { label: "Events", d: "M3 5h18v16H3zM3 9h18M8 3v4M16 3v4" },
  { label: "AI Models", d: "M12 3l2.5 5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-1z" },
  { label: "Data Sources", d: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" },
  { label: "Workspaces", d: "M3 7h18v12H3zM3 7l3-3h6l3 3" },
  { label: "Users", d: "M16 21v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
  { label: "Security", d: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" },
  { label: "Reporting", d: "M5 21V9m7 12V3m7 18v-7" },
  { label: "Scheduled Queries", d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" },
  { label: "Backup & Restore", d: "M21 12a9 9 0 1 1-3-6.7M21 4v4h-4" },
  { label: "Theme", d: "M12 3a9 9 0 1 0 9 9c0-.5-2-.2-3-1-1.2-1-.5-3-2-4-1.2-.8-2 .5-3.5 0C11 6 12.5 4 12 3z" },
];

type Row = {
  name: string;
  category: string;
  type: string;
  date: string;
};

const ROWS: Row[] = [
  { name: "Annual New Hires Trend Line Chart", category: "Operations", type: "Data_chart", date: "5/10/2026" },
  { name: "Annual Revenue Bar Chart", category: "Finance", type: "Data_chart", date: "4/21/2026" },
  { name: "Average Dispatch Time", category: "Operations", type: "Data_chart", date: "5/3/2026" },
  { name: "Average Handling Cost", category: "Finance", type: "Data_chart", date: "4/25/2026" },
  { name: "Average Order Value", category: "Sales", type: "Data_chart", date: "4/6/2026" },
  { name: "Average Resolution Time", category: "Support", type: "Data_chart", date: "4/20/2026" },
  { name: "Average Response Latency", category: "Engineering", type: "Data_chart", date: "4/30/2026" },
  { name: "Average Session Duration", category: "Product", type: "Data_chart", date: "4/28/2026" },
  { name: "Average Ticket Volume", category: "Support", type: "Data_chart", date: "4/6/2026" },
  { name: "Average Time To Hire", category: "People", type: "Data_chart", date: "4/26/2026" },
  { name: "Average Traffic Speed By Road Type", category: "Traffic", type: "Data_chart", date: "4/27/2026" },
];

function Sparkline() {
  return (
    <svg width="40" height="22" viewBox="0 0 40 22" className="spark">
      <polyline
        points="1,18 7,12 13,15 19,7 25,11 31,4 39,9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function App() {
  const [modalOpen, setModalOpen] = useState(true);

  return (
    <div className="app">
      <div id="mesh-gradient-bg" aria-hidden="true" />

      {/* Top bar */}
      <header className="topbar">
        <div className="brand">
          <span className="brand__logo">◆</span>
          <span className="brand__name">Lumen</span>
        </div>
        <div className="topbar__search">
          <SearchIcon width={15} height={15} />
          <input placeholder="Search" />
        </div>
        <div className="topbar__actions">
          <button className="btn btn--primary btn--sm">
            <PlusIcon width={15} height={15} />
            <span>Create</span>
          </button>
          <button className="icon-btn icon-btn--round">
            <BellIcon width={17} height={17} />
            <span className="badge-dot" />
          </button>
          <div className="avatar" />
        </div>
      </header>

      <div className="layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <p className="sidebar__caption">Platform Settings</p>
          <nav>
            {NAV.map((n) => (
              <button
                key={n.label}
                className={
                  "nav-item" + (n.label === "Components" ? " is-active" : "")
                }
              >
                <Glyph d={n.d} width={16} height={16} />
                <span>{n.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Main */}
        <main className="main">
          <div className="table">
            <div className="table__body">
              {ROWS.map((r) => (
                <button
                  key={r.name}
                  className="row"
                  onClick={() => setModalOpen(true)}
                >
                  <span className="row__icon">
                    <Sparkline />
                  </span>
                  <span className="row__name">{r.name}</span>
                  <span className="row__cat">{r.category}</span>
                  <span className="row__type">{r.type}</span>
                  <span className="row__status">
                    <span className="status-badge">● Active</span>
                  </span>
                  <span className="row__date">{r.date}</span>
                  <span className="row__more">
                    <span>
                      <InfoIcon width={15} height={15} />
                    </span>
                  </span>
                </button>
              ))}
            </div>

            <div className="table__footer">
              <div className="pager-left">
                <span>Items per page</span>
                <span className="pill">25</span>
              </div>
              <span className="pager-mid">1–25 of 198</span>
              <div className="pager-right">
                <button className="pg is-active">1</button>
                <button className="pg">2</button>
                <button className="pg">3</button>
                <button className="pg">›</button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {modalOpen && <EditComponentModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}
