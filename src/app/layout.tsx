import type { Metadata, Viewport } from 'next';
import { EquicomLogoFilter } from '@/components/ui/EquicomLogoFilter';
import './globals.css';
import './theme.css';
import './report-workflow.css';
import './admin-light.css';
import './monthly-report.css';

const isUat = process.env.SMAC_UAT === 'true';

export const metadata: Metadata = {
  title: isUat ? 'SMAC Reporting | UAT' : 'SMAC Reporting',
  description: 'Incident management and reporting workspace.',
  robots: isUat ? { index: false, follow: false } : undefined,
};

export const viewport: Viewport = { colorScheme: 'light' };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {isUat && <div className="uat-notice">UAT · Use synthetic test data only</div>}
        <EquicomLogoFilter />{children}
      </body>
    </html>
  );
}
