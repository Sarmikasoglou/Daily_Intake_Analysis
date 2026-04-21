"use client";

import { useEffect, useState } from "react";

const LB_TO_KG = 0.45359237;
const TIME_ZONE = "America/New_York";

const emptySummary = {
  rowsLoaded: "0",
  unlimitedTotal: "0.00",
  stolenTotal: "0.00",
  dateSpan: "-",
};

export default function Page() {
  const [rows, setRows] = useState([]);
  const [unitMode, setUnitMode] = useState("lbs");
  const [viewMode, setViewMode] = useState("day");
  const [ignoreNegative, setIgnoreNegative] = useState(true);
  const [dayInput, setDayInput] = useState("");
  const [rangeStartInput, setRangeStartInput] = useState("");
  const [rangeEndInput, setRangeEndInput] = useState("");
  const [statusText, setStatusText] = useState("Upload a CSV file to start.");
  const [chartTitle, setChartTitle] = useState("Waiting for data");
  const [chartData, setChartData] = useState(null);
  const [summary, setSummary] = useState(emptySummary);

  useEffect(() => {
    const processedRows = getProcessedRows(rows, unitMode, ignoreNegative);
    setSummary(buildSummary(processedRows));

    if (!processedRows.length) {
      setChartTitle("Waiting for data");
      setStatusText("Upload a CSV file to start.");
      setChartData(null);
      return;
    }

    const nextChartData =
      viewMode === "day"
        ? buildSpecificDaySeries(processedRows, dayInput)
        : viewMode === "range"
          ? buildRangeSummarySeries(processedRows, rangeStartInput, rangeEndInput)
          : buildWeeklyAverageSeries(processedRows, rangeStartInput, rangeEndInput);

    setChartTitle(nextChartData.title);
    setStatusText(nextChartData.status);
    setChartData(nextChartData.points.length ? nextChartData : nextChartData);
  }, [rows, unitMode, ignoreNegative, viewMode, dayInput, rangeStartInput, rangeEndInput]);

  async function handleFileUpload(event) {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsedRows = parseCsv(text)
        .map(mapRow)
        .filter(Boolean)
        .sort((a, b) => a.timestamp - b.timestamp);

      setRows(parsedRows);

      if (parsedRows.length) {
        const firstDate = parsedRows[0].dateKey;
        const lastDate = parsedRows[parsedRows.length - 1].dateKey;
        setDayInput(lastDate);
        setRangeStartInput(firstDate);
        setRangeEndInput(lastDate);
        setStatusText(`Loaded ${parsedRows.length} rows from ${file.name}.`);
      } else {
        setStatusText("The file was parsed, but no usable intake rows were found.");
      }
    } catch (error) {
      setRows([]);
      setChartData(null);
      setSummary(emptySummary);
      setChartTitle("Waiting for data");
      setStatusText(`Error: ${error.message}`);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Vercel Intake Visualizer</p>
          <h1>Upload intake CSV files and switch between day, range, and weekly plots.</h1>
          <p className="hero-copy">
            The app parses the file in the browser, splits <strong>Unlimited</strong> and{" "}
            <strong>Stolen</strong> into separate lines, and converts intake values from lbs to kg
            by default.
          </p>
        </div>
      </section>

      <section className="panel controls">
        <div className="control-grid">
          <label className="field field-wide">
            <span>Upload CSV</span>
            <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} />
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
      </section>

      <section className="stats-grid">
        <article className="panel stat-card">
          <span className="stat-label">Rows loaded</span>
          <strong>{summary.rowsLoaded}</strong>
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
              {chartData?.emptyMessage || "The chart will appear here after you upload a file."}
            </div>
          )}
        </div>
      </section>

      <section className="panel notes">
        <h3>How each plot works</h3>
        <ul>
          <li>
            <strong>Specific day:</strong> cumulative intake inside the selected day, split into
            Unlimited and Stolen.
          </li>
          <li>
            <strong>Day range summary:</strong> one point per day showing the total intake for that
            day.
          </li>
          <li>
            <strong>Weekly average:</strong> daily totals are summarized first, then averaged
            within each calendar week.
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
          <line
            className="grid-line"
            x1={margin.left}
            y1={tick.y}
            x2={width - margin.right}
            y2={tick.y}
          />
          <text className="tick-label" x={margin.left - 12} y={tick.y + 4} textAnchor="end">
            {formatNumber(tick.value)}
          </text>
        </g>
      ))}

      <line
        className="axis-line"
        x1={margin.left}
        y1={margin.top}
        x2={margin.left}
        y2={margin.top + innerHeight}
      />
      <line
        className="axis-line"
        x1={margin.left}
        y1={margin.top + innerHeight}
        x2={width - margin.right}
        y2={margin.top + innerHeight}
      />

      <path
        className="series-line series-unlimited"
        d={buildPath(points, "unlimited", margin, innerWidth, innerHeight, yMax)}
      />
      <path
        className="series-line series-stolen"
        d={buildPath(points, "stolen", margin, innerWidth, innerHeight, yMax)}
      />

      {points.map((point, index) => {
        const x = margin.left + (points.length > 1 ? xStep * index : innerWidth / 2);
        const unlimitedY = margin.top + innerHeight - (point.unlimited / yMax) * innerHeight;
        const stolenY = margin.top + innerHeight - (point.stolen / yMax) * innerHeight;
        const anchor = index === 0 ? "start" : index === points.length - 1 ? "end" : "middle";
        const rotation = points.length > 7 ? -35 : 0;

        return (
          <g key={point.label + index}>
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

function mapRow(row) {
  const startTime = row["Start time"];
  const intakeRaw = Number.parseFloat(row["Intake (kg)"]);
  if (!startTime || Number.isNaN(intakeRaw)) {
    return null;
  }

  const timestamp = parseDateTime(startTime);
  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  return {
    timestamp,
    dateKey: toDateKey(timestamp),
    timeLabel: formatTime(timestamp),
    unlimited: normalizeBoolean(row.Unlimited),
    stolen: normalizeBoolean(row.Stolen),
    intakeRaw,
  };
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

function buildSummary(rows) {
  if (!rows.length) {
    return emptySummary;
  }

  const unlimitedTotal = rows
    .filter((row) => row.unlimited)
    .reduce((sum, row) => sum + row.intakeKg, 0);
  const stolenTotal = rows
    .filter((row) => row.stolen)
    .reduce((sum, row) => sum + row.intakeKg, 0);

  return {
    rowsLoaded: rows.length.toLocaleString(),
    unlimitedTotal: formatNumber(unlimitedTotal),
    stolenTotal: formatNumber(stolenTotal),
    dateSpan: `${rows[0].dateKey} to ${rows[rows.length - 1].dateKey}`,
  };
}

function buildSpecificDaySeries(rows, dayKey) {
  const selectedDay = dayKey || rows[rows.length - 1]?.dateKey;
  const dayRows = rows.filter((row) => row.dateKey === selectedDay);
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
    title: `Specific day: ${selectedDay || "No day selected"}`,
    status: `Showing cumulative intake within ${selectedDay || "the selected day"}.`,
    emptyMessage: "No rows were found for the selected day.",
    points,
  };
}

function buildRangeSummarySeries(rows, startDate, endDate) {
  const daily = summarizeByDay(filterByDateRange(rows, startDate, endDate));
  const points = Array.from(daily.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, values]) => ({
      label,
      unlimited: values.unlimited,
      stolen: values.stolen,
    }));

  return {
    title: `Day range summary: ${startDate || "start"} to ${endDate || "end"}`,
    status: "Showing one summarized point per day in the selected range.",
    emptyMessage: "No rows were found for the selected date range.",
    points,
  };
}

function buildWeeklyAverageSeries(rows, startDate, endDate) {
  const daily = summarizeByDay(filterByDateRange(rows, startDate, endDate));
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
    title: `Weekly average: ${startDate || "start"} to ${endDate || "end"}`,
    status: "Showing the average daily intake inside each calendar week.",
    emptyMessage: "No weekly averages could be calculated for the selected range.",
    points,
  };
}

function summarizeByDay(rows) {
  const summary = new Map();

  rows.forEach((row) => {
    const bucket = summary.get(row.dateKey) || { unlimited: 0, stolen: 0 };
    if (row.unlimited) {
      bucket.unlimited += row.intakeKg;
    }
    if (row.stolen) {
      bucket.stolen += row.intakeKg;
    }
    summary.set(row.dateKey, bucket);
  });

  return summary;
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

function getWeekStart(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  const dayOfWeek = date.getDay();
  const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  date.setDate(date.getDate() + offset);
  return toDateKey(date);
}

function buildPath(points, key, margin, innerWidth, innerHeight, yMax) {
  if (!points.length) {
    return "";
  }

  return points
    .map((point, index) => {
      const x =
        margin.left + (points.length > 1 ? (innerWidth / (points.length - 1)) * index : innerWidth / 2);
      const y = margin.top + innerHeight - (point[key] / yMax) * innerHeight;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
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

function formatNumber(value) {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
