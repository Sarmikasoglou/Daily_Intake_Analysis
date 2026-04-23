"use client";

import * as XLSX from "xlsx";
import { useEffect, useMemo, useState } from "react";

const LB_TO_KG = 0.45359237;
const TIME_ZONE = "America/New_York";
const OVERALL_SCOPE = "overall";
const AGGREGATE_PLOT_MODE = "aggregate";
const PER_COW_PLOT_MODE = "per-cow";
const AS_FED_MODE = "as-fed";
const DMI_MODE = "dmi";
const WEIGHT_PLOT_COW_MODE = "cow";
const WEIGHT_PLOT_TREATMENT_MODE = "treatment";
const ALL_TREATMENTS = "all-treatments";
const UNLIMITED_COLOR = "#17594a";
const STOLEN_COLOR = "#b14f1f";
const COW_COLORS = ["#17594a", "#a34724", "#1d5d90", "#7b4ab0", "#866000", "#8f2d56"];
const COW_MARKERS = ["circle", "square", "diamond", "triangle"];
const STOLEN_DASH_PATTERNS = ["10 6", "5 4", "14 5 3 5", "2 5"];

const emptySummary = {
  rowsLoaded: "0",
  cowsTracked: "0",
  unlimitedTotal: "0.00",
  stolenTotal: "0.00",
  dateSpan: "-",
};

