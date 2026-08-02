import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import tw from 'twrnc';

const CONTACT_EMAIL = 'supr3ltd@gmail.com';

const proFeatures = [
  'Unlimited UK area checks for trips, holidays, dates, work visits, and Facebook Marketplace meetups.',
  'Safety Sessions with a trusted-contact share link and check-in status.',
  'Saved places, comparisons, and longer trend context when data is available.',
  'Simple support and cancellation route through the RiskRadar contact email.',
];

const faqs = [
  {
    question: 'Where does the data come from?',
    answer: 'RiskRadar uses public UK crime and postcode sources. It is area intelligence, not a guarantee that a place or person is safe.',
  },
  {
    question: 'What happens if I miss a check-in?',
    answer: 'Safety Sessions record a pending alert state and share your plan/status. Email/SMS sending is not active until a provider is configured.',
  },
  {
    question: 'Does RiskRadar call emergency services?',
    answer: 'No. If there is immediate danger, call 999 yourself. RiskRadar does not contact police, ambulance, or emergency contacts automatically in this version.',
  },
  {
    question: 'What can my trusted contact see?',
    answer: 'They can see the destination, purpose, notes you choose to share, expected end time, and check-in status. Your trusted email is not shown on the public share view.',
  },
  {
    question: 'How do I cancel or get support?',
    answer: `Contact ${CONTACT_EMAIL}. Billing portal integration is planned for the live subscription setup.`,
  },
];

interface PaywallProps {
  onBack: () => void;
  onOpenSafetySession: () => void;
}

export default function Paywall({ onBack, onOpenSafetySession }: PaywallProps) {
  return (
    <ScrollView style={tw`flex-1 bg-white`} contentContainerStyle={tw`px-5 pt-8 pb-12`}>
      <View style={tw`w-full max-w-md self-center`}>
        <Text style={tw`text-[10px] font-bold tracking-widest text-indigo-500 mb-3`}>RISKRADAR PRO</Text>
        <Text style={tw`text-4xl font-black tracking-tight text-slate-950 mb-3`}>More confidence before you arrive.</Text>
        <Text style={tw`text-base text-slate-500 leading-6 mb-6`}>
          PRO is built for real-life checks on the way to places: holidays, new areas, dates, work visits, and meeting strangers for marketplace deals.
        </Text>

        <View style={tw`rounded-3xl bg-slate-950 p-5 mb-5`}>
          <Text style={tw`text-white text-lg font-black mb-1`}>£15/month</Text>
          <Text style={tw`text-slate-300 leading-6`}>
            Unlimited checks plus Safety Sessions and shareable plans for trusted contacts.
          </Text>
        </View>

        <View style={tw`rounded-3xl border border-indigo-100 bg-indigo-50 p-5 mb-5`}>
          <Text style={tw`text-[10px] font-bold tracking-widest text-indigo-500 mb-3`}>WHAT PRO UNLOCKS</Text>
          {proFeatures.map((feature) => (
            <Text key={feature} style={tw`text-sm font-semibold text-slate-700 leading-6 mb-2`}>• {feature}</Text>
          ))}
        </View>

        <Pressable
          onPress={onOpenSafetySession}
          accessibilityRole="button"
          style={({ pressed }) => [tw`h-16 rounded-2xl bg-indigo-600 items-center justify-center mb-3`, pressed && tw`opacity-80`]}
        >
          <Text style={tw`text-white text-lg font-black`}>Start PRO setup</Text>
        </Pressable>

        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          style={({ pressed }) => [tw`h-14 rounded-2xl border border-slate-200 items-center justify-center mb-8`, pressed && tw`bg-slate-50`]}
        >
          <Text style={tw`text-slate-700 font-black`}>Back to search</Text>
        </Pressable>

        <Text style={tw`text-[10px] font-bold tracking-widest text-slate-400 mb-3`}>FAQ</Text>
        {faqs.map((item) => (
          <View key={item.question} style={tw`rounded-2xl border border-slate-200 bg-white p-4 mb-3`}>
            <Text style={tw`text-slate-950 font-black mb-2`}>{item.question}</Text>
            <Text style={tw`text-slate-500 leading-6`}>{item.answer}</Text>
          </View>
        ))}

        <Text selectable style={tw`text-center text-slate-500 mt-4`}>
          Contact: {CONTACT_EMAIL}
        </Text>
      </View>
    </ScrollView>
  );
}
