type QueryTable = {
  columns: string[];
  rows: Record<string, string | number>[];
};

const QUERY_TABLES: Record<string, QueryTable> = {
  bar: {
    columns: ["category", "value", "series"],
    rows: [
      { category: "District A", value: 42, series: "FY24" },
      { category: "District B", value: 38, series: "FY24" },
      { category: "District C", value: 51, series: "FY24" },
      { category: "District D", value: 29, series: "FY24" },
      { category: "District E", value: 46, series: "FY24" },
      { category: "District F", value: 33, series: "FY24" },
    ],
  },
  line: {
    columns: ["timestamp", "value", "series"],
    rows: [
      { timestamp: "2024-01", value: 18, series: "Actual" },
      { timestamp: "2024-02", value: 22, series: "Actual" },
      { timestamp: "2024-03", value: 19, series: "Actual" },
      { timestamp: "2024-04", value: 27, series: "Actual" },
      { timestamp: "2024-05", value: 24, series: "Actual" },
      { timestamp: "2024-06", value: 31, series: "Actual" },
    ],
  },
  area: {
    columns: ["timestamp", "value", "series"],
    rows: [
      { timestamp: "2024-01", value: 12, series: "Volume" },
      { timestamp: "2024-02", value: 16, series: "Volume" },
      { timestamp: "2024-03", value: 14, series: "Volume" },
      { timestamp: "2024-04", value: 21, series: "Volume" },
      { timestamp: "2024-05", value: 18, series: "Volume" },
      { timestamp: "2024-06", value: 25, series: "Volume" },
    ],
  },
  scatter: {
    columns: ["x_value", "y_value", "category"],
    rows: [
      { x_value: 12, y_value: 34, category: "Cluster A" },
      { x_value: 18, y_value: 28, category: "Cluster A" },
      { x_value: 24, y_value: 41, category: "Cluster B" },
      { x_value: 31, y_value: 36, category: "Cluster B" },
      { x_value: 37, y_value: 52, category: "Cluster C" },
      { x_value: 44, y_value: 47, category: "Cluster C" },
    ],
  },
  pie: {
    columns: ["category", "value"],
    rows: [
      { category: "Residential", value: 38 },
      { category: "Commercial", value: 27 },
      { category: "Industrial", value: 19 },
      { category: "Mixed use", value: 16 },
    ],
  },
  gauge: {
    columns: ["value", "unit", "status"],
    rows: [
      { value: 73, unit: "%", status: "On track" },
      { value: 100, unit: "%", status: "Target" },
    ],
  },
  kpi: {
    columns: ["metric_label", "value", "unit", "status"],
    rows: [
      { metric_label: "Completion rate", value: 94, unit: "%", status: "Positive" },
      { metric_label: "Prior period", value: 88, unit: "%", status: "Baseline" },
    ],
  },
  table: {
    columns: ["region", "amount", "status", "timestamp"],
    rows: [
      { region: "North", amount: "1.2M", status: "Active", timestamp: "2024-06-01" },
      { region: "South", amount: "980K", status: "Active", timestamp: "2024-06-01" },
      { region: "East", amount: "1.4M", status: "Review", timestamp: "2024-06-01" },
      { region: "West", amount: "760K", status: "Active", timestamp: "2024-06-01" },
      { region: "Central", amount: "1.1M", status: "Active", timestamp: "2024-06-01" },
    ],
  },
};

const DEFAULT_TABLE: QueryTable = QUERY_TABLES.bar;

function labelForColumn(key: string): string {
  return key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

type Props = {
  chartId: string;
};

export default function ChartDataQueryPreview({ chartId }: Props) {
  const table = QUERY_TABLES[chartId] ?? DEFAULT_TABLE;

  return (
    <div className="chart-data-query">
      <div className="chart-data-query__meta">
        <span className="chart-data-query__label">Query result</span>
        <span className="chart-data-query__count">{table.rows.length} rows</span>
      </div>
      <div className="chart-data-query__table-wrap">
        <table className="chart-data-query__table">
          <thead>
            <tr>
              {table.columns.map((col) => (
                <th key={col} scope="col">
                  {labelForColumn(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, index) => (
              <tr key={index}>
                {table.columns.map((col) => (
                  <td key={col}>{row[col]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
