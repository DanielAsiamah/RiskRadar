export interface CrimeData {
  totalCrimes: number;
  crimeScore: number;
  safetyLevel: string;
  month: string;
  monthDisplay: string;
  categories: {
    category: string;
    count: number;
  }[];
  capExplanation?: string;
  riskSignals?: string[];
  scoreFactors?: {
    label: string;
    impact: 'up' | 'down' | 'neutral';
    detail: string;
  }[];
}

export interface TrendPoint {
  month: string;
  monthDisplay: string;
  totalCrimes: number;
  violentCrimes: number;
  antiSocialCrimes: number;
  robberyCrimes: number;
}

export interface TrendData {
  monthly: TrendPoint[];
  direction: 'rising' | 'cooling' | 'stable';
  changePercent: number;
  categoryDirection: {
    violentCrimes: 'rising' | 'cooling' | 'stable';
    antiSocialCrimes: 'rising' | 'cooling' | 'stable';
    robberyCrimes: 'rising' | 'cooling' | 'stable';
  };
  summary: string;
}

export interface PremiumInsight {
  id: 'trend' | 'category-trend' | 'area-context' | 'hotspot-map';
  title: string;
  description: string;
  badge: string;
}

export interface PostcodeResult {
  postcode: string;
  crimeData: CrimeData;
  postcodeData: {
    admin_district: string;
    longitude: number;
    latitude: number;
    postcode: string;
  };
  aiAnalysis: {
    summary: string;
    whatToAvoid: string[];
    safetyTips: string[];
    localVibe: string;
    scoreStory: string[];
    areaContext: string;
  };
  trendData: TrendData;
  premiumInsights: PremiumInsight[];
  newsLink: string | null;
}
