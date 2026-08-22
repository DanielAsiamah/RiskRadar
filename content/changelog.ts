export interface ChangelogEntry {
  id: string;
  date: string;
  title: string;
  summary: string;
  bullets: readonly string[];
}

export const CHANGELOG_ENTRIES = [
  {
    id: '2026-08-22-live-radar-phase-1',
    date: '22 Aug 2026',
    title: 'Live Radar Phase 1 shipped',
    summary: 'RiskRadar now includes a local-first Live Radar system with web Journey Radar wording and native background foundations.',
    bullets: [
      'Added Turn On Live Radar, Turn Off Live Radar, and Scan My Current Location Now',
      'Added permission onboarding for foreground location, background location, and notifications',
      'Added alert history, reduced alerts, mute postcode controls, and local notifications',
      'Kept the website wording honest: Keep this page open to monitor your current area.',
    ],
  },
  {
    id: '2026-08-21-route-guard-mvp',
    date: '21 Aug 2026',
    title: 'Route Guard MVP added',
    summary: 'The app can now build a deterministic mock route and scan it for hotzone sections without calling Google yet.',
    bullets: [
      'Added POST /api/route-guard with mock provider output',
      'Added route risk samples, hotzone sections, and monthly usage allowance metadata',
      'Kept Google cost as a planning estimate only with no frontend key exposure',
    ],
  },
  {
    id: '2026-08-20-membership-fallback',
    date: '20 Aug 2026',
    title: 'Public explorer now fails open when membership is unavailable',
    summary: 'Core search, map, and evidence flows stay available even if Supabase or Stripe are not configured yet.',
    bullets: [
      'Membership setup now surfaces a controlled unavailable state instead of breaking public search',
      'Local product limits and Premium routing stay explicit',
    ],
  },
  {
    id: '2026-08-19-trust-pages',
    date: '19 Aug 2026',
    title: 'Trust pages expanded',
    summary: 'FAQ, privacy, and advertising pages were added to explain what RiskRadar does and does not claim.',
    bullets: [
      'Added plain-language privacy explanation',
      'Added advertising rules that keep scoring independent',
      'Added support contact and billing recovery guidance',
    ],
  },
] as const satisfies readonly ChangelogEntry[];