export default function Page() {
  const [activeTab, setActiveTab] = useState("intake");
  const [rows, setRows] = useState([]);
  const [mappingRows, setMappingRows] = useState([]);
  const [weightRows, setWeightRows] = useState([]);
  const [uploadedTreatmentRows, setUploadedTreatmentRows] = useState([]);
  const [manualTreatmentRows, setManualTreatmentRows] = useState([]);
  const [selectedWeightEartag, setSelectedWeightEartag] = useState("");
  const [selectedTreatment, setSelectedTreatment] = useState(ALL_TREATMENTS);
  const [selectedIntakeTreatment, setSelectedIntakeTreatment] = useState(ALL_TREATMENTS);
  const [showOnlyTreatmentCows, setShowOnlyTreatmentCows] = useState(false);
  const [weightPlotMode, setWeightPlotMode] = useState(WEIGHT_PLOT_COW_MODE);
  const [unitMode, setUnitMode] = useState("lbs");
  const [intakeBasis, setIntakeBasis] = useState(AS_FED_MODE);
  const [viewMode, setViewMode] = useState("day");
  const [analysisScope, setAnalysisScope] = useState(OVERALL_SCOPE);
  const [plotMode, setPlotMode] = useState(AGGREGATE_PLOT_MODE);
  const [selectedCows, setSelectedCows] = useState([]);
  const [dmByRoughage, setDmByRoughage] = useState({});
  const [ignoreNegative, setIgnoreNegative] = useState(true);
  const [amFeedingStartTime, setAmFeedingStartTime] = useState("06:00");
  const [manualTreatmentName, setManualTreatmentName] = useState("");
  const [manualTreatmentStartDate, setManualTreatmentStartDate] = useState("");
  const [manualTreatmentEndDate, setManualTreatmentEndDate] = useState("");
  const [manualTreatmentCowSelection, setManualTreatmentCowSelection] = useState([]);
  const [dayInput, setDayInput] = useState("");
  const [rangeStartInput, setRangeStartInput] = useState("");
  const [rangeEndInput, setRangeEndInput] = useState("");
  const [statusText, setStatusText] = useState("Upload one or more intake CSV files to start.");
  const [chartTitle, setChartTitle] = useState("Waiting for data");
  const [chartData, setChartData] = useState(null);
  const [summary, setSummary] = useState(emptySummary);

  const treatmentRows = useMemo(
    () => [...uploadedTreatmentRows, ...manualTreatmentRows],
    [uploadedTreatmentRows, manualTreatmentRows]
  );
  const mappingByTransponder = useMemo(() => buildMappingLookup(mappingRows), [mappingRows]);
  const bodyWeightLookup = useMemo(() => buildBodyWeightLookup(mappingRows), [mappingRows]);
  const treatmentLookup = useMemo(() => buildTreatmentLookup(treatmentRows), [treatmentRows]);
  const enrichedRows = useMemo(
    () => enrichRows(rows, mappingByTransponder, treatmentLookup),
    [rows, mappingByTransponder, treatmentLookup]
  );
  const processedRows = useMemo(
    () => getProcessedRows(enrichedRows, unitMode, ignoreNegative, intakeBasis, dmByRoughage),
    [enrichedRows, unitMode, ignoreNegative, intakeBasis, dmByRoughage]
  );
  const intakeTreatmentFilteredRows = useMemo(
    () => filterRowsByAssignedTreatment(processedRows, selectedIntakeTreatment),
    [processedRows, selectedIntakeTreatment]
  );
  const filteredRows = useMemo(
    () => filterRowsByScope(intakeTreatmentFilteredRows, analysisScope),
    [intakeTreatmentFilteredRows, analysisScope]
  );
  const roughageOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.roughageType).filter(Boolean))).sort();
  }, [rows]);
  const intakeUnitLabel = intakeBasis === DMI_MODE ? "kg DM" : "kg";
  const intakeLabelText = intakeBasis === DMI_MODE ? "Dry Matter Intake" : "Intake";
  const trackedCows = useMemo(() => buildTrackedCowList(enrichedRows), [enrichedRows]);
  const linkedWeightRows = useMemo(
    () => enrichWeightRows(weightRows, bodyWeightLookup, treatmentLookup),
    [weightRows, bodyWeightLookup, treatmentLookup]
  );
  const treatmentOptions = useMemo(() => {
    return Array.from(new Set(linkedWeightRows.map((row) => row.treatment).filter(Boolean))).sort((a, b) =>
      String(a).localeCompare(String(b))
    );
  }, [linkedWeightRows]);
  const manualTreatmentCowOptions = useMemo(() => {
    return Array.from(new Set(uploadedTreatmentRows.map((row) => row.eartag).filter(Boolean))).sort((a, b) =>
      String(a).localeCompare(String(b))
    );
  }, [uploadedTreatmentRows]);
  const displayedWeightRows = useMemo(
    () => filterWeightRows(linkedWeightRows, showOnlyTreatmentCows, selectedTreatment),
    [linkedWeightRows, showOnlyTreatmentCows, selectedTreatment]
  );
  const latestWeights = useMemo(() => buildLatestWeights(displayedWeightRows), [displayedWeightRows]);
  const weightEartagOptions = useMemo(() => {
    return Array.from(new Set(displayedWeightRows.map((row) => row.eartag).filter(Boolean))).sort((a, b) =>
      String(a).localeCompare(String(b))
    );
  }, [displayedWeightRows]);
  const weightChartData = useMemo(
    () =>
      weightPlotMode === WEIGHT_PLOT_TREATMENT_MODE
        ? buildTreatmentAverageWeightChartData(displayedWeightRows, selectedTreatment)
        : buildWeightChartData(displayedWeightRows, selectedWeightEartag),
    [displayedWeightRows, selectedTreatment, selectedWeightEartag, weightPlotMode]
  );
  const weightMissingSummary = useMemo(
    () =>
      weightPlotMode === WEIGHT_PLOT_TREATMENT_MODE
        ? buildTreatmentWeightSummary(displayedWeightRows, selectedTreatment)
        : buildWeightMissingSummary(displayedWeightRows, selectedWeightEartag),
    [displayedWeightRows, selectedTreatment, selectedWeightEartag, weightPlotMode]
  );
  const midnightReportRows = useMemo(
    () => buildDailyCowReportRows(processedRows, getMidnightReportDateKey, intakeBasis, intakeUnitLabel),
    [processedRows, intakeBasis, intakeUnitLabel]
  );
  const amFeedingReportRows = useMemo(
    () =>
      buildDailyCowReportRows(
        processedRows,
        (timestamp) => getAmFeedingReportDateKey(timestamp, amFeedingStartTime),
        intakeBasis,
        intakeUnitLabel
      ),
    [processedRows, amFeedingStartTime, intakeBasis, intakeUnitLabel]
  );

  useEffect(() => {
    const allowedCows = new Set(trackedCows.map((cow) => cow.eartag));
    setSelectedCows((current) => current.filter((cow) => allowedCows.has(cow)).slice(0, 4));
  }, [trackedCows]);

  useEffect(() => {
    if (!weightEartagOptions.length) {
      setSelectedWeightEartag("");
      return;
    }
    if (!selectedWeightEartag || !weightEartagOptions.includes(selectedWeightEartag)) {
      setSelectedWeightEartag(weightEartagOptions[0]);
    }
  }, [weightEartagOptions, selectedWeightEartag]);

  useEffect(() => {
    if (!treatmentOptions.length) {
      setSelectedTreatment(ALL_TREATMENTS);
      setSelectedIntakeTreatment(ALL_TREATMENTS);
      return;
    }
    if (selectedTreatment !== ALL_TREATMENTS && !treatmentOptions.includes(selectedTreatment)) {
      setSelectedTreatment(ALL_TREATMENTS);
    }
    if (selectedIntakeTreatment !== ALL_TREATMENTS && !treatmentOptions.includes(selectedIntakeTreatment)) {
      setSelectedIntakeTreatment(ALL_TREATMENTS);
    }
  }, [selectedTreatment, selectedIntakeTreatment, treatmentOptions]);

  useEffect(() => {
    const allowedCows = new Set(manualTreatmentCowOptions);
    setManualTreatmentCowSelection((current) => current.filter((cow) => allowedCows.has(cow)));
  }, [manualTreatmentCowOptions]);

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

  async function handleWeightUpload(event) {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }

    try {
      const parsedRows = (await parseSpreadsheetFile(file))
        .map(mapWeightRow)
        .filter(Boolean)
        .sort((a, b) => b.timestamp - a.timestamp);

      setWeightRows(parsedRows);
      setStatusText(`Loaded ${parsedRows.length} body-weight rows from ${file.name}.`);
    } catch (error) {
      setWeightRows([]);
      setStatusText(`Error reading body-weight file: ${error.message}`);
    }
  }

  async function handleTreatmentUpload(event) {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }

    try {
      const parsedRows = await parseSpreadsheetFile(file);
      const parsedTreatments = parsedRows
        .map((row, index) => mapTreatmentRow(row, { source: "file", rowIndex: index }))
        .filter(Boolean);

      setUploadedTreatmentRows(parsedTreatments);
      setStatusText(`Loaded ${parsedTreatments.length} treatment assignments from ${file.name}.`);
    } catch (error) {
      setUploadedTreatmentRows([]);
      setStatusText(`Error reading treatment file: ${error.message}`);
    }
  }

  function toggleManualTreatmentCow(eartag) {
    setManualTreatmentCowSelection((current) =>
      current.includes(eartag) ? current.filter((cow) => cow !== eartag) : [...current, eartag]
    );
  }

  function handleAddManualTreatmentAssignments() {
    const treatment = manualTreatmentName.trim();
    if (!manualTreatmentCowOptions.length) {
      setStatusText("Upload the EART to treatment file first so manual treatments can use that cow list.");
      return;
    }
    if (!treatment) {
      setStatusText("Enter a treatment name before adding manual treatment assignments.");
      return;
    }
    if (!manualTreatmentCowSelection.length) {
      setStatusText("Pick at least one cow from the uploaded cow list before adding the treatment range.");
      return;
    }
    if (
      manualTreatmentStartDate &&
      manualTreatmentEndDate &&
      manualTreatmentStartDate.localeCompare(manualTreatmentEndDate) > 0
    ) {
      setStatusText("Treatment start date must be on or before the end date.");
      return;
    }

    const newAssignments = manualTreatmentCowSelection.map((eartag, index) =>
      createTreatmentAssignment({
        eartag,
        treatment,
        startDate: manualTreatmentStartDate,
        endDate: manualTreatmentEndDate,
        source: "manual",
        rowIndex: manualTreatmentRows.length + index,
      })
    );

    setManualTreatmentRows((current) => [...current, ...newAssignments]);
    setManualTreatmentCowSelection([]);
    setManualTreatmentName("");
    setManualTreatmentStartDate("");
    setManualTreatmentEndDate("");
    setStatusText(
      `Added ${newAssignments.length} manual treatment assignment(s) for ${treatment}.`
    );
  }

  function handleRemoveManualTreatmentAssignment(assignmentId) {
    setManualTreatmentRows((current) => current.filter((row) => row.id !== assignmentId));
  }

  function handleDownloadReport(reportType) {
    const reportRows = reportType === "am-feeding" ? amFeedingReportRows : midnightReportRows;
    const reportName =
      reportType === "am-feeding"
        ? `Intake from AM Feeding (${getAmFeedingWindowLabel(amFeedingStartTime)})`
        : "Intake from Midnight";
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
        "roughage_types_unlimited",
        "roughage_types_stolen",
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

  function handleDownloadWeightsCsv() {
    if (!displayedWeightRows.length) {
      setStatusText("Upload body-weight rows first so the app can generate the Body Weights CSV.");
      return;
    }

    const exportRows = displayedWeightRows.map((row) => ({
      eartag: row.eartag,
      eid: row.linkedEid || row.eid || "",
      transid: row.transId || "",
      treatment: row.treatment || "",
      identifier_used_in_file: row.eid || "",
      identifier_type: row.identifierType || "",
      date: row.dateKey,
      weight_kg: formatNumber(row.weightKg),
    }));

    const csv = toCsv(exportRows, [
      "eartag",
      "eid",
      "transid",
      "treatment",
      "identifier_used_in_file",
      "identifier_type",
      "date",
      "weight_kg",
    ]);

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "body_weights_table.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatusText(`Downloaded Body Weights CSV with ${displayedWeightRows.length} rows.`);
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Cow Intake and Body Weight Visualizer</p>
          <h1>Upload cow files and review intake or body weights.</h1>
          <p className="hero-copy">
            Link EID to eartag once, then switch between intake analysis and body-weight tracking.
          </p>
        </div>
      </section>
      <section className="panel tabs-panel">
        <div className="tabs-row">
          <button
            type="button"
            className={`tab-button ${activeTab === "intake" ? "tab-button-active" : ""}`}
            onClick={() => setActiveTab("intake")}
          >
            Intake
          </button>
          <button
            type="button"
            className={`tab-button ${activeTab === "weights" ? "tab-button-active" : ""}`}
            onClick={() => setActiveTab("weights")}
          >
            Body Weights
          </button>
        </div>
      </section>

      {activeTab === "intake" ? (
        <>
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

          <label className="field field-wide">
            <span>Upload EART to treatment file</span>
            <input type="file" accept=".xls,.xlsx,.csv,text/csv" onChange={handleTreatmentUpload} />
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

          <label className="field">
            <span>Treatment filter</span>
            <select value={selectedIntakeTreatment} onChange={(event) => setSelectedIntakeTreatment(event.target.value)}>
              <option value={ALL_TREATMENTS}>All treatments</option>
              {treatmentOptions.map((treatment) => (
                <option key={`intake-treatment-${treatment}`} value={treatment}>
                  {treatment}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="treatment-builder">
          <div className="treatment-builder-header">
            <div>
              <strong>Intake treatment assignment</strong>
              <p>
                Upload a treatment file or manually assign a treatment to selected cows for an optional
                date range.
              </p>
            </div>
          </div>

          {manualTreatmentCowOptions.length ? (
            <>
              <div className="control-grid treatment-builder-grid">
                <label className="field">
                  <span>Treatment name</span>
                  <input
                    type="text"
                    value={manualTreatmentName}
                    onChange={(event) => setManualTreatmentName(event.target.value)}
                    placeholder="e.g. CON diet"
                  />
                </label>

                <label className="field">
                  <span>Start date</span>
                  <input
                    type="date"
                    value={manualTreatmentStartDate}
                    onChange={(event) => setManualTreatmentStartDate(event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>End date</span>
                  <input
                    type="date"
                    value={manualTreatmentEndDate}
                    onChange={(event) => setManualTreatmentEndDate(event.target.value)}
                  />
                </label>
              </div>

              <div className="field">
                <span>Select cows from uploaded EART to treatment file</span>
                <div className="cow-chip-grid treatment-chip-grid">
                  {manualTreatmentCowOptions.map((cow) => {
                    const isSelected = manualTreatmentCowSelection.includes(cow);
                    return (
                      <button
                        key={`manual-treatment-${cow}`}
                        type="button"
                        className={`cow-chip ${isSelected ? "cow-chip-selected" : ""}`}
                        onClick={() => toggleManualTreatmentCow(cow)}
                      >
                        {cow}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="action-row">
                <button className="action-button" type="button" onClick={handleAddManualTreatmentAssignments}>
                  Add manual treatment
                </button>
              </div>
            </>
            ) : (
              <div className="empty-inline">
              Upload the EART to treatment file first so the app has a cow list for manual treatment
              entry.
              </div>
            )}

          {manualTreatmentRows.length ? (
            <div className="assignment-table-wrap">
              <table className="weights-table assignment-table">
                <thead>
                  <tr>
                    <th>Eartag</th>
                    <th>Treatment</th>
                    <th>Start date</th>
                    <th>End date</th>
                    <th>Source</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {manualTreatmentRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.eartag}</td>
                      <td>{row.treatment}</td>
                      <td>{row.startDate || "Any"}</td>
                      <td>{row.endDate || "Any"}</td>
                      <td>{row.source}</td>
                      <td>
                        <button
                          type="button"
                          className="table-action"
                          onClick={() => handleRemoveManualTreatmentAssignment(row.id)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
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
          Treatment rows: <strong>{treatmentRows.length}</strong>
          {" | "}
          Basis: <strong>{intakeLabelText}</strong>
        </p>
        <div className="action-row">
          <label className="field am-feeding-field">
            <span>AM feeding starts at</span>
            <input
              type="time"
              step="60"
              value={amFeedingStartTime}
              onChange={(event) => setAmFeedingStartTime(event.target.value || "06:00")}
            />
          </label>
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
                <LegendSwatch series={series} />
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
            <strong>Treatment assignment:</strong> upload a treatment sheet or add treatments manually in
            the Intake tab, with optional start and end dates for each assignment window.
          </li>
          <li>
            <strong>Treatment filter:</strong> use the Intake tab treatment filter to focus charts and
            summaries on one treatment at a time.
          </li>
          <li>
            <strong>Intake from Midnight:</strong> exports one row per cow from 12:00 AM through
            11:59 PM for each calendar day.
          </li>
          <li>
            <strong>Intake from AM Feeding:</strong> exports one row per cow from{" "}
            {getAmFeedingWindowLabel(amFeedingStartTime)}, using each visit start time to assign
            the feeding day.
          </li>
        </ul>
      </section>
        </>
      ) : (
        <>
      <section className="panel controls">
        <div className="control-grid">
          <label className="field field-wide">
            <span>Upload body-weight file</span>
            <input type="file" accept=".xls,.xlsx,.csv,text/csv" onChange={handleWeightUpload} />
          </label>

          <label className="field field-wide">
            <span>Upload transponder to eartag lookup</span>
            <input type="file" accept=".csv,text/csv" onChange={handleMappingUpload} />
          </label>

          <label className="field field-wide">
            <span>Upload EART to treatment file</span>
            <input type="file" accept=".xls,.xlsx,.csv,text/csv" onChange={handleTreatmentUpload} />
          </label>

          <label className="field">
            <span>Body-weight plot</span>
            <select value={weightPlotMode} onChange={(event) => setWeightPlotMode(event.target.value)}>
              <option value={WEIGHT_PLOT_COW_MODE}>Selected cow history</option>
              <option value={WEIGHT_PLOT_TREATMENT_MODE}>Treatment averages</option>
            </select>
          </label>

          <label className="field">
            <span>Treatment filter</span>
            <select value={selectedTreatment} onChange={(event) => setSelectedTreatment(event.target.value)}>
              <option value={ALL_TREATMENTS}>All treatments</option>
              {treatmentOptions.map((treatment) => (
                <option key={treatment} value={treatment}>
                  {treatment}
                </option>
              ))}
            </select>
          </label>

          <label className="field checkbox-field">
            <input
              type="checkbox"
              checked={showOnlyTreatmentCows}
              onChange={(event) => setShowOnlyTreatmentCows(event.target.checked)}
            />
              <span>Only show cows listed in the treatment file</span>
            </label>
        </div>

        <p className="status">{statusText}</p>
        <p className="substatus">
          Weight rows: <strong>{displayedWeightRows.length}</strong>
          {" | "}
          Cows with weights: <strong>{latestWeights.length}</strong>
          {" | "}
          Mapping rows: <strong>{mappingRows.length}</strong>
          {" | "}
          Treatment rows: <strong>{treatmentRows.length}</strong>
        </p>
        <p className="substatus">
          Note: the same cow can show two different body-weight rows on the same day when one record
          is saved under <strong>EID</strong> and another is saved under <strong>TransID</strong>.
        </p>
        <div className="action-row">
          <button className="action-button" type="button" onClick={handleDownloadWeightsCsv}>
            Download Body Weights CSV
          </button>
        </div>
      </section>

      <section className="stats-grid">
        <article className="panel stat-card">
          <span className="stat-label">Weight rows loaded</span>
          <strong>{displayedWeightRows.length.toLocaleString()}</strong>
        </article>
        <article className="panel stat-card">
          <span className="stat-label">Cows linked</span>
          <strong>{latestWeights.length.toLocaleString()}</strong>
        </article>
        <article className="panel stat-card">
          <span className="stat-label">Latest average (kg)</span>
          <strong>{latestWeights.length ? formatNumber(latestWeights.reduce((sum, row) => sum + row.weightKg, 0) / latestWeights.length) : "0.00"}</strong>
        </article>
        <article className="panel stat-card">
          <span className="stat-label">Most recent date</span>
          <strong>{latestWeights[0]?.dateKey || "-"}</strong>
        </article>
      </section>

      <section className="panel chart-panel">
        <div className="chart-header">
          <div>
            <p className="eyebrow">Body Weight Plot</p>
            <h2>{weightChartData.title}</h2>
          </div>
        </div>

        <div className="control-grid weight-chart-controls">
          {weightPlotMode === WEIGHT_PLOT_COW_MODE ? (
            <label className="field">
              <span>Eartag</span>
              <select
                value={selectedWeightEartag}
                onChange={(event) => setSelectedWeightEartag(event.target.value)}
                disabled={!weightEartagOptions.length}
              >
                {weightEartagOptions.map((eartag) => (
                  <option key={eartag} value={eartag}>
                    {eartag}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="field">
              <span>Treatment average view</span>
              <div className="inline-note">
                {selectedTreatment === ALL_TREATMENTS
                  ? "Showing one average body-weight line per treatment."
                  : `Showing average body weight for treatment ${selectedTreatment}.`}
              </div>
            </div>
          )}
        </div>

        <p className="substatus">
          {weightMissingSummary.message}
        </p>

        <div className="chart-container">
          {weightChartData.points.length ? (
            <Chart chartData={weightChartData} />
          ) : (
            <div className="empty-state">
              {weightChartData.emptyMessage || "Upload body-weight rows to see a body-weight plot."}
            </div>
          )}
        </div>
      </section>

      <section className="panel tracked-panel">
        <div className="tracked-header">
          <div>
            <p className="eyebrow">Body Weights</p>
            <h3>Linked body-weight history by eartag</h3>
          </div>
          <p className="tracked-count">{displayedWeightRows.length} rows</p>
        </div>
        {displayedWeightRows.length ? (
          <div className="weights-table-wrap">
            <table className="weights-table">
              <thead>
                <tr>
                  <th>Eartag</th>
                  <th>EID</th>
                  <th>TransID</th>
                  <th>Treatment</th>
                  <th>Date</th>
                  <th>Weight (kg)</th>
                </tr>
              </thead>
              <tbody>
                {displayedWeightRows.map((row, index) => (
                  <tr key={`${row.eartag}-${row.eid}-${row.dateKey}-${index}`}>
                    <td>{row.eartag}</td>
                    <td>{row.linkedEid || row.eid}</td>
                    <td>{row.transId || "-"}</td>
                    <td>{row.treatment || "-"}</td>
                    <td>{row.dateKey}</td>
                    <td>{formatNumber(row.weightKg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-inline">
            Upload the body-weight workbook and the EART/EID lookup file to see linked body weights here.
          </div>
        )}
      </section>

      <section className="panel notes">
        <h3>Body Weight Tab</h3>
        <ul>
          <li>
            <strong>Weight upload:</strong> accepts your body-weight workbook with <code>EID</code>,
            <code>Date</code>, and <code>Weight (Kg)</code>.
          </li>
          <li>
            <strong>Linking:</strong> the body-weight <code>EID</code> is matched to the lookup-file
            <code>EID</code>, and the table shows the matching <code>EART</code>, <code>EID</code>,
            and <code>TransID</code> for each cow.
          </li>
          <li>
            <strong>Treatment file:</strong> upload a sheet with <code>EART</code> and
            <code>Treatment</code>, and optionally <code>Start date</code> / <code>End date</code>,
            to filter the Body Weights tab and calculate treatment averages.
          </li>
          <li>
            <strong>Treatment filter:</strong> you can show only cows listed in the treatment file,
            or narrow the plot, table, and CSV export to one treatment.
          </li>
          <li>
            <strong>Weight history:</strong> repeated rows for the same cow are preserved so you can
            see each weight on each recorded date.
          </li>
          <li>
            <strong>Duplicate-looking weights:</strong> the same cow may appear twice on one date if
            one weight was recorded under <code>EID</code> and another under <code>TransID</code>.
          </li>
          <li>
            <strong>Weight plot:</strong> pick an eartag to plot that cow&apos;s weight across the dates
            available in the uploaded file, or switch to treatment averages to compare treatments by day.
          </li>
        </ul>
      </section>
        </>
      )}
    </main>
  );
}

function Chart({ chartData }) {
  const { points, series, title, unitLabel } = chartData;
  const width = 1000;
  const hasRotatedLabels = points.length > 7;
  const height = hasRotatedLabels ? 430 : 396;
  const margin = { top: 24, right: hasRotatedLabels ? 40 : 28, bottom: hasRotatedLabels ? 110 : 70, left: 72 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const xLabelStep = getXAxisLabelStep(points.length);
  const maxValue = Math.max(
    ...points.flatMap((point) =>
      series
        .map((item) => point.values[item.key])
        .filter((value) => value !== null && value !== undefined)
    ),
    0
  );
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
        <g key={`series-${item.key}`}>
          <path
            className="series-line series-line-halo"
            stroke="rgba(255, 253, 248, 0.95)"
            strokeWidth={(item.lineWidth || 3) + 4}
            strokeDasharray={item.dashArray || (item.dashed ? "8 5" : undefined)}
            d={buildPath(points, item.key, margin, innerWidth, innerHeight, yMax)}
          />
          <path
            className="series-line"
            stroke={item.color}
            strokeWidth={item.lineWidth || 3}
            strokeDasharray={item.dashArray || (item.dashed ? "8 5" : undefined)}
            d={buildPath(points, item.key, margin, innerWidth, innerHeight, yMax)}
          />
        </g>
      ))}

      {series.map((item) =>
        points.map((point, index) => {
          const x = margin.left + (points.length > 1 ? xStep * index : innerWidth / 2);
          const value = point.values[item.key];
          if (value === null || value === undefined) {
            return null;
          }
          const y = margin.top + innerHeight - (value / yMax) * innerHeight;
          return renderPointMarker(item, x, y, `${item.key}-${point.label}-${index}`);
        })
      )}

      {points.map((point, index) => {
        const shouldShowLabel =
          index === 0 || index === points.length - 1 || index % xLabelStep === 0;
        if (!shouldShowLabel) {
          return null;
        }
        const x = margin.left + (points.length > 1 ? xStep * index : innerWidth / 2);
        const anchor = hasRotatedLabels ? "middle" : index === 0 ? "start" : index === points.length - 1 ? "end" : "middle";
        const rotation = hasRotatedLabels ? -28 : 0;
        const labelText = formatXAxisLabel(point.label, hasRotatedLabels);

        return (
          <text
            key={`label-${point.label}-${index}`}
            className="tick-label"
            x={x}
            y={height - 22}
            textAnchor={anchor}
            transform={`rotate(${rotation} ${x} ${height - 22})`}
          >
            {labelText}
          </text>
        );
      })}

      <text className="axis-label" x={margin.left - 52} y={margin.top - 8}>
        {unitLabel || "kg"}
      </text>
    </svg>
  );
}

function getXAxisLabelStep(pointCount) {
  if (pointCount <= 8) {
    return 1;
  }
  if (pointCount <= 16) {
    return 2;
  }
  if (pointCount <= 24) {
    return 3;
  }
  if (pointCount <= 36) {
    return 4;
  }
  if (pointCount <= 48) {
    return 5;
  }
  return 6;
}

function formatXAxisLabel(label, useCompactDate = false) {
  const text = String(label || "");
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!isoMatch) {
    return text;
  }

  const [, yearText, monthText, dayText] = isoMatch;
  const date = new Date(Number(yearText), Number(monthText) - 1, Number(dayText));
  return date.toLocaleDateString("en-US", {
    month: useCompactDate ? "short" : "2-digit",
    day: "numeric",
  });
}

function LegendSwatch({ series }) {
  return (
    <svg className="legend-swatch-svg" viewBox="0 0 38 16" aria-hidden="true">
      <line
        x1="3"
        y1="8"
        x2="35"
        y2="8"
        stroke="rgba(255, 253, 248, 0.95)"
        strokeWidth={(series.lineWidth || 3) + 4}
        strokeLinecap="round"
        strokeDasharray={series.dashArray || (series.dashed ? "8 5" : undefined)}
      />
      <line
        x1="3"
        y1="8"
        x2="35"
        y2="8"
        stroke={series.color}
        strokeWidth={series.lineWidth || 3}
        strokeLinecap="round"
        strokeDasharray={series.dashArray || (series.dashed ? "8 5" : undefined)}
      />
      {renderMarkerShape({
        shape: series.markerShape || "circle",
        key: `${series.key}-legend`,
        x: 19,
        y: 8,
        size: 5.4,
        color: series.color,
        filled: series.markerFilled !== false,
      })}
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

async function parseSpreadsheetFile(file) {
  if (file.name.toLowerCase().endsWith(".csv")) {
    const text = await file.text();
    return parseCsv(text);
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheet];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
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
  const eid = String(
    row.EID ||
      row.eid ||
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
      row.EART ||
      row.eart ||
      row.Cow ||
      row.cow ||
      row.ID ||
      row.id ||
      ""
  ).trim();

  const transId = String(
    row.TransID ||
      row.trans_id ||
      row["Trans ID"] ||
      row["TransId"] ||
      ""
  ).trim();

  if (!eid || !cowId) {
    return null;
  }

  return {
    transponder: eid,
    cowId,
    eid,
    transId,
  };
}

function mapWeightRow(row) {
  const normalizedRow = normalizeRowKeys(row);
  const eid = String(
    normalizedRow.eid ||
      normalizedRow.transid ||
      normalizedRow["trans id"] ||
      normalizedRow.transid ||
      ""
  ).trim();
  const rawDate =
    normalizedRow.timestamp ||
    normalizedRow.date ||
    "";
  const rawWeight =
    normalizedRow["weight (kg)"] ||
    normalizedRow.weight ||
    "";

  if (!eid || rawDate === "" || rawWeight === "") {
    return null;
  }

  const timestamp = parseSpreadsheetDate(rawDate);
  const weightKg = Number.parseFloat(rawWeight);

  if (Number.isNaN(timestamp.getTime()) || Number.isNaN(weightKg)) {
    return null;
  }

  return {
    eid,
    timestamp,
    dateKey: toDateKey(timestamp),
    weightKg,
    eartag: eid,
  };
}

function mapTreatmentRow(row, options = {}) {
  const normalizedRow = normalizeRowKeys(row);
  const eartag = String(
    normalizedRow.eart ||
      normalizedRow.eartag ||
      normalizedRow["ear tag"] ||
      normalizedRow.tag ||
      ""
  ).trim();
  const treatment = String(
    normalizedRow.treatment ||
      normalizedRow.trt ||
      normalizedRow.group ||
      ""
  ).trim();
  const startDate = parseOptionalDateKey(
    normalizedRow.startdate ||
      normalizedRow["start date"] ||
      normalizedRow.start ||
      normalizedRow.from ||
      normalizedRow.begindate ||
      normalizedRow["begin date"] ||
      ""
  );
  const endDate = parseOptionalDateKey(
    normalizedRow.enddate ||
      normalizedRow["end date"] ||
      normalizedRow.end ||
      normalizedRow.to ||
      normalizedRow.stopdate ||
      normalizedRow["stop date"] ||
      ""
  );

  if (!eartag || !treatment) {
    return null;
  }

  return createTreatmentAssignment({
    eartag,
    treatment,
    startDate,
    endDate,
    source: options.source || "file",
    rowIndex: options.rowIndex || 0,
  });
}

function normalizeRowKeys(row) {
  return Object.entries(row).reduce((accumulator, [key, value]) => {
    accumulator[String(key).trim().toLowerCase()] = value;
    return accumulator;
  }, {});
}

function parseSpreadsheetDate(value) {
  if (value instanceof Date) {
    return new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const converted = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
    return new Date(converted.getUTCFullYear(), converted.getUTCMonth(), converted.getUTCDate());
  }

  const text = String(value).trim();

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const usMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  return new Date(text);
}

function parseOptionalDateKey(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const timestamp = parseSpreadsheetDate(value);
  if (Number.isNaN(timestamp.getTime())) {
    return "";
  }
  return toDateKey(timestamp);
}

function createTreatmentAssignment({
  eartag,
  treatment,
  startDate = "",
  endDate = "",
  source = "manual",
  rowIndex = 0,
}) {
  const normalizedEartag = String(eartag || "").trim();
  const normalizedTreatment = String(treatment || "").trim();
  return {
    id: `${source}-${normalizedEartag}-${normalizedTreatment}-${startDate || "any"}-${endDate || "any"}-${rowIndex}`,
    eartag: normalizedEartag,
    treatment: normalizedTreatment,
    startDate: startDate || "",
    endDate: endDate || "",
    source,
  };
}

function compareTreatmentAssignments(left, right) {
  const leftStart = left.startDate || "0000-00-00";
  const rightStart = right.startDate || "0000-00-00";
  const leftEnd = left.endDate || "9999-12-31";
  const rightEnd = right.endDate || "9999-12-31";
  return (
    rightStart.localeCompare(leftStart) ||
    leftEnd.localeCompare(rightEnd) ||
    String(left.id).localeCompare(String(right.id))
  );
}

function resolveTreatmentForDate(assignments, dateKey) {
  const match = assignments.find((assignment) => {
    if (assignment.startDate && dateKey < assignment.startDate) {
      return false;
    }
    if (assignment.endDate && dateKey > assignment.endDate) {
      return false;
    }
    return true;
  });
  return match?.treatment || "";
}

function buildMappingLookup(mappingRows) {
  return mappingRows.reduce((lookup, row) => {
    lookup.set(row.transponder, {
      eartag: row.cowId,
      eid: row.eid || row.transponder,
      transId: row.transId || "",
    });
    return lookup;
  }, new Map());
}

function buildBodyWeightLookup(mappingRows) {
  return mappingRows.reduce(
    (lookup, row) => {
      const payload = {
        eartag: row.cowId,
        eid: row.eid || row.transponder,
        transId: row.transId || "",
      };

      if (payload.eid) {
        lookup.byEid.set(payload.eid, payload);
      }
      if (payload.transId) {
        lookup.byTransId.set(payload.transId, payload);
      }

      return lookup;
    },
    { byEid: new Map(), byTransId: new Map() }
  );
}

function buildTreatmentLookup(treatmentRows) {
  return treatmentRows.reduce((lookup, row) => {
    const key = String(row.eartag);
    const current = lookup.get(key) || [];
    current.push(row);
    current.sort(compareTreatmentAssignments);
    lookup.set(key, current);
    return lookup;
  }, new Map());
}

function enrichRows(rows, mappingLookup, treatmentLookup) {
  return rows.map((row) => {
    const eartag = mappingLookup.get(row.transponder)?.eartag || row.transponder || "Unknown";
    return {
      ...row,
      eartag,
      treatment: resolveTreatmentForDate(treatmentLookup.get(String(eartag)) || [], row.dateKey) || "",
    };
  });
}

function enrichWeightRows(rows, bodyWeightLookup, treatmentLookup) {
  return rows
    .map((row) => {
      const isTransId = String(row.eid || "").startsWith("98");
      const lookupMatch = isTransId
        ? bodyWeightLookup.byTransId.get(row.eid) || bodyWeightLookup.byEid.get(row.eid)
        : bodyWeightLookup.byEid.get(row.eid) || bodyWeightLookup.byTransId.get(row.eid);

      return {
        ...row,
        identifierType: isTransId ? "transid" : "eid",
        eartag: lookupMatch?.eartag || row.eid || "Unknown",
        linkedEid: lookupMatch?.eid || (isTransId ? "" : row.eid) || "Unknown",
        transId: lookupMatch?.transId || (isTransId ? row.eid : ""),
        treatment:
          resolveTreatmentForDate(
            treatmentLookup.get(String(lookupMatch?.eartag || row.eid || "Unknown")) || [],
            row.dateKey
          ) || "",
      };
    })
    .sort((a, b) => {
      const cowCompare = String(a.eartag).localeCompare(String(b.eartag));
      if (cowCompare !== 0) {
        return cowCompare;
      }
      return b.timestamp - a.timestamp;
    });
}

function filterWeightRows(rows, showOnlyTreatmentCows, selectedTreatment) {
  return rows.filter((row) => {
    if (showOnlyTreatmentCows && !row.treatment) {
      return false;
    }
    if (selectedTreatment !== ALL_TREATMENTS && row.treatment !== selectedTreatment) {
      return false;
    }
    return true;
  });
}

function filterRowsByAssignedTreatment(rows, selectedTreatment) {
  return rows.filter((row) => {
    if (selectedTreatment !== ALL_TREATMENTS && row.treatment !== selectedTreatment) {
      return false;
    }
    return true;
  });
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
    const markerShape = COW_MARKERS[index % COW_MARKERS.length];
    const stolenDashArray = STOLEN_DASH_PATTERNS[index % STOLEN_DASH_PATTERNS.length];
    return [
      {
        key: getCowSeriesKey(cow, "unlimited"),
        label: `${cow} unlimited`,
        color,
        dashed: false,
        dashArray: undefined,
        markerShape,
        markerFilled: true,
        lineWidth: 3.6,
      },
      {
        key: getCowSeriesKey(cow, "stolen"),
        label: `${cow} stolen`,
        color,
        dashed: true,
        dashArray: stolenDashArray,
        markerShape,
        markerFilled: false,
        lineWidth: 3.2,
      },
    ];
  });
}

function getCowSeriesKey(cow, type) {
  return `${cow}__${type}`;
}

function buildWeightChartData(rows, selectedEartag) {
  if (!selectedEartag) {
    return {
      title: "Select an eartag",
      status: "Choose a cow to view its body-weight history.",
      emptyMessage: "Upload body-weight rows and choose an eartag to plot weight by date.",
      unitLabel: "kg",
      series: [],
      points: [],
    };
  }

  const points = Array.from(
    groupRowsBy(
      rows.filter((row) => row.eartag === selectedEartag),
      (row) => row.dateKey
    ).entries()
  )
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, dayRows]) => {
      const eidRow = dayRows.find((row) => row.identifierType === "eid");
      const transIdRow = dayRows.find((row) => row.identifierType === "transid");
      return {
        label,
        values: {
          eid_weight: eidRow ? eidRow.weightKg : null,
          transid_weight: transIdRow ? transIdRow.weightKg : null,
        },
      };
    });

  return {
    title: `Body weight history: ${selectedEartag}`,
    status: `Showing available body-weight dates for eartag ${selectedEartag}.`,
    emptyMessage: "No body-weight rows were found for the selected eartag.",
    unitLabel: "kg",
    series: [
      {
        key: "eid_weight",
        label: "EID weight",
        color: UNLIMITED_COLOR,
        dashed: false,
      },
      {
        key: "transid_weight",
        label: "TransID weight",
        color: "#9f3d1f",
        dashed: false,
      },
    ],
    points,
  };
}

function buildTreatmentAverageWeightChartData(rows, selectedTreatment) {
  const treatmentRows = rows.filter((row) =>
    selectedTreatment === ALL_TREATMENTS ? Boolean(row.treatment) : row.treatment === selectedTreatment
  );

  if (!treatmentRows.length) {
    return {
      title: "Treatment averages",
      status: "Upload a treatment file and matching body weights to compare average body weight by treatment.",
      emptyMessage: "No treated cows were found for the current treatment filters.",
      unitLabel: "kg",
      series: [],
      points: [],
    };
  }

  const treatments = Array.from(new Set(treatmentRows.map((row) => row.treatment))).sort((a, b) =>
    String(a).localeCompare(String(b))
  );
  const dailyTreatmentMeans = new Map();

  treatments.forEach((treatment) => {
    const rowsForTreatment = treatmentRows.filter((row) => row.treatment === treatment);
    const byDay = groupRowsBy(rowsForTreatment, (row) => row.dateKey);
    byDay.forEach((dayRows, dateKey) => {
      const byCow = groupRowsBy(dayRows, (row) => row.eartag);
      const cowMeans = Array.from(byCow.values()).map((cowRows) => {
        return cowRows.reduce((sum, row) => sum + row.weightKg, 0) / cowRows.length;
      });
      const dateBucket = dailyTreatmentMeans.get(dateKey) || {};
      dateBucket[treatment] = cowMeans.reduce((sum, value) => sum + value, 0) / (cowMeans.length || 1);
      dailyTreatmentMeans.set(dateKey, dateBucket);
    });
  });

  const points = Array.from(dailyTreatmentMeans.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, values]) => ({
      label,
      values,
    }));

  return {
    title:
      selectedTreatment === ALL_TREATMENTS
        ? "Average body weight by treatment"
        : `Average body weight: treatment ${selectedTreatment}`,
    status:
      selectedTreatment === ALL_TREATMENTS
        ? "Showing one average body-weight line per treatment using cows with uploaded treatment assignments."
        : `Showing average daily body weight for treatment ${selectedTreatment}.`,
    emptyMessage: "No treatment averages could be calculated for the current filter.",
    unitLabel: "kg",
    series: treatments.map((treatment, index) => ({
      key: treatment,
      label: `Treatment ${treatment}`,
      color: COW_COLORS[index % COW_COLORS.length],
      dashed: false,
    })),
    points,
  };
}

function buildWeightMissingSummary(rows, selectedEartag) {
  if (!rows.length || !selectedEartag) {
    return {
      message: "Upload body-weight rows and choose an eartag to see missing-day counts.",
    };
  }

  const sortedRows = [...rows].sort((a, b) => a.timestamp - b.timestamp);
  const firstDate = sortedRows[0].dateKey;
  const lastDate = sortedRows[sortedRows.length - 1].dateKey;
  const selectedCowDates = new Set(
    rows.filter((row) => row.eartag === selectedEartag).map((row) => row.dateKey)
  );

  let totalDays = 0;
  let missingDays = 0;
  const current = new Date(`${firstDate}T00:00:00`);
  const end = new Date(`${lastDate}T00:00:00`);

  while (current <= end) {
    totalDays += 1;
    const dateKey = toDateKey(current);
    if (!selectedCowDates.has(dateKey)) {
      missingDays += 1;
    }
    current.setDate(current.getDate() + 1);
  }

  return {
    message: `${selectedEartag} is missing body weights on ${missingDays} day(s) across ${firstDate} to ${lastDate} (${totalDays} total days in the uploaded BW date range).`,
  };
}

function buildTreatmentWeightSummary(rows, selectedTreatment) {
  const treatmentRows = rows.filter((row) =>
    selectedTreatment === ALL_TREATMENTS ? Boolean(row.treatment) : row.treatment === selectedTreatment
  );

  if (!treatmentRows.length) {
    return {
      message: "Upload a treatment file and matching body weights to see treatment-average summaries.",
    };
  }

  const cows = new Set(treatmentRows.map((row) => row.eartag));
  const dates = new Set(treatmentRows.map((row) => row.dateKey));

  return {
    message:
      selectedTreatment === ALL_TREATMENTS
        ? `Treatment averages are using ${cows.size} cows across ${dates.size} recorded date(s).`
        : `Treatment ${selectedTreatment} includes ${cows.size} cow(s) with body weights across ${dates.size} recorded date(s).`,
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

function buildLatestWeights(rows) {
  const latestByCow = new Map();

  rows.forEach((row) => {
    const current = latestByCow.get(row.eartag);
    if (!current || row.timestamp > current.timestamp) {
      latestByCow.set(row.eartag, row);
    }
  });

  return Array.from(latestByCow.values()).sort((a, b) => b.timestamp - a.timestamp);
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
      unlimitedRoughageSet: new Set(),
      stolenRoughageSet: new Set(),
      sourceFileSet: new Set(),
      unlimited: 0,
      stolen: 0,
    };

    bucket.transponderSet.add(row.transponder || "Unknown");
    bucket.sourceFileSet.add(row.sourceFile || "");
    if (row.unlimited) {
      bucket.unlimited += row.intakeKg;
      if (row.roughageType) {
        bucket.unlimitedRoughageSet.add(row.roughageType);
      }
    }
    if (row.stolen) {
      bucket.stolen += row.intakeKg;
      if (row.roughageType) {
        bucket.stolenRoughageSet.add(row.roughageType);
      }
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
      roughage_types_unlimited: Array.from(row.unlimitedRoughageSet).sort().join(" | "),
      roughage_types_stolen: Array.from(row.stolenRoughageSet).sort().join(" | "),
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

function getAmFeedingReportDateKey(timestamp, feedingStartTime = "06:00") {
  const reportDate = new Date(timestamp);
  const feedingStartMinutes = parseTimeInput(feedingStartTime);
  const rowMinutes = reportDate.getHours() * 60 + reportDate.getMinutes();
  if (rowMinutes < feedingStartMinutes) {
    reportDate.setDate(reportDate.getDate() - 1);
  }
  return toDateKey(reportDate);
}

function parseTimeInput(timeText) {
  const [hourText = "6", minuteText = "0"] = String(timeText || "06:00").split(":");
  const hours = Number.parseInt(hourText, 10);
  const minutes = Number.parseInt(minuteText, 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return 6 * 60;
  }
  return hours * 60 + minutes;
}

function formatClockTime(totalMinutes) {
  const minutesInDay = 24 * 60;
  const normalized = ((totalMinutes % minutesInDay) + minutesInDay) % minutesInDay;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const reference = new Date(2000, 0, 1, hours, minutes);
  return reference.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getAmFeedingWindowLabel(feedingStartTime) {
  const feedingStartMinutes = parseTimeInput(feedingStartTime);
  const feedingEndMinutes = feedingStartMinutes - 1;
  return `${formatClockTime(feedingStartMinutes)} through the next day at ${formatClockTime(feedingEndMinutes)}`;
}

function renderPointMarker(series, x, y, key) {
  return renderMarkerShape({
    shape: series.markerShape || "circle",
    key,
    x,
    y,
    size: 6.2,
    color: series.color,
    filled: series.markerFilled !== false,
  });
}

function renderMarkerShape({ shape, key, x, y, size, color, filled }) {
  const commonProps = {
    className: "point",
    stroke: color,
    strokeWidth: filled ? 2.2 : 2.6,
    fill: filled ? color : "#fffdf8",
  };

  if (shape === "square") {
    return <rect key={key} {...commonProps} x={x - size} y={y - size} width={size * 2} height={size * 2} rx="1.5" />;
  }

  if (shape === "diamond") {
    return (
      <polygon
        key={key}
        {...commonProps}
        points={`${x},${y - size} ${x + size},${y} ${x},${y + size} ${x - size},${y}`}
      />
    );
  }

  if (shape === "triangle") {
    return (
      <polygon
        key={key}
        {...commonProps}
        points={`${x},${y - size} ${x + size},${y + size} ${x - size},${y + size}`}
      />
    );
  }

  return <circle key={key} {...commonProps} cx={x} cy={y} r={size} />;
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

function getWeekStart(dateKey) {
  const [yearText, monthText, dayText] = String(dateKey).split("-");
  const reference = new Date(Number(yearText), Number(monthText) - 1, Number(dayText));
  if (Number.isNaN(reference.getTime())) {
    return String(dateKey);
  }
  const dayOfWeek = reference.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  reference.setDate(reference.getDate() + diffToMonday);
  return toDateKey(reference);
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
      const value = point.values && point.values[key];
      if (value === null || value === undefined) {
        return null;
      }
      const y = margin.top + innerHeight - (value / yMax) * innerHeight;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .filter(Boolean)
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
