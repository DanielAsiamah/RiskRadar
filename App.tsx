import React, { useState, useEffect, useRef } from 'react';
import { Linking, Platform } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import tw from 'twrnc';

import { EvidenceReference, PostcodeResult } from './types';
import type { AccountEntitlement, PremiumDestination } from './membership/types';
import type { DailySearchUsage } from './membership/client-state.mjs';
import Landing from './components/Landing';
import Scanner from './components/Scanner';
import Results from './components/Results';
import MapExplorer from './components/MapExplorer';
import ComparePostcodes from './components/ComparePostcodes';
import EvidenceDetail from './components/EvidenceDetail';
import Account from './components/Account';
import PremiumDashboard from './components/PremiumDashboard';
import AlertSettings from './components/AlertSettings';
import MemberReportScreen from './components/MemberReport';
import Pricing from './components/Pricing';
import SignIn from './components/SignIn';
import RouteGuard from './components/RouteGuard';
import SafetySession from './components/SafetySession';
import Advertise from './components/Advertise';
import Faq from './components/Faq';
import Privacy from './components/Privacy';
import type { TrustNavigation } from './components/SiteFooter';
import { apiRequest } from './api/client';
import { getAlertPreferences, updateAlertPreferences, type AlertPreferences, type AlertPreferencesInput } from './api/alerts';
import { addWatchedPlace, getDashboard, removeWatchedPlace, renameWatchedPlace } from './api/dashboard';
import { beginCheckout, getAccount, openCustomerPortal } from './api/membership';
import { getMemberReport, type MemberReport } from './api/reports';
import { webAppUrl } from './auth/client';
import { useAuth } from './auth/useAuth';
import type { DashboardView } from './membership/dashboard-types';
import {
  BILLING_CONFIRMATION_WINDOW_MS,
  FREE_DAILY_SEARCH_LIMIT,
  billingPollDecision,
  canUseFreeSearch,
  createLatestRequestCoordinator,
  incrementDailySearchUsage,
  membershipReturnRoute,
  normalizePendingDestination,
  parseDailySearchUsage,
  pricingBackDecision,
  searchSubmissionDecision,
} from './membership/client-state.mjs';

interface NearbySuggestion {
  postcode: string;
  admin_district: string;
}

type AppState =
  | 'HOME'
  | 'SCANNING'
  | 'RESULTS'
  | 'EVIDENCE'
  | 'MAP'
  | 'COMPARE'
  | 'SIGN_IN'
  | 'PRICING'
  | 'DASHBOARD'
  | 'ALERT_SETTINGS'
  | 'REPORT'
  | 'ACCOUNT'
  | 'ROUTE_GUARD'
  | 'SAFETY_SESSION'
  | 'FAQ'
  | 'PRIVACY'
  | 'ADVERTISE';

type TrustAppState = Extract<AppState, 'FAQ' | 'PRIVACY' | 'ADVERTISE'>;

const DAILY_SEARCH_STORAGE_KEY = 'riskradar_daily_searches';
const LEGACY_SEARCH_COUNT_KEY = 'riskradar_search_count';
const RECENT_SEARCHES_STORAGE_KEY = 'riskradar_recent_searches';
const PENDING_PREMIUM_STORAGE_KEY = 'riskradar_pending_premium_destination';
const PENDING_WATCHED_POSTCODE_STORAGE_KEY = 'riskradar_pending_watch_postcode';
const ROUTE_GUARD_USAGE_STORAGE_KEY = 'riskradar_route_guard_usage';

function currentRouteGuardMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function parseRouteGuardUsage(raw: string | null) {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.month === currentRouteGuardMonth() && Number.isInteger(parsed?.count) && parsed.count >= 0
      ? Math.min(100, parsed.count)
      : 0;
  } catch {
    return 0;
  }
}

const initialMembershipRoute = Platform.OS === 'web' && typeof globalThis.location?.href === 'string'
  ? membershipReturnRoute(globalThis.location.href)
  : null;

function premiumStateForDestination(destination: PremiumDestination): AppState {
  return destination === 'COMPARE' ? 'COMPARE' : 'DASHBOARD';
}

