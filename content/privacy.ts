export interface PrivacySection {
  id: string;
  title: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
}

export const PRIVACY_LAST_UPDATED = '21 August 2026';

export const PRIVACY_SECTIONS = [
  {
    id: 'overview',
    title: 'Privacy at a glance',
    paragraphs: [
      'RiskRadar uses the minimum information needed to answer area searches, provide accounts and Premium tools, and keep the service secure. Public crime records are about anonymised map locations, not people using RiskRadar.',
      'RiskRadar is informational area intelligence. It is not an emergency service and does not sell a claim that any person, road, or journey is guaranteed safe.',
    ],
  },
  {
    id: 'public-search',
    title: 'Public searches',
    paragraphs: [
      'A postcode or place search is sent to the RiskRadar backend so it can resolve the area and retrieve or cache relevant public data. Recent-search convenience data may be stored on the device. Normal service logs may contain technical request information needed for reliability, abuse prevention, and debugging.',
    ],
    bullets: [
      'The searched postcode or place name',
      'Public geocoding and Police.uk result data',
      'Technical request and error information where the hosting service provides it',
    ],
  },
  {
    id: 'location',
    title: 'Current-location suggestions',
    paragraphs: [
      'Use my current location runs only after device permission. On the website, coordinates are used for the requested nearby-area lookup and are not used for continuous background tracking. Keep-this-page-open journey tools may refresh only while the website is active.',
      'A future native Mobile Live Radar mode will have a separate permission flow and privacy explanation before any foreground or background location feature is enabled.',
    ],
  },
  {
    id: 'accounts',
    title: 'Accounts and saved places',
    paragraphs: [
      'Supabase provides passwordless account authentication. RiskRadar stores the account identifier and email needed to recognise the member. If you use Premium tools, RiskRadar also stores your watched postcodes, labels, alert preferences, report metadata, and alert history so those features work across sessions.',
      'Do not use a watched-place label to store private notes about another person.',
    ],
  },
  {
    id: 'billing',
    title: 'Payments and subscriptions',
    paragraphs: [
      'Stripe processes subscription payments. RiskRadar stores Stripe customer and subscription identifiers plus status and billing-period dates so the backend can unlock or remove Premium access. RiskRadar does not receive or store your full card number.',
    ],
  },
  {
    id: 'alerts',
    title: 'Area alerts',
    paragraphs: [
      'If alerts are enabled, RiskRadar uses saved area and preference data to decide whether a newly published data month should produce an alert. Alert reason, delivery state, mute settings, and limited history may be stored so you can understand and control notifications. These are delayed data-change alerts, not live police warnings.',
    ],
  },
  {
    id: 'sharing',
    title: 'Service providers and public sources',
    paragraphs: [
      'RiskRadar relies on service providers for hosting, authentication, payments, and requested data lookups. Relevant data is shared only as needed to operate that feature. Public-source records may change independently after RiskRadar has cached or displayed them.',
    ],
    bullets: [
      'Supabase for authentication and member-owned records',
      'Stripe for checkout, subscriptions, and the billing portal',
      'Police.uk and public geocoding sources for area intelligence',
      'The selected hosting provider for delivering the website and API',
    ],
  },
  {
    id: 'retention',
    title: 'Retention and deletion',
    paragraphs: [
      'Local recent searches can be cleared in the app or by clearing browser/app storage. Account and Premium records are retained while needed to provide the account, meet billing and security obligations, resolve disputes, and maintain required records.',
      'To request account deletion or a copy/correction of account information, email supr3ltd@gmail.com from the account email. Active subscriptions should also be cancelled through the Stripe billing portal. Some billing or security records may need to be retained where legally required.',
    ],
  },
  {
    id: 'contact',
    title: 'Questions and changes',
    paragraphs: [
      'Email supr3ltd@gmail.com with privacy questions. Material changes to this explanation should be dated here and reflected in the public changelog before they take effect where practical.',
    ],
  },
] as const satisfies readonly PrivacySection[];
