import React from 'react';
import { ArrowLeft, Compass, Database, ShieldCheck } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import tw from 'twrnc';

import { ABOUT_SECTIONS } from '../content/about';
import { membershipColors, membershipStyles } from './membershipStyles';

export interface AboutProps {
  onBack(): void;
}

export default function About({ onBack }: AboutProps) {
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

          <View style={tw`w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 items-center justify-center mb-5`}>
            <Compass size={26} color={membershipColors.emerald} />
          </View>
          <Text style={tw`text-[10px] font-black tracking-widest text-emerald-700 mb-3`}>ABOUT RISKRADAR</Text>
          <Text accessibilityRole="header" style={tw`text-4xl font-black tracking-tight text-slate-950 leading-10 mb-4`}>
            Building a clearer way to read local area risk.
          </Text>
          <Text style={tw`text-base text-slate-500 leading-6 mb-8`}>
            RiskRadar is being shaped as a product for ordinary users, Premium members, and future business embeds without pretending public crime data is something it is not.
          </Text>

          <View style={tw`rounded-3xl border border-emerald-100 bg-emerald-50 px-5 py-5 mb-6`}>
            <View style={tw`flex-row items-center mb-3`}>
              <ShieldCheck size={18} color={membershipColors.emerald} />
              <Text style={tw`text-sm font-black text-slate-950 ml-2`}>Trust-building stance</Text>
            </View>
            <Text style={tw`text-sm text-slate-600 leading-6`}>
              RiskRadar should earn trust through methodology, changelog visibility, and clear limitations instead of hype, fear marketing, or fake precision.
            </Text>
          </View>

          {ABOUT_SECTIONS.map((section) => (
            <View key={section.id} style={[membershipStyles.card, tw`mb-4`]}>
              <View style={tw`flex-row items-center mb-3`}>
                {section.id === 'open-data' ? <Database size={16} color={membershipColors.emerald} /> : <Compass size={16} color={membershipColors.emerald} />}
                <Text accessibilityRole="header" style={tw`text-lg font-black text-slate-950 ml-2 flex-1`}>{section.title}</Text>
              </View>
              {section.paragraphs.map((paragraph) => (
                <Text key={paragraph} selectable style={tw`text-sm text-slate-600 leading-6 mb-3`}>{paragraph}</Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
