export type ColumnType = "number" | "string" | "datetime";

export type MockColumn = {
  name: string;
  label: string;
  type: ColumnType;
};

export type MockRow = Record<string, string | number>;

export type MockDataset = {
  id: string;
  name: string;
  columns: MockColumn[];
  rows: MockRow[];
};

const DISTRICTS = [
  { district: "North", region: "Metro", category: "Residential" },
  { district: "South", region: "Metro", category: "Commercial" },
  { district: "East", region: "Coastal", category: "Industrial" },
  { district: "West", region: "Inland", category: "Residential" },
  { district: "Central", region: "Metro", category: "Mixed use" },
  { district: "Harbor", region: "Coastal", category: "Commercial" },
] as const;

const MONTHS = ["2024-01", "2024-02", "2024-03", "2024-04"] as const;

const BASE: Record<string, { value: number; amount: number; incidents: number; completion: number }> = {
  North: { value: 42, amount: 1.8, incidents: 4, completion: 94 },
  South: { value: 38, amount: 2.4, incidents: 7, completion: 88 },
  East: { value: 51, amount: 3.1, incidents: 11, completion: 76 },
  West: { value: 29, amount: 1.2, incidents: 3, completion: 91 },
  Central: { value: 46, amount: 2.7, incidents: 6, completion: 83 },
  Harbor: { value: 33, amount: 2.1, incidents: 5, completion: 89 },
};

const MONTH_LIFT = [1, 1.08, 0.94, 1.16];

function statusFor(rate: number): string {
  if (rate >= 90) return "On track";
  if (rate >= 80) return "Watch";
  return "At risk";
}

function buildRows(): MockRow[] {
  const rows: MockRow[] = [];
  DISTRICTS.forEach((place, di) => {
    const base = BASE[place.district];
    MONTHS.forEach((month, mi) => {
      const lift = MONTH_LIFT[mi] * (1 + ((di + mi) % 3) * 0.03);
      const value = Math.round(base.value * lift);
      const amount = Number((base.amount * lift).toFixed(2));
      const incidents = Math.max(1, Math.round(base.incidents * (2 - lift)));
      const completion = Math.min(99, Math.round(base.completion * (0.96 + mi * 0.015)));
      const actual = value;
      const predicted = Math.round(value * (0.92 + ((mi + di) % 4) * 0.04));
      const dest = DISTRICTS[(di + 1 + mi) % DISTRICTS.length].district;
      const dirs = ["N", "NE", "E", "SE", "S", "SW"] as const;
      rows.push({
        district: place.district,
        region: place.region,
        category: place.category,
        timestamp: month,
        value,
        total: Math.round(value * 1.45 + 18 + mi * 4),
        amount,
        incidents,
        completion_rate: completion,
        status: statusFor(completion),
        unit: "%",
        series: mi % 2 === 0 ? "Actual" : "Forecast",
        predicted,
        actual,
        name: place.district,
        type: place.category,
        direction: dirs[di],
        wind_speed: Number((6 + incidents * 1.4 + mi).toFixed(1)),
        origin: place.district,
        destination: dest,
        geometry: `${place.district} polygon`,
        coordinates: `${place.district} point`,
      });
    });
  });
  return rows;
}

export const MOCK_DATASET: MockDataset = {
  id: "market-ops",
  name: "Market operations (mock)",
  columns: [
    { name: "district", label: "District", type: "string" },
    { name: "region", label: "Region", type: "string" },
    { name: "category", label: "Land use", type: "string" },
    { name: "timestamp", label: "Month", type: "datetime" },
    { name: "value", label: "Registrations", type: "number" },
    { name: "total", label: "Quota / total", type: "number" },
    { name: "amount", label: "Transaction value (M AED)", type: "number" },
    { name: "incidents", label: "Incidents", type: "number" },
    { name: "completion_rate", label: "Completion rate (%)", type: "number" },
    { name: "status", label: "Status", type: "string" },
    { name: "unit", label: "Unit", type: "string" },
    { name: "series", label: "Series", type: "string" },
    { name: "predicted", label: "Predicted", type: "number" },
    { name: "actual", label: "Actual", type: "number" },
    { name: "name", label: "Name", type: "string" },
    { name: "type", label: "Type", type: "string" },
    { name: "direction", label: "Direction", type: "string" },
    { name: "wind_speed", label: "Wind speed", type: "number" },
    { name: "origin", label: "Origin", type: "string" },
    { name: "destination", label: "Destination", type: "string" },
    { name: "geometry", label: "Geometry", type: "string" },
    { name: "coordinates", label: "Coordinates", type: "string" },
  ],
  rows: buildRows(),
};

