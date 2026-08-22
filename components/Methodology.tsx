import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ArrowLeft, BarChart3, Radar, Scale, ShieldCheck } from 'lucide-react-native';
import tw from 'twrnc';

import { METHODOLOGY_LAST_UPDATED, METHODOLOGY_SECTIONS, type MethodologySection } from '../content/methodology';
import { membershipColors, membershipStyles } from './membershipStyles';

export interface MethodologyProps {
  onBack(): void;
}

export default function Methodology({ onBack }: MethodologyProps) {
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

          <View style={tw`w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 items-center justify-center mb-5`}>
            <Scale size={26} color={membershipColors.indigo} />
          </View>
          <Text style={tw`text-[10px] font-black tracking-widest text-indigo-600 mb-3`}>PUBLIC METHODOLOGY</Text>
          <Text accessibilityRole="header" style={tw`text-4xl font-black tracking-tight text-slate-950 leading-10 mb-4`}>
            How RiskRadar turns local evidence into a score.
          </Text>
          <Text style={tw`text-base text-slate-500 leading-6 mb-3`}>
            This page explains what the product is trying to measure, the main public inputs it uses, and how the current scoring logic is kept conservative.
          </Text>
          <Text style={tw`text-xs font-bold text-slate-400 mb-8`}>Last updated {METHODOLOGY_LAST_UPDATED}</Text>

          <View style={tw`rounded-3xl border border-indigo-100 bg-indigo-50 px-5 py-5 mb-6`}>
            <View style={tw`flex-row items-center mb-3`}>
              <ShieldCheck size={18} color={membershipColors.indigo} />
              <Text style={tw`text-sm font-black text-slate-950 ml-2`}>Core methodology promise</Text>
            </View>
            <Text style={tw`text-sm text-slate-600 leading-6`}>
              RiskRadar should explain a postcode from its nearby evidence first. City names, borough reputation, and dramatic wording should not outweigh the local dataset.
            </Text>
          </View>

          {METHODOLOGY_SECTIONS.map((section: MethodologySection) => (
            <View key={section.id} style={[membershipStyles.card, tw`mb-4`]}>
              <View style={tw`flex-row items-center mb-3`}>
                {section.id === 'score-shape' ? <BarChart3 size={16} color={membershipColors.indigo} /> : section.id === 'alerts' ? <Radar size={16} color={membershipColors.indigo} /> : <Scale size={16} color={membershipColors.indigo} />}
                <Text accessibilityRole="header" style={tw`text-lg font-black text-slate-950 ml-2 flex-1`}>{section.title}</Text>
              </View>
              {section.paragraphs.map((paragraph) => (
                <Text key={paragraph} selectable style={tw`text-sm text-slate-600 leading-6 mb-3`}>{paragraph}</Text>
              ))}
              {((section.bullets ?? []) as readonly string[]).map((item: string) => (
                <View key={item} style={tw`flex-row items-start mb-2`}>
                  <View style={tw`w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 mr-3`} />
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
