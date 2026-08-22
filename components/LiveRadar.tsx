import React from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { ArrowLeft, Bell, LocateFixed, LockKeyhole, MapPin, Radar, ShieldAlert, ShieldCheck } from 'lucide-react-native';
import tw from 'twrnc';

import type {
  LiveRadarAlertEvent,
  LiveRadarPermissionSnapshot,
  LiveRadarReading,
} from '../live-radar/types.ts';
import { membershipColors, membershipStyles } from './membershipStyles';

export interface LiveRadarProps {
  premium: boolean;
  membershipAvailable: boolean;
  status: 'active' | 'disabled';
  permissions: LiveRadarPermissionSnapshot;
  onboardingVisible: boolean;
  busy: boolean;
  currentReading: LiveRadarReading | null;
  history: LiveRadarAlertEvent[];
  warning: string | null;
  alertsReduced: boolean;
  onBack(): void;
  onOpenUpgrade(): void;
  onDismissOnboarding(): void;
  onStart(): Promise<void>;
  onStop(): Promise<void>;
  onScanNow(): Promise<void>;
  onRequestForeground(): Promise<void>;
  onRequestBackground(): Promise<void>;
  onRequestNotifications(): Promise<void>;
  onToggleReducedAlerts(): Promise<void>;
  onMutePostcode(): Promise<void>;
}

const RISK_COLORS: Record<LiveRadarReading['riskLevel'], { badge: string; text: string; ring: string }> = {
  low: { badge: '#ecfdf5', text: '#059669', ring: '#a7f3d0' },
  moderate: { badge: '#eff6ff', text: '#2563eb', ring: '#bfdbfe' },
  elevated: { badge: '#fffbeb', text: '#d97706', ring: '#fde68a' },
  high: { badge: '#fff1f2', text: '#e11d48', ring: '#fecdd3' },
};

