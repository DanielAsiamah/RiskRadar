import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { ArrowLeft, Bell, CheckCircle2, Mail, RefreshCw, Save, ShieldCheck } from 'lucide-react-native';
import tw from 'twrnc';

import type { AlertPreferences, AlertPreferencesInput } from '../api/alerts';
import { membershipColors, membershipStyles } from './membershipStyles';

export interface AlertSettingsProps {
  preferences: AlertPreferences | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  latestDataMonth: string | null;
  onBack(): void;
  onRetry(): Promise<void>;
  onSave(input: AlertPreferencesInput): Promise<void>;
}

const defaultDraft: AlertPreferencesInput = {
  monthlyEmailEnabled: true,
  categoryChangeEnabled: true,
  volumeChangeEnabled: true,
};

function toDraft(preferences: AlertPreferences | null): AlertPreferencesInput {
  if (!preferences) return defaultDraft;
  return {
    monthlyEmailEnabled: preferences.monthlyEmailEnabled,
    categoryChangeEnabled: preferences.categoryChangeEnabled,
    volumeChangeEnabled: preferences.volumeChangeEnabled,
  };
}

function formatMonth(value: string | null) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return 'the next published Police.uk month';
  }

  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function changed(preferences: AlertPreferences | null, draft: AlertPreferencesInput) {
  if (!preferences) return false;
  return (
    preferences.monthlyEmailEnabled !== draft.monthlyEmailEnabled
    || preferences.categoryChangeEnabled !== draft.categoryChangeEnabled
    || preferences.volumeChangeEnabled !== draft.volumeChangeEnabled
  );
}

