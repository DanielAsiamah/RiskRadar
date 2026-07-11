import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, BarChart3, Plus, Search, Trash2, TrendingDown, TrendingUp, Minus } from 'lucide-react-native';
import tw from 'twrnc';
import { apiRequest } from '../api/client';
import { PostcodeResult } from '../types';

interface ComparisonResponse {
  comparedAt: string;
  summary: string;
  results: PostcodeResult[];
}

export default function ComparePostcodes({ onBack }: { onBack: () => void }) {
  const [queries, setQueries] = useState(['BR1 5NN', 'SW1A 1AA']);
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateQuery = (index: number, value: string) => {
    setQueries((current) => current.map((query, queryIndex) => queryIndex === index ? value : query));
  };

  const compare = async () => {
    const postcodes = queries.map((query) => query.trim()).filter(Boolean);
    if (new Set(postcodes.map((query) => query.toUpperCase())).size < 2) {
      setError('Enter at least two different postcodes or UK places.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await apiRequest<ComparisonResponse>('/api/compare-postcodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postcodes }),
      }, 90_000);
      setComparison(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to compare these locations.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={tw`flex-1 bg-white`}>
      <ScrollView contentContainerStyle={tw`p-4 pb-14`} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
        <View style={tw`flex-row items-center gap-3 mb-6`}>
          <TouchableOpacity onPress={onBack} style={tw`w-10 h-10 bg-slate-100 rounded-full items-center justify-center`} accessibilityLabel="Back to RiskRadar">
            <ArrowLeft size={20} color={tw.color('slate-700')} />
          </TouchableOpacity>
          <View style={tw`flex-1`}>
            <Text style={tw`text-2xl font-black text-slate-900`}>Compare Locations</Text>
            <Text style={tw`text-xs text-slate-500`}>The same local scoring model, side by side</Text>
          </View>
        </View>

        <View style={tw`bg-slate-50 border border-slate-200 rounded-3xl p-4 mb-4`}>
          {queries.map((query, index) => (
            <View key={index} style={tw`flex-row items-center gap-2 mb-3`}>
              <View style={tw`w-8 h-8 rounded-full bg-indigo-100 items-center justify-center`}>
                <Text style={tw`text-xs font-black text-indigo-600`}>{index + 1}</Text>
              </View>
              <TextInput
                value={query}
                onChangeText={(value) => updateQuery(index, value)}
                onSubmitEditing={index === queries.length - 1 ? () => void compare() : undefined}
                returnKeyType={index === queries.length - 1 ? 'search' : 'next'}
                placeholder="Postcode or UK place"
                autoCapitalize="characters"
                autoCorrect={false}
                style={tw`flex-1 h-12 bg-white border border-slate-200 rounded-xl px-4 text-slate-900 uppercase`}
              />
              {queries.length > 2 && (
                <TouchableOpacity onPress={() => setQueries((current) => current.filter((_, queryIndex) => queryIndex !== index))} style={tw`w-10 h-10 items-center justify-center`}>
                  <Trash2 size={16} color={tw.color('slate-400')} />
                </TouchableOpacity>
              )}
            </View>
          ))}

          {queries.length < 5 && (
            <TouchableOpacity onPress={() => setQueries((current) => [...current, ''])} style={tw`flex-row items-center justify-center gap-2 h-11`}>
              <Plus size={16} color={tw.color('indigo-600')} />
              <Text style={tw`text-xs font-bold text-indigo-600`}>Add another location</Text>
            </TouchableOpacity>
          )}
        </View>

        {error && <Text selectable style={tw`text-sm font-bold text-rose-600 bg-rose-50 p-4 rounded-2xl mb-4`}>{error}</Text>}

        <TouchableOpacity onPress={() => void compare()} disabled={loading} style={tw`h-14 bg-indigo-600 rounded-2xl flex-row items-center justify-center gap-3 mb-6`}>
          {loading ? <ActivityIndicator color="white" /> : <Search size={18} color="white" />}
          <Text style={tw`text-white font-bold`}>{loading ? 'Comparing live data...' : 'Compare Risk'}</Text>
        </TouchableOpacity>

        {comparison && (
          <View>
            <View style={tw`bg-slate-900 rounded-3xl p-5 mb-5`}>
              <View style={tw`flex-row items-center gap-2 mb-2`}>
                <BarChart3 size={18} color="#a5b4fc" />
                <Text style={tw`text-xs font-bold text-indigo-200 uppercase tracking-widest`}>Comparison summary</Text>
              </View>
              <Text selectable style={tw`text-sm text-white leading-6`}>{comparison.summary}</Text>
            </View>

            {comparison.results.map((result, index) => (
              <ComparisonCard key={`${result.postcodeData.postcode}-${index}`} result={result} rank={index + 1} highest={index === 0} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ComparisonCard({ result, rank, highest }: { result: PostcodeResult; rank: number; highest: boolean }) {
  const trend = result.trendData?.direction ?? 'stable';
  const trendIcon = trend === 'rising'
    ? <TrendingUp size={16} color="#e11d48" />
    : trend === 'cooling'
      ? <TrendingDown size={16} color="#059669" />
      : <Minus size={16} color="#64748b" />;

  return (
    <View style={tw`border ${highest ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'} rounded-3xl p-5 mb-4`}>
      <View style={tw`flex-row items-start justify-between mb-5`}>
        <View style={tw`flex-row items-center gap-3 flex-1`}>
          <View style={tw`w-9 h-9 rounded-full ${highest ? 'bg-indigo-600' : 'bg-slate-100'} items-center justify-center`}>
            <Text style={tw`font-black ${highest ? 'text-white' : 'text-slate-600'}`}>#{rank}</Text>
          </View>
          <View style={tw`flex-1`}>
            <Text selectable style={tw`text-lg font-black text-slate-900`}>{result.postcodeData.postcode}</Text>
            <Text selectable style={tw`text-xs text-slate-500`}>{result.postcodeData.admin_district}</Text>
          </View>
        </View>
        <View style={tw`items-end`}>
          <Text style={[tw`text-3xl font-black text-indigo-600`, { fontVariant: ['tabular-nums'] }]}>{result.crimeData.crimeScore}</Text>
          <Text style={tw`text-[10px] font-bold text-slate-400`}>RISK / 100</Text>
        </View>
      </View>

      <View style={tw`flex-row gap-2 mb-4`}>
        <Metric label="LOCAL INCIDENTS" value={String(result.crimeData.totalCrimes)} />
        <Metric label="WIDER CONTEXT" value={String(result.crimeData.contextCrimeCount ?? '—')} />
        <Metric label="TREND" value={trend.toUpperCase()} icon={trendIcon} />
      </View>

      <Text style={tw`text-xs text-slate-500 leading-5 mb-3`}>{result.aiAnalysis.summary}</Text>
      <View style={tw`flex-row flex-wrap gap-2`}>
        {result.crimeData.categories.slice(0, 3).map((category) => (
          <View key={category.category} style={tw`bg-white border border-slate-200 rounded-full px-3 py-2`}>
            <Text style={tw`text-[11px] font-bold text-slate-600`}>{humanize(category.category)} {category.count}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <View style={tw`flex-1 bg-white border border-slate-200 rounded-xl p-3`}>
      <Text style={tw`text-[9px] font-bold text-slate-400 mb-1`}>{label}</Text>
      <View style={tw`flex-row items-center gap-1`}>
        {icon}
        <Text style={[tw`text-xs font-black text-slate-800`, { fontVariant: ['tabular-nums'] }]}>{value}</Text>
      </View>
    </View>
  );
}

function humanize(value: string) {
  return value.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}