export const DISTRICT_LAYOUT: Record<string, { x: number; y: number }> = {
  North: { x: 0.5, y: 0.16 },
  West: { x: 0.16, y: 0.48 },
  Central: { x: 0.48, y: 0.5 },
  East: { x: 0.84, y: 0.4 },
  South: { x: 0.46, y: 0.84 },
  Harbor: { x: 0.78, y: 0.74 },
};

export function uniqueValues(col: string, dataset: MockDataset = MOCK_DATASET): string[] {
  const seen: string[] = [];
  for (const row of dataset.rows) {
    const v = String(row[col] ?? "");
    if (v && !seen.includes(v)) seen.push(v);
  }
  return seen;
}

export function columnByName(name: string, dataset: MockDataset = MOCK_DATASET): MockColumn | undefined {
  return dataset.columns.find((c) => c.name === name);
}

export function columnLabel(name: string, dataset: MockDataset = MOCK_DATASET): string {
  return columnByName(name, dataset)?.label ?? name;
}

const NUMERIC_FIELD = /y axis|x value|y value|value|amount|max|min|size|intensity|low|high|comparison|kpi value|frequency|wind speed|completion|incident|predicted|actual/i;
const CATEGORY_FIELD = /status|category|series|unit|label|district|region|name|type|origin|destination|location/i;
const TIME_FIELD = /timestamp|time|date|month/i;

export function columnsForField(fieldName: string, dataset: MockDataset = MOCK_DATASET): MockColumn[] {
  if (NUMERIC_FIELD.test(fieldName) && !/category|label|status|unit/i.test(fieldName)) {
    return dataset.columns.filter((c) => c.type === "number");
  }
  if (TIME_FIELD.test(fieldName)) {
    return dataset.columns.filter((c) => c.type === "datetime" || c.type === "string");
  }
  if (CATEGORY_FIELD.test(fieldName)) {
    return dataset.columns.filter((c) => c.type === "string" || c.type === "datetime");
  }
  return dataset.columns;
}

export function defaultColumnForField(fieldName: string, dataset: MockDataset = MOCK_DATASET): string {
  const preferred: Record<string, string> = {
    "X axis": "district",
    "Y axis": "value",
    "Y category": "district",
    "X value": "value",
    "Y value": "incidents",
    Category: "district",
    Value: "value",
    Unit: "unit",
    Status: "status",
    "Metric label": "district",
    "Secondary label/context": "region",
    "Low value": "incidents",
    "High value": "value",
    Direction: "direction",
    "Wind speed": "wind_speed",
    Origin: "origin",
    Destination: "destination",
    "Geometry Column": "geometry",
    "Location field": "district",
    "Coordinates (Geometry)": "coordinates",
    Location: "district",
    Geometry: "geometry",
    Name: "name",
    Type: "type",
    Coordinates: "coordinates",
    "Intensity Value Field": "value",
    "Point size": "value",
    "Color/Category": "category",
    "Max/Total": "total",
    "Max value": "amount",
    "Comparison value": "predicted",
  };
  const options = columnsForField(fieldName, dataset);
  const want = preferred[fieldName];
  if (want && options.some((c) => c.name === want)) return want;
  return options[0]?.name ?? "";
}

export function fieldOptionsFor(fieldName: string, dataset: MockDataset = MOCK_DATASET) {
  return columnsForField(fieldName, dataset).map((c) => ({ value: c.name, label: c.label }));
}

export function numericExtent(column: string, dataset: MockDataset = MOCK_DATASET): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const row of dataset.rows) {
    const raw = row[column];
    const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(n)) continue;
    if (n < min) min = n;
    if (n > max) max = n;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min === max) return { min, max: min + 1 };
  const intLike = Math.abs(min - Math.round(min)) < 1e-6 && Math.abs(max - Math.round(max)) < 1e-6;
  return intLike ? { min: Math.round(min), max: Math.round(max) } : { min: Number(min.toFixed(2)), max: Number(max.toFixed(2)) };
}

export function allColumnNames(dataset: MockDataset = MOCK_DATASET): string[] {
  return dataset.columns.map((c) => c.name);
}