export default function AlertSettings({
  preferences,
  loading,
  saving,
  error,
  latestDataMonth,
  onBack,
  onRetry,
  onSave,
}: AlertSettingsProps) {
  const [draft, setDraft] = useState<AlertPreferencesInput>(() => toDraft(preferences));
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const hasChanges = useMemo(() => changed(preferences, draft), [draft, preferences]);
  const disabled = loading || saving || !preferences;

  useEffect(() => {
    setDraft(toDraft(preferences));
  }, [
    preferences?.categoryChangeEnabled,
    preferences?.monthlyEmailEnabled,
    preferences?.volumeChangeEnabled,
  ]);

  const save = async () => {
    if (!preferences || saving || !hasChanges) return;
    const previousDraft = toDraft(preferences);
    try {
      setSavedMessage(null);
      await onSave(draft);
      setSavedMessage('Alert preferences saved.');
    } catch {
      setDraft(previousDraft);
    }
  };

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
            <Text style={tw`text-sm font-black text-slate-700 ml-2`}>Back to dashboard</Text>
          </Pressable>

          <Text style={tw`text-[10px] font-black tracking-widest text-indigo-600 mb-3`}>PREMIUM ALERTS</Text>
          <Text style={tw`text-4xl font-black tracking-tight text-slate-950 mb-3`}>Alert settings</Text>
          <Text style={tw`text-base text-slate-500 leading-6 mb-6`}>
            Choose which monthly intelligence changes RiskRadar should email when a new Police.uk data month is published.
          </Text>

          {loading && !preferences ? (
            <View style={[membershipStyles.card, tw`items-center py-12 mb-5`]}>
              <ActivityIndicator size="large" color={membershipColors.indigo} />
              <Text style={tw`text-base font-black text-slate-900 mt-5`}>Loading alert settings</Text>
              <Text style={tw`text-xs text-slate-500 mt-2`}>Checking your Premium email preferences.</Text>
            </View>
          ) : null}

          {error ? (
            <View style={tw`rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 mb-5`}>
              <Text selectable style={tw`text-sm font-bold text-rose-700 leading-5 mb-3`}>{error}</Text>
              <Pressable onPress={() => void onRetry()} style={({ pressed }) => [membershipStyles.secondaryButton, pressed && tw`bg-rose-100`]}>
                <RefreshCw size={16} color={membershipColors.rose} />
                <Text style={tw`text-sm font-black text-rose-700 ml-2`}>Try again</Text>
              </Pressable>
            </View>
          ) : null}

          {preferences ? (
            <>
              <View style={[membershipStyles.card, membershipStyles.elevatedCard, tw`mb-5`]}>
                <View style={tw`w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 items-center justify-center mb-4`}>
                  <Bell size={22} color={membershipColors.indigo} />
                </View>
                <Text style={tw`text-xl font-black text-slate-950 mb-2`}>Monthly intelligence briefings</Text>
                <Text style={tw`text-sm text-slate-500 leading-6 mb-5`}>
                  RiskRadar sends at most one digest per watched place for {formatMonth(latestDataMonth)}. It is based on newly published monthly records, not live emergency conditions.
                </Text>

                <View style={tw`rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 mb-5`}>
                  <View style={tw`flex-row items-center mb-2`}>
                    <Mail size={16} color={membershipColors.indigo} />
                    <Text style={tw`text-[10px] font-black tracking-widest text-slate-400 ml-2`}>DELIVERY EMAIL</Text>
                  </View>
                  <Text selectable style={tw`text-sm font-black text-slate-900`}>
                    {preferences.email || 'Your signed-in account email'}
                  </Text>
                </View>

                <ToggleRow
                  title="Monthly email briefing"
                  detail="Send a plain-English digest when a watched place gets a newly published data month."
                  enabled={draft.monthlyEmailEnabled}
                  disabled={disabled}
                  onToggle={() => {
                    setSavedMessage(null);
                    setDraft((current) => ({ ...current, monthlyEmailEnabled: !current.monthlyEmailEnabled }));
                  }}
                />
                <ToggleRow
                  title="Category movement alerts"
                  detail="Call out changes in violent crime, robbery, burglary, anti-social behaviour, and other key categories."
                  enabled={draft.categoryChangeEnabled}
                  disabled={disabled}
                  onToggle={() => {
                    setSavedMessage(null);
                    setDraft((current) => ({ ...current, categoryChangeEnabled: !current.categoryChangeEnabled }));
                  }}
                />
                <ToggleRow
                  title="Volume movement alerts"
                  detail="Highlight if overall recorded incident volume is rising, cooling, or stable against the recent baseline."
                  enabled={draft.volumeChangeEnabled}
                  disabled={disabled}
                  onToggle={() => {
                    setSavedMessage(null);
                    setDraft((current) => ({ ...current, volumeChangeEnabled: !current.volumeChangeEnabled }));
                  }}
                />

                {savedMessage ? (
                  <View style={tw`flex-row items-center rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3 mb-4`}>
                    <CheckCircle2 size={16} color={membershipColors.emerald} />
                    <Text style={tw`text-xs font-black text-emerald-700 ml-2`}>{savedMessage}</Text>
                  </View>
                ) : null}

                <Pressable
                  onPress={() => void save()}
                  disabled={!hasChanges || disabled}
                  accessibilityRole="button"
                  style={({ pressed }) => [membershipStyles.primaryButton, pressed && tw`opacity-80`, (!hasChanges || disabled) && tw`opacity-60`]}
                >
                  {saving ? <ActivityIndicator color="white" /> : <Save size={18} color="white" />}
                  <Text style={tw`text-white font-black ml-2`}>{saving ? 'Saving' : 'Save preferences'}</Text>
                </Pressable>
              </View>

              <View style={tw`rounded-3xl border border-amber-100 bg-amber-50 px-5 py-4 mb-5`}>
                <View style={tw`flex-row items-center mb-2`}>
                  <ShieldCheck size={16} color={membershipColors.amber} />
                  <Text style={tw`text-xs font-black text-amber-800 ml-2`}>Monthly, not live</Text>
                </View>
                <Text style={tw`text-xs text-amber-700 leading-5`}>
                  Premium alerts explain newly published area intelligence. They are not emergency warnings, live GPS alerts, or a replacement for local police advice.
                </Text>
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function ToggleRow({
  title,
  detail,
  enabled,
  disabled,
  onToggle,
}: {
  title: string;
  detail: string;
  enabled: boolean;
  disabled: boolean;
  onToggle(): void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled, disabled }}
      style={({ pressed }) => [
        tw`flex-row items-center justify-between border-b border-slate-100 py-4`,
        pressed && tw`opacity-75`,
        disabled && tw`opacity-70`,
      ]}
    >
      <View style={tw`flex-1 pr-4`}>
        <Text style={tw`text-sm font-black text-slate-900 mb-1`}>{title}</Text>
        <Text style={tw`text-xs text-slate-500 leading-5`}>{detail}</Text>
      </View>
      <View style={[tw`w-12 h-7 rounded-full p-1`, { backgroundColor: enabled ? membershipColors.indigo : '#cbd5e1' }]}>
        <View style={[tw`w-5 h-5 rounded-full bg-white`, enabled && tw`ml-5`]} />
      </View>
    </Pressable>
  );
}
