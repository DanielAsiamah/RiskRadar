import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { ArrowLeft, BarChart3, Bell, FileText, Plus, RefreshCw, ShieldCheck } from 'lucide-react-native';
import tw from 'twrnc';

import type { ChangeSummary, DashboardView, WatchSnapshot } from '../membership/dashboard-types';
import type { TrendData } from '../types';
import { TrendChart } from './IntelligenceCharts';
import MonthlyBriefing from './MonthlyBriefing';
import WatchedPlaceCard from './WatchedPlaceCard';
import WatchPlaceForm from './WatchPlaceForm';
import { membershipColors, membershipStyles } from './membershipStyles';
import SiteFooter, { type TrustNavigation } from './SiteFooter';

export interface PremiumDashboardProps {
  dashboard: DashboardView | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  pendingPostcode: string | null;
  onBack(): void;
  onRefresh(): Promise<void>;
  onAddWatchedPlace(input: { label: string; postcode: string }): Promise<void>;
  onRenameWatchedPlace(id: string, label: string): Promise<void>;
  onRemoveWatchedPlace(id: string): Promise<void>;
  onSelectWatchedPlace(id: string): Promise<void>;
  onClearPendingPostcode(): void;
  onOpenCompare(): void;
  onOpenAlertSettings(): void;
  onOpenReport(watchId: string): void;
  trustNavigation: TrustNavigation;
}

function formatMonth(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return 'Awaiting published data';
  }

  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function categoryColor(category: string) {
  switch (category) {
    case 'violent-crime':
      return '#e11d48';
    case 'anti-social-behaviour':
      return '#d97706';
    case 'robbery':
      return '#0284c7';
    case 'burglary':
      return '#7c3aed';
    case 'shoplifting':
      return '#0f766e';
    default:
      return '#475569';
  }
}

