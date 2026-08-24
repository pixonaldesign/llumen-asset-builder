import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  CaretDown,
  CheckCircle,
  CirclesFour,
  Database,
  File,
  FileArrowUp,
  FunnelSimple,
  FlowArrow,
  Globe,
  Info,
  MagnifyingGlass,
  Play,
  Plus,
  Sparkle,
  Stack,
  Trash,
  UploadSimple,
  X,
} from "@phosphor-icons/react";

type SourceType = "database" | "api" | "file-upload" | "ai-model" | "ml-model" | "data-flow";
type MlInputSource = "database" | "api" | "file-source" | "local-file";
type PickerContext = "source" | "ml";
type DatabaseType = "MySQL" | "PostgreSQL" | "SQL Server" | "Oracle" | "SQLite";
type DatabaseSort = "default" | "updated" | "name-asc" | "name-desc";

type DatabaseConnection = {
  id: string;
  name: string;
  description: string;
  schema: string;
  active: boolean;
};

type ApiSource = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  lastUpdated: string;
  requests: ApiRequest[];
};

type ApiMethod = "GET" | "POST";
type ApiAuth = "No Authentication" | "Bearer Token" | "Basic Auth" | "API Key";
type ApiSort = "default" | "updated" | "name-asc" | "name-desc";

type ApiRequest = {
  id: string;
  name: string;
  method: ApiMethod;
  endpoint: string;
  description: string;
  auth: ApiAuth;
  lastUpdated: string;
};

type FileSource = {
  id: string;
  name: string;
  fileName: string;
  rows: number;
  tableName: string;
  active: boolean;
};

type DataFlow = {
  id: string;
  name: string;
  description: string;
  columns: string[];
};

type SourceTypeOption = {
  id: SourceType;
  title: string;
  description: string;
  icon: ReactNode;
};

type MlInputOption = {
  id: MlInputSource;
  title: string;
  description: string;
  icon: ReactNode;
};

type DevDataSourceState = {
  sourceType: SourceType | null;
  mlInputSource: MlInputSource | null;
  databasePickerOpen: boolean;
  databasePickerContext: PickerContext;
  selectedDatabaseId: string | null;
  draftDatabaseId: string | null;
  apiPickerOpen: boolean;
  apiPickerContext: PickerContext;
  selectedApiId: string | null;
  draftApiId: string | null;
  selectedRequest: string;
  filePickerOpen: boolean;
  filePickerContext: PickerContext;
  selectedFileId: string | null;
  draftFileId: string | null;
  fileQuery: string;
  mlSelectedDatabaseId: string | null;
  mlDatabaseQuery: string;
  mlSelectedApiId: string | null;
  mlSelectedRequest: string;
  mlSelectedFileId: string | null;
  mlFileQuery: string;
  dataFlowPickerOpen: boolean;
  selectedDataFlowId: string | null;
  draftDataFlowId: string | null;
  outputProjection: string;
  query: string;
};

const DEV_DATA_SOURCE_STATE_KEY = "llumen.dev.data-source-state.v2";
const DEFAULT_DATABASE_QUERY = `SELECT
    g.grid_id,
    g.longitude,
    g.latitude,
    g.area_size_km2,
    p.population_count,
    p.population_count / g.area_size_km2 AS population_density
FROM grid g
JOIN population_data p ON g.grid_id = p.grid_id
WHERE g.district_name = 'Abu Dhabi Island'
    AND p.date BETWEEN '2024-04-10 00:00:00'
    AND '2024-04-12 23:59:59'
ORDER BY population_density DESC;`;

