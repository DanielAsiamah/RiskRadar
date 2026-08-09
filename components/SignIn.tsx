import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ArrowLeft, CheckCircle2, LockKeyhole, Mail, ShieldCheck } from 'lucide-react-native';
import tw from 'twrnc';

import { isValidEmailAddress, visibleMagicLinkError } from '../membership/client-state.mjs';
import { membershipColors, membershipStyles } from './membershipStyles';

export interface SignInProps {
  onSubmit(email: string): Promise<void>;
  onBack(): void;
  onContinueFree(): void;
}

export default function SignIn({ onSubmit, onBack, onContinueFree }: SignInProps) {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentStateError = visibleMagicLinkError(sentTo, error);

  const sendLink = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmailAddress(normalizedEmail)) {
      setError('Enter a complete email address, such as name@example.com.');
      return;
    }

    try {
      setBusy(true);
      setError(null);
      await onSubmit(normalizedEmail);
      setSentTo(normalizedEmail);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'RiskRadar could not send the sign-in link.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={membershipStyles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={membershipStyles.scrollContent}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={membershipStyles.content}>
          <BackButton onPress={onBack} />

          <View style={tw`w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 items-center justify-center mb-7`}>
            <ShieldCheck size={27} color={membershipColors.indigo} />
          </View>
          <Text style={tw`text-[10px] font-black tracking-widest text-indigo-600 mb-3`}>RISKRADAR ACCOUNT</Text>
          <Text style={tw`text-4xl font-black tracking-tight text-slate-950 leading-10 mb-4`}>
            Your areas. Always remembered.
          </Text>
          <Text style={tw`text-base text-slate-500 leading-6 mb-8`}>
            Sign in without a password. We will email a secure, single-use link that returns you to RiskRadar.
          </Text>

          {sentTo ? (
            <View style={[membershipStyles.card, membershipStyles.elevatedCard]}>
              <View style={tw`w-12 h-12 rounded-full bg-emerald-50 items-center justify-center mb-5`}>
                <CheckCircle2 size={24} color={membershipColors.emerald} />
              </View>
              <Text style={tw`text-2xl font-black text-slate-950 mb-2`}>Check your inbox</Text>
              <Text style={tw`text-sm text-slate-500 leading-5 mb-2`}>We sent a secure sign-in link to:</Text>
              <Text selectable style={tw`text-sm font-black text-slate-900 mb-6`}>{sentTo}</Text>
              {sentStateError ? (
                <Text selectable style={tw`text-sm font-bold text-rose-600 leading-5 mb-4`}>{sentStateError}</Text>
              ) : null}
              <Pressable
                onPress={() => void sendLink()}
                disabled={busy}
                accessibilityRole="button"
                style={({ pressed }) => [membershipStyles.primaryButton, pressed && tw`opacity-80`, busy && tw`opacity-60`]}
              >
                {busy ? <ActivityIndicator color="white" /> : <Mail size={18} color="white" />}
                <Text style={tw`text-white font-black ml-2`}>{busy ? 'Sending...' : 'Resend secure link'}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setSentTo(null);
                  setError(null);
                }}
                hitSlop={8}
                style={tw`items-center py-4`}
              >
                <Text style={tw`text-sm font-black text-indigo-600`}>Use another email</Text>
              </Pressable>
            </View>
          ) : (
            <View style={[membershipStyles.card, membershipStyles.elevatedCard]}>
              <Text style={tw`text-[10px] font-black tracking-widest text-slate-400 mb-3`}>EMAIL ADDRESS</Text>
              <View style={tw`h-16 flex-row items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 mb-3`}>
                <Mail size={20} color={membershipColors.muted} />
                <TextInput
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    setError(null);
                  }}
                  onSubmitEditing={() => void sendLink()}
                  placeholder="you@example.com"
                  placeholderTextColor={membershipColors.muted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  returnKeyType="send"
                  accessibilityLabel="Email address"
                  style={tw`flex-1 h-full ml-3 text-base font-bold text-slate-900`}
                />
              </View>
              {error ? <Text selectable style={tw`text-sm font-bold text-rose-600 leading-5 mb-4`}>{error}</Text> : null}
              <Pressable
                onPress={() => void sendLink()}
                disabled={busy}
                accessibilityRole="button"
                style={({ pressed }) => [membershipStyles.primaryButton, pressed && tw`opacity-80`, busy && tw`opacity-60`]}
              >
                {busy ? <ActivityIndicator color="white" /> : <LockKeyhole size={18} color="white" />}
                <Text style={tw`text-white font-black ml-2`}>
                  {busy ? 'Sending secure link...' : 'Email me a secure sign-in link'}
                </Text>
              </Pressable>
            </View>
          )}

          <View style={tw`flex-row items-start px-2 mt-5 mb-4`}>
            <LockKeyhole size={15} color={membershipColors.muted} />
            <Text style={tw`flex-1 text-xs text-slate-400 leading-5 ml-2`}>
              RiskRadar never asks for a password. The link expires and can only sign in to the account tied to this email.
            </Text>
          </View>

          <Pressable
            onPress={onContinueFree}
            accessibilityRole="button"
            style={({ pressed }) => [membershipStyles.secondaryButton, pressed && tw`bg-slate-50`]}
          >
            <Text style={tw`text-sm font-black text-slate-700`}>Continue as a free visitor</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function BackButton({ onPress }: { onPress(): void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [tw`self-start flex-row items-center px-4 py-3 rounded-full bg-slate-100 mb-8`, pressed && tw`opacity-70`]}
    >
      <ArrowLeft size={17} color={membershipColors.slate} />
      <Text style={tw`text-sm font-black text-slate-700 ml-2`}>Back</Text>
    </Pressable>
  );
}
