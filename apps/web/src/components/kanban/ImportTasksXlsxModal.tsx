'use client';

import React, { useRef, useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { importBatchTasks } from '../../lib/api';
import { useProject } from '../../context/ProjectContext';
import {
  X,
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ChevronRight,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedRow {
  _rowIndex: number;
  title: string;
  description?: string;
  ticketType?: string;
  priority?: string;
  status?: string;
  storyPoints?: number;
  dueDate?: string;
  deadline?: string; // alias for dueDate
  assigneeEmail?: string;
  _errors: string[];
}

interface ImportResult {
  importedCount: number;
  ticketKeys: string[];
  skippedCount: number;
  skippedRows: number[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// ── Column header normalisation ────────────────────────────────────────────────

function normalise(val: unknown): string {
  return String(val ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]+/g, '');
}

const COLUMN_MAP: Record<string, keyof Omit<ParsedRow, '_rowIndex' | '_errors'>> = {
  title: 'title',
  taskname: 'title',
  name: 'title',
  description: 'description',
  desc: 'description',
  notes: 'description',
  type: 'ticketType',
  tickettype: 'ticketType',
  tasktype: 'ticketType',
  priority: 'priority',
  status: 'status',
  state: 'status',
  storypoints: 'storyPoints',
  points: 'storyPoints',
  sp: 'storyPoints',
  duedate: 'dueDate',
  due: 'dueDate',
  deadline: 'deadline',
  assigneeemail: 'assigneeEmail',
  assignee: 'assigneeEmail',
  email: 'assigneeEmail',
  assignedto: 'assigneeEmail',
};

// ── XLSX parsing (dynamic import of xlsx module) ────────────────────────────

async function parseXlsxFile(file: File): Promise<ParsedRow[]> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: '',
    raw: false,
  });

  return raw.map((rowObj, idx) => {
    const mapped: ParsedRow = { _rowIndex: idx + 2, title: '', _errors: [] };

    for (const [rawKey, rawVal] of Object.entries(rowObj)) {
      const field = COLUMN_MAP[normalise(rawKey)];
      if (!field) continue;
      const val = String(rawVal ?? '').trim();

      if (field === 'storyPoints') {
        const n = Number(val);
        if (!isNaN(n) && val !== '') mapped.storyPoints = n;
      } else if (field === 'deadline') {
        // alias → dueDate
        if (val) mapped.dueDate = val;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapped as any)[field] = val;
      }
    }

    // Validate
    if (!mapped.title) mapped._errors.push('Title is required');
    if (mapped.assigneeEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mapped.assigneeEmail)) {
      mapped._errors.push('Invalid assignee email');
    }
    if (mapped.dueDate && mapped.dueDate !== '') {
      const d = new Date(mapped.dueDate);
      if (isNaN(d.getTime())) mapped._errors.push('Invalid date format');
    }

    return mapped;
  });
}

// ── Template download ──────────────────────────────────────────────────────────

