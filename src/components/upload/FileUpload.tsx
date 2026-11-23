'use client';

import { FileSpreadsheet, Upload } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { InvalidUploadDialog } from './InvalidUploadDialog';

interface FileUploadProps {
  onFileSelected: (file: File) => Promise<void>;
  isProcessing: boolean;
  disabledReason?: string;
}

const formats = ['XLSX', 'XLS', 'CSV'];

export function FileUpload({ onFileSelected, isProcessing, disabledReason }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFile, setPendingFile] = useState<string>();
  const [failure, setFailure] = useState<{ fileName?: string; issue: Error }>();
  const input = useRef<HTMLInputElement>(null);
  const chooseFileButton = useRef<HTMLButtonElement>(null);
  const validating = useRef(false);
  const helpId = useId();
  const disabled = isProcessing || Boolean(pendingFile || disabledReason);

  async function select(files: FileList | null) {
    if (disabled || validating.current || !files?.length) return;
    const file = files[0];
    const extension = file.name.split('.').at(-1)?.toUpperCase();
    if (files.length !== 1 || !extension || !formats.includes(extension) || !file.name.includes('.')) {
      setFailure({
        fileName: files.length === 1 ? file.name : undefined,
        issue: new Error('Choose one XLSX, XLS, or CSV file.'),
      });
      return;
    }
    validating.current = true;
    setPendingFile(file.name);
    try {
      await onFileSelected(file);
    } catch (issue) {
      setFailure({
        fileName: file.name,
        issue: issue instanceof Error ? issue : new Error('The file could not be read.'),
      });
    } finally {
      validating.current = false;
      setPendingFile(undefined);
    }
  }

  return (
    <div className="report-file-picker">
      <div className="report-dropzone" data-dragging={isDragging}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={(event) => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
            setIsDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          select(event.dataTransfer.files);
        }}
      >
        <input ref={input} type="file" hidden accept=".xlsx,.xls,.csv" disabled={disabled}
          onChange={(event) => {
            select(event.currentTarget.files);
            event.currentTarget.value = '';
          }} />
        <span className="report-file-icon" aria-hidden="true"><FileSpreadsheet size={22} /></span>
        <div className="report-file-copy">
          <strong>{pendingFile ?? 'Incident data file'}</strong>
          <p id={helpId}>{disabledReason || 'XLSX, XLS, or CSV'}</p>
          {(isProcessing || pendingFile) && <p role="status">Validating file...</p>}
        </div>
        <button ref={chooseFileButton} className="admin-primary" type="button" disabled={disabled}
          aria-describedby={helpId} onClick={() => input.current?.click()}>
          <Upload size={16} aria-hidden="true" /> Choose file
        </button>
      </div>
      {failure && (
        <InvalidUploadDialog
          {...failure}
          onClose={() => {
            setFailure(undefined);
            chooseFileButton.current?.focus();
          }}
        />
      )}
    </div>
  );
}
