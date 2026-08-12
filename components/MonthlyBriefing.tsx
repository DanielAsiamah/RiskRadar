import React from 'react';
import { Text, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import tw from 'twrnc';

import type { DashboardBriefing } from '../membership/dashboard-types';
import { membershipColors, membershipStyles } from './membershipStyles';

export default function MonthlyBriefing({ briefing }: { briefing: DashboardBriefing }) {
  return (
    <View style={[membershipStyles.card, membershipStyles.elevatedCard, tw`mb-5 border-indigo-100 bg-indigo-50`]}>
      <View style={tw`flex-row items-center mb-4`}>
        <View style={tw`w-11 h-11 rounded-2xl bg-white items-center justify-center mr-3`}>
          <Sparkles size={20} color={membershipColors.indigo} />
        </View>
        <View style={tw`flex-1`}>
          <Text style={tw`text-[10px] font-black tracking-widest text-indigo-600 mb-1`}>MONTHLY BRIEFING</Text>
          <Text style={tw`text-2xl font-black tracking-tight text-slate-950`}>{briefing.headline}</Text>
        </View>
      </View>
      <Text style={tw`text-sm leading-6 text-slate-600`}>{briefing.detail}</Text>
    </View>
  );
}
