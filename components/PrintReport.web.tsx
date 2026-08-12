import React from 'react';
import { Pressable, Text } from 'react-native';
import { Download } from 'lucide-react-native';
import tw from 'twrnc';

import type { MemberReport } from '../api/reports';
import { membershipStyles } from './membershipStyles';

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tableRows(rows: Array<Record<string, unknown>>, columns: string[]) {
  return rows.map((row) => (
    `<tr>${columns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join('')}</tr>`
  )).join('');
}

function buildReportHtml(report: MemberReport) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(report.title)}</title>
    <style>
      body { color: #0f172a; font-family: Arial, sans-serif; margin: 40px; }
      header { border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 28px; }
      h1 { font-size: 30px; margin: 0 0 8px; }
      h2 { font-size: 16px; margin: 28px 0 10px; }
      p { color: #475569; line-height: 1.55; }
      .meta { color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
      .score { font-size: 52px; font-weight: 900; color: #4f46e5; margin: 6px 0; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 20px 0; }
      .metric { border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; }
      .metric strong { display: block; font-size: 20px; margin-top: 6px; }
      table { border-collapse: collapse; width: 100%; margin-bottom: 18px; }
      th, td { border-bottom: 1px solid #e2e8f0; padding: 10px 0; text-align: left; }
      th { color: #64748b; font-size: 11px; text-transform: uppercase; }
      a { color: #4f46e5; }
      footer { border-top: 1px solid #e2e8f0; margin-top: 32px; padding-top: 18px; font-size: 12px; color: #64748b; }
      @media print { body { margin: 24px; } button { display: none; } }
    </style>
  </head>
  <body>
    <header>
      <div class="meta">RiskRadar Premium Report</div>
      <h1>${escapeHtml(report.label)} - ${escapeHtml(report.postcode)}</h1>
      <p>${escapeHtml(report.adminDistrict)}. Generated ${escapeHtml(report.generatedDateDisplay)} from ${escapeHtml(report.dataMonthDisplay)} Police.uk data.</p>
      <div class="score">${escapeHtml(report.score)}/100</div>
    </header>
    <section class="grid">
      <div class="metric"><span>Incidents</span><strong>${escapeHtml(report.totalIncidents)}</strong></div>
      <div class="metric"><span>Radius</span><strong>${escapeHtml(report.postcodeRadiusMeters)}m</strong></div>
      <div class="metric"><span>Trend</span><strong>${escapeHtml(report.trend.direction)}</strong></div>
    </section>
    <h2>Summary</h2>
    <p>${escapeHtml(report.summary)}</p>
    <p>${escapeHtml(report.changeSummary || report.trend.summary)}</p>
    <h2>Score Method</h2>
    <p><strong>${escapeHtml(report.scoreMethod.name)}</strong>${report.scoreMethod.explanation ? `: ${escapeHtml(report.scoreMethod.explanation)}` : ''}</p>
    <h2>Category Breakdown</h2>
    <table>
      <thead><tr><th>Category</th><th>Count</th></tr></thead>
      <tbody>${tableRows(report.categoryBreakdown, ['label', 'count'])}</tbody>
    </table>
    <h2>Category Changes</h2>
    <table>
      <thead><tr><th>Category</th><th>Current</th><th>Previous</th><th>Direction</th></tr></thead>
      <tbody>${tableRows(report.categoryChanges, ['label', 'currentCount', 'previousCount', 'direction'])}</tbody>
    </table>
    <h2>Hotspot Roads</h2>
    <table>
      <thead><tr><th>Approximate mapped road</th><th>Count</th></tr></thead>
      <tbody>${tableRows(report.hotspotRoads, ['name', 'count'])}</tbody>
    </table>
    <h2>Official Evidence</h2>
    <table>
      <thead><tr><th>Category</th><th>Mapped road</th><th>Month</th><th>Source</th></tr></thead>
      <tbody>${report.officialEvidence.map((item) => `<tr><td>${escapeHtml(item.categoryLabel)}</td><td>${escapeHtml(item.locationStreet)}</td><td>${escapeHtml(item.monthDisplay)}</td><td><a href="${escapeHtml(item.officialCaseUrl)}">Police.uk record</a></td></tr>`).join('')}</tbody>
    </table>
    <footer>${escapeHtml(report.disclaimer)}</footer>
    <script>window.addEventListener('load', function () { window.print(); });</script>
  </body>
</html>`;
}

export default function PrintReport({ report }: { report: MemberReport }) {
  const print = () => {
    const printWindow = window.open('', '_blank', 'width=920,height=1100');
    if (!printWindow) {
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildReportHtml(report));
    printWindow.document.close();
  };

  return (
    <Pressable onPress={print} accessibilityRole="button" style={({ pressed }) => [membershipStyles.primaryButton, pressed && tw`opacity-80`]}>
      <Download size={18} color="white" />
      <Text style={tw`text-white font-black ml-2`}>Print or save as PDF</Text>
    </Pressable>
  );
}
