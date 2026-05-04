"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

const LB_TO_KG = 0.45359237;
const TIME_ZONE = "America/New_York";
const OVERALL_SCOPE = "overall";
const AGGREGATE_PLOT_MODE = "aggregate";
const PER_COW_PLOT_MODE = "per-cow";
const TREATMENT_GROUP_PLOT_MODE = "treatment-groups";
const AS_FED_MODE = "as-fed";
const DMI_MODE = "dmi";
const APOLLO_INTAKE_SOURCE = "apollo";
const SHARED_INTAKE_SOURCE = "shared-folder";
const APOLLO_INTAKE_EXTENSIONS = new Set([".csv"]);
const SHARED_INTAKE_EXTENSIONS = new Set([".csv", ".ods", ".xls", ".xlsx"]);
const SHARED_FOLDER_DAILY_FILE_PATTERN = /^ARV\d{6}\.(csv|ods|xls|xlsx)$/i;
const IGNORE_DIET_ASSOCIATION = "__ignore__";
const WEIGHT_PLOT_COW_MODE = "cow";
const WEIGHT_PLOT_TREATMENT_MODE = "treatment";
const ALL_TREATMENTS = "all-treatments";
const UNLIMITED_COLOR = "#17594a";
const STOLEN_COLOR = "#b14f1f";
const COW_COLORS = ["#17594a", "#a34724", "#1d5d90", "#7b4ab0", "#866000", "#8f2d56"];
const COW_MARKERS = ["circle", "square", "diamond", "triangle"];
const STOLEN_DASH_PATTERNS = ["10 6", "5 4", "14 5 3 5", "2 5"];
const INTAKE_REPORT_FIGURES = [
  { key: "summary", label: "Summary cards" },
  { key: "chart", label: "Current intake chart" },
  { key: "tracked", label: "Selected tracked cow details" },
  { key: "notes", label: "Plot guide notes" },
];
let spreadsheetLibraryPromise;
const GreenFeedDashboard = dynamic(() => import("./GreenFeedDashboard"), { ssr: false });

const emptySummary = {
  rowsLoaded: "0",
  cowsTracked: "0",
  unlimitedDailyAverage: "0.00",
  stolenDailyAverage: "0.00",
  stolenPercent: "0.00%",
  dateSpan: "-",
  treatmentCards: [],
};

