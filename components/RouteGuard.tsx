import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ArrowLeft,
  Bus,
  Car,
  Clock3,
  Crosshair,
  Footprints,
  LockKeyhole,
  MapPin,
  Navigation,
  ShieldAlert,
  Sparkles,
} from 'lucide-react-native';
import tw from 'twrnc';

import { scanRouteGuard, type RouteGuardRiskLevel, type RouteGuardScan, type RouteGuardScanInput, type RouteGuardTravelMode } from '../api/route-guard';
import { summarizeRouteProgress, type RouteGuardProgressSummary } from '../route-guard/progress';
import CrimeMapCanvas from './CrimeMapCanvas';
import { membershipColors, membershipStyles } from './membershipStyles';
import type { MapCoordinate, RouteMapRiskSample } from './map-types';

interface RouteGuardProps {
  premium: boolean;
  routeScansUsed: number;
  usageReady: boolean;
  onUsageChange(nextUsed: number): Promise<void> | void;
  onBack(): void;
  onUpgrade(): void;
}

const MODES: Array<{ value: RouteGuardTravelMode; label: string; icon: React.ReactNode }> = [
  { value: 'walking', label: 'Walking', icon: <Footprints size={18} color={membershipColors.navy} /> },
  { value: 'driving', label: 'Driving', icon: <Car size={18} color={membershipColors.navy} /> },
  { value: 'transit', label: 'Transit', icon: <Bus size={18} color={membershipColors.navy} /> },
];

const RISK_COLORS: Record<RouteGuardRiskLevel, { strong: string; soft: string; label: string }> = {
  low: { strong: '#059669', soft: '#ecfdf5', label: 'LOW' },
  amber: { strong: '#d97706', soft: '#fffbeb', label: 'AMBER' },
  red: { strong: '#e11d48', soft: '#fff1f2', label: 'RED' },
};

