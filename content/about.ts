export interface AboutSection {
  id: string;
  title: string;
  paragraphs: readonly string[];
}

export const ABOUT_SECTIONS = [
  {
    id: 'mission',
    title: 'Why RiskRadar exists',
    paragraphs: [
      'RiskRadar is being built to make local safety context easier to understand before a move, meetup, commute, stay, or property decision. The goal is not to sensationalise crime but to turn public evidence into something legible, mobile-friendly, and honest about uncertainty.',
      'The product aims to sit between raw open data and black-box fear marketing. That means cleaner wording, transparent limitations, and premium features that add real utility instead of fake certainty.',
    ],
  },
  {
    id: 'founder',
    title: 'Founder direction',
    paragraphs: [
      'RiskRadar is being developed as an independent product with a founder-led point of view: local evidence should be easier to explore without forcing users through jargon, giant spreadsheets, or vague city-level claims.',
      'The public-facing brand can grow without relying on a founder face. Methodology, changelog, support responsiveness, and technical transparency are part of how trust is earned here.',
    ],
  },
  {
    id: 'open-data',
    title: 'Open-data stance',
    paragraphs: [
      'RiskRadar depends on public and open-data style sources where possible, then adds product design, calibration, explanations, and member workflows around them.',
      'The raw data is not the product by itself. The value comes from postcode-focused analysis, explanation quality, comparisons, route ideas, Live Radar workflows, and a clearer trust layer.',
    ],
  },
  {
    id: 'business',
    title: 'How the business is intended to work',
    paragraphs: [
      'The long-term structure is free search for core access, Premium for heavier intelligence workflows, and business tools such as embeds, usage controls, and white-label options where they can be delivered honestly.',
      'Advertising, where used, must remain labelled and separate from scores, rankings, evidence, and safer-area suggestions.',
    ],
  },
] as const satisfies readonly AboutSection[];
