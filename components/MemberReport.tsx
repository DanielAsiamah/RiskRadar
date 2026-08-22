import React from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import {
  ArrowLeft,
  BarChart3,
  Copy,
  ExternalLink,
  FileText,
  MapPin,
  RefreshCw,
  Share2,
  ShieldCheck,
} from 'lucide-react-native';
import tw from 'twrnc';

import type { MemberReport } from '../api/reports';
import { membershipColors, membershipStyles } from './membershipStyles';
import PrintReport from './PrintReport';

export interface MemberReportScreenProps {
  report: MemberReport | null;
  loading: boolean;
  error: string | null;
  publicView?: boolean;
  shareBusy?: boolean;
  shareError?: string | null;
  shareUrl?: string | null;
  onBack(): void;
  onRetry(): Promise<void>;
  onCreateShareLink?(): Promise<void>;
}

function directionColor(direction: string) {
  if (direction === 'rising') return membershipColors.rose;
  if (direction === 'cooling') return membershipColors.emerald;
  return membershipColors.slate;
}

function topTrendPoints(report: MemberReport) {
  return report.trend.monthly.slice(-6);
}

export default function MemberReportScreen({
  report,
  loading,
  error,
  publicView = false,
  shareBusy = false,
  shareError = null,
  shareUrl = null,
  onBack,
  onRetry,
  onCreateShareLink,
}: MemberReportScreenProps) {
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
            <Text style={tw`text-sm font-black text-slate-700 ml-2`}>{publicView ? 'Back to home' : 'Back to dashboard'}</Text>
          </Pressable>

          <Text style={tw`text-[10px] font-black tracking-widest text-indigo-600 mb-3`}>{publicView ? 'SHARED REPORT' : 'PREMIUM REPORT'}</Text>
          <Text style={tw`text-4xl font-black tracking-tight text-slate-950 mb-3`}>Safety report</Text>
          <Text style={tw`text-base text-slate-500 leading-6 mb-6`}>
            {report
              ? `${report.label} report generated from ${report.dataMonthDisplay} Police.uk data.`
              : publicView
                ? 'Preparing the shared report view.'
                : 'Preparing the latest report for this watched place.'}
          </Text>

          {loading ? (
            <View style={[membershipStyles.card, tw`items-center py-12 mb-5`]}>
              <ActivityIndicator size="large" color={membershipColors.indigo} />
              <Text style={tw`text-base font-black text-slate-900 mt-5`}>Building report</Text>
              <Text style={tw`text-xs text-slate-500 mt-2`}>Refreshing the latest watched-place evidence.</Text>
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

          {report ? (
            <ReportContent
              report={report}
              publicView={publicView}
              shareBusy={shareBusy}
              shareError={shareError}
              shareUrl={shareUrl}
              onCreateShareLink={onCreateShareLink}
            />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function ReportContent({
  report,
  publicView,
  shareBusy,
  shareError,
  shareUrl,
  onCreateShareLink,
}: {
  report: MemberReport;
  publicView: boolean;
  shareBusy: boolean;
  shareError: string | null;
  shareUrl: string | null;
  onCreateShareLink?: () => Promise<void>;
}) {
  const trendPoints = topTrendPoints(report);
  const trendColor = directionColor(report.trend.direction);

  return (
    <>
      <View style={[membershipStyles.card, membershipStyles.elevatedCard, tw`mb-5`]}>
        <View style={tw`flex-row items-start justify-between mb-5`}>
          <View style={tw`flex-1 pr-4`}>
            <View style={tw`w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 items-center justify-center mb-4`}>
              <FileText size={22} color={membershipColors.indigo} />
            </View>
            <Text style={tw`text-2xl font-black text-slate-950 mb-1`}>{report.label}</Text>
            <Text selectable style={tw`text-sm font-bold text-slate-500`}>{report.postcode} - {report.adminDistrict}</Text>
            <Text style={tw`text-[10px] font-black tracking-widest text-slate-400 mt-3`}>
              GENERATED {report.generatedDateDisplay}
            </Text>
          </View>
          <View style={tw`items-end`}>
            <Text style={[tw`text-4xl font-black text-indigo-600`, { fontVariant: ['tabular-nums'] }]}>{report.score}</Text>
            <Text style={tw`text-[10px] font-black text-slate-400`}>RISK / 100</Text>
          </View>
        </View>

        <View style={tw`flex-row gap-3 mb-5`}>
          <Metric label="Incidents" value={String(report.totalIncidents)} />
          <Metric label="Data month" value={report.dataMonthDisplay} />
          <Metric label="Radius" value={`${report.postcodeRadiusMeters}m`} />
        </View>

        <Text style={tw`text-sm text-slate-600 leading-6 mb-5`}>{report.summary}</Text>
        <PrintReport report={report} />

        {!publicView ? (
          <View style={tw`mt-4`}>
            <Pressable
              onPress={() => void onCreateShareLink?.()}
              disabled={shareBusy}
              accessibilityRole="button"
              style={({ pressed }) => [membershipStyles.secondaryButton, shareBusy && tw`opacity-60`, pressed && !shareBusy && tw`bg-slate-50`]}
            >
              {shareBusy ? <ActivityIndicator color={membershipColors.indigo} /> : <Share2 size={17} color={membershipColors.indigo} />}
              <Text style={tw`text-sm font-black text-indigo-700 ml-2`}>{shareBusy ? 'Creating share link' : 'Create share link'}</Text>
            </Pressable>
            {shareUrl ? (
              <View style={tw`rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4 mt-3`}>
                <Text style={tw`text-[10px] font-black tracking-widest text-emerald-700 uppercase mb-2`}>Shareable report link</Text>
                <Text selectable style={tw`text-xs text-emerald-900 leading-5 mb-3`}>{shareUrl}</Text>
                <View style={tw`flex-row gap-3`}>
                  <Pressable
                    onPress={() => void Linking.openURL(shareUrl).catch(() => undefined)}
                    accessibilityRole="link"
                    style={({ pressed }) => [membershipStyles.secondaryButton, tw`flex-1`, pressed && tw`bg-emerald-100`]}
                  >
                    <ExternalLink size={15} color={membershipColors.emerald} />
                    <Text style={tw`text-xs font-black text-emerald-800 ml-2`}>Open link</Text>
                  </Pressable>
                  {Platform.OS === 'web' ? (
                    <Pressable
                      onPress={() => {
                        void globalThis.navigator?.clipboard?.writeText?.(shareUrl);
                      }}
                      accessibilityRole="button"
                      style={({ pressed }) => [membershipStyles.secondaryButton, tw`flex-1`, pressed && tw`bg-emerald-100`]}
                    >
                      <Copy size={15} color={membershipColors.emerald} />
                      <Text style={tw`text-xs font-black text-emerald-800 ml-2`}>Copy link</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}
            {shareError ? (
              <Text selectable style={tw`text-xs font-bold text-rose-600 mt-3`}>{shareError}</Text>
            ) : null}
          </View>
        ) : (
          <View style={tw`rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-4 mt-4`}>
            <Text style={tw`text-xs text-indigo-900 leading-5`}>
              This shared report is a public informational snapshot. It is not an emergency alert, live police feed, or guarantee of personal safety.
            </Text>
          </View>
        )}
      </View>

      <View style={[membershipStyles.card, tw`mb-5`]}>
        <View style={tw`flex-row items-center mb-4`}>
          <BarChart3 size={18} color={trendColor} />
          <Text style={tw`text-sm font-black text-slate-950 ml-2`}>What changed?</Text>
        </View>
        <Text style={tw`text-sm text-slate-600 leading-6 mb-4`}>
          {report.changeSummary || report.trend.summary}
        </Text>
        <View style={tw`flex-row items-end gap-2 h-28 mb-2`}>
          {trendPoints.map((point) => {
            const max = Math.max(...trendPoints.map((entry) => entry.totalCrimes), 1);
            const height = Math.max(14, Math.round((point.totalCrimes / max) * 94));
            return (
              <View key={point.month} style={tw`flex-1 items-center justify-end`}>
                <View style={[tw`w-full rounded-t-xl`, { height, backgroundColor: `${trendColor}cc` }]} />
              </View>
            );
          })}
        </View>
        <View style={tw`flex-row gap-2`}>
          {trendPoints.map((point) => (
            <Text key={point.month} style={tw`flex-1 text-[9px] font-bold text-slate-400 text-center`}>
              {point.monthDisplay.split(' ')[0].slice(0, 3)}
            </Text>
          ))}
        </View>
      </View>

      <View style={[membershipStyles.card, tw`mb-5`]}>
        <Text style={tw`text-sm font-black text-slate-950 mb-4`}>Category breakdown</Text>
        {report.categoryBreakdown.slice(0, 8).map((category) => (
          <Row key={category.category} label={category.label} value={String(category.count)} />
        ))}
      </View>

      <View style={[membershipStyles.card, tw`mb-5`]}>
        <Text style={tw`text-sm font-black text-slate-950 mb-4`}>Category changes</Text>
        {report.categoryChanges.length ? report.categoryChanges.slice(0, 6).map((change) => (
          <View key={change.category} style={tw`border-b border-slate-100 py-3`}>
            <View style={tw`flex-row items-center justify-between`}>
              <Text style={tw`text-sm font-bold text-slate-800 flex-1 pr-3`}>{change.label}</Text>
              <Text style={[tw`text-xs font-black uppercase`, { color: directionColor(change.direction) }]}>{change.direction}</Text>
            </View>
            <Text style={tw`text-[11px] text-slate-500 mt-1`}>
              {change.previousCount} previous baseline to {change.currentCount} in {report.dataMonthDisplay}
            </Text>
          </View>
        )) : <Text style={tw`text-xs text-slate-500`}>No category movement is available yet.</Text>}
      </View>

      <View style={[membershipStyles.card, tw`mb-5`]}>
        <Text style={tw`text-sm font-black text-slate-950 mb-4`}>Hotspot roads</Text>
        {report.hotspotRoads.slice(0, 8).map((road) => (
          <View key={road.name} style={tw`flex-row items-center border-b border-slate-100 py-3`}>
            <MapPin size={14} color={membershipColors.indigo} />
            <Text style={tw`text-sm text-slate-700 flex-1 ml-2 pr-3`}>{road.name}</Text>
            <Text style={tw`text-sm font-black text-slate-900`}>{road.count}</Text>
          </View>
        ))}
      </View>

      <View style={[membershipStyles.card, tw`mb-5`]}>
        <Text style={tw`text-sm font-black text-slate-950 mb-4`}>Official evidence</Text>
        {report.officialEvidence.slice(0, 8).map((item, index) => (
          <Pressable
            key={item.persistentId}
            onPress={() => void Linking.openURL(item.officialCaseUrl)}
            accessibilityRole="link"
            style={({ pressed }) => [tw`rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 mb-3`, pressed && tw`opacity-75`]}
          >
            <View style={tw`flex-row items-center justify-between`}>
              <View style={tw`flex-1 pr-3`}>
                <Text style={tw`text-xs font-black text-indigo-700 mb-1`}>Official record {index + 1}</Text>
                <Text style={tw`text-sm font-bold text-slate-900`}>{item.categoryLabel}</Text>
                <Text style={tw`text-[11px] text-slate-500 mt-1`}>{item.locationStreet} - {item.monthDisplay}</Text>
              </View>
              <ExternalLink size={16} color={membershipColors.indigo} />
            </View>
          </Pressable>
        ))}
      </View>

      <View style={tw`rounded-3xl border border-amber-100 bg-amber-50 px-5 py-4 mb-5`}>
        <View style={tw`flex-row items-center mb-2`}>
          <ShieldCheck size={16} color={membershipColors.amber} />
          <Text style={tw`text-xs font-black text-amber-800 ml-2`}>Informational report</Text>
        </View>
        <Text style={tw`text-xs text-amber-700 leading-5`}>{report.disclaimer}</Text>
      </View>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={tw`flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3`}>
      <Text style={tw`text-[9px] font-black tracking-widest text-slate-400 mb-1`}>{label}</Text>
      <Text style={tw`text-xs font-black text-slate-900`}>{value}</Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={tw`flex-row items-center justify-between border-b border-slate-100 py-3`}>
      <Text style={tw`text-sm text-slate-700 flex-1 pr-3`}>{label}</Text>
      <Text style={[tw`text-sm font-black text-slate-900`, { fontVariant: ['tabular-nums'] }]}>{value}</Text>
    </View>
  );
}
