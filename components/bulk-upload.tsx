"use client";

import React, { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  XCircle,
  RefreshCw,
  Download,
  Sparkles,
  Users,
  StopCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Settings,
} from "lucide-react";

interface FailureItem {
  row: number;
  item?: string;
  reason: string;
}

interface UploadProgress {
  percent: number;
  processed: number;
  total: number;
  status: "IDLE" | "STARTING" | "PROCESSING" | "COMPLETED" | "ERROR";
  currentRow?: string;
  error?: string;
}

const DEMO_USERS_RAW = [
  { name: "Ada Lovelace", email: "ada@example.com", role: "Senior Engineer", department: "R&D" },
  { name: "Alan Turing", email: "alan.turing@example.com", role: "Lead Architect", department: "Security" },
  { name: "Grace Hopper", email: "grace@navy.gov", role: "Engineering VP", department: "Leadership" },
  { name: "Claude Shannon", email: "claude@information.org", role: "Principal Scientist", department: "Data" },
  { name: "Margaret Hamilton", email: "margaret@apollo.nasa.gov", role: "Director", department: "Systems" },
  { name: "Linus Torvalds", email: "linus@kernel.org", role: "Chief Architect", department: "Core OS" },
  { name: "Invalid Email User", email: "invalid-email-address", role: "Developer", department: "Engineering" }, // Error
  { name: "Katherine Johnson", email: "katherine@nasa.gov", role: "Orbital Analyst", department: "Research" },
  { name: "Hedy Lamarr", email: "hedy@frequency.tech", role: "Inventor", department: "Telecom" },
  { name: "Duplicate User 1", email: "duplicate.user@example.com", role: "Designer", department: "Product" },
  { name: "Duplicate User 2", email: "duplicate.user@example.com", role: "Designer", department: "Product" }, // Error
  { name: "Missing Name User", email: "", role: "Analyst", department: "Analytics" }, // Error
  { name: "Tim Berners-Lee", email: "timbl@w3.org", role: "Fellow", department: "Standards" },
  { name: "Barbara Liskov", email: "barbara@mit.edu", role: "Professor", department: "Languages" },
  { name: "Ken Thompson", email: "ken@bell-labs.com", role: "Distinguished Engineer", department: "Unix" },
  { name: "Dennis Ritchie", email: "dennis@bell-labs.com", role: "Creator", department: "Systems" },
  { name: "Radia Perlman", email: "radia@stp.net", role: "Fellow", department: "Networking" },
  { name: "John McCarthy", email: "john@ai-lab.stanford.edu", role: "Professor", department: "AI" },
  { name: "Guido van Rossum", email: "guido@python.org", role: "Benevolent Dictator", department: "Language" },
  { name: "Leslie Lamport", email: "leslie@paxos.microsoft.com", role: "Principal Researcher", department: "Distributed" },
];

