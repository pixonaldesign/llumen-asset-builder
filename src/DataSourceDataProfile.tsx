import { useEffect, useRef, useState } from "react";

type ColumnProfile = {
  name: string;
  type?: "NUMBER" | "STRING";
  min: string;
  max: string;
  median: string;
  values: number[];
};

const GRANULARITY_OPTIONS = ["Seconds", "Minutes", "Hours", "Days", "Weeks", "Years"] as const;
type Granularity = (typeof GRANULARITY_OPTIONS)[number];

const GRANULARITY_TIMELINES: Record<
  Granularity,
  { segments: number[]; start: string; end: string }
> = {
  Seconds: {
    segments: [14, 1, 10, 1, 16, 3, 8, 1, 6, 2, 12, 1, 7, 2, 11, 1, 4],
    start: "2019-01-02 00:00:00",
    end: "2025-11-17 23:59:59",
  },
  Minutes: {
    segments: [24, 1, 19, 5, 11, 2, 2, 1, 27, 1, 7],
    start: "2019-01-02 00:00",
    end: "2025-11-17 23:59",
  },
  Hours: {
    segments: [26, 1, 20, 4, 16, 2, 8, 1, 22],
    start: "2019-01-02 00:00",
    end: "2025-11-17 23:00",
  },
  Days: {
    segments: [30, 1, 23, 3, 18, 1, 24],
    start: "2019-01-02",
    end: "2025-11-17",
  },
  Weeks: {
    segments: [42, 1, 30, 2, 25],
    start: "Jan 2019",
    end: "Nov 2025",
  },
  Years: {
    segments: [100],
    start: "2019",
    end: "2025",
  },
};

const COLUMN_PROFILES: ColumnProfile[] = [
  {
    name: "GRID_ID",
    min: "1",
    max: "1,467",
    median: "734",
    values: [45, 62, 54, 69, 82, 58, 73, 49, 88, 66, 78, 52, 71, 60, 84, 57],
  },
  {
    name: "LONGITUDE",
    min: "54.36",
    max: "54.53",
    median: "54.44",
    values: [92, 84, 78, 72, 68, 64, 61, 58, 55, 53, 51, 49, 47, 45, 43, 40],
  },
  {
    name: "LATITUDE",
    min: "24.27",
    max: "24.49",
    median: "24.38",
    values: [88, 79, 73, 68, 64, 61, 58, 55, 53, 51, 48, 46, 44, 42, 40, 38],
  },
  {
    name: "AREA_SIZE_KM2",
    min: "9.8",
    max: "16.9",
    median: "13.2",
    values: [66, 72, 58, 81, 49, 76, 63, 86, 55, 70, 61, 79, 52, 74, 68, 84],
  },
  {
    name: "POPULATION_COUNT",
    min: "98,000",
    max: "186,000",
    median: "142,000",
    values: [62, 74, 69, 82, 57, 88, 71, 65, 79, 54, 84, 67, 76, 60, 90, 73],
  },
  {
    name: "POPULATION_DENSITY",
    min: "5,799",
    max: "17,959",
    median: "10,901",
    values: [78, 65, 83, 59, 72, 88, 54, 69, 80, 61, 75, 57, 85, 67, 73, 63],
  },
  {
    name: "AQI",
    min: "28",
    max: "187",
    median: "85",
    values: [34, 77, 41, 48, 13],
  },
  {
    name: "NO₂ (µg/m³)",
    min: "19",
    max: "512",
    median: "67",
    values: [82, 16, 18, 13, 6],
  },
  {
    name: "PM₂.₅ (µg/m³)",
    min: "7",
    max: "87",
    median: "20",
    values: [84, 22, 17, 21, 6],
  },
  {
    name: "STATUS",
    type: "STRING",
    min: "—",
    max: "—",
    median: "—",
    values: [88, 38, 16, 8],
  },
];

function MiniHistogram({ values }: { values: number[] }) {
  const barWidth = 240 / values.length;
  return (
    <svg
      className="data-profile-card__chart"
      viewBox="0 0 240 76"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <line x1="0" y1="75" x2="240" y2="75" />
      {values.map((value, index) => (
        <rect
          key={`${index}-${value}`}
          x={index * barWidth + 2}
          y={75 - value * 0.7}
          width={Math.max(3, barWidth - 4)}
          height={value * 0.7}
          rx="1"
        />
      ))}
    </svg>
  );
}

