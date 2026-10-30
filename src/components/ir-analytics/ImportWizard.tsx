'use client';

import React, { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import type { IRRawRow, IRColumnMapping, ImportBatch } from '@/types/ir-analytics';
import { autoDetectIRMapping, processImportBatch } from '@/lib/ir-analytics/engine';
import type { NormalizedTicket } from '@/types/ir-analytics';

interface ImportWizardProps {
  existingTickets: NormalizedTicket[];
  existingBatches: ImportBatch[];
  onImportComplete: (tickets: NormalizedTicket[], batch: ImportBatch) => void;
  onClose: () => void;
}

type WizardStep = 'upload' | 'preview' | 'mapping' | 'confirm' | 'done';

const FIELD_LABELS: Record<keyof IRColumnMapping, string> = {
  irId: 'IR ID',
  ticketId: 'Ticket / Request ID',
  technician: 'Technician / Assignee',
  incidentType: 'Incident Type / Category',
  status: 'Ticket Status',
  createdDate: 'Created Date',
  lastUpdated: 'Last Updated Date',
  resolvedDate: 'Resolved / Completed Date',
  department: 'Department / Team',
  remarks: 'Remarks / Progress Notes',
  requester: 'Requester / Reporter',
  priority: 'Priority',
  description: 'Description / Subject',
};

export function ImportWizard({ existingTickets, existingBatches, onImportComplete, onClose }: ImportWizardProps) {
  const [step, setStep] = useState<WizardStep>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [rawRows, setRawRows] = useState<IRRawRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<IRColumnMapping>({});
  const [batchResult, setBatchResult] = useState<{ tickets: NormalizedTicket[]; batch: ImportBatch } | null>(null);
  const [parseError, setParseError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parseFile = useCallback(async (file: File) => {
    setParseError('');
    setIsProcessing(true);

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      setParseError('Unsupported file format. Please use CSV, XLSX, or XLS.');
      setIsProcessing(false);
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true, raw: false });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error('No sheets found in workbook.');

      const ws = wb.Sheets[sheetName];

      // Try to find a header row in the first 20 rows
      const rawArr = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' });
      let headerRowIdx = 0;
      for (let i = 0; i < Math.min(rawArr.length, 20); i++) {
        const row = rawArr[i];
        if (Array.isArray(row)) {
          const s = row.join(' ').toLowerCase();
          if ((s.includes('id') || s.includes('ticket') || s.includes('request')) &&
            (s.includes('status') || s.includes('technician') || s.includes('date') || s.includes('type'))) {
            headerRowIdx = i;
            break;
          }
        }
      }

      const jsonData = XLSX.utils.sheet_to_json<IRRawRow>(ws, {
        defval: '',
        raw: false,
        range: headerRowIdx,
      });

      if (!jsonData.length) throw new Error('No data rows found.');

      const cols = Object.keys(jsonData[0]);
      setColumns(cols);
      setRawRows(jsonData);
      setFileName(file.name);

      // Auto-detect mapping
      const detected = autoDetectIRMapping(cols);
      setMapping(detected);

      setStep('preview');
    } catch (err) {
      setParseError(`Parse error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  };

  const handleConfirmImport = () => {
    setIsProcessing(true);
    const batchId = `batch-${Date.now()}`;
    const { newTickets, batchStats } = processImportBatch(rawRows, mapping, batchId, existingTickets);

    const batch: ImportBatch = {
      id: batchId,
      fileName,
      importedAt: new Date().toISOString(),
      totalRows: batchStats.totalRows,
      acceptedRows: batchStats.acceptedRows,
      rejectedRows: batchStats.rejectedRows,
      duplicateRows: batchStats.duplicateRows,
      uniqueIRs: batchStats.uniqueIRs,
      uniqueTickets: batchStats.uniqueTickets,
      columnMapping: mapping,
    };

    setBatchResult({ tickets: newTickets, batch });
    setStep('done');
    setIsProcessing(false);
  };

  const sectionHeader = (text: string) => (
    <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc', marginBottom: '12px' }}>{text}</h3>
  );

  // ── Step: Upload ──
  if (step === 'upload') {
    return (
      <WizardWrapper onClose={onClose} title="Import Data" step={1} totalSteps={4}>
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${isDragging ? '#3b82f6' : '#334e68'}`,
            borderRadius: '12px',
            padding: '48px 24px',
            textAlign: 'center',
            cursor: 'pointer',
            background: isDragging ? 'rgba(59,130,246,0.08)' : 'rgba(20,37,63,0.5)',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📂</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
            Drop your file here or click to browse
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>Supports CSV, XLSX, XLS</div>
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} style={{ display: 'none' }} />
        </div>

        {isProcessing && (
          <div style={{ textAlign: 'center', padding: '16px', color: '#94a3b8', fontSize: '13px' }}>
            <div className="spinner" style={{ margin: '0 auto 8px' }} />
            Parsing file…
          </div>
        )}
        {parseError && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '12px', color: '#fca5a5', fontSize: '12px', marginTop: '12px' }}>
            ⚠️ {parseError}
          </div>
        )}

        {/* Previous import batches */}
        {existingBatches.length > 0 && (
          <div style={{ marginTop: '24px' }}>
            {sectionHeader('Previous Import Batches')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {existingBatches.map((b) => (
                <div key={b.id} style={{ background: '#0d1a2e', border: '1px solid #243650', borderRadius: '8px', padding: '12px', fontSize: '12px' }}>
                  <div style={{ fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>{b.fileName}</div>
                  <div style={{ color: '#64748b' }}>
                    {new Date(b.importedAt).toLocaleString()} · {b.totalRows} rows · {b.uniqueTickets} unique tickets · {b.duplicateRows} duplicates
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: '11px', color: '#64748b', marginTop: '8px' }}>
              ℹ️ Re-importing the same file will update existing records without inflating totals.
            </p>
          </div>
        )}
      </WizardWrapper>
    );
  }

  // ── Step: Preview ──
  if (step === 'preview') {
    const previewRows = rawRows.slice(0, 5);
    return (
      <WizardWrapper onClose={onClose} title="Data Preview" step={2} totalSteps={4}
        onBack={() => { setStep('upload'); setRawRows([]); setColumns([]); }}
        onNext={() => setStep('mapping')}
      >
        <div style={{ marginBottom: '12px', fontSize: '12px', color: '#94a3b8' }}>
          <span style={{ color: '#22c55e', fontWeight: 700 }}>✓ {rawRows.length} rows</span> parsed from{' '}
          <span style={{ fontWeight: 700, color: '#f8fafc' }}>{fileName}</span>
          {' · '}
          <span style={{ color: '#a78bfa' }}>{columns.length} columns detected</span>
        </div>

        <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '11px', width: '100%', minWidth: '600px' }}>
            <thead>
              <tr>
                {columns.slice(0, 10).map((col) => (
                  <th key={col} style={{ padding: '6px 8px', background: '#0d1a2e', border: '1px solid #243650', color: '#94a3b8', fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap' }}>
                    {col}
                  </th>
                ))}
                {columns.length > 10 && <th style={{ padding: '6px 8px', color: '#64748b', border: '1px solid #243650' }}>+{columns.length - 10} more</th>}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, i) => (
                <tr key={i}>
                  {columns.slice(0, 10).map((col) => (
                    <td key={col} style={{ padding: '5px 8px', border: '1px solid #1e3a5f', color: '#f8fafc', whiteSpace: 'nowrap', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {String(row[col] ?? '')}
                    </td>
                  ))}
                  {columns.length > 10 && <td style={{ border: '1px solid #1e3a5f', color: '#64748b' }}>…</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rawRows.length > 5 && (
          <p style={{ fontSize: '11px', color: '#64748b' }}>Showing first 5 of {rawRows.length} rows.</p>
        )}
      </WizardWrapper>
    );
  }

  // ── Step: Column Mapping ──
  if (step === 'mapping') {
    const fields = Object.keys(FIELD_LABELS) as (keyof IRColumnMapping)[];
    return (
      <WizardWrapper onClose={onClose} title="Column Mapping" step={3} totalSteps={4}
        onBack={() => setStep('preview')}
        onNext={() => setStep('confirm')}
      >
        <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>
          Map your source columns to dashboard fields. The system has auto-detected matches.
          Required fields: <span style={{ color: '#fca5a5' }}>IR ID</span> or <span style={{ color: '#fca5a5' }}>Ticket ID</span>.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {fields.map((field) => (
            <div key={field}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                {FIELD_LABELS[field]}
                {(field === 'irId' || field === 'ticketId') && ' *'}
              </label>
              <select
                value={mapping[field] ?? ''}
                onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value || undefined }))}
                style={{
                  background: '#0d1a2e',
                  border: `1px solid ${mapping[field] ? '#3b82f6' : '#243650'}`,
                  borderRadius: '6px',
                  color: mapping[field] ? '#f8fafc' : '#64748b',
                  fontSize: '11px',
                  padding: '6px 8px',
                  width: '100%',
                  appearance: 'none' as const,
                }}
              >
                <option value="">— Not mapped —</option>
                {columns.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
        {!mapping.irId && !mapping.ticketId && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '10px', color: '#fca5a5', fontSize: '12px', marginTop: '12px' }}>
            ⚠️ Please map at least IR ID or Ticket ID to proceed.
          </div>
        )}
      </WizardWrapper>
    );
  }

  // ── Step: Confirm ──
  if (step === 'confirm') {
    const mappedFields = Object.entries(mapping).filter(([, v]) => v);
    return (
      <WizardWrapper onClose={onClose} title="Confirm Import" step={4} totalSteps={4}
        onBack={() => setStep('mapping')}
        onNext={handleConfirmImport}
        nextLabel="Import Data"
        nextDisabled={isProcessing}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <InfoRow label="File" value={fileName} />
          <InfoRow label="Total Rows" value={String(rawRows.length)} />
          <InfoRow label="Columns Mapped" value={`${mappedFields.length} of ${Object.keys(FIELD_LABELS).length}`} />
          <InfoRow label="Existing Tickets" value={String(existingTickets.length)} />
        </div>
        <div style={{ marginTop: '16px' }}>
          <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', marginBottom: '8px' }}>COLUMN MAPPINGS</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {mappedFields.map(([field, col]) => (
              <div key={field} style={{ fontSize: '11px' }}>
                <span style={{ color: '#64748b' }}>{FIELD_LABELS[field as keyof IRColumnMapping]}: </span>
                <span style={{ color: '#93c5fd', fontWeight: 600 }}>{col as string}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: '8px', padding: '12px', marginTop: '16px', fontSize: '12px', color: '#93c5fd' }}>
          ℹ️ Duplicate ticket IDs within this batch will be de-duplicated, keeping the latest record.
          Records matching existing ticket IDs will update the existing records.
        </div>
        {isProcessing && (
          <div style={{ textAlign: 'center', padding: '16px', color: '#94a3b8' }}>
            <div className="spinner" style={{ margin: '0 auto 8px' }} />
            Processing…
          </div>
        )}
      </WizardWrapper>
    );
  }

  // ── Step: Done ──
  if (step === 'done' && batchResult) {
    const { batch } = batchResult;
    return (
      <WizardWrapper onClose={() => { onImportComplete(batchResult.tickets, batch); onClose(); }} title="Import Complete" hideClose>
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', marginBottom: '16px' }}>Import Successful</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', textAlign: 'left', marginBottom: '24px' }}>
            <StatBox label="Total Rows" value={batch.totalRows} color="#60a5fa" />
            <StatBox label="Accepted Rows" value={batch.acceptedRows} color="#22c55e" />
            <StatBox label="Duplicate Rows" value={batch.duplicateRows} color="#f59e0b" />
            <StatBox label="Unique Tickets" value={batch.uniqueTickets} color="#a78bfa" />
            <StatBox label="Unique IRs" value={batch.uniqueIRs} color="#38bdf8" />
          </div>
          <button
            type="button"
            onClick={() => { onImportComplete(batchResult.tickets, batch); onClose(); }}
            style={{
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 24px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            View Dashboard →
          </button>
        </div>
      </WizardWrapper>
    );
  }

  return null;
}

