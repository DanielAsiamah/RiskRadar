import React from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { ArrowLeft, Database, Mail, MapPin, ShieldCheck } from 'lucide-react-native';
import tw from 'twrnc';

import { SUPPORT_EMAIL } from '../content/advertising';
import { PRIVACY_LAST_UPDATED, PRIVACY_SECTIONS } from '../content/privacy';
import { membershipColors, membershipStyles } from './membershipStyles';

export interface PrivacyProps {
  onBack(): void;
}

export default function Privacy({ onBack }: PrivacyProps) {
  const deletionUrl = `mailto:${SUPPORT_EMAIL}?subject=RiskRadar%20account%20deletion%20request`;

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
            <ShieldCheck size={26} color={membershipColors.emerald} />
          </View>
          <Text style={tw`text-[10px] font-black tracking-widest text-emerald-700 mb-3`}>PRIVACY EXPLAINED PLAINLY</Text>
          <Text accessibilityRole="header" style={tw`text-4xl font-black tracking-tight text-slate-950 leading-10 mb-4`}>Your searches are not a tracking product.</Text>
          <Text style={tw`text-base text-slate-500 leading-6 mb-3`}>
            This page explains what RiskRadar needs for searches, accounts, subscriptions, and saved-area intelligence.
          </Text>
          <Text style={tw`text-xs font-bold text-slate-400 mb-8`}>Last updated {PRIVACY_LAST_UPDATED}</Text>

          <View style={tw`rounded-3xl border border-indigo-100 bg-indigo-50 px-5 py-5 mb-6`}>
            <View style={tw`flex-row items-center mb-3`}>
              <MapPin size={18} color={membershipColors.indigo} />
              <Text style={tw`text-sm font-black text-slate-950 ml-2`}>Website location promise</Text>
            </View>
            <Text style={tw`text-sm text-slate-600 leading-6`}>
              Use my current location is a permission-based lookup. The website does not claim continuous background GPS monitoring.
            </Text>
          </View>

          {PRIVACY_SECTIONS.map((section) => (
            <View key={section.id} style={[membershipStyles.card, tw`mb-4`]}>
              <View style={tw`flex-row items-center mb-3`}>
                <Database size={16} color={membershipColors.indigo} />
                <Text accessibilityRole="header" style={tw`text-lg font-black text-slate-950 ml-2 flex-1`}>{section.title}</Text>
              </View>
              {section.paragraphs.map((paragraph) => (
                <Text key={paragraph} selectable style={tw`text-sm text-slate-600 leading-6 mb-3`}>{paragraph}</Text>
              ))}
              {('bullets' in section ? section.bullets : []).map((item) => (
                <View key={item} style={tw`flex-row items-start mb-2`}>
                  <View style={tw`w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 mr-3`} />
                  <Text style={tw`flex-1 text-sm text-slate-600 leading-5`}>{item}</Text>
                </View>
              ))}
            </View>
          ))}

          <View style={[membershipStyles.card, tw`bg-slate-50`]}>
            <Text style={tw`text-lg font-black text-slate-950 mb-2`}>Request account deletion</Text>
            <Text style={tw`text-sm text-slate-600 leading-6 mb-5`}>
              Email from the address on your RiskRadar account. If Premium is active, also use the billing portal to stop renewal.
            </Text>
            <Pressable
              onPress={() => void Linking.openURL(deletionUrl).catch(() => undefined)}
              accessibilityRole="link"
              focusable
              style={({ pressed }) => [membershipStyles.primaryButton, pressed && tw`opacity-80`]}
            >
              <Mail size={18} color="white" />
              <Text style={tw`text-white font-black ml-2`}>Start deletion request</Text>
            </Pressable>
            <Text selectable style={tw`text-xs font-bold text-slate-500 text-center mt-3`}>{SUPPORT_EMAIL}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
