const QUERY_COLUMNS = [
  "grid_id",
  "longitude",
  "latitude",
  "area_size_km2",
  "population_count",
  "population_density",
];

const QUERY_ROWS = [
  ["1", "54.363716", "24.488927", "11.1", "120,000", "10,810"],
  ["2", "54.369329", "24.481558", "13.4", "145,000", "10,821"],
  ["3", "54.375942", "24.474189", "9.8", "98,000", "10,000"],
];

export default function DataSourceQueryPreview() {
  return (
    <div className="data-source-query-preview" aria-label="Query results">
      <table>
        <thead>
          <tr>
            {QUERY_COLUMNS.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {QUERY_ROWS.map((row) => (
            <tr key={row[0]}>
              {row.map((value, index) => (
                <td key={QUERY_COLUMNS[index]}>{value}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
