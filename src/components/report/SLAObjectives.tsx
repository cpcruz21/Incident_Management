import type { Ref } from 'react';

export function SLAObjectives({ label, panelRef }: {
  label: string;
  panelRef: Ref<HTMLDivElement>;
}) {
  return (
    <div ref={panelRef} className="sla-objectives">
      <table aria-label={label}>
        <thead>
          <tr>
            <th scope="col">Objective Statement</th>
            <th scope="col">Target</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td rowSpan={2}>Ensure timely incident response and resolution in accordance with SLA targets</td>
            <th scope="row">85% compliance with MTTA <span>(Mean Time to Acknowledge)</span></th>
          </tr>
          <tr>
            <th scope="row">85% compliance with MTTR <span>(Mean Time to Resolve)</span></th>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
