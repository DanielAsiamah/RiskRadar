import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronRight, Navigation, ShieldCheck, Users } from 'lucide-react-native';
import tw from 'twrnc';

import { membershipColors } from './membershipStyles';

const CONTACT_EMAIL = 'supr3ltd@gmail.com';

const FAQS = [
  {
    question: 'Where does the data come from?',
    answer: 'RiskRadar uses public UK crime and postcode sources. It is area intelligence, not a guarantee that a place or person is safe.',
  },
  {
    question: 'What happens if I miss a Safety Session check-in?',
    answer: 'The session records a pending alert state and share status. Email, SMS, and emergency-service contact are not active in this version.',
  },
  {
    question: 'How do I cancel or get support?',
    answer: `Use the secure billing portal from your account or contact ${CONTACT_EMAIL}.`,
  },
] as const;

interface PaywallProps {
  onOpenRouteGuard(): void;
  onOpenSafetySession(): void;
}

export default function Paywall({ onOpenRouteGuard, onOpenSafetySession }: PaywallProps) {
  return (
    <View>
      <FeatureCard
        title="Route Guard"
        detail="Plan walking, driving, or transit journeys and scan mock hotzone sections. Includes 100 route scans each month."
        icon={<Navigation size={21} color={membershipColors.indigo} />}
        onPress={onOpenRouteGuard}
      />
      <FeatureCard
        title="Safety Sessions"
        detail="Create a trip plan, share it with a trusted contact, and record your check-in status."
        icon={<Users size={21} color={membershipColors.indigo} />}
        onPress={onOpenSafetySession}
      />

      <View style={tw`rounded-3xl border border-slate-200 bg-white px-5 py-5 mb-5`}>
        <View style={tw`flex-row items-center mb-4`}>
          <ShieldCheck size={18} color={membershipColors.emerald} />
          <Text style={tw`text-sm font-black text-slate-950 ml-2`}>PRO FAQ</Text>
        </View>
        {FAQS.map((item) => (
          <View key={item.question} style={tw`mb-4`}>
            <Text style={tw`text-xs font-black text-slate-900 mb-1`}>{item.question}</Text>
            <Text style={tw`text-xs text-slate-500 leading-5`}>{item.answer}</Text>
          </View>
        ))}
        <Text selectable style={tw`text-[11px] font-bold text-indigo-600`}>Support: {CONTACT_EMAIL}</Text>
      </View>
    </View>
  );
}

function FeatureCard({ title, detail, icon, onPress }: { title: string; detail: string; icon: React.ReactNode; onPress(): void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Preview ${title}`}
      style={({ pressed }) => [tw`rounded-3xl border border-indigo-100 bg-indigo-50 px-5 py-5 mb-3`, pressed && tw`opacity-75`]}
    >
      <View style={tw`flex-row items-center`}>
        <View style={tw`w-11 h-11 rounded-2xl bg-white items-center justify-center mr-3`}>{icon}</View>
        <View style={tw`flex-1`}>
          <View style={tw`flex-row items-center`}>
            <Text style={tw`text-base font-black text-slate-950`}>{title}</Text>
            <View style={tw`ml-2 rounded-full bg-indigo-600 px-2 py-1`}>
              <Text style={tw`text-[9px] font-black tracking-widest text-white`}>PRO</Text>
            </View>
          </View>
          <Text style={tw`text-xs text-slate-500 leading-5 mt-1`}>{detail}</Text>
        </View>
        <ChevronRight size={19} color={membershipColors.indigo} />
      </View>
    </Pressable>
  );
}
