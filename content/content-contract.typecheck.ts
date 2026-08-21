import {
  FAQ_ITEMS,
  type FaqCategory,
  type FaqItem,
} from './faq';
import {
  PRIVACY_LAST_UPDATED,
  PRIVACY_SECTIONS,
  type PrivacySection,
} from './privacy';
import {
  ADVERTISING_ENQUIRY_URL,
  ADVERTISING_POLICY,
  SUPPORT_EMAIL,
  type AdvertisingPolicy,
} from './advertising';

const faqCategories: readonly FaqCategory[] = [
  'scores-and-data',
  'premium-and-billing',
  'privacy-and-safety',
  'business-and-support',
];

const faqItems: readonly FaqItem[] = FAQ_ITEMS;
const privacySections: readonly PrivacySection[] = PRIVACY_SECTIONS;
const advertisingPolicy: AdvertisingPolicy = ADVERTISING_POLICY;

export const contentContractFixture = {
  faqCategories,
  faqItems,
  privacySections,
  privacyLastUpdated: PRIVACY_LAST_UPDATED,
  advertisingPolicy,
  supportEmail: SUPPORT_EMAIL,
  advertisingEnquiryUrl: ADVERTISING_ENQUIRY_URL,
};
