import { Moon, Sun } from 'lucide-react';
import type { Appearance } from './useAppearancePreference';

export function AppearanceSwitch({ label, value, onChange }: {
  label: string;
  value: Appearance;
  onChange: (appearance: Appearance) => void;
}) {
  return (
    <div className="dashboard-theme-switch" role="group" aria-label={label}>
      <button type="button" aria-label="Light" title="Light mode" aria-pressed={value === 'light'} onClick={() => onChange('light')}>
        <Sun size={13} aria-hidden="true" />
      </button>
      <button type="button" aria-label="Night" title="Night mode" aria-pressed={value === 'night'} onClick={() => onChange('night')}>
        <Moon size={13} aria-hidden="true" />
      </button>
    </div>
  );
}
