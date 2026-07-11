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
  contextCrimeCount?: number;
  postcodeRadiusMeters?: number;
  contextRadiusMeters?: number;
  scoreMethod?: {
    id?: string;
    name?: string;
    modelCap?: number;
  };
  scoreBreakdown?: {
    localScore: number;
    contextScore: number;
    contextAdjustment: number;
    factors: {
      category: string;
      label: string;
      count: number;
      points: number;
      rule?: string;
    }[];
  };
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
  dataAvailable?: boolean;
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
  dataQuality?: {
    complete: boolean;
    requestedMonths: number;
    loadedMonths: number;
    failedMonths: string[];
  };
}

export interface PremiumInsight {
  id: 'trend' | 'category-trend' | 'area-context' | 'hotspot-map';
  title: string;
  description: string;
  badge: string;
}

export interface HotspotCluster {
  count: number;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  topCategory: string;
  topCategoryLabel: string;
}

export interface HotspotData {
  clusters: HotspotCluster[];
  summary: string;
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
  hotspotData?: HotspotData;
  newsLink: string | null;
}
