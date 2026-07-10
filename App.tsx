import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import tw from 'twrnc';

import { PostcodeResult } from './types';
import Landing from './components/Landing';
import Scanner from './components/Scanner';
import Results from './components/Results';

const API_PORT = process.env.EXPO_PUBLIC_API_PORT || '3001';

function getApiBaseUrl() {
  const configuredBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, '');
  }

  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.platform?.web?.hostUri ||
    null;

  if (hostUri) {
    const [host] = hostUri.split(':');
    if (host) {
      return `http://${host}:${API_PORT}`;
    }
  }

  return `http://localhost:${API_PORT}`;
}

const API_BASE = getApiBaseUrl();

interface NearbySuggestion {
  postcode: string;
  admin_district: string;
}

async function parseJsonResponse(response: Response) {
  const responseText = await response.text();

  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(responseText);
  } catch {
    throw new Error('The API returned an invalid JSON response. Make sure the backend server is running.');
  }
}

export default function App() {
  const [appState, setAppState] = useState<'HOME' | 'SCANNING' | 'RESULTS' | 'PAYWALL'>('HOME');
  const [postcodeInput, setPostcodeInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PostcodeResult | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [searchCount, setSearchCount] = useState<number>(0);
  const [scanDuration, setScanDuration] = useState<number>(10000);
  const [nearbySuggestions, setNearbySuggestions] = useState<NearbySuggestion[]>([]);
  const [findingNearby, setFindingNearby] = useState(false);

  // Load state on mount
  useEffect(() => {
    const loadState = async () => {
      try {
        const savedCount = await AsyncStorage.getItem('riskradar_search_count');
        if (savedCount) setSearchCount(parseInt(savedCount, 10));

        const savedSearches = await AsyncStorage.getItem('riskradar_recent_searches');
        if (savedSearches) setRecentSearches(JSON.parse(savedSearches));
      } catch (err) {
        console.error('Failed to load async storage', err);
      }
    };
    loadState();
  }, []);

  const handleSearch = async () => {
    // Sandbox mode: Bypass paywall limit for testing
    // if (searchCount >= 4) {
    //   setAppState('PAYWALL');
    //   return;
    // }

    if (!postcodeInput.trim()) {
      setError('Please enter a location or postcode.');
      return;
    }

    setAppState('SCANNING');
    setError(null);
    setResult(null);

    // Keep the scan premium, but much snappier than before.
    const targetDuration = Math.floor(Math.random() * (7600 - 5200 + 1)) + 5200;
    setScanDuration(targetDuration);

    try {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 35000);
      const response = await fetch(`${API_BASE}/api/analyze-postcode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postcode: postcodeInput.trim() }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      const data = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to fetch postcode data.');
      }

      setResult(data);

      // Increment count only on success
      const newCount = searchCount + 1;
      setSearchCount(newCount);
      await AsyncStorage.setItem('riskradar_search_count', newCount.toString());

      // Add to recent searches (keep last 3)
      setRecentSearches(prev => {
        const newRecent = [postcodeInput.trim().toUpperCase(), ...prev.filter(p => p !== postcodeInput.trim().toUpperCase())].slice(0, 3);
        AsyncStorage.setItem('riskradar_recent_searches', JSON.stringify(newRecent));
        return newRecent;
      });

      const elapsed = Date.now() - startTime;
      const remainingTime = targetDuration - elapsed;

      // Navigate to results when scan animation fully completes
      setTimeout(() => {
        setAppState('RESULTS');
      }, Math.max(300, remainingTime + 350));

    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setError('The search request timed out. Check that the backend server is running and reachable from this device.');
      } else {
        setError(err.message || 'An unexpected error occurred. Please try again.');
      }
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

      const response = await fetch(
        `${API_BASE}/api/location-suggestions?lat=${encodeURIComponent(location.coords.latitude)}&lng=${encodeURIComponent(location.coords.longitude)}`
      );

      const data = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(data?.error || 'Unable to load nearby postcode suggestions.');
      }

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
          />
        )}
        
        {appState === 'SCANNING' && (
          <Scanner 
            postcode={postcodeInput.toUpperCase()} 
            duration={scanDuration}
          />
        )}
        
        {appState === 'RESULTS' && result && (
          <Results 
            result={result} 
            onReset={() => {
              setPostcodeInput('');
              setAppState('HOME');
            }} 
          />
        )}
        
        {appState === 'PAYWALL' && (
          <View style={tw`flex-1 justify-center items-center p-6 bg-white`}>
            <Text style={tw`text-slate-900 text-2xl font-bold mb-4`}>Unlock PRO</Text>
            <Text style={tw`text-slate-600 text-center mb-8`}>
              You have reached your daily search limit of 4 free searches. Upgrade to RiskRadar PRO for unlimited queries, live news feeds, and raw unredacted police logs.
            </Text>
            <Text style={tw`text-indigo-600 font-bold mb-8`} onPress={() => setAppState('HOME')}>
              Go Back
            </Text>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
