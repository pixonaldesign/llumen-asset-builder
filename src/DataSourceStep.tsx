import { useEffect, useState, type DragEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  CaretDown,
  CirclesFour,
  Database,
  File,
  FileArrowUp,
  FlowArrow,
  Globe,
  Info,
  Play,
  Plus,
  Sparkle,
  Stack,
  UploadSimple,
} from "@phosphor-icons/react";

type SourceType = "database" | "api" | "file-upload" | "ai-model" | "ml-model" | "data-flow";
type MlInputSource = "database" | "api" | "file-source" | "local-file";
type PickerContext = "source" | "ml";

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
  sourceType: SourceType;
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

const DEV_DATA_SOURCE_STATE_KEY = "llumen.dev.data-source-state";

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
    icon: <Database size={18} aria-hidden="true" />,
  },
  {
    id: "api",
    title: "API",
    description: "REST or GraphQL API sources, same flow as standard components",
    icon: <Globe size={18} aria-hidden="true" />,
  },
  {
    id: "file-source",
    title: "File source",
    description: "Files uploaded to Llumen and registered as queryable tables",
    icon: <File size={18} aria-hidden="true" />,
  },
  {
    id: "local-file",
    title: "Local file",
    description: "Parse CSV, JSON, or GeoJSON in the browser without creating a source first",
    icon: <UploadSimple size={18} aria-hidden="true" />,
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
];

