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
import { BarChart3, Compass, LocateFixed, Map, MapPin, Search, ShieldCheck } from 'lucide-react-native';
import tw from 'twrnc';

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
  nearbySuggestions?: NearbySuggestion[];
  useCurrentLocation: () => void;
  findingNearby: boolean;
  openMapExplorer: () => void;
  openComparison: () => void;
}

const INDIGO = '#4f46e5';

export default function Landing({
  postcodeInput,
  setPostcodeInput,
  handleSearch,
  error,
  recentSearches = [],
  clearSearches,
  nearbySuggestions = [],
  useCurrentLocation,
  findingNearby,
  openMapExplorer,
  openComparison,
}: LandingProps) {
  const canSearch = Boolean(postcodeInput.trim());

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
            <View style={tw`w-9 h-9 rounded-full bg-emerald-50 items-center justify-center`}>
              <ShieldCheck size={18} color="#059669" />
            </View>
          </View>

          <View style={tw`mb-8`}>
            <Text style={tw`text-4xl font-black tracking-tight text-slate-950 leading-10 mb-3`}>
              Know the area before you arrive.
            </Text>
            <Text style={tw`text-base text-slate-500 leading-6`}>
              Search any UK postcode for recent crime trends, local hotspots, and a clear evidence-based risk score.
            </Text>
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
                onSubmitEditing={handleSearch}
                accessibilityLabel="UK postcode or place"
              />
            </View>

            {error ? <Text selectable style={tw`text-rose-600 text-sm font-bold mb-3 px-1`}>{error}</Text> : null}

            <ActionButton
              label="Check Risk"
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

function FeatureButton({ label, icon, onPress }: { label: string; icon: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={5}
      accessibilityRole="button"
      style={({ pressed }) => [tw`flex-1 h-24 rounded-2xl border border-slate-200 bg-white px-4 justify-center`, pressed && tw`bg-slate-100`]}
    >
      {icon}
      <Text style={tw`text-sm font-black text-slate-900 mt-3`}>{label}</Text>
    </Pressable>
  );
}

function ChipSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={tw`mb-7`}><Text style={tw`text-[10px] font-bold tracking-widest text-slate-400 mb-3`}>{title}</Text><View style={tw`flex-row flex-wrap gap-2`}>{children}</View></View>;
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} hitSlop={4} style={({ pressed }) => [tw`px-4 py-3 rounded-full border border-slate-200 bg-white`, pressed && tw`bg-indigo-50`]}><Text style={tw`text-sm font-bold text-slate-600`}>{label}</Text></Pressable>;
}