function readDevDataSourceState(): Partial<DevDataSourceState> {
  try {
    return JSON.parse(sessionStorage.getItem(DEV_DATA_SOURCE_STATE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

const SOURCE_TYPES: SourceTypeOption[] = [
  {
    id: "database",
    title: "Database",
    description: "Connect to SQL, PostgreSQL, MySQL, or other databases",
    icon: <Database size={20} aria-hidden="true" />,
  },
  {
    id: "api",
    title: "API",
    description: "Connect to REST APIs, GraphQL, or web services",
    icon: <CirclesFour size={20} aria-hidden="true" />,
  },
  {
    id: "file-upload",
    title: "File Upload",
    description: "Select from source-backed uploaded files",
    icon: <FileArrowUp size={20} aria-hidden="true" />,
  },
  {
    id: "ai-model",
    title: "AI Model",
    description: "Select from available AI models for data processing",
    icon: <Sparkle size={20} aria-hidden="true" />,
  },
  {
    id: "ml-model",
    title: "ML Model",
    description: "Connect prediction APIs or upload PKL/Joblib model files",
    icon: <Stack size={20} aria-hidden="true" />,
  },
  {
    id: "data-flow",
    title: "Data Flow",
    description: "Use a data-flow pipeline with transformations and analytics",
    icon: <FlowArrow size={20} aria-hidden="true" />,
  },
];

const ML_INPUT_SOURCES: MlInputOption[] = [
  {
    id: "database",
    title: "Database",
    description: "PostgreSQL, Snowflake, and other SQL connections from Platform Settings",
    icon: <Database size={20} aria-hidden="true" />,
  },
  {
    id: "api",
    title: "API",
    description: "REST or GraphQL API sources, same flow as standard components",
    icon: <Globe size={20} aria-hidden="true" />,
  },
  {
    id: "file-source",
    title: "File source",
    description: "Files uploaded to Llumen and registered as queryable tables",
    icon: <File size={20} aria-hidden="true" />,
  },
  {
    id: "local-file",
    title: "Local file",
    description: "Parse CSV, JSON, or GeoJSON in the browser without creating a source first",
    icon: <UploadSimple size={20} aria-hidden="true" />,
  },
];

const DATABASE_CONNECTIONS: DatabaseConnection[] = [
  { id: "itc", name: "ITC", description: "No description", schema: "fusion", active: true },
  { id: "dubai", name: "Dubai", description: "No description", schema: "Database", active: false },
  {
    id: "aimsun",
    name: "Aimsun",
    description: "Traffic management data for road network. Includes road sections with geometry and sensors.",
    schema: "Database",
    active: false,
  },
  {
    id: "energy",
    name: "Energy",
    description: "UAE Energy & Sustainability Operations",
    schema: "Database",
    active: true,
  },
  { id: "itc-pg", name: "ITC PG", description: "No description", schema: "Database", active: false },
  {
    id: "itc-fusion",
    name: "ITC Fusion DB",
    description: "No description",
    schema: "Database",
    active: false,
  },
  { id: "waste", name: "Waste", description: "UAE Waste Data", schema: "Database", active: true },
  {
    id: "itc-postgres",
    name: "ITC - Postgres",
    description: "No description",
    schema: "Database",
    active: false,
  },
  {
    id: "security",
    name: "Security",
    description: "UAE Safety & Security Data",
    schema: "Database",
    active: true,
  },
  {
    id: "employees",
    name: "Employees",
    description: "Sample Employee Database",
    schema: "Database",
    active: true,
  },
  {
    id: "commerce",
    name: "Commerce",
    description: "Sample Retail & Fulfillment Operations Data",
    schema: "Database",
    active: true,
  },
];

const DATABASE_TYPES: DatabaseType[] = ["MySQL", "PostgreSQL", "SQL Server", "Oracle", "SQLite"];
const DATABASE_CONNECTION_META: Record<
  string,
  { type: DatabaseType; lastUpdated: string; updatedMinutes: number }
> = {
  itc: { type: "MySQL", lastUpdated: "1 hour ago", updatedMinutes: 60 },
  dubai: { type: "PostgreSQL", lastUpdated: "3 hours ago", updatedMinutes: 180 },
  aimsun: { type: "SQL Server", lastUpdated: "6 hours ago", updatedMinutes: 360 },
  energy: { type: "Oracle", lastUpdated: "2 hours ago", updatedMinutes: 120 },
  "itc-pg": { type: "PostgreSQL", lastUpdated: "30 mins ago", updatedMinutes: 30 },
  "itc-fusion": { type: "SQL Server", lastUpdated: "5 hours ago", updatedMinutes: 300 },
  waste: { type: "SQLite", lastUpdated: "45 mins ago", updatedMinutes: 45 },
  "itc-postgres": { type: "PostgreSQL", lastUpdated: "4 hours ago", updatedMinutes: 240 },
  security: { type: "MySQL", lastUpdated: "2 hours ago", updatedMinutes: 120 },
  employees: { type: "PostgreSQL", lastUpdated: "1 day ago", updatedMinutes: 1440 },
  commerce: { type: "MySQL", lastUpdated: "1 day ago", updatedMinutes: 1440 },
};

const API_SOURCES: ApiSource[] = [
  {
    id: "weather-services",
    name: "Weather Services",
    description: "Real-time weather data and forecasts",
    active: true,
    lastUpdated: "2 hours ago",
    requests: [
      {
        id: "get-current-weather",
        name: "Get Current Weather",
        method: "GET",
        endpoint: "https://api.weather.example.com/v1/current",
        description: "Retrieve current weather conditions",
        auth: "API Key",
        lastUpdated: "1 hour ago",
      },
      {
        id: "get-weather-forecast",
        name: "Get Weather Forecast",
        method: "POST",
        endpoint: "https://api.weather.example.com/v1/forecast",
        description: "Get 7-day weather forecast for location",
        auth: "No Authentication",
        lastUpdated: "45 mins ago",
      },
    ],
  },
  {
    id: "traffic-services",
    name: "Traffic Services",
    description: "Real-time traffic data and route optimization",
    active: true,
    lastUpdated: "1 day ago",
    requests: [
      {
        id: "get-traffic-flow",
        name: "Get Traffic Flow",
        method: "POST",
        endpoint: "https://api.traffic.example.com/v1/flow",
        description: "Retrieve real-time traffic flow data",
        auth: "Bearer Token",
        lastUpdated: "3 hours ago",
      },
    ],
  },
  {
    id: "customer-services",
    name: "Customer Services",
    description: "Customer data and account management",
    active: true,
    lastUpdated: "4 hours ago",
    requests: [
      {
        id: "customer-portal-api",
        name: "Customer Portal API",
        method: "GET",
        endpoint: "https://api.customer.example.com/v1/accounts",
        description: "Internal customer data and account information",
        auth: "Bearer Token",
        lastUpdated: "2 hours ago",
      },
      {
        id: "hr-system-api",
        name: "HR System API",
        method: "GET",
        endpoint: "https://api.hr.example.com/v1/employees",
        description: "Employee data and organizational structure",
        auth: "Basic Auth",
        lastUpdated: "1 day ago",
      },
    ],
  },
  {
    id: "business-services",
    name: "Business Services",
    description: "Business operations and reporting",
    active: true,
    lastUpdated: "6 hours ago",
    requests: [
      {
        id: "inventory-management-api",
        name: "Inventory Management API",
        method: "POST",
        endpoint: "https://api.business.example.com/v1/inventory",
        description: "Real-time inventory tracking and stock management",
        auth: "Bearer Token",
        lastUpdated: "30 mins ago",
      },
      {
        id: "financial-reporting-api",
        name: "Financial Reporting API",
        method: "GET",
        endpoint: "https://api.business.example.com/v1/financial-reports",
        description: "Financial data and reporting metrics",
        auth: "API Key",
        lastUpdated: "1 hour ago",
      },
    ],
  },
];

const API_AUTH_OPTIONS: ApiAuth[] = [
  "No Authentication",
  "Bearer Token",
  "Basic Auth",
  "API Key",
];
const API_METHOD_OPTIONS: ApiMethod[] = ["GET", "POST"];
const API_SORT_LABELS: Record<ApiSort, string> = {
  default: "Default",
  updated: "Last Updated",
  "name-asc": "Name (A-Z)",
  "name-desc": "Name (Z-A)",
};

function relativeTimeMinutes(value: string) {
  const amount = Number.parseInt(value, 10);
  if (value.includes("min")) return amount;
  if (value.includes("hour")) return amount * 60;
  if (value.includes("day")) return amount * 1440;
  return Number.MAX_SAFE_INTEGER;
}

const FILE_SOURCES: FileSource[] = [
  {
    id: "forecast-results",
    name: "Forecast_results_20260513new",
    fileName: "Forecast_results_20260513.db",
    rows: 15940,
    tableName: "ds_5cccff50c4644f7b5068a48711efe4e__results",
    active: true,
  },
  {
    id: "sultan-workflow-1",
    name: "Sultan Bin Zayed The First Street ridership trend chart (workflow run 1)",
    fileName: "Sultan_Bin_Zayed_The_First_Street_ridership_trend_chart_workflow_run_4103ee14.parquet",
    rows: 21,
    tableName: "ds_d0b8d812bd040be9573ada2db652221",
    active: false,
  },
  {
    id: "sultan-workflow-2",
    name: "Sultan Bin Zayed The First Street ridership trend chart (workflow run 2)",
    fileName: "Sultan_Bin_Zayed_The_First_Street_ridership_trend_chart_workflow_run_5be66496.parquet",
    rows: 21,
    tableName: "ds_5ae68eef3f184554810c382be0a6d394",
    active: false,
  },
  {
    id: "capacity-region",
    name: "2050 Capacity by Region",
    fileName: "2050_Capacity_by_Region.parquet",
    rows: 18,
    tableName: "ds_288a25da839945228c93b8674181d1a8",
    active: false,
  },
  {
    id: "capacity-trajectory",
    name: "Abu Dhabi Capacity Trajectory to 2050",
    fileName: "Abu_Dhabi_Capacity_Trajectory_to_2050.parquet",
    rows: 18,
    tableName: "ds_e39d26283ab647839634e0bb225fe507",
    active: false,
  },
  {
    id: "workflow-asset-1",
    name: "Workflow Asset",
    fileName: "Workflow_Asset.parquet",
    rows: 26,
    tableName: "ds_70bf6e1c09eb42179ba6376650178f8e",
    active: false,
  },
  {
    id: "workflow-asset-2",
    name: "Workflow Asset",
    fileName: "Hamdan_Bin_Mohammed_Street_Weekly_Trips_In.parquet",
    rows: 26,
    tableName: "ds_3633efaf71da4ec88df18de7454f3c22",
    active: false,
  },
  {
    id: "wind-hour",
    name: "wind_hour_06",
    fileName: "wind_hour_06.geojson",
    rows: 1024,
    tableName: "ds_378739805bf04501932b2ff632cdd153",
    active: false,
  },
  {
    id: "climatology",
    name: "CLIMATOLOGY_SERIES_EAD_WRF_20260406_20260408_d01",
    fileName: "CLIMATOLOGY_SERIES_EAD_WRF_20260406_20260408_d01.csv",
    rows: 4,
    tableName: "ds_900907603ae14ce09b4398d222c035e4",
    active: false,
  },
];

const DATA_FLOWS: DataFlow[] = [
  {
    id: "incident",
    name: "incident",
    description: "No description",
    columns: [
      "coords",
      "description",
      "end_time",
      "id",
      "in_simulation",
      "incident_type",
      "name",
      "section_id",
      "start_time",
      "id_1",
      "name_1",
    ],
  },
  {
    id: "untitled-data-flow-1",
    name: "Untitled DataFlow",
    description: "No description",
    columns: ["id", "name", "value", "category", "created_at", "updated_at"],
  },
  {
    id: "untitled-data-flow-2",
    name: "Untitled DataFlow",
    description: "No description",
    columns: ["id", "source", "status", "result", "timestamp"],
  },
];

function FieldHeader({
  title,
  required = true,
}: {
  title: string;
  required?: boolean;
}) {
  return (
    <div className="ds-config__header">
      <h3>{title}</h3>
      {required && (
        <div className="ds-config__header-actions">
          <span className="ds-config__required">
            <Info size={16} aria-hidden="true" />
            Required
          </span>
        </div>
      )}
    </div>
  );
}

function SourceActionField({
  label,
  icon,
  description,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  description?: string;
  onClick?: () => void;
}) {
  return (
    <>
      <button type="button" className="ds-config__action" onClick={onClick}>
        <span className="ds-config__action-icon">{icon}</span>
        <span>{label}</span>
      </button>
      {description && <p className="ds-config__helper">{description}</p>}
    </>
  );
}

function LocalFileUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const nextFile = event.dataTransfer.files[0];
    if (nextFile) setFile(nextFile);
  };

  return (
    <label
      className={"ds-local-file-upload" + (dragging ? " is-dragging" : "")}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept=".csv,.json,.geojson,application/json,text/csv,application/geo+json"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
      <UploadSimple size={30} aria-hidden="true" />
      <strong>{file?.name ?? "Click to upload"}</strong>
      <span>{file ? `${Math.max(1, Math.round(file.size / 1024))} KB` : "CSV, JSON, or GeoJSON"}</span>
    </label>
  );
}

function CreateDatabaseConnectionForm({ onClose }: { onClose: () => void }) {
  const [connectionName, setConnectionName] = useState("");
  const [databaseType, setDatabaseType] = useState("");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("3306");
  const [databaseName, setDatabaseName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const canCreate =
    connectionName.trim() &&
    databaseType &&
    host.trim() &&
    port.trim() &&
    databaseName.trim() &&
    username.trim() &&
    password;

  return (
    <form
      className="ds-create-db"
      onSubmit={(event) => {
        event.preventDefault();
        if (canCreate) onClose();
      }}
    >
      <header className="ds-create-db__header">
        <h2>Create Database Connection</h2>
        <button type="button" aria-label="Close" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="ds-create-db__fields">
        <label>
          <span>
            Connection Name <i>*</i>
          </span>
          <input
            value={connectionName}
            onChange={(event) => setConnectionName(event.target.value)}
            placeholder="Enter connection name"
            autoFocus
          />
        </label>

        <label>
          <span>
            Database Type <i>*</i>
          </span>
          <select value={databaseType} onChange={(event) => setDatabaseType(event.target.value)}>
            <option value="">Select database type</option>
            {DATABASE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>
            Host <i>*</i>
          </span>
          <input
            value={host}
            onChange={(event) => setHost(event.target.value)}
            placeholder="localhost"
          />
        </label>

        <label>
          <span>
            Port <i>*</i>
          </span>
          <input
            value={port}
            onChange={(event) => setPort(event.target.value)}
            placeholder="3306"
            inputMode="numeric"
          />
        </label>

        <label>
          <span>
            Database Name <i>*</i>
          </span>
          <input
            value={databaseName}
            onChange={(event) => setDatabaseName(event.target.value)}
            placeholder="Enter database name"
          />
        </label>

        <label>
          <span>
            Username <i>*</i>
          </span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Enter username"
            autoComplete="username"
          />
        </label>

        <label>
          <span>
            Password <i>*</i>
          </span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter password"
            autoComplete="new-password"
          />
        </label>
      </div>

      <footer className="ds-create-db__footer">
        <button type="button" className="ds-create-db__cancel" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="ds-create-db__submit" disabled={!canCreate}>
          Create Connection
        </button>
      </footer>
    </form>
  );
}

function DatabaseConnectionPicker({
  selectedId,
  onChange,
  onCancel,
  onSelect,
}: {
  selectedId: string | null;
  onChange: (id: string) => void;
  onCancel: () => void;
  onSelect: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<DatabaseType[]>([]);
  const [sort, setSort] = useState<DatabaseSort>("default");
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const filteredConnections = DATABASE_CONNECTIONS.filter((connection) => {
    const meta = DATABASE_CONNECTION_META[connection.id];
    const matchesSearch = `${connection.name} ${connection.description} ${connection.schema} ${meta.type}`
      .toLowerCase()
      .includes(search.trim().toLowerCase());
    const matchesType = selectedTypes.length === 0 || selectedTypes.includes(meta.type);
    return matchesSearch && matchesType;
  });
  const visibleConnections = [...filteredConnections].sort((left, right) => {
    if (sort === "updated") {
  return (
        DATABASE_CONNECTION_META[left.id].updatedMinutes -
        DATABASE_CONNECTION_META[right.id].updatedMinutes
      );
    }
    if (sort === "name-asc") return left.name.localeCompare(right.name);
    if (sort === "name-desc") return right.name.localeCompare(left.name);
    return 0;
  });
  const sortLabel: Record<DatabaseSort, string> = {
    default: "Default",
    updated: "Last Updated",
    "name-asc": "Name (A-Z)",
    "name-desc": "Name (Z-A)",
  };

  const toggleType = (type: DatabaseType) => {
    setSelectedTypes((current) =>
      current.includes(type) ? current.filter((item) => item !== type) : [...current, type],
    );
  };

  return (
    <>
      <section className="ds-db-manager">
      <header className="ds-db-manager__titlebar">
        <h2>Select Database Connection</h2>
        <button type="button" aria-label="Close" onClick={onCancel}>
          <X size={18} aria-hidden="true" />
      </button>
      </header>

      <div className="ds-db-manager__toolbar">
        <h3>Database Connections</h3>
        <div className="ds-db-manager__toolbar-actions">
          <label className="ds-db-manager__search">
            <MagnifyingGlass size={17} aria-hidden="true" />
      <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search connections..."
            />
          </label>
          <button
            type="button"
            className="ds-db-manager__new"
            onClick={() => setCreateModalOpen(true)}
          >
            <Plus size={17} aria-hidden="true" />
            New Connection
          </button>
        </div>
      </div>

      <div className="ds-db-manager__filters">
        <div className="ds-db-manager__menu-wrap">
          <button
            type="button"
            className={typeMenuOpen ? "is-open" : ""}
            aria-expanded={typeMenuOpen}
            aria-haspopup="menu"
            onClick={() => {
              setTypeMenuOpen((open) => !open);
              setSortMenuOpen(false);
            }}
          >
            Type{selectedTypes.length ? ` (${selectedTypes.length})` : ""}
            <CaretDown size={15} aria-hidden="true" />
          </button>
          {typeMenuOpen && (
            <div className="ds-db-manager__menu ds-db-manager__type-menu" role="menu">
              {DATABASE_TYPES.map((type) => (
                <label key={type}>
      <input
                    type="checkbox"
                    checked={selectedTypes.includes(type)}
                    onChange={() => toggleType(type)}
                  />
                  <span aria-hidden="true" />
                  {type}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="ds-db-manager__menu-wrap">
          <button
            type="button"
            className={sortMenuOpen ? "is-open" : ""}
            aria-expanded={sortMenuOpen}
            aria-haspopup="menu"
            onClick={() => {
              setSortMenuOpen((open) => !open);
              setTypeMenuOpen(false);
            }}
          >
            <FunnelSimple size={15} aria-hidden="true" />
            {sortLabel[sort]}
            <CaretDown size={15} aria-hidden="true" />
      </button>
          {sortMenuOpen && (
            <div className="ds-db-manager__menu ds-db-manager__sort-menu" role="menu">
              {(Object.entries(sortLabel) as [DatabaseSort, string][]).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={sort === value ? "is-selected" : ""}
                  role="menuitem"
                  onClick={() => {
                    setSort(value);
                    setSortMenuOpen(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="ds-db-manager__columns" aria-hidden="true">
        <span>Database Connections</span>
        <span>Status</span>
      </div>

      <div className="ds-db-manager__list" role="listbox" aria-label="Database connections">
        {visibleConnections.map((connection) => {
          const selected = selectedId === connection.id;
          return (
            <div
              key={connection.id}
              role="option"
              tabIndex={0}
              aria-selected={selected}
              className={"ds-db-manager-row" + (selected ? " is-selected" : "")}
              onClick={() => onChange(connection.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onChange(connection.id);
                }
              }}
            >
              <div className="ds-db-manager-row__connection">
                <strong>{connection.name}</strong>
                <div>
                  <span>{connection.description}</span>
                </div>
              </div>
              <span className="ds-db-manager-row__actions">
                <span
                  className={
                    "ds-db-manager-row__status" + (connection.active ? " is-active" : "")
                  }
                >
                  <i aria-hidden="true" />
                  {connection.active ? "Active" : "Inactive"}
                </span>
                <button
                  type="button"
                  aria-label={`Information about ${connection.name}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <Info size={20} aria-hidden="true" />
                </button>
              </span>
    </div>
          );
        })}
        {visibleConnections.length === 0 && (
          <p className="ds-db-manager__empty">No database connections match your search.</p>
        )}
      </div>

      <footer className="ds-db-manager__footer">
        <button type="button" className="ds-db-manager__cancel" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="ds-db-manager__select"
          disabled={!selectedId}
          onClick={onSelect}
        >
          Select Connection
        </button>
      </footer>
      </section>
      {createModalOpen && (
        <SourcePickerModal variant="create-database" onClose={() => setCreateModalOpen(false)}>
          <CreateDatabaseConnectionForm onClose={() => setCreateModalOpen(false)} />
        </SourcePickerModal>
      )}
    </>
  );
}

function ApiSourcePicker({
  selectedId,
  selectedRequestId,
  onChange,
  onCancel,
  onSelect,
}: {
  selectedId: string | null;
  selectedRequestId: string;
  onChange: (collectionId: string, requestId: string) => void;
  onCancel: () => void;
  onSelect: () => void;
}) {
  const [search, setSearch] = useState("");
  const [openCollections, setOpenCollections] = useState<Set<string>>(() => new Set());
  const [loadingCollections, setLoadingCollections] = useState<Set<string>>(() => new Set());
  const loadingTimers = useRef<Map<string, number>>(new Map());
  const [selectedAuths, setSelectedAuths] = useState<ApiAuth[]>([]);
  const [selectedMethods, setSelectedMethods] = useState<ApiMethod[]>([]);
  const [sort, setSort] = useState<ApiSort>("default");
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [methodMenuOpen, setMethodMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const searchValue = search.trim().toLowerCase();
  const hasRequestFilters = selectedAuths.length > 0 || selectedMethods.length > 0;
  const compareItems = (
    left: { name: string; lastUpdated: string },
    right: { name: string; lastUpdated: string },
  ) => {
    if (sort === "updated") {
      return relativeTimeMinutes(left.lastUpdated) - relativeTimeMinutes(right.lastUpdated);
    }
    if (sort === "name-asc") return left.name.localeCompare(right.name);
    if (sort === "name-desc") return right.name.localeCompare(left.name);
    return 0;
  };
  const filteredCollections = API_SOURCES.map((collection) => {
    const collectionMatchesSearch =
      !searchValue ||
      `${collection.name} ${collection.description}`.toLowerCase().includes(searchValue);
    const requests = collection.requests
      .filter((request) => {
        const requestMatchesSearch =
          !searchValue ||
          collectionMatchesSearch ||
          `${request.name} ${request.description} ${request.method} ${request.auth}`
            .toLowerCase()
            .includes(searchValue);
        const matchesAuth =
          selectedAuths.length === 0 || selectedAuths.includes(request.auth);
        const matchesMethod =
          selectedMethods.length === 0 || selectedMethods.includes(request.method);
        return requestMatchesSearch && matchesAuth && matchesMethod;
      })
      .sort(compareItems);
    return { ...collection, requests, collectionMatchesSearch };
  })
    .filter(
      (collection) =>
        collection.requests.length > 0 ||
        (!hasRequestFilters && collection.collectionMatchesSearch),
    )
    .sort(compareItems);

  const toggleAuth = (auth: ApiAuth) => {
    setSelectedAuths((current) =>
      current.includes(auth) ? current.filter((item) => item !== auth) : [...current, auth],
    );
  };
  const toggleMethod = (method: ApiMethod) => {
    setSelectedMethods((current) =>
      current.includes(method)
        ? current.filter((item) => item !== method)
        : [...current, method],
    );
  };

  useEffect(
    () => () => {
      loadingTimers.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  const toggleCollection = (id: string) => {
    const isOpen = openCollections.has(id);
    setOpenCollections((current) => {
      const next = new Set(current);
      if (isOpen) next.delete(id);
      else next.add(id);
      return next;
    });

    const existingTimer = loadingTimers.current.get(id);
    if (existingTimer) window.clearTimeout(existingTimer);

    if (isOpen) {
      loadingTimers.current.delete(id);
      setLoadingCollections((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      return;
    }

    setLoadingCollections((current) => new Set(current).add(id));
    loadingTimers.current.set(
      id,
      window.setTimeout(() => {
        setLoadingCollections((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        loadingTimers.current.delete(id);
      }, 1600),
    );
  };

  return (
    <section className="ds-api-manager">
      <header className="ds-db-manager__titlebar">
        <h2>Select API Request</h2>
        <button type="button" aria-label="Close" onClick={onCancel}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="ds-db-manager__toolbar">
        <h3>API Collections &amp; Requests</h3>
        <div className="ds-db-manager__toolbar-actions">
          <label className="ds-db-manager__search ds-api-manager__search">
            <MagnifyingGlass size={17} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search collections and requests..."
            />
          </label>
          <button type="button" className="ds-db-manager__new">
            <Plus size={17} aria-hidden="true" />
            New Collection
          </button>
        </div>
      </div>

      <div className="ds-db-manager__filters">
        <div className="ds-api-manager__filter-group">
          <div className="ds-db-manager__menu-wrap">
            <button
              type="button"
              className={authMenuOpen ? "is-open" : ""}
              aria-expanded={authMenuOpen}
              aria-haspopup="menu"
              onClick={() => {
                setAuthMenuOpen((open) => !open);
                setMethodMenuOpen(false);
                setSortMenuOpen(false);
              }}
            >
              Auth{selectedAuths.length ? ` (${selectedAuths.length})` : ""}
              <CaretDown size={15} aria-hidden="true" />
            </button>
            {authMenuOpen && (
              <div
                className="ds-db-manager__menu ds-db-manager__type-menu ds-api-manager__auth-menu"
                role="menu"
              >
                {API_AUTH_OPTIONS.map((auth) => (
                  <label key={auth}>
                    <input
                      type="checkbox"
                      checked={selectedAuths.includes(auth)}
                      onChange={() => toggleAuth(auth)}
                    />
                    <span aria-hidden="true" />
                    {auth}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="ds-db-manager__menu-wrap">
            <button
              type="button"
              className={methodMenuOpen ? "is-open" : ""}
              aria-expanded={methodMenuOpen}
              aria-haspopup="menu"
              onClick={() => {
                setMethodMenuOpen((open) => !open);
                setAuthMenuOpen(false);
                setSortMenuOpen(false);
              }}
            >
              Method{selectedMethods.length ? ` (${selectedMethods.length})` : ""}
              <CaretDown size={15} aria-hidden="true" />
            </button>
            {methodMenuOpen && (
              <div
                className="ds-db-manager__menu ds-db-manager__type-menu ds-api-manager__method-menu"
                role="menu"
              >
                {API_METHOD_OPTIONS.map((method) => (
                  <label key={method}>
                    <input
                      type="checkbox"
                      checked={selectedMethods.includes(method)}
                      onChange={() => toggleMethod(method)}
                    />
                    <span aria-hidden="true" />
                    {method}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="ds-db-manager__menu-wrap">
          <button
            type="button"
            className={sortMenuOpen ? "is-open" : ""}
            aria-expanded={sortMenuOpen}
            aria-haspopup="menu"
            onClick={() => {
              setSortMenuOpen((open) => !open);
              setAuthMenuOpen(false);
              setMethodMenuOpen(false);
            }}
          >
            <FunnelSimple size={15} aria-hidden="true" />
            {API_SORT_LABELS[sort]}
            <CaretDown size={15} aria-hidden="true" />
          </button>
          {sortMenuOpen && (
            <div className="ds-db-manager__menu ds-db-manager__sort-menu" role="menu">
              {(Object.entries(API_SORT_LABELS) as [ApiSort, string][]).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={sort === value ? "is-selected" : ""}
                  role="menuitem"
                  onClick={() => {
                    setSort(value);
                    setSortMenuOpen(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="ds-api-manager__columns" aria-hidden="true">
        <span>API Collections &amp; Requests</span>
        <span>Last Updated</span>
        <span />
      </div>

      <div className="ds-api-manager__list" role="listbox" aria-label="API requests">
        {filteredCollections.map((collection) => {
          const open = openCollections.has(collection.id);
          const loading = loadingCollections.has(collection.id);
          return (
            <div
              className="ds-api-collection"
              key={collection.id}
              aria-busy={open && loading}
            >
              <div
                className="ds-api-collection__row"
                role="button"
                tabIndex={0}
                aria-expanded={open}
                onClick={() => toggleCollection(collection.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleCollection(collection.id);
                  }
                }}
              >
                <CaretDown
                  className={"ds-api-collection__caret" + (open ? " is-open" : "")}
                  size={16}
                  aria-hidden="true"
                />
                <span className="ds-api-collection__content">
                  <strong>{collection.name}</strong>
                  <small>{collection.description}</small>
                </span>
                <time>{collection.lastUpdated}</time>
                <span className="ds-api-manager__view">
                  <Info size={20} aria-hidden="true" />
                </span>
              </div>
              {open &&
                (loading ? (
                  <div
                    className="ds-api-request-skeleton-list"
                    aria-label="Loading API requests"
                  >
                    {Array.from(
                      { length: Math.max(2, Math.min(collection.requests.length, 4)) },
                      (_, index) => (
                        <div className="ds-api-request-skeleton" key={index} aria-hidden="true">
                          <span className="ds-api-request-skeleton__content">
                            <i />
                            <i />
                          </span>
                          <i className="ds-api-request-skeleton__updated" />
                          <i className="ds-api-request-skeleton__action" />
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  collection.requests.map((request) => {
                  const selected =
                    selectedId === collection.id && selectedRequestId === request.id;
                  return (
                    <button
                      key={request.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={"ds-api-request-row" + (selected ? " is-selected" : "")}
                      onClick={() => onChange(collection.id, request.id)}
                    >
                      <span className="ds-api-request-row__content">
                        <strong>{request.name}</strong>
                        <span>
                          <small>{request.method}</small>
                          {request.description}
                        </span>
                      </span>
                      <time>{request.lastUpdated}</time>
                      <span className="ds-api-manager__view">
                        <Info size={20} aria-hidden="true" />
                      </span>
                    </button>
                  );
                  })
                ))}
            </div>
          );
        })}
        {filteredCollections.length === 0 && (
          <p className="ds-db-manager__empty">No API collections match your search.</p>
        )}
      </div>

      <footer className="ds-db-manager__footer">
        <button type="button" className="ds-db-manager__cancel" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="ds-db-manager__select"
          disabled={!selectedId || !selectedRequestId}
          onClick={onSelect}
        >
          Select Request
        </button>
      </footer>
    </section>
  );
}

function FileSourcePicker({
  selectedId,
  onChange,
  onCancel,
  onSelect,
}: {
  selectedId: string | null;
  onChange: (id: string) => void;
  onCancel: () => void;
  onSelect: () => void;
}) {
  const [search, setSearch] = useState("");
  const visibleFiles = FILE_SOURCES.filter((source) =>
    `${source.name} ${source.fileName} ${source.tableName}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );

  return (
    <section className="ds-db-manager ds-file-manager">
      <header className="ds-db-manager__titlebar">
        <h2>Select File</h2>
        <button type="button" aria-label="Close" onClick={onCancel}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="ds-db-manager__toolbar">
        <h3>Uploaded Files</h3>
        <div className="ds-db-manager__toolbar-actions">
          <label className="ds-db-manager__search">
            <MagnifyingGlass size={17} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search files..."
            />
          </label>
          <button type="button" className="ds-db-manager__new">
            <Plus size={17} aria-hidden="true" />
            New File
          </button>
        </div>
      </div>

      <div className="ds-db-manager__columns" aria-hidden="true">
        <span>Uploaded Files</span>
        <span>Status</span>
      </div>

      <div className="ds-db-manager__list" role="listbox" aria-label="Uploaded files">
        {visibleFiles.map((source) => {
          const selected = selectedId === source.id;
          return (
            <div
              key={source.id}
              role="option"
              tabIndex={0}
              aria-selected={selected}
              className={"ds-db-manager-row ds-file-manager-row" + (selected ? " is-selected" : "")}
              onClick={() => onChange(source.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onChange(source.id);
                }
              }}
            >
              <div className="ds-file-manager-row__file ds-file-manager-row__file--without-icon">
                <div className="ds-db-manager-row__connection">
                  <strong>{source.name}</strong>
                  <div>
                    <span>{source.fileName}</span>
                    <span>
                      Uploaded File · {source.rows.toLocaleString()} rows · {source.tableName}
                    </span>
                  </div>
                </div>
              </div>
              <span className="ds-db-manager-row__actions">
                <span
                  className={
                    "ds-db-manager-row__status" + (source.active ? " is-active" : "")
                  }
                >
                  <i aria-hidden="true" />
                  {source.active ? "Active" : "Inactive"}
                </span>
                <button
                  type="button"
                  aria-label={`Information about ${source.name}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <Info size={20} aria-hidden="true" />
                </button>
              </span>
            </div>
          );
        })}
        {visibleFiles.length === 0 && (
          <p className="ds-db-manager__empty">No uploaded files match your search.</p>
        )}
      </div>

      <footer className="ds-db-manager__footer">
        <button type="button" className="ds-db-manager__cancel" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="ds-db-manager__select"
          disabled={!selectedId}
          onClick={onSelect}
        >
          Select File
        </button>
      </footer>
    </section>
  );
}

function DataFlowPicker({
  selectedId,
  onChange,
  onCancel,
  onSelect,
}: {
  selectedId: string | null;
  onChange: (id: string) => void;
  onCancel: () => void;
  onSelect: () => void;
}) {
  const [search, setSearch] = useState("");
  const visibleFlows = DATA_FLOWS.filter((flow) =>
    `${flow.name} ${flow.description}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <section className="ds-db-manager ds-data-flow-manager">
      <header className="ds-db-manager__titlebar">
        <h2>Select Data Flow</h2>
        <button type="button" aria-label="Close" onClick={onCancel}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="ds-db-manager__toolbar">
        <h3>Data Flows</h3>
        <div className="ds-db-manager__toolbar-actions">
          <label className="ds-db-manager__search">
            <MagnifyingGlass size={17} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search data flows..."
            />
          </label>
          <button type="button" className="ds-db-manager__new">
            <Plus size={17} aria-hidden="true" />
            New Data Flow
          </button>
        </div>
      </div>

      <div className="ds-db-manager__columns" aria-hidden="true">
        <span>Data Flows</span>
        <span>Output Schema</span>
      </div>

      <div className="ds-db-manager__list" role="listbox" aria-label="Data flows">
        {visibleFlows.map((flow) => {
          const selected = selectedId === flow.id;
          return (
            <div
              key={flow.id}
              role="option"
              tabIndex={0}
              aria-selected={selected}
              className={
                "ds-db-manager-row ds-data-flow-manager-row" + (selected ? " is-selected" : "")
              }
              onClick={() => onChange(flow.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onChange(flow.id);
                }
              }}
            >
              <div className="ds-file-manager-row__file">
                <span className="ds-file-manager-row__icon">
                  <FlowArrow size={20} aria-hidden="true" />
                </span>
                <div className="ds-db-manager-row__connection">
                  <strong>{flow.name}</strong>
                  <div>
                    <span>{flow.description}</span>
                  </div>
                </div>
              </div>
              <span className="ds-db-manager-row__actions">
                <span className="ds-data-flow-manager-row__columns">
                  {flow.columns.length} Columns
                </span>
                <button
                  type="button"
                  aria-label={`Information about ${flow.name}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <Info size={20} aria-hidden="true" />
                </button>
              </span>
            </div>
          );
        })}
        {visibleFlows.length === 0 && (
          <p className="ds-db-manager__empty">No data flows match your search.</p>
        )}
      </div>

      <footer className="ds-db-manager__footer">
        <button type="button" className="ds-db-manager__cancel" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="ds-db-manager__select"
          disabled={!selectedId}
          onClick={onSelect}
        >
          Select Data Flow
        </button>
      </footer>
    </section>
  );
}

function DataFlowSettings({
  flow,
  projection,
  onProjectionChange,
}: {
  flow: DataFlow;
  projection: string;
  onProjectionChange: (value: string) => void;
}) {
  return (
    <div className="ds-flow-settings">
      <section className="ds-flow-execution">
        <header>
          <h3>{flow.name}</h3>
          <button type="button">
            <Play size={12} weight="fill" aria-hidden="true" />
            Execute Flow
          </button>
        </header>
      </section>

      <section className="ds-flow-schema">
        <header>
          <h3>Output schema</h3>
          <span>{flow.columns.length} Columns</span>
        </header>
        <div className="ds-flow-schema__columns">
          {flow.columns.map((column) => (
            <span key={column}>{column}</span>
          ))}
        </div>
      </section>

      <section className="ds-flow-projection">
        <header className="ds-flow-projection__header">
          <h3>
            Output projection <span>• optional</span>
          </h3>
          <div>
            <button type="button" className="ds-query__generate">
              <Sparkle size={12} weight="fill" aria-hidden="true" />
              Generate
            </button>
            <button type="button" className="ds-query__execute" disabled={!projection}>
              <Play size={12} weight="fill" aria-hidden="true" />
              Test projection
            </button>
          </div>
        </header>
        <p className="ds-flow-projection__helper">
          Query the flow&apos;s cached output as <code>flow</code>. Use $name placeholders to build
          filters — unlike parameters above, changing a filter here re-uses the cached result
          instead of re-running the flow.
          <small>Available columns: {flow.columns.join(", ")}</small>
        </p>
        <div className="ds-flow-projection__editor">
          <span aria-hidden="true">1</span>
          <textarea
            aria-label="Output projection query"
            value={projection}
            onChange={(event) => onProjectionChange(event.target.value)}
            spellCheck={false}
          />
        </div>
      </section>
    </div>
  );
}

function ApiRequestPanel({
  request,
  requests,
  onRequestChange,
}: {
  request: string;
  requests: ApiRequest[];
  onRequestChange: (request: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"parameters" | "headers" | "body">("parameters");
  const [bodyType, setBodyType] = useState<"none" | "raw" | "form-data">("raw");
  const [bodyValue, setBodyValue] = useState("");
  const selectedRequest = requests.find((option) => option.id === request) ?? null;

  useEffect(() => {
    setActiveTab("parameters");
  }, [request]);

  return (
    <section className="ds-api-request">
      <header className="ds-api-request__header">
        <h3>API Request</h3>
        <button type="button" className="ds-api-request__send" disabled={!selectedRequest}>
          <Play size={12} weight="fill" aria-hidden="true" />
          Send
        </button>
      </header>
      <div className="ds-api-request__body">
        <label htmlFor="ds-api-request-select">Request</label>
        <div className="ds-api-request__select-wrap">
          <select
            id="ds-api-request-select"
            value={request}
            onChange={(event) => onRequestChange(event.target.value)}
          >
            <option value="">Select a Request</option>
            {requests.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          <CaretDown size={14} aria-hidden="true" />
        </div>
        {selectedRequest && (
          <>
            <div className="ds-api-request__endpoint">
              <span className={`is-${selectedRequest.method.toLowerCase()}`}>
                {selectedRequest.method}
              </span>
              <code>{selectedRequest.endpoint}</code>
            </div>

            <div className="ds-api-request__tabs" role="tablist" aria-label="Request configuration">
              {(["parameters", "headers", "body"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  className={activeTab === tab ? "is-active" : ""}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab[0].toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {activeTab === "parameters" ? (
              <div className="ds-api-request__parameters">
                <ApiParameterSection title="Query Parameters" emptyText="No query parameters defined." />
                <ApiParameterSection title="Path Parameters" emptyText="No path parameters defined." />
              </div>
            ) : activeTab === "headers" ? (
              <div className="ds-api-request__headers">
                <ApiParameterSection emptyText="No specific headers defined." />
              </div>
            ) : (
              <div className="ds-api-request__body-config">
                <label htmlFor="ds-api-body-type">Body Type</label>
                <div className="ds-api-request__body-type-wrap">
                  <select
                    id="ds-api-body-type"
                    value={bodyType}
                    onChange={(event) =>
                      setBodyType(event.target.value as "none" | "raw" | "form-data")
                    }
                  >
                    <option value="none">None</option>
                    <option value="raw">Raw (JSON)</option>
                    <option value="form-data">Form Data</option>
                  </select>
                  <CaretDown size={16} aria-hidden="true" />
                </div>
                {bodyType === "raw" && (
                  <JsonBodyEditor value={bodyValue} onChange={setBodyValue} />
                )}
                {bodyType === "form-data" && (
                  <ApiParameterSection emptyText="No form data fields defined." />
                )}
                {bodyType === "none" && (
                  <div className="ds-api-request__tab-empty">No request body.</div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

const JSON_EDITOR_TOKEN_PATTERN =
  /("(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)/g;

function HighlightedJson({ value }: { value: string }) {
  return (
    <pre className="ds-query__highlight ds-api-json-editor__highlight" aria-hidden="true">
      <code>
        {(value || " ").split(JSON_EDITOR_TOKEN_PATTERN).map((token, index) => {
          const className = token.startsWith('"')
            ? "is-string"
            : /^(?:true|false|null)$/.test(token)
              ? "is-keyword"
              : /^-?\d/.test(token)
                ? "is-number"
                : undefined;
          return (
            <span className={className} key={`${index}-${token}`}>
              {token}
            </span>
          );
        })}
      </code>
    </pre>
  );
}

function JsonBodyEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const lineCount = Math.max(1, value.split("\n").length);
  return (
    <div className="ds-query__editor ds-api-json-editor">
      <pre className="ds-api-json-editor__line-numbers" aria-hidden="true">
        {Array.from({ length: lineCount }, (_, index) => index + 1).join("\n")}
      </pre>
      <div className="ds-query__code-layer">
        <HighlightedJson value={value} />
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onScroll={(event) => {
            const highlight = event.currentTarget.previousElementSibling as HTMLElement | null;
            const lineNumbers = event.currentTarget
              .closest(".ds-api-json-editor")
              ?.querySelector<HTMLElement>(".ds-api-json-editor__line-numbers");
            if (highlight) {
              highlight.scrollTop = event.currentTarget.scrollTop;
              highlight.scrollLeft = event.currentTarget.scrollLeft;
            }
            if (lineNumbers) lineNumbers.scrollTop = event.currentTarget.scrollTop;
          }}
          aria-label="JSON request body"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

function ApiParameterSection({ title, emptyText }: { title?: string; emptyText: string }) {
  const [rows, setRows] = useState<Array<{ id: number; key: string; value: string }>>([]);
  const updateRow = (id: number, field: "key" | "value", value: string) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  };

  return (
    <section className="ds-api-parameter-section">
      {title && <h4>{title}</h4>}
      <div className="ds-api-parameter-table">
        <header>
          <span>Key</span>
          <span>Value</span>
        </header>
        {rows.length === 0 ? (
          <p>{emptyText}</p>
        ) : (
          <div className="ds-api-parameter-table__rows">
            {rows.map((row) => (
              <div className="ds-api-parameter-row" key={row.id}>
                <input
                  value={row.key}
                  onChange={(event) => updateRow(row.id, "key", event.target.value)}
                  placeholder="Key"
                  aria-label={`${title ?? "Header"} key`}
                />
                <input
                  value={row.value}
                  onChange={(event) => updateRow(row.id, "value", event.target.value)}
                  placeholder="Value"
                  aria-label={`${title ?? "Header"} value`}
                />
                <button
                  type="button"
                  aria-label={`Remove ${title ?? "header"} row`}
                  onClick={() =>
                    setRows((current) => current.filter((item) => item.id !== row.id))
                  }
                >
                  <Trash size={17} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() =>
          setRows((current) => [
            ...current,
            {
              id: current.reduce((highest, row) => Math.max(highest, row.id), 0) + 1,
              key: "",
              value: "",
            },
          ])
        }
      >
        <Plus size={16} aria-hidden="true" />
        Add Item
      </button>
    </section>
  );
}

const SQL_EDITOR_TOKEN_PATTERN =
  /('(?:''|[^'])*'|\b(?:SELECT|FROM|JOIN|ON|WHERE|AND|OR|BETWEEN|ORDER|BY|AS|LIMIT|GROUP|HAVING|DESC|ASC)\b|\b\d+(?:\.\d+)?\b)/gi;

const SQL_EDITOR_KEYWORD_PATTERN =
  /^(?:SELECT|FROM|JOIN|ON|WHERE|AND|OR|BETWEEN|ORDER|BY|AS|LIMIT|GROUP|HAVING|DESC|ASC)$/i;

function HighlightedSql({ value }: { value: string }) {
  return (
    <pre className="ds-query__highlight" aria-hidden="true">
      <code>
        {(value || " ").split(SQL_EDITOR_TOKEN_PATTERN).map((token, index) => {
          const className = token.startsWith("'")
            ? "is-string"
            : SQL_EDITOR_KEYWORD_PATTERN.test(token)
              ? "is-keyword"
              : /^\d/.test(token)
                ? "is-number"
                : undefined;
          return (
            <span className={className} key={`${index}-${token}`}>
              {token}
            </span>
          );
        })}
      </code>
    </pre>
  );
}

function SourcePickerModal({
  children,
  onClose,
  variant = "default",
}: {
  children: ReactNode;
  onClose: () => void;
  variant?: "default" | "database" | "create-database" | "api" | "file" | "data-flow";
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="ds-source-picker-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={
          "ds-source-picker-modal" +
          (variant === "database"
            ? " ds-source-picker-modal--database"
            : variant === "create-database"
              ? " ds-source-picker-modal--create-database"
              : variant === "api"
                ? " ds-source-picker-modal--api"
                : variant === "file"
                  ? " ds-source-picker-modal--file"
                  : variant === "data-flow"
                    ? " ds-source-picker-modal--data-flow"
                  : "")
        }
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function QueryEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <section className="ds-query">
      <header className="ds-query__header">
        <h3>Query</h3>
      </header>
      <div className="ds-query__editor">
        <span className="ds-query__line-number" aria-hidden="true">
          1
        </span>
        <div className="ds-query__code-layer">
          <HighlightedSql value={value} />
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onScroll={(event) => {
              const highlight = event.currentTarget.previousElementSibling;
              if (highlight instanceof HTMLElement) {
                highlight.scrollTop = event.currentTarget.scrollTop;
                highlight.scrollLeft = event.currentTarget.scrollLeft;
              }
            }}
            aria-label="SQL query"
            spellCheck={false}
          />
        </div>
      </div>
      <footer className="ds-query__footer">
        <span>Dialect: SQL (Standard SQL)</span>
        <div className="ds-query__actions">
          <button type="button" className="ds-query__generate">
            <Sparkle size={14} weight="fill" aria-hidden="true" />
            Generate
          </button>
          <button type="button" className="ds-query__execute">
            <Play size={14} weight="fill" aria-hidden="true" />
            Execute
          </button>
        </div>
      </footer>
    </section>
  );
}

function SourceConfiguration({
  sourceType,
  mlInputSource,
  onMlInputSourceChange,
  selectedDatabase,
  isDatabaseConnecting,
  onOpenDatabasePicker,
  selectedApi,
  onOpenApiPicker,
  selectedRequest,
  onSelectedRequestChange,
  selectedFile,
  onOpenFilePicker,
  fileQuery,
  onFileQueryChange,
  mlSelectedDatabase,
  isMlDatabaseConnecting,
  onOpenMlDatabasePicker,
  mlDatabaseQuery,
  onMlDatabaseQueryChange,
  mlSelectedApi,
  onOpenMlApiPicker,
  mlSelectedRequest,
  onMlSelectedRequestChange,
  mlSelectedFile,
  onOpenMlFilePicker,
  mlFileQuery,
  onMlFileQueryChange,
  selectedDataFlow,
  onOpenDataFlowPicker,
  outputProjection,
  onOutputProjectionChange,
  query,
  onQueryChange,
}: {
  sourceType: SourceType;
  mlInputSource: MlInputSource | null;
  onMlInputSourceChange: (source: MlInputSource | null) => void;
  selectedDatabase: DatabaseConnection | null;
  isDatabaseConnecting: boolean;
  onOpenDatabasePicker: () => void;
  selectedApi: ApiSource | null;
  onOpenApiPicker: () => void;
  selectedRequest: string;
  onSelectedRequestChange: (request: string) => void;
  selectedFile: FileSource | null;
  onOpenFilePicker: () => void;
  fileQuery: string;
  onFileQueryChange: (query: string) => void;
  mlSelectedDatabase: DatabaseConnection | null;
  isMlDatabaseConnecting: boolean;
  onOpenMlDatabasePicker: () => void;
  mlDatabaseQuery: string;
  onMlDatabaseQueryChange: (query: string) => void;
  mlSelectedApi: ApiSource | null;
  onOpenMlApiPicker: () => void;
  mlSelectedRequest: string;
  onMlSelectedRequestChange: (request: string) => void;
  mlSelectedFile: FileSource | null;
  onOpenMlFilePicker: () => void;
  mlFileQuery: string;
  onMlFileQueryChange: (query: string) => void;
  selectedDataFlow: DataFlow | null;
  onOpenDataFlowPicker: () => void;
  outputProjection: string;
  onOutputProjectionChange: (query: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  if (sourceType === "database") {
    return (
      <div className="ds-config-stack">
        <section className="ds-config">
          <FieldHeader title="Database Connection" />
          {selectedDatabase ? (
            <div className="ds-db-selected">
              <Database size={18} aria-hidden="true" />
              <span className="ds-db-selected__content ds-db-selected__content--database">
                <strong>{selectedDatabase.name}</strong>
                {!isDatabaseConnecting && (
                  <span className="ds-db-selected__success" role="status">
                    <CheckCircle size={16} weight="bold" aria-hidden="true" />
                    Connection established
                  </span>
                )}
              </span>
              <span className="ds-db-selected__actions">
                {isDatabaseConnecting ? (
                  <span className="ds-db-selected__loading" role="status">
                    <i aria-hidden="true" />
                    Connecting...
                  </span>
                ) : (
                  <button type="button" className="ds-db-selected__schema-browser">
                    Schema Browser
                  </button>
                )}
                <button
                  type="button"
                  className="ds-db-selected__change"
                  onClick={onOpenDatabasePicker}
                >
                  Change
                </button>
              </span>
            </div>
          ) : (
            <SourceActionField
              label="Select Database Connection"
              icon={<Database size={20} aria-hidden="true" />}
              onClick={onOpenDatabasePicker}
            />
          )}
        </section>
        {selectedDatabase && !isDatabaseConnecting && (
          <QueryEditor value={query} onChange={onQueryChange} />
        )}
      </div>
    );
  }

  if (sourceType === "api") {
    return (
      <div className="ds-config-stack">
        <section className="ds-config">
          <FieldHeader title="API Source" />
          {selectedApi ? (
            <div className="ds-db-selected">
              <CirclesFour size={18} aria-hidden="true" />
              <span className="ds-db-selected__content">
                <strong>{selectedApi.name}</strong>
                <small>API connection</small>
              </span>
              <span className="ds-db-selected__trailing">
                <CirclesFour size={16} aria-hidden="true" />
              </span>
              <button type="button" className="ds-db-selected__change" onClick={onOpenApiPicker}>
                Change
              </button>
            </div>
          ) : (
            <SourceActionField
              label="Select API Source"
              icon={<CirclesFour size={20} aria-hidden="true" />}
              onClick={onOpenApiPicker}
            />
          )}
        </section>
        {selectedApi && (
          <ApiRequestPanel
            request={selectedRequest}
            requests={selectedApi.requests}
            onRequestChange={onSelectedRequestChange}
          />
        )}
      </div>
    );
  }

  if (sourceType === "file-upload") {
    return (
      <div className="ds-config-stack">
        {selectedFile && (
          <section className="ds-config">
            <FieldHeader title="Apply ML Prediction (Optional)" required={false} />
            <div className="ds-config__notice" role="note">
              Enhance your data with machine learning predictions by selecting a model below.
              <br />
              No ML models available. Configure models in Platform Settings.
            </div>
          </section>
        )}
        <section className="ds-config">
          <FieldHeader title="Select File" />
          {selectedFile ? (
            <div className="ds-db-selected">
              <FileArrowUp size={18} aria-hidden="true" />
              <span className="ds-db-selected__content">
                <strong>{selectedFile.name}</strong>
                <small>
                  {selectedFile.fileName} · {selectedFile.rows.toLocaleString()} rows
                </small>
              </span>
              <span className="ds-db-selected__trailing">
                <Database size={16} aria-hidden="true" />
              </span>
              <button type="button" className="ds-db-selected__change" onClick={onOpenFilePicker}>
                Change
              </button>
            </div>
          ) : (
            <SourceActionField
              label="Select File"
              icon={<FileArrowUp size={20} aria-hidden="true" />}
              onClick={onOpenFilePicker}
            />
          )}
          <p className="ds-config__helper">
            Uploaded files are stored as source-backed tables. Select an existing file or use + New in
            the picker to upload one.
          </p>
        </section>
        {selectedFile && <QueryEditor value={fileQuery} onChange={onFileQueryChange} />}
      </div>
    );
  }

  if (sourceType === "ai-model") {
    return (
      <section className="ds-config">
        <FieldHeader title="AI Model Configuration" required={false} />
        <div className="ds-config__notice" role="note">
          AI Models are for conversational AI and language processing tasks. Configure your AI model
          settings in Platform Settings → AI Models.
        </div>
      </section>
    );
  }

  if (sourceType === "ml-model") {
    return (
      <div className="ds-config-stack">
        <section className="ds-config">
          <FieldHeader title="Select ML Model" />
          <p className="ds-config__empty">
            No ML models available. Please create an ML model first in Platform Settings.
          </p>
        </section>

        <section className="ds-config ds-config--separated">
          <FieldHeader title="Input Data For Predictions" />
          {mlInputSource ? (
            <button type="button" className="ds-ml-change-input" onClick={() => onMlInputSourceChange(null)}>
              <ArrowLeft size={14} aria-hidden="true" />
              Change input type
            </button>
          ) : (
            <>
              <div className="ds-ml-input-grid">
                {ML_INPUT_SOURCES.map((source) => (
                  <button
                    key={source.id}
                    type="button"
                    className="ds-ml-input-card"
                    aria-pressed={false}
                    onClick={() => onMlInputSourceChange(source.id)}
                  >
                    <span className="ds-ml-input-card__icon">{source.icon}</span>
                    <strong>{source.title}</strong>
                    <span>{source.description}</span>
            </button>
                ))}
              </div>
            </>
          )}
        </section>

        {mlInputSource === "database" && (
          <>
            <section className="ds-config">
              <FieldHeader title="Database Connection" />
              {mlSelectedDatabase ? (
                <div className="ds-db-selected">
                  <Database size={18} aria-hidden="true" />
                  <span className="ds-db-selected__content ds-db-selected__content--database">
                    <strong>{mlSelectedDatabase.name}</strong>
                    {!isMlDatabaseConnecting && (
                      <span className="ds-db-selected__success" role="status">
                        <CheckCircle size={16} weight="bold" aria-hidden="true" />
                        Connection established
                      </span>
                    )}
                  </span>
                  <span className="ds-db-selected__actions">
                    {isMlDatabaseConnecting ? (
                      <span className="ds-db-selected__loading" role="status">
                        <i aria-hidden="true" />
                        Connecting...
                      </span>
                    ) : (
                      <button type="button" className="ds-db-selected__schema-browser">
                        Schema Browser
                      </button>
                    )}
                    <button
                      type="button"
                      className="ds-db-selected__change"
                      onClick={onOpenMlDatabasePicker}
                    >
                      Change
                    </button>
                  </span>
                </div>
              ) : (
                <SourceActionField
                  label="Select Database Connection"
                  icon={<Database size={20} aria-hidden="true" />}
                  onClick={onOpenMlDatabasePicker}
                />
              )}
            </section>
            {mlSelectedDatabase && !isMlDatabaseConnecting && (
              <QueryEditor value={mlDatabaseQuery} onChange={onMlDatabaseQueryChange} />
            )}
          </>
        )}

        {mlInputSource === "api" && (
          <>
            <section className="ds-config">
              <FieldHeader title="API Source" />
              {mlSelectedApi ? (
                <div className="ds-db-selected">
                  <Globe size={18} aria-hidden="true" />
                  <span className="ds-db-selected__content">
                    <strong>{mlSelectedApi.name}</strong>
                    <small>API source</small>
                  </span>
                  <span className="ds-db-selected__trailing">
                    <Globe size={16} aria-hidden="true" />
                  </span>
                  <button type="button" className="ds-db-selected__change" onClick={onOpenMlApiPicker}>
                    Change
                  </button>
                </div>
              ) : (
                <SourceActionField
                  label="Select API Source"
                  icon={<Globe size={20} aria-hidden="true" />}
                  onClick={onOpenMlApiPicker}
                />
              )}
            </section>
            {mlSelectedApi && (
              <ApiRequestPanel
                request={mlSelectedRequest}
                requests={mlSelectedApi.requests}
                onRequestChange={onMlSelectedRequestChange}
              />
            )}
          </>
        )}

        {mlInputSource === "file-source" && (
          <>
            <section className="ds-config">
              <FieldHeader title="File Source" />
              {mlSelectedFile ? (
                <div className="ds-db-selected">
                  <File size={18} aria-hidden="true" />
                  <span className="ds-db-selected__content">
                    <strong>{mlSelectedFile.name}</strong>
                    <small>
                      {mlSelectedFile.fileName} · {mlSelectedFile.rows.toLocaleString()} rows
                    </small>
                  </span>
                  <span className="ds-db-selected__trailing">
                    <Database size={16} aria-hidden="true" />
                  </span>
                  <button type="button" className="ds-db-selected__change" onClick={onOpenMlFilePicker}>
                    Change
        </button>
      </div>
              ) : (
                <SourceActionField
                  label="Select File"
                  icon={<File size={20} aria-hidden="true" />}
                  onClick={onOpenMlFilePicker}
                />
              )}
              <p className="ds-config__helper">
                Pick an existing upload or use + New in the picker to upload a file to the store.
              </p>
            </section>
            {mlSelectedFile && <QueryEditor value={mlFileQuery} onChange={onMlFileQueryChange} />}
          </>
        )}

        {mlInputSource === "local-file" && (
          <section className="ds-config">
            <FieldHeader title="Local File" />
            <LocalFileUpload />
          </section>
        )}

        {mlInputSource && (
            <button
              type="button"
            className="ds-ml-run-prediction ds-ml-run-prediction--full"
            disabled
          >
            <Play size={14} weight="fill" aria-hidden="true" />
            Run Prediction
            </button>
        )}
        </div>
    );
  }

  return (
    <div className="ds-config-stack">
      <section className="ds-config">
        <FieldHeader title="Select Data Flow" />
        {selectedDataFlow ? (
          <button type="button" className="ds-flow-selected" onClick={onOpenDataFlowPicker}>
            <FlowArrow size={18} aria-hidden="true" />
            <span className="ds-flow-selected__content">
              <strong>{selectedDataFlow.name}</strong>
              <small>{selectedDataFlow.columns.length} columns</small>
            </span>
            <span className="ds-flow-selected__change">Change</span>
          </button>
        ) : (
          <SourceActionField
            label="Select Data Flow"
            icon={<FlowArrow size={20} aria-hidden="true" />}
            onClick={onOpenDataFlowPicker}
          />
        )}
            </section>
      {selectedDataFlow && (
        <DataFlowSettings
          flow={selectedDataFlow}
          projection={outputProjection}
          onProjectionChange={onOutputProjectionChange}
        />
      )}
    </div>
  );
}

export default function DataSourceStep({
  onConfigurationChange,
  onQueryPreviewChange,
  onLoadingChange,
}: {
  onConfigurationChange?: (configured: boolean) => void;
  onQueryPreviewChange?: (query: string) => void;
  onLoadingChange?: (loading: boolean) => void;
}) {
  const [restoredState] = useState(readDevDataSourceState);
  const [sourceType, setSourceType] = useState<SourceType | null>(
    restoredState.sourceType ?? null,
  );
  const [mlInputSource, setMlInputSource] = useState<MlInputSource | null>(
    restoredState.mlInputSource ?? null,
  );
  const [databasePickerOpen, setDatabasePickerOpen] = useState(
    restoredState.databasePickerOpen ?? false,
  );
  const [databasePickerContext, setDatabasePickerContext] = useState<PickerContext>(
    restoredState.databasePickerContext ?? "source",
  );
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string | null>(
    restoredState.selectedDatabaseId ?? null,
  );
  const [draftDatabaseId, setDraftDatabaseId] = useState<string | null>(
    restoredState.draftDatabaseId ?? null,
  );
  const [apiPickerOpen, setApiPickerOpen] = useState(restoredState.apiPickerOpen ?? false);
  const [apiPickerContext, setApiPickerContext] = useState<PickerContext>(
    restoredState.apiPickerContext ?? "source",
  );
  const [selectedApiId, setSelectedApiId] = useState<string | null>(
    restoredState.selectedApiId ?? null,
  );
  const [draftApiId, setDraftApiId] = useState<string | null>(
    restoredState.draftApiId ?? null,
  );
  const [draftApiRequest, setDraftApiRequest] = useState("");
  const [selectedRequest, setSelectedRequest] = useState(restoredState.selectedRequest ?? "");
  const [filePickerOpen, setFilePickerOpen] = useState(restoredState.filePickerOpen ?? false);
  const [filePickerContext, setFilePickerContext] = useState<PickerContext>(
    restoredState.filePickerContext ?? "source",
  );
  const [selectedFileId, setSelectedFileId] = useState<string | null>(
    restoredState.selectedFileId ?? null,
  );
  const [draftFileId, setDraftFileId] = useState<string | null>(
    restoredState.draftFileId ?? null,
  );
  const [fileQuery, setFileQuery] = useState(restoredState.fileQuery ?? "");
  const [mlSelectedDatabaseId, setMlSelectedDatabaseId] = useState<string | null>(
    restoredState.mlSelectedDatabaseId ?? null,
  );
  const [mlDatabaseQuery, setMlDatabaseQuery] = useState(restoredState.mlDatabaseQuery ?? "");
  const [mlSelectedApiId, setMlSelectedApiId] = useState<string | null>(
    restoredState.mlSelectedApiId ?? null,
  );
  const [mlSelectedRequest, setMlSelectedRequest] = useState(
    restoredState.mlSelectedRequest ?? "",
  );
  const [mlSelectedFileId, setMlSelectedFileId] = useState<string | null>(
    restoredState.mlSelectedFileId ?? null,
  );
  const [mlFileQuery, setMlFileQuery] = useState(restoredState.mlFileQuery ?? "");
  const [dataFlowPickerOpen, setDataFlowPickerOpen] = useState(
    restoredState.dataFlowPickerOpen ?? false,
  );
  const [selectedDataFlowId, setSelectedDataFlowId] = useState<string | null>(
    restoredState.selectedDataFlowId ?? null,
  );
  const [draftDataFlowId, setDraftDataFlowId] = useState<string | null>(
    restoredState.draftDataFlowId ?? null,
  );
  const [outputProjection, setOutputProjection] = useState(
    restoredState.outputProjection ?? "",
  );
  const [query, setQuery] = useState(restoredState.query ?? "");
  const [databaseConnecting, setDatabaseConnecting] = useState(false);
  const [mlDatabaseConnecting, setMlDatabaseConnecting] = useState(false);
  const selectedDatabase =
    DATABASE_CONNECTIONS.find((connection) => connection.id === selectedDatabaseId) ?? null;
  const selectedApi = API_SOURCES.find((source) => source.id === selectedApiId) ?? null;
  const selectedFile = FILE_SOURCES.find((source) => source.id === selectedFileId) ?? null;
  const mlSelectedDatabase =
    DATABASE_CONNECTIONS.find((connection) => connection.id === mlSelectedDatabaseId) ?? null;
  const mlSelectedApi = API_SOURCES.find((source) => source.id === mlSelectedApiId) ?? null;
  const mlSelectedFile = FILE_SOURCES.find((source) => source.id === mlSelectedFileId) ?? null;
  const selectedDataFlow = DATA_FLOWS.find((flow) => flow.id === selectedDataFlowId) ?? null;
  const selectedSourceOption =
    SOURCE_TYPES.find((source) => source.id === sourceType) ?? null;
  const hasConfiguredSource =
    (sourceType === "database" && Boolean(selectedDatabase)) ||
    (sourceType === "api" && Boolean(selectedApi)) ||
    (sourceType === "file-upload" && Boolean(selectedFile)) ||
    (sourceType === "ml-model" &&
      Boolean(mlSelectedDatabase || mlSelectedApi || mlSelectedFile)) ||
    (sourceType === "data-flow" && Boolean(selectedDataFlow));
  const shouldFillQuery =
    (sourceType === "database" && Boolean(selectedDatabase)) ||
    (sourceType === "file-upload" && Boolean(selectedFile)) ||
    (sourceType === "ml-model" &&
      ((mlInputSource === "database" && Boolean(mlSelectedDatabase)) ||
        (mlInputSource === "file-source" && Boolean(mlSelectedFile))));
  const activeQueryPreview =
    sourceType === "database"
      ? query
      : sourceType === "file-upload"
        ? fileQuery
        : sourceType === "ml-model" && mlInputSource === "database"
          ? mlDatabaseQuery
          : sourceType === "ml-model" && mlInputSource === "file-source"
            ? mlFileQuery
            : sourceType === "data-flow"
              ? outputProjection
              : "";

  useEffect(() => {
    onConfigurationChange?.(hasConfiguredSource);
  }, [hasConfiguredSource, onConfigurationChange]);

  useEffect(() => {
    onQueryPreviewChange?.(activeQueryPreview);
  }, [activeQueryPreview, onQueryPreviewChange]);

  useEffect(() => {
    onLoadingChange?.(databaseConnecting || mlDatabaseConnecting);
  }, [databaseConnecting, mlDatabaseConnecting, onLoadingChange]);

  useEffect(() => {
    if (selectedDatabaseId) {
      setQuery((current) => current.trim() ? current : DEFAULT_DATABASE_QUERY);
    }
  }, [selectedDatabaseId]);

  useEffect(() => {
    if (!selectedDatabaseId || sourceType !== "database") {
      setDatabaseConnecting(false);
      return;
    }

    setDatabaseConnecting(true);
    const timer = window.setTimeout(() => setDatabaseConnecting(false), 1400);
    return () => window.clearTimeout(timer);
  }, [selectedDatabaseId, sourceType]);

  useEffect(() => {
    if (mlSelectedDatabaseId) {
      setMlDatabaseQuery((current) => current.trim() ? current : DEFAULT_DATABASE_QUERY);
    }
  }, [mlSelectedDatabaseId]);

  useEffect(() => {
    if (
      !mlSelectedDatabaseId ||
      sourceType !== "ml-model" ||
      mlInputSource !== "database"
    ) {
      setMlDatabaseConnecting(false);
      return;
    }

    setMlDatabaseConnecting(true);
    const timer = window.setTimeout(() => setMlDatabaseConnecting(false), 1400);
    return () => window.clearTimeout(timer);
  }, [mlInputSource, mlSelectedDatabaseId, sourceType]);

  useEffect(() => {
    sessionStorage.setItem(
      DEV_DATA_SOURCE_STATE_KEY,
      JSON.stringify({
        sourceType,
        mlInputSource,
        databasePickerOpen,
        databasePickerContext,
        selectedDatabaseId,
        draftDatabaseId,
        apiPickerOpen,
        apiPickerContext,
        selectedApiId,
        draftApiId,
        selectedRequest,
        filePickerOpen,
        filePickerContext,
        selectedFileId,
        draftFileId,
        fileQuery,
        mlSelectedDatabaseId,
        mlDatabaseQuery,
        mlSelectedApiId,
        mlSelectedRequest,
        mlSelectedFileId,
        mlFileQuery,
        dataFlowPickerOpen,
        selectedDataFlowId,
        draftDataFlowId,
        outputProjection,
        query,
      } satisfies DevDataSourceState),
    );
  }, [
    sourceType,
    mlInputSource,
    databasePickerOpen,
    databasePickerContext,
    selectedDatabaseId,
    draftDatabaseId,
    apiPickerOpen,
    apiPickerContext,
    selectedApiId,
    draftApiId,
    selectedRequest,
    filePickerOpen,
    filePickerContext,
    selectedFileId,
    draftFileId,
    fileQuery,
    mlSelectedDatabaseId,
    mlDatabaseQuery,
    mlSelectedApiId,
    mlSelectedRequest,
    mlSelectedFileId,
    mlFileQuery,
    dataFlowPickerOpen,
    selectedDataFlowId,
    draftDataFlowId,
    outputProjection,
    query,
  ]);

  const openDatabasePickerFor = (context: PickerContext) => {
    setDatabasePickerContext(context);
    setDraftDatabaseId(context === "ml" ? mlSelectedDatabaseId : selectedDatabaseId);
    setDatabasePickerOpen(true);
  };
  const openDatabasePicker = () => openDatabasePickerFor("source");
  const openMlDatabasePicker = () => openDatabasePickerFor("ml");

  const openApiPickerFor = (context: PickerContext) => {
    setApiPickerContext(context);
    setDraftApiId(context === "ml" ? mlSelectedApiId : selectedApiId);
    setDraftApiRequest(context === "ml" ? mlSelectedRequest : selectedRequest);
    setApiPickerOpen(true);
  };
  const openApiPicker = () => openApiPickerFor("source");
  const openMlApiPicker = () => openApiPickerFor("ml");

  const openFilePickerFor = (context: PickerContext) => {
    setFilePickerContext(context);
    setDraftFileId(context === "ml" ? mlSelectedFileId : selectedFileId);
    setFilePickerOpen(true);
  };
  const openFilePicker = () => openFilePickerFor("source");
  const openMlFilePicker = () => openFilePickerFor("ml");
  const openDataFlowPicker = () => {
    setDraftDataFlowId(selectedDataFlowId);
    setDataFlowPickerOpen(true);
  };

  const clearSourceSelections = () => {
    setSelectedDatabaseId(null);
    setDraftDatabaseId(null);
    setQuery("");
    setSelectedApiId(null);
    setDraftApiId(null);
    setDraftApiRequest("");
    setSelectedRequest("");
    setSelectedFileId(null);
    setDraftFileId(null);
    setFileQuery("");
    setMlInputSource(null);
    setMlSelectedDatabaseId(null);
    setMlDatabaseQuery("");
    setMlSelectedApiId(null);
    setMlSelectedRequest("");
    setMlSelectedFileId(null);
    setMlFileQuery("");
    setSelectedDataFlowId(null);
    setDraftDataFlowId(null);
    setOutputProjection("");
  };

  const pickerModal = databasePickerOpen ? (
    <SourcePickerModal
      variant="database"
      onClose={() => setDatabasePickerOpen(false)}
    >
        <DatabaseConnectionPicker
          selectedId={draftDatabaseId}
          onChange={setDraftDatabaseId}
          onCancel={() => setDatabasePickerOpen(false)}
          onSelect={() => {
            if (!draftDatabaseId) return;
            if (databasePickerContext === "ml") {
              setMlSelectedDatabaseId(draftDatabaseId);
            } else {
              setSelectedDatabaseId(draftDatabaseId);
            }
            setDatabasePickerOpen(false);
          }}
        />
    </SourcePickerModal>
  ) : apiPickerOpen ? (
    <SourcePickerModal variant="api" onClose={() => setApiPickerOpen(false)}>
        <ApiSourcePicker
          selectedId={draftApiId}
          selectedRequestId={draftApiRequest}
          onChange={(collectionId, requestId) => {
            setDraftApiId(collectionId);
            setDraftApiRequest(requestId);
          }}
          onCancel={() => setApiPickerOpen(false)}
          onSelect={() => {
            if (!draftApiId || !draftApiRequest) return;
            if (apiPickerContext === "ml") {
              setMlSelectedApiId(draftApiId);
              setMlSelectedRequest("");
            } else {
              setSelectedApiId(draftApiId);
              setSelectedRequest("");
            }
            setApiPickerOpen(false);
          }}
        />
    </SourcePickerModal>
  ) : filePickerOpen ? (
    <SourcePickerModal variant="file" onClose={() => setFilePickerOpen(false)}>
        <FileSourcePicker
          selectedId={draftFileId}
          onChange={setDraftFileId}
          onCancel={() => setFilePickerOpen(false)}
          onSelect={() => {
            if (!draftFileId) return;
            const file = FILE_SOURCES.find((source) => source.id === draftFileId);
            const nextQuery = file ? `SELECT * FROM ${file.tableName} LIMIT 50000;` : "";
            if (filePickerContext === "ml") {
              setMlSelectedFileId(draftFileId);
              setMlFileQuery(nextQuery);
            } else {
              setSelectedFileId(draftFileId);
              setFileQuery(nextQuery);
            }
            setFilePickerOpen(false);
          }}
        />
    </SourcePickerModal>
  ) : dataFlowPickerOpen ? (
    <SourcePickerModal variant="data-flow" onClose={() => setDataFlowPickerOpen(false)}>
        <DataFlowPicker
          selectedId={draftDataFlowId}
          onChange={setDraftDataFlowId}
          onCancel={() => setDataFlowPickerOpen(false)}
          onSelect={() => {
            if (!draftDataFlowId) return;
            setSelectedDataFlowId(draftDataFlowId);
            setOutputProjection("");
            setDataFlowPickerOpen(false);
          }}
        />
    </SourcePickerModal>
  ) : null;

  return (
    <>
      <div className={"ds-step" + (shouldFillQuery ? " ds-step--query-fill" : "")}>
        {selectedSourceOption ? (
          <section
            className="ds-selected-source-type"
            aria-labelledby="ds-selected-source-type-label"
          >
            <h3 id="ds-selected-source-type-label">Selected Data Source Type</h3>
            <div className="ds-selected-source-type__card">
              <span className="ds-selected-source-type__icon">{selectedSourceOption.icon}</span>
              <strong>{selectedSourceOption.title}</strong>
              <button
                type="button"
                onClick={() => {
                  clearSourceSelections();
                  setSourceType(null);
                  setDatabasePickerOpen(false);
                  setApiPickerOpen(false);
                  setFilePickerOpen(false);
                  setDataFlowPickerOpen(false);
                }}
              >
                Change
              </button>
              </div>
            </section>
        ) : (
          <section className="ds-source-types" aria-labelledby="ds-source-types-label">
            <h3 id="ds-source-types-label" className="ds-source-types__label">
              Select Source Type
            </h3>
            <div className="ds-source-types__grid">
              {SOURCE_TYPES.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  className="ds-source-type-card"
                  aria-pressed="false"
                  onClick={() => {
                    clearSourceSelections();
                    setSourceType(source.id);
                    setDatabasePickerOpen(false);
                    setApiPickerOpen(false);
                    setFilePickerOpen(false);
                    setDataFlowPickerOpen(false);
                  }}
                >
                  <span className="ds-source-type-card__icon">{source.icon}</span>
                  <span className="ds-source-type-card__content">
                    <strong>{source.title}</strong>
                    <span>{source.description}</span>
                  </span>
                </button>
              ))}
          </div>
          </section>
        )}

        {sourceType && (
          <SourceConfiguration
            sourceType={sourceType}
            mlInputSource={mlInputSource}
            onMlInputSourceChange={setMlInputSource}
            selectedDatabase={selectedDatabase}
            isDatabaseConnecting={databaseConnecting}
            onOpenDatabasePicker={openDatabasePicker}
            selectedApi={selectedApi}
            onOpenApiPicker={openApiPicker}
            selectedRequest={selectedRequest}
            onSelectedRequestChange={setSelectedRequest}
            selectedFile={selectedFile}
            onOpenFilePicker={openFilePicker}
            fileQuery={fileQuery}
            onFileQueryChange={setFileQuery}
            mlSelectedDatabase={mlSelectedDatabase}
            isMlDatabaseConnecting={mlDatabaseConnecting}
            onOpenMlDatabasePicker={openMlDatabasePicker}
            mlDatabaseQuery={mlDatabaseQuery}
            onMlDatabaseQueryChange={setMlDatabaseQuery}
            mlSelectedApi={mlSelectedApi}
            onOpenMlApiPicker={openMlApiPicker}
            mlSelectedRequest={mlSelectedRequest}
            onMlSelectedRequestChange={setMlSelectedRequest}
            mlSelectedFile={mlSelectedFile}
            onOpenMlFilePicker={openMlFilePicker}
            mlFileQuery={mlFileQuery}
            onMlFileQueryChange={setMlFileQuery}
            selectedDataFlow={selectedDataFlow}
            onOpenDataFlowPicker={openDataFlowPicker}
            outputProjection={outputProjection}
            onOutputProjectionChange={setOutputProjection}
            query={query}
            onQueryChange={setQuery}
          />
        )}
    </div>
      {pickerModal}
    </>
  );
}