// ── Sub-components ──

function WizardWrapper({
  children,
  title,
  step,
  totalSteps,
  onBack,
  onNext,
  nextLabel = 'Next →',
  nextDisabled = false,
  onClose,
  hideClose = false,
}: {
  children: React.ReactNode;
  title: string;
  step?: number;
  totalSteps?: number;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  onClose?: () => void;
  hideClose?: boolean;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          background: '#0d1a2e',
          border: '1px solid #243650',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '720px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #243650', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#f8fafc', margin: 0 }}>{title}</h2>
            {step && totalSteps && (
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Step {step} of {totalSteps}</div>
            )}
          </div>
          {!hideClose && onClose && (
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '18px', padding: '4px' }}>×</button>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {children}
        </div>

        {/* Footer */}
        {(onBack || onNext) && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid #243650', display: 'flex', justifyContent: 'space-between' }}>
            {onBack ? (
              <button type="button" onClick={onBack} style={{ background: 'transparent', border: '1px solid #334e68', color: '#94a3b8', borderRadius: '8px', padding: '8px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                ← Back
              </button>
            ) : <div />}
            {onNext && (
              <button
                type="button"
                onClick={onNext}
                disabled={nextDisabled}
                style={{
                  background: nextDisabled ? '#1e293b' : '#2563eb',
                  color: nextDisabled ? '#64748b' : '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 20px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: nextDisabled ? 'not-allowed' : 'pointer',
                }}
              >
                {nextLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid #1e3a5f', paddingBottom: '8px' }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ color: '#f8fafc', fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: '#101f36', border: `1px solid ${color}30`, borderRadius: '8px', padding: '12px' }}>
      <div style={{ fontSize: '22px', fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>{label}</div>
    </div>
  );
}

