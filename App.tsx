import React, { useState, useEffect, useRef } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import tw from 'twrnc';

import { EvidenceReference, PostcodeResult } from './types';
import Landing from './components/Landing';
import Scanner from './components/Scanner';
import Results from './components/Results';
import MapExplorer from './components/MapExplorer';
import ComparePostcodes from './components/ComparePostcodes';
import EvidenceDetail from './components/EvidenceDetail';
import Paywall from './components/Paywall';
import SafetySession from './components/SafetySession';
import { apiRequest } from './api/client';

interface NearbySuggestion {
  postcode: string;
  admin_district: string;
}

const FREE_MONTHLY_CHECK_LIMIT = 3;
const USAGE_STORAGE_KEY = 'riskradar_usage_v1';

interface UsageState {
  monthKey: string;
  count: number;
}

function getUsageMonthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function normalizeUsageState(value: string | null, fallbackCount = 0): UsageState {
  const currentMonthKey = getUsageMonthKey();

  if (!value) {
    return { monthKey: currentMonthKey, count: fallbackCount };
  }

  try {
    const parsed = JSON.parse(value) as Partial<UsageState>;
    const monthKey = typeof parsed.monthKey === 'string' ? parsed.monthKey : currentMonthKey;
    const count = Math.max(0, Math.floor(Number(parsed.count) || 0));
    return monthKey === currentMonthKey ? { monthKey, count } : { monthKey: currentMonthKey, count: 0 };
  } catch {
    const legacyCount = Math.max(0, Math.floor(Number(value) || fallbackCount));
    return { monthKey: currentMonthKey, count: legacyCount };
  }
}

export default function App() {
  const [appState, setAppState] = useState<'HOME' | 'SCANNING' | 'RESULTS' | 'EVIDENCE' | 'MAP' | 'COMPARE' | 'PAYWALL' | 'SAFETY_SESSION'>('HOME');
  const [postcodeInput, setPostcodeInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PostcodeResult | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [searchCount, setSearchCount] = useState<number>(0);
  const [scanDuration, setScanDuration] = useState<number>(1800);
  const [nearbySuggestions, setNearbySuggestions] = useState<NearbySuggestion[]>([]);
  const [findingNearby, setFindingNearby] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceReference | null>(null);
  const searchRequestId = useRef(0);

  // Load state on mount
  useEffect(() => {
    const loadState = async () => {
      try {
        const [savedUsage, savedCount] = await Promise.all([
          AsyncStorage.getItem(USAGE_STORAGE_KEY),
          AsyncStorage.getItem('riskradar_search_count'),
        ]);
        const usage = normalizeUsageState(savedUsage, savedCount ? parseInt(savedCount, 10) : 0);
        setSearchCount(usage.count);
        await AsyncStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(usage));

        const savedSearches = await AsyncStorage.getItem('riskradar_recent_searches');
        if (savedSearches) setRecentSearches(JSON.parse(savedSearches));
      } catch (err) {
        console.error('Failed to load async storage', err);
      }
    };
    loadState();
  }, []);

  const handleSearch = async () => {
    if (!postcodeInput.trim()) {
      setError('Please enter a location or postcode.');
      return;
    }

    const usageMonthKey = getUsageMonthKey();
    if (searchCount >= FREE_MONTHLY_CHECK_LIMIT) {
      setAppState('PAYWALL');
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

      // Increment count only on success
      const newCount = searchCount + 1;
      setSearchCount(newCount);
      await AsyncStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify({ monthKey: usageMonthKey, count: newCount }));
      await AsyncStorage.setItem('riskradar_search_count', newCount.toString());

      // Add to recent searches (keep last 3)
      setRecentSearches(prev => {
        const newRecent = [postcodeInput.trim().toUpperCase(), ...prev.filter(p => p !== postcodeInput.trim().toUpperCase())].slice(0, 3);
        AsyncStorage.setItem('riskradar_recent_searches', JSON.stringify(newRecent));
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
    await AsyncStorage.removeItem('riskradar_recent_searches');
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
            searchCount={searchCount}
            nearbySuggestions={nearbySuggestions}
            useCurrentLocation={handleUseCurrentLocation}
            findingNearby={findingNearby}
            openMapExplorer={() => setAppState('MAP')}
            openComparison={() => setAppState('COMPARE')}
            openSafetySession={() => setAppState('SAFETY_SESSION')}
            openPaywall={() => setAppState('PAYWALL')}
            freeSearchLimit={FREE_MONTHLY_CHECK_LIMIT}
          />
        )}

        {appState === 'MAP' && <MapExplorer onBack={() => setAppState('HOME')} />}
        {appState === 'COMPARE' && <ComparePostcodes onBack={() => setAppState('HOME')} />}
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
        
        {appState === 'PAYWALL' && (
          <Paywall
            onBack={() => setAppState('HOME')}
            onOpenSafetySession={() => setAppState('SAFETY_SESSION')}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
