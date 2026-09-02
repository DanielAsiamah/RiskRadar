import React, { useState } from 'react';
import {
  ActivityIndicator,
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
  Footprints,
  LockKeyhole,
  MapPin,
  Navigation,
  ShieldAlert,
  Sparkles,
} from 'lucide-react-native';
import tw from 'twrnc';

import { scanRouteGuard, type RouteGuardRiskLevel, type RouteGuardScan, type RouteGuardTravelMode } from '../api/route-guard';
import { membershipColors, membershipStyles } from './membershipStyles';

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
  const [destination, setDestination] = useState('');
  const [travelMode, setTravelMode] = useState<RouteGuardTravelMode>('walking');
  const [result, setResult] = useState<RouteGuardScan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canScan = premium && usageReady && routeScansUsed < 100 && start.trim().length > 0 && destination.trim().length > 0 && !loading;

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
        start: start.trim(),
        destination: destination.trim(),
        travelMode,
        entitlement: 'pro',
        routeScansUsed,
      });
      setResult(scan);
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
                <LocationInput label="START" value={start} onChangeText={setStart} placeholder="Postcode or place" />
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

              {result ? <RouteResult result={result} /> : null}
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

function RouteResult({ result }: { result: RouteGuardScan }) {
  const risk = RISK_COLORS[result.overallRiskLevel];
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
