import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  LogOut,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react-native';
import tw from 'twrnc';

import { accountViewState } from '../membership/client-state.mjs';
import type { AccountEntitlement } from '../membership/types';
import MembershipUnavailable from './MembershipUnavailable';
import { membershipColors, membershipStyles } from './membershipStyles';

export interface AccountProps {
  account: AccountEntitlement | null;
  loading: boolean;
  confirming: boolean;
  error: string | null;
  onBack(): void;
  onRefresh(): Promise<void>;
  onManageBilling(): Promise<void>;
  onRestoreMembership(): void;
  onSignOut(): Promise<void>;
}

export default function Account({
  account,
  loading,
  confirming,
  error,
  onBack,
  onRefresh,
  onManageBilling,
  onRestoreMembership,
  onSignOut,
}: AccountProps) {
  const viewState = accountViewState(account, loading, confirming);
  if (viewState === 'unavailable') {
    return <MembershipUnavailable onBack={onBack} onRetry={onRefresh} onSignOut={onSignOut} />;
  }

  const periodEnd = account?.currentPeriodEnd
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(account.currentPeriodEnd))
    : null;
  const presentation = getAccountPresentation(account, confirming, periodEnd);

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
            <Text style={tw`text-sm font-black text-slate-700 ml-2`}>Back to RiskRadar</Text>
          </Pressable>

          <Text style={tw`text-[10px] font-black tracking-widest text-indigo-600 mb-3`}>YOUR ACCOUNT</Text>
          <Text style={tw`text-4xl font-black tracking-tight text-slate-950 mb-3`}>Membership</Text>
          <Text selectable style={tw`text-sm text-slate-500 mb-8`}>{account?.email || 'Secure RiskRadar account'}</Text>

          {viewState === 'loading' ? (
            <View style={[membershipStyles.card, tw`items-center py-12`]}>
              <ActivityIndicator size="large" color={membershipColors.indigo} />
              <Text style={tw`text-base font-black text-slate-900 mt-5`}>Checking your membership</Text>
              <Text style={tw`text-xs text-slate-500 mt-2`}>Verifying account status with RiskRadar.</Text>
            </View>
          ) : (
            <>
              <View style={[membershipStyles.card, membershipStyles.elevatedCard, { borderColor: presentation.borderColor }]}>
                <View style={[tw`w-14 h-14 rounded-2xl items-center justify-center mb-6`, { backgroundColor: presentation.iconBackground }]}>
                  {presentation.icon}
                </View>
                <Text style={[tw`text-[10px] font-black tracking-widest mb-2`, { color: presentation.accentColor }]}>{presentation.kicker}</Text>
                <Text style={tw`text-3xl font-black tracking-tight text-slate-950 mb-3`}>{presentation.title}</Text>
                <Text style={tw`text-sm text-slate-500 leading-6 mb-6`}>{presentation.detail}</Text>

                {periodEnd && account?.premium ? (
                  <View style={tw`flex-row items-center rounded-2xl bg-slate-50 px-4 py-3 mb-5`}>
                    <CalendarClock size={17} color={membershipColors.slate} />
                    <Text style={tw`text-xs font-bold text-slate-600 ml-2`}>
                      {account.cancelAtPeriodEnd ? `Premium access until ${periodEnd}` : `Current billing period ends ${periodEnd}`}
                    </Text>
                  </View>
                ) : null}

                {error ? (
                  <View style={tw`rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 mb-5`}>
                    <Text selectable style={tw`text-sm font-bold text-rose-700 leading-5`}>{error}</Text>
                  </View>
                ) : null}

                {confirming ? (
                  <Pressable onPress={() => void onRefresh()} style={({ pressed }) => [membershipStyles.primaryButton, pressed && tw`opacity-80`]}>
                    <RefreshCw size={18} color="white" />
                    <Text style={tw`text-white font-black ml-2`}>Check activation again</Text>
                  </Pressable>
                ) : null}

                {!confirming && account?.canManageBilling ? (
                  <Pressable onPress={() => void onManageBilling()} style={({ pressed }) => [membershipStyles.primaryButton, pressed && tw`opacity-80`]}>
                    <CreditCard size={18} color="white" />
                    <Text style={tw`text-white font-black ml-2`}>Manage billing</Text>
                  </Pressable>
                ) : null}

                {!confirming && account && !account.premium ? (
                  <Pressable onPress={onRestoreMembership} style={({ pressed }) => [membershipStyles.primaryButton, pressed && tw`opacity-80`]}>
                    <Sparkles size={18} color="white" />
                    <Text style={tw`text-white font-black ml-2`}>Restore membership</Text>
                  </Pressable>
                ) : null}

                {!confirming && !account?.canManageBilling ? (
                  <Pressable onPress={() => void onRefresh()} hitSlop={8} style={tw`items-center pt-5`}>
                    <Text style={tw`text-sm font-black text-indigo-600`}>Refresh status</Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={tw`rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5 mt-5`}>
                <Text style={tw`text-xs font-black text-slate-900 mb-2`}>How access is decided</Text>
                <Text style={tw`text-xs text-slate-500 leading-5`}>
                  Premium is unlocked only after RiskRadar verifies your Stripe subscription on the backend. This device cannot switch Premium on by itself.
                </Text>
              </View>
            </>
          )}

          <Pressable
            onPress={() => void onSignOut()}
            accessibilityRole="button"
            style={({ pressed }) => [membershipStyles.secondaryButton, tw`mt-5`, pressed && tw`bg-slate-50`]}
          >
            <LogOut size={17} color={membershipColors.slate} />
            <Text style={tw`text-sm font-black text-slate-700 ml-2`}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function getAccountPresentation(account: AccountEntitlement | null, confirming: boolean, periodEnd: string | null) {
  if (confirming) {
    return {
      kicker: 'CHECKOUT COMPLETE',
      title: 'Confirming your Premium access',
      detail: 'Stripe has returned you to RiskRadar. We are waiting for the verified billing update, which can take a few moments.',
      accentColor: membershipColors.indigo,
      borderColor: '#c7d2fe',
      iconBackground: membershipColors.indigoSoft,
      icon: <RefreshCw size={26} color={membershipColors.indigo} />,
    };
  }

  switch (account?.status) {
    case 'active':
    case 'trialing':
      return {
        kicker: 'PREMIUM ACTIVE',
        title: 'Your membership is active',
        detail: 'Unlimited searches and your Premium intelligence tools are available on this account.',
        accentColor: membershipColors.emerald,
        borderColor: '#a7f3d0',
        iconBackground: '#ecfdf5',
        icon: <CheckCircle2 size={27} color={membershipColors.emerald} />,
      };
    case 'canceling':
      return {
        kicker: 'CANCELLATION SCHEDULED',
        title: periodEnd ? `Premium until ${periodEnd}` : 'Premium remains active',
        detail: 'Your subscription will not renew, but Premium remains available through the paid billing period.',
        accentColor: membershipColors.amber,
        borderColor: '#fde68a',
        iconBackground: '#fffbeb',
        icon: <CalendarClock size={27} color={membershipColors.amber} />,
      };
    case 'past_due':
      return {
        kicker: 'PAYMENT ISSUE',
        title: 'Your membership needs attention',
        detail: 'Stripe could not confirm the latest payment. Open billing to update your payment method, then refresh access.',
        accentColor: membershipColors.rose,
        borderColor: '#fecdd3',
        iconBackground: '#fff1f2',
        icon: <ShieldAlert size={27} color={membershipColors.rose} />,
      };
    case 'expired':
      return {
        kicker: 'MEMBERSHIP EXPIRED',
        title: 'Premium is no longer active',
        detail: 'Your account and free search access remain available. Restore Premium whenever you are ready.',
        accentColor: membershipColors.slate,
        borderColor: membershipColors.border,
        iconBackground: '#f1f5f9',
        icon: <ShieldAlert size={27} color={membershipColors.slate} />,
      };
    default:
      return {
        kicker: 'FREE ACCOUNT',
        title: 'You are using RiskRadar Free',
        detail: 'Your free account includes three successful postcode searches per calendar day. Premium adds ongoing area monitoring and deeper tools.',
        accentColor: membershipColors.indigo,
        borderColor: membershipColors.border,
        iconBackground: membershipColors.indigoSoft,
        icon: <ShieldCheck size={27} color={membershipColors.indigo} />,
      };
  }
}
