import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { ArrowLeft, Check, CreditCard, Radar, ShieldCheck, Sparkles } from 'lucide-react-native';
import tw from 'twrnc';

import { membershipColors, membershipStyles } from './membershipStyles';
import Paywall from './Paywall';
import SiteFooter, { type TrustNavigation } from './SiteFooter';

const BENEFITS = [
  ['Unlimited postcode searches', 'Explore on the go, subject to fair-use protection.'],
  ['Watch up to ten places', 'Keep Home, Work, Family, or University together.'],
  ['Monthly safety briefings', 'See when a newly published Police.uk month changes the picture.'],
  ['Twelve-month trend intelligence', 'Track totals, categories, and a clear What changed? view.'],
  ['Compare up to five areas', 'Review postcode-level evidence side by side.'],
  ['Richer evidence and reports', 'Explore hotspots and approximate roads, download dated reports, and remove sponsor placements.'],
] as const;

export interface PricingProps {
  authenticated: boolean;
  membershipAvailable: boolean;
  busy: boolean;
  error: string | null;
  onBack(): void;
  onCheckout(): Promise<void>;
  onOpenRouteGuard(): void;
  onOpenLiveRadar(): void;
  onOpenSafetySession(): void;
  trustNavigation: TrustNavigation;
}

export default function Pricing({ authenticated, membershipAvailable, busy, error, onBack, onCheckout, onOpenRouteGuard, onOpenLiveRadar, onOpenSafetySession, trustNavigation }: PricingProps) {
  return (
    <View style={membershipStyles.screen}>
      <ScrollView contentContainerStyle={membershipStyles.scrollContent} contentInsetAdjustmentBehavior="automatic">
        <View style={membershipStyles.content}>
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            style={({ pressed }) => [tw`self-start flex-row items-center px-4 py-3 rounded-full bg-slate-100 mb-8`, pressed && tw`opacity-70`]}
          >
            <ArrowLeft size={17} color={membershipColors.slate} />
            <Text style={tw`text-sm font-black text-slate-700 ml-2`}>Back</Text>
          </Pressable>

          <View style={tw`flex-row items-center mb-4`}>
            <View style={tw`w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 items-center justify-center mr-3`}>
              <Sparkles size={23} color={membershipColors.indigo} />
            </View>
            <View>
              <Text style={tw`text-[10px] font-black tracking-widest text-indigo-600`}>SAFETY MEMBERSHIP</Text>
              <Text style={tw`text-lg font-black text-slate-950`}>RiskRadar Premium</Text>
            </View>
          </View>

          <Text style={tw`text-4xl font-black tracking-tight text-slate-950 leading-10 mb-4`}>
            Keep watch on the places that matter.
          </Text>
          <Text style={tw`text-base text-slate-500 leading-6 mb-8`}>
            Premium turns one-off postcode checks into a personal monthly view of local change and official evidence.
          </Text>

          <Paywall onOpenRouteGuard={onOpenRouteGuard} onOpenSafetySession={onOpenSafetySession} />

          <Pressable
            onPress={onOpenLiveRadar}
            style={({ pressed }) => [membershipStyles.secondaryButton, tw`mb-5`, pressed && tw`bg-slate-50`]}
            accessibilityRole="button"
          >
            <Radar size={17} color={membershipColors.indigo} />
            <Text style={tw`text-sm font-black text-indigo-700 ml-2`}>Preview Live Radar</Text>
          </Pressable>

          <View style={[membershipStyles.card, membershipStyles.elevatedCard, tw`border-indigo-100 mb-5`]}>
            <View style={tw`flex-row items-end mb-2`}>
              <Text style={tw`text-5xl font-black tracking-tight text-slate-950`}>£15</Text>
              <Text style={tw`text-sm font-bold text-slate-500 mb-2 ml-2`}>GBP / month</Text>
            </View>
            <Text style={tw`text-xs font-bold text-emerald-700 mb-7`}>Cancel any time. Your paid access continues to the end of the billing period.</Text>

            {BENEFITS.map(([title, detail]) => (
              <View key={title} style={tw`flex-row items-start mb-5`}>
                <View style={tw`w-7 h-7 rounded-full bg-indigo-50 items-center justify-center mt-0.5 mr-3`}>
                  <Check size={15} color={membershipColors.indigo} strokeWidth={3} />
                </View>
                <View style={tw`flex-1`}>
                  <Text style={tw`text-sm font-black text-slate-900 mb-1`}>{title}</Text>
                  <Text style={tw`text-xs text-slate-500 leading-5`}>{detail}</Text>
                </View>
              </View>
            ))}

            {error ? (
              <View style={tw`rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 mb-4`}>
                <Text selectable style={tw`text-sm font-bold text-rose-700 leading-5`}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={() => void onCheckout()}
              disabled={busy || !membershipAvailable}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || !membershipAvailable }}
              style={({ pressed }) => [membershipStyles.primaryButton, pressed && membershipAvailable && tw`opacity-80`, (busy || !membershipAvailable) && tw`opacity-60`]}
            >
              {busy ? <ActivityIndicator color="white" /> : authenticated ? <CreditCard size={19} color="white" /> : <ShieldCheck size={19} color="white" />}
              <Text style={tw`text-white font-black ml-2`}>
                {busy ? 'Opening secure checkout...' : !membershipAvailable ? 'Premium setup in progress' : authenticated ? 'Continue securely with Stripe' : 'Sign in to start Premium'}
              </Text>
            </Pressable>
            <Text style={tw`text-[11px] text-slate-400 text-center leading-4 mt-3`}>
              {membershipAvailable
                ? 'Stripe securely handles payment details. RiskRadar does not store your card number.'
                : 'Free postcode search remains available while secure accounts and automatic Premium activation are connected.'}
            </Text>
          </View>

          <View style={tw`rounded-3xl border border-amber-100 bg-amber-50 px-5 py-4`}>
            <Text style={tw`text-xs font-black text-amber-800 mb-1`}>Monthly intelligence, not emergency monitoring</Text>
            <Text style={tw`text-xs text-amber-700 leading-5`}>
              Police.uk records are anonymised and published by recorded month. RiskRadar does not provide live police alerts, exact incident addresses, or real-time personal tracking.
            </Text>
          </View>

          <SiteFooter {...trustNavigation} />
        </View>
      </ScrollView>
    </View>
  );
}
