'use client';

import { FileSpreadsheet, Upload } from 'lucide-react';
import { useId, useRef, useState } from 'react';

interface FileUploadProps {
  onFileSelected: (file: File) => void;
  isProcessing: boolean;
}

const formats = ['XLSX', 'XLS', 'CSV'];

export function FileUpload({ onFileSelected, isProcessing }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File>();
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const helpId = useId();

  function select(files: FileList | null) {
    if (isProcessing || !files?.length) return;
    const file = files[0];
    const extension = file.name.split('.').at(-1)?.toUpperCase();
    if (files.length !== 1 || !extension || !formats.includes(extension) || !file.name.includes('.')) {
      setError('Choose one XLSX, XLS, or CSV file.');
      return;
    }
    setError('');
    setSelectedFile(file);
    onFileSelected(file);
  }

  return (
    <div className="report-file-picker">
      <div className="report-dropzone" data-dragging={isDragging}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = isProcessing ? 'none' : 'copy';
          if (!isProcessing) setIsDragging(true);
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
        <input ref={input} type="file" hidden accept=".xlsx,.xls,.csv" disabled={isProcessing}
          onChange={(event) => {
            select(event.currentTarget.files);
            event.currentTarget.value = '';
          }} />
        <span className="report-file-icon" aria-hidden="true"><FileSpreadsheet size={22} /></span>
        <div className="report-file-copy">
          <strong>{selectedFile?.name ?? 'Incident data file'}</strong>
          <p id={helpId}>XLSX, XLS, or CSV</p>
          {isProcessing && <p role="status">Validating file...</p>}
        </div>
        <button className="admin-primary" type="button" disabled={isProcessing} aria-describedby={helpId}
          onClick={() => input.current?.click()}>
          <Upload size={16} aria-hidden="true" /> {selectedFile ? 'Replace file' : 'Choose file'}
        </button>
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}
    </div>
  );
}
