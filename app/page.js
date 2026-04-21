"use client";

import { useEffect, useMemo, useState } from "react";

const LB_TO_KG = 0.45359237;
const TIME_ZONE = "America/New_York";
const OVERALL_SCOPE = "overall";
const AGGREGATE_PLOT_MODE = "aggregate";
const PER_COW_PLOT_MODE = "per-cow";
const AS_FED_MODE = "as-fed";
const DMI_MODE = "dmi";
const UNLIMITED_COLOR = "#17594a";
const STOLEN_COLOR = "#b14f1f";
const COW_COLORS = ["#17594a", "#9f3d1f", "#1f4e79", "#7a4ea3"];

const emptySummary = {
  rowsLoaded: "0",
  cowsTracked: "0",
  unlimitedTotal: "0.00",
  stolenTotal: "0.00",
  dateSpan: "-",
};

export default function Page() {
  const [rows, setRows] = useState([]);
  const [mappingRows, setMappingRows] = useState([]);
  const [unitMode, setUnitMode] = useState("lbs");
  const [intakeBasis, setIntakeBasis] = useState(AS_FED_MODE);
  const [viewMode, setViewMode] = useState("day");
  const [analysisScope, setAnalysisScope] = useState(OVERALL_SCOPE);
  const [plotMode, setPlotMode] = useState(AGGREGATE_PLOT_MODE);
  const [selectedCows, setSelectedCows] = useState([]);
  const [dmByRoughage, setDmByRoughage] = useState({});
  const [ignoreNegative, setIgnoreNegative] = useState(true);
  const [dayInput, setDayInput] = useState("");
  const [rangeStartInput, setRangeStartInput] = useState("");
  const [rangeEndInput, setRangeEndInput] = useState("");
  const [statusText, setStatusText] = useState("Upload one or more intake CSV files to start.");
  const [chartTitle, setChartTitle] = useState("Waiting for data");
  const [chartData, setChartData] = useState(null);
  const [summary, setSummary] = useState(emptySummary);

  const mappingByTransponder = useMemo(() => buildMappingLookup(mappingRows), [mappingRows]);
  const enrichedRows = useMemo(() => enrichRows(rows, mappingByTransponder), [rows, mappingByTransponder]);
  const processedRows = useMemo(
    () => getProcessedRows(enrichedRows, unitMode, ignoreNegative, intakeBasis, dmByRoughage),
    [enrichedRows, unitMode, ignoreNegative, intakeBasis, dmByRoughage]
  );
  const filteredRows = useMemo(
    () => filterRowsByScope(processedRows, analysisScope),
    [processedRows, analysisScope]
  );
  const roughageOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.roughageType).filter(Boolean))).sort();
  }, [rows]);
  const intakeUnitLabel = intakeBasis === DMI_MODE ? "kg DM" : "kg";
  const intakeLabelText = intakeBasis === DMI_MODE ? "Dry Matter Intake" : "Intake";
  const trackedCows = useMemo(() => buildTrackedCowList(enrichedRows), [enrichedRows]);
  const midnightReportRows = useMemo(
    () => buildDailyCowReportRows(processedRows, getMidnightReportDateKey, intakeBasis, intakeUnitLabel),
    [processedRows, intakeBasis, intakeUnitLabel]
  );
  const amFeedingReportRows = useMemo(
    () => buildDailyCowReportRows(processedRows, getAmFeedingReportDateKey, intakeBasis, intakeUnitLabel),
    [processedRows, intakeBasis, intakeUnitLabel]
  );

  useEffect(() => {
    const allowedCows = new Set(trackedCows.map((cow) => cow.eartag));
    setSelectedCows((current) => current.filter((cow) => allowedCows.has(cow)).slice(0, 4));
  }, [trackedCows]);

  useEffect(() => {
    setDmByRoughage((current) => {
      const next = {};
      roughageOptions.forEach((roughage) => {
        next[roughage] = current[roughage] ?? "";
      });
      return next;
    });
  }, [roughageOptions]);

  useEffect(() => {
    if (!rows.length) {
      setSummary(emptySummary);
      setChartTitle("Waiting for data");
      setStatusText("Upload one or more intake CSV files to start.");
      setChartData(null);
      return;
    }

    setSummary(buildSummary(filteredRows));

    if (!filteredRows.length) {
      setChartTitle(getScopeTitle(analysisScope));
      setStatusText(
        analysisScope === OVERALL_SCOPE
          ? "No usable intake rows were found."
          : "No rows were found for the selected roughage type."
      );
      setChartData({
        title: getScopeTitle(analysisScope),
        status: "No plot available for the current filters.",
        emptyMessage:
          analysisScope === OVERALL_SCOPE
            ? "No rows were available after processing."
            : "Try another roughage type or upload more matching rows.",
        points: [],
      });
      return;
    }

    const nextChartData =
      plotMode === PER_COW_PLOT_MODE
          ? buildPerCowChartData(
            filteredRows,
            viewMode,
            dayInput,
            rangeStartInput,
            rangeEndInput,
            analysisScope,
            selectedCows,
            intakeUnitLabel,
            intakeLabelText
          )
        : viewMode === "day"
          ? buildSpecificDaySeries(filteredRows, dayInput, analysisScope, intakeUnitLabel, intakeLabelText)
          : viewMode === "range"
            ? buildRangeSummarySeries(filteredRows, rangeStartInput, rangeEndInput, analysisScope, intakeUnitLabel, intakeLabelText)
            : buildWeeklyAverageSeries(filteredRows, rangeStartInput, rangeEndInput, analysisScope, intakeUnitLabel, intakeLabelText);

    setChartTitle(nextChartData.title);
    setStatusText(nextChartData.status);
    setChartData(nextChartData);
  }, [rows, mappingByTransponder, unitMode, ignoreNegative, intakeBasis, dmByRoughage, analysisScope, plotMode, selectedCows, viewMode, dayInput, rangeStartInput, rangeEndInput]);

  function toggleCowSelection(eartag) {
    setSelectedCows((current) => {
      if (current.includes(eartag)) {
        return current.filter((cow) => cow !== eartag);
      }
      if (current.length >= 4) {
        setStatusText("Select up to 4 cows at a time for the per-cow comparison plot.");
        return current;
      }
      return [...current, eartag];
    });
  }

  async function handleIntakeUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }

    try {
      const parsedGroups = await Promise.all(
        files.map(async (file) => {
          const text = await file.text();
          const parsed = parseCsv(text)
            .map((row) => mapIntakeRow(row, file.name))
            .filter(Boolean);
          return parsed;
        })
      );

      const mergedRows = parsedGroups
        .flat()
        .sort((a, b) => a.timestamp - b.timestamp);

      setRows(mergedRows);
      setDmByRoughage({});
      seedDateInputs(mergedRows, setDayInput, setRangeStartInput, setRangeEndInput);
      setStatusText(`Loaded ${mergedRows.length} rows from ${files.length} intake file(s).`);
    } catch (error) {
      setRows([]);
      setChartData(null);
      setSummary(emptySummary);
      setChartTitle("Waiting for data");
      setStatusText(`Error: ${error.message}`);
    }
  }

  async function handleMappingUpload(event) {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsedMappings = parseCsv(text)
        .map(mapLookupRow)
        .filter(Boolean);

      setMappingRows(parsedMappings);
      setStatusText(`Loaded ${parsedMappings.length} transponder-to-cow mappings from ${file.name}.`);
    } catch (error) {
      setMappingRows([]);
      setStatusText(`Error reading mapping file: ${error.message}`);
    }
  }

  function handleDownloadReport(reportType) {
    const reportRows = reportType === "am-feeding" ? amFeedingReportRows : midnightReportRows;
    const reportName =
      reportType === "am-feeding" ? "Intake from AM Feeding" : "Intake from Midnight";
    const fileName =
      reportType === "am-feeding"
        ? `intake_from_am_feeding_${intakeBasis === DMI_MODE ? "dmi" : "as_fed"}.csv`
        : `intake_from_midnight_${intakeBasis === DMI_MODE ? "dmi" : "as_fed"}.csv`;

    if (!reportRows.length) {
      setStatusText(`Upload intake files first so the app can generate ${reportName}.`);
      return;
    }

    const csv = toCsv(
      reportRows,
      [
        "report_day",
        "eartag",
        "transponder_eid",
        "roughage_types",
        "intake_basis",
        "unlimited_intake",
        "stolen_intake",
        "total_intake",
        "intake_unit",
        "source_files",
      ]
    );

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatusText(`Downloaded ${reportName} (${intakeLabelText}) with ${reportRows.length} cow-day rows.`);
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Vercel Intake Visualizer</p>
          <h1>Upload many cow intake files, compare roughage averages, and map transponders to cow IDs.</h1>
          <p className="hero-copy">
            The app merges multiple CSV uploads in the browser, keeps <strong>Unlimited</strong> and{" "}
            <strong>Stolen</strong> as separate lines, and can switch from overall totals to
            roughage-specific per-cow averages.
          </p>
        </div>
      </section>

      <section className="panel controls">
        <div className="control-grid">
          <label className="field field-wide">
            <span>Upload intake CSV files</span>
            <input type="file" accept=".csv,text/csv" multiple onChange={handleIntakeUpload} />
          </label>

          <label className="field field-wide">
            <span>Upload transponder to eartag lookup</span>
            <input type="file" accept=".csv,text/csv" onChange={handleMappingUpload} />
          </label>

          <label className="field">
            <span>Source unit for intake values</span>
            <select value={unitMode} onChange={(event) => setUnitMode(event.target.value)}>
              <option value="lbs">CSV values are in lbs, convert to kg</option>
              <option value="kg">CSV values are already in kg</option>
            </select>
          </label>

          <label className="field">
            <span>Plot mode</span>
            <select value={viewMode} onChange={(event) => setViewMode(event.target.value)}>
              <option value="day">Specific day</option>
              <option value="range">Day range summary</option>
              <option value="weekly">Weekly average of daily summaries</option>
            </select>
          </label>

          <label className="field">
            <span>Intake display</span>
            <select value={intakeBasis} onChange={(event) => setIntakeBasis(event.target.value)}>
              <option value={AS_FED_MODE}>As-fed intake</option>
              <option value={DMI_MODE}>Dry Matter Intake</option>
            </select>
          </label>

          <label className="field">
            <span>Analysis scope</span>
            <select value={analysisScope} onChange={(event) => setAnalysisScope(event.target.value)}>
              <option value={OVERALL_SCOPE}>All uploaded cows combined</option>
              {roughageOptions.map((roughageType) => (
                <option key={roughageType} value={roughageType}>
                  Average per cow for roughage {roughageType}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Plot style</span>
            <select value={plotMode} onChange={(event) => setPlotMode(event.target.value)}>
              <option value={AGGREGATE_PLOT_MODE}>Combined lines</option>
              <option value={PER_COW_PLOT_MODE}>Per-cow comparison</option>
            </select>
          </label>

          <label className="field">
            <span>Specific day</span>
            <input
              type="date"
              value={dayInput}
              onChange={(event) => setDayInput(event.target.value)}
              disabled={viewMode !== "day"}
            />
          </label>

          <label className="field">
            <span>Range start</span>
            <input
              type="date"
              value={rangeStartInput}
              onChange={(event) => setRangeStartInput(event.target.value)}
              disabled={viewMode === "day"}
            />
          </label>

          <label className="field">
            <span>Range end</span>
            <input
              type="date"
              value={rangeEndInput}
              onChange={(event) => setRangeEndInput(event.target.value)}
              disabled={viewMode === "day"}
            />
          </label>

          <label className="field checkbox-field">
            <input
              type="checkbox"
              checked={ignoreNegative}
              onChange={(event) => setIgnoreNegative(event.target.checked)}
            />
            <span>Ignore negative intake values</span>
          </label>
        </div>

        {intakeBasis === DMI_MODE && roughageOptions.length ? (
          <div className="dm-panel">
            <p className="dm-copy">
              Enter Dry Matter percentage for each roughage type. Example: `45` means 45% DM.
            </p>
            <div className="dm-grid">
              {roughageOptions.map((roughage) => (
                <label key={roughage} className="field dm-field">
                  <span>{roughage} DM %</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={dmByRoughage[roughage] ?? ""}
                    onChange={(event) =>
                      setDmByRoughage((current) => ({
                        ...current,
                        [roughage]: event.target.value,
                      }))
                    }
                    placeholder="e.g. 45"
                  />
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <p className="status">{statusText}</p>
        <p className="substatus">
          Intake files loaded: <strong>{rows.length ? countDistinct(rows, "sourceFile") : 0}</strong>
          {" | "}
          Roughage types: <strong>{roughageOptions.length}</strong>
          {" | "}
          Mapping rows: <strong>{mappingRows.length}</strong>
          {" | "}
          Basis: <strong>{intakeLabelText}</strong>
        </p>
        <div className="action-row">
          <button
            className="action-button"
            type="button"
            onClick={() => handleDownloadReport("midnight")}
          >
            Download Intake from Midnight
          </button>
          <button
            className="action-button action-button-secondary"
            type="button"
            onClick={() => handleDownloadReport("am-feeding")}
          >
            Download Intake from AM Feeding
          </button>
        </div>
      </section>

      <section className="stats-grid stats-grid-wide">
        <article className="panel stat-card">
          <span className="stat-label">Rows loaded</span>
          <strong>{summary.rowsLoaded}</strong>
        </article>
        <article className="panel stat-card">
          <span className="stat-label">Cows tracked</span>
          <strong>{summary.cowsTracked}</strong>
        </article>
        <article className="panel stat-card">
          <span className="stat-label">Unlimited total ({intakeUnitLabel})</span>
          <strong>{summary.unlimitedTotal}</strong>
        </article>
        <article className="panel stat-card">
          <span className="stat-label">Stolen total ({intakeUnitLabel})</span>
          <strong>{summary.stolenTotal}</strong>
        </article>
        <article className="panel stat-card">
          <span className="stat-label">Date span</span>
          <strong>{summary.dateSpan}</strong>
        </article>
      </section>

      <section className="panel chart-panel">
        <div className="chart-header">
          <div>
            <p className="eyebrow">Plot</p>
            <h2>{chartTitle}</h2>
          </div>
          <div className="legend">
            {chartData?.series?.map((series) => (
              <span key={series.key} className="legend-item">
                <i
                  className={`legend-swatch ${series.dashed ? "legend-dashed" : ""}`}
                  style={{ background: series.dashed ? undefined : series.color, color: series.color }}
                />
                {series.label}
              </span>
            ))}
          </div>
        </div>

        {plotMode === PER_COW_PLOT_MODE ? (
          <div className="cow-picker">
            <div className="cow-picker-copy">
              Pick up to 4 cows. Each cow keeps one color, with solid for unlimited and dashed for stolen.
            </div>
            <div className="cow-chip-grid">
              {trackedCows.map((cow) => {
                const isSelected = selectedCows.includes(cow.eartag);
                return (
                  <button
                    key={`pick-${cow.eartag}-${cow.transponder}`}
                    type="button"
                    className={`cow-chip ${isSelected ? "cow-chip-selected" : ""}`}
                    onClick={() => toggleCowSelection(cow.eartag)}
                  >
                    {cow.eartag}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="chart-container">
          {chartData && chartData.points.length ? (
            <Chart chartData={chartData} />
          ) : (
            <div className="empty-state">
              {chartData?.emptyMessage || "The chart will appear here after you upload intake files."}
            </div>
          )}
        </div>
      </section>

      <section className="panel tracked-panel">
        <div className="tracked-header">
          <div>
            <p className="eyebrow">Tracked Cows</p>
            <h3>Each cow tracked by eartag and linked EID</h3>
          </div>
          <p className="tracked-count">{trackedCows.length} cows</p>
        </div>
        {trackedCows.length ? (
          <div className="tracked-grid">
            {trackedCows.map((cow) => (
              <article key={`${cow.eartag}-${cow.transponder}`} className="tracked-card">
                <span className="tracked-label">Eartag</span>
                <strong>{cow.eartag}</strong>
                <span className="tracked-meta">EID / transponder: {cow.transponder}</span>
                <span className="tracked-meta">Rows: {cow.rowCount}</span>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-inline">
            Upload intake files and optionally the EART/EID lookup file to see tracked cows here.
          </div>
        )}
      </section>

      <section className="panel notes">
        <h3>How each plot works</h3>
        <ul>
          <li>
            <strong>All uploaded cows combined:</strong> the chart shows totals across every uploaded
            intake file.
          </li>
          <li>
            <strong>Average per cow for a roughage type:</strong> the app filters to that roughage
            type and plots the average intake per cow for each time bucket, day, or week.
          </li>
          <li>
            <strong>Per-cow comparison:</strong> choose up to 4 cows and the chart will draw one
            unlimited line and one stolen line for each selected cow.
          </li>
          <li>
            <strong>Dry Matter Intake:</strong> switch the intake display to DMI and enter a DM
            percentage for each roughage type to convert from as-fed intake to dry matter basis.
          </li>
          <li>
            <strong>Lookup upload:</strong> a second CSV can link intake <code>Transponder</code>
            values to the lookup-file <code>EID</code>, and the displayed cow identifier is the
            matching <code>EART</code> eartag number.
          </li>
          <li>
            <strong>Intake from Midnight:</strong> exports one row per cow from 12:00 AM through
            11:59 PM for each calendar day.
          </li>
          <li>
            <strong>Intake from AM Feeding:</strong> exports one row per cow from 6:00 AM through
            the next day at 5:59 AM, using each visit start time to assign the feeding day.
          </li>
        </ul>
      </section>
    </main>
  );
}

function Chart({ chartData }) {
  const { points, series, title, unitLabel } = chartData;
  const width = 1000;
  const height = 396;
  const margin = { top: 24, right: 28, bottom: 70, left: 72 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(...points.flatMap((point) => series.map((item) => point.values[item.key] || 0)), 0);
  const yMax = maxValue === 0 ? 1 : maxValue * 1.1;
  const xStep = points.length > 1 ? innerWidth / (points.length - 1) : 0;
  const yTicks = Array.from({ length: 6 }, (_, index) => {
    const value = (yMax / 5) * index;
    const y = margin.top + innerHeight - (value / yMax) * innerHeight;
    return { value, y };
  });

  return (
    <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
      {yTicks.map((tick) => (
        <g key={`tick-${tick.value}`}>
          <line className="grid-line" x1={margin.left} y1={tick.y} x2={width - margin.right} y2={tick.y} />
          <text className="tick-label" x={margin.left - 12} y={tick.y + 4} textAnchor="end">
            {formatNumber(tick.value)}
          </text>
        </g>
      ))}

      <line className="axis-line" x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + innerHeight} />
      <line
        className="axis-line"
        x1={margin.left}
        y1={margin.top + innerHeight}
        x2={width - margin.right}
        y2={margin.top + innerHeight}
      />

      {series.map((item) => (
        <path
          key={`path-${item.key}`}
          className="series-line"
          stroke={item.color}
          strokeDasharray={item.dashed ? "8 5" : undefined}
          d={buildPath(points, item.key, margin, innerWidth, innerHeight, yMax)}
        />
      ))}

      {series.map((item) =>
        points.map((point, index) => {
          const x = margin.left + (points.length > 1 ? xStep * index : innerWidth / 2);
          const y = margin.top + innerHeight - ((point.values[item.key] || 0) / yMax) * innerHeight;
          return (
            <circle
              key={`${item.key}-${point.label}-${index}`}
              className="point"
              cx={x}
              cy={y}
              r="4.5"
              fill={item.color}
            />
          );
        })
      )}

      {points.map((point, index) => {
        const x = margin.left + (points.length > 1 ? xStep * index : innerWidth / 2);
        const anchor = index === 0 ? "start" : index === points.length - 1 ? "end" : "middle";
        const rotation = points.length > 7 ? -35 : 0;

        return (
          <text
            key={`label-${point.label}-${index}`}
            className="tick-label"
            x={x}
            y={height - 16}
            textAnchor={anchor}
            transform={`rotate(${rotation} ${x} ${height - 16})`}
          >
            {point.label}
          </text>
        );
      })}

      <text className="axis-label" x={margin.left - 52} y={margin.top - 8}>
        {unitLabel || "kg"}
      </text>
    </svg>
  );
}

function parseCsv(text) {
  const sanitized = text.replace(/^\uFEFF/, "").replace(/^sep=.*,?\r?\n/i, "");
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < sanitized.length; index += 1) {
    const char = sanitized[index];
    const nextChar = sanitized[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(current);
      if (row.some((value) => value !== "")) {
        rows.push(row);
      }
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) => {
    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = (cells[index] || "").trim();
    });
    return entry;
  });
}

function mapIntakeRow(row, sourceFile) {
  const startTime = row["Start time"];
  const intakeRaw = Number.parseFloat(row["Intake (kg)"]);
  if (!startTime || Number.isNaN(intakeRaw)) {
    return null;
  }

  const timestamp = parseDateTime(startTime);
  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  const transponder = String(row.Transponder || "").trim();

  return {
    timestamp,
    dateKey: toDateKey(timestamp),
    timeLabel: formatTime(timestamp),
    timeBucketKey: formatTimeBucket(timestamp),
    unlimited: normalizeBoolean(row.Unlimited),
    stolen: normalizeBoolean(row.Stolen),
    intakeRaw,
    roughageType: String(row["Roughage type"] || "").trim(),
    transponder,
    eartag: transponder || "Unknown",
    sourceFile,
  };
}

function mapLookupRow(row) {
  const transponder = String(
    row.Transponder ||
      row.transponder ||
      row.EID ||
      row.eid ||
      row.TransponderID ||
      row["Transponder ID"] ||
      row.Tag ||
      row.tag ||
      ""
  ).trim();

  const cowId = String(
    row["Cow ID"] ||
      row.CowID ||
      row["Cow Id"] ||
      row.cow_id ||
      row.EART ||
      row.eart ||
      row.Cow ||
      row.cow ||
      row.ID ||
      row.id ||
      ""
  ).trim();

  if (!transponder || !cowId) {
    return null;
  }

  return { transponder, cowId };
}

function buildMappingLookup(mappingRows) {
  return mappingRows.reduce((lookup, row) => {
    lookup.set(row.transponder, row.cowId);
    return lookup;
  }, new Map());
}

function enrichRows(rows, mappingLookup) {
  return rows.map((row) => ({
    ...row,
    eartag: mappingLookup.get(row.transponder) || row.transponder || "Unknown",
  }));
}

function getProcessedRows(rows, unitMode, ignoreNegative, intakeBasis, dmByRoughage) {
  const convertFromLbs = unitMode === "lbs";
  return rows
    .map((row) => {
      let intakeKg = convertFromLbs ? row.intakeRaw * LB_TO_KG : row.intakeRaw;
      if (ignoreNegative && intakeKg < 0) {
        intakeKg = 0;
      }
      const dmPercent = Number.parseFloat(dmByRoughage[row.roughageType]);
      const dmFactor = intakeBasis === DMI_MODE && Number.isFinite(dmPercent) ? dmPercent / 100 : 1;
      return {
        ...row,
        intakeKg: intakeKg * dmFactor,
      };
    })
    .filter((row) => row.unlimited || row.stolen);
}

function filterRowsByScope(rows, scope) {
  if (scope === OVERALL_SCOPE) {
    return rows;
  }
  return rows.filter((row) => row.roughageType === scope);
}

function buildSummary(rows) {
  if (!rows.length) {
    return emptySummary;
  }

  const unlimitedTotal = rows.filter((row) => row.unlimited).reduce((sum, row) => sum + row.intakeKg, 0);
  const stolenTotal = rows.filter((row) => row.stolen).reduce((sum, row) => sum + row.intakeKg, 0);
  const cowCount = new Set(rows.map((row) => row.eartag)).size;

  return {
    rowsLoaded: rows.length.toLocaleString(),
    cowsTracked: cowCount.toLocaleString(),
    unlimitedTotal: formatNumber(unlimitedTotal),
    stolenTotal: formatNumber(stolenTotal),
    dateSpan: `${rows[0].dateKey} to ${rows[rows.length - 1].dateKey}`,
  };
}

function buildSpecificDaySeries(rows, dayKey, scope, unitLabel, intakeLabelText) {
  const selectedDay = dayKey || rows[rows.length - 1]?.dateKey;
  const dayRows = rows.filter((row) => row.dateKey === selectedDay);

  if (scope === OVERALL_SCOPE) {
    let unlimitedRunning = 0;
    let stolenRunning = 0;
    const points = [];

    dayRows.forEach((row) => {
      if (row.unlimited) {
        unlimitedRunning += row.intakeKg;
      }
      if (row.stolen) {
        stolenRunning += row.intakeKg;
      }
      points.push({
        label: row.timeLabel,
        values: {
          unlimited: unlimitedRunning,
          stolen: stolenRunning,
        },
      });
    });

    return {
      title: `Specific day totals: ${selectedDay || "No day selected"}`,
      status: `Showing cumulative ${intakeLabelText.toLowerCase()} across all uploaded cows on ${selectedDay || "the selected day"}.`,
      emptyMessage: "No rows were found for the selected day.",
      series: buildAggregateSeries(),
      unitLabel,
      points,
    };
  }

  const cowCount = new Set(dayRows.map((row) => row.eartag)).size || 1;
  const buckets = Array.from(groupRowsBy(dayRows, (row) => row.timeBucketKey).entries())
    .sort((a, b) => a[0].localeCompare(b[0]));
  let unlimitedRunning = 0;
  let stolenRunning = 0;

  const points = buckets.map(([label, bucketRows]) => {
    const unlimitedBucket = bucketRows.filter((row) => row.unlimited).reduce((sum, row) => sum + row.intakeKg, 0);
    const stolenBucket = bucketRows.filter((row) => row.stolen).reduce((sum, row) => sum + row.intakeKg, 0);
    unlimitedRunning += unlimitedBucket / cowCount;
    stolenRunning += stolenBucket / cowCount;
    return {
      label,
      values: {
        unlimited: unlimitedRunning,
        stolen: stolenRunning,
      },
    };
  });

  return {
    title: `Specific day average per cow: ${scope} on ${selectedDay || "No day selected"}`,
    status: `Showing cumulative average ${intakeLabelText.toLowerCase()} per cow for roughage ${scope} on ${selectedDay || "the selected day"}.`,
    emptyMessage: "No rows were found for the selected roughage type on that day.",
    series: buildAggregateSeries(),
    unitLabel,
    points,
  };
}

function buildRangeSummarySeries(rows, startDate, endDate, scope, unitLabel, intakeLabelText) {
  const filteredRows = filterByDateRange(rows, startDate, endDate);
  const daily = summarizeByDay(filteredRows, scope !== OVERALL_SCOPE);
  const points = Array.from(daily.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, values]) => ({
      label,
      values: {
        unlimited: values.unlimited,
        stolen: values.stolen,
      },
    }));

  return {
    title:
      scope === OVERALL_SCOPE
        ? `Day range totals: ${startDate || "start"} to ${endDate || "end"}`
        : `Day range average per cow: ${scope}`,
    status:
      scope === OVERALL_SCOPE
        ? `Showing one summarized total ${intakeLabelText.toLowerCase()} point per day in the selected range.`
        : `Showing one summarized average-per-cow ${intakeLabelText.toLowerCase()} point per day for roughage ${scope}.`,
    emptyMessage: "No rows were found for the selected date range.",
    series: buildAggregateSeries(),
    unitLabel,
    points,
  };
}

function buildWeeklyAverageSeries(rows, startDate, endDate, scope, unitLabel, intakeLabelText) {
  const filteredRows = filterByDateRange(rows, startDate, endDate);
  const daily = summarizeByDay(filteredRows, scope !== OVERALL_SCOPE);
  const weekly = new Map();

  daily.forEach((values, dateKey) => {
    const weekKey = getWeekStart(dateKey);
    const bucket = weekly.get(weekKey) || {
      unlimitedTotal: 0,
      stolenTotal: 0,
      dayCount: 0,
    };
    bucket.unlimitedTotal += values.unlimited;
    bucket.stolenTotal += values.stolen;
    bucket.dayCount += 1;
    weekly.set(weekKey, bucket);
  });

  const points = Array.from(weekly.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, values]) => ({
      label,
      values: {
        unlimited: values.dayCount ? values.unlimitedTotal / values.dayCount : 0,
        stolen: values.dayCount ? values.stolenTotal / values.dayCount : 0,
      },
    }));

  return {
    title:
      scope === OVERALL_SCOPE
        ? `Weekly average totals: ${startDate || "start"} to ${endDate || "end"}`
        : `Weekly average per cow: ${scope}`,
    status:
      scope === OVERALL_SCOPE
        ? `Showing the average daily total ${intakeLabelText.toLowerCase()} inside each calendar week.`
        : `Showing the average daily ${intakeLabelText.toLowerCase()} per cow inside each calendar week for roughage ${scope}.`,
    emptyMessage: "No weekly averages could be calculated for the selected range.",
    series: buildAggregateSeries(),
    unitLabel,
    points,
  };
}

function buildPerCowChartData(rows, viewMode, dayKey, startDate, endDate, scope, selectedCows, unitLabel, intakeLabelText) {
  if (!selectedCows.length) {
    return {
      title: "Per-cow comparison",
      status: "Pick up to 4 cows to compare them on the same plot.",
      emptyMessage: "Select at least one cow in the per-cow comparison picker.",
      series: [],
      unitLabel,
      points: [],
    };
  }

  const cowRows = rows.filter((row) => selectedCows.includes(row.eartag));
  const points =
    viewMode === "day"
      ? buildPerCowDayPoints(cowRows, dayKey, selectedCows)
      : viewMode === "range"
        ? buildPerCowRangePoints(cowRows, startDate, endDate, selectedCows)
        : buildPerCowWeeklyPoints(cowRows, startDate, endDate, selectedCows);

  return {
    title:
      viewMode === "day"
        ? `Per-cow comparison: ${selectedCows.join(", ")}`
        : viewMode === "range"
          ? `Per-cow day summary: ${selectedCows.join(", ")}`
          : `Per-cow weekly summary: ${selectedCows.join(", ")}`,
    status:
      scope === OVERALL_SCOPE
        ? `Showing one unlimited and one stolen line for each selected cow using ${intakeLabelText.toLowerCase()}.`
        : `Showing one unlimited and one stolen line for each selected cow within roughage ${scope}, using ${intakeLabelText.toLowerCase()}.`,
    emptyMessage: "No rows were found for the selected cows and current filters.",
    series: buildPerCowSeries(selectedCows),
    unitLabel,
    points,
  };
}

function buildPerCowDayPoints(rows, dayKey, selectedCows) {
  const selectedDay = dayKey || rows[rows.length - 1]?.dateKey;
  const dayRows = rows.filter((row) => row.dateKey === selectedDay);
  const cowsByTime = Array.from(groupRowsBy(dayRows, (row) => row.timeBucketKey).entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const running = Object.fromEntries(
    selectedCows.flatMap((cow) => [
      [getCowSeriesKey(cow, "unlimited"), 0],
      [getCowSeriesKey(cow, "stolen"), 0],
    ])
  );

  return cowsByTime.map(([label, bucketRows]) => {
    selectedCows.forEach((cow) => {
      const cowBucketRows = bucketRows.filter((row) => row.eartag === cow);
      running[getCowSeriesKey(cow, "unlimited")] += cowBucketRows
        .filter((row) => row.unlimited)
        .reduce((sum, row) => sum + row.intakeKg, 0);
      running[getCowSeriesKey(cow, "stolen")] += cowBucketRows
        .filter((row) => row.stolen)
        .reduce((sum, row) => sum + row.intakeKg, 0);
    });

    return {
      label,
      values: { ...running },
    };
  });
}

function buildPerCowRangePoints(rows, startDate, endDate, selectedCows) {
  const filtered = filterByDateRange(rows, startDate, endDate);
  const grouped = Array.from(groupRowsBy(filtered, (row) => row.dateKey).entries()).sort((a, b) => a[0].localeCompare(b[0]));
  return grouped.map(([label, bucketRows]) => ({
    label,
    values: buildCowBucketValues(bucketRows, selectedCows),
  }));
}

function buildPerCowWeeklyPoints(rows, startDate, endDate, selectedCows) {
  const filtered = filterByDateRange(rows, startDate, endDate);
  const daily = groupRowsBy(filtered, (row) => row.dateKey);
  const weekly = new Map();

  Array.from(daily.entries()).forEach(([dateKey, dayRows]) => {
    const weekKey = getWeekStart(dateKey);
    const bucket = weekly.get(weekKey) || [];
    bucket.push(buildCowBucketValues(dayRows, selectedCows));
    weekly.set(weekKey, bucket);
  });

  return Array.from(weekly.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, valueRows]) => ({
      label,
      values: averageCowValueRows(valueRows, selectedCows),
    }));
}

function buildCowBucketValues(rows, selectedCows) {
  const values = {};
  selectedCows.forEach((cow) => {
    const cowRows = rows.filter((row) => row.eartag === cow);
    values[getCowSeriesKey(cow, "unlimited")] = cowRows
      .filter((row) => row.unlimited)
      .reduce((sum, row) => sum + row.intakeKg, 0);
    values[getCowSeriesKey(cow, "stolen")] = cowRows
      .filter((row) => row.stolen)
      .reduce((sum, row) => sum + row.intakeKg, 0);
  });
  return values;
}

function averageCowValueRows(valueRows, selectedCows) {
  const values = {};
  selectedCows.forEach((cow) => {
    const unlimitedKey = getCowSeriesKey(cow, "unlimited");
    const stolenKey = getCowSeriesKey(cow, "stolen");
    values[unlimitedKey] = valueRows.reduce((sum, row) => sum + (row[unlimitedKey] || 0), 0) / (valueRows.length || 1);
    values[stolenKey] = valueRows.reduce((sum, row) => sum + (row[stolenKey] || 0), 0) / (valueRows.length || 1);
  });
  return values;
}

function buildAggregateSeries() {
  return [
    { key: "unlimited", label: "Unlimited", color: UNLIMITED_COLOR, dashed: false },
    { key: "stolen", label: "Stolen", color: STOLEN_COLOR, dashed: false },
  ];
}

function buildPerCowSeries(selectedCows) {
  return selectedCows.flatMap((cow, index) => {
    const color = COW_COLORS[index % COW_COLORS.length];
    return [
      {
        key: getCowSeriesKey(cow, "unlimited"),
        label: `${cow} unlimited`,
        color,
        dashed: false,
      },
      {
        key: getCowSeriesKey(cow, "stolen"),
        label: `${cow} stolen`,
        color,
        dashed: true,
      },
    ];
  });
}

function getCowSeriesKey(cow, type) {
  return `${cow}__${type}`;
}

function summarizeByDay(rows, averagePerCow) {
  const summary = new Map();

  rows.forEach((row) => {
    const bucket = summary.get(row.dateKey) || {
      unlimited: 0,
      stolen: 0,
      cows: new Set(),
    };

    if (row.unlimited) {
      bucket.unlimited += row.intakeKg;
    }
    if (row.stolen) {
      bucket.stolen += row.intakeKg;
    }
    bucket.cows.add(row.eartag);
    summary.set(row.dateKey, bucket);
  });

  if (!averagePerCow) {
    return new Map(
      Array.from(summary.entries()).map(([key, value]) => [
        key,
        { unlimited: value.unlimited, stolen: value.stolen },
      ])
    );
  }

  return new Map(
    Array.from(summary.entries()).map(([key, value]) => {
      const cowCount = value.cows.size || 1;
      return [
        key,
        {
          unlimited: value.unlimited / cowCount,
          stolen: value.stolen / cowCount,
        },
      ];
    })
  );
}

function buildTrackedCowList(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    const key = `${row.eartag}__${row.transponder}`;
    const bucket = grouped.get(key) || {
      eartag: row.eartag || "Unknown",
      transponder: row.transponder || "Unknown",
      rowCount: 0,
    };
    bucket.rowCount += 1;
    grouped.set(key, bucket);
  });

  return Array.from(grouped.values()).sort((a, b) => String(a.eartag).localeCompare(String(b.eartag)));
}

function buildDailyCowReportRows(rows, getReportDateKey, intakeBasis, intakeUnitLabel) {
  const grouped = new Map();

  rows.forEach((row) => {
    const reportDay = getReportDateKey(row.timestamp);
    const key = `${reportDay}__${row.eartag}`;
    const bucket = grouped.get(key) || {
      report_day: reportDay,
      eartag: row.eartag || "Unknown",
      transponderSet: new Set(),
      roughageSet: new Set(),
      sourceFileSet: new Set(),
      unlimited: 0,
      stolen: 0,
    };

    bucket.transponderSet.add(row.transponder || "Unknown");
    bucket.sourceFileSet.add(row.sourceFile || "");
    if (row.roughageType) {
      bucket.roughageSet.add(row.roughageType);
    }
    if (row.unlimited) {
      bucket.unlimited += row.intakeKg;
    }
    if (row.stolen) {
      bucket.stolen += row.intakeKg;
    }

    grouped.set(key, bucket);
  });

  return Array.from(grouped.values())
    .sort((a, b) => {
      const dateCompare = a.report_day.localeCompare(b.report_day);
      return dateCompare || String(a.eartag).localeCompare(String(b.eartag));
    })
    .map((row) => ({
      report_day: row.report_day,
      eartag: row.eartag,
      transponder_eid: Array.from(row.transponderSet).sort().join(" | "),
      roughage_types: Array.from(row.roughageSet).sort().join(" | "),
      intake_basis: intakeBasis === DMI_MODE ? "Dry Matter Intake" : "As-fed intake",
      unlimited_intake: formatNumber(row.unlimited),
      stolen_intake: formatNumber(row.stolen),
      total_intake: formatNumber(row.unlimited + row.stolen),
      intake_unit: intakeUnitLabel,
      source_files: Array.from(row.sourceFileSet).sort().join(" | "),
    }));
}

function getMidnightReportDateKey(timestamp) {
  return toDateKey(timestamp);
}

function getAmFeedingReportDateKey(timestamp) {
  const reportDate = new Date(timestamp);
  if (reportDate.getHours() < 6) {
    reportDate.setDate(reportDate.getDate() - 1);
  }
  return toDateKey(reportDate);
}

function groupRowsBy(rows, getKey) {
  return rows.reduce((groups, row) => {
    const key = getKey(row);
    const bucket = groups.get(key) || [];
    bucket.push(row);
    groups.set(key, bucket);
    return groups;
  }, new Map());
}

function filterByDateRange(rows, startDate, endDate) {
  return rows.filter((row) => {
    if (startDate && row.dateKey < startDate) {
      return false;
    }
    if (endDate && row.dateKey > endDate) {
      return false;
    }
    return true;
  });
}

function seedDateInputs(rows, setDayInput, setRangeStartInput, setRangeEndInput) {
  if (!rows.length) {
    return;
  }

  const firstDate = rows[0].dateKey;
  const lastDate = rows[rows.length - 1].dateKey;
  setDayInput(lastDate);
  setRangeStartInput(firstDate);
  setRangeEndInput(lastDate);
}

function buildPath(points, key, margin, innerWidth, innerHeight, yMax) {
  if (!points.length) {
    return "";
  }

  return points
    .map((point, index) => {
      const x = margin.left + (points.length > 1 ? (innerWidth / (points.length - 1)) * index : innerWidth / 2);
      const y = margin.top + innerHeight - (((point.values && point.values[key]) || 0) / yMax) * innerHeight;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function parseDateTime(value) {
  const [datePart, timePart, meridiem] = value.split(" ");
  const [month, day, year] = datePart.split("/").map(Number);
  const [hoursText, minutes, seconds] = timePart.split(":").map(Number);
  let hours = hoursText;

  if (meridiem === "PM" && hours !== 12) {
    hours += 12;
  }
  if (meridiem === "AM" && hours === 12) {
    hours = 0;
  }

  return new Date(year, month - 1, day, hours, minutes, seconds);
}

function normalizeBoolean(value) {
  return String(value).toLowerCase() === "true";
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(date);
}

function formatTimeBucket(date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: TIME_ZONE,
  }).format(date);
}

function formatNumber(value) {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  });
}

function toCsv(rows, headers) {
  const lines = [headers.join(",")];
  rows.forEach((row) => {
    lines.push(
      headers
        .map((header) => escapeCsvValue(row[header] ?? ""))
        .join(",")
    );
  });
  return lines.join("\r\n");
}

function escapeCsvValue(value) {
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function countDistinct(rows, key) {
  return new Set(rows.map((row) => row[key])).size;
}

function getScopeTitle(scope) {
  return scope === OVERALL_SCOPE ? "All uploaded cows combined" : `Average per cow for roughage ${scope}`;
}
