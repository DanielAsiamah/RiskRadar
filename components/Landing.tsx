import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Search, MapPin, Compass, LocateFixed } from 'lucide-react-native';
import tw from 'twrnc';

interface NearbySuggestion {
  postcode: string;
  admin_district: string;
}

interface LandingProps {
  postcodeInput: string;
  setPostcodeInput: (val: string) => void;
  handleSearch: () => void;
  error: string | null;
  recentSearches?: string[];
  clearSearches?: () => void;
  searchCount: number;
  nearbySuggestions?: NearbySuggestion[];
  useCurrentLocation: () => void;
  findingNearby: boolean;
}

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
}: LandingProps) {
  return (
    <View style={tw`flex-1 items-center justify-center px-4 bg-white`}>
      <View style={tw`w-20 h-20 bg-white border border-slate-200 shadow-sm rounded-3xl flex items-center justify-center mb-8`}>
        <Compass size={40} color={tw.color('indigo-500')} />
      </View>
      
      <Text style={tw`text-5xl font-extrabold tracking-tight text-slate-900 mb-6 text-center`}>
        RiskRadar
      </Text>
      
      <Text style={tw`text-slate-500 text-lg text-center max-w-sm mb-12`}>
        Enter a postcode, ZIP code, city, or place to instantly evaluate safety, travel risks, and local metrics.
      </Text>

      <View style={tw`w-full max-w-md`}>
        <View style={tw`relative flex-row items-center bg-white border-2 border-slate-200 rounded-2xl mb-4 h-16 px-4`}>
          <MapPin size={24} color={tw.color('slate-400')} />
          <TextInput
            style={tw`flex-1 h-full ml-3 text-lg text-slate-900 uppercase`}
            placeholder="e.g. SW1A 1AA or Manchester"
            placeholderTextColor={tw.color('slate-400')}
            value={postcodeInput}
            onChangeText={setPostcodeInput}
            autoCapitalize="characters"
          />
        </View>

        {error && (
          <Text style={tw`text-red-500 text-center mb-4 font-bold`}>{error}</Text>
        )}

        <TouchableOpacity
          onPress={handleSearch}
          style={tw`bg-indigo-600 h-16 rounded-2xl shadow-md flex-row items-center justify-center gap-3`}
        >
          <Search size={20} color="white" />
          <Text style={tw`text-white font-bold text-lg`}>Check Risk</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={useCurrentLocation}
          style={tw`mt-3 h-14 rounded-2xl border border-slate-200 bg-white flex-row items-center justify-center gap-3`}
        >
          <LocateFixed size={18} color={tw.color('indigo-500')} />
          <Text style={tw`text-slate-700 font-bold`}>{findingNearby ? 'Finding Nearby Postcodes...' : 'Use My Location'}</Text>
        </TouchableOpacity>
      </View>

      {nearbySuggestions.length > 0 && (
        <View style={tw`items-center mt-8 max-w-md`}>
          <Text style={tw`text-xs font-bold text-slate-400 uppercase tracking-widest mb-4`}>Suggested Near You</Text>
          <View style={tw`flex-row flex-wrap justify-center gap-2`}>
            {nearbySuggestions.map((suggestion) => (
              <TouchableOpacity
                key={`${suggestion.postcode}-${suggestion.admin_district}`}
                onPress={() => setPostcodeInput(suggestion.postcode)}
                style={tw`px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl`}
              >
                <Text style={tw`text-sm font-bold text-slate-800 text-center`}>{suggestion.postcode}</Text>
                <Text style={tw`text-[11px] text-slate-500 text-center mt-1`}>{suggestion.admin_district}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {recentSearches.length > 0 && (
        <View style={tw`items-center mt-10`}>
          <View style={tw`flex-row items-center justify-center mb-4`}>
            <Text style={tw`text-xs font-bold text-slate-400 uppercase tracking-widest mr-4`}>Recent Searches</Text>
            {clearSearches && (
              <TouchableOpacity onPress={clearSearches}>
                <Text style={tw`text-xs font-bold text-slate-400 uppercase tracking-wider`}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={tw`flex-row flex-wrap justify-center gap-2 max-w-sm`}>
            {recentSearches.map(term => (
              <TouchableOpacity 
                key={term}
                onPress={() => setPostcodeInput(term)}
                style={tw`px-4 py-2 bg-white border border-slate-200 rounded-full shadow-sm`}
              >
                <Text style={tw`text-sm font-medium text-slate-600`}>{term}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
