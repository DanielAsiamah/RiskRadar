import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Download } from 'lucide-react-native';
import tw from 'twrnc';

import type { MemberReport } from '../api/reports';
import { membershipColors, membershipStyles } from './membershipStyles';

export default function PrintReport({ report }: { report: MemberReport }) {
  return (
    <View>
      <Pressable disabled accessibilityRole="button" style={[membershipStyles.secondaryButton, tw`opacity-70`]}>
        <Download size={18} color={membershipColors.slate} />
        <Text style={tw`text-sm font-black text-slate-700 ml-2`}>Print or save as PDF</Text>
      </Pressable>
      <Text style={tw`text-[11px] text-slate-500 text-center leading-5 mt-3`}>
        Report download for {report.postcode} is available on the RiskRadar website.
      </Text>
    </View>
  );
}
