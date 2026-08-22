export interface MethodologySection {
  id: string;
  title: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
}

export const METHODOLOGY_LAST_UPDATED = '22 August 2026';

export const METHODOLOGY_SECTIONS = [
  {
    id: 'scope',
    title: 'What RiskRadar scores',
    paragraphs: [
      'RiskRadar is designed to score a searched postcode or nearby mapped area, not an entire city by reputation. A result should reflect the returned local evidence around that target rather than broad assumptions about London, Nottingham, or any other place name.',
      'The score is an area-intelligence indicator built from delayed, anonymised public crime data. It is not an official safety grade, not a prediction that a specific person will become a victim, and not an emergency warning system.',
    ],
  },
  {
    id: 'inputs',
    title: 'Main data inputs',
    paragraphs: [
      'The current product relies mainly on Police.uk street-level crime, postcode lookup services, and OpenStreetMap-backed geocoding and map context.',
      'Each result also carries freshness and evidence-language so users can see when the latest usable public month was recorded and what the source can or cannot prove.',
    ],
    bullets: [
      'Police.uk recorded month for street-level crime categories',
      'Approximate mapped road labels such as "On or near Blackheath Hill"',
      'Postcode and nearby-location resolution for map, route, and Live Radar features',
      'Local area comparison and nearby-postcode context rather than city-wide stereotypes',
    ],
  },
  {
    id: 'score-shape',
    title: 'How the score is shaped',
    paragraphs: [
      'The current model is deliberately conservative. It starts with local incident evidence near the searched postcode, then applies category thresholds, violent-crime pressure, and a tightly capped wider-context adjustment.',
      'Exceptional scores are meant to be hard to reach. That means very high outputs should require stronger local evidence rather than ordinary urban background crime alone.',
    ],
    bullets: [
      'Local postcode-focused incident volume matters more than borough or city labels',
      'Violent crime can establish a higher local risk floor than non-violent categories alone',
      'Wider-context adjustment is intentionally small and cannot dominate the local reading',
      'Explanations aim to cite the strongest local reasons instead of generic fear language',
    ],
  },
  {
    id: 'dynamic-rules',
    title: 'Where dynamic rules fit',
    paragraphs: [
      'RiskRadar Pro is being built to support deeper timing and trend logic, including six-to-twelve-month movement, recent spike detection, and seasonal or time-based weighting when those rules can be explained honestly.',
      'Any future night-time, weekend, student move-in, or Christmas theft weighting should stay visible to the user rather than being hidden inside a black-box score.',
    ],
  },
  {
    id: 'alerts',
    title: 'How Live Radar and alerts work',
    paragraphs: [
      'Live Radar uses the same area-intelligence pipeline but applies it to your current location after permission is granted. Alerts are designed around meaningful threshold changes, not constant spam.',
      'The current alert rules target entering a higher-risk area, a score reaching 65 or above, or a score jump of at least 12 points where the new reading is at least 50. A cooldown reduces repeated alerts.',
    ],
  },
] as const satisfies readonly MethodologySection[];