function humanize(value: string) {
  return value
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function buildTrendData(snapshot: WatchSnapshot, summary: ChangeSummary): TrendData {
  const direction = summary.direction !== 'insufficient-data'
    ? summary.direction
    : 'stable';
  const changePercent = Number(summary.changePercent) || 0;
  const detail = String(summary.summary || 'Trend data is loading.');

  return {
    monthly: snapshot.trend.map((point) => ({
      month: point.month,
      monthDisplay: formatMonth(point.month),
      totalCrimes: point.total,
      violentCrimes: 0,
      antiSocialCrimes: 0,
      robberyCrimes: 0,
      dataAvailable: true,
    })),
    direction,
    changePercent,
    categoryDirection: {
      violentCrimes: 'stable',
      antiSocialCrimes: 'stable',
      robberyCrimes: 'stable',
    },
    summary: detail,
  };
}

export default function PremiumDashboard({
  dashboard,
  loading,
  saving,
  error,
  pendingPostcode,
  onBack,
  onRefresh,
  onAddWatchedPlace,
  onRenameWatchedPlace,
  onRemoveWatchedPlace,
  onSelectWatchedPlace,
  onClearPendingPostcode,
  onOpenCompare,
  onOpenAlertSettings,
  onOpenReport,
  trustNavigation,
}: PremiumDashboardProps) {
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    if (pendingPostcode) {
      setShowAddForm(true);
    }
  }, [pendingPostcode]);

  const selectedPlace = dashboard?.selectedPlace ?? null;
  const trendData = useMemo(() => (
    selectedPlace?.available && selectedPlace.snapshot && selectedPlace.changeSummary
      ? buildTrendData(selectedPlace.snapshot, selectedPlace.changeSummary)
      : null
  ), [selectedPlace]);
  const watchCount = dashboard?.places.length ?? 0;
  const watchLimitReached = watchCount >= 10;

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

          <Text style={tw`text-[10px] font-black tracking-widest text-indigo-600 mb-3`}>PREMIUM DASHBOARD</Text>
          <Text style={tw`text-4xl font-black tracking-tight text-slate-950 mb-3`}>Watched places</Text>
          <Text style={tw`text-base text-slate-500 leading-6 mb-6`}>
            Keep up to ten important UK postcodes in one place and see what changed when a new Police.uk month arrives.
          </Text>

          {dashboard?.briefing ? <MonthlyBriefing briefing={dashboard.briefing} /> : null}

          <View style={tw`rounded-3xl border border-amber-100 bg-amber-50 px-5 py-4 mb-5`}>
            <Text style={tw`text-xs font-black text-amber-800 mb-1`}>Monthly data delay warning</Text>
            <Text style={tw`text-xs text-amber-700 leading-5`}>
              Police.uk publishes anonymised street-level records by recorded month. Premium explains new published changes, but it does not promise live emergency conditions.
            </Text>
          </View>

          {error ? (
            <View style={tw`rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 mb-5`}>
              <Text selectable style={tw`text-sm font-bold text-rose-700 leading-5 mb-3`}>{error}</Text>
              <Pressable onPress={() => void onRefresh()} style={({ pressed }) => [membershipStyles.secondaryButton, pressed && tw`bg-rose-100`]}>
                <RefreshCw size={16} color={membershipColors.rose} />
                <Text style={tw`text-sm font-black text-rose-700 ml-2`}>Try again</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={tw`flex-row gap-3 mb-5`}>
            <Pressable
              onPress={() => setShowAddForm(true)}
              disabled={saving || watchLimitReached}
              style={({ pressed }) => [membershipStyles.primaryButton, tw`flex-1`, pressed && tw`opacity-80`, (saving || watchLimitReached) && tw`opacity-60`]}
            >
              {saving ? <ActivityIndicator color="white" /> : <Plus size={18} color="white" />}
              <Text style={tw`text-white font-black ml-2`}>{watchLimitReached ? 'Watchlist full' : 'Add watched place'}</Text>
            </Pressable>
            <Pressable
              onPress={onOpenCompare}
              style={({ pressed }) => [membershipStyles.secondaryButton, tw`flex-1`, pressed && tw`bg-slate-50`]}
            >
              <BarChart3 size={17} color={membershipColors.slate} />
              <Text style={tw`text-sm font-black text-slate-700 ml-2`}>Compare areas</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={onOpenAlertSettings}
            style={({ pressed }) => [membershipStyles.secondaryButton, tw`mb-5`, pressed && tw`bg-slate-50`]}
            accessibilityRole="button"
          >
            <Bell size={17} color={membershipColors.indigo} />
            <Text style={tw`text-sm font-black text-indigo-700 ml-2`}>Alert settings</Text>
          </Pressable>

          {showAddForm ? (
            <WatchPlaceForm
              initialLabel=""
              initialPostcode={pendingPostcode ?? ''}
              busy={saving}
              onSubmit={async (input) => {
                await onAddWatchedPlace(input);
                setShowAddForm(false);
                onClearPendingPostcode();
              }}
              onCancel={() => {
                setShowAddForm(false);
                onClearPendingPostcode();
              }}
            />
          ) : null}

          {loading && !dashboard ? (
            <View style={[membershipStyles.card, tw`items-center py-12 mb-5`]}>
              <ActivityIndicator size="large" color={membershipColors.indigo} />
              <Text style={tw`text-base font-black text-slate-900 mt-5`}>Loading your dashboard</Text>
              <Text style={tw`text-xs text-slate-500 mt-2`}>Refreshing watched places and the latest published month.</Text>
            </View>
          ) : null}

          {!loading && dashboard && !dashboard.places.length ? (
            <View style={[membershipStyles.card, membershipStyles.elevatedCard, tw`mb-5`]}>
              <View style={tw`w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 items-center justify-center mb-4`}>
                <ShieldCheck size={22} color={membershipColors.indigo} />
              </View>
              <Text style={tw`text-xl font-black text-slate-950 mb-2`}>No watched places yet</Text>
              <Text style={tw`text-sm text-slate-500 leading-6`}>
                Add Home, Work, Family, or University to start building your monthly Premium intelligence dashboard.
              </Text>
            </View>
          ) : null}

          {dashboard?.places.length ? (
            <View style={tw`mb-4`}>
              <Text style={tw`text-[10px] font-black tracking-widest text-slate-400 mb-3`}>YOUR PLACES</Text>
              {dashboard.places.map((place) => (
                <WatchedPlaceCard
                  key={place.id}
                  place={place}
                  selected={selectedPlace?.id === place.id}
                  onSelect={() => void onSelectWatchedPlace(place.id)}
                  onRename={onRenameWatchedPlace}
                  onRemove={onRemoveWatchedPlace}
                  busy={saving || loading}
                />
              ))}
            </View>
          ) : null}

          {selectedPlace?.available && selectedPlace.snapshot ? (
            <View style={[membershipStyles.card, membershipStyles.elevatedCard, tw`mb-5`]}>
              <Text style={tw`text-[10px] font-black tracking-widest text-indigo-600 mb-2`}>SELECTED PLACE</Text>
              <View style={tw`flex-row items-start justify-between mb-4`}>
                <View style={tw`flex-1 pr-4`}>
                  <Text style={tw`text-2xl font-black text-slate-950 mb-1`}>{selectedPlace.label}</Text>
                  <Text selectable style={tw`text-sm font-bold text-slate-500`}>{selectedPlace.postcode}</Text>
                  <Text style={tw`text-[10px] font-black tracking-widest text-slate-400 mt-2`}>
                    DATA MONTH {formatMonth(selectedPlace.snapshot.dataMonth)}
                  </Text>
                </View>
                <View style={tw`items-end`}>
                  <Text style={[tw`text-4xl font-black text-indigo-600`, { fontVariant: ['tabular-nums'] }]}>{selectedPlace.snapshot.score}</Text>
                  <Text style={tw`text-[10px] font-black text-slate-400`}>RISK / 100</Text>
                </View>
              </View>

              <View style={tw`flex-row gap-3 mb-4`}>
                <MetricPanel label="Total incidents" value={String(selectedPlace.snapshot.totalIncidents)} />
                <MetricPanel label="Change" value={`${selectedPlace.changeSummary?.changePercent ?? 0 > 0 ? '+' : ''}${selectedPlace.changeSummary?.changePercent ?? 0}%`} />
              </View>

              <Pressable
                onPress={() => onOpenReport(selectedPlace.id)}
                style={({ pressed }) => [membershipStyles.secondaryButton, tw`mb-5`, pressed && tw`bg-slate-50`]}
                accessibilityRole="button"
              >
                <FileText size={17} color={membershipColors.indigo} />
                <Text style={tw`text-sm font-black text-indigo-700 ml-2`}>Download report</Text>
              </Pressable>

              {trendData ? (
                <View style={tw`mb-6`}>
                  <Text style={tw`text-sm font-black text-slate-900 mb-4`}>Twelve-month view</Text>
                  <TrendChart trendData={trendData} availableSeries={['totalCrimes']} />
                </View>
              ) : null}

              <View style={tw`mb-5`}>
                <Text style={tw`text-sm font-black text-slate-900 mb-3`}>Category breakdown</Text>
                {selectedPlace.snapshot.categories.slice(0, 6).map((category) => (
                  <View key={category.category} style={tw`flex-row items-center justify-between border-b border-slate-100 py-2`}>
                    <Text style={tw`text-sm text-slate-700`}>{humanize(category.category)}</Text>
                    <Text style={[tw`text-sm font-black`, { color: categoryColor(category.category), fontVariant: ['tabular-nums'] }]}>{category.count}</Text>
                  </View>
                ))}
              </View>

              <View>
                <Text style={tw`text-sm font-black text-slate-900 mb-3`}>Top roads in this snapshot</Text>
                {selectedPlace.snapshot.topRoads.slice(0, 4).map((road) => (
                  <View key={road.name} style={tw`flex-row items-center justify-between border-b border-slate-100 py-2`}>
                    <Text style={tw`text-sm text-slate-700 flex-1 pr-3`}>{road.name}</Text>
                    <Text style={tw`text-sm font-black text-slate-900`}>{road.count}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <SiteFooter {...trustNavigation} />
        </View>
      </ScrollView>
    </View>
  );
}

function MetricPanel({ label, value }: { label: string; value: string }) {
  return (
    <View style={tw`flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3`}>
      <Text style={tw`text-[10px] font-black tracking-widest text-slate-400 mb-1`}>{label}</Text>
      <Text style={[tw`text-base font-black text-slate-900`, { fontVariant: ['tabular-nums'] }]}>{value}</Text>
    </View>
  );
}