export default function RouteGuard({
  premium,
  routeScansUsed,
  usageReady,
  onUsageChange,
  onBack,
  onUpgrade,
}: RouteGuardProps) {
  const [start, setStart] = useState('');
  const [startCoordinates, setStartCoordinates] = useState<RouteGuardScanInput['startCoordinates'] | null>(null);
  const [destination, setDestination] = useState('');
  const [travelMode, setTravelMode] = useState<RouteGuardTravelMode>('walking');
  const [result, setResult] = useState<RouteGuardScan | null>(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [journeyLocation, setJourneyLocation] = useState<MapCoordinate | null>(null);
  const [journeyAccuracy, setJourneyAccuracy] = useState<number | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locationWatchId = useRef<number | null>(null);

  const hasStart = start.trim().length > 0 || !!startCoordinates;
  const canScan = premium && usageReady && routeScansUsed < 100 && hasStart && destination.trim().length > 0 && !loading && !locating;

  const handleStartChange = (value: string) => {
    setStart(value);
    setStartCoordinates(null);
    setJourneyLocation(null);
    setTrackingError(null);
  };

  const useCurrentLocation = async () => {
    const geolocation = (globalThis.navigator as { geolocation?: Geolocation } | undefined)?.geolocation;
    if (!geolocation) {
      setError(Platform.OS === 'web'
        ? 'This browser does not expose location services to RiskRadar.'
        : 'Current-location routing is available on web in this preview.');
      return;
    }

    setLocating(true);
    setError(null);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 30_000,
          timeout: 12_000,
        });
      });
      setStart('Current location');
      setStartCoordinates({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMetres: position.coords.accuracy,
      });
      setJourneyLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      setJourneyAccuracy(position.coords.accuracy);
    } catch {
      setError('RiskRadar could not access your current location. Check browser location permission and try again.');
    } finally {
      setLocating(false);
    }
  };

  const clearLocationWatcher = () => {
    const geolocation = (globalThis.navigator as { geolocation?: Geolocation } | undefined)?.geolocation;
    if (geolocation && locationWatchId.current !== null) {
      geolocation.clearWatch(locationWatchId.current);
    }
    locationWatchId.current = null;
  };

  const startJourneyTracking = () => {
    const geolocation = (globalThis.navigator as { geolocation?: Geolocation } | undefined)?.geolocation;
    if (!geolocation) {
      setTrackingError(Platform.OS === 'web'
        ? 'This browser does not expose live location services to RiskRadar.'
        : 'Live journey tracking is available on web in this preview.');
      return;
    }

    clearLocationWatcher();
    setTracking(true);
    setTrackingError(null);
    locationWatchId.current = geolocation.watchPosition(
      (position) => {
        setJourneyLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setJourneyAccuracy(position.coords.accuracy);
        setTrackingError(null);
      },
      () => {
        setTracking(false);
        setTrackingError('RiskRadar could not keep reading your live location. Check browser location permission and try again.');
        clearLocationWatcher();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 15_000,
      },
    );
  };

  const stopJourneyTracking = () => {
    clearLocationWatcher();
    setTracking(false);
  };

  useEffect(() => () => {
    clearLocationWatcher();
  }, []);

  const handleScan = async () => {
    if (!premium) {
      onUpgrade();
      return;
    }
    if (!canScan) return;

    try {
      setLoading(true);
      setError(null);
      const scan = await scanRouteGuard({
        start: startCoordinates ? 'Current location' : start.trim(),
        startCoordinates: startCoordinates ?? undefined,
        destination: destination.trim(),
        travelMode,
        entitlement: 'pro',
        routeScansUsed,
      });
      setResult(scan);
      if (startCoordinates) {
        setJourneyLocation({
          latitude: startCoordinates.latitude,
          longitude: startCoordinates.longitude,
        });
        setJourneyAccuracy(startCoordinates.accuracyMetres ?? null);
      }
      await onUsageChange(scan.usage.usedAfter);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'Route Guard could not scan this route.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={membershipStyles.screen}>
      <ScrollView contentContainerStyle={membershipStyles.scrollContent} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
        <View style={membershipStyles.content}>
          <Pressable onPress={onBack} accessibilityRole="button" style={({ pressed }) => [tw`self-start flex-row items-center px-4 py-3 rounded-full bg-slate-100 mb-7`, pressed && tw`opacity-70`]}>
            <ArrowLeft size={17} color={membershipColors.slate} />
            <Text style={tw`text-sm font-black text-slate-700 ml-2`}>Back</Text>
          </Pressable>

          <View style={tw`flex-row items-center mb-4`}>
            <View style={tw`w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 items-center justify-center mr-3`}>
              <Navigation size={23} color={membershipColors.indigo} />
            </View>
            <View style={tw`flex-1`}>
              <View style={tw`flex-row items-center`}>
                <Text style={tw`text-lg font-black text-slate-950`}>Route Guard</Text>
                <View style={tw`ml-2 rounded-full bg-indigo-600 px-2 py-1`}><Text style={tw`text-[9px] font-black tracking-widest text-white`}>PRO</Text></View>
              </View>
              <Text style={tw`text-[10px] font-black tracking-widest text-indigo-600 mt-1`}>LIVE ROUTE INTELLIGENCE</Text>
            </View>
          </View>

          <Text style={tw`text-3xl font-black tracking-tight text-slate-950 leading-9 mb-3`}>Scan the journey, not just the destination.</Text>
          <Text style={tw`text-sm text-slate-500 leading-6 mb-7`}>Enter a start and destination to scan route sections against RiskRadar area intelligence. Google routing is not used in this version.</Text>

          {!premium ? (
            <View style={[membershipStyles.card, membershipStyles.elevatedCard, tw`border-indigo-100 mb-5`]}>
              <View style={tw`w-12 h-12 rounded-2xl bg-indigo-50 items-center justify-center mb-4`}><LockKeyhole size={23} color={membershipColors.indigo} /></View>
              <Text style={tw`text-xl font-black text-slate-950 mb-2`}>Route Guard is a PRO feature</Text>
              <Text style={tw`text-sm text-slate-500 leading-6 mb-5`}>PRO includes 100 route scans each calendar month, with walking, driving, and transit planning previews.</Text>
              <Pressable onPress={onUpgrade} accessibilityRole="button" style={({ pressed }) => [membershipStyles.primaryButton, pressed && tw`opacity-80`]}>
                <Sparkles size={18} color="white" />
                <Text style={tw`text-white font-black ml-2`}>Explore RiskRadar PRO</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={[membershipStyles.card, tw`bg-slate-50 mb-5`]}>
                <LocationInput label="START" value={start} onChangeText={handleStartChange} placeholder="Postcode or place" />
                <Pressable
                  onPress={() => void useCurrentLocation()}
                  disabled={locating || loading}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    tw`mb-4 rounded-2xl border border-indigo-100 bg-white px-4 py-3 flex-row items-center justify-center`,
                    pressed && tw`opacity-75`,
                    (locating || loading) && tw`opacity-60`,
                  ]}
                >
                  {locating ? <ActivityIndicator color={membershipColors.indigo} /> : <Crosshair size={17} color={membershipColors.indigo} />}
                  <Text style={tw`text-xs font-black text-indigo-700 ml-2`}>
                    {locating ? 'Finding current location...' : startCoordinates ? 'Current location selected' : 'Use current location'}
                  </Text>
                </Pressable>
                <LocationInput label="DESTINATION" value={destination} onChangeText={setDestination} placeholder="Where are you going?" />

                <Text style={tw`text-[10px] font-black tracking-widest text-slate-400 mb-3`}>TRAVEL MODE</Text>
                <View style={tw`flex-row gap-2 mb-5`}>
                  {MODES.map((mode) => {
                    const selected = travelMode === mode.value;
                    return (
                      <Pressable key={mode.value} onPress={() => setTravelMode(mode.value)} accessibilityRole="button" accessibilityState={{ selected }} style={({ pressed }) => [tw`flex-1 rounded-2xl border px-2 py-3 items-center`, selected ? tw`border-indigo-300 bg-indigo-50` : tw`border-slate-200 bg-white`, pressed && tw`opacity-75`]}>
                        {mode.icon}
                        <Text style={[tw`text-[11px] font-black mt-2`, selected ? tw`text-indigo-700` : tw`text-slate-600`]}>{mode.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {error ? <Text selectable style={tw`text-sm font-bold text-rose-600 mb-4`}>{error}</Text> : null}
                <Pressable onPress={() => void handleScan()} disabled={!canScan} accessibilityRole="button" accessibilityState={{ disabled: !canScan }} style={({ pressed }) => [membershipStyles.primaryButton, (!canScan || loading) && tw`opacity-50`, pressed && canScan && tw`opacity-80`]}>
                  {loading ? <ActivityIndicator color="white" /> : <ShieldAlert size={19} color="white" />}
                  <Text style={tw`text-white font-black ml-2`}>{loading ? 'Building route preview...' : usageReady ? 'Scan route' : 'Loading allowance...'}</Text>
                </Pressable>
                <Text style={tw`text-[11px] text-slate-400 text-center mt-3`}>{Math.max(0, 100 - routeScansUsed)} of 100 scans remaining this month</Text>
              </View>

              {result ? (
                <RouteResult
                  result={result}
                  currentLocation={journeyLocation}
                  currentAccuracy={journeyAccuracy}
                  tracking={tracking}
                  trackingError={trackingError}
                  onStartTracking={startJourneyTracking}
                  onStopTracking={stopJourneyTracking}
                />
              ) : null}
            </>
          )}

          <View style={tw`rounded-3xl border border-amber-100 bg-amber-50 px-5 py-4`}>
            <Text style={tw`text-xs font-black text-amber-800 mb-1`}>Area intelligence, not guaranteed safety</Text>
            <Text style={tw`text-xs text-amber-700 leading-5`}>Route Guard is area intelligence, not emergency guidance. Free public routing can be unavailable or approximate, and transit mode currently uses a walking-corridor estimate.</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function LocationInput({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText(value: string): void; placeholder: string }) {
  return (
    <View style={tw`mb-4`}>
      <Text style={tw`text-[10px] font-black tracking-widest text-slate-400 mb-2`}>{label}</Text>
      <View style={tw`h-15 rounded-2xl border border-slate-200 bg-white px-4 flex-row items-center`}>
        <MapPin size={19} color="#94a3b8" />
        <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#94a3b8" autoCorrect={false} style={tw`flex-1 h-full ml-3 text-sm font-bold text-slate-900`} />
      </View>
    </View>
  );
}

function RouteResult({
  result,
  currentLocation,
  currentAccuracy,
  tracking,
  trackingError,
  onStartTracking,
  onStopTracking,
}: {
  result: RouteGuardScan;
  currentLocation: MapCoordinate | null;
  currentAccuracy: number | null;
  tracking: boolean;
  trackingError: string | null;
  onStartTracking(): void;
  onStopTracking(): void;
}) {
  const risk = RISK_COLORS[result.overallRiskLevel];
  const routePoints = result.routePoints.map(({ latitude, longitude }) => ({ latitude, longitude }));
  const routeRiskSamples = result.sampledRiskScores
    .filter((sample): sample is RouteMapRiskSample => Number.isFinite(sample.latitude) && Number.isFinite(sample.longitude))
    .map((sample) => ({
      pointIndex: sample.pointIndex,
      latitude: sample.latitude,
      longitude: sample.longitude,
      score: sample.score,
      riskLevel: sample.riskLevel,
      basis: sample.basis,
    }));
  const mapCenter = centerForRoute(routePoints);
  const progress = currentLocation ? summarizeRouteProgress({
    currentLocation,
    routePoints,
    routeRiskSamples,
    alertRadiusMetres: 500,
  }) : null;
  const liveRiskLevel = progress?.upcomingHotzone?.riskLevel ?? progress?.nearestSample?.riskLevel ?? result.overallRiskLevel;
  const liveRisk = RISK_COLORS[liveRiskLevel];

  return (
    <View style={[membershipStyles.card, membershipStyles.elevatedCard, tw`mb-5`]}>
      <View style={tw`flex-row items-start justify-between mb-5`}>
        <View style={tw`flex-1 pr-3`}>
          <Text style={tw`text-[10px] font-black tracking-widest text-slate-400 mb-1`}>ROUTE PREVIEW RESULT</Text>
          <Text style={tw`text-lg font-black text-slate-950`}>{result.start} to {result.destination}</Text>
          <View style={tw`flex-row items-center mt-2`}><Clock3 size={15} color={membershipColors.slate} /><Text style={tw`text-xs font-bold text-slate-500 ml-2`}>{result.distanceEstimate.kilometres} km - about {result.durationEstimate.minutes} min</Text></View>
          {result.geocoded ? (
            <Text style={tw`text-[11px] text-slate-400 leading-4 mt-2`}>
              {result.geocoded.start.label} to {result.geocoded.destination.label}
            </Text>
          ) : null}
        </View>
        <View style={{ borderRadius: 18, backgroundColor: risk.soft, paddingHorizontal: 13, paddingVertical: 10, alignItems: 'center' }}>
          <Text style={{ color: risk.strong, fontSize: 22, fontWeight: '900' }}>{result.overallRiskScore}</Text>
          <Text style={{ color: risk.strong, fontSize: 9, fontWeight: '900', letterSpacing: 1 }}>{risk.label}</Text>
        </View>
      </View>

      {routePoints.length >= 2 ? (
        <View style={tw`overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 mb-5`}>
          <CrimeMapCanvas
            center={mapCenter}
            markers={[]}
            selectedPoint={currentLocation ?? routePoints[0]}
            areaPoints={[]}
            boundaryPoints={[]}
            routeLine={{ points: routePoints, riskLevel: result.overallRiskLevel }}
            routeRiskSamples={routeRiskSamples}
            dataKey={`${result.provider}:${result.start}:${result.destination}:${result.overallRiskScore}:${currentLocation?.latitude ?? 'no-live'}`}
            onMapPress={() => undefined}
            onOpenEvidence={() => undefined}
          />
        </View>
      ) : null}

      <LiveProgressCard
        progress={progress}
        currentAccuracy={currentAccuracy}
        tracking={tracking}
        trackingError={trackingError}
        color={liveRisk}
        onStartTracking={onStartTracking}
        onStopTracking={onStopTracking}
      />

      <View style={tw`rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 mb-5`}>
        <Text style={tw`text-[10px] font-black tracking-widest text-slate-400 mb-1`}>ROUTE SOURCE</Text>
        <Text style={tw`text-xs font-bold text-slate-700`}>
          {result.provider === 'free-osm' ? 'Free OSM/OSRM route scan' : 'Generated fallback route scan'}
        </Text>
        {result.routeProvider ? <Text style={tw`text-[11px] text-slate-500 leading-4 mt-1`}>{result.routeProvider.modeDisclosure}</Text> : null}
        {result.fallbackReason ? <Text selectable style={tw`text-[11px] text-amber-700 leading-4 mt-1`}>Fallback used: {result.fallbackReason}</Text> : null}
      </View>

      <View style={tw`flex-row items-center mb-5`}>
        {result.sampledRiskScores.map((sample, index) => (
          <React.Fragment key={sample.pointIndex}>
            {index > 0 ? <View style={tw`flex-1 h-1 bg-slate-200`} /> : null}
            <View style={{ width: 15, height: 15, borderRadius: 8, backgroundColor: RISK_COLORS[sample.riskLevel].strong, borderWidth: 3, borderColor: RISK_COLORS[sample.riskLevel].soft }} />
          </React.Fragment>
        ))}
      </View>

      <Text style={tw`text-sm font-black text-slate-950 mb-3`}>Hotzone sections</Text>
      {result.hotzoneSections.length > 0 ? result.hotzoneSections.map((hotzone) => {
        const color = RISK_COLORS[hotzone.riskLevel];
        return (
          <View key={hotzone.id} style={[tw`rounded-2xl px-4 py-3 mb-2 flex-row items-center`, { backgroundColor: color.soft }]}>
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color.strong, marginRight: 10 }} />
            <View style={tw`flex-1`}><Text style={tw`text-xs font-black text-slate-900`}>Route samples {hotzone.startPointIndex + 1}-{hotzone.endPointIndex + 1}</Text><Text style={tw`text-[11px] text-slate-500 mt-1`}>{hotzone.summary}</Text></View>
            <Text style={{ color: color.strong, fontSize: 16, fontWeight: '900' }}>{hotzone.riskScore}</Text>
          </View>
        );
      }) : <Text style={tw`text-xs text-slate-500 mb-3`}>No elevated preview sections were found on this route.</Text>}

      <Text style={tw`text-[10px] text-slate-400 leading-4 mt-3`}>{result.disclaimer}</Text>
      <Text style={tw`text-[10px] font-bold text-indigo-600 mt-2`}>Google requests made: 0</Text>
    </View>
  );
}

function LiveProgressCard({
  progress,
  currentAccuracy,
  tracking,
  trackingError,
  color,
  onStartTracking,
  onStopTracking,
}: {
  progress: RouteGuardProgressSummary | null;
  currentAccuracy: number | null;
  tracking: boolean;
  trackingError: string | null;
  color: { strong: string; soft: string; label: string };
  onStartTracking(): void;
  onStopTracking(): void;
}) {
  const statusCopy = progress?.status === 'off-route'
    ? 'OFF SCANNED ROUTE'
    : tracking
      ? 'LIVE POSITION ACTIVE'
      : 'LIVE POSITION READY';
  const nearestScore = progress?.upcomingHotzone?.score ?? progress?.nearestSample?.score;

  return (
    <View style={[tw`rounded-3xl border px-4 py-4 mb-5`, { backgroundColor: color.soft, borderColor: `${color.strong}33` }]}>
      <View style={tw`flex-row items-start justify-between`}>
        <View style={tw`flex-1 pr-3`}>
          <Text style={{ color: color.strong, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }}>{statusCopy}</Text>
          <Text style={tw`text-sm font-black text-slate-950 mt-1`}>Live route awareness</Text>
          <Text style={tw`text-xs text-slate-600 leading-5 mt-2`}>
            {progress?.message ?? 'Start live position after scanning to let RiskRadar compare your movement with the route risk samples.'}
          </Text>
          {currentAccuracy ? (
            <Text style={tw`text-[10px] text-slate-400 mt-2`}>Location accuracy: about {Math.round(currentAccuracy)} m</Text>
          ) : null}
        </View>
        {nearestScore ? (
          <View style={{ minWidth: 58, borderRadius: 18, backgroundColor: 'white', paddingHorizontal: 10, paddingVertical: 9, alignItems: 'center' }}>
            <Text style={{ color: color.strong, fontSize: 20, fontWeight: '900' }}>{nearestScore}</Text>
            <Text style={{ color: color.strong, fontSize: 8, fontWeight: '900', letterSpacing: 1 }}>/100</Text>
          </View>
        ) : null}
      </View>

      {trackingError ? <Text selectable style={tw`text-xs font-bold text-rose-600 mt-3`}>{trackingError}</Text> : null}

      <Pressable
        onPress={tracking ? onStopTracking : onStartTracking}
        accessibilityRole="button"
        style={({ pressed }) => [
          tw`mt-4 rounded-2xl px-4 py-3 flex-row items-center justify-center`,
          { backgroundColor: tracking ? '#0f172a' : color.strong },
          pressed && tw`opacity-80`,
        ]}
      >
        <Crosshair size={17} color="white" />
        <Text style={tw`text-white font-black ml-2`}>
          {tracking ? 'Stop live position' : 'Start live position'}
        </Text>
      </Pressable>
    </View>
  );
}

function centerForRoute(points: MapCoordinate[]): MapCoordinate {
  if (!points.length) return { latitude: 52.6, longitude: -1.5 };
  return points.reduce(
    (current, point) => ({
      latitude: current.latitude + point.latitude / points.length,
      longitude: current.longitude + point.longitude / points.length,
    }),
    { latitude: 0, longitude: 0 },
  );
}
