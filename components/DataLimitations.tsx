import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { AlertTriangle, ArrowLeft, Clock3, MapPinned } from 'lucide-react-native';
import tw from 'twrnc';

import { LIMITATIONS_LAST_UPDATED, LIMITATIONS_SECTIONS, type LimitationSection } from '../content/limitations';
import { membershipColors, membershipStyles } from './membershipStyles';

export interface DataLimitationsProps {
  onBack(): void;
}

export default function DataLimitations({ onBack }: DataLimitationsProps) {
  return (
    <View style={membershipStyles.screen}>
      <ScrollView contentContainerStyle={membershipStyles.scrollContent} contentInsetAdjustmentBehavior="automatic">
        <View style={membershipStyles.content}>
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back to previous RiskRadar screen"
            style={({ pressed }) => [tw`self-start flex-row items-center px-4 py-3 rounded-full bg-slate-100 mb-8`, pressed && tw`opacity-70`]}
          >
            <ArrowLeft size={17} color={membershipColors.slate} />
            <Text style={tw`text-sm font-black text-slate-700 ml-2`}>Back</Text>
          </Pressable>

          <View style={tw`w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 items-center justify-center mb-5`}>
            <AlertTriangle size={26} color={membershipColors.amber} />
          </View>
          <Text style={tw`text-[10px] font-black tracking-widest text-amber-700 mb-3`}>DATA LIMITATIONS</Text>
          <Text accessibilityRole="header" style={tw`text-4xl font-black tracking-tight text-slate-950 leading-10 mb-4`}>
            What the public dataset cannot prove.
          </Text>
          <Text style={tw`text-base text-slate-500 leading-6 mb-3`}>
            This page is here to keep RiskRadar useful without overstating what delayed, anonymised street-level public data can tell you.
          </Text>
          <Text style={tw`text-xs font-bold text-slate-400 mb-8`}>Last updated {LIMITATIONS_LAST_UPDATED}</Text>

          <View style={tw`rounded-3xl border border-amber-100 bg-amber-50 px-5 py-5 mb-6`}>
            <View style={tw`flex-row items-center mb-3`}>
              <Clock3 size={18} color={membershipColors.amber} />
              <Text style={tw`text-sm font-black text-slate-950 ml-2`}>Honest limitation promise</Text>
            </View>
            <Text style={tw`text-sm text-slate-600 leading-6`}>
              RiskRadar should never imply live policing, exact addresses, or guaranteed personal safety from this public feed.
            </Text>
          </View>

          {LIMITATIONS_SECTIONS.map((section: LimitationSection) => (
            <View key={section.id} style={[membershipStyles.card, tw`mb-4`]}>
              <View style={tw`flex-row items-center mb-3`}>
                {section.id === 'anonymised' ? <MapPinned size={16} color={membershipColors.amber} /> : <AlertTriangle size={16} color={membershipColors.amber} />}
                <Text accessibilityRole="header" style={tw`text-lg font-black text-slate-950 ml-2 flex-1`}>{section.title}</Text>
              </View>
              {section.paragraphs.map((paragraph) => (
                <Text key={paragraph} selectable style={tw`text-sm text-slate-600 leading-6 mb-3`}>{paragraph}</Text>
              ))}
              {((section.bullets ?? []) as readonly string[]).map((item: string) => (
                <View key={item} style={tw`flex-row items-start mb-2`}>
                  <View style={tw`w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 mr-3`} />
                  <Text style={tw`flex-1 text-sm text-slate-600 leading-5`}>{item}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
