import { useState, type ReactNode } from "react";
import {
  ArrowCounterClockwise,
  Diamond,
  DotsSixVertical,
  GridFour,
  PaperPlaneTilt,
} from "@phosphor-icons/react";
import Dropdown from "./Dropdown";
import { TrashIcon } from "./icons";

type RequestTab = "Parameters" | "Authentication" | "Headers" | "Body" | "Scripts";

type QueryParam = {
  id: number;
  key: string;
  value: string;
  enabled: boolean;
};

const REQUEST_TABS: RequestTab[] = ["Parameters", "Authentication", "Headers", "Body", "Scripts"];

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => ({ value: m, label: m }));

let paramUid = 0;
const nextParamId = () => ++paramUid;

const INITIAL_PARAMS: QueryParam[] = [
  { id: nextParamId(), key: "location", value: "New York", enabled: true },
  { id: nextParamId(), key: "units", value: "metric", enabled: true },
  { id: nextParamId(), key: "", value: "", enabled: false },
];

function ParamToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <span
      role="switch"
      aria-checked={on}
      className={"ia-mini-switch" + (on ? " on" : "")}
      onClick={() => onChange(!on)}
    />
  );
}

function QueryParamRow({
  row,
  onChange,
  onRemove,
}: {
  row: QueryParam;
  onChange: (next: QueryParam) => void;
  onRemove: () => void;
}) {
  return (
    <div className="ds-param-row">
      <button type="button" className="ds-param-row__drag" aria-label="Reorder parameter" tabIndex={-1}>
        <DotsSixVertical size={16} weight="bold" aria-hidden="true" />
      </button>
      <ParamToggle on={row.enabled} onChange={(enabled) => onChange({ ...row, enabled })} />
      <input
        className="ds-param-row__input"
        type="text"
        placeholder="Key"
        value={row.key}
        onChange={(e) => onChange({ ...row, key: e.target.value })}
      />
      <input
        className="ds-param-row__input"
        type="text"
        placeholder="Value"
        value={row.value}
        onChange={(e) => onChange({ ...row, value: e.target.value })}
      />
      <button type="button" className="ds-param-row__del" aria-label="Remove parameter" onClick={onRemove}>
        <TrashIcon width={16} height={16} />
      </button>
    </div>
  );
}

function SourceCard({
  label,
  icon,
  iconTone,
  title,
  subtitle,
  actions,
}: {
  label: string;
  icon: ReactNode;
  iconTone: "api" | "request";
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <section className="ds-block">
      <h4 className="ds-block__label">{label}</h4>
      <div className="ds-source-card">
        <div className="ds-source-card__main">
          <span className={"ds-source-card__icon ds-source-card__icon--" + iconTone}>{icon}</span>
          <div className="ds-source-card__text">
            <strong>{title}</strong>
            {subtitle && <span>{subtitle}</span>}
          </div>
        </div>
        {actions && <div className="ds-source-card__actions">{actions}</div>}
      </div>
    </section>
  );
}

export default function DataSourceStep() {
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState(
    "https://weather.secureclient.com/api/v1/current?location=New York&units=metric",
  );
  const [requestTab, setRequestTab] = useState<RequestTab>("Parameters");
  const [params, setParams] = useState<QueryParam[]>(INITIAL_PARAMS);
  const [pathKey, setPathKey] = useState("");
  const [pathValue, setPathValue] = useState("");

  const updateParam = (id: number, next: QueryParam) => {
    setParams((list) => list.map((p) => (p.id === id ? next : p)));
  };

  const removeParam = (id: number) => {
    setParams((list) => (list.length > 1 ? list.filter((p) => p.id !== id) : list));
  };

  return (
    <div className="ds-step">
      <SourceCard
        label="Selected Data Source Type"
        iconTone="api"
        icon={<Diamond size={20} weight="fill" aria-hidden="true" />}
        title="API"
        actions={
          <button type="button" className="ds-link-btn">
            Change
          </button>
        }
      />

      <SourceCard
        label="API Request"
        iconTone="request"
        icon={<GridFour size={20} weight="fill" aria-hidden="true" />}
        title="Get Current Weather"
        subtitle="Collection: Weather Services"
        actions={
          <>
            <button type="button" className="btn btn--ghost btn--sm" disabled>
              <ArrowCounterClockwise size={16} aria-hidden="true" />
              <span>Reset</span>
            </button>
            <button type="button" className="ds-link-btn">
              Change
            </button>
          </>
        }
      />

      <div className="ds-url-bar">
        <Dropdown
          className="ds-url-bar__method"
          compact
          value={method}
          onChange={setMethod}
          options={HTTP_METHODS}
          ariaLabel="HTTP method"
        />
        <input
          className="ds-url-bar__input"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-label="Request URL"
        />
        <button type="button" className="pg-btn pg-btn--primary pg-btn--icon-left ds-url-bar__send">
          <PaperPlaneTilt className="pg-btn__icon" size={16} weight="fill" aria-hidden="true" />
          <span>Send</span>
        </button>
      </div>

      <section className="ds-request">
        <h3 className="ds-request__title">Request</h3>
        <div className="ds-request-tabs" role="tablist" aria-label="Request configuration">
          {REQUEST_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={requestTab === tab}
              className={"ds-request-tab" + (requestTab === tab ? " is-active" : "")}
              onClick={() => setRequestTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {requestTab === "Parameters" && (
          <div className="ds-request-panel">
            <section className="ds-block">
              <h4 className="ds-block__label">Query Params</h4>
              <div className="ds-param-table">
                <div className="ds-param-table__head">
                  <span />
                  <span />
                  <span>Key</span>
                  <span>Value</span>
                  <span />
                </div>
                {params.map((row) => (
                  <QueryParamRow
                    key={row.id}
                    row={row}
                    onChange={(next) => updateParam(row.id, next)}
                    onRemove={() => removeParam(row.id)}
                  />
                ))}
              </div>
            </section>

            <section className="ds-block">
              <h4 className="ds-block__label">Path Variables</h4>
              <div className="ds-param-table ds-param-table--single">
                <div className="ds-param-row ds-param-row--pair">
                  <input
                    className="ds-param-row__input"
                    type="text"
                    placeholder="Key"
                    value={pathKey}
                    onChange={(e) => setPathKey(e.target.value)}
                  />
                  <input
                    className="ds-param-row__input"
                    type="text"
                    placeholder="Value"
                    value={pathValue}
                    onChange={(e) => setPathValue(e.target.value)}
                  />
                </div>
              </div>
            </section>
          </div>
        )}

        {requestTab !== "Parameters" && (
          <div className="ds-request-panel ds-request-panel--placeholder">
            <p>{requestTab} configuration is not available in this preview.</p>
          </div>
        )}
      </section>
    </div>
  );
}