export default function BulkUploadComponent() {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<UploadProgress>({
    percent: 0,
    processed: 0,
    total: 0,
    status: "IDLE",
  });
  const [failures, setFailures] = useState<FailureItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showFailures, setShowFailures] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [endpointUrl, setEndpointUrl] = useState("/api/v1/users/upload/stream");
  const [formFieldName, setFormFieldName] = useState("file");
  const [showSettings, setShowSettings] = useState(false);

  const startTimer = () => {
    const start = Date.now();
    setElapsedSeconds(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const resetUpload = () => {
    stopTimer();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setFile(null);
    setProgress({ percent: 0, processed: 0, total: 0, status: "IDLE" });
    setFailures([]);
    setElapsedSeconds(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const cancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    stopTimer();
    setProgress((prev) => ({
      ...prev,
      status: "ERROR",
      error: "Upload canceled by user.",
    }));
  };

  const handleUpload = async (targetFile: File) => {
    setFile(targetFile);
    setFailures([]);
    setProgress({
      percent: 0,
      processed: 0,
      total: 0,
      status: "STARTING",
      currentRow: `Connecting to ${endpointUrl}...`,
    });
    startTimer();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const formData = new FormData();
      formData.append(formFieldName, targetFile);

      const response = await fetch(endpointUrl, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorDetails = `HTTP ${response.status} ${response.statusText}`;
        try {
          const errorText = await response.text();
          if (errorText) {
            errorDetails += `: ${errorText.slice(0, 300)}`;
          }
        } catch {}
        throw new Error(errorDetails);
      }

      if (!response.body) {
        throw new Error("No readable response body received from server");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Split by double newline (SSE) or single newline (NDJSON)
        const parts = buffer.split(/\r?\n\r?\n|\r?\n/);
        buffer = parts.pop() || "";

        for (const rawLine of parts) {
          let line = rawLine.trim();
          if (!line || line.startsWith(":") || line.startsWith("event:")) {
            continue;
          }

          // Strip SSE 'data: ' prefix if present
          if (line.startsWith("data:")) {
            line = line.replace(/^data:\s*/, "").trim();
          }

          if (!line.startsWith("{") && !line.startsWith("[")) {
            continue;
          }

          try {
            const update = JSON.parse(line);

            // Handle both SSE updates and potential wrapper objects
            const percent = Number(
              update.percent ?? update.percentage ?? update.progress ?? 0
            );
            const processed = Number(
              update.processedRows ?? update.processed ?? update.current ?? 0
            );
            const total = Number(
              update.totalRows ?? update.total ?? 0
            );
            const statusRaw = String(
              update.status ?? update.state ?? "PROCESSING"
            ).toUpperCase() as UploadProgress["status"];
            const rawFailures = update.failures ?? update.errors ?? update.failedRows;

            setProgress({
              percent,
              processed,
              total,
              status: statusRaw,
              currentRow: update.currentRow || update.currentRecord || update.message,
              error: update.error || update.errorMessage,
            });

            if (statusRaw === "COMPLETED") {
              stopTimer();
              if (rawFailures && Array.isArray(rawFailures)) {
                setFailures(rawFailures);
                console.log("Upload Finished! Failures:", rawFailures);
              }
            } else if (statusRaw === "ERROR") {
              stopTimer();
              setProgress((prev) => ({
                ...prev,
                status: "ERROR",
                error: update.error || update.errorMessage || "Backend returned an error.",
              }));
            }
          } catch (parseError) {
            console.warn("Failed to parse stream line:", line, parseError);
          }
        }
      }
    } catch (err: unknown) {
      stopTimer();
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      const message = err instanceof Error ? err.message : "Unexpected error during upload";
      setProgress((prev) => ({
        ...prev,
        status: "ERROR",
        error: message,
      }));
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleUpload(droppedFile);
    }
  }, []);

  // Generates real .xlsx file in memory and streams it
  const generateDemoExcelFile = () => {
    const list = [...DEMO_USERS_RAW];
    for (let i = 1; i <= 35; i++) {
      list.push({
        name: `Excel User ${i}`,
        email: `excel.user${i}@corporate.com`,
        role: "Specialist",
        department: "Operations",
      });
    }

    const worksheet = XLSX.utils.json_to_sheet(list, {
      header: ["name", "email", "role", "department"],
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Users");

    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const excelBlob = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const excelFile = new File([excelBlob], "demo_users_upload.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    handleUpload(excelFile);
  };

  const downloadExcelTemplate = () => {
    const sampleData = [
      { name: "Alice Smith", email: "alice@example.com", role: "Developer", department: "Engineering" },
      { name: "Bob Jones", email: "bob@example.com", role: "Product Manager", department: "Product" },
      { name: "Carol White", email: "carol@example.com", role: "UX Designer", department: "Design" },
      { name: "David Brown", email: "david@example.com", role: "DevOps Lead", department: "Infrastructure" },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Users Template");
    XLSX.writeFile(workbook, "bulk_users_template.xlsx");
  };

  const downloadCsvTemplate = () => {
    const sampleCsv = [
      "name,email,role,department",
      "Alice Smith,alice@example.com,Developer,Engineering",
      "Bob Jones,bob@example.com,Product Manager,Product",
      "Carol White,carol@example.com,UX Designer,Design",
      "David Brown,david@example.com,DevOps Lead,Infrastructure",
    ].join("\n");

    const blob = new Blob([sampleCsv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bulk_users_template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportFailuresCsv = () => {
    if (failures.length === 0) return;
    const header = "Row Number,Item,Failure Reason\n";
    const body = failures
      .map((f) => `${f.row},"${(f.item || "").replace(/"/g, '""')}","${f.reason.replace(/"/g, '""')}"`)
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `upload_failures_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const isUploading = progress.status === "STARTING" || progress.status === "PROCESSING";
  const isCompleted = progress.status === "COMPLETED";
  const isError = progress.status === "ERROR";

  const successCount = Math.max(0, progress.processed - failures.length);
  const rowsPerSec =
    elapsedSeconds > 0 && progress.processed > 0
      ? (progress.processed / elapsedSeconds).toFixed(1)
      : null;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Upload Zone Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-6 sm:p-8 backdrop-blur-sm transition-all duration-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-lg">
                <Users className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Bulk User Stream Ingestion
              </h2>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Supports <strong className="text-slate-700 dark:text-slate-300">Excel (.xlsx, .xls)</strong> &{" "}
              <strong className="text-slate-700 dark:text-slate-300">CSV</strong> files. Watch live streaming ingestion and validation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              id="download-excel-template-btn"
              type="button"
              onClick={downloadExcelTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200/60 dark:border-emerald-800/60 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Excel (.xlsx) Template
            </button>

            <button
              id="download-csv-template-btn"
              type="button"
              onClick={downloadCsvTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              CSV Template
            </button>

            <button
              id="demo-excel-btn"
              type="button"
              disabled={isUploading}
              onClick={generateDemoExcelFile}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 hover:opacity-95 rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]"
            >
              <Sparkles className="w-3.5 h-3.5" />
              1-Click Excel Demo
            </button>
            <button
              id="endpoint-settings-toggle-btn"
              type="button"
              onClick={() => setShowSettings((prev) => !prev)}
              className={`p-1.5 rounded-lg border text-xs transition-colors ${
                showSettings
                  ? "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-300"
                  : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
              title="Configure Backend Endpoint"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Collapsible Endpoint Settings Panel */}
        {showSettings && (
          <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3 text-xs">
            <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-200">
              <span>Backend Endpoint Configuration</span>
              <span className="text-[11px] font-normal text-slate-500">
                Change URL to connect to your own backend server
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-slate-600 dark:text-slate-400 font-medium">
                  Streaming POST URL:
                </label>
                <input
                  id="endpoint-url-input"
                  type="text"
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  placeholder="e.g. /api/v1/users/upload/stream or http://localhost:8080/..."
                  className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-600 dark:text-slate-400 font-medium">
                  Form Field Name:
                </label>
                <input
                  id="form-field-name-input"
                  type="text"
                  value={formFieldName}
                  onChange={(e) => setFormFieldName(e.target.value)}
                  placeholder="file"
                  className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-500">
              <span className="font-medium">Quick Presets:</span>
              <button
                type="button"
                onClick={() => setEndpointUrl("/api/v1/users/upload/stream")}
                className="px-2 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded hover:text-blue-600"
              >
                Local Route (/api/v1/...)
              </button>
              <button
                type="button"
                onClick={() => setEndpointUrl("http://localhost:8080/api/v1/users/upload/stream")}
                className="px-2 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded hover:text-blue-600"
              >
                Spring/Java (:8080)
              </button>
              <button
                type="button"
                onClick={() => setEndpointUrl("http://localhost:5000/api/v1/users/upload/stream")}
                className="px-2 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded hover:text-blue-600"
              >
                Express/Flask (:5000)
              </button>
              <button
                type="button"
                onClick={() => setEndpointUrl("http://localhost:8000/api/v1/users/upload/stream")}
                className="px-2 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded hover:text-blue-600"
              >
                FastAPI/Django (:8000)
              </button>
            </div>
          </div>
        )}

        {/* Drag and Drop Container */}
        {progress.status === "IDLE" ? (
          <div
            id="drag-drop-zone"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`mt-6 border-2 border-dashed rounded-xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center ${
              isDragging
                ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 scale-[1.01]"
                : "border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 bg-slate-50/50 dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-800/40"
            }`}
          >
            <input
              id="file-upload-input"
              ref={fileInputRef}
              type="file"
              accept=".csv, .xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, text/csv"
              className="hidden"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) handleUpload(picked);
              }}
            />
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/80 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4 shadow-inner">
              <FileSpreadsheet className="w-8 h-8 animate-pulse" />
            </div>
            <p className="text-base font-medium text-slate-800 dark:text-slate-200">
              Drag & drop your <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Excel (.xlsx, .xls)</span> or CSV file here, or{" "}
              <span className="text-blue-600 dark:text-blue-400 underline underline-offset-2">
                browse files
              </span>
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
              Accepts columns: <code className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 rounded text-slate-700 dark:text-slate-300">name, email, role, department</code>
            </p>
          </div>
        ) : (
          /* Active Processing View */
          <div className="mt-6 space-y-6">
            {/* File info bar */}
            <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-lg">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate max-w-xs sm:max-w-md">
                    {file?.name || "Uploaded User File"}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {file ? `${(file.size / 1024).toFixed(1)} KB` : "Streaming source"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isUploading && (
                  <button
                    id="cancel-upload-btn"
                    type="button"
                    onClick={cancelUpload}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 dark:text-red-400 rounded-lg transition-colors"
                  >
                    <StopCircle className="w-3.5 h-3.5" />
                    Cancel
                  </button>
                )}

                {(isCompleted || isError) && (
                  <button
                    id="reset-upload-btn"
                    type="button"
                    onClick={resetUpload}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 dark:text-blue-400 rounded-lg transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Upload Another File
                  </button>
                )}
              </div>
            </div>

            {/* Live Progress Bar and Indicators */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      isUploading
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 animate-pulse"
                        : isCompleted
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                        : "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400"
                    }`}
                  >
                    {isUploading && <RefreshCw className="w-3 h-3 animate-spin" />}
                    {isCompleted && <CheckCircle2 className="w-3 h-3" />}
                    {isError && <AlertCircle className="w-3 h-3" />}
                    {progress.status}
                  </span>

                  {progress.currentRow && isUploading && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px] sm:max-w-xs font-mono">
                      {progress.currentRow}
                    </span>
                  )}
                </div>

                <div className="text-right">
                  <span className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {progress.percent.toFixed(1)}%
                  </span>
                  <span className="text-xs text-slate-400 ml-1.5">
                    ({progress.processed} / {progress.total} users)
                  </span>
                </div>
              </div>

              {/* Enhanced animated progress bar */}
              <div className="relative w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                <div
                  className={`h-full transition-all duration-300 ease-out rounded-full ${
                    isCompleted
                      ? "bg-emerald-500"
                      : isError
                      ? "bg-red-500"
                      : "bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-500"
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
                />
              </div>

              {/* Progress meta stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                    Processed
                  </div>
                  <div className="text-lg font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                    {progress.processed}{" "}
                    <span className="text-xs font-normal text-slate-400">/ {progress.total}</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div className="text-[11px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">
                    Valid / Ingested
                  </div>
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {successCount}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div className="text-[11px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold">
                    Failures
                  </div>
                  <div className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                    {failures.length}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                    Throughput
                  </div>
                  <div className="text-lg font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                    {rowsPerSec ? `${rowsPerSec}/s` : "--"}
                    <span className="text-xs font-normal text-slate-400 ml-1">
                      ({elapsedSeconds}s)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Error banner if error occurred */}
            {isError && progress.error && (
              <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-red-800 dark:text-red-300">
                    Upload Stream Stopped
                  </h4>
                  <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                    {progress.error}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Failures & Validation Report Section */}
      {failures.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 rounded-2xl shadow-lg overflow-hidden transition-all duration-200">
          <div className="p-4 sm:p-5 bg-amber-50/70 dark:bg-amber-950/30 flex items-center justify-between border-b border-amber-200/80 dark:border-amber-900/60">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-400 rounded-lg">
                <AlertCircle className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Validation Failures Detected ({failures.length})
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <button
                id="export-failures-btn"
                type="button"
                onClick={exportFailuresCsv}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-300 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/50 dark:hover:bg-amber-900/80 rounded-md transition-colors"
              >
                <Download className="w-3 h-3" />
                Export Failures (.csv)
              </button>

              <button
                id="toggle-failures-view-btn"
                type="button"
                onClick={() => setShowFailures((prev) => !prev)}
                className="p-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded transition-colors"
              >
                {showFailures ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {showFailures && (
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-800">
                    <th className="py-2.5 px-4 w-20">Row</th>
                    <th className="py-2.5 px-4">Identifier / Value</th>
                    <th className="py-2.5 px-4">Failure Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {failures.map((f, idx) => (
                    <tr
                      key={`${f.row}-${idx}`}
                      className="hover:bg-amber-50/30 dark:hover:bg-amber-950/10 transition-colors"
                    >
                      <td className="py-2 px-4 font-mono text-slate-500 font-medium">#{f.row}</td>
                      <td className="py-2 px-4 text-slate-800 dark:text-slate-200 font-medium">
                        {f.item || "-"}
                      </td>
                      <td className="py-2 px-4 text-red-600 dark:text-red-400">
                        {f.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Guide & Capabilities Info Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-1.5">
            <FileSpreadsheet className="w-4 h-4" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Excel (.xlsx, .xls) & CSV
            </h4>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Directly parse multi-column spreadsheets and CSVs without client overhead.
          </p>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 mb-1.5">
            <AlertCircle className="w-4 h-4" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Per-Row Validation
            </h4>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Live duplicate detection, required field verification, and regex syntax checking.
          </p>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1.5">
            <Sparkles className="w-4 h-4" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Real-Time Stream
            </h4>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Server-Sent Events stream row-by-row updates with zero polling and low memory usage.
          </p>
        </div>
      </div>
    </div>
  );
}
