'use client';

import { Check } from 'lucide-react';

export const incidentReportSteps = [
  { id: 'upload', label: 'Upload' },
  { id: 'validation', label: 'Validation' },
  { id: 'routing', label: 'Routing' },
  { id: 'previous-week', label: 'Previous week' },
  { id: 'report', label: 'Report' },
] as const;

interface StepperProps<StepId extends string> {
  steps: readonly { id: StepId; label: string }[];
  currentStep: StepId;
  onStepClick: (step: StepId) => void;
  availableSteps: readonly StepId[];
  busy?: boolean;
}

export function Stepper<StepId extends string>({
  steps, currentStep, onStepClick, availableSteps, busy,
}: StepperProps<StepId>) {
  const currentIndex = steps.findIndex((step) => step.id === currentStep);

  return (
    <nav className="report-progress" aria-label="Report progress">
      <ol className="report-progress-list">
        {steps.map(({ id, label }, index) => {
          const current = id === currentStep;
          const completed = index < currentIndex;
          const visitable = completed && availableSteps.includes(id) && !busy;
          const content = (
            <>
              <span className="report-progress-index" aria-hidden="true">{completed ? <Check size={14} /> : index + 1}</span>
              <span>{label}</span>
            </>
          );
          return (
            <li key={id} aria-current={current ? 'step' : undefined} data-complete={completed}>
              {visitable ? (
                <button className="report-progress-step" type="button" onClick={() => onStepClick(id)}>{content}</button>
              ) : (
                <span className="report-progress-step">{content}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
