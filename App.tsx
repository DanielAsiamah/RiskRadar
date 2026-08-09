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
import Pricing from './components/Pricing';
import SignIn from './components/SignIn';
import RouteGuard from './components/RouteGuard';
import SafetySession from './components/SafetySession';
import { apiRequest } from './api/client';
import { beginCheckout, getAccount, openCustomerPortal } from './api/membership';
import { webAppUrl } from './auth/client';
import { useAuth } from './auth/useAuth';
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
  | 'ACCOUNT'
  | 'ROUTE_GUARD'
  | 'SAFETY_SESSION';

const DAILY_SEARCH_STORAGE_KEY = 'riskradar_daily_searches';
const LEGACY_SEARCH_COUNT_KEY = 'riskradar_search_count';
const RECENT_SEARCHES_STORAGE_KEY = 'riskradar_recent_searches';
const PENDING_PREMIUM_STORAGE_KEY = 'riskradar_pending_premium_destination';
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
  const [billingReturnPending, setBillingReturnPending] = useState(initialMembershipRoute === 'BILLING_SUCCESS');
  const [billingConfirming, setBillingConfirming] = useState(initialMembershipRoute === 'BILLING_SUCCESS');
  const [routeScansUsed, setRouteScansUsed] = useState(0);
  const [routeScanUsageHydrated, setRouteScanUsageHydrated] = useState(false);
  const searchRequestId = useRef(0);
  const accountRequests = useRef(createLatestRequestCoordinator());
  const routeGuardBackState = useRef<'HOME' | 'PRICING'>('HOME');

  useEffect(() => {
    const loadState = async () => {
      try {
        const [savedUsage, savedSearches, savedDestination, savedRouteGuardUsage] = await Promise.all([
          AsyncStorage.getItem(DAILY_SEARCH_STORAGE_KEY),
          AsyncStorage.getItem(RECENT_SEARCHES_STORAGE_KEY),
          AsyncStorage.getItem(PENDING_PREMIUM_STORAGE_KEY),
          AsyncStorage.getItem(ROUTE_GUARD_USAGE_STORAGE_KEY),
        ]);
        setDailySearchUsage(parseDailySearchUsage(savedUsage));
        setRouteScansUsed(parseRouteGuardUsage(savedRouteGuardUsage));
        if (savedSearches) {
          const parsedSearches = JSON.parse(savedSearches);
          if (Array.isArray(parsedSearches)) setRecentSearches(parsedSearches.filter((value) => typeof value === 'string').slice(0, 3));
        }
        setPendingPremiumDestination(normalizePendingDestination(savedDestination));
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
    if (authLoading || !user) return;

    if (account?.premium && pendingPremiumDestination) {
      const destination = pendingPremiumDestination;
      setPendingPremiumDestination(null);
      void AsyncStorage.removeItem(PENDING_PREMIUM_STORAGE_KEY);
      setAppState(destination === 'COMPARE' ? 'COMPARE' : 'ACCOUNT');
      return;
    }

    if (pendingPremiumDestination && (appState === 'HOME' || appState === 'SIGN_IN')) {
      setAppState(account?.premium ? 'ACCOUNT' : 'PRICING');
      return;
    }

    if (!pendingPremiumDestination && appState === 'SIGN_IN') {
      setAppState('ACCOUNT');
    }
  }, [account?.premium, appState, authLoading, pendingPremiumDestination, user?.id]);

  useEffect(() => {
    if (!authLoading && !user && appState === 'ACCOUNT' && !billingReturnPending) {
      setAppState('SIGN_IN');
    }
  }, [appState, authLoading, billingReturnPending, user?.id]);

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

  const requirePremium = async (destination: PremiumDestination) => {
    if (account?.premium) {
      await clearPremiumDestination();
      setAppState(destination === 'COMPARE' ? 'COMPARE' : 'ACCOUNT');
      return;
    }

    await rememberPremiumDestination(destination);
    setAppState(user ? 'PRICING' : 'SIGN_IN');
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
      setAccount(null);
      setAccountError(null);
      setBillingConfirming(false);
      setBillingReturnPending(false);
      await clearPremiumDestination();
      setAppState('HOME');
    }
  };

  const handleContinueFree = async () => {
    await clearPremiumDestination();
    setPricingError(null);
    setAppState('HOME');
  };

  const handlePricingBack = async () => {
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

  const currentDailyUsage = parseDailySearchUsage(dailySearchUsage);
  const accountLabel = account?.premium ? 'Premium active' : user ? 'Account' : 'Sign in';

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
            openPremium={() => {
              if (account?.premium) {
                void requirePremium('DASHBOARD');
              } else {
                setPricingError(null);
                setAppState('PRICING');
              }
            }}
            openSafetySession={() => setAppState('SAFETY_SESSION')}
          />
        )}

        {appState === 'MAP' && <MapExplorer onBack={() => setAppState('HOME')} />}
        {appState === 'COMPARE' && <ComparePostcodes onBack={() => setAppState('HOME')} />}
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
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