async function downloadTemplate() {
  const XLSX = await import('xlsx');
  const headers = [
    'Title',
    'Description',
    'Type',
    'Priority',
    'Status',
    'Story Points',
    'Due Date',
    'Deadline',
    'Assignee Email',
  ];
  const example = [
    'Implement login page',
    'Build the OAuth2 login form with email/password fields',
    'TASK',
    'HIGH',
    'TODO',
    '3',
    '2025-12-31',
    '',
    'dev@company.com',
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws['!cols'] = headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tasks');
  XLSX.writeFile(wb, 'coretrack-task-import-template.xlsx');
}

// ── Badge helpers ──────────────────────────────────────────────────────────────

function PriorityBadge({ value }: { value: string }) {
  const colMap: Record<string, string> = {
    URGENT: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    HIGH: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
    MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    LOW: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  };
  const upper = value.toUpperCase();
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${colMap[upper] ?? colMap.MEDIUM}`}>
      {upper || 'MEDIUM'}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ImportTasksXlsxModal({ isOpen, onClose }: Props) {
  const { activeProject } = useProject();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);

  const validRows = rows.filter((r) => r._errors.length === 0);
  const invalidRows = rows.filter((r) => r._errors.length > 0);

  // ── Import mutation ──────────────────────────────────────────────────────────

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!activeProject) throw new Error('No project selected');
      const tasks = validRows.map((r) => ({
        title: r.title,
        description: r.description,
        ticketType: r.ticketType,
        priority: r.priority,
        status: r.status,
        storyPoints: r.storyPoints,
        dueDate: r.dueDate || undefined,
        assigneeEmail: r.assigneeEmail || undefined,
      }));
      return importBatchTasks(activeProject.key, tasks);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tickets', activeProject?.key] });
      setResult({
        importedCount: data.importedCount,
        ticketKeys: data.ticketKeys,
        skippedCount: invalidRows.length,
        skippedRows: invalidRows.map((r) => r._rowIndex),
      });
      setStep('done');
    },
  });

  // ── File handling ────────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setParseError('Please upload a valid .xlsx or .xls file.');
      return;
    }
    setParsing(true);
    setParseError(null);
    try {
      const parsed = await parseXlsxFile(file);
      if (parsed.length === 0) {
        setParseError('The file appears to be empty. Please add at least one task row.');
        setParsing(false);
        return;
      }
      setRows(parsed);
      setStep('preview');
    } catch (err) {
      setParseError(`Failed to parse file: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setParsing(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const reset = () => {
    setStep('upload');
    setRows([]);
    setResult(null);
    setParseError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!isOpen) return null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Import Tasks from XLSX</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {activeProject ? `Importing into project: ${activeProject.name} (${activeProject.key})` : 'No project selected'}
              </p>
            </div>
          </div>
          <button
            onClick={() => { reset(); onClose(); }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step: Upload */}
        {step === 'upload' && (
          <div className="flex-1 flex flex-col p-6 gap-5">
            {/* Template download */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900">
              <div>
                <p className="text-xs font-semibold text-blue-900 dark:text-blue-100">Start with a template</p>
                <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-0.5">
                  Download the XLSX template with correct column headers pre-filled.
                </p>
              </div>
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition cursor-pointer shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                Template
              </button>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex-1 min-h-[180px] flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition cursor-pointer ${isDragging
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                : 'border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
            >
              {parsing ? (
                <>
                  <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Parsing file…</p>
                </>
              ) : (
                <>
                  <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800">
                    <Upload className="h-7 w-7 text-slate-500 dark:text-slate-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Drag & drop your XLSX file here
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                      or click to browse — .xlsx / .xls files only
                    </p>
                  </div>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleInputChange}
            />

            {parseError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{parseError}</span>
              </div>
            )}

            {/* Column reference */}
            <div>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2">Expected columns</p>
              <div className="flex flex-wrap gap-1.5">
                {['Title *', 'Description', 'Type', 'Priority', 'Status', 'Story Points', 'Due Date / Deadline', 'Assignee Email'].map((col) => (
                  <span
                    key={col}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono ${col.endsWith('*') ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
                  >
                    {col}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Summary bar */}
            <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {validRows.length} valid row{validRows.length !== 1 ? 's' : ''}
              </span>
              {invalidRows.length > 0 && (
                <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {invalidRows.length} row{invalidRows.length !== 1 ? 's' : ''} with errors (will be skipped)
                </span>
              )}
            </div>

            {/* Preview table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/80 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 w-8">#</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">Title</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">Priority</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">Type</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">Assignee</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">Due Date</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const hasError = row._errors.length > 0;
                    return (
                      <React.Fragment key={row._rowIndex}>
                        <tr
                          className={`border-b border-slate-100 dark:border-slate-800/60 ${hasError
                            ? 'bg-rose-50/60 dark:bg-rose-950/20'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                            }`}
                        >
                          <td className="px-3 py-2 font-mono text-slate-400">{row._rowIndex}</td>
                          <td className="px-3 py-2 max-w-[200px] truncate">
                            {hasError ? (
                              <span className="text-slate-400 italic">{row.title || '—'}</span>
                            ) : (
                              <span className="font-semibold text-slate-900 dark:text-slate-100">{row.title}</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <PriorityBadge value={row.priority || 'MEDIUM'} />
                          </td>
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400 uppercase">{row.ticketType || 'TASK'}</td>
                          <td className="px-3 py-2 max-w-[160px] truncate text-slate-600 dark:text-slate-300">{row.assigneeEmail || '—'}</td>
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{row.dueDate || '—'}</td>
                          <td className="px-3 py-2 uppercase text-slate-500 dark:text-slate-400">{row.status || 'TODO'}</td>
                        </tr>
                        {hasError && (
                          <tr className="bg-rose-50/40 dark:bg-rose-950/10">
                            <td />
                            <td colSpan={6} className="px-3 pb-2 text-[10px] text-rose-600 dark:text-rose-400">
                              <AlertTriangle className="inline h-3 w-3 mr-1" />
                              {row._errors.join(' · ')}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <button
                onClick={reset}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                ← Choose different file
              </button>

              {importMutation.isError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {importMutation.error instanceof Error ? importMutation.error.message : 'Import failed'}
                </p>
              )}

              <button
                disabled={validRows.length === 0 || importMutation.isPending}
                onClick={() => importMutation.mutate()}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition cursor-pointer"
              >
                {importMutation.isPending ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Importing…</>
                ) : (
                  <><Upload className="h-3.5 w-3.5" /> Import {validRows.length} Task{validRows.length !== 1 ? 's' : ''}</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && result && (
          <div className="flex-1 flex flex-col items-center justify-center p-10 gap-5 text-center">
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {result.importedCount} Task{result.importedCount !== 1 ? 's' : ''} Imported
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Successfully created in <span className="font-semibold">{activeProject?.name}</span>
              </p>
            </div>

            {result.ticketKeys.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 max-w-md">
                {result.ticketKeys.slice(0, 20).map((k) => (
                  <span key={k} className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-mono text-slate-700 dark:text-slate-300">
                    {k}
                  </span>
                ))}
                {result.ticketKeys.length > 20 && (
                  <span className="px-2 py-0.5 text-[11px] text-slate-400">+{result.ticketKeys.length - 20} more</span>
                )}
              </div>
            )}

            {result.skippedCount > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300 text-xs text-left max-w-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  <strong>{result.skippedCount}</strong> row{result.skippedCount !== 1 ? 's' : ''} were skipped due to validation errors
                  (row{result.skippedRows.length !== 1 ? 's' : ''} {result.skippedRows.join(', ')}).
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={reset}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Import another file
              </button>
              <button
                onClick={() => { reset(); onClose(); }}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition cursor-pointer"
              >
                Done <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
