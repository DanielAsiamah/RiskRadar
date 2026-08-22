export interface LimitationSection {
  id: string;
  title: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
}

export const LIMITATIONS_LAST_UPDATED = '22 August 2026';

export const LIMITATIONS_SECTIONS = [
  {
    id: 'delay',
    title: 'Public data is delayed',
    paragraphs: [
      'Police.uk crime data is published by recorded month and normally appears after a reporting delay. RiskRadar cannot turn that source into live dispatch or same-day incident truth.',
      'This is why the product surfaces the latest available month and confidence wording instead of pretending the result is happening live now.',
    ],
  },
  {
    id: 'anonymised',
    title: 'Street-level locations are approximate',
    paragraphs: [
      'Public points and roads are anonymised. A record saying "On or near Shopping Area" or "On or near Parkside Avenue" is not an exact address and may represent several incidents attached to a nearby map point.',
    ],
    bullets: [
      'No exact house or flat address',
      'No exact incident day from the street feed',
      'No named victim or suspect',
      'No promise that every record can be tied to one visible road segment',
    ],
  },
  {
    id: 'coverage',
    title: 'Not every risk appears in the dataset',
    paragraphs: [
      'A place may feel safer or less safe for reasons that are not fully visible in public street-level crime. Lighting, staffing, crowd flow, transport conditions, venue security, and very recent events may matter but not appear in the delayed public feed.',
      'RiskRadar should therefore be treated as one layer of area intelligence alongside common sense, official advice, and real-time context.',
    ],
  },
  {
    id: 'comparisons',
    title: 'Comparisons are local and model-based',
    paragraphs: [
      'Nearby-postcode ranking, safer alternatives, trend labels, and Route Guard summaries are model outputs derived from the available evidence and the current calibration rules. They are useful comparisons, not legal or official declarations.',
    ],
  },
  {
    id: 'platforms',
    title: 'Web and mobile do not behave the same',
    paragraphs: [
      'The website can support search, reports, current-location scans, and keep-open Journey Radar while the page remains open. It should not promise full background tracking in Safari or other browsers.',
      'Native Live Radar can go further with foreground location, background location, and notifications, but only after permission is granted and only on supported builds.',
    ],
  },
] as const satisfies readonly LimitationSection[];
