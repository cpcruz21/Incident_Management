'use client';

import React from 'react';

interface ExecutiveRemarksCardProps {
  remarks: string;
}

/** A compact report-style narrative, with text labels as well as status colors. */
export function ExecutiveRemarksCard({ remarks }: ExecutiveRemarksCardProps) {
  if (!remarks?.trim()) return null;

  return (
    <section
      className="monthly-remarks-card"
      aria-label="Remarks for overall result"
    >
      <h3>
        Remarks for overall result
      </h3>
      <div className="monthly-remarks-copy">
        {remarks.trim().split(/\n\s*\n/).map((paragraph, index) => (
          <div key={index} style={{ marginTop: index === 0 ? 0 : '16px' }}>
            {paragraph.split('\n').filter(Boolean).map((line, lineIndex) => {
              const kpi = line.match(/^(Target [^:]+): (Met|Not met|Failed|No data) \(([^)]+)\) - (.*)$/i);
              if (kpi) {
                const met = kpi[2].toLowerCase() === 'met';
                const noData = kpi[2].toLowerCase() === 'no data';
                return (
                  <p key={lineIndex} style={{ margin: 0 }}>
                    <strong>{kpi[1]}: </strong>
                    <strong style={{ color: noData
                      ? 'var(--ui-secondary, #cbd5e1)'
                      : met ? 'var(--ui-success, #34d399)' : 'var(--ui-danger, #f87171)' }}>
                      {kpi[2]} ({kpi[3]})
                    </strong>
                    {' — '}{kpi[4]}
                  </p>
                );
              }
              const nextSteps = line.startsWith('Next steps: ');
              return (
                <p key={lineIndex} style={{ margin: 0 }}>
                  {nextSteps ? <><strong>Next steps: </strong>{line.slice('Next steps: '.length)}</> : line}
                </p>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
