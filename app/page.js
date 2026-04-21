"use client";

import { useEffect, useMemo, useState } from "react";

const LB_TO_KG = 0.45359237;
const TIME_ZONE = "America/New_York";
const OVERALL_SCOPE = "overall";

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
  const [viewMode, setViewMode] = useState("day");
  const [analysisScope, setAnalysisScope] = useState(OVERALL_SCOPE);
  const [ignoreNegative, setIgnoreNegative] = useState(true);
  const [dayInput, setDayInput] = useState("");
  const [rangeStartInput, setRangeStartInput] = useState("");
  const [rangeEndInput, setRangeEndInput] = useState("");
  const [statusText, setStatusText] = useState("Upload one or more intake CSV files to start.");
  const [chartTitle, setChartTitle] = useState("Waiting for data");
  const [chartData, setChartData] = useState(null);
  const [summary, setSummary] = useState(emptySummary);

  const mappingByTransponder = useMemo(() => buildMappingLookup(mappingRows), [mappingRows]);
  const roughageOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.roughageType).filter(Boolean))).sort();
  }, [rows]);

  useEffect(() => {
    if (!rows.length) {
      setSummary(emptySummary);
      setChartTitle("Waiting for data");
      setStatusText("Upload one or more intake CSV files to start.");
      setChartData(null);
      return;
    }

    const enrichedRows = enrichRows(rows, mappingByTransponder);
    const processedRows = getProcessedRows(enrichedRows, unitMode, ignoreNegative);
    const filteredRows = filterRowsByScope(processedRows, analysisScope);
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
      viewMode === "day"
        ? buildSpecificDaySeries(filteredRows, dayInput, analysisScope)
        : viewMode === "range"
          ? buildRangeSummarySeries(filteredRows, rangeStartInput, rangeEndInput, analysisScope)
          : buildWeeklyAverageSeries(filteredRows, rangeStartInput, rangeEndInput, analysisScope);

    setChartTitle(nextChartData.title);
    setStatusText(nextChartData.status);
    setChartData(nextChartData);
  }, [rows, mappingByTransponder, unitMode, ignoreNegative, analysisScope, viewMode, dayInput, rangeStartInput, rangeEndInput]);

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
            <span>Upload transponder to cow ID lookup</span>
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

        <p className="status">{statusText}</p>
        <p className="substatus">
          Intake files loaded: <strong>{rows.length ? countDistinct(rows, "sourceFile") : 0}</strong>
          {" | "}
          Roughage types: <strong>{roughageOptions.length}</strong>
          {" | "}
          Mapping rows: <strong>{mappingRows.length}</strong>
        </p>
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
          <span className="stat-label">Unlimited total (kg)</span>
          <strong>{summary.unlimitedTotal}</strong>
        </article>
        <article className="panel stat-card">
          <span className="stat-label">Stolen total (kg)</span>
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
            <span className="legend-item">
              <i className="legend-swatch unlimited" />
              Unlimited
            </span>
            <span className="legend-item">
              <i className="legend-swatch stolen" />
              Stolen
            </span>
          </div>
        </div>

        <div className="chart-container">
          {chartData && chartData.points.length ? (
            <Chart points={chartData.points} title={chartData.title} />
          ) : (
            <div className="empty-state">
              {chartData?.emptyMessage || "The chart will appear here after you upload intake files."}
            </div>
          )}
        </div>
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
            <strong>Lookup upload:</strong> a second CSV can link <code>Transponder</code> values to
            your own cow IDs so multi-file uploads are grouped per cow instead of raw transponder only.
          </li>
        </ul>
      </section>
    </main>
  );
}

function Chart({ points, title }) {
  const width = 1000;
  const height = 396;
  const margin = { top: 24, right: 28, bottom: 70, left: 72 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(...points.flatMap((point) => [point.unlimited, point.stolen]), 0);
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

      <path className="series-line series-unlimited" d={buildPath(points, "unlimited", margin, innerWidth, innerHeight, yMax)} />
      <path className="series-line series-stolen" d={buildPath(points, "stolen", margin, innerWidth, innerHeight, yMax)} />

      {points.map((point, index) => {
        const x = margin.left + (points.length > 1 ? xStep * index : innerWidth / 2);
        const unlimitedY = margin.top + innerHeight - (point.unlimited / yMax) * innerHeight;
        const stolenY = margin.top + innerHeight - (point.stolen / yMax) * innerHeight;
        const anchor = index === 0 ? "start" : index === points.length - 1 ? "end" : "middle";
        const rotation = points.length > 7 ? -35 : 0;

        return (
          <g key={`${point.label}-${index}`}>
            <circle className="point point-unlimited" cx={x} cy={unlimitedY} r="4.5" />
            <circle className="point point-stolen" cx={x} cy={stolenY} r="4.5" />
            <text
              className="tick-label"
              x={x}
              y={height - 16}
              textAnchor={anchor}
              transform={`rotate(${rotation} ${x} ${height - 16})`}
            >
              {point.label}
            </text>
          </g>
        );
      })}

      <text className="axis-label" x={margin.left - 52} y={margin.top - 8}>
        kg
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
    cowId: transponder || "Unknown",
    sourceFile,
  };
}

