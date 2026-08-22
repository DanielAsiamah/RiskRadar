export type FaqCategory =
  | 'scores-and-data'
  | 'premium-and-billing'
  | 'privacy-and-safety'
  | 'business-and-support';

export interface FaqItem {
  id: string;
  category: FaqCategory;
  question: string;
  answer: string;
}

export const FAQ_ITEMS = [
  {
    id: 'score-method',
    category: 'scores-and-data',
    question: 'How is the RiskRadar score calculated?',
    answer: 'The current model starts with one published month of Police.uk incidents inside roughly 400 metres of the searched postcode. Local incident volume, offence-category thresholds, and violent-crime concentration shape the score. A wider area of roughly 900 metres can adjust the local score by no more than -2 to +5 points. The result is an area-intelligence indicator, not a prediction that a person will become a victim.',
  },
  {
    id: 'postcode-not-city',
    category: 'scores-and-data',
    question: 'Does London or another city receive a higher score by default?',
    answer: 'No. RiskRadar scores the searched postcode area from returned local evidence, not a city reputation or stereotype. Two postcodes in the same city can therefore receive different scores. City and borough names provide context only and do not add automatic danger points.',
  },
  {
    id: 'data-month',
    category: 'scores-and-data',
    question: 'What does the data month mean?',
    answer: 'Police.uk publishes street-level crime by recorded month, usually after a reporting delay. RiskRadar displays the newest usable month returned by the source and labels its freshness. It does not represent incidents happening live today.',
  },
  {
    id: 'approximate-roads',
    category: 'scores-and-data',
    question: 'Why do records say "on or near" a road?',
    answer: 'Public Police.uk locations are deliberately anonymised. A mapped point and its road label are approximate and may represent several incidents moved to a nearby map location. RiskRadar must not present them as an exact address, exact incident day, or named person.',
  },
  {
    id: 'official-evidence',
    category: 'scores-and-data',
    question: 'Can I inspect the evidence behind a result?',
    answer: 'Where the public source provides an evidence reference, RiskRadar links to the corresponding Police.uk record and shows the category, recorded month, and approximate mapped road. The official source can update or remove records, and some links expose structured public data rather than a news article.',
  },
  {
    id: 'premium',
    category: 'premium-and-billing',
    question: 'What is included with RiskRadar Premium?',
    answer: 'Premium is planned at GBP 15 per month and adds unlimited fair-use checks, watched places, deeper trends and comparisons, reports, Route Guard scans, Safety Sessions, alert controls, and an ad-free experience. Features that depend on newly published Police.uk data update when that source updates.',
  },
  {
    id: 'monthly-alerts',
    category: 'premium-and-billing',
    question: 'Are Premium alerts live police warnings?',
    answer: 'No. Monthly area alerts explain meaningful changes after a new Police.uk data month is available. They are not emergency notifications, live dispatch information, or a substitute for official travel, police, or emergency advice.',
  },
  {
    id: 'live-radar-web-vs-native',
    category: 'premium-and-billing',
    question: 'How does Live Radar differ on the web versus on a phone app?',
    answer: 'On the web, Live Radar works as a keep-open Journey Radar session and refreshes only while the page stays open. On a native build, Premium members can enable background monitoring on the device after granting foreground location, background location, and notification permissions.',
  },
  {
    id: 'live-radar-pro-only',
    category: 'premium-and-billing',
    question: 'Why is background Live Radar a Premium feature?',
    answer: 'Background monitoring uses additional device permissions, repeated area scans, and higher ongoing infrastructure cost than a normal postcode search. RiskRadar keeps public search available for everyone, while Premium funds the heavier monitoring experience and alert controls.',
  },
  {
    id: 'cancellation',
    category: 'premium-and-billing',
    question: 'Can I cancel Premium?',
    answer: 'Yes. Billing is managed securely through Stripe. Cancellation stops future renewal, while access normally continues until the end of the paid billing period shown in your account.',
  },
  {
    id: 'billing-recovery',
    category: 'premium-and-billing',
    question: 'I paid but Premium is still locked. What should I do?',
    answer: 'Sign in with the same email used to start checkout, open Membership, and choose Refresh status. Stripe webhook confirmation can take a short time. If access still does not appear, contact support with the account email and approximate payment time, but never send a full card number.',
  },
  {
    id: 'current-location',
    category: 'privacy-and-safety',
    question: 'Does the website continuously track my location?',
    answer: 'No. On the website, Use my current location requests permission for a one-time nearby-area lookup. RiskRadar does not claim background GPS monitoring in Safari or other browsers. Any future native Live Radar mode will require separate foreground, background-location, and notification permissions.',
  },
  {
    id: 'live-radar-permission-denied',
    category: 'privacy-and-safety',
    question: 'What happens if I deny Live Radar permissions?',
    answer: 'RiskRadar falls back safely. Without foreground location, it cannot scan your current area. Without background location or notifications, native Live Radar cannot keep monitoring in the background or surface local alerts, but normal postcode search and other public tools still work.',
  },
  {
    id: 'safety-limit',
    category: 'privacy-and-safety',
    question: 'Can RiskRadar guarantee a safe route or area?',
    answer: 'No. Public records are delayed, anonymised, and incomplete by nature. Scores, maps, Route Guard, and reports are informational area intelligence only. Stay aware of current conditions and use emergency services when immediate help is needed.',
  },
  {
    id: 'advertising',
    category: 'business-and-support',
    question: 'Can an advertiser change an area score?',
    answer: 'No. Paid placements must be labelled and kept separate from crime analysis, rankings, evidence, and safer-area suggestions. RiskRadar may reject or remove adverts that make misleading safety claims. Premium members receive an ad-free experience.',
  },
  {
    id: 'support',
    category: 'business-and-support',
    question: 'How can I contact RiskRadar?',
    answer: 'Email supr3ltd@gmail.com for account, billing, privacy, evidence, or business enquiries. Do not email sensitive payment-card information, passwords, or emergency reports.',
  },
] as const satisfies readonly FaqItem[];
