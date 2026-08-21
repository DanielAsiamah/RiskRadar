import React from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { ArrowLeft, CheckCircle2, ExternalLink, Megaphone, ShieldCheck, XCircle } from 'lucide-react-native';
import tw from 'twrnc';

import { ADVERTISING_ENQUIRY_URL, ADVERTISING_POLICY } from '../content/advertising';
import { membershipColors, membershipStyles } from './membershipStyles';

export interface AdvertiseProps {
  onBack(): void;
}

export default function Advertise({ onBack }: AdvertiseProps) {
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
            <Megaphone size={26} color={membershipColors.amber} />
          </View>
          <Text style={tw`text-[10px] font-black tracking-widest text-amber-700 mb-3`}>RELEVANT REACH, INDEPENDENT EVIDENCE</Text>
          <Text accessibilityRole="header" style={tw`text-4xl font-black tracking-tight text-slate-950 leading-10 mb-4`}>Advertise without buying trust.</Text>
          <Text style={tw`text-base text-slate-500 leading-6 mb-8`}>{ADVERTISING_POLICY.introduction}</Text>

          <View style={[membershipStyles.card, membershipStyles.elevatedCard, tw`border-indigo-100 mb-6`]}>
            <Text style={tw`text-[10px] font-black tracking-widest text-indigo-600 mb-3`}>START AN ENQUIRY</Text>
            <Text style={tw`text-2xl font-black text-slate-950 mb-3`}>Tell us what a useful placement should achieve.</Text>
            <Text style={tw`text-sm text-slate-600 leading-6 mb-5`}>
              Include the details below. Every proposal is reviewed manually before price, creative, or payment is agreed.
            </Text>
            {ADVERTISING_POLICY.requiredBrief.map((item) => (
              <View key={item} style={tw`flex-row items-start mb-3`}>
                <CheckCircle2 size={17} color={membershipColors.emerald} style={tw`mt-0.5`} />
                <Text style={tw`flex-1 text-sm font-bold text-slate-700 leading-5 ml-3`}>{item}</Text>
              </View>
            ))}
            <Pressable
              onPress={() => void Linking.openURL(ADVERTISING_ENQUIRY_URL).catch(() => undefined)}
              accessibilityRole="link"
              accessibilityLabel="Email a RiskRadar advertising enquiry"
              focusable
              style={({ pressed }) => [membershipStyles.primaryButton, tw`mt-3`, pressed && tw`opacity-80`]}
            >
              <ExternalLink size={18} color="white" />
              <Text style={tw`text-white font-black ml-2`}>Email advertising enquiry</Text>
            </Pressable>
          </View>

          <Text style={tw`text-[10px] font-black tracking-widest text-slate-400 mb-3`}>PLACEMENT RULES</Text>
          {ADVERTISING_POLICY.rules.map((rule) => (
            <View key={rule.id} style={[membershipStyles.card, tw`mb-3`]}>
              <View style={tw`flex-row items-center mb-2`}>
                <ShieldCheck size={17} color={membershipColors.indigo} />
                <Text style={tw`text-base font-black text-slate-950 ml-2 flex-1`}>{rule.title}</Text>
              </View>
              <Text style={tw`text-sm text-slate-600 leading-6`}>{rule.detail}</Text>
            </View>
          ))}

          <View style={tw`rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5 mt-3 mb-5`}>
            <Text style={tw`text-lg font-black text-slate-950 mb-4`}>How approval works</Text>
            {ADVERTISING_POLICY.reviewProcess.map((step, index) => (
              <View key={step} style={tw`flex-row items-start mb-4`}>
                <View style={tw`w-7 h-7 rounded-full bg-indigo-600 items-center justify-center mr-3`}>
                  <Text style={tw`text-xs font-black text-white`}>{index + 1}</Text>
                </View>
                <Text style={tw`flex-1 text-sm text-slate-600 leading-5 mt-1`}>{step}</Text>
              </View>
            ))}
          </View>

          <View style={tw`rounded-3xl border border-rose-100 bg-rose-50 px-5 py-5`}>
            <View style={tw`flex-row items-center mb-4`}>
              <XCircle size={18} color={membershipColors.rose} />
              <Text style={tw`text-lg font-black text-rose-950 ml-2`}>Claims we will not run</Text>
            </View>
            {ADVERTISING_POLICY.prohibitedClaims.map((claim) => (
              <View key={claim} style={tw`flex-row items-start mb-3`}>
                <View style={tw`w-1.5 h-1.5 rounded-full bg-rose-500 mt-2 mr-3`} />
                <Text style={tw`flex-1 text-sm text-rose-800 leading-5`}>{claim}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