function formatTimestamp(value: string | null | undefined) {
  if (!value) return 'Not checked yet';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not checked yet';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

export default function LiveRadar({
  premium,
  membershipAvailable,
  status,
  permissions,
  onboardingVisible,
  busy,
  currentReading,
  history,
  warning,
  alertsReduced,
  onBack,
  onOpenUpgrade,
  onDismissOnboarding,
  onStart,
  onStop,
  onScanNow,
  onRequestForeground,
  onRequestBackground,
  onRequestNotifications,
  onToggleReducedAlerts,
  onMutePostcode,
}: LiveRadarProps) {
  const badge = currentReading ? RISK_COLORS[currentReading.riskLevel] : null;
  const monitoringCopy = Platform.OS === 'web'
    ? 'Keep this page open to monitor your current area.'
    : 'Live Radar can watch for higher-risk area changes on this device.';

  return (
    <View style={membershipStyles.screen}>
      <Modal visible={onboardingVisible} animationType="slide" transparent onRequestClose={onDismissOnboarding}>
        <View style={tw`flex-1 bg-black/30 items-center justify-center px-5`}>
          <View style={[membershipStyles.card, membershipStyles.elevatedCard, tw`w-full max-w-md`]}>
            <Text style={tw`text-[10px] font-black tracking-widest text-indigo-600 mb-3`}>LIVE RADAR SETUP</Text>
            <Text style={tw`text-2xl font-black text-slate-950 mb-3`}>Enable the permissions Live Radar needs.</Text>
            <Text style={tw`text-sm text-slate-500 leading-6 mb-5`}>
              Foreground location scans your current area, background location keeps Live Radar running on native devices, and notifications surface alerts on this device.
            </Text>
            <PermissionRow title="Foreground location" state={permissions.foreground} onPress={() => void onRequestForeground()} />
            <PermissionRow title="Background location" state={permissions.background} onPress={() => void onRequestBackground()} />
            <PermissionRow title="Notifications" state={permissions.notifications} onPress={() => void onRequestNotifications()} />
            <Pressable onPress={onDismissOnboarding} style={({ pressed }) => [membershipStyles.secondaryButton, tw`mt-4`, pressed && tw`bg-slate-50`]}>
              <Text style={tw`text-sm font-black text-slate-700`}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
              <Radar size={22} color={membershipColors.indigo} />
            </View>
            <View>
              <Text style={tw`text-[10px] font-black tracking-widest text-indigo-600`}>LIVE RADAR</Text>
              <Text style={tw`text-lg font-black text-slate-950`}>Current-area monitoring</Text>
            </View>
          </View>

          <Text style={tw`text-4xl font-black tracking-tight text-slate-950 leading-10 mb-4`}>
            Monitor where you are, not just where you searched.
          </Text>
          <Text style={tw`text-base text-slate-500 leading-6 mb-6`}>
            {monitoringCopy}
          </Text>

          {!premium ? (
            <View style={[membershipStyles.card, membershipStyles.elevatedCard, tw`border-indigo-100 mb-5`]}>
              <View style={tw`w-12 h-12 rounded-2xl bg-indigo-50 items-center justify-center mb-4`}>
                <LockKeyhole size={22} color={membershipColors.indigo} />
              </View>
              <Text style={tw`text-xl font-black text-slate-950 mb-2`}>Background Live Radar is a Pro feature</Text>
              <Text style={tw`text-sm text-slate-500 leading-6 mb-5`}>
                You can preview how Live Radar works here, but native background monitoring requires Pro. Public postcode search remains available either way.
              </Text>
              <Pressable onPress={onOpenUpgrade} style={({ pressed }) => [membershipStyles.primaryButton, pressed && tw`opacity-80`]}>
                <ShieldCheck size={18} color="white" />
                <Text style={tw`text-white font-black ml-2`}>
                  {membershipAvailable ? 'Unlock RiskRadar Pro' : 'Premium setup in progress'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View style={[membershipStyles.card, membershipStyles.elevatedCard, tw`mb-5`]}>
            <View style={tw`flex-row items-start justify-between mb-4`}>
              <View style={tw`flex-1 pr-4`}>
                <Text style={tw`text-[10px] font-black tracking-widest text-slate-400 mb-1`}>STATUS</Text>
                <Text style={tw`text-2xl font-black text-slate-950`}>
                  {status === 'active' ? 'Active' : 'Disabled'}
                </Text>
                <Text style={tw`text-sm text-slate-500 mt-2`}>Last checked: {formatTimestamp(currentReading?.checkedAt)}</Text>
              </View>
              {currentReading && badge ? (
                <View style={{ backgroundColor: badge.badge, borderColor: badge.ring, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 }}>
                  <Text style={{ color: badge.text, fontSize: 24, fontWeight: '900', textAlign: 'center' }}>{currentReading.score}</Text>
                  <Text style={{ color: badge.text, fontSize: 10, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' }}>{currentReading.riskLevel}</Text>
                </View>
              ) : null}
            </View>

            <View style={tw`rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 mb-4`}>
              <View style={tw`flex-row items-center mb-2`}>
                <MapPin size={16} color={membershipColors.indigo} />
                <Text style={tw`text-[10px] font-black tracking-widest text-slate-400 ml-2`}>LATEST AREA</Text>
              </View>
              <Text style={tw`text-base font-black text-slate-950 mb-1`}>
                {currentReading?.postcode || 'No postcode detected yet'}
              </Text>
              <Text style={tw`text-xs text-slate-500 leading-5`}>
                {currentReading?.mainReason || 'Use Scan My Current Location Now to populate your first Live Radar reading.'}
              </Text>
              {currentReading?.accuracyState === 'poor' ? (
                <Text style={tw`text-xs font-black text-amber-700 mt-3`}>
                  Location accuracy was low, so this result may be less precise.
                </Text>
              ) : null}
            </View>

            <View style={tw`flex-row gap-3 mb-3`}>
              <Pressable
                onPress={() => void onStart()}
                disabled={busy || !premium}
                style={({ pressed }) => [membershipStyles.primaryButton, tw`flex-1`, (busy || !premium) && tw`opacity-60`, pressed && premium && tw`opacity-80`]}
              >
                <ShieldAlert size={18} color="white" />
                <Text style={tw`text-white font-black ml-2`}>Turn On Live Radar</Text>
              </Pressable>
              <Pressable
                onPress={() => void onStop()}
                disabled={busy}
                style={({ pressed }) => [membershipStyles.secondaryButton, tw`flex-1`, busy && tw`opacity-60`, pressed && !busy && tw`bg-slate-50`]}
              >
                <Text style={tw`text-sm font-black text-slate-700`}>Turn Off Live Radar</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => void onScanNow()}
              disabled={busy}
              style={({ pressed }) => [membershipStyles.secondaryButton, busy && tw`opacity-60`, pressed && !busy && tw`bg-slate-50`]}
            >
              <LocateFixed size={17} color={membershipColors.indigo} />
              <Text style={tw`text-sm font-black text-indigo-700 ml-2`}>
                {busy ? 'Checking current area...' : 'Scan My Current Location Now'}
              </Text>
            </Pressable>
          </View>

          {warning ? (
            <View style={tw`rounded-3xl border border-amber-100 bg-amber-50 px-5 py-4 mb-5`}>
              <Text style={tw`text-xs font-black text-amber-800 mb-1`}>Live Radar warning</Text>
              <Text selectable style={tw`text-xs text-amber-700 leading-5`}>{warning}</Text>
            </View>
          ) : null}

          <View style={[membershipStyles.card, tw`mb-5`]}>
            <View style={tw`flex-row items-center justify-between mb-4`}>
              <Text style={tw`text-lg font-black text-slate-950`}>Permissions</Text>
              <Pressable onPress={() => void onToggleReducedAlerts()}>
                <Text style={tw`text-xs font-black text-indigo-700`}>
                  {alertsReduced ? 'Reduced alerts on' : 'Reduce alerts option'}
                </Text>
              </Pressable>
            </View>
            <PermissionStateLine label="Foreground location" state={permissions.foreground} />
            <PermissionStateLine label="Background location" state={permissions.background} />
            <PermissionStateLine label="Notifications" state={permissions.notifications} />
            {currentReading?.postcode ? (
              <Pressable onPress={() => void onMutePostcode()} style={({ pressed }) => [membershipStyles.secondaryButton, tw`mt-4`, pressed && tw`bg-slate-50`]}>
                <Text style={tw`text-sm font-black text-slate-700`}>Mute {currentReading.postcode}</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={[membershipStyles.card, membershipStyles.elevatedCard, tw`mb-5`]}>
            <View style={tw`flex-row items-center justify-between mb-4`}>
              <Text style={tw`text-lg font-black text-slate-950`}>Alert history</Text>
              <Bell size={16} color={membershipColors.indigo} />
            </View>
            {history.length ? history.map((event) => (
              <View key={event.id} style={tw`border-b border-slate-100 py-3`}>
                <View style={tw`flex-row items-center justify-between mb-1`}>
                  <Text style={tw`text-sm font-black text-slate-900`}>{event.postcode}</Text>
                  <Text style={tw`text-xs font-black text-slate-400`}>{formatTimestamp(event.createdAt)}</Text>
                </View>
                <Text style={tw`text-xs font-black text-indigo-700 mb-1`}>Why was I alerted? {event.explanation}</Text>
                <Text style={tw`text-xs text-slate-500`}>Score {event.score} · {event.trigger}</Text>
              </View>
            )) : (
              <Text style={tw`text-sm text-slate-500 leading-6`}>
                No Live Radar alerts have been recorded on this device yet.
              </Text>
            )}
          </View>

          <View style={tw`rounded-3xl border border-amber-100 bg-amber-50 px-5 py-4`}>
            <Text style={tw`text-xs font-black text-amber-800 mb-1`}>Area intelligence only</Text>
            <Text style={tw`text-xs text-amber-700 leading-5`}>
              Live Radar uses delayed public area intelligence. It is not an emergency service, not live police dispatch, and not a guarantee of personal safety.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function PermissionRow({ title, state, onPress }: { title: string; state: string; onPress(): void }) {
  return (
    <View style={tw`border border-slate-200 rounded-2xl px-4 py-4 mb-3`}>
      <View style={tw`flex-row items-center justify-between mb-3`}>
        <Text style={tw`text-sm font-black text-slate-900`}>{title}</Text>
        <Text style={tw`text-[10px] font-black tracking-widest text-slate-400 uppercase`}>{state}</Text>
      </View>
      <Pressable onPress={onPress} style={({ pressed }) => [membershipStyles.secondaryButton, pressed && tw`bg-slate-50`]}>
        <Text style={tw`text-sm font-black text-slate-700`}>Review permission</Text>
      </Pressable>
    </View>
  );
}

function PermissionStateLine({ label, state }: { label: string; state: string }) {
  return (
    <View style={tw`flex-row items-center justify-between border-b border-slate-100 py-3`}>
      <Text style={tw`text-sm text-slate-700`}>{label}</Text>
      <Text style={tw`text-xs font-black text-slate-500 uppercase`}>{state}</Text>
    </View>
  );
}
