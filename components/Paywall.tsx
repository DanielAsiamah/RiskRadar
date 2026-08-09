import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronRight, Navigation, ShieldCheck } from 'lucide-react-native';
import tw from 'twrnc';

import { membershipColors } from './membershipStyles';

interface PaywallProps {
  onOpenRouteGuard(): void;
}

export default function Paywall({ onOpenRouteGuard }: PaywallProps) {
  return (
    <Pressable
      onPress={onOpenRouteGuard}
      accessibilityRole="button"
      accessibilityLabel="Preview Route Guard"
      style={({ pressed }) => [
        tw`rounded-3xl border border-indigo-100 bg-indigo-50 px-5 py-5 mb-5`,
        pressed && tw`opacity-75`,
      ]}
    >
      <View style={tw`flex-row items-center mb-3`}>
        <View style={tw`w-11 h-11 rounded-2xl bg-white items-center justify-center mr-3`}>
          <Navigation size={21} color={membershipColors.indigo} />
        </View>
        <View style={tw`flex-1`}>
          <View style={tw`flex-row items-center`}>
            <Text style={tw`text-base font-black text-slate-950`}>Route Guard</Text>
            <View style={tw`ml-2 rounded-full bg-indigo-600 px-2 py-1`}>
              <Text style={tw`text-[9px] font-black tracking-widest text-white`}>PRO</Text>
            </View>
          </View>
          <Text style={tw`text-xs text-slate-500 mt-1`}>100 route scans included each month</Text>
        </View>
        <ChevronRight size={19} color={membershipColors.indigo} />
      </View>
      <View style={tw`flex-row items-start`}>
        <ShieldCheck size={16} color={membershipColors.emerald} />
        <Text style={tw`flex-1 text-xs text-slate-600 leading-5 ml-2`}>
          Plan a walking, driving, or transit journey and identify mock hotzone sections before you set off.
        </Text>
      </View>
    </Pressable>
  );
}
