'use client';

import { useId } from 'react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const LAST_REPORT_YEAR = 2099;

export interface MonthlyPeriodSelection {
  month: string;
  year: string;
}

interface MonthlyPeriodPickerProps {
  value: MonthlyPeriodSelection;
  onChange: (value: MonthlyPeriodSelection) => void;
  disabled: boolean;
}

export function MonthlyPeriodPicker({ value, onChange, disabled }: MonthlyPeriodPickerProps) {
  const id = useId();
  const now = new Date();
  const firstYear = Math.min(LAST_REPORT_YEAR, new Date(now.getFullYear(), now.getMonth() - 23, 1).getFullYear());

  return (
    <div className="monthly-period-fields">
      <div className="report-setup-field">
        <label htmlFor={`${id}-month`}>Report month</label>
        <select id={`${id}-month`} value={value.month} disabled={disabled} onChange={(event) => onChange({ ...value, month: event.target.value })}>
          <option value="">Select month</option>
          {MONTHS.map((month) => <option key={month}>{month}</option>)}
        </select>
      </div>
      <div className="report-setup-field">
        <label htmlFor={`${id}-year`}>Report year</label>
        <select id={`${id}-year`} value={value.year} disabled={disabled} onChange={(event) => onChange({ ...value, year: event.target.value })}>
          <option value="">Select year</option>
          {Array.from({ length: LAST_REPORT_YEAR - firstYear + 1 }, (_, index) => {
            const year = firstYear + index;
            return <option key={year}>{year}</option>;
          })}
        </select>
      </div>
    </div>
  );
}
