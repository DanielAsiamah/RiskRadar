import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BarChart3, ChevronRight, Compass, LocateFixed, Map, MapPin, Navigation, Search, ShieldCheck, Sparkles } from 'lucide-react-native';
import tw from 'twrnc';
import { searchSubmissionDecision } from '../membership/client-state.mjs';
import SiteFooter, { type TrustNavigation } from './SiteFooter';

interface NearbySuggestion {
  postcode: string;
  admin_district: string;
}

interface LandingProps {
  postcodeInput: string;
  setPostcodeInput: (value: string) => void;
  handleSearch: () => void;
  error: string | null;
  recentSearches?: string[];
  clearSearches?: () => void;
  searchCount: number;
  freeSearchLimit: number;
  premium: boolean;
  membershipAvailable: boolean;
  searchHydrated: boolean;
  accountLabel: string;
  nearbySuggestions?: NearbySuggestion[];
  useCurrentLocation: () => void;
  findingNearby: boolean;
  openMapExplorer: () => void;
  openComparison: () => void;
  openRouteGuard: () => void;
  openAccount: () => void;
  openPremium: () => void;
  openSafetySession: () => void;
  trustNavigation: TrustNavigation;
}

const INDIGO = '#4f46e5';

export default function Landing({
  postcodeInput,
  setPostcodeInput,
  handleSearch,
  error,
  recentSearches = [],
  clearSearches,
  searchCount,
  freeSearchLimit,
  premium,
  membershipAvailable,
  searchHydrated,
  accountLabel,
  nearbySuggestions = [],
  useCurrentLocation,
  findingNearby,
  openMapExplorer,
  openComparison,
  openRouteGuard,
  openAccount,
  openPremium,
  openSafetySession,
  trustNavigation,
}: LandingProps) {
  const canSearch = searchSubmissionDecision(searchHydrated, postcodeInput) === 'ready';
  const freeSearchesRemaining = Math.max(0, freeSearchLimit - searchCount);

  return (
    <KeyboardAvoidingView style={tw`flex-1 bg-white`} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={tw`grow px-5 pt-8 pb-12`}
        keyboardShouldPersistTaps="always"
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={tw`w-full max-w-md self-center`}>
          <View style={tw`flex-row items-center justify-between mb-10`}>
            <View style={tw`flex-row items-center gap-3`}>
              <View style={tw`w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 items-center justify-center`}>
                <Compass size={27} color={INDIGO} strokeWidth={2.4} />
              </View>
              <View>
                <Text style={tw`text-2xl font-black tracking-tight text-slate-950`}>RiskRadar</Text>
                <Text style={tw`text-[10px] font-bold tracking-widest text-slate-400`}>LIVE UK AREA INTELLIGENCE</Text>
              </View>
            </View>
            <Pressable
              onPress={openAccount}
              hitSlop={6}
              accessibilityRole="button"
              style={({ pressed }) => [tw`h-10 rounded-full bg-emerald-50 flex-row items-center px-3`, pressed && tw`opacity-70`]}
            >
              <ShieldCheck size={17} color="#059669" />
              <Text style={tw`text-[11px] font-black text-emerald-700 ml-2`}>{accountLabel}</Text>
            </Pressable>
          </View>

          <View style={tw`mb-8`}>
            <Text style={tw`text-4xl font-black tracking-tight text-slate-950 leading-10 mb-3`}>
              Know the area before you arrive.
            </Text>
            <Text style={tw`text-base text-slate-500 leading-6`}>
              Search any UK postcode for recent crime trends, local hotspots, and a clear evidence-based risk score.
            </Text>
          </View>

          <View style={tw`rounded-3xl border border-indigo-100 bg-indigo-50 p-4 mb-4`}>
            <Text style={tw`text-[10px] font-bold tracking-widest text-indigo-500 mb-2`}>FREE PLAN</Text>
            <Text style={tw`text-slate-900 text-lg font-black mb-1`}>
              {membershipAvailable ? `${freeSearchesRemaining} of ${freeSearchLimit} checks left today` : 'Core checks available'}
            </Text>
            <Text style={tw`text-slate-500 leading-5 mb-3`}>
              {membershipAvailable
                ? 'Premium is GBP 15/month for unlimited checks, Route Guard, and Safety Sessions.'
                : 'Account setup is being connected. Search, maps, nearby suggestions, and public evidence remain available.'}
            </Text>
            <Pressable onPress={openPremium} hitSlop={6} accessibilityRole="button">
              <Text style={tw`text-indigo-700 font-black`}>Explore Premium</Text>
            </Pressable>
          </View>

          <View style={tw`rounded-3xl border border-slate-200 bg-slate-50 p-4 mb-4`}>
            <Text style={tw`text-[10px] font-bold tracking-widest text-slate-400 mb-3`}>SEARCH A LOCATION</Text>
            <View style={tw`h-16 flex-row items-center rounded-2xl border border-slate-200 bg-white px-4 mb-3`}>
              <MapPin size={22} color="#94a3b8" />
              <TextInput
                style={tw`flex-1 h-full ml-3 text-lg font-bold text-slate-900 uppercase`}
                placeholder="Enter UK postcode or place"
                placeholderTextColor="#94a3b8"
                value={postcodeInput}
                onChangeText={setPostcodeInput}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={canSearch ? handleSearch : undefined}
                accessibilityLabel="UK postcode or place"
              />
            </View>

            {error ? <Text selectable style={tw`text-rose-600 text-sm font-bold mb-3 px-1`}>{error}</Text> : null}

            <ActionButton
              label={searchHydrated ? 'Check Risk' : 'Loading search allowance...'}
              icon={<Search size={20} color="white" />}
              onPress={handleSearch}
              disabled={!canSearch}
              primary
            />
          </View>

          <Pressable
            onPress={useCurrentLocation}
            disabled={findingNearby}
            hitSlop={6}
            style={({ pressed }) => [tw`h-14 rounded-2xl border border-indigo-100 bg-indigo-50 flex-row items-center justify-center gap-3 mb-7`, pressed && tw`opacity-70`, findingNearby && tw`opacity-60`]}
            accessibilityRole="button"
          >
            <LocateFixed size={19} color={INDIGO} />
            <Text style={tw`font-bold text-indigo-700`}>{findingNearby ? 'Finding nearby postcodes...' : 'Use my current location'}</Text>
          </Pressable>

          <Text style={tw`text-[10px] font-bold tracking-widest text-slate-400 mb-3`}>EXPLORE MORE</Text>
          <View style={tw`flex-row gap-3 mb-8`}>
            <FeatureButton label="Crime map" icon={<Map size={21} color="#0f172a" />} onPress={openMapExplorer} />
            <FeatureButton label="Compare" icon={<BarChart3 size={21} color="#0f172a" />} onPress={openComparison} />
            <FeatureButton label="Route Guard" badge="PRO" icon={<Navigation size={21} color="#4f46e5" />} onPress={openRouteGuard} />
          </View>

          <Pressable
            onPress={openPremium}
            accessibilityRole="button"
            style={({ pressed }) => [tw`rounded-3xl border border-indigo-100 bg-indigo-50 px-5 py-4 flex-row items-center mb-8`, pressed && tw`opacity-75`]}
          >
            <View style={tw`w-11 h-11 rounded-2xl bg-white items-center justify-center mr-3`}>
              <Sparkles size={20} color={INDIGO} />
            </View>
            <View style={tw`flex-1`}>
              <Text style={tw`text-sm font-black text-slate-950`}>{premium ? 'RiskRadar Premium is active' : 'Explore RiskRadar Premium'}</Text>
              <Text style={tw`text-xs text-slate-500 mt-1`}>
                {premium
                  ? 'Unlimited searches and member intelligence.'
                  : membershipAvailable
                    ? `${freeSearchesRemaining} free ${freeSearchesRemaining === 1 ? 'search' : 'searches'} left today.`
                    : 'Core area intelligence is available without an account.'}
              </Text>
            </View>
            <ChevronRight size={18} color={INDIGO} />
          </Pressable>

          <View style={tw`mb-8`}>
            <FeatureButton label="Safety Session" icon={<ShieldCheck size={21} color="#0f172a" />} onPress={openSafetySession} />
          </View>

          {nearbySuggestions.length > 0 ? (
            <ChipSection title="SUGGESTED NEAR YOU">
              {nearbySuggestions.map((suggestion) => (
                <Chip key={`${suggestion.postcode}-${suggestion.admin_district}`} label={suggestion.postcode} onPress={() => setPostcodeInput(suggestion.postcode)} />
              ))}
            </ChipSection>
          ) : null}

          {recentSearches.length > 0 ? (
            <View style={tw`mt-2`}>
              <View style={tw`flex-row items-center justify-between mb-3`}>
                <Text style={tw`text-[10px] font-bold tracking-widest text-slate-400`}>RECENT SEARCHES</Text>
                {clearSearches ? <Pressable onPress={clearSearches} hitSlop={10}><Text style={tw`text-[10px] font-bold tracking-widest text-indigo-600`}>CLEAR</Text></Pressable> : null}
              </View>
              <View style={tw`flex-row flex-wrap gap-2`}>
                {recentSearches.map((term) => <Chip key={term} label={term} onPress={() => setPostcodeInput(term)} />)}
              </View>
            </View>
          ) : null}

          <SiteFooter {...trustNavigation} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ActionButton({ label, icon, onPress, disabled, primary = false }: { label: string; icon: React.ReactNode; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        tw`h-16 rounded-2xl flex-row items-center justify-center gap-3`,
        primary ? { backgroundColor: disabled ? '#a5b4fc' : INDIGO } : tw`bg-slate-900`,
        pressed && !disabled && tw`opacity-80`,
      ]}
    >
      {icon}
      <Text style={tw`text-white text-lg font-black`}>{label}</Text>
    </Pressable>
  );
}

function FeatureButton({ label, icon, onPress, badge }: { label: string; icon: React.ReactNode; onPress: () => void; badge?: string }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={5}
      accessibilityRole="button"
      style={({ pressed }) => [tw`flex-1 h-24 rounded-2xl border border-slate-200 bg-white px-4 justify-center`, pressed && tw`bg-slate-100`]}
    >
      {icon}
      <View style={tw`flex-row items-center mt-3`}>
        <Text style={tw`text-xs font-black text-slate-900`}>{label}</Text>
        {badge ? <View style={tw`ml-1 rounded-full bg-indigo-600 px-1.5 py-0.5`}><Text style={tw`text-[8px] font-black text-white`}>{badge}</Text></View> : null}
      </View>
    </Pressable>
  );
}

function ChipSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={tw`mb-7`}><Text style={tw`text-[10px] font-bold tracking-widest text-slate-400 mb-3`}>{title}</Text><View style={tw`flex-row flex-wrap gap-2`}>{children}</View></View>;
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} hitSlop={4} style={({ pressed }) => [tw`px-4 py-3 rounded-full border border-slate-200 bg-white`, pressed && tw`bg-indigo-50`]}><Text style={tw`text-sm font-bold text-slate-600`}>{label}</Text></Pressable>;
}
