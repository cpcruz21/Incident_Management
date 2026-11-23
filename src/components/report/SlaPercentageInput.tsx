'use client';

import { useState, type ChangeEvent } from 'react';

interface SlaPercentageInputProps {
  value: number | null | undefined;
  label: string;
  total?: boolean;
  onValueChange: (value: number | null) => void;
}

export function SlaPercentageInput({ value, label, total, onValueChange }: SlaPercentageInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const displayedValue = draft ?? value?.toFixed(2) ?? '';

  function handleChange({ currentTarget: input }: ChangeEvent<HTMLInputElement>) {
    const next = input.value;
    const number = next === '' ? null : Number(next);
    if (number !== null && (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(next) || number > 100)) {
      const caret = Math.max(0, (input.selectionStart ?? next.length) - (next.length - displayedValue.length));
      input.value = displayedValue;
      input.setSelectionRange(caret, caret);
      return;
    }

    setDraft(next);
    if (number !== (value ?? null)) onValueChange(number);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      className={total ? 'sla-input sla-input-total' : 'sla-input'}
      placeholder="N/A"
      aria-label={label}
      value={displayedValue}
      onChange={handleChange}
      onBlur={() => setDraft(null)}
    />
  );
}
