'use client';

import { Check } from 'lucide-react';

export function ArchiveReportButton({ onArchive, saving, archived, disabled }: {
  onArchive: () => void;
  saving: boolean;
  archived: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="report-save-button"
      data-archived={archived && !saving}
      onClick={onArchive}
      disabled={saving || disabled}
      aria-busy={saving}
    >
      {archived && !saving && <Check size={16} aria-hidden="true" />}
      <span aria-live="polite">{saving ? 'Saving…' : archived ? 'Archived' : 'Archive report'}</span>
    </button>
  );
}