function mapLookupRow(row) {
  const transponder = String(
    row.Transponder ||
      row.transponder ||
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
    cowId: mappingLookup.get(row.transponder) || row.transponder || "Unknown",
  }));
}

function getProcessedRows(rows, unitMode, ignoreNegative) {
  const convertFromLbs = unitMode === "lbs";
  return rows
    .map((row) => {
      let intakeKg = convertFromLbs ? row.intakeRaw * LB_TO_KG : row.intakeRaw;
      if (ignoreNegative && intakeKg < 0) {
        intakeKg = 0;
      }
      return {
        ...row,
        intakeKg,
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
  const cowCount = new Set(rows.map((row) => row.cowId)).size;

  return {
    rowsLoaded: rows.length.toLocaleString(),
    cowsTracked: cowCount.toLocaleString(),
    unlimitedTotal: formatNumber(unlimitedTotal),
    stolenTotal: formatNumber(stolenTotal),
    dateSpan: `${rows[0].dateKey} to ${rows[rows.length - 1].dateKey}`,
  };
}

function buildSpecificDaySeries(rows, dayKey, scope) {
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
        unlimited: unlimitedRunning,
        stolen: stolenRunning,
      });
    });

    return {
      title: `Specific day totals: ${selectedDay || "No day selected"}`,
      status: `Showing cumulative intake across all uploaded cows on ${selectedDay || "the selected day"}.`,
      emptyMessage: "No rows were found for the selected day.",
      points,
    };
  }

  const cowCount = new Set(dayRows.map((row) => row.cowId)).size || 1;
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
      unlimited: unlimitedRunning,
      stolen: stolenRunning,
    };
  });

  return {
    title: `Specific day average per cow: ${scope} on ${selectedDay || "No day selected"}`,
    status: `Showing cumulative average intake per cow for roughage ${scope} on ${selectedDay || "the selected day"}.`,
    emptyMessage: "No rows were found for the selected roughage type on that day.",
    points,
  };
}

function buildRangeSummarySeries(rows, startDate, endDate, scope) {
  const filteredRows = filterByDateRange(rows, startDate, endDate);
  const daily = summarizeByDay(filteredRows, scope !== OVERALL_SCOPE);
  const points = Array.from(daily.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, values]) => ({
      label,
      unlimited: values.unlimited,
      stolen: values.stolen,
    }));

  return {
    title:
      scope === OVERALL_SCOPE
        ? `Day range totals: ${startDate || "start"} to ${endDate || "end"}`
        : `Day range average per cow: ${scope}`,
    status:
      scope === OVERALL_SCOPE
        ? "Showing one summarized total point per day in the selected range."
        : `Showing one summarized average-per-cow point per day for roughage ${scope}.`,
    emptyMessage: "No rows were found for the selected date range.",
    points,
  };
}

function buildWeeklyAverageSeries(rows, startDate, endDate, scope) {
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
      unlimited: values.dayCount ? values.unlimitedTotal / values.dayCount : 0,
      stolen: values.dayCount ? values.stolenTotal / values.dayCount : 0,
    }));

  return {
    title:
      scope === OVERALL_SCOPE
        ? `Weekly average totals: ${startDate || "start"} to ${endDate || "end"}`
        : `Weekly average per cow: ${scope}`,
    status:
      scope === OVERALL_SCOPE
        ? "Showing the average daily total intake inside each calendar week."
        : `Showing the average daily intake per cow inside each calendar week for roughage ${scope}.`,
    emptyMessage: "No weekly averages could be calculated for the selected range.",
    points,
  };
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
    bucket.cows.add(row.cowId);
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
      const y = margin.top + innerHeight - (point[key] / yMax) * innerHeight;
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
  });
}

function countDistinct(rows, key) {
  return new Set(rows.map((row) => row[key])).size;
}

function getScopeTitle(scope) {
  return scope === OVERALL_SCOPE ? "All uploaded cows combined" : `Average per cow for roughage ${scope}`;
}
