'use client';

import { Fragment, useEffect, useId, useRef } from 'react';
import { FileSpreadsheet, X } from 'lucide-react';
import { MissingIncidentColumnsError } from '@/lib/excel/incident-upload';

export function InvalidUploadDialog({ fileName, issue, onClose }: {
  fileName?: string;
  issue: Error;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function dismiss() {
    dialog.current?.close();
    onClose();
  }

  return (
    <dialog
      ref={dialog}
      className="raw-upload-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-message`}
      onCancel={event => {
        event.preventDefault();
        dismiss();
      }}
    >
      <header className="raw-upload-dialog__header">
        <span className="raw-upload-dialog__warning" aria-hidden="true">!</span>
        <h2 id={`${id}-title`}>Upload blocked</h2>
        <button className="raw-upload-dialog__close" type="button" aria-label="Close upload dialog"
          onClick={dismiss} autoFocus>
          <X aria-hidden="true" />
        </button>
      </header>
      {fileName && (
        <div className="raw-upload-dialog__file">
          <FileSpreadsheet aria-hidden="true" />
          <span>{fileName}</span>
        </div>
      )}
      <div id={`${id}-message`} className="raw-upload-dialog__message">
        {issue instanceof MissingIncidentColumnsError ? (
          <>
            <p>
              {issue.summary}
              <span className="raw-upload-dialog__columns">
                ({issue.columns.map((column, index) => (
                  <Fragment key={column}>
                    {index > 0 && ', '}<strong>{column}</strong>
                  </Fragment>
                ))}).
              </span>
            </p>
            <p>{issue.guidance}</p>
          </>
        ) : <p>{issue.message}</p>}
      </div>
    </dialog>
  );
}