export default function Page() {
  const [activeTab, setActiveTab] = useState("intake");
  const [rows, setRows] = useState([]);
  const [mappingRows, setMappingRows] = useState([]);
  const [sharedMappingFile, setSharedMappingFile] = useState(null);
  const [weightRows, setWeightRows] = useState([]);
  const [uploadedTreatmentRows, setUploadedTreatmentRows] = useState([]);
  const [sharedTreatmentFile, setSharedTreatmentFile] = useState(null);
  const [manualTreatmentRows, setManualTreatmentRows] = useState([]);
  const [selectedWeightEartag, setSelectedWeightEartag] = useState("");
  const [selectedTreatment, setSelectedTreatment] = useState(ALL_TREATMENTS);
  const [showOnlyTreatmentCows, setShowOnlyTreatmentCows] = useState(false);
  const [weightPlotMode, setWeightPlotMode] = useState(WEIGHT_PLOT_COW_MODE);
  const [unitMode, setUnitMode] = useState("lbs");
  const [intakeSource, setIntakeSource] = useState(APOLLO_INTAKE_SOURCE);
  const [intakeBasis, setIntakeBasis] = useState(AS_FED_MODE);
  const [viewMode, setViewMode] = useState("day");
  const [analysisScope, setAnalysisScope] = useState(OVERALL_SCOPE);
  const [plotMode, setPlotMode] = useState(AGGREGATE_PLOT_MODE);
  const [selectedCows, setSelectedCows] = useState([]);
  const [selectedTreatmentGroups, setSelectedTreatmentGroups] = useState([]);
  const [dmByRoughage, setDmByRoughage] = useState({});
  const [ignoreNegative, setIgnoreNegative] = useState(true);
  const [amFeedingStartTime, setAmFeedingStartTime] = useState("06:00");
  const [manualTreatmentName, setManualTreatmentName] = useState("");
  const [manualTreatmentStartDate, setManualTreatmentStartDate] = useState("");
  const [manualTreatmentEndDate, setManualTreatmentEndDate] = useState("");
  const [manualTreatmentCowSelection, setManualTreatmentCowSelection] = useState([]);
  const [showManualTreatmentBuilder, setShowManualTreatmentBuilder] = useState(false);
  const [dietAssociations, setDietAssociations] = useState({});
  const [selectedTrackedCow, setSelectedTrackedCow] = useState("");
  const [reportFormat, setReportFormat] = useState("pdf");
  const [reportFigureSelection, setReportFigureSelection] = useState({
    summary: true,
    chart: true,
    tracked: false,
    notes: false,
  });
  const [dayInput, setDayInput] = useState("");
  const [rangeStartInput, setRangeStartInput] = useState("");
  const [rangeEndInput, setRangeEndInput] = useState("");
  const [uploadProgress, setUploadProgress] = useState({ active: false, current: 0, total: 0, label: "" });
  const [statusText, setStatusText] = useState("Choose an intake source and upload one or more files to start.");
  const [chartTitle, setChartTitle] = useState("Waiting for data");
  const [chartData, setChartData] = useState(null);
  const [summary, setSummary] = useState(emptySummary);
  const summarySectionRef = useRef(null);
  const chartSectionRef = useRef(null);
  const trackedSectionRef = useRef(null);
  const notesSectionRef = useRef(null);

  const treatmentRows = useMemo(
    () => [...uploadedTreatmentRows, ...manualTreatmentRows],
    [uploadedTreatmentRows, manualTreatmentRows]
  );
  const sharedFileDiagnostics = useMemo(
    () => buildSharedFileDiagnostics(mappingRows, uploadedTreatmentRows),
    [mappingRows, uploadedTreatmentRows]
  );
  const mappingByTransponder = useMemo(() => buildMappingLookup(mappingRows), [mappingRows]);
  const bodyWeightLookup = useMemo(() => buildBodyWeightLookup(mappingRows), [mappingRows]);
  const treatmentLookup = useMemo(() => buildTreatmentLookup(treatmentRows), [treatmentRows]);
  const dietAssociationOptions = useMemo(
    () => buildDietAssociationOptions(rows, treatmentRows, dietAssociations),
    [rows, treatmentRows, dietAssociations]
  );
  const enrichedRows = useMemo(
    () => enrichRows(rows, mappingByTransponder, treatmentLookup, dietAssociations),
    [rows, mappingByTransponder, treatmentLookup, dietAssociations]
  );
  const processedRows = useMemo(
    () => getProcessedRows(enrichedRows, unitMode, ignoreNegative, intakeBasis, dmByRoughage),
    [enrichedRows, unitMode, ignoreNegative, intakeBasis, dmByRoughage]
  );
  const scopedRows = useMemo(
    () => filterRowsByScope(processedRows, analysisScope),
    [processedRows, analysisScope]
  );
  const filteredRows = useMemo(
    () => filterRowsByDateRange(scopedRows, rangeStartInput, rangeEndInput),
    [scopedRows, rangeStartInput, rangeEndInput]
  );
  const perCowFilteredRows = useMemo(
    () => filterRowsByDateRange(processedRows, rangeStartInput, rangeEndInput),
    [processedRows, rangeStartInput, rangeEndInput]
  );
  const treatmentComparisonRows = useMemo(
    () => filterRowsByDateRange(processedRows, rangeStartInput, rangeEndInput),
    [processedRows, rangeStartInput, rangeEndInput]
  );
  const chartRows = plotMode === PER_COW_PLOT_MODE ? perCowFilteredRows : plotMode === TREATMENT_GROUP_PLOT_MODE ? treatmentComparisonRows : filteredRows;
  const intakeQualityChecks = useMemo(() => buildIntakeQualityChecks(rows), [rows]);
  const roughageOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.roughageType).filter(Boolean))).sort();
  }, [rows]);
  const intakeUnitLabel = intakeBasis === DMI_MODE ? "kg DM" : "kg";
  const intakeLabelText = intakeBasis === DMI_MODE ? "Dry Matter Intake" : "Intake";
  const trackedCows = useMemo(() => buildTrackedCowList(enrichedRows), [enrichedRows]);
  const selectedTrackedCowRecord = useMemo(
    () => trackedCows.find((cow) => cow.eartag === selectedTrackedCow) || trackedCows[0] || null,
    [trackedCows, selectedTrackedCow]
  );
  const linkedWeightRows = useMemo(
    () => enrichWeightRows(weightRows, bodyWeightLookup, treatmentLookup),
    [weightRows, bodyWeightLookup, treatmentLookup]
  );
  const intakeTreatmentOptions = useMemo(() => {
    return Array.from(new Set(treatmentRows.map((row) => row.treatment).filter(Boolean))).sort((a, b) =>
      String(a).localeCompare(String(b))
    );
  }, [treatmentRows]);
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
    if (!trackedCows.length) {
      setSelectedTrackedCow("");
      return;
    }
    if (!selectedTrackedCow || !trackedCows.some((cow) => cow.eartag === selectedTrackedCow)) {
      setSelectedTrackedCow(trackedCows[0].eartag);
    }
  }, [trackedCows, selectedTrackedCow]);

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
      return;
    }
    if (selectedTreatment !== ALL_TREATMENTS && !treatmentOptions.includes(selectedTreatment)) {
      setSelectedTreatment(ALL_TREATMENTS);
    }
  }, [selectedTreatment, treatmentOptions]);

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
      setStatusText("Choose an intake source and upload one or more files to start.");
      setChartData(null);
      return;
    }

    if (!chartRows.length) {
      setSummary(buildSummary(null, filteredRows, viewMode, rangeStartInput, rangeEndInput, plotMode, selectedTreatmentGroups));
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
            chartRows,
            viewMode,
            dayInput,
            rangeStartInput,
            rangeEndInput,
            analysisScope,
            selectedCows,
            intakeUnitLabel,
            intakeLabelText
          )
        : plotMode === TREATMENT_GROUP_PLOT_MODE
          ? buildTreatmentGroupChartData(
            chartRows,
            viewMode,
            dayInput,
            rangeStartInput,
            rangeEndInput,
            analysisScope,
            selectedTreatmentGroups,
            intakeUnitLabel,
            intakeLabelText
          )
        : viewMode === "day"
          ? buildSpecificDaySeries(chartRows, dayInput, analysisScope, intakeUnitLabel, intakeLabelText)
          : viewMode === "range"
            ? buildRangeSummarySeries(chartRows, rangeStartInput, rangeEndInput, analysisScope, intakeUnitLabel, intakeLabelText)
            : buildWeeklyAverageSeries(chartRows, rangeStartInput, rangeEndInput, analysisScope, intakeUnitLabel, intakeLabelText);

    setSummary(
      buildSummary(nextChartData, filteredRows, viewMode, rangeStartInput, rangeEndInput, plotMode, selectedTreatmentGroups)
    );
    setChartTitle(nextChartData.title);
    setStatusText(nextChartData.status);
    setChartData(nextChartData);
  }, [rows.length, filteredRows, chartRows, analysisScope, plotMode, selectedCows, selectedTreatmentGroups, viewMode, dayInput, rangeStartInput, rangeEndInput, intakeUnitLabel, intakeLabelText]);

  function toggleTreatmentGroupSelection(treatment) {
    setSelectedTreatmentGroups((current) => {
      if (current.includes(treatment)) {
        return current.filter((item) => item !== treatment);
      }
      if (current.length >= 4) {
        setStatusText("Select up to 4 treatment groups at a time for comparison.");
        return current;
      }
      return [...current, treatment];
    });
  }
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
    const source = event.currentTarget.dataset.source || intakeSource;
    const selectedFiles = Array.from(event.target.files || []);
    const isFolderUpload = selectedFiles.some((file) => file.webkitRelativePath);
    const files = filterSupportedIntakeFiles(selectedFiles, source, isFolderUpload);
    if (!files.length) {
      setStatusText(isFolderUpload ? "No ARVYYMMDD daily intake files were found in that folder." : "No supported intake files were found. Use CSV for Apollo, or ODS/XLS/XLSX/CSV for Daily Intake folders.");
      event.target.value = "";
      return;
    }

    setIntakeSource(source);
    if (source === SHARED_INTAKE_SOURCE) {
      setUnitMode("kg");
    }
    setUploadProgress({ active: true, current: 0, total: files.length, label: "Preparing files" });
    setStatusText(`Reading ${files.length} intake file(s)...`);

    try {
      const parsedGroups = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setUploadProgress({ active: true, current: index + 1, total: files.length, label: file.name });
        const parsed = (await parseIntakeFile(file, source))
          .map((row) => mapIntakeRow(row, file.name, source, getDateKeyFromDailyIntakeFileName(file.name)))
          .filter(Boolean);
        parsedGroups.push(parsed);
      }

      const mergedRows = parsedGroups
        .flat()
        .sort((a, b) => a.timestamp - b.timestamp);

      setRows(mergedRows);
      setDmByRoughage({});
      seedDateInputs(mergedRows, setDayInput, setRangeStartInput, setRangeEndInput);
      setStatusText(`Combined ${mergedRows.length} rows from ${files.length} daily intake file(s).`);
    } catch (error) {
      setRows([]);
      setChartData(null);
      setSummary(emptySummary);
      setChartTitle("Waiting for data");
      setStatusText(`Error: ${error.message}`);
    } finally {
      setUploadProgress((current) => ({ ...current, active: false }));
      event.target.value = "";
    }
  }

  async function handleMappingUpload(event) {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }
    setSharedMappingFile(file);

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
    setSharedTreatmentFile(file);

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

  function handleDownloadCombinedIntakeCsv() {
    if (!enrichedRows.length) {
      setStatusText("Upload intake files first so the app can combine them.");
      return;
    }

    const exportRows = enrichedRows
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((row) => ({
        Cow: row.eartag || "",
        "EID(or Transponder)": row.transponder || "",
        Station: row.station || "",
        Unlimited: row.unlimited ? "TRUE" : "FALSE",
        Stolen: row.stolen ? "TRUE" : "FALSE",
        "Start time": row.startTimeRaw || formatDateTimeForCsv(row.timestamp),
        "End time": row.endTimeRaw || "",
        "Seconds Spent Eating": row.secondsSpentEating || "",
        "Start weight (kg)": row.startWeightKg || "",
        "End weight (kg)": row.endWeightKg || "",
        "Intake (kg)": row.intakeRaw,
        "Roughage type": row.roughageType || "",
        "Source file": row.sourceFile || "",
      }));

    const csv = toCsv(exportRows, [
      "Cow",
      "EID(or Transponder)",
      "Station",
      "Unlimited",
      "Stolen",
      "Start time",
      "End time",
      "Seconds Spent Eating",
      "Start weight (kg)",
      "End weight (kg)",
      "Intake (kg)",
      "Roughage type",
      "Source file",
    ]);

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "combined_daily_intake.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatusText(`Downloaded combined daily intake CSV with ${exportRows.length} rows.`);
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

  function toggleReportFigureSelection(key) {
    setReportFigureSelection((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  async function handleDownloadVisualReport() {
    const selectedFigureKeys = INTAKE_REPORT_FIGURES.filter((figure) => reportFigureSelection[figure.key]).map(
      (figure) => figure.key
    );

    if (!selectedFigureKeys.length) {
      setStatusText("Select at least one figure to include in the report export.");
      return;
    }

    const sectionDefinitions = [
      {
        key: "summary",
        title: "Summary cards",
        element: summarySectionRef.current,
        include: Boolean(reportFigureSelection.summary),
      },
      {
        key: "chart",
        title: chartTitle || "Current intake chart",
        element: chartSectionRef.current,
        include: Boolean(reportFigureSelection.chart),
      },
      {
        key: "tracked",
        title: "Selected tracked cow details",
        element: trackedSectionRef.current,
        include: Boolean(reportFigureSelection.tracked) && Boolean(trackedCows.length),
      },
      {
        key: "notes",
        title: "Plot guide notes",
        element: notesSectionRef.current,
        include: Boolean(reportFigureSelection.notes),
      },
    ].filter((section) => section.include && section.element);

    if (!sectionDefinitions.length) {
      setStatusText("The selected report figures are not available yet. Upload data or choose another figure.");
      return;
    }

    const reportBaseName = slugifyFileName(`${chartTitle || "intake-report"}-${rangeStartInput || "start"}-${rangeEndInput || "end"}`);

    if (reportFormat === "html") {
      const htmlReport = buildInteractiveHtmlReport({
        chartTitle,
        chartData,
        summary,
        intakeUnitLabel,
        intakeLabelText,
        statusText,
        substatusText: `Intake files loaded: ${rows.length ? countDistinct(rows, "sourceFile") : 0} | Roughage types: ${roughageOptions.length} | Mapping rows: ${mappingRows.length} | Treatment rows: ${treatmentRows.length} | Basis: ${intakeLabelText}`,
        selectedFigures: selectedFigureKeys,
        selectedTrackedCowRecord,
        analysisSummary: buildIntakeAnalysisSummary({
          viewMode,
          plotMode,
          analysisScope,
          selectedCows,
          selectedTreatmentGroups,
          rangeStartInput,
          rangeEndInput,
          dayInput,
        }),
      });

      downloadTextFile(`${reportBaseName}.html`, htmlReport, "text/html");
      setStatusText(`Downloaded interactive HTML report with ${sectionDefinitions.length} figure section(s).`);
      return;
    }

    try {
      const [{ toPng }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const pageMargin = 36;
      const contentWidth = pageWidth - pageMargin * 2;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.text("Daily Intake Report", pageMargin, 34);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text(
        `Exported ${new Date().toLocaleString("en-US", { timeZone: TIME_ZONE })} | ${chartTitle || "Current intake chart"}`,
        pageMargin,
        52
      );
      pdf.text(`Figures: ${sectionDefinitions.map((section) => section.title).join(", ")}`, pageMargin, 68, {
        maxWidth: contentWidth,
      });

      let isFirstSection = true;

      for (const section of sectionDefinitions) {
        if (!isFirstSection) {
          pdf.addPage();
        }

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(14);
        pdf.text(section.title, pageMargin, 32);

        const dataUrl = await toPng(section.element, {
          cacheBust: true,
          pixelRatio: 2,
          backgroundColor: "#fffdf8",
        });
        const imageSize = await getImageSize(dataUrl);
        const scale = Math.min(contentWidth / imageSize.width, (pageHeight - 88) / imageSize.height);
        const renderWidth = imageSize.width * scale;
        const renderHeight = imageSize.height * scale;
        pdf.addImage(dataUrl, "PNG", pageMargin, 44, renderWidth, renderHeight, undefined, "FAST");
        isFirstSection = false;
      }

      pdf.save(`${reportBaseName}.pdf`);
      setStatusText(`Downloaded PDF report with ${sectionDefinitions.length} figure section(s).`);
    } catch (error) {
      console.error(error);
      setStatusText("The PDF export could not be created. Try the HTML report or refresh the page and try again.");
    }
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
      <section className="panel shared-files-panel">
        <div className="workflow-section-header">
          <div>
            <div className="workflow-section-title"><strong>Shared files</strong></div>
            <p>Upload these once. Intake, Body Weights, and GreenFeed will use the same cow lookup and treatment assignments.</p>
          </div>
        </div>
        <div className="control-grid shared-files-grid">
          <label className="field">
            <span>Upload transponder to eartag lookup</span>
            <input type="file" accept=".csv,text/csv" onChange={handleMappingUpload} />
          </label>
          <label className="field">
            <span>Upload EART to treatment file</span>
            <input type="file" accept=".xls,.xlsx,.csv,text/csv" onChange={handleTreatmentUpload} />
          </label>
          <div className="shared-file-status">
            <span>Total lookup rows: <strong>{sharedFileDiagnostics.lookupRowCount}</strong></span>
            <span>Total treatment rows: <strong>{sharedFileDiagnostics.treatmentRowCount}</strong></span>
            <span>Treatment cows matched to lookup: <strong>{sharedFileDiagnostics.matchLabel}</strong></span>
          </div>
          {sharedFileDiagnostics.treatmentSummaries.length ? (
            <div className="shared-treatment-summary">
              {sharedFileDiagnostics.treatmentSummaries.map((item) => (
                <span key={item.treatment}>
                  {item.treatment}: <strong>{item.cowCount}</strong> cow(s)
                </span>
              ))}
            </div>
          ) : null}
          {sharedFileDiagnostics.unmatchedTreatmentCows.length ? (
            <div className="shared-match-warning">
              Missing from lookup: {sharedFileDiagnostics.unmatchedTreatmentCowsLabel}
            </div>
          ) : null}
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
          <button
            type="button"
            className={`tab-button ${activeTab === "greenfeed" ? "tab-button-active" : ""}`}
            onClick={() => setActiveTab("greenfeed")}
          >
            GreenFeed
          </button>
        </div>
      </section>

      {activeTab === "intake" ? (
        <>
      <section className="panel controls">
        <div className="workflow-section">
          <div className="workflow-section-header">
            <div>
              <div className="workflow-section-title"><strong>Files</strong></div>
              <p>Choose the intake source and upload the files needed for matching cows, treatments, and intakes.</p>
            </div>
          </div>
          <div className="control-grid">
            <div className="field field-wide">
              <span>Intake file source</span>
              <div className="source-choice-row">
                <button
                  type="button"
                  className={`source-choice ${intakeSource === APOLLO_INTAKE_SOURCE ? "source-choice-active" : ""}`}
                  onClick={() => setIntakeSource(APOLLO_INTAKE_SOURCE)}
                >
                  Apollo CSV files
                </button>
                <button
                  type="button"
                  className={`source-choice ${intakeSource === SHARED_INTAKE_SOURCE ? "source-choice-active" : ""}`}
                  onClick={() => {
                    setIntakeSource(SHARED_INTAKE_SOURCE);
                    setUnitMode("kg");
                  }}
                >
                  Daily Intake Folder
                </button>
              </div>
            </div>

            {intakeSource === APOLLO_INTAKE_SOURCE ? (
              <label className="field field-wide">
                <span>Upload Apollo intake CSV files</span>
                <input type="file" accept=".csv,text/csv" multiple data-source={APOLLO_INTAKE_SOURCE} onChange={handleIntakeUpload} />
              </label>
            ) : (
              <label className="field field-wide">
                <span>Upload a Daily Intake folder</span>
                <input
                  type="file"
                  accept=".ods,.xls,.xlsx,.csv,text/csv,application/vnd.oasis.opendocument.spreadsheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  multiple
                  directory=""
                  webkitdirectory=""
                  data-source={SHARED_INTAKE_SOURCE}
                  onChange={handleIntakeUpload}
                />
              </label>
            )}

            {uploadProgress.active ? (
              <div className="field field-wide upload-progress-panel">
                <span>{uploadProgress.label}</span>
                <div className="upload-progress-track">
                  <div
                    className="upload-progress-fill"
                    style={{ width: `${uploadProgress.total ? (uploadProgress.current / uploadProgress.total) * 100 : 0}%` }}
                  />
                </div>
                <p>{uploadProgress.current} of {uploadProgress.total} file(s)</p>
              </div>
            ) : null}

          </div>
        </div>

        {dietAssociationOptions.treatments.length && dietAssociationOptions.roughageTypes.length ? (
          <div className="workflow-section">
            <div className="workflow-section-header">
              <div>
                <div className="workflow-section-title"><strong>Treatment roughage map</strong></div>
                <p>Match each detected treatment to its assigned roughage type, or ignore treatments that should not classify intake.</p>
              </div>
              <span className={`association-status ${dietAssociationOptions.pendingTreatments.length ? "association-status-warning" : ""}`}>
                {dietAssociationOptions.pendingTreatments.length
                  ? `${dietAssociationOptions.pendingTreatments.length} pending`
                  : "All set"}
              </span>
            </div>
            <div className="diet-association-panel">
              <div className="diet-association-grid">
                {dietAssociationOptions.treatments.map((treatment) => (
                  <label key={`diet-association-${treatment}`} className="field">
                    <span>Treatment {treatment}</span>
                    <select
                      value={dietAssociations[treatment] || ""}
                      onChange={(event) =>
                        setDietAssociations((current) => ({
                          ...current,
                          [treatment]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select roughage type</option>
                      {dietAssociationOptions.roughageTypes.map((roughageType) => (
                        <option key={`${treatment}-${roughageType}`} value={roughageType}>
                          {roughageType}
                        </option>
                      ))}
                      <option value={IGNORE_DIET_ASSOCIATION}>Ignore this treatment</option>
                    </select>
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="workflow-section">
          <div className="workflow-section-header">
            <div>
              <div className="workflow-section-title"><strong>Manual treatment assignment</strong></div>
              <p>
                {uploadedTreatmentRows.length
                  ? "Treatment file loaded. Manual treatment assignment is optional."
                  : "Upload a treatment file or manually assign a treatment to selected cows for an optional date range."}
              </p>
            </div>
            <label className="field checkbox-field compact-checkbox-field manual-assignment-toggle">
              <input
                type="checkbox"
                checked={showManualTreatmentBuilder}
                onChange={(event) => setShowManualTreatmentBuilder(event.target.checked)}
              />
              <span>Add manual treatment assignment</span>
            </label>
          </div>
          <div className="treatment-builder">
            {showManualTreatmentBuilder ? (
              manualTreatmentCowOptions.length ? (
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
                  Upload the EART to treatment file first so the app has a cow list for manual treatment entry.
                </div>
              )
            ) : null}
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
        </div>

        <div className="workflow-section">
          <div className="workflow-section-header">
            <div>
              <div className="workflow-section-title"><strong>Filtering and plot controls</strong></div>
              <p>After treatment setup, choose the animals or treatments to include and control how the plot is summarized.</p>
            </div>
          </div>
          <div className="control-grid">
            <div className="filter-group field-wide">
              <div className="filter-group-header"><strong>Data setup</strong></div>
              <div className="filter-group-grid">
                <label className="field">
                  <span>Source unit for intake values</span>
                  <select value={unitMode} onChange={(event) => setUnitMode(event.target.value)}>
                    <option value="lbs">Intake values are in lbs, convert to kg</option>
                    <option value="kg">Intake values are already in kg</option>
                  </select>
                </label>
                <label className="field">
                  <span>Intake display</span>
                  <select value={intakeBasis} onChange={(event) => setIntakeBasis(event.target.value)}>
                    <option value={AS_FED_MODE}>As-fed intake</option>
                    <option value={DMI_MODE}>Dry Matter Intake</option>
                  </select>
                </label>
                <label className="field checkbox-field compact-checkbox-field">
                  <input
                    type="checkbox"
                    checked={ignoreNegative}
                    onChange={(event) => setIgnoreNegative(event.target.checked)}
                  />
                  <span>Ignore negative intake values</span>
                </label>
              </div>
            </div>

            <div className="filter-group field-wide">
              <div className="filter-group-header"><strong>View filters</strong></div>
              <div className="filter-group-grid filter-group-grid-two">
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
              </div>
            </div>

            <div className="filter-group field-wide">
              <div className="filter-group-header"><strong>Plot controls</strong></div>
              <div className="filter-group-grid">
                <label className="field">
                  <span>Plot mode</span>
                  <select value={viewMode} onChange={(event) => setViewMode(event.target.value)}>
                    <option value="day">Specific day</option>
                    <option value="range">Day range summary</option>
                    <option value="weekly">Weekly average of daily summaries</option>
                  </select>
                </label>
                <label className="field">
                  <span>Plot style</span>
                  <select value={plotMode} onChange={(event) => setPlotMode(event.target.value)}>
                    <option value={AGGREGATE_PLOT_MODE}>Combined lines</option>
                    <option value={PER_COW_PLOT_MODE}>Per-cow comparison</option>
                    <option value={TREATMENT_GROUP_PLOT_MODE}>Treatment group comparison</option>
                  </select>
                </label>
                {viewMode === "day" ? (
                  <label className="field">
                    <span>Specific day</span>
                    <input
                      type="date"
                      value={dayInput}
                      onChange={(event) => setDayInput(event.target.value)}
                    />
                  </label>
                ) : (
                  <>
                    <label className="field">
                      <span>Range start</span>
                      <input
                        type="date"
                        value={rangeStartInput}
                        onChange={(event) => setRangeStartInput(event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Range end</span>
                      <input
                        type="date"
                        value={rangeEndInput}
                        onChange={(event) => setRangeEndInput(event.target.value)}
                      />
                    </label>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {intakeQualityChecks.hasRows ? (
          <div className="workflow-section">
            <div className="workflow-section-header">
              <div>
                <div className="workflow-section-title"><strong>Date quality</strong></div>
                <p>Review the detected upload range, missing days, and choose the date window for the analysis.</p>
              </div>
            </div>
            <div className="quality-panel">
              <div className="quality-header">
                <div>
                  <strong>Intake quality checks</strong>
                  <p>Detected uploaded dates from {intakeQualityChecks.firstDate} to {intakeQualityChecks.lastDate}</p>
                </div>
                <div className={`quality-badge ${intakeQualityChecks.missingDates.length ? "quality-badge-warning" : ""}`}>
                  {intakeQualityChecks.missingDates.length ? `${intakeQualityChecks.missingDates.length} missing day(s)` : "No missing days"}
                </div>
              </div>
              <div className="quality-grid">
                <div className="quality-stat">
                  <span>Date range</span>
                  <strong>{intakeQualityChecks.dateRangeLabel}</strong>
                </div>
                <div className="quality-stat">
                  <span>Days identified</span>
                  <strong>{intakeQualityChecks.observedDayCount} of {intakeQualityChecks.expectedDayCount}</strong>
                </div>
                <div className="quality-stat quality-stat-wide">
                  <span>Missing days</span>
                  <strong>{intakeQualityChecks.missingDateLabel}</strong>
                </div>
              </div>
              <div className="quality-filter-row">
                <label className="field">
                  <span>Show from</span>
                  <input type="date" value={rangeStartInput} onChange={(event) => setRangeStartInput(event.target.value)} />
                </label>
                <label className="field">
                  <span>Show through</span>
                  <input type="date" value={rangeEndInput} onChange={(event) => setRangeEndInput(event.target.value)} />
                </label>
                <button
                  className="action-button action-button-secondary"
                  type="button"
                  onClick={() => {
                    setRangeStartInput(intakeQualityChecks.firstDate);
                    setRangeEndInput(intakeQualityChecks.lastDate);
                    setViewMode("range");
                  }}
                >
                  Use full detected range
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {intakeBasis === DMI_MODE && roughageOptions.length ? (
          <div className="workflow-section">
            <div className="workflow-section-header">
              <div>
                <div className="workflow-section-title"><strong>Dry matter setup</strong></div>
                <p>Enter the dry matter percent for each roughage type when viewing Dry Matter Intake.</p>
              </div>
            </div>
            <div className="dm-panel">
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
            className="action-button action-button-secondary"
            type="button"
            onClick={handleDownloadCombinedIntakeCsv}
          >
            Download Combined Daily Intake CSV
          </button>
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
        <div className="workflow-section report-export-panel">
          <div className="workflow-section-header">
            <div>
              <div className="workflow-section-title"><strong>Report export</strong></div>
              <p>Choose a PDF or interactive HTML report and pick which figures from the Intake tab to include.</p>
            </div>
          </div>
          <div className="report-export-grid">
            <label className="field">
              <span>Report format</span>
              <select value={reportFormat} onChange={(event) => setReportFormat(event.target.value)}>
                <option value="pdf">PDF report</option>
                <option value="html">Interactive HTML report</option>
              </select>
            </label>
            <div className="field field-wide">
              <span>Figures to include</span>
              <div className="report-figure-grid">
                {INTAKE_REPORT_FIGURES.map((figure) => (
                  <label key={figure.key} className="checkbox-field compact-checkbox-field report-figure-option">
                    <input
                      type="checkbox"
                      checked={Boolean(reportFigureSelection[figure.key])}
                      onChange={() => toggleReportFigureSelection(figure.key)}
                    />
                    <span>{figure.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="report-export-actions">
            <button className="action-button" type="button" onClick={handleDownloadVisualReport}>
              {reportFormat === "html" ? "Download Interactive HTML Report" : "Download PDF Report"}
            </button>
            <p className="report-export-note">
              HTML keeps hoverable chart points. PDF captures the current Intake tab view as a fixed report.
            </p>
          </div>
        </div>
      </section>

      <section ref={summarySectionRef} className="stats-grid stats-grid-wide">
        <article className="panel stat-card">
          <span className="stat-label">Rows loaded</span>
          <strong>{summary.rowsLoaded}</strong>
        </article>
        <article className="panel stat-card">
          <span className="stat-label">Cows tracked</span>
          <strong>{summary.cowsTracked}</strong>
        </article>
        {summary.treatmentCards.length ? (
          summary.treatmentCards.map((card) => (
            <article key={card.treatment} className="panel stat-card stat-card-treatment">
              <span className="stat-label">Treatment {card.treatment}</span>
              <strong>{card.unlimitedDailyAverage} {intakeUnitLabel}</strong>
              <p className="stat-card-detail">Unlimited daily avg</p>
              <p className="stat-card-detail">Stolen daily avg: {card.stolenDailyAverage} {intakeUnitLabel}</p>
            </article>
          ))
        ) : (
          <>
            <article className="panel stat-card">
              <span className="stat-label">Unlimited daily avg ({intakeUnitLabel})</span>
              <strong>{summary.unlimitedDailyAverage}</strong>
            </article>
            <article className="panel stat-card">
              <span className="stat-label">Stolen daily avg ({intakeUnitLabel})</span>
              <strong>{summary.stolenDailyAverage}</strong>
            </article>
            <article className="panel stat-card">
              <span className="stat-label">Stolen % of daily intake</span>
              <strong>{summary.stolenPercent}</strong>
            </article>
          </>
        )}
        <article className="panel stat-card">
          <span className="stat-label">Date span</span>
          <strong>{summary.dateSpan}</strong>
        </article>
      </section>

      <section ref={chartSectionRef} className="panel chart-panel">
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

        {plotMode === TREATMENT_GROUP_PLOT_MODE ? (
          <div className="cow-picker">
            <div className="cow-picker-copy">
              Pick up to 4 treatment groups. Each treatment keeps one color, with solid for unlimited and dashed for stolen.
            </div>
            <div className="cow-chip-grid">
              {intakeTreatmentOptions.map((treatment) => {
                const isSelected = selectedTreatmentGroups.includes(treatment);
                return (
                  <button
                    key={`pick-treatment-${treatment}`}
                    type="button"
                    className={`cow-chip ${isSelected ? "cow-chip-selected" : ""}`}
                    onClick={() => toggleTreatmentGroupSelection(treatment)}
                  >
                    {treatment}
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

      <section ref={trackedSectionRef} className="panel tracked-panel">
        <div className="tracked-header">
          <div>
            <p className="eyebrow">Tracked Cows</p>
            <h3>Each cow tracked by eartag and linked EID</h3>
          </div>
          <p className="tracked-count">{trackedCows.length} cows</p>
        </div>
        {trackedCows.length ? (
          <div className="tracked-browser">
            <label className="field tracked-select">
              <span>Select cow</span>
              <select value={selectedTrackedCowRecord?.eartag || ""} onChange={(event) => setSelectedTrackedCow(event.target.value)}>
                {trackedCows.map((cow) => (
                  <option key={`${cow.eartag}-${cow.transponder}`} value={cow.eartag}>
                    {cow.eartag}
                  </option>
                ))}
              </select>
            </label>
            {selectedTrackedCowRecord ? (
              <article className="tracked-card tracked-card-single">
                <span className="tracked-label">Eartag</span>
                <strong>{selectedTrackedCowRecord.eartag}</strong>
                <span className="tracked-meta">EID / transponder: {selectedTrackedCowRecord.transponder}</span>
                <span className="tracked-meta">Rows: {selectedTrackedCowRecord.rowCount}</span>
              </article>
            ) : null}
          </div>
        ) : (
          <div className="empty-inline">
            Upload intake files and optionally the EART/EID lookup file to see tracked cows here.
          </div>
        )}
      </section>

      <section ref={notesSectionRef} className="panel notes">
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
      ) : activeTab === "weights" ? (
        <>
      <section className="panel controls">
        <div className="control-grid">
          <label className="field field-wide">
            <span>Upload body-weight file</span>
            <input type="file" accept=".xls,.xlsx,.csv,text/csv" onChange={handleWeightUpload} />
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
      ) : (
        <GreenFeedDashboard mvhFile={sharedMappingFile} treatmentFile={sharedTreatmentFile} />
      )}
    </main>
  );
}

function Chart({ chartData }) {
  const { points, series, title, unitLabel } = chartData;
  const [hoveredPoint, setHoveredPoint] = useState(null);
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
        .map((item) => {
          const value = point.values[item.key];
          const error = point.errors?.[item.key] || 0;
          return value === null || value === undefined ? null : value + error;
        })
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
  const tooltipWidth = 210;
  const tooltipRowHeight = 21;
  const tooltipHeight = hoveredPoint ? 38 + hoveredPoint.rows.length * tooltipRowHeight : 0;
  const tooltipX = hoveredPoint ? Math.min(width - margin.right - tooltipWidth, Math.max(margin.left, hoveredPoint.x + 14)) : 0;
  const tooltipY = hoveredPoint ? Math.max(margin.top, hoveredPoint.y - tooltipHeight - 12) : 0;

  return (
    <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} onMouseLeave={() => setHoveredPoint(null)}>
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
          const error = point.errors?.[item.key];
          if (value === null || value === undefined || !Number.isFinite(error) || error <= 0) {
            return null;
          }
          const yTop = margin.top + innerHeight - ((value + error) / yMax) * innerHeight;
          const yBottom = margin.top + innerHeight - (Math.max(0, value - error) / yMax) * innerHeight;
          return (
            <g key={`error-${item.key}-${point.label}-${index}`} className="error-bar" stroke={item.color}>
              <line x1={x} y1={yTop} x2={x} y2={yBottom} />
              <line x1={x - 5} y1={yTop} x2={x + 5} y2={yTop} />
              <line x1={x - 5} y1={yBottom} x2={x + 5} y2={yBottom} />
            </g>
          );
        })
      )}
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
        const x = margin.left + (points.length > 1 ? xStep * index : innerWidth / 2);
        const rows = series
          .map((item) => ({
            key: item.key,
            label: item.label,
            color: item.color,
            value: point.values[item.key],
            error: point.errors?.[item.key],
          }))
          .filter((row) => row.value !== null && row.value !== undefined);
        if (!rows.length) {
          return null;
        }
        const topValue = Math.max(...rows.map((row) => row.value));
        const y = margin.top + innerHeight - (topValue / yMax) * innerHeight;
        return (
          <circle
            key={`hit-${point.label}-${index}`}
            className="chart-hit-target"
            cx={x}
            cy={y}
            r="18"
            tabIndex="0"
            aria-label={`${point.label}: ${rows.map((row) => `${row.label} ${formatNumber(row.value)} ${unitLabel || "kg"}`).join(", ")}`}
            onMouseEnter={() => setHoveredPoint({ label: point.label, x, y, rows })}
            onFocus={() => setHoveredPoint({ label: point.label, x, y, rows })}
          />
        );
      })}

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

      {hoveredPoint ? (
        <g className="chart-tooltip" pointerEvents="none">
          <line className="tooltip-guide" x1={hoveredPoint.x} y1={margin.top} x2={hoveredPoint.x} y2={margin.top + innerHeight} />
          <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx="8" />
          <text className="tooltip-title" x={tooltipX + 12} y={tooltipY + 22}>
            {formatXAxisLabel(hoveredPoint.label, false)}
          </text>
          {hoveredPoint.rows.map((row, rowIndex) => (
            <g key={`tooltip-${row.key}`}>
              <circle cx={tooltipX + 14} cy={tooltipY + 42 + rowIndex * tooltipRowHeight} r="4" fill={row.color} />
              <text x={tooltipX + 24} y={tooltipY + 46 + rowIndex * tooltipRowHeight}>
                {row.label}: {formatNumber(row.value)} {unitLabel || "kg"}{Number.isFinite(row.error) ? ` +/- ${formatNumber(row.error)} SE` : ""}
              </text>
            </g>
          ))}
        </g>
      ) : null}
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

function filterSupportedIntakeFiles(files, intakeSource, isFolderUpload = false) {
  const supportedExtensions = intakeSource === APOLLO_INTAKE_SOURCE ? APOLLO_INTAKE_EXTENSIONS : SHARED_INTAKE_EXTENSIONS;
  return files.filter((file) => {
    if (!supportedExtensions.has(getFileExtension(file.name))) {
      return false;
    }
    return !(isFolderUpload && intakeSource === SHARED_INTAKE_SOURCE) || SHARED_FOLDER_DAILY_FILE_PATTERN.test(file.name);
  });
}

function getDateKeyFromDailyIntakeFileName(fileName) {
  const match = String(fileName || "").match(/^ARV(\d{2})(\d{2})(\d{2})\./i);
  if (!match) {
    return "";
  }
  const [, year, month, day] = match;
  return `20${year}-${month}-${day}`;
}

function getFileExtension(fileName) {
  const dotIndex = String(fileName || "").lastIndexOf(".");
  return dotIndex >= 0 ? String(fileName).slice(dotIndex).toLowerCase() : "";
}
function parseDelimitedRows(text) {
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
      if (row.some((value) => String(value).trim() !== "")) {
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

  return rows.map((cells) => cells.map((cell) => String(cell || "").trim()));
}

function parseCsv(text) {
  return rowsToObjects(parseDelimitedRows(text));
}

function rowsToObjects(rows) {
  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map((header) => String(header || "").trim());
  return rows.slice(1).map((cells) => {
    const entry = {};
    headers.forEach((header, index) => {
      if (header) {
        entry[header] = cells[index] ?? "";
      }
    });
    return entry;
  });
}

async function parseIntakeFile(file, intakeSource) {
  if (intakeSource === APOLLO_INTAKE_SOURCE) {
    const rows = await parseSpreadsheetFile(file);
    return rows;
  }

  const rows = await parseSpreadsheetRows(file);
  if (!rows.length) {
    return [];
  }

  if (looksLikeSharedFolderHeader(rows[0])) {
    return rowsToObjects(rows);
  }

  return rows.map(mapSharedFolderIntakeCells);
}

async function parseSpreadsheetRows(file) {
  if (file.name.toLowerCase().endsWith(".csv")) {
    const text = await file.text();
    return parseDelimitedRows(text);
  }

  const XLSX = await loadSpreadsheetLibrary();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const firstSheet = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheet];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
}

function looksLikeSharedFolderHeader(cells) {
  const normalizedHeaders = cells.map((cell) => normalizeHeader(cell));
  return normalizedHeaders.includes("cow") && normalizedHeaders.some((header) => header.includes("transponder"));
}

async function loadSpreadsheetLibrary() {
  if (!spreadsheetLibraryPromise) {
    spreadsheetLibraryPromise = import("xlsx");
  }
  return spreadsheetLibraryPromise;
}

function mapSharedFolderIntakeCells(cells) {
  return {
    Cow: cells[0] ?? "",
    "EID(or Transponder)": cells[1] ?? "",
    Station: cells[3] ?? "",
    "Start time": cells[5] ?? "",
    "End time": cells[6] ?? "",
    "Seconds Spent Eating": cells[7] ?? "",
    "Start weight (kg)": cells[8] ?? "",
    "End weight (kg)": cells[9] ?? "",
    "Intake (kg)": cells[10] ?? "",
    "Roughage type": cells[13] ?? "",
  };
}

async function parseSpreadsheetFile(file) {
  if (file.name.toLowerCase().endsWith(".csv")) {
    const text = await file.text();
    return parseCsv(text);
  }

  const XLSX = await loadSpreadsheetLibrary();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const firstSheet = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheet];
  return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
}

function mapIntakeRow(row, sourceFile, intakeSource = APOLLO_INTAKE_SOURCE, sourceDateKey = "") {
  const normalizedRow = normalizeRowKeys(row);
  const startTime = pickRowValue(row, normalizedRow, ["Start time", "start time", "starttime"]);
  const intakeRaw = Number.parseFloat(pickRowValue(row, normalizedRow, ["Intake (kg)", "intake (kg)", "intake", "intakekg"]));
  if (!startTime || Number.isNaN(intakeRaw)) {
    return null;
  }

  const timestamp = parseDateTime(startTime, intakeSource === SHARED_INTAKE_SOURCE ? sourceDateKey : "");
  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  const transponder = String(
    pickRowValue(row, normalizedRow, [
      "Transponder",
      "transponder",
      "EID(or Transponder)",
      "eid(or transponder)",
      "eid",
      "eid or transponder",
    ]) || ""
  ).trim();
  const cow = String(pickRowValue(row, normalizedRow, ["Cow", "cow", "eartag", "ear tag"]) || "").trim();
  const roughageType = String(pickRowValue(row, normalizedRow, ["Roughage type", "roughage type", "roughagetype"]) || "").trim();

  return {
    timestamp,
    dateKey: toDateKey(timestamp),
    timeLabel: formatTime(timestamp),
    timeBucketKey: formatTimeBucket(timestamp),
    unlimited: intakeSource === SHARED_INTAKE_SOURCE ? false : normalizeBoolean(pickRowValue(row, normalizedRow, ["Unlimited", "unlimited"])),
    stolen: intakeSource === SHARED_INTAKE_SOURCE ? false : normalizeBoolean(pickRowValue(row, normalizedRow, ["Stolen", "stolen"])),
    intakeRaw,
    roughageType,
    transponder,
    station: String(pickRowValue(row, normalizedRow, ["Station", "station"]) || "").trim(),
    startTimeRaw: startTime,
    endTimeRaw: pickRowValue(row, normalizedRow, ["End time", "end time", "endtime"]),
    secondsSpentEating: pickRowValue(row, normalizedRow, ["Seconds Spent Eating", "seconds spent eating", "secondsspenteating"]),
    startWeightKg: pickRowValue(row, normalizedRow, ["Start weight (kg)", "start weight (kg)", "startweightkg"]),
    endWeightKg: pickRowValue(row, normalizedRow, ["End weight (kg)", "end weight (kg)", "endweightkg"]),
    eartag: cow || transponder || "Unknown",
    sourceFile,
    intakeSource,
  };
}

function pickRowValue(row, normalizedRow, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== "") {
      return row[key];
    }
    const normalizedKey = normalizeHeader(key);
    if (Object.prototype.hasOwnProperty.call(normalizedRow, normalizedKey) && normalizedRow[normalizedKey] !== "") {
      return normalizedRow[normalizedKey];
    }
  }
  return "";
}

function normalizeComparableText(value) {
  return String(value || "").trim().toLowerCase();
}

function treatmentMatchesRoughage(treatment, roughageType) {
  const normalizedTreatment = normalizeComparableText(treatment);
  const normalizedRoughage = normalizeComparableText(roughageType);
  if (!normalizedTreatment || !normalizedRoughage) {
    return false;
  }
  return normalizedRoughage === normalizedTreatment || normalizedRoughage.endsWith(normalizedTreatment);
}

function resolveAssociatedRoughage(treatment, dietAssociations, roughageTypes) {
  const explicitAssociation = dietAssociations[treatment];
  if (explicitAssociation === IGNORE_DIET_ASSOCIATION) {
    return "";
  }
  if (explicitAssociation) {
    return explicitAssociation;
  }
  return roughageTypes.find((roughageType) => treatmentMatchesRoughage(treatment, roughageType)) || treatment;
}
function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
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

function buildSharedFileDiagnostics(mappingRows, treatmentRows) {
  const lookupCowIds = new Set(mappingRows.map((row) => normalizeComparableText(row.cowId)).filter(Boolean));
  const treatmentCowIds = new Set(treatmentRows.map((row) => normalizeComparableText(row.eartag)).filter(Boolean));
  const unmatchedTreatmentCows = Array.from(treatmentCowIds)
    .filter((cow) => !lookupCowIds.has(cow))
    .sort((a, b) => String(a).localeCompare(String(b)));
  const byTreatment = new Map();

  treatmentRows.forEach((row) => {
    const treatment = row.treatment || "Unassigned";
    if (!byTreatment.has(treatment)) {
      byTreatment.set(treatment, new Set());
    }
    if (row.eartag) {
      byTreatment.get(treatment).add(String(row.eartag));
    }
  });

  const treatmentSummaries = Array.from(byTreatment.entries())
    .map(([treatment, cows]) => ({ treatment, cowCount: cows.size }))
    .sort((a, b) => String(a.treatment).localeCompare(String(b.treatment)));
  const matchedCount = treatmentCowIds.size - unmatchedTreatmentCows.length;

  return {
    lookupRowCount: mappingRows.length,
    treatmentRowCount: treatmentRows.length,
    treatmentCowCount: treatmentCowIds.size,
    matchedTreatmentCowCount: matchedCount,
    allTreatmentCowsMatched: treatmentCowIds.size > 0 && unmatchedTreatmentCows.length === 0,
    matchLabel: treatmentCowIds.size ? `${matchedCount} of ${treatmentCowIds.size}` : "No treatment cows loaded",
    treatmentSummaries,
    unmatchedTreatmentCows,
    unmatchedTreatmentCowsLabel:
      unmatchedTreatmentCows.length > 8
        ? `${unmatchedTreatmentCows.slice(0, 8).join(", ")}, +${unmatchedTreatmentCows.length - 8} more`
        : unmatchedTreatmentCows.join(", "),
  };
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

function buildDietAssociationOptions(rows, treatmentRows, dietAssociations) {
  const roughageTypes = Array.from(
    new Set(rows.filter((row) => row.intakeSource === SHARED_INTAKE_SOURCE).map((row) => row.roughageType).filter(Boolean))
  ).sort((a, b) => String(a).localeCompare(String(b)));
  const treatments = Array.from(new Set(treatmentRows.map((row) => row.treatment).filter(Boolean))).sort((a, b) =>
    String(a).localeCompare(String(b))
  );
  const pendingTreatments = treatments.filter((treatment) => {
    if (dietAssociations[treatment]) {
      return false;
    }
    return roughageTypes.length > 0 && !roughageTypes.some((roughageType) => treatmentMatchesRoughage(treatment, roughageType));
  });

  return {
    roughageTypes,
    treatments,
    pendingTreatments,
    needsAssociations: pendingTreatments.length > 0,
  };
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

function enrichRows(rows, mappingLookup, treatmentLookup, dietAssociations = {}) {
  const roughageTypes = Array.from(
    new Set(rows.filter((row) => row.intakeSource === SHARED_INTAKE_SOURCE).map((row) => row.roughageType).filter(Boolean))
  );

  return rows.map((row) => {
    const eartag = mappingLookup.get(row.transponder)?.eartag || row.eartag || row.transponder || "Unknown";
    const treatment = resolveTreatmentForDate(treatmentLookup.get(String(eartag)) || [], row.dateKey) || "";
    const associatedRoughage = resolveAssociatedRoughage(treatment, dietAssociations, roughageTypes);
    const sharedFolderAssignment = row.intakeSource === SHARED_INTAKE_SOURCE && treatment && associatedRoughage;
    const isAssignedRoughage = sharedFolderAssignment && treatmentMatchesRoughage(associatedRoughage, row.roughageType);
    return {
      ...row,
      eartag,
      treatment,
      assignedRoughage: associatedRoughage,
      unlimited: sharedFolderAssignment ? isAssignedRoughage : row.unlimited,
      stolen: sharedFolderAssignment ? !isAssignedRoughage : row.stolen,
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

function filterRowsByDateRange(rows, startDate, endDate) {
  if (!startDate && !endDate) {
    return rows;
  }
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

function buildIntakeQualityChecks(rows) {
  const dateKeys = Array.from(new Set(rows.map((row) => row.dateKey).filter(Boolean))).sort();
  if (!dateKeys.length) {
    return {
      hasRows: false,
      firstDate: "",
      lastDate: "",
      dateRangeLabel: "-",
      observedDayCount: 0,
      expectedDayCount: 0,
      missingDates: [],
      missingDateLabel: "-",
    };
  }

  const firstDate = dateKeys[0];
  const lastDate = dateKeys[dateKeys.length - 1];
  const observedDateSet = new Set(dateKeys);
  const expectedDates = enumerateDateKeys(firstDate, lastDate);
  const missingDates = expectedDates.filter((dateKey) => !observedDateSet.has(dateKey));

  return {
    hasRows: true,
    firstDate,
    lastDate,
    dateRangeLabel: `${firstDate} to ${lastDate}`,
    observedDayCount: dateKeys.length,
    expectedDayCount: expectedDates.length,
    missingDates,
    missingDateLabel: formatMissingDateList(missingDates),
  };
}

function enumerateDateKeys(firstDate, lastDate) {
  const dates = [];
  const cursor = parseDateKey(firstDate);
  const end = parseDateKey(lastDate);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) {
    return dates;
  }

  while (cursor <= end) {
    dates.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatMissingDateList(missingDates) {
  if (!missingDates.length) {
    return "None";
  }
  const visibleDates = missingDates.slice(0, 8).join(", ");
  return missingDates.length > 8 ? `${visibleDates}, +${missingDates.length - 8} more` : visibleDates;
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
  const hasAssignedScopeRows = rows.some((row) => row.assignedRoughage === scope);
  if (hasAssignedScopeRows) {
    return rows.filter((row) => row.assignedRoughage === scope);
  }
  const scopedCows = new Set(
    rows
      .filter((row) => row.unlimited && row.roughageType === scope)
      .map((row) => row.eartag)
      .filter(Boolean)
  );
  if (scopedCows.size) {
    return rows.filter((row) => scopedCows.has(row.eartag));
  }
  return rows.filter((row) => row.roughageType === scope);
}

function buildSummary(
  chartData,
  rows,
  viewMode,
  rangeStartInput = "",
  rangeEndInput = "",
  plotMode = AGGREGATE_PLOT_MODE,
  selectedTreatmentGroups = []
) {
  if (!rows.length) {
    return emptySummary;
  }

  const cowCount = new Set(rows.map((row) => row.eartag)).size;
  const dateSpanStart = rangeStartInput || rows[0].dateKey;
  const dateSpanEnd = rangeEndInput || rows[rows.length - 1].dateKey;
  const { unlimitedAverage, stolenAverage } = deriveDisplayedAverages(chartData, rows, viewMode, dateSpanStart, dateSpanEnd);
  const totalDailyAverage = unlimitedAverage + stolenAverage;
  const stolenPercent = totalDailyAverage > 0 ? (stolenAverage / totalDailyAverage) * 100 : 0;
  const treatmentCards =
    plotMode === TREATMENT_GROUP_PLOT_MODE && selectedTreatmentGroups.length > 1
      ? buildTreatmentSummaryCards(chartData, selectedTreatmentGroups)
      : [];

  return {
    rowsLoaded: rows.length.toLocaleString(),
    cowsTracked: cowCount.toLocaleString(),
    unlimitedDailyAverage: formatNumber(unlimitedAverage),
    stolenDailyAverage: formatNumber(stolenAverage),
    stolenPercent: `${formatNumber(stolenPercent)}%`,
    dateSpan: `${dateSpanStart} to ${dateSpanEnd}`,
    treatmentCards,
  };
}

function deriveDisplayedAverages(chartData, rows, viewMode, dateSpanStart, dateSpanEnd) {
  if (chartData?.points?.length && chartData?.series?.length) {
    const unlimitedSeriesKeys = chartData.series
      .filter((series) => isUnlimitedSeries(series))
      .map((series) => series.key);
    const stolenSeriesKeys = chartData.series
      .filter((series) => isStolenSeries(series))
      .map((series) => series.key);

    if (viewMode === "day") {
      const finalPoint = chartData.points[chartData.points.length - 1];
      return {
        unlimitedAverage: sumSeriesValuesForPoint(finalPoint, unlimitedSeriesKeys),
        stolenAverage: sumSeriesValuesForPoint(finalPoint, stolenSeriesKeys),
      };
    }

    const pointCount = chartData.points.length || 1;
    const totals = chartData.points.reduce(
      (accumulator, point) => ({
        unlimited: accumulator.unlimited + sumSeriesValuesForPoint(point, unlimitedSeriesKeys),
        stolen: accumulator.stolen + sumSeriesValuesForPoint(point, stolenSeriesKeys),
      }),
      { unlimited: 0, stolen: 0 }
    );

    return {
      unlimitedAverage: totals.unlimited / pointCount,
      stolenAverage: totals.stolen / pointCount,
    };
  }

  const unlimitedTotal = rows.filter((row) => row.unlimited).reduce((sum, row) => sum + row.intakeKg, 0);
  const stolenTotal = rows.filter((row) => row.stolen).reduce((sum, row) => sum + row.intakeKg, 0);
  const dayCount = countDaysInclusive(dateSpanStart, dateSpanEnd);
  return {
    unlimitedAverage: unlimitedTotal / dayCount,
    stolenAverage: stolenTotal / dayCount,
  };
}

function sumSeriesValuesForPoint(point, seriesKeys) {
  return seriesKeys.reduce((sum, key) => {
    const value = point?.values?.[key];
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

function buildTreatmentSummaryCards(chartData, selectedTreatmentGroups) {
  if (!chartData?.points?.length || !chartData?.series?.length) {
    return [];
  }

  return selectedTreatmentGroups.map((treatment) => {
    const unlimitedKey = getTreatmentSeriesKey(treatment, "unlimited");
    const stolenKey = getTreatmentSeriesKey(treatment, "stolen");
    const pointCount = chartData.points.length || 1;
    const totals = chartData.points.reduce(
      (accumulator, point) => ({
        unlimited: accumulator.unlimited + (Number.isFinite(point?.values?.[unlimitedKey]) ? point.values[unlimitedKey] : 0),
        stolen: accumulator.stolen + (Number.isFinite(point?.values?.[stolenKey]) ? point.values[stolenKey] : 0),
      }),
      { unlimited: 0, stolen: 0 }
    );

    return {
      treatment,
      unlimitedDailyAverage: formatNumber(totals.unlimited / pointCount),
      stolenDailyAverage: formatNumber(totals.stolen / pointCount),
    };
  });
}

function isUnlimitedSeries(series) {
  const text = `${series?.key || ""} ${series?.label || ""}`.toLowerCase();
  return text.includes("unlimited");
}

function isStolenSeries(series) {
  const text = `${series?.key || ""} ${series?.label || ""}`.toLowerCase();
  return text.includes("stolen");
}

function countDaysInclusive(startDateKey, endDateKey) {
  const start = parseDateKey(startDateKey);
  const end = parseDateKey(endDateKey);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 1;
  }
  const normalizedStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const normalizedEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const daySpan = Math.round((normalizedEnd - normalizedStart) / millisecondsPerDay);
  return Math.max(1, daySpan + 1);
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
  const daily = summarizeCowAveragesByDay(filteredRows);
  const points = Array.from(daily.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, values]) => ({
      label,
      values: {
        unlimited: values.unlimited.mean,
        stolen: values.stolen.mean,
      },
      errors: {
        unlimited: values.unlimited.se,
        stolen: values.stolen.se,
      },
    }));

  return {
    title:
      scope === OVERALL_SCOPE
        ? `Day range average per cow: ${startDate || "start"} to ${endDate || "end"}`
        : `Day range average per cow: ${scope}`,
    status:
      scope === OVERALL_SCOPE
        ? `Showing one average-per-cow ${intakeLabelText.toLowerCase()} point per day across all uploaded cows. Error bars are standard errors across cows.`
        : `Showing one average-per-cow ${intakeLabelText.toLowerCase()} point per day for roughage ${scope}. Error bars are standard errors across cows.`,
    emptyMessage: "No rows were found for the selected date range.",
    series: buildAggregateSeries(),
    unitLabel,
    points,
  };
}
function buildWeeklyAverageSeries(rows, startDate, endDate, scope, unitLabel, intakeLabelText) {
  const filteredRows = filterByDateRange(rows, startDate, endDate);
  const daily = summarizeCowAveragesByDay(filteredRows);
  const weekly = new Map();

  daily.forEach((values, dateKey) => {
    const weekKey = getWeekStart(dateKey);
    const bucket = weekly.get(weekKey) || {
      unlimitedMeans: [],
      stolenMeans: [],
      dayCount: 0,
    };
    bucket.unlimitedMeans.push(values.unlimited.mean);
    bucket.stolenMeans.push(values.stolen.mean);
    bucket.dayCount += 1;
    weekly.set(weekKey, bucket);
  });

  const points = Array.from(weekly.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, values]) => ({
      label,
      values: {
        unlimited: values.dayCount
          ? values.unlimitedMeans.reduce((sum, value) => sum + value, 0) / values.dayCount
          : 0,
        stolen: values.dayCount
          ? values.stolenMeans.reduce((sum, value) => sum + value, 0) / values.dayCount
          : 0,
      },
    }));

  return {
    title:
      scope === OVERALL_SCOPE
        ? `Weekly average means: ${startDate || "start"} to ${endDate || "end"}`
        : `Weekly average per cow: ${scope}`,
    status:
      scope === OVERALL_SCOPE
        ? `Showing the weekly mean of the daily unlimited and stolen ${intakeLabelText.toLowerCase()} averages.`
        : `Showing the average daily ${intakeLabelText.toLowerCase()} per cow inside each calendar week for roughage ${scope}.`,
    emptyMessage: "No weekly averages could be calculated for the selected range.",
    series: buildAggregateSeries(),
    unitLabel,
    points,
  };
}

function buildTreatmentGroupChartData(rows, viewMode, dayKey, startDate, endDate, scope, selectedTreatments, unitLabel, intakeLabelText) {
  if (!selectedTreatments.length) {
    return {
      title: "Treatment group comparison",
      status: "Pick up to 4 treatment groups to compare them on the same plot.",
      emptyMessage: "Select at least one treatment group.",
      series: [],
      unitLabel,
      points: [],
    };
  }

  const treatmentRows = rows.filter((row) => selectedTreatments.includes(row.treatment));
  const points =
    viewMode === "day"
      ? buildTreatmentGroupDayPoints(treatmentRows, dayKey, selectedTreatments)
      : viewMode === "range"
        ? buildTreatmentGroupRangePoints(treatmentRows, startDate, endDate, selectedTreatments)
        : buildTreatmentGroupWeeklyPoints(treatmentRows, startDate, endDate, selectedTreatments);

  return {
    title:
      viewMode === "day"
        ? `Treatment group comparison: ${selectedTreatments.join(", ")}`
        : viewMode === "range"
          ? `Treatment group day summary: ${selectedTreatments.join(", ")}`
          : `Treatment group weekly summary: ${selectedTreatments.join(", ")}`,
    status: `Showing unlimited and stolen ${intakeLabelText.toLowerCase()} for selected treatment groups. Treatment comparison uses all roughage visits for each selected treatment.`,
    emptyMessage: "No rows were found for the selected treatment groups and current date filters.",
    series: buildTreatmentGroupSeries(selectedTreatments),
    unitLabel,
    points,
  };
}

function buildTreatmentGroupDayPoints(rows, dayKey, selectedTreatments) {
  const selectedDay = dayKey || rows[rows.length - 1]?.dateKey;
  const dayRows = rows.filter((row) => row.dateKey === selectedDay);
  const buckets = Array.from(groupRowsBy(dayRows, (row) => row.timeBucketKey).entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const running = Object.fromEntries(
    selectedTreatments.flatMap((treatment) => [
      [getTreatmentSeriesKey(treatment, "unlimited"), 0],
      [getTreatmentSeriesKey(treatment, "stolen"), 0],
    ])
  );

  return buckets.map(([label, bucketRows]) => {
    selectedTreatments.forEach((treatment) => {
      const treatmentRows = bucketRows.filter((row) => row.treatment === treatment);
      const cowCount = new Set(dayRows.filter((row) => row.treatment === treatment).map((row) => row.eartag)).size || 1;
      running[getTreatmentSeriesKey(treatment, "unlimited")] += treatmentRows
        .filter((row) => row.unlimited)
        .reduce((sum, row) => sum + row.intakeKg, 0) / cowCount;
      running[getTreatmentSeriesKey(treatment, "stolen")] += treatmentRows
        .filter((row) => row.stolen)
        .reduce((sum, row) => sum + row.intakeKg, 0) / cowCount;
    });

    return { label, values: { ...running } };
  });
}

function buildTreatmentGroupRangePoints(rows, startDate, endDate, selectedTreatments) {
  const filtered = filterByDateRange(rows, startDate, endDate);
  const dateKeys = Array.from(new Set(filtered.map((row) => row.dateKey).filter(Boolean))).sort();
  return dateKeys.map((dateKey) => {
    const values = {};
    const errors = {};
    selectedTreatments.forEach((treatment) => {
      const summary = summarizeCowAveragesByDay(filtered.filter((row) => row.dateKey === dateKey && row.treatment === treatment)).get(dateKey);
      values[getTreatmentSeriesKey(treatment, "unlimited")] = summary?.unlimited.mean ?? 0;
      values[getTreatmentSeriesKey(treatment, "stolen")] = summary?.stolen.mean ?? 0;
      errors[getTreatmentSeriesKey(treatment, "unlimited")] = summary?.unlimited.se ?? 0;
      errors[getTreatmentSeriesKey(treatment, "stolen")] = summary?.stolen.se ?? 0;
    });
    return { label: dateKey, values, errors };
  });
}

function buildTreatmentGroupWeeklyPoints(rows, startDate, endDate, selectedTreatments) {
  const dailyPoints = buildTreatmentGroupRangePoints(rows, startDate, endDate, selectedTreatments);
  const weekly = new Map();
  dailyPoints.forEach((point) => {
    const weekKey = getWeekStart(point.label);
    const bucket = weekly.get(weekKey) || [];
    bucket.push(point.values);
    weekly.set(weekKey, bucket);
  });
  return Array.from(weekly.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([label, valueRows]) => {
    const values = {};
    selectedTreatments.forEach((treatment) => {
      ["unlimited", "stolen"].forEach((kind) => {
        const key = getTreatmentSeriesKey(treatment, kind);
        values[key] = valueRows.reduce((sum, row) => sum + (row[key] || 0), 0) / (valueRows.length || 1);
      });
    });
    return { label, values };
  });
}

function buildTreatmentGroupSeries(selectedTreatments) {
  return selectedTreatments.flatMap((treatment, index) => {
    const color = COW_COLORS[index % COW_COLORS.length];
    const stolenDashArray = STOLEN_DASH_PATTERNS[index % STOLEN_DASH_PATTERNS.length];
    return [
      {
        key: getTreatmentSeriesKey(treatment, "unlimited"),
        label: `Treatment ${treatment} unlimited`,
        color,
        dashed: false,
        markerShape: COW_MARKERS[index % COW_MARKERS.length],
        markerFilled: true,
        lineWidth: 3.2,
      },
      {
        key: getTreatmentSeriesKey(treatment, "stolen"),
        label: `Treatment ${treatment} stolen`,
        color,
        dashed: true,
        dashArray: stolenDashArray,
        markerShape: COW_MARKERS[index % COW_MARKERS.length],
        markerFilled: false,
        lineWidth: 3.2,
      },
    ];
  });
}

function getTreatmentSeriesKey(treatment, type) {
  return `treatment_${String(treatment).replace(/[^a-zA-Z0-9_-]/g, "_")}_${type}`;
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

function summarizeCowAveragesByDay(rows) {
  const dailyCowBuckets = new Map();

  rows.forEach((row) => {
    const dayBucket = dailyCowBuckets.get(row.dateKey) || new Map();
    const cowKey = row.eartag || "Unknown";
    const cowBucket = dayBucket.get(cowKey) || { unlimited: 0, stolen: 0 };
    if (row.unlimited) {
      cowBucket.unlimited += row.intakeKg;
    }
    if (row.stolen) {
      cowBucket.stolen += row.intakeKg;
    }
    dayBucket.set(cowKey, cowBucket);
    dailyCowBuckets.set(row.dateKey, dayBucket);
  });

  return new Map(
    Array.from(dailyCowBuckets.entries()).map(([dateKey, cowMap]) => {
      const cowValues = Array.from(cowMap.values());
      const unlimitedValues = cowValues.map((value) => value.unlimited);
      const stolenValues = cowValues.map((value) => value.stolen);
      return [
        dateKey,
        {
          unlimited: summarizeMeanAndSe(unlimitedValues),
          stolen: summarizeMeanAndSe(stolenValues),
        },
      ];
    })
  );
}

function summarizeMeanAndSe(values) {
  const numericValues = values.filter((value) => Number.isFinite(value));
  const count = numericValues.length;
  if (!count) {
    return { mean: 0, se: 0, count: 0 };
  }
  const mean = numericValues.reduce((sum, value) => sum + value, 0) / count;
  if (count < 2) {
    return { mean, se: 0, count };
  }
  const variance = numericValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (count - 1);
  return { mean, se: Math.sqrt(variance / count), count };
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

function parseDateTime(value, preferredDateKey = "") {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return parseSpreadsheetDate(value);
  }

  const text = String(value || "").trim();
  const dateTimeMatch = text.match(/^(\d{1,4})[\/-](\d{1,2})[\/-](\d{1,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (!dateTimeMatch) {
    return new Date(text);
  }

  const [, first, second, third, hoursText = "0", minutesText = "0", secondsText = "0", meridiemText = ""] = dateTimeMatch;
  const firstNumber = Number(first);
  const secondNumber = Number(second);
  const thirdNumber = Number(third);
  const year = first.length === 4 ? firstNumber : thirdNumber;
  const month = first.length === 4 ? secondNumber : firstNumber > 12 ? secondNumber : firstNumber;
  const day = first.length === 4 ? thirdNumber : firstNumber > 12 ? firstNumber : secondNumber;
  let hours = Number(hoursText);
  const meridiem = meridiemText.toUpperCase();

  if (meridiem === "PM" && hours !== 12) {
    hours += 12;
  }
  if (meridiem === "AM" && hours === 12) {
    hours = 0;
  }

  if (preferredDateKey) {
    const preferredDate = parseDateKey(preferredDateKey);
    if (!Number.isNaN(preferredDate.getTime())) {
      return new Date(preferredDate.getFullYear(), preferredDate.getMonth(), preferredDate.getDate(), hours, Number(minutesText), Number(secondsText));
    }
  }

  return new Date(year, month - 1, day, hours, Number(minutesText), Number(secondsText));
}

function formatDateTimeForCsv(date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const year = date.getFullYear();
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  const seconds = `${date.getSeconds()}`.padStart(2, "0");
  return `${month}/${day}/${year} ${hours}:${minutes}:${seconds}`;
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

function slugifyFileName(value) {
  return String(value || "report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "report";
}

function downloadTextFile(fileName, content, mimeType) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getImageSize(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function buildIntakeAnalysisSummary({
  viewMode,
  plotMode,
  analysisScope,
  selectedCows,
  selectedTreatmentGroups,
  rangeStartInput,
  rangeEndInput,
  dayInput,
}) {
  const viewLabel =
    viewMode === "weekly" ? "Weekly average of daily summaries" : viewMode === "range" ? "Day range summary" : "Specific day";
  const plotLabel =
    plotMode === TREATMENT_GROUP_PLOT_MODE
      ? "Treatment group comparison"
      : plotMode === PER_COW_PLOT_MODE
        ? "Per-cow comparison"
        : "Combined lines";
  const scopeLabel = analysisScope === OVERALL_SCOPE ? "All uploaded cows combined" : `Average per cow for ${analysisScope}`;
  const selectionNotes = [];

  if (selectedCows.length) {
    selectionNotes.push(`Cows: ${selectedCows.join(", ")}`);
  }
  if (selectedTreatmentGroups.length) {
    selectionNotes.push(`Treatment groups: ${selectedTreatmentGroups.join(", ")}`);
  }
  if (dayInput) {
    selectionNotes.push(`Specific day: ${dayInput}`);
  }
  if (rangeStartInput || rangeEndInput) {
    selectionNotes.push(`Date window: ${rangeStartInput || "start"} to ${rangeEndInput || "end"}`);
  }

  return {
    viewLabel,
    plotLabel,
    scopeLabel,
    selectionNotes,
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildInteractiveHtmlReport({
  chartTitle,
  chartData,
  summary,
  intakeUnitLabel,
  intakeLabelText,
  statusText,
  substatusText,
  selectedFigures,
  selectedTrackedCowRecord,
  analysisSummary,
}) {
  const sections = [];

  if (selectedFigures.includes("summary")) {
    sections.push(`
      <section class="report-section">
        <h2>Summary cards</h2>
        <div class="summary-grid">
          ${[
            ["Rows loaded", summary.rowsLoaded],
            ["Cows tracked", summary.cowsTracked],
            ...(
              summary.treatmentCards?.length
                ? summary.treatmentCards.flatMap((card) => [
                    [`Treatment ${card.treatment} unlimited daily avg (${intakeUnitLabel})`, card.unlimitedDailyAverage],
                    [`Treatment ${card.treatment} stolen daily avg (${intakeUnitLabel})`, card.stolenDailyAverage],
                  ])
                : [
                    [`Unlimited daily avg (${intakeUnitLabel})`, summary.unlimitedDailyAverage],
                    [`Stolen daily avg (${intakeUnitLabel})`, summary.stolenDailyAverage],
                    ["Stolen % of daily intake", summary.stolenPercent],
                  ]
            ),
            ["Date span", summary.dateSpan],
          ]
            .map(
              ([label, value]) => `
              <article class="summary-card">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>
              </article>
            `
            )
            .join("")}
        </div>
      </section>
    `);
  }

  if (selectedFigures.includes("chart")) {
    sections.push(`
      <section class="report-section">
        <h2>${escapeHtml(chartTitle || "Current intake chart")}</h2>
        <p class="hint">Hover over the chart points to see each value and standard error when available.</p>
        <div class="chart-wrap">
          ${buildInteractiveChartSvgMarkup(chartData)}
        </div>
      </section>
    `);
  }

  if (selectedFigures.includes("tracked") && selectedTrackedCowRecord) {
    sections.push(`
      <section class="report-section">
        <h2>Selected tracked cow details</h2>
        <div class="detail-card">
          <span>Eartag</span>
          <strong>${escapeHtml(selectedTrackedCowRecord.eartag)}</strong>
          <p>EID / transponder: ${escapeHtml(selectedTrackedCowRecord.transponder)}</p>
          <p>Rows: ${escapeHtml(selectedTrackedCowRecord.rowCount)}</p>
        </div>
      </section>
    `);
  }

  if (selectedFigures.includes("notes")) {
    sections.push(`
      <section class="report-section">
        <h2>Plot guide notes</h2>
        <ul class="notes-list">
          <li>All uploaded cows combined shows totals across every uploaded intake file.</li>
          <li>Average per cow for a roughage type filters to that roughage type and shows the average intake per cow by bucket, day, or week.</li>
          <li>Per-cow comparison shows one unlimited line and one stolen line for each selected cow.</li>
          <li>Treatment group comparison keeps one color per treatment, with solid for unlimited and dashed for stolen.</li>
        </ul>
      </section>
    `);
  }

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Daily Intake Report</title>
    <style>
      :root {
        --bg: #f4f5ef;
        --panel: #fffdf8;
        --text: #213631;
        --muted: #4b6a61;
        --accent: #18453b;
        --accent-soft: rgba(24, 69, 59, 0.08);
        --border: rgba(24, 69, 59, 0.14);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 28px;
        background:
          radial-gradient(circle at top right, rgba(24, 69, 59, 0.10), transparent 34%),
          linear-gradient(180deg, #f8faf7, var(--bg));
        color: var(--text);
        font-family: Georgia, "Times New Roman", serif;
      }
      main { max-width: 1120px; margin: 0 auto; }
      .hero, .report-section {
        background: rgba(255, 253, 248, 0.92);
        border: 1px solid var(--border);
        border-radius: 20px;
        padding: 22px 24px;
        box-shadow: 0 14px 35px rgba(24, 69, 59, 0.08);
      }
      .hero { margin-bottom: 18px; }
      .hero h1, .report-section h2 { margin: 0; }
      .hero p { margin: 10px 0 0; color: var(--muted); }
      .meta { margin-top: 14px; display: grid; gap: 8px; color: var(--muted); }
      .report-section { margin-top: 18px; }
      .summary-grid {
        margin-top: 14px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 14px;
      }
      .summary-card, .detail-card {
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 16px;
        background: #fff;
      }
      .summary-card span, .detail-card span { display: block; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
      .summary-card strong, .detail-card strong { display: block; margin-top: 8px; font-size: 30px; line-height: 1.05; }
      .detail-card p, .hint { color: var(--muted); }
      .chart-wrap { overflow-x: auto; padding-top: 10px; }
      .chart-interactive {
        position: relative;
      }
      .chart-hover-tooltip {
        position: absolute;
        min-width: 220px;
        max-width: 320px;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid rgba(24, 69, 59, 0.18);
        background: rgba(255, 253, 248, 0.98);
        box-shadow: 0 12px 28px rgba(24, 69, 59, 0.16);
        color: var(--text);
        pointer-events: none;
        opacity: 0;
        transform: translateY(6px);
        transition: opacity 0.12s ease, transform 0.12s ease;
        z-index: 3;
      }
      .chart-hover-tooltip.is-visible {
        opacity: 1;
        transform: translateY(0);
      }
      .chart-hover-title {
        font-weight: 700;
        margin-bottom: 8px;
      }
      .chart-hover-row {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.35;
      }
      .chart-hover-row + .chart-hover-row {
        margin-top: 4px;
      }
      .chart-hover-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        margin-top: 5px;
        flex: 0 0 auto;
      }
      .chart-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 14px 18px;
        margin: 14px 0 6px;
        color: var(--muted);
      }
      .chart-legend-item {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .legend-swatch {
        width: 38px;
        height: 16px;
        display: inline-block;
      }
      .notes-list { color: var(--muted); }
      .notes-list li + li { margin-top: 8px; }
      .svg-chart { width: 100%; min-width: 920px; height: auto; display: block; }
      .svg-chart .tick-label, .svg-chart .axis-label { fill: #58736b; font-size: 12px; }
      .svg-chart .grid-line, .svg-chart .axis-line { stroke: rgba(36, 37, 28, 0.14); stroke-width: 1; }
      .svg-chart .series-line { fill: none; stroke-linecap: round; stroke-linejoin: round; }
      .svg-chart .point { paint-order: stroke; }
      .svg-chart .chart-hit-zone { fill: transparent; }
      .svg-chart .chart-hit-zone:focus { outline: none; }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <h1>Daily Intake Report</h1>
        <p>${escapeHtml(chartTitle || "Current intake chart")}</p>
        <div class="meta">
          <div><strong>Basis:</strong> ${escapeHtml(intakeLabelText)} (${escapeHtml(intakeUnitLabel)})</div>
          <div><strong>Status:</strong> ${escapeHtml(statusText)}</div>
          <div><strong>Loaded data:</strong> ${escapeHtml(substatusText)}</div>
          <div><strong>Plot mode:</strong> ${escapeHtml(analysisSummary.viewLabel)} | ${escapeHtml(analysisSummary.plotLabel)}</div>
          <div><strong>Scope:</strong> ${escapeHtml(analysisSummary.scopeLabel)}</div>
          ${
            analysisSummary.selectionNotes.length
              ? `<div><strong>Selections:</strong> ${escapeHtml(analysisSummary.selectionNotes.join(" | "))}</div>`
              : ""
          }
          <div><strong>Exported:</strong> ${escapeHtml(new Date().toLocaleString("en-US", { timeZone: TIME_ZONE }))}</div>
        </div>
      </section>
      ${sections.join("")}
    </main>
    <script>
      (() => {
        const wrappers = document.querySelectorAll("[data-chart-interactive]");
        wrappers.forEach((wrapper) => {
          const tooltip = wrapper.querySelector("[data-chart-tooltip]");
          if (!tooltip) {
            return;
          }

          const hideTooltip = () => {
            tooltip.classList.remove("is-visible");
          };

          const showTooltip = (event) => {
            const zone = event.currentTarget;
            const payload = zone.getAttribute("data-tooltip");
            if (!payload) {
              return;
            }

            const data = JSON.parse(payload);
            tooltip.innerHTML = [
              '<div class="chart-hover-title">' + data.label + '</div>',
              ...data.rows.map((row) =>
                '<div class="chart-hover-row">' +
                  '<span class="chart-hover-dot" style="background:' + row.color + ';"></span>' +
                  '<span>' + row.text + '</span>' +
                '</div>'
              ),
            ].join("");

            const wrapperRect = wrapper.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();
            const pointerX = event.clientX - wrapperRect.left;
            const pointerY = event.clientY - wrapperRect.top;
            const maxLeft = Math.max(12, wrapperRect.width - tooltipRect.width - 12);
            const left = Math.min(maxLeft, Math.max(12, pointerX + 14));
            const top = Math.max(12, pointerY - tooltipRect.height - 14);

            tooltip.style.left = left + "px";
            tooltip.style.top = top + "px";
            tooltip.classList.add("is-visible");
          };

          wrapper.querySelectorAll(".chart-hit-zone").forEach((zone) => {
            zone.addEventListener("mouseenter", showTooltip);
            zone.addEventListener("mousemove", showTooltip);
            zone.addEventListener("focus", showTooltip);
            zone.addEventListener("mouseleave", hideTooltip);
            zone.addEventListener("blur", hideTooltip);
          });

          wrapper.addEventListener("mouseleave", hideTooltip);
        });
      })();
    </script>
  </body>
</html>`;
}

function buildInteractiveChartSvgMarkup(chartData) {
  if (!chartData?.points?.length || !chartData?.series?.length) {
    return `<div class="detail-card"><p>No intake chart is available for the current filters.</p></div>`;
  }

  const width = 1000;
  const hasRotatedLabels = chartData.points.length > 7;
  const height = hasRotatedLabels ? 430 : 396;
  const margin = { top: 24, right: hasRotatedLabels ? 40 : 28, bottom: hasRotatedLabels ? 110 : 70, left: 72 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const xStep = chartData.points.length > 1 ? innerWidth / (chartData.points.length - 1) : 0;
  const xLabelStep = getXAxisLabelStep(chartData.points.length);
  const maxValue = Math.max(
    ...chartData.points.flatMap((point) =>
      chartData.series
        .map((item) => {
          const value = point.values[item.key];
          const error = point.errors?.[item.key] || 0;
          return value === null || value === undefined ? null : value + error;
        })
        .filter((value) => value !== null && value !== undefined)
    ),
    0
  );
  const yMax = maxValue === 0 ? 1 : maxValue * 1.1;
  const yTicks = Array.from({ length: 6 }, (_, index) => {
    const value = (yMax / 5) * index;
    const y = margin.top + innerHeight - (value / yMax) * innerHeight;
    return { value, y };
  });

  const seriesPaths = chartData.series
    .map((series) => {
      const path = buildPath(chartData.points, series.key, margin, innerWidth, innerHeight, yMax);
      if (!path) {
        return "";
      }
      return `
        <path class="series-line" stroke="rgba(255, 253, 248, 0.95)" stroke-width="${(series.lineWidth || 3) + 4}" stroke-dasharray="${series.dashArray || (series.dashed ? "8 5" : "")}" d="${path}" />
        <path class="series-line" stroke="${series.color}" stroke-width="${series.lineWidth || 3}" stroke-dasharray="${series.dashArray || (series.dashed ? "8 5" : "")}" d="${path}" />
      `;
    })
    .join("");

  const errorBars = chartData.series
    .map((series) =>
      chartData.points
        .map((point, index) => {
          const x = margin.left + (chartData.points.length > 1 ? xStep * index : innerWidth / 2);
          const value = point.values[series.key];
          const error = point.errors?.[series.key];
          if (value === null || value === undefined || !Number.isFinite(error) || error <= 0) {
            return "";
          }
          const y = margin.top + innerHeight - (value / yMax) * innerHeight;
          const errorTop = margin.top + innerHeight - ((value + error) / yMax) * innerHeight;
          const errorBottom = margin.top + innerHeight - ((value - error) / yMax) * innerHeight;
          return `
            <g>
              <line x1="${x}" y1="${errorTop}" x2="${x}" y2="${errorBottom}" stroke="${series.color}" stroke-width="1.8" />
              <line x1="${x - 5}" y1="${errorTop}" x2="${x + 5}" y2="${errorTop}" stroke="${series.color}" stroke-width="1.8" />
              <line x1="${x - 5}" y1="${errorBottom}" x2="${x + 5}" y2="${errorBottom}" stroke="${series.color}" stroke-width="1.8" />
            </g>
          `;
        })
        .join("")
    )
    .join("");

  const pointMarkup = chartData.series
    .map((series) =>
      chartData.points
        .map((point, index) => {
          const x = margin.left + (chartData.points.length > 1 ? xStep * index : innerWidth / 2);
          const value = point.values[series.key];
          if (value === null || value === undefined) {
            return "";
          }
          const y = margin.top + innerHeight - (value / yMax) * innerHeight;
          const tooltip = `${series.label}: ${formatNumber(value)} ${chartData.unitLabel || "kg"}${
            Number.isFinite(point.errors?.[series.key]) ? ` +/- ${formatNumber(point.errors[series.key])} SE` : ""
          } on ${formatXAxisLabel(point.label, false)}`;
          return `<g><title>${escapeHtml(tooltip)}</title>${renderMarkerShapeMarkup({
            shape: series.markerShape || "circle",
            x,
            y,
            size: 6.2,
            color: series.color,
            filled: series.markerFilled !== false,
          })}</g>`;
        })
        .join("")
    )
    .join("");

  const xLabels = chartData.points
    .map((point, index) => {
      if (index % xLabelStep !== 0 && index !== chartData.points.length - 1) {
        return "";
      }
      const x = margin.left + (chartData.points.length > 1 ? xStep * index : innerWidth / 2);
      const label = escapeHtml(formatXAxisLabel(point.label, hasRotatedLabels));
      return hasRotatedLabels
        ? `<text class="tick-label" x="${x}" y="${margin.top + innerHeight + 42}" transform="rotate(-35 ${x} ${margin.top + innerHeight + 42})" text-anchor="end">${label}</text>`
        : `<text class="tick-label" x="${x}" y="${margin.top + innerHeight + 26}" text-anchor="middle">${label}</text>`;
    })
    .join("");

  const hitZoneWidth = chartData.points.length > 1 ? Math.max(18, xStep * 0.8) : 42;
  const hitZones = chartData.points
    .map((point, index) => {
      const x = margin.left + (chartData.points.length > 1 ? xStep * index : innerWidth / 2);
      const rows = chartData.series
        .map((series) => {
          const value = point.values?.[series.key];
          if (!Number.isFinite(value)) {
            return null;
          }
          const error = point.errors?.[series.key];
          return {
            color: series.color,
            text: `${series.label}: ${formatNumber(value)} ${chartData.unitLabel || "kg"}${
              Number.isFinite(error) ? ` +/- ${formatNumber(error)} SE` : ""
            }`,
          };
        })
        .filter(Boolean);

      return `<rect
        class="chart-hit-zone"
        x="${x - hitZoneWidth / 2}"
        y="${margin.top}"
        width="${hitZoneWidth}"
        height="${innerHeight}"
        tabindex="0"
        data-tooltip='${escapeHtml(JSON.stringify({ label: formatXAxisLabel(point.label, false), rows }))}'
      />`;
    })
    .join("");

  const legendMarkup = `
    <div class="chart-legend">
      ${chartData.series
        .map(
          (series) => `
          <span class="chart-legend-item">
            ${buildHtmlLegendSwatch(series)}
            <span>${escapeHtml(series.label)}</span>
          </span>
        `
        )
        .join("")}
    </div>
  `;

  return `
    ${legendMarkup}
    <div class="chart-interactive" data-chart-interactive>
      <div class="chart-hover-tooltip" data-chart-tooltip></div>
      <svg class="svg-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(chartData.title || "Intake chart")}">
        ${yTicks
          .map(
            (tick) => `
            <g>
              <line class="grid-line" x1="${margin.left}" y1="${tick.y}" x2="${width - margin.right}" y2="${tick.y}" />
              <text class="tick-label" x="${margin.left - 12}" y="${tick.y + 4}" text-anchor="end">${formatNumber(tick.value)}</text>
            </g>
          `
          )
          .join("")}
        <line class="axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + innerHeight}" />
        <line class="axis-line" x1="${margin.left}" y1="${margin.top + innerHeight}" x2="${width - margin.right}" y2="${margin.top + innerHeight}" />
        ${seriesPaths}
        ${errorBars}
        ${pointMarkup}
        ${xLabels}
        ${hitZones}
        <text class="axis-label" x="${margin.left - 46}" y="${margin.top - 6}">${escapeHtml(chartData.unitLabel || "kg")}</text>
      </svg>
    </div>
  `;
}

function buildHtmlLegendSwatch(series) {
  return `
    <svg class="legend-swatch" viewBox="0 0 38 16" aria-hidden="true">
      <line
        x1="3"
        y1="8"
        x2="35"
        y2="8"
        stroke="rgba(255, 253, 248, 0.95)"
        stroke-width="${(series.lineWidth || 3) + 4}"
        stroke-linecap="round"
        stroke-dasharray="${series.dashArray || (series.dashed ? "8 5" : "")}"
      />
      <line
        x1="3"
        y1="8"
        x2="35"
        y2="8"
        stroke="${series.color}"
        stroke-width="${series.lineWidth || 3}"
        stroke-linecap="round"
        stroke-dasharray="${series.dashArray || (series.dashed ? "8 5" : "")}"
      />
      ${renderMarkerShapeMarkup({
        shape: series.markerShape || "circle",
        x: 19,
        y: 8,
        size: 5.4,
        color: series.color,
        filled: series.markerFilled !== false,
      })}
    </svg>
  `;
}

function renderMarkerShapeMarkup({ shape, x, y, size, color, filled }) {
  const strokeWidth = filled ? 2.2 : 2.6;
  const fill = filled ? color : "#fffdf8";

  if (shape === "square") {
    return `<rect class="point" x="${x - size}" y="${y - size}" width="${size * 2}" height="${size * 2}" rx="1.5" stroke="${color}" stroke-width="${strokeWidth}" fill="${fill}" />`;
  }

  if (shape === "diamond") {
    return `<polygon class="point" points="${x},${y - size} ${x + size},${y} ${x},${y + size} ${x - size},${y}" stroke="${color}" stroke-width="${strokeWidth}" fill="${fill}" />`;
  }

  if (shape === "triangle") {
    return `<polygon class="point" points="${x},${y - size} ${x + size},${y + size} ${x - size},${y + size}" stroke="${color}" stroke-width="${strokeWidth}" fill="${fill}" />`;
  }

  return `<circle class="point" cx="${x}" cy="${y}" r="${size}" stroke="${color}" stroke-width="${strokeWidth}" fill="${fill}" />`;
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

















