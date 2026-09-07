const QUERY_COLUMNS = [
  "grid_id",
  "longitude",
  "latitude",
  "area_size_km2",
  "population_count",
  "population_density",
];

const QUERY_COLUMN_WIDTHS = ["10%", "14%", "14%", "17%", "20%", "25%"];

const QUERY_ROWS = Array.from({ length: 30 }, (_, index) => {
  const population = 98_000 + ((index * 23_000) % 89_000);
  const areaSize = 9.8 + ((index * 1.3) % 7.2);

  return [
    String(index + 1),
    (54.363716 + index * 0.005613).toFixed(6),
    (24.488927 - index * 0.007369).toFixed(6),
    areaSize.toFixed(1),
    population.toLocaleString("en-US"),
    Math.round(population / areaSize).toLocaleString("en-US"),
  ];
});

export default function DataSourceQueryPreview() {
  return (
    <div className="data-source-query-preview" aria-label="Query results">
      <table className="data-source-query-preview__header">
        <colgroup>
          {QUERY_COLUMN_WIDTHS.map((width, index) => (
            <col key={QUERY_COLUMNS[index]} style={{ width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {QUERY_COLUMNS.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
      </table>
      <div className="data-source-query-preview__scroll">
        <table aria-label="Query result rows">
          <colgroup>
            {QUERY_COLUMN_WIDTHS.map((width, index) => (
              <col key={QUERY_COLUMNS[index]} style={{ width }} />
            ))}
          </colgroup>
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
    </div>
  );
}
