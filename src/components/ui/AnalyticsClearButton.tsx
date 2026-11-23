import { RotateCcw } from 'lucide-react';

export function AnalyticsClearButton({ onClear, restoreFocus }: {
  onClear?: () => void;
  restoreFocus?: () => void;
}) {
  if (!onClear) return null;

  return (
    <button type="button" className="analytics-clear" aria-label="Clear dashboard selections"
      onClick={(event) => {
        const heading = event.currentTarget.closest('section')?.querySelector<HTMLElement>('h2, h3');
        onClear();
        if (heading) heading.focus({ preventScroll: true });
        else restoreFocus?.();
      }}>
      <RotateCcw size={14} aria-hidden="true" /> Clear
    </button>
  );
}