export default function DataSourceDataProfile() {
  const [temporalField, setTemporalField] = useState<"observation" | "calibrated">(
    "observation",
  );
  const [spatialField, setSpatialField] = useState<"coordinates" | "coverage">(
    "coordinates",
  );
  const [granularity, setGranularity] = useState<Granularity>("Years");
  const [granularityOpen, setGranularityOpen] = useState(false);
  const granularityRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!granularityOpen) return;
    const closeMenu = (event: PointerEvent) => {
      if (!granularityRef.current?.contains(event.target as Node)) {
        setGranularityOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setGranularityOpen(false);
    };
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [granularityOpen]);

  const timeline = GRANULARITY_TIMELINES[granularity];

  return (
    <div className="data-source-data-profile" aria-label="Data profile">
      <section className="data-profile-overview" aria-labelledby="data-profile-overview-title">
        <h3 id="data-profile-overview-title">Overview</h3>
        <dl>
          <div>
            <dt>Rows</dt>
            <dd>1.5K</dd>
          </div>
          <div>
            <dt>Columns</dt>
            <dd>{COLUMN_PROFILES.length}</dd>
          </div>
          <div>
            <dt>Numeric</dt>
            <dd>{COLUMN_PROFILES.filter((column) => column.type !== "STRING").length}</dd>
          </div>
        </dl>
      </section>

      <section className="data-profile-columns" aria-labelledby="data-profile-columns-title">
        <h3 id="data-profile-columns-title">Data Columns</h3>
        <div className="data-profile-columns__grid">
          {COLUMN_PROFILES.map((column) => (
            <article className="data-profile-card" key={column.name}>
              <header>
                <h4>{column.name}</h4>
                <span>{column.type ?? "NUMBER"}</span>
              </header>
              <dl className="data-profile-card__metrics">
                <div>
                  <dt>Count</dt>
                  <dd>1.5K</dd>
                </div>
                <div>
                  <dt>Nulls</dt>
                  <dd>0%</dd>
                </div>
                <div>
                  <dt>{column.type === "STRING" ? "Empty" : "Zeroes"}</dt>
                  <dd>0%</dd>
                </div>
                <div>
                  <dt>Min</dt>
                  <dd>{column.min}</dd>
                </div>
                <div>
                  <dt>Max</dt>
                  <dd>{column.max}</dd>
                </div>
                <div>
                  <dt>Median</dt>
                  <dd>{column.median}</dd>
                </div>
              </dl>
              <MiniHistogram values={column.values} />
            </article>
          ))}
        </div>
      </section>

      <section className="data-profile-availability" aria-label="Data availability">
        <div className="data-profile-availability__section">
          <h3>Temporal availability</h3>
          <div className="data-profile-availability__controls">
            <div className="data-profile-field-tabs" role="group" aria-label="Temporal field">
              <button
                type="button"
                className={temporalField === "observation" ? "is-active" : ""}
                onClick={() => setTemporalField("observation")}
              >
                Observation time
              </button>
              <button
                type="button"
                className={temporalField === "calibrated" ? "is-active" : ""}
                onClick={() => setTemporalField("calibrated")}
              >
                Last calibrated
              </button>
            </div>
            <div className="data-profile-granularity" ref={granularityRef}>
              <span>Granularity</span>
              <button
                type="button"
                aria-label={`Granularity: ${granularity}`}
                aria-haspopup="listbox"
                aria-expanded={granularityOpen}
                onClick={() => setGranularityOpen((open) => !open)}
              >
                {granularity}
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="m4 6 4 4 4-4" />
                </svg>
              </button>
              {granularityOpen && (
                <div
                  className="cp-picker-menu data-profile-granularity__menu"
                  role="listbox"
                  aria-label="Granularity"
                >
                  <div className="dropdown-menu__inner">
                    {GRANULARITY_OPTIONS.map((option) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={granularity === option}
                        className={
                          "pg-surface-dropdown__item" +
                          (granularity === option ? " is-selected" : "")
                        }
                        key={option}
                        onClick={() => {
                          setGranularity(option);
                          setGranularityOpen(false);
                        }}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div
            className="data-profile-timeline"
            aria-label={`Available from ${timeline.start} through ${timeline.end}`}
          >
            <span className="data-profile-timeline__bar">
              {timeline.segments.map((width, index) => (
                <span
                  className={
                    "data-profile-timeline__segment" + (index % 2 ? " is-unavailable" : "")
                  }
                  style={{ flexBasis: `${width}%` }}
                  key={`${granularity}-${index}`}
                  aria-hidden="true"
                />
              ))}
            </span>
            <div>
              <span>{timeline.start}</span>
              <span>{timeline.end}</span>
            </div>
          </div>
        </div>

        <div className="data-profile-availability__section">
          <h3>Spatial Availability</h3>
          <div className="data-profile-field-tabs" role="group" aria-label="Spatial field">
            <button
              type="button"
              className={spatialField === "coordinates" ? "is-active" : ""}
              onClick={() => setSpatialField("coordinates")}
            >
              Coordinates
            </button>
            <button
              type="button"
              className={spatialField === "coverage" ? "is-active" : ""}
              onClick={() => setSpatialField("coverage")}
            >
              Corridor coverage
            </button>
          </div>
          <div className="data-profile-spatial-map" aria-label="Spatial data coverage map">
            <img
              src={`${import.meta.env.BASE_URL}${
                spatialField === "coordinates"
                  ? "data-profile-spatial-map.jpg"
                  : "data-profile-corridor-coverage.jpg"
              }`}
              alt=""
              aria-hidden="true"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
