import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { ArrowLeft, ChevronDown, ChevronUp, Mail, Megaphone, ShieldCheck } from 'lucide-react-native';
import tw from 'twrnc';

import { FAQ_ITEMS, type FaqCategory } from '../content/faq';
import { SUPPORT_EMAIL } from '../content/advertising';
import { membershipColors, membershipStyles } from './membershipStyles';
import type { TrustNavigation } from './SiteFooter';

const GROUPS: readonly { category: FaqCategory; label: string }[] = [
  { category: 'scores-and-data', label: 'SCORES AND PUBLIC DATA' },
  { category: 'premium-and-billing', label: 'PREMIUM AND BILLING' },
  { category: 'privacy-and-safety', label: 'PRIVACY AND SAFETY' },
  { category: 'business-and-support', label: 'BUSINESS AND SUPPORT' },
];

export interface FaqProps extends TrustNavigation {
  onBack(): void;
}

export default function Faq({ onBack, onOpenPrivacy, onOpenAdvertise }: FaqProps) {
  const [expandedId, setExpandedId] = useState<string | null>('score-method');
  const [focusedId, setFocusedId] = useState<string | null>(null);

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
            <ShieldCheck size={26} color={membershipColors.indigo} />
          </View>
          <Text style={tw`text-[10px] font-black tracking-widest text-indigo-600 mb-3`}>CLEAR ANSWERS, NO HIDDEN CLAIMS</Text>
          <Text accessibilityRole="header" style={tw`text-4xl font-black tracking-tight text-slate-950 leading-10 mb-4`}>Frequently asked questions</Text>
          <Text style={tw`text-base text-slate-500 leading-6 mb-9`}>
            How RiskRadar scores an area, what the public evidence can prove, and what Premium does and does not provide.
          </Text>

          {GROUPS.map((group) => (
            <View key={group.category} style={tw`mb-7`}>
              <Text style={tw`text-[10px] font-black tracking-widest text-slate-400 mb-3`}>{group.label}</Text>
              {FAQ_ITEMS.filter((item) => item.category === group.category).map((item) => {
                const expanded = expandedId === item.id;
                const focused = focusedId === item.id;
                return (
                  <View key={item.id} style={[tw`rounded-3xl border bg-white mb-3 overflow-hidden`, { borderColor: focused ? '#818cf8' : '#e2e8f0' }]}>
                    <Pressable
                      onPress={() => setExpandedId(expanded ? null : item.id)}
                      onFocus={() => setFocusedId(item.id)}
                      onBlur={() => setFocusedId(null)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                      accessibilityLabel={`${item.question}. ${expanded ? 'Collapse answer' : 'Expand answer'}`}
                      focusable
                      style={({ pressed }) => [tw`min-h-18 px-5 py-5 flex-row items-center`, pressed && tw`bg-slate-50`]}
                    >
                      <Text style={tw`flex-1 text-sm font-black text-slate-950 leading-5 pr-4`}>{item.question}</Text>
                      <View style={tw`w-8 h-8 rounded-full bg-indigo-50 items-center justify-center`}>
                        {expanded
                          ? <ChevronUp size={16} color={membershipColors.indigo} />
                          : <ChevronDown size={16} color={membershipColors.indigo} />}
                      </View>
                    </Pressable>
                    {expanded ? (
                      <View style={tw`border-t border-slate-100 bg-slate-50 px-5 py-5`}>
                        <Text selectable style={tw`text-sm text-slate-600 leading-6`}>{item.answer}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))}

          <View style={[membershipStyles.card, tw`bg-indigo-50 border-indigo-100 mb-4`]}>
            <Text style={tw`text-lg font-black text-slate-950 mb-2`}>Still need a human answer?</Text>
            <Text style={tw`text-sm text-slate-600 leading-6 mb-5`}>
              Email account, billing, evidence, or privacy questions. Never send passwords or full payment-card details.
            </Text>
            <Pressable
              onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=RiskRadar%20support`).catch(() => undefined)}
              accessibilityRole="link"
              focusable
              style={({ pressed }) => [membershipStyles.primaryButton, pressed && tw`opacity-80`]}
            >
              <Mail size={18} color="white" />
              <Text style={tw`text-white font-black ml-2`}>Email {SUPPORT_EMAIL}</Text>
            </Pressable>
          </View>

          <View style={tw`flex-row gap-3`}>
            <Pressable onPress={onOpenPrivacy} accessibilityRole="link" style={({ pressed }) => [membershipStyles.secondaryButton, tw`flex-1`, pressed && tw`bg-slate-50`]}>
              <ShieldCheck size={16} color={membershipColors.slate} />
              <Text style={tw`text-xs font-black text-slate-700 ml-2`}>Privacy</Text>
            </Pressable>
            <Pressable onPress={onOpenAdvertise} accessibilityRole="link" style={({ pressed }) => [membershipStyles.secondaryButton, tw`flex-1`, pressed && tw`bg-slate-50`]}>
              <Megaphone size={16} color={membershipColors.slate} />
              <Text style={tw`text-xs font-black text-slate-700 ml-2`}>Advertise</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