const API_SOURCES: ApiSource[] = [
  { id: "ead-main", name: "EAD", description: "No description", active: false },
  { id: "ead-waste", name: "EAD waste", description: "No description", active: false },
  { id: "ead-data", name: "EAD", description: "No description", active: false },
  { id: "ead-services", name: "EAD", description: "No description", active: false },
  {
    id: "weather-api",
    name: "Weather API",
    description: "APIs used for weather forecasting",
    active: false,
  },
  { id: "testingapi", name: "testingapi", description: "No description", active: true },
];

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
            <Info size={13} aria-hidden="true" />
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
  return (
    <section className="ds-db-picker">
      <header className="ds-db-picker__header">
        <div className="ds-db-picker__title">
          <button type="button" className="ds-db-picker__back" aria-label="Back" onClick={onCancel}>
            <ArrowLeft size={15} aria-hidden="true" />
          </button>
          <h2>Select Database Connection</h2>
        </div>
        <div className="ds-db-picker__actions">
          <button type="button" className="pg-btn pg-btn--ghost pg-btn--sm pg-btn--icon-left ds-db-picker__new">
            <Plus className="pg-btn__icon" size={14} aria-hidden="true" />
            New
          </button>
          <button
            type="button"
            className="pg-btn pg-btn--primary pg-btn--sm"
            disabled={!selectedId}
            onClick={onSelect}
          >
            Select
          </button>
        </div>
      </header>

      <div className="ds-db-picker__list" role="listbox" aria-label="Database connections">
        {DATABASE_CONNECTIONS.map((connection) => {
          const selected = selectedId === connection.id;
          return (
            <button
              key={connection.id}
              type="button"
              role="option"
              aria-selected={selected}
              className={"ds-db-row" + (selected ? " is-selected" : "")}
              onClick={() => onChange(connection.id)}
            >
              <span className="ds-db-row__icon">
                <Database size={19} aria-hidden="true" />
              </span>
              <span className="ds-db-row__content">
                <strong>{connection.name}</strong>
                <span>{connection.description}</span>
                <small>{connection.schema}</small>
              </span>
              <span className={"ds-db-row__status" + (connection.active ? " is-active" : "")}>
                <i aria-hidden="true" />
                {connection.active ? "Active" : "Inactive"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ApiSourcePicker({
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
  return (
    <section className="ds-db-picker">
      <header className="ds-db-picker__header">
        <div className="ds-db-picker__title">
          <button type="button" className="ds-db-picker__back" aria-label="Back" onClick={onCancel}>
            <ArrowLeft size={15} aria-hidden="true" />
          </button>
          <h2>Select API Source</h2>
        </div>
        <div className="ds-db-picker__actions">
          <button
            type="button"
            className="pg-btn pg-btn--primary pg-btn--sm"
            disabled={!selectedId}
            onClick={onSelect}
          >
            Select
          </button>
        </div>
      </header>

      <div className="ds-db-picker__list" role="listbox" aria-label="API sources">
        {API_SOURCES.map((source) => {
          const selected = selectedId === source.id;
          return (
            <button
              key={source.id}
              type="button"
              role="option"
              aria-selected={selected}
              className={"ds-db-row" + (selected ? " is-selected" : "")}
              onClick={() => onChange(source.id)}
            >
              <span className="ds-db-row__icon">
                <Globe size={19} aria-hidden="true" />
              </span>
              <span className="ds-db-row__content">
                <strong>{source.name}</strong>
                <span>{source.description}</span>
                <small>API</small>
              </span>
              <span className={"ds-db-row__status" + (source.active ? " is-active" : "")}>
                <i aria-hidden="true" />
                {source.active ? "Active" : "Inactive"}
              </span>
            </button>
          );
        })}
      </div>
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
  return (
    <section className="ds-db-picker">
      <header className="ds-db-picker__header">
        <div className="ds-db-picker__title">
          <button type="button" className="ds-db-picker__back" aria-label="Back" onClick={onCancel}>
            <ArrowLeft size={15} aria-hidden="true" />
          </button>
          <h2>Select File</h2>
        </div>
        <div className="ds-db-picker__actions">
          <button type="button" className="pg-btn pg-btn--ghost pg-btn--sm pg-btn--icon-left ds-db-picker__new">
            <Plus className="pg-btn__icon" size={14} aria-hidden="true" />
            New
          </button>
          <button
            type="button"
            className="pg-btn pg-btn--primary pg-btn--sm"
            disabled={!selectedId}
            onClick={onSelect}
          >
            Select
          </button>
        </div>
      </header>

      <div className="ds-db-picker__list" role="listbox" aria-label="Uploaded files">
        {FILE_SOURCES.map((source) => {
          const selected = selectedId === source.id;
          return (
            <button
              key={source.id}
              type="button"
              role="option"
              aria-selected={selected}
              className={"ds-db-row" + (selected ? " is-selected" : "")}
              onClick={() => onChange(source.id)}
            >
              <span className="ds-db-row__icon">
                <File size={19} aria-hidden="true" />
              </span>
              <span className="ds-db-row__content">
                <strong>{source.name}</strong>
                <span>{source.fileName}</span>
                <small>
                  Uploaded File · {source.rows.toLocaleString()} rows · {source.tableName}
                </small>
              </span>
              <span className={"ds-db-row__status" + (source.active ? " is-active" : "")}>
                <i aria-hidden="true" />
                {source.active ? "Active" : "Inactive"}
              </span>
            </button>
          );
        })}
      </div>
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
  return (
    <section className="ds-db-picker">
      <header className="ds-db-picker__header">
        <div className="ds-db-picker__title">
          <button type="button" className="ds-db-picker__back" aria-label="Back" onClick={onCancel}>
            <ArrowLeft size={15} aria-hidden="true" />
          </button>
          <h2>Select Data Flow</h2>
        </div>
        <div className="ds-db-picker__actions">
          <button
            type="button"
            className="pg-btn pg-btn--primary pg-btn--sm"
            disabled={!selectedId}
            onClick={onSelect}
          >
            Select
          </button>
        </div>
      </header>

      <div className="ds-db-picker__list" role="listbox" aria-label="Data flows">
        {DATA_FLOWS.map((flow) => {
          const selected = selectedId === flow.id;
          return (
            <button
              key={flow.id}
              type="button"
              role="option"
              aria-selected={selected}
              className={"ds-db-row" + (selected ? " is-selected" : "")}
              onClick={() => onChange(flow.id)}
            >
              <span className="ds-db-row__icon">
                <FlowArrow size={19} aria-hidden="true" />
              </span>
              <span className="ds-db-row__content">
                <strong>{flow.name}</strong>
                <span>{flow.description}</span>
                <small>Data Flow · {flow.columns.length} columns</small>
              </span>
            </button>
          );
        })}
      </div>
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
  onRequestChange,
}: {
  request: string;
  onRequestChange: (request: string) => void;
}) {
  return (
    <section className="ds-api-request">
      <header className="ds-api-request__header">
        <h3>API Request</h3>
        <button type="button" className="ds-api-request__send" disabled={!request}>
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
            <option value="get-current">Get current data</option>
            <option value="get-status">Get service status</option>
            <option value="post-query">Submit query</option>
          </select>
          <CaretDown size={14} aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}

function QueryEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <section className="ds-query">
      <header className="ds-query__header">
        <h3>Query</h3>
        <div className="ds-query__actions">
          <button type="button" className="ds-query__generate">
            <Sparkle size={12} weight="fill" aria-hidden="true" />
            Generate
          </button>
          <button type="button" className="ds-query__execute">
            Execute
            <Play size={12} weight="fill" aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="ds-query__editor">
        <span className="ds-query__line-number" aria-hidden="true">
          1
        </span>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label="SQL query"
          spellCheck={false}
        />
      </div>
      <footer className="ds-query__footer">Dialect: SQL (Standard SQL)</footer>
    </section>
  );
}

function SourceConfiguration({
  sourceType,
  mlInputSource,
  onMlInputSourceChange,
  selectedDatabase,
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
              <span className="ds-db-selected__content">
                <strong>{selectedDatabase.name}</strong>
                <small>{selectedDatabase.schema}</small>
              </span>
              <span className="ds-db-selected__trailing">
                <Database size={16} aria-hidden="true" />
              </span>
              <button type="button" className="ds-db-selected__change" onClick={onOpenDatabasePicker}>
                Change
              </button>
            </div>
          ) : (
            <SourceActionField
              label="Select Database Connection"
              icon={<Database size={20} aria-hidden="true" />}
              onClick={onOpenDatabasePicker}
            />
          )}
        </section>
        {selectedDatabase && <QueryEditor value={query} onChange={onQueryChange} />}
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
              <Globe size={18} aria-hidden="true" />
              <span className="ds-db-selected__content">
                <strong>{selectedApi.name}</strong>
                <small>API connection</small>
              </span>
              <span className="ds-db-selected__trailing">
                <Globe size={16} aria-hidden="true" />
              </span>
              <button type="button" className="ds-db-selected__change" onClick={onOpenApiPicker}>
                Change
              </button>
            </div>
          ) : (
            <SourceActionField
              label="Select API Source"
              icon={<Globe size={20} aria-hidden="true" />}
              onClick={onOpenApiPicker}
            />
          )}
        </section>
        {selectedApi && (
          <ApiRequestPanel request={selectedRequest} onRequestChange={onSelectedRequestChange} />
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
              <File size={18} aria-hidden="true" />
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
              icon={<File size={20} aria-hidden="true" />}
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

        <section className="ds-config">
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
                  <span className="ds-db-selected__content">
                    <strong>{mlSelectedDatabase.name}</strong>
                    <small>{mlSelectedDatabase.schema}</small>
                  </span>
                  <span className="ds-db-selected__trailing">
                    <Database size={16} aria-hidden="true" />
                  </span>
                  <button
                    type="button"
                    className="ds-db-selected__change"
                    onClick={onOpenMlDatabasePicker}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <SourceActionField
                  label="Select Database Connection"
                  icon={<Database size={20} aria-hidden="true" />}
                  onClick={onOpenMlDatabasePicker}
                />
              )}
            </section>
            {mlSelectedDatabase && (
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
  onSelectionChange,
}: {
  onSelectionChange?: (label: string | null) => void;
}) {
  const [restoredState] = useState(readDevDataSourceState);
  const [sourceType, setSourceType] = useState<SourceType>(restoredState.sourceType ?? "database");
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
  const selectedDatabase =
    DATABASE_CONNECTIONS.find((connection) => connection.id === selectedDatabaseId) ?? null;
  const selectedApi = API_SOURCES.find((source) => source.id === selectedApiId) ?? null;
  const selectedFile = FILE_SOURCES.find((source) => source.id === selectedFileId) ?? null;
  const mlSelectedDatabase =
    DATABASE_CONNECTIONS.find((connection) => connection.id === mlSelectedDatabaseId) ?? null;
  const mlSelectedApi = API_SOURCES.find((source) => source.id === mlSelectedApiId) ?? null;
  const mlSelectedFile = FILE_SOURCES.find((source) => source.id === mlSelectedFileId) ?? null;
  const selectedDataFlow = DATA_FLOWS.find((flow) => flow.id === selectedDataFlowId) ?? null;
  const selectedMlInputLabel =
    mlInputSource === "database"
      ? mlSelectedDatabase?.name
      : mlInputSource === "api"
        ? mlSelectedApi?.name
        : mlInputSource === "file-source"
          ? mlSelectedFile?.name
          : mlInputSource === "local-file"
            ? "Local file"
            : null;
  const selectedSourceLabel =
    sourceType === "database"
      ? selectedDatabase?.name
      : sourceType === "api"
        ? selectedApi?.name
        : sourceType === "file-upload"
          ? selectedFile?.name
          : sourceType === "ml-model"
            ? selectedMlInputLabel
            : sourceType === "data-flow"
              ? selectedDataFlow?.name
              : null;

  useEffect(() => {
    onSelectionChange?.(selectedSourceLabel ?? null);
  }, [onSelectionChange, selectedSourceLabel]);

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

  if (databasePickerOpen) {
    return (
      <div className="ds-step ds-step--database-picker">
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
      </div>
    );
  }

  if (apiPickerOpen) {
    return (
      <div className="ds-step ds-step--database-picker">
        <ApiSourcePicker
          selectedId={draftApiId}
          onChange={setDraftApiId}
          onCancel={() => setApiPickerOpen(false)}
          onSelect={() => {
            if (!draftApiId) return;
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
      </div>
    );
  }

  if (filePickerOpen) {
    return (
      <div className="ds-step ds-step--database-picker">
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
      </div>
    );
  }

  if (dataFlowPickerOpen) {
    return (
      <div className="ds-step ds-step--database-picker">
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
      </div>
    );
  }

  return (
    <div className="ds-step">
      <section className="ds-source-types" aria-labelledby="ds-source-types-label">
        <h3 id="ds-source-types-label" className="ds-source-types__label">
          Select Source Type
        </h3>
        <div className="ds-source-types__grid">
          {SOURCE_TYPES.map((source) => {
            const selected = sourceType === source.id;
            return (
              <button
                key={source.id}
                type="button"
                className={"ds-source-type-card" + (selected ? " is-selected" : "")}
                aria-pressed={selected}
                onClick={() => {
                  if (source.id !== sourceType) clearSourceSelections();
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
            );
          })}
        </div>
      </section>

      <SourceConfiguration
        sourceType={sourceType}
        mlInputSource={mlInputSource}
        onMlInputSourceChange={setMlInputSource}
        selectedDatabase={selectedDatabase}
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
    </div>
  );
}
