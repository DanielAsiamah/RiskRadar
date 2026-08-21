import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Mail, ShieldCheck } from 'lucide-react-native';
import tw from 'twrnc';

import { SUPPORT_EMAIL } from '../content/advertising';
import { membershipColors } from './membershipStyles';

export interface TrustNavigation {
  onOpenFaq(): void;
  onOpenPrivacy(): void;
  onOpenAdvertise(): void;
}

export interface SiteFooterProps extends TrustNavigation {}

const SUPPORT_URL = `mailto:${SUPPORT_EMAIL}?subject=RiskRadar%20support`;

function openSupport() {
  void Linking.openURL(SUPPORT_URL).catch(() => undefined);
}

export default function SiteFooter({ onOpenFaq, onOpenPrivacy, onOpenAdvertise }: SiteFooterProps) {
  return (
    <View style={tw`mt-10 pt-7 border-t border-slate-200`} accessibilityLabel="RiskRadar information links">
      <View style={tw`flex-row items-center mb-4`}>
        <View style={tw`w-9 h-9 rounded-xl bg-indigo-50 items-center justify-center mr-3`}>
          <ShieldCheck size={17} color={membershipColors.indigo} />
        </View>
        <View style={tw`flex-1`}>
          <Text style={tw`text-sm font-black text-slate-950`}>RiskRadar</Text>
          <Text style={tw`text-[10px] font-bold tracking-widest text-slate-400`}>INDEPENDENT AREA INTELLIGENCE</Text>
        </View>
      </View>

      <View style={tw`flex-row flex-wrap items-center mb-4`}>
        <FooterLink label="FAQ" onPress={onOpenFaq} />
        <FooterLink label="Privacy" onPress={onOpenPrivacy} />
        <FooterLink label="Advertise" onPress={onOpenAdvertise} />
        <Pressable
          onPress={openSupport}
          accessibilityRole="link"
          accessibilityLabel={`Email RiskRadar support at ${SUPPORT_EMAIL}`}
          focusable
          style={({ pressed }) => [tw`flex-row items-center rounded-full border border-slate-200 bg-white px-4 py-2 mr-2 mb-2`, pressed && tw`bg-slate-50`]}
        >
          <Mail size={13} color={membershipColors.slate} />
          <Text style={tw`text-xs font-black text-slate-700 ml-2`}>Support</Text>
        </Pressable>
      </View>

      <Text style={tw`text-[11px] text-slate-400 leading-5`}>
        Informational estimates from delayed, anonymised public data. RiskRadar cannot guarantee personal safety and is not an emergency service.
      </Text>
    </View>
  );
}

function FooterLink({ label, onPress }: { label: string; onPress(): void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`Open ${label}`}
      focusable
      style={({ pressed }) => [tw`rounded-full border border-slate-200 bg-white px-4 py-2 mr-2 mb-2`, pressed && tw`bg-indigo-50`]}
    >
      <Text style={tw`text-xs font-black text-slate-700`}>{label}</Text>
    </Pressable>
  );
}
