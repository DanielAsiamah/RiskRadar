import React from 'react';

import Advertise from './Advertise';
import Account from './Account';
import Faq from './Faq';
import Landing from './Landing';
import PremiumDashboard from './PremiumDashboard';
import Pricing from './Pricing';
import Privacy from './Privacy';
import SiteFooter, { type TrustNavigation } from './SiteFooter';

const trustNavigation: TrustNavigation = {
  onOpenFaq: () => undefined,
  onOpenPrivacy: () => undefined,
  onOpenAdvertise: () => undefined,
};

export const faqFixture = React.createElement(Faq, {
  onBack: () => undefined,
  ...trustNavigation,
});

export const privacyFixture = React.createElement(Privacy, {
  onBack: () => undefined,
});

export const advertiseFixture = React.createElement(Advertise, {
  onBack: () => undefined,
});

export const siteFooterFixture = React.createElement(SiteFooter, trustNavigation);

type LandingTrustNavigation = React.ComponentProps<typeof Landing>['trustNavigation'];
type PricingTrustNavigation = React.ComponentProps<typeof Pricing>['trustNavigation'];
type AccountTrustNavigation = React.ComponentProps<typeof Account>['trustNavigation'];
type DashboardTrustNavigation = React.ComponentProps<typeof PremiumDashboard>['trustNavigation'];

export const integratedTrustNavigation: {
  landing: LandingTrustNavigation;
  pricing: PricingTrustNavigation;
  account: AccountTrustNavigation;
  dashboard: DashboardTrustNavigation;
} = {
  landing: trustNavigation,
  pricing: trustNavigation,
  account: trustNavigation,
  dashboard: trustNavigation,
};