export default function App() {
  const { user, loading: authLoading, signInWithEmail, signOut } = useAuth();
  const [appState, setAppState] = useState<AppState>(initialMembershipRoute ? 'ACCOUNT' : 'HOME');
  const [postcodeInput, setPostcodeInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PostcodeResult | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [dailySearchUsage, setDailySearchUsage] = useState<DailySearchUsage>(() => parseDailySearchUsage(null));
  const [dailySearchUsageHydrated, setDailySearchUsageHydrated] = useState(false);
  const [scanDuration, setScanDuration] = useState<number>(1800);
  const [nearbySuggestions, setNearbySuggestions] = useState<NearbySuggestion[]>([]);
  const [findingNearby, setFindingNearby] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceReference | null>(null);
  const [account, setAccount] = useState<AccountEntitlement | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [membershipBusy, setMembershipBusy] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pendingPremiumDestination, setPendingPremiumDestination] = useState<PremiumDestination | null>(null);
  const [pendingWatchedPostcode, setPendingWatchedPostcode] = useState<string | null>(null);
  const [billingReturnPending, setBillingReturnPending] = useState(initialMembershipRoute === 'BILLING_SUCCESS');
  const [billingConfirming, setBillingConfirming] = useState(initialMembershipRoute === 'BILLING_SUCCESS');
  const [dashboard, setDashboard] = useState<DashboardView | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardSaving, setDashboardSaving] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [selectedDashboardWatchId, setSelectedDashboardWatchId] = useState<string | null>(null);
  const [alertPreferences, setAlertPreferences] = useState<AlertPreferences | null>(null);
  const [alertPreferencesLoading, setAlertPreferencesLoading] = useState(false);
  const [alertPreferencesSaving, setAlertPreferencesSaving] = useState(false);
  const [alertPreferencesError, setAlertPreferencesError] = useState<string | null>(null);
  const [memberReport, setMemberReport] = useState<MemberReport | null>(null);
  const [memberReportLoading, setMemberReportLoading] = useState(false);
  const [memberReportError, setMemberReportError] = useState<string | null>(null);
  const [selectedReportWatchId, setSelectedReportWatchId] = useState<string | null>(null);
  const [routeScansUsed, setRouteScansUsed] = useState(0);
  const [routeScanUsageHydrated, setRouteScanUsageHydrated] = useState(false);
  const searchRequestId = useRef(0);
  const accountRequests = useRef(createLatestRequestCoordinator());
  const dashboardRequests = useRef(createLatestRequestCoordinator());
  const alertPreferenceRequests = useRef(createLatestRequestCoordinator());
  const reportRequests = useRef(createLatestRequestCoordinator());
  const routeGuardBackState = useRef<'HOME' | 'PRICING'>('HOME');
  const trustBackStack = useRef<AppState[]>([]);

  useEffect(() => {
    const loadState = async () => {
      try {
        const [savedUsage, savedSearches, savedDestination, savedPendingWatchPostcode, savedRouteGuardUsage] = await Promise.all([
          AsyncStorage.getItem(DAILY_SEARCH_STORAGE_KEY),
          AsyncStorage.getItem(RECENT_SEARCHES_STORAGE_KEY),
          AsyncStorage.getItem(PENDING_PREMIUM_STORAGE_KEY),
          AsyncStorage.getItem(PENDING_WATCHED_POSTCODE_STORAGE_KEY),
          AsyncStorage.getItem(ROUTE_GUARD_USAGE_STORAGE_KEY),
        ]);
        setDailySearchUsage(parseDailySearchUsage(savedUsage));
        setRouteScansUsed(parseRouteGuardUsage(savedRouteGuardUsage));
        if (savedSearches) {
          const parsedSearches = JSON.parse(savedSearches);
          if (Array.isArray(parsedSearches)) setRecentSearches(parsedSearches.filter((value) => typeof value === 'string').slice(0, 3));
        }
        setPendingPremiumDestination(normalizePendingDestination(savedDestination));
        setPendingWatchedPostcode(
          typeof savedPendingWatchPostcode === 'string' && savedPendingWatchPostcode.trim()
            ? savedPendingWatchPostcode.trim().toUpperCase()
            : null,
        );
        await AsyncStorage.removeItem(LEGACY_SEARCH_COUNT_KEY);
      } catch (err) {
        console.error('Failed to load async storage', err);
      } finally {
        setDailySearchUsageHydrated(true);
        setRouteScanUsageHydrated(true);
      }
    };
    void loadState();
  }, []);

  const refreshAccount = async (timeoutMs = 40_000) => {
    if (!user) {
      setAccount(null);
      setAccountLoading(false);
      return null;
    }

    const request = accountRequests.current.begin();
    try {
      setAccountLoading(true);
      setAccountError(null);
      const nextAccount = await getAccount(timeoutMs, request.signal);
      if (!request.isCurrent()) return null;
      setAccount(nextAccount);
      if (nextAccount.premium) {
        setBillingConfirming(false);
      }
      return nextAccount;
    } catch (requestError) {
      if (!request.isCurrent()) return null;
      setAccountError(requestError instanceof Error ? requestError.message : 'Unable to verify your RiskRadar account.');
      return null;
    } finally {
      if (request.isCurrent()) setAccountLoading(false);
    }
  };

  const refreshDashboard = async (watchId: string | null = selectedDashboardWatchId, timeoutMs = 40_000) => {
    if (!user || !account?.premium) {
      setDashboard(null);
      setDashboardLoading(false);
      setDashboardError(null);
      return null;
    }

    const request = dashboardRequests.current.begin();
    try {
      setDashboardLoading(true);
      setDashboardError(null);
      const nextDashboard = await getDashboard(watchId ?? undefined, timeoutMs, request.signal);
      if (!request.isCurrent()) return null;
      setDashboard(nextDashboard);
      setSelectedDashboardWatchId(nextDashboard.selectedPlace?.id ?? watchId ?? null);
      return nextDashboard;
    } catch (requestError) {
      if (!request.isCurrent()) return null;
      setDashboardError(requestError instanceof Error ? requestError.message : 'Unable to load your Premium dashboard.');
      return null;
    } finally {
      if (request.isCurrent()) setDashboardLoading(false);
    }
  };

  const loadMemberReport = async (watchId: string, timeoutMs = 60_000) => {
    if (!user || !account?.premium) {
      setMemberReport(null);
      setMemberReportLoading(false);
      setMemberReportError(null);
      return null;
    }

    const request = reportRequests.current.begin();
    try {
      setMemberReportLoading(true);
      setMemberReportError(null);
      const report = await getMemberReport(watchId, timeoutMs, request.signal);
      if (!request.isCurrent()) return null;
      setMemberReport(report);
      return report;
    } catch (requestError) {
      if (!request.isCurrent()) return null;
      setMemberReportError(requestError instanceof Error ? requestError.message : 'Unable to load this Premium report.');
      return null;
    } finally {
      if (request.isCurrent()) setMemberReportLoading(false);
    }
  };

  const loadAlertPreferences = async (timeoutMs = 40_000) => {
    if (!user || !account?.premium) {
      setAlertPreferences(null);
      setAlertPreferencesLoading(false);
      setAlertPreferencesError(null);
      return null;
    }

    const request = alertPreferenceRequests.current.begin();
    try {
      setAlertPreferencesLoading(true);
      setAlertPreferencesError(null);
      const preferences = await getAlertPreferences(timeoutMs, request.signal);
      if (!request.isCurrent()) return null;
      setAlertPreferences(preferences);
      return preferences;
    } catch (requestError) {
      if (!request.isCurrent()) return null;
      setAlertPreferencesError(requestError instanceof Error ? requestError.message : 'Unable to load alert settings.');
      return null;
    } finally {
      if (request.isCurrent()) setAlertPreferencesLoading(false);
    }
  };

  const saveAlertPreferences = async (input: AlertPreferencesInput) => {
    if (!user || !account?.premium) {
      const message = 'Premium is required to update alert settings.';
      setAlertPreferencesError(message);
      throw new Error(message);
    }

    const previousPreferences = alertPreferences;
    const request = alertPreferenceRequests.current.begin();
    try {
      setAlertPreferencesSaving(true);
      setAlertPreferencesError(null);
      const preferences = await updateAlertPreferences(input, 40_000, request.signal);
      if (!request.isCurrent()) return;
      setAlertPreferences(preferences);
    } catch (requestError) {
      if (request.isCurrent()) {
        setAlertPreferences(previousPreferences);
        setAlertPreferencesError(requestError instanceof Error ? requestError.message : 'Unable to save alert settings.');
      }
      throw requestError;
    } finally {
      if (request.isCurrent()) setAlertPreferencesSaving(false);
    }
  };

  useEffect(() => {
    if (!user) {
      accountRequests.current.cancel();
      setAccount(null);
      setAccountLoading(false);
      setAccountError(null);
      return;
    }
    void refreshAccount();
  }, [user?.id]);

  useEffect(() => {
    if (user) return;
    dashboardRequests.current.cancel();
    alertPreferenceRequests.current.cancel();
    reportRequests.current.cancel();
    setDashboard(null);
    setDashboardLoading(false);
    setDashboardSaving(false);
    setDashboardError(null);
    setSelectedDashboardWatchId(null);
    setAlertPreferences(null);
    setAlertPreferencesLoading(false);
    setAlertPreferencesSaving(false);
    setAlertPreferencesError(null);
    setMemberReport(null);
    setMemberReportLoading(false);
    setMemberReportError(null);
    setSelectedReportWatchId(null);
  }, [user?.id]);

  useEffect(() => {
    if (authLoading || !user) return;

    if (account?.premium && pendingPremiumDestination) {
      const destination = pendingPremiumDestination;
      setPendingPremiumDestination(null);
      void AsyncStorage.removeItem(PENDING_PREMIUM_STORAGE_KEY);
      setAppState(premiumStateForDestination(destination));
      return;
    }

    if (pendingPremiumDestination && (appState === 'HOME' || appState === 'SIGN_IN')) {
      setAppState(account?.premium ? premiumStateForDestination(pendingPremiumDestination) : 'PRICING');
      return;
    }

    if (!pendingPremiumDestination && appState === 'SIGN_IN') {
      setAppState('ACCOUNT');
    }
  }, [account?.premium, appState, authLoading, pendingPremiumDestination, user?.id]);

  useEffect(() => {
    if (!authLoading && !user && (appState === 'ACCOUNT' || appState === 'DASHBOARD' || appState === 'ALERT_SETTINGS' || appState === 'REPORT') && !billingReturnPending) {
      setAppState('SIGN_IN');
    }
  }, [appState, authLoading, billingReturnPending, user?.id]);

  useEffect(() => {
    if (appState !== 'DASHBOARD' || !user || !account?.premium) return;
    void refreshDashboard();
  }, [appState, account?.premium, user?.id]);

  useEffect(() => {
    if (initialMembershipRoute !== 'ACCOUNT' || Platform.OS !== 'web' || typeof globalThis.location?.href !== 'string') return;
    const url = new URL(globalThis.location.href);
    url.searchParams.delete('account');
    globalThis.history?.replaceState({}, '', url.toString());
  }, []);

  useEffect(() => {
    if (!billingReturnPending) return;
    setAppState('ACCOUNT');
    if (authLoading) return;

    if (!user) {
      setPendingPremiumDestination('DASHBOARD');
      void AsyncStorage.setItem(PENDING_PREMIUM_STORAGE_KEY, 'DASHBOARD');
      setAppState('SIGN_IN');
      return;
    }

    let active = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
    const deadlineAt = Date.now() + BILLING_CONFIRMATION_WINDOW_MS;

    const cleanBillingUrl = () => {
      if (Platform.OS !== 'web' || typeof globalThis.location?.href !== 'string') return;
      const url = new URL(globalThis.location.href);
      url.searchParams.delete('billing');
      globalThis.history?.replaceState({}, '', url.toString());
    };

    const finishStillConfirming = () => {
      if (!active) return;
      active = false;
      accountRequests.current.cancel();
      setAccountLoading(false);
      setBillingReturnPending(false);
      setBillingConfirming(true);
      setAccountError('Still confirming your checkout. Use Check activation again in a moment; you will not be charged twice.');
      cleanBillingUrl();
    };

    const finishPremiumConfirmation = () => {
      if (!active) return;
      active = false;
      if (deadlineTimer) clearTimeout(deadlineTimer);
      setBillingConfirming(false);
      setBillingReturnPending(false);
      setPendingPremiumDestination(null);
      void AsyncStorage.removeItem(PENDING_PREMIUM_STORAGE_KEY);
      cleanBillingUrl();
    };

    const pollAccount = async () => {
      const beforeRequest = billingPollDecision(deadlineAt, Date.now(), false);
      if (beforeRequest.status === 'deadline') {
        finishStillConfirming();
        return;
      }
      if (beforeRequest.status !== 'continue') return;

      const nextAccount = await refreshAccount(beforeRequest.requestTimeoutMs);
      if (!active) return;

      const afterRequest = billingPollDecision(deadlineAt, Date.now(), nextAccount?.premium === true);
      if (afterRequest.status === 'premium') {
        finishPremiumConfirmation();
        return;
      }

      if (afterRequest.status === 'continue') {
        pollTimer = setTimeout(() => void pollAccount(), afterRequest.nextDelayMs);
        return;
      }

      finishStillConfirming();
    };

    setBillingConfirming(true);
    deadlineTimer = setTimeout(finishStillConfirming, Math.max(0, deadlineAt - Date.now()));
    void pollAccount();

    return () => {
      active = false;
      if (pollTimer) clearTimeout(pollTimer);
      if (deadlineTimer) clearTimeout(deadlineTimer);
    };
  }, [authLoading, billingReturnPending, user?.id]);

  const handleSearch = async () => {
    const submissionDecision = searchSubmissionDecision(dailySearchUsageHydrated, postcodeInput);
    if (submissionDecision === 'hydrating') return;
    if (submissionDecision === 'empty') {
      setError('Please enter a location or postcode.');
      return;
    }

    const currentUsage = parseDailySearchUsage(dailySearchUsage);
    if (currentUsage.date !== dailySearchUsage.date || currentUsage.count !== dailySearchUsage.count) {
      setDailySearchUsage(currentUsage);
      await AsyncStorage.setItem(DAILY_SEARCH_STORAGE_KEY, JSON.stringify(currentUsage));
    }

    if (!canUseFreeSearch(currentUsage, account?.premium === true)) {
      setError(null);
      setPricingError(null);
      setAppState('PRICING');
      return;
    }

    setAppState('SCANNING');
    setError(null);
    setResult(null);

    const targetDuration = 1800;
    setScanDuration(targetDuration);
    const requestId = ++searchRequestId.current;

    try {
      const startTime = Date.now();
      const data = await apiRequest<PostcodeResult>('/api/analyze-postcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postcode: postcodeInput.trim() }),
      });
      if (requestId !== searchRequestId.current) return;

      setResult(data);

      if (!account?.premium) {
        const nextUsage = incrementDailySearchUsage(currentUsage);
        setDailySearchUsage(nextUsage);
        await AsyncStorage.setItem(DAILY_SEARCH_STORAGE_KEY, JSON.stringify(nextUsage));
      }

      // Add to recent searches (keep last 3)
      setRecentSearches(prev => {
        const newRecent = [postcodeInput.trim().toUpperCase(), ...prev.filter(p => p !== postcodeInput.trim().toUpperCase())].slice(0, 3);
        void AsyncStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(newRecent));
        return newRecent;
      });

      const elapsed = Date.now() - startTime;
      const remainingTime = targetDuration - elapsed;

      // Keep a brief reveal animation without delaying a slow network response.
      setTimeout(() => {
        if (requestId === searchRequestId.current) setAppState('RESULTS');
      }, Math.max(220, remainingTime));

    } catch (err: any) {
      if (requestId !== searchRequestId.current) return;
      setError(err.message || 'An unexpected error occurred. Please try again.');
      setAppState('HOME');
    }
  };

  const clearSearches = async () => {
    setRecentSearches([]);
    await AsyncStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
  };

  const handleUseCurrentLocation = async () => {
    try {
      setFindingNearby(true);
      setError(null);

      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setError('Location permission was denied, so nearby postcode suggestions are unavailable.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const data = await apiRequest<{ nearby?: NearbySuggestion[] }>(
        `/api/location-suggestions?lat=${encodeURIComponent(location.coords.latitude)}&lng=${encodeURIComponent(location.coords.longitude)}`,
        {},
        20_000,
      );

      const nearby = Array.isArray(data?.nearby) ? data.nearby : [];
      setNearbySuggestions(nearby);

      if (nearby[0]?.postcode) {
        setPostcodeInput(nearby[0].postcode);
      }

      if (!nearby.length) {
        setError('No nearby UK postcode suggestions were found for your current location.');
      }
    } catch (err: any) {
      setError(err.message || 'Unable to use your current location right now.');
    } finally {
      setFindingNearby(false);
    }
  };

  const rememberPremiumDestination = async (destination: PremiumDestination) => {
    setPendingPremiumDestination(destination);
    await AsyncStorage.setItem(PENDING_PREMIUM_STORAGE_KEY, destination);
  };

  const clearPremiumDestination = async () => {
    setPendingPremiumDestination(null);
    await AsyncStorage.removeItem(PENDING_PREMIUM_STORAGE_KEY);
  };

  const rememberPendingWatchPostcode = async (postcode: string) => {
    const normalized = postcode.trim().toUpperCase();
    if (!normalized) return;
    setPendingWatchedPostcode(normalized);
    await AsyncStorage.setItem(PENDING_WATCHED_POSTCODE_STORAGE_KEY, normalized);
  };

  const clearPendingWatchPostcode = async () => {
    setPendingWatchedPostcode(null);
    await AsyncStorage.removeItem(PENDING_WATCHED_POSTCODE_STORAGE_KEY);
  };

  const requirePremium = async (destination: PremiumDestination) => {
    if (account?.premium) {
      await clearPremiumDestination();
      setAppState(premiumStateForDestination(destination));
      return;
    }

    await rememberPremiumDestination(destination);
    setAppState(user ? 'PRICING' : 'SIGN_IN');
  };

  const handleOpenDashboard = async () => {
    setPricingError(null);
    if (!user) {
      await rememberPremiumDestination('DASHBOARD');
      setAppState('SIGN_IN');
      return;
    }

    if (!account?.premium) {
      await rememberPremiumDestination('DASHBOARD');
      setAppState('PRICING');
      return;
    }

    await clearPremiumDestination();
    setAppState('DASHBOARD');
  };

  const handleWatchPostcode = async () => {
    const nextPostcode = (
      result?.postcodeData.postcode
      || result?.postcode
      || postcodeInput.trim().toUpperCase()
    ).trim().toUpperCase();

    if (!nextPostcode) {
      setError('No postcode is available to watch yet. Run a postcode search first.');
      return;
    }

    setPricingError(null);
    await rememberPendingWatchPostcode(nextPostcode);

    if (account?.premium) {
      await clearPremiumDestination();
      setAppState('DASHBOARD');
      return;
    }

    await rememberPremiumDestination('WATCH_PLACE');
    setAppState(user ? 'PRICING' : 'SIGN_IN');
  };

  const handleDashboardRefresh = async () => {
    await refreshDashboard(selectedDashboardWatchId, 15_000);
  };

  const handleAddWatchedPlace = async (input: { label: string; postcode: string }) => {
    try {
      setDashboardSaving(true);
      setDashboardError(null);
      const watchedPlace = await addWatchedPlace(input);
      setSelectedDashboardWatchId(watchedPlace.id);
      await refreshDashboard(watchedPlace.id, 60_000);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Unable to save this watched place.';
      setDashboardError(message);
      throw requestError;
    } finally {
      setDashboardSaving(false);
    }
  };

  const handleRenameWatchedPlace = async (id: string, label: string) => {
    try {
      setDashboardSaving(true);
      setDashboardError(null);
      await renameWatchedPlace(id, label);
      await refreshDashboard(selectedDashboardWatchId, 40_000);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Unable to rename this watched place.';
      setDashboardError(message);
      throw requestError;
    } finally {
      setDashboardSaving(false);
    }
  };

  const handleRemoveWatchedPlace = async (id: string) => {
    try {
      setDashboardSaving(true);
      setDashboardError(null);
      await removeWatchedPlace(id);
      const nextSelectedId = selectedDashboardWatchId === id ? null : selectedDashboardWatchId;
      setSelectedDashboardWatchId(nextSelectedId);
      await refreshDashboard(nextSelectedId, 40_000);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Unable to remove this watched place.';
      setDashboardError(message);
      throw requestError;
    } finally {
      setDashboardSaving(false);
    }
  };

  const handleSelectWatchedPlace = async (id: string) => {
    setSelectedDashboardWatchId(id);
    await refreshDashboard(id, 40_000);
  };

  const handleOpenAlertSettings = async () => {
    setPricingError(null);
    if (!user) {
      await rememberPremiumDestination('DASHBOARD');
      setAppState('SIGN_IN');
      return;
    }

    if (!account?.premium) {
      await rememberPremiumDestination('DASHBOARD');
      setAppState('PRICING');
      return;
    }

    setAppState('ALERT_SETTINGS');
    await loadAlertPreferences();
  };

  const handleAlertSettingsRetry = async () => {
    await loadAlertPreferences(15_000);
  };

  const handleOpenReport = async (watchId: string) => {
    setPricingError(null);
    if (!user) {
      await rememberPremiumDestination('REPORTS');
      setAppState('SIGN_IN');
      return;
    }

    if (!account?.premium) {
      await rememberPremiumDestination('REPORTS');
      setAppState('PRICING');
      return;
    }

    setSelectedReportWatchId(watchId);
    setMemberReport(null);
    setAppState('REPORT');
    await loadMemberReport(watchId);
  };

  const handleReportRetry = async () => {
    if (!selectedReportWatchId) {
      setMemberReportError('No watched place is selected for this report.');
      return;
    }

    await loadMemberReport(selectedReportWatchId, 40_000);
  };

  const handleCheckout = async () => {
    if (!user) {
      await rememberPremiumDestination('DASHBOARD');
      setAppState('SIGN_IN');
      return;
    }

    try {
      setMembershipBusy(true);
      setPricingError(null);
      await rememberPremiumDestination(pendingPremiumDestination || 'DASHBOARD');
      const { checkoutUrl } = await beginCheckout();
      await Linking.openURL(checkoutUrl);
    } catch (requestError) {
      setPricingError(requestError instanceof Error ? requestError.message : 'Unable to open secure Stripe checkout.');
    } finally {
      setMembershipBusy(false);
    }
  };

  const handleManageBilling = async () => {
    try {
      setMembershipBusy(true);
      setAccountError(null);
      let returnUrl: string | undefined;
      if (Platform.OS === 'web') {
        const baseUrl = webAppUrl || globalThis.location?.origin;
        if (baseUrl) {
          const accountUrl = new URL(baseUrl);
          accountUrl.searchParams.set('account', '1');
          returnUrl = accountUrl.toString();
        }
      }
      const { portalUrl } = await openCustomerPortal(returnUrl);
      await Linking.openURL(portalUrl);
    } catch (requestError) {
      setAccountError(requestError instanceof Error ? requestError.message : 'Unable to open Stripe billing management.');
    } finally {
      setMembershipBusy(false);
    }
  };

  const handleAccountRefresh = async () => {
    const nextAccount = await refreshAccount(10_000);
    if (nextAccount?.premium) {
      setBillingConfirming(false);
      await clearPremiumDestination();
      return;
    }
    if (billingConfirming) {
      setAccountError('Still confirming your checkout. Stripe updates can take a few moments, so please try again shortly.');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      accountRequests.current.cancel();
      dashboardRequests.current.cancel();
      alertPreferenceRequests.current.cancel();
      reportRequests.current.cancel();
      setAccount(null);
      setAccountError(null);
      setBillingConfirming(false);
      setBillingReturnPending(false);
      setDashboard(null);
      setDashboardLoading(false);
      setDashboardSaving(false);
      setDashboardError(null);
      setSelectedDashboardWatchId(null);
      setAlertPreferences(null);
      setAlertPreferencesLoading(false);
      setAlertPreferencesSaving(false);
      setAlertPreferencesError(null);
      setMemberReport(null);
      setMemberReportLoading(false);
      setMemberReportError(null);
      setSelectedReportWatchId(null);
      await clearPremiumDestination();
      await clearPendingWatchPostcode();
      setAppState('HOME');
    }
  };

  const handleContinueFree = async () => {
    if (pendingPremiumDestination === 'WATCH_PLACE') {
      await clearPendingWatchPostcode();
    }
    await clearPremiumDestination();
    setPricingError(null);
    setAppState('HOME');
  };

  const handlePricingBack = async () => {
    if (pendingPremiumDestination === 'WATCH_PLACE') {
      await clearPendingWatchPostcode();
    }
    const decision = pricingBackDecision(pendingPremiumDestination);
    if (decision.clearPendingDestination) {
      await clearPremiumDestination();
    }
    setAppState(decision.nextState);
  };

  const handleRouteGuardUsageChange = async (nextUsed: number) => {
    const safeCount = Math.max(0, Math.min(100, Math.floor(nextUsed)));
    setRouteScansUsed(safeCount);
    await AsyncStorage.setItem(ROUTE_GUARD_USAGE_STORAGE_KEY, JSON.stringify({
      month: currentRouteGuardMonth(),
      count: safeCount,
    }));
  };

  const openTrustScreen = (nextState: TrustAppState) => {
    if (appState === nextState) return;
    trustBackStack.current.push(appState);
    setAppState(nextState);
  };

  const closeTrustScreen = () => {
    setAppState(trustBackStack.current.pop() ?? 'HOME');
  };

  const trustNavigation: TrustNavigation = {
    onOpenFaq: () => openTrustScreen('FAQ'),
    onOpenPrivacy: () => openTrustScreen('PRIVACY'),
    onOpenAdvertise: () => openTrustScreen('ADVERTISE'),
  };

  const currentDailyUsage = parseDailySearchUsage(dailySearchUsage);
  const accountLabel = account?.premium ? 'Premium active' : user ? 'Account' : 'Sign in';
  const latestDashboardDataMonth = dashboard?.selectedPlace?.snapshot?.dataMonth ?? null;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={tw`flex-1 bg-white`}>
        <StatusBar style="dark" />
        {appState === 'HOME' && (
          <Landing
            postcodeInput={postcodeInput}
            setPostcodeInput={setPostcodeInput}
            handleSearch={handleSearch}
            error={error}
            recentSearches={recentSearches}
            clearSearches={clearSearches}
            searchCount={currentDailyUsage.count}
            freeSearchLimit={FREE_DAILY_SEARCH_LIMIT}
            premium={account?.premium === true}
            searchHydrated={dailySearchUsageHydrated}
            accountLabel={accountLabel}
            nearbySuggestions={nearbySuggestions}
            useCurrentLocation={handleUseCurrentLocation}
            findingNearby={findingNearby}
            openMapExplorer={() => setAppState('MAP')}
            openComparison={() => setAppState('COMPARE')}
            openRouteGuard={() => {
              routeGuardBackState.current = 'HOME';
              setAppState('ROUTE_GUARD');
            }}
            openAccount={() => setAppState(user ? 'ACCOUNT' : 'SIGN_IN')}
            openPremium={() => { void handleOpenDashboard(); }}
            openSafetySession={() => setAppState('SAFETY_SESSION')}
            trustNavigation={trustNavigation}
          />
        )}

        {appState === 'FAQ' && (
          <Faq
            onBack={closeTrustScreen}
            {...trustNavigation}
          />
        )}
        {appState === 'PRIVACY' && <Privacy onBack={closeTrustScreen} />}
        {appState === 'ADVERTISE' && <Advertise onBack={closeTrustScreen} />}

        {appState === 'MAP' && <MapExplorer onBack={() => setAppState('HOME')} />}
        {appState === 'COMPARE' && (
          <ComparePostcodes
            onBack={() => setAppState('HOME')}
            premium={account?.premium === true}
            onRequirePremium={() => { void requirePremium('COMPARE'); }}
          />
        )}
        {appState === 'ROUTE_GUARD' && (
          <RouteGuard
            premium={account?.premium === true}
            routeScansUsed={routeScansUsed}
            usageReady={routeScanUsageHydrated}
            onUsageChange={handleRouteGuardUsageChange}
            onBack={() => setAppState(routeGuardBackState.current)}
            onUpgrade={() => {
              setPricingError(null);
              setAppState('PRICING');
            }}
          />
        )}
        {appState === 'SAFETY_SESSION' && <SafetySession onBack={() => setAppState('HOME')} />}
        
        {appState === 'SCANNING' && (
          <Scanner 
            postcode={postcodeInput.toUpperCase()} 
            duration={scanDuration}
            ready={Boolean(result)}
          />
        )}
        
        {appState === 'RESULTS' && result && (
          <Results 
            result={result} 
            onOpenEvidence={(reference) => {
              setSelectedEvidence(reference);
              setAppState('EVIDENCE');
            }}
            onReset={() => {
              setPostcodeInput('');
              setSelectedEvidence(null);
              setAppState('HOME');
            }} 
            premium={account?.premium === true}
            watchBusy={dashboardSaving}
            onWatchPostcode={handleWatchPostcode}
            onOpenDashboard={() => { void handleOpenDashboard(); }}
          />
        )}

        {appState === 'EVIDENCE' && selectedEvidence && (
          <EvidenceDetail
            reference={selectedEvidence}
            onBack={() => setAppState(result ? 'RESULTS' : 'HOME')}
          />
        )}
        {appState === 'SIGN_IN' && (
          <SignIn
            onSubmit={signInWithEmail}
            onBack={() => setAppState(pendingPremiumDestination ? 'PRICING' : 'HOME')}
            onContinueFree={() => void handleContinueFree()}
          />
        )}

        {appState === 'PRICING' && (
          <Pricing
            authenticated={Boolean(user)}
            busy={membershipBusy}
            error={pricingError}
            onBack={() => void handlePricingBack()}
            onCheckout={handleCheckout}
            onOpenRouteGuard={() => {
              routeGuardBackState.current = 'PRICING';
              setAppState('ROUTE_GUARD');
            }}
            onOpenSafetySession={() => setAppState('SAFETY_SESSION')}
            trustNavigation={trustNavigation}
          />
        )}

        {appState === 'DASHBOARD' && (
          <PremiumDashboard
            dashboard={dashboard}
            loading={dashboardLoading}
            saving={dashboardSaving}
            error={dashboardError}
            pendingPostcode={pendingWatchedPostcode}
            onBack={() => setAppState('HOME')}
            onRefresh={handleDashboardRefresh}
            onAddWatchedPlace={handleAddWatchedPlace}
            onRenameWatchedPlace={handleRenameWatchedPlace}
            onRemoveWatchedPlace={handleRemoveWatchedPlace}
            onSelectWatchedPlace={handleSelectWatchedPlace}
            onClearPendingPostcode={() => { void clearPendingWatchPostcode(); }}
            onOpenCompare={() => setAppState('COMPARE')}
            onOpenAlertSettings={() => { void handleOpenAlertSettings(); }}
            onOpenReport={(watchId) => { void handleOpenReport(watchId); }}
            trustNavigation={trustNavigation}
          />
        )}

        {appState === 'ALERT_SETTINGS' && (
          <AlertSettings
            preferences={alertPreferences}
            loading={alertPreferencesLoading}
            saving={alertPreferencesSaving}
            error={alertPreferencesError}
            latestDataMonth={latestDashboardDataMonth}
            onBack={() => setAppState('DASHBOARD')}
            onRetry={handleAlertSettingsRetry}
            onSave={saveAlertPreferences}
          />
        )}

        {appState === 'REPORT' && (
          <MemberReportScreen
            report={memberReport}
            loading={memberReportLoading}
            error={memberReportError}
            onBack={() => setAppState('DASHBOARD')}
            onRetry={handleReportRetry}
          />
        )}

        {appState === 'ACCOUNT' && (
          <Account
            account={account}
            loading={authLoading || accountLoading}
            confirming={billingConfirming}
            error={accountError}
            onBack={() => setAppState('HOME')}
            onRefresh={handleAccountRefresh}
            onManageBilling={handleManageBilling}
            onRestoreMembership={() => {
              if (account?.canManageBilling) {
                void handleManageBilling();
              } else {
                setPricingError(null);
                setAppState('PRICING');
              }
            }}
            onSignOut={handleSignOut}
            trustNavigation={trustNavigation}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
