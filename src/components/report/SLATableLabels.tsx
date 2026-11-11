import { Clock3, Zap } from 'lucide-react';

type SLAMetric = 'response' | 'resolution';

export function SLAMetricHeading({ metric }: { metric: SLAMetric }) {
  const Icon = metric === 'response' ? Zap : Clock3;
  return (
    <span className="sla-metric-heading">
      <Icon size={15} aria-hidden="true" />
      {metric === 'response' ? 'First Response' : 'Resolution Time'}
    </span>
  );
}

