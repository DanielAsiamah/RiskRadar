export interface AdvertisingPolicyRule {
  id: string;
  title: string;
  detail: string;
}

export interface AdvertisingPolicy {
  title: string;
  introduction: string;
  rules: readonly AdvertisingPolicyRule[];
  requiredBrief: readonly string[];
  reviewProcess: readonly string[];
  prohibitedClaims: readonly string[];
}

export const SUPPORT_EMAIL = 'supr3ltd@gmail.com';
export const ADVERTISING_ENQUIRY_URL = 'mailto:supr3ltd@gmail.com?subject=RiskRadar%20advertising%20enquiry';

export const ADVERTISING_POLICY = {
  title: 'Advertise without influencing the evidence',
  introduction: 'RiskRadar considers relevant local and safety-adjacent campaigns, but commercial placement is always separated from scoring, rankings, evidence, and editorial explanations.',
  rules: [
    {
      id: 'labelled',
      title: 'Clearly labelled',
      detail: 'Every paid placement must be visibly identified as Sponsored or Advertisement.',
    },
    {
      id: 'independent',
      title: 'Analysis stays independent',
      detail: 'Payment cannot change a risk score, category count, map point, ranking, safer-area suggestion, or evidence link.',
    },
    {
      id: 'ad-free-premium',
      title: 'Premium remains ad-free',
      detail: 'Consumer sponsor placements are not shown to signed-in members with active Premium access.',
    },
    {
      id: 'review-rights',
      title: 'Manual review and removal rights',
      detail: 'RiskRadar can reject, pause, request changes to, or remove a campaign that is misleading, unsuitable, technically unsafe, or harmful to user trust.',
    },
    {
      id: 'enquiry-first',
      title: 'Enquiry before payment',
      detail: 'Campaign scope is reviewed first. Approved advertisers receive a separate Stripe invoice or business payment link; the consumer Premium checkout is never used for advertising.',
    },
  ],
  requiredBrief: [
    'Company or organisation name',
    'Website and destination URL',
    'Target area or postcode coverage',
    'Desired campaign dates',
    'Placement goal and proposed message',
  ],
  reviewProcess: [
    'RiskRadar reviews relevance, wording, destination safety, and proposed targeting.',
    'Both sides confirm placement, dates, price, and creative before payment.',
    'An approved campaign receives a separate Stripe invoice or payment link.',
    'Creative is checked again before publication and can be removed if it later breaches policy.',
  ],
  prohibitedClaims: [
    'Guarantees that a person, property, road, or journey is safe',
    'Claims that an advertiser is officially endorsed by Police.uk or a police force',
    'Wording that imitates an emergency, police, or RiskRadar risk warning',
    'Discriminatory targeting or claims based on protected characteristics',
    'Attempts to hide sponsorship or influence the independent score',
  ],
} as const satisfies AdvertisingPolicy;
