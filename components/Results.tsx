import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Shield, AlertTriangle, Search, ChevronDown, Info } from 'lucide-react-native';
import tw from 'twrnc';
import { PostcodeResult } from '../types';
import AnimatedRiskScore from './AnimatedRiskScore';
import { HotspotView, TrendChart } from './IntelligenceCharts';

interface ResultsProps {
  result: PostcodeResult;
  onReset: () => void;
}

export default function Results({ result, onReset }: ResultsProps) {
  const [showDetails, setShowDetails] = useState(false);

  const getBadge = (score: number) => {
    if (score >= 85) return { label: 'SEVERE', bg: 'bg-rose-700' };
    if (score >= 75) return { label: 'VERY HIGH', bg: 'bg-rose-600' };
    if (score >= 65) return { label: 'HIGH', bg: 'bg-rose-500' };
    if (score >= 50) return { label: 'ELEVATED', bg: 'bg-amber-500' };
    if (score >= 35) return { label: 'MODERATE', bg: 'bg-yellow-500' };
    if (score >= 20) return { label: 'NORMAL URBAN CAUTION', bg: 'bg-sky-500' };
    return { label: 'LOW RISK', bg: 'bg-emerald-500' };
  };

  const badge = getBadge(result.crimeData.crimeScore);

  return (
    <View style={tw`flex-1 bg-white`}>
      <ScrollView contentContainerStyle={tw`p-4 pb-12`} contentInsetAdjustmentBehavior="automatic">
        <View style={tw`flex-row justify-between items-center mb-8`}>
          <View>
            <Text style={tw`text-xs font-bold text-slate-400 uppercase tracking-widest mb-1`}>
              Target Analyzed
            </Text>
            <Text style={tw`text-3xl font-black text-slate-900`}>
              {result.postcodeData.postcode}
            </Text>
            <Text style={tw`text-slate-500`}>
              {result.postcodeData.admin_district}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onReset}
            style={tw`flex-row items-center gap-2 px-4 py-2 bg-slate-100 rounded-full`}
          >
            <Search size={16} color={tw.color('slate-700')} />
            <Text style={tw`font-bold text-slate-700`}>New</Text>
          </TouchableOpacity>
        </View>

        <View style={tw`bg-white border border-slate-200 rounded-3xl p-6 shadow-sm items-center mb-6`}>
          <View style={tw`px-4 py-2 rounded-full mb-6 ${badge.bg}`}>
            <Text style={tw`font-bold text-xs tracking-wide uppercase text-white`}>{badge.label}</Text>
          </View>

          <AnimatedRiskScore score={result.crimeData.crimeScore} label="OVERALL RISK INDEX" loading={false} />

          <Text style={tw`text-sm font-bold text-slate-500 uppercase tracking-widest mt-6`}>Overall Risk Index</Text>

          {result.crimeData.capExplanation && (
            <View style={tw`mt-4 p-3 bg-slate-50 border border-slate-100 rounded-xl`}>
              <Text style={tw`text-xs text-slate-500`}>
                <Text style={tw`font-bold`}>Scoring Rule Applied: </Text>
                {result.crimeData.capExplanation}
              </Text>
            </View>
          )}
        </View>

        <View style={tw`bg-white border border-slate-200 rounded-3xl p-6 shadow-sm mb-6`}>
          <View style={tw`flex-row items-center gap-2 mb-3`}>
            <Shield size={16} color={tw.color('indigo-500')} />
            <Text style={tw`text-sm font-bold text-slate-800 uppercase tracking-widest`}>Why this score?</Text>
          </View>
          <Text style={tw`text-slate-600 text-sm leading-5`}>
            {result.aiAnalysis.summary}
          </Text>
          <View style={tw`mt-4`}>
            {result.aiAnalysis.scoreStory?.slice(0, 3).map((line, idx) => (
              <View key={idx} style={tw`flex-row items-start gap-3 mb-3`}>
                <AlertTriangle size={16} color={tw.color('amber-500')} />
                <Text style={tw`text-xs text-slate-600 flex-1 leading-5`}>{line}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={tw`bg-slate-50 border border-slate-200 rounded-3xl p-5 mb-6`}>
          <View style={tw`flex-row items-center gap-2 mb-2`}>
            <AlertTriangle size={16} color={tw.color('slate-500')} />
            <Text style={tw`text-xs font-bold text-slate-500 uppercase tracking-wider`}>Crime Index</Text>
          </View>
          <Text style={tw`text-2xl font-black text-slate-900`}>{result.crimeData.crimeScore}/100</Text>
          <Text style={tw`text-xs text-slate-500 mt-1 mb-3`}>
            {result.crimeData.totalCrimes} incidents near this postcode point ({result.crimeData.monthDisplay})
          </Text>

          <TouchableOpacity onPress={() => setShowDetails(!showDetails)} style={tw`flex-row justify-between items-center border-t border-slate-200 pt-3 mt-2`}>
            <Text style={tw`text-xs font-bold text-indigo-600`}>Why this rating?</Text>
            <ChevronDown size={16} color={tw.color('indigo-600')} style={showDetails ? tw`transform rotate-180` : {}} />
          </TouchableOpacity>

          {showDetails && (
            <View style={tw`mt-3`}>
              <Text style={tw`font-bold text-slate-800 text-xs border-b border-slate-200 pb-1 mb-2`}>Main rating factors:</Text>
              {result.crimeData.scoreFactors?.map((factor, i) => (
                <View key={i} style={tw`mb-3`}>
                  <View style={tw`flex-row justify-between`}>
                    <Text style={tw`text-xs font-bold text-slate-700 flex-1 mr-2`}>{factor.label}</Text>
                    <Text style={tw`text-xs font-medium ${factor.impact === 'up' ? 'text-rose-500' : factor.impact === 'down' ? 'text-emerald-500' : 'text-slate-500'}`}>
                    {factor.impact === 'up' ? 'Raises' : factor.impact === 'down' ? 'Lowers' : 'Shapes'}
                    </Text>
                  </View>
                  <Text style={tw`text-xs text-slate-500 leading-5 mt-1`}>{factor.detail}</Text>
                </View>
              ))}
              <View style={tw`flex-row items-start gap-2 bg-white rounded-xl p-3 mt-1`}>
                <Info size={14} color={tw.color('slate-400')} />
                <Text style={tw`text-[11px] text-slate-500 flex-1`}>
                  Local score {result.crimeData.scoreBreakdown?.localScore ?? result.crimeData.crimeScore}, with a {result.crimeData.scoreBreakdown?.contextAdjustment ?? 0} point wider-area adjustment.
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={tw`mb-8 border-t border-slate-200 pt-8`}>
          <Text style={tw`text-xl font-black text-slate-900 mb-6`}>Identified Risk Signals</Text>
          <View style={tw`bg-white border border-slate-200 rounded-3xl p-6 shadow-sm`}>
            {result.crimeData.riskSignals?.map((signal, idx) => (
              <View key={idx} style={tw`flex-row items-start gap-3 mb-4`}>
                <AlertTriangle size={20} color={tw.color('amber-500')} />
                <Text style={tw`text-sm text-slate-700 font-medium flex-1 leading-5`}>{signal}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={tw`mb-8 border-t border-slate-200 pt-8`}>
          <Text style={tw`text-xl font-black text-slate-900 mb-2`}>Premium Intelligence</Text>
          <Text style={tw`text-xs text-slate-500 mb-6`}>Unlocked in this sandbox build.</Text>

          <View style={tw`bg-white border border-slate-200 rounded-3xl p-5 shadow-sm mb-5`}>
            <Text style={tw`text-sm font-black text-slate-900 mb-4`}>Crime trend</Text>
            <TrendChart trendData={result.trendData} />
          </View>

          <View style={tw`bg-white border border-slate-200 rounded-3xl p-5 shadow-sm mb-5`}>
            <Text style={tw`text-sm font-black text-slate-900 mb-4`}>Latest hotspot clusters</Text>
            <HotspotView hotspotData={result.hotspotData} />
          </View>
        </View>

        <View style={tw`mb-8 border-t border-slate-200 pt-8`}>
          <Text style={tw`text-xl font-black text-slate-900 mb-6`}>Area Context</Text>
          <View style={tw`bg-white border border-slate-200 rounded-3xl p-6 shadow-sm`}>
            <Text style={tw`text-sm text-slate-700 leading-6 mb-3`}>{result.aiAnalysis.areaContext}</Text>
            <Text style={tw`text-xs text-slate-500`}>
              Sandbox mode is surfacing the richer context directly so we can test how useful it feels before deciding what stays premium later.
            </Text>
          </View>
        </View>

        <View style={tw`mt-8 pt-8`}>
          <Text style={tw`font-bold text-slate-500 text-xs text-center mb-2 uppercase tracking-widest`}>This is an informational risk estimate.</Text>
          <Text style={tw`text-xs text-slate-400 text-center`}>DISCLAIMER: This report is generated programmatically. It is not official advice.</Text>
        </View>
      </ScrollView>
    </View>
  );
}
