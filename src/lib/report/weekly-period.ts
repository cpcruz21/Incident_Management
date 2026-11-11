const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

function parseCalendarDate(value: string): Date | undefined {
  const parts = /^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i.exec(value.trim());
  if (!parts) return;
  const [, name, day, year] = parts;
  const lower = name.toLowerCase();
  const month = MONTHS.findIndex(full => lower === full || lower === full.slice(0, 3));
  if (month < 0) return;

  const date = new Date(Date.UTC(Number(year), month, Number(day)));
  if (date.getUTCMonth() === month && date.getUTCDate() === Number(day) && date.getUTCFullYear() === Number(year)) {
    return date;
  }
}

function formatDate(date: Date) {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${month}-${day}-${date.getUTCFullYear()}`;
}

export function formatWeeklyReportRange(period = ''): { from?: string; to?: string } {
  const label = period.trim();
  const weekOf = /^week of\s+(.+)$/i.exec(label);
  if (weekOf) {
    const end = parseCalendarDate(weekOf[1]);
    if (!end) return {};
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 7);
    // The report strip uses the same weekly cutoff as the Aging report.
    return { from: `${formatDate(start)} 13:00`, to: `${formatDate(end)} 13:00` };
  }

  const parts = label.split(/\s+-\s+|\s*[–—]\s*/);
  if (parts.length !== 2) return {};
  const [fromText, toText] = parts;
  const end = parseCalendarDate(toText);
  if (!end) return {};
  const start = parseCalendarDate(fromText) ?? parseCalendarDate(`${fromText}, ${end.getUTCFullYear()}`);
  return start && start <= end ? { from: formatDate(start), to: formatDate(end) } : {};
}
