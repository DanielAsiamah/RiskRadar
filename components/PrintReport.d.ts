import { ComponentType } from 'react';
import type { MemberReport } from '../api/reports';

export interface PrintReportProps {
  report: MemberReport;
}

declare const PrintReport: ComponentType<PrintReportProps>;
export default PrintReport;
