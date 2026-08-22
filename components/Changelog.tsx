import React from 'react';
import { ArrowLeft, GitCommitHorizontal, Sparkles } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import tw from 'twrnc';

import { CHANGELOG_ENTRIES } from '../content/changelog';
import { membershipColors, membershipStyles } from './membershipStyles';

export interface ChangelogProps {
  onBack(): void;
}

export default function Changelog({ onBack }: ChangelogProps) {
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

          <View style={tw`w-14 h-14 rounded-2xl bg-violet-50 border border-violet-100 items-center justify-center mb-5`}>
            <GitCommitHorizontal size={26} color={membershipColors.indigo} />
          </View>
          <Text style={tw`text-[10px] font-black tracking-widest text-violet-700 mb-3`}>PUBLIC CHANGELOG</Text>
          <Text accessibilityRole="header" style={tw`text-4xl font-black tracking-tight text-slate-950 leading-10 mb-4`}>
            Product changes you can actually track.
          </Text>
          <Text style={tw`text-base text-slate-500 leading-6 mb-8`}>
            A public log of meaningful RiskRadar changes, focused on features, trust changes, and product behaviour rather than vague “improvements”.
          </Text>

          {CHANGELOG_ENTRIES.map((entry) => (
            <View key={entry.id} style={[membershipStyles.card, membershipStyles.elevatedCard, tw`mb-4`]}>
              <View style={tw`flex-row items-center justify-between mb-3`}>
                <Text style={tw`text-[10px] font-black tracking-widest text-violet-600`}>{entry.date}</Text>
                <Sparkles size={15} color={membershipColors.indigo} />
              </View>
              <Text accessibilityRole="header" style={tw`text-xl font-black text-slate-950 mb-2`}>{entry.title}</Text>
              <Text style={tw`text-sm text-slate-600 leading-6 mb-4`}>{entry.summary}</Text>
              {entry.bullets.map((item) => (
                <View key={item} style={tw`flex-row items-start mb-2`}>
                  <View style={tw`w-1.5 h-1.5 rounded-full bg-violet-500 mt-2 mr-3`} />
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
