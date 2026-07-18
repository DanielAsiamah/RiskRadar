import React, { useEffect, useState } from 'react';
import {
  BackHandler,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  FileCheck2,
  MapPin,
  ShieldCheck,
} from 'lucide-react-native';
import tw from 'twrnc';
import { apiRequest } from '../api/client';
import { CrimeEvidenceDetail, EvidenceReference } from '../types';

interface EvidenceDetailProps {
  reference: EvidenceReference;
  onBack: () => void;
}

export default function EvidenceDetail({ reference, onBack }: EvidenceDetailProps) {
  const [detail, setDetail] = useState<CrimeEvidenceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setDetail(null);
    setError(null);

    apiRequest<CrimeEvidenceDetail>(
      `/api/crime-evidence/${encodeURIComponent(reference.persistentId)}`,
      {},
      20_000,
    )
      .then((response) => {
        if (active) setDetail(response);
      })
      .catch((requestError: Error) => {
        if (active) setError(requestError.message || 'This official record is temporarily unavailable.');
      });

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [onBack, reference.persistentId]);

  const openOfficialSource = () => {
    const sourceUrl = detail?.officialSourceUrl || reference.officialCaseUrl;
    if (Platform.OS === 'web' && typeof globalThis.open === 'function') {
      globalThis.open(sourceUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    void Linking.openURL(sourceUrl);
  };

  return (
    <View style={tw`flex-1 bg-white`}>
      <ScrollView contentContainerStyle={tw`px-4 pt-4 pb-12`} contentInsetAdjustmentBehavior="automatic">
        <View style={tw`w-full max-w-2xl self-center`}>
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            style={({ pressed }) => [tw`self-start flex-row items-center gap-2 px-4 py-3 rounded-full bg-slate-100 mb-7`, pressed && tw`opacity-70`]}
          >
            <ArrowLeft size={17} color="#334155" />
            <Text style={tw`text-sm font-black text-slate-700`}>Back to report</Text>
          </Pressable>

          <Text style={tw`text-[10px] font-bold tracking-widest text-indigo-600 mb-2`}>OFFICIAL EVIDENCE</Text>
          <Text style={tw`text-3xl font-black tracking-tight text-slate-950 mb-2`}>Police.uk record</Text>
          <Text style={tw`text-sm text-slate-500 leading-5 mb-7`}>
            A readable view of the anonymised source record. RiskRadar does not add names, exact addresses, or offence details that were not published.
          </Text>

          {!detail && !error ? (
            <View style={tw`rounded-3xl border border-indigo-100 bg-indigo-50 px-6 py-10 items-center`}>
              <View style={tw`w-14 h-14 rounded-full bg-white items-center justify-center mb-4`}>
                <FileCheck2 size={25} color="#4f46e5" />
              </View>
              <Text style={tw`text-base font-black text-slate-900`}>Verifying official record</Text>
              <Text style={tw`text-xs text-slate-500 mt-2 text-center`}>Fetching the published Police.uk history securely through RiskRadar.</Text>
            </View>
          ) : null}

          {error ? (
            <View style={tw`rounded-3xl border border-rose-200 bg-rose-50 p-6`}>
              <Text style={tw`text-base font-black text-rose-800 mb-2`}>Record temporarily unavailable</Text>
              <Text style={tw`text-sm text-rose-700 leading-5 mb-5`}>{error}</Text>
              <Pressable onPress={onBack} style={tw`h-12 rounded-xl bg-slate-900 items-center justify-center`}>
                <Text style={tw`text-white font-black`}>Back to report</Text>
              </Pressable>
            </View>
          ) : null}

          {detail ? (
            <>
              <View style={tw`rounded-3xl border border-slate-200 bg-white p-6 shadow-sm mb-5`}>
                <View style={tw`flex-row items-center justify-between mb-6`}>
                  <View style={tw`px-3 py-2 rounded-full bg-indigo-50`}>
                    <Text style={tw`text-[10px] font-black tracking-wider text-indigo-700 uppercase`}>{detail.categoryLabel}</Text>
                  </View>
                  <ShieldCheck size={22} color="#059669" />
                </View>

                <InfoRow icon={<MapPin size={18} color="#4f46e5" />} label="Approximate mapped road" value={detail.locationStreet} />
                <InfoRow icon={<CalendarDays size={18} color="#d97706" />} label="Recorded month" value={detail.monthDisplay} />
                <Text style={tw`text-xs text-slate-500 leading-5 mt-2`}>{detail.disclosure}</Text>
              </View>

              <View style={tw`rounded-3xl border border-slate-200 bg-slate-50 p-6 mb-5`}>
                <Text style={tw`text-[10px] font-bold tracking-widest text-slate-400 mb-5`}>PUBLISHED OUTCOME TIMELINE</Text>
                {detail.outcomes.length ? detail.outcomes.map((outcome, index) => (
                  <View key={`${outcome.code}-${outcome.date}-${index}`} style={tw`flex-row items-start mb-5`}>
                    <View style={tw`items-center mr-4`}>
                      <View style={tw`w-3 h-3 rounded-full bg-indigo-600`} />
                      {index < detail.outcomes.length - 1 ? <View style={tw`w-px h-10 bg-indigo-200`} /> : null}
                    </View>
                    <View style={tw`flex-1 -mt-1`}>
                      <Text style={tw`text-sm font-black text-slate-900`}>{outcome.status}</Text>
                      <Text style={tw`text-xs text-slate-500 mt-1`}>{outcome.dateDisplay}</Text>
                    </View>
                  </View>
                )) : (
                  <Text style={tw`text-sm text-slate-500`}>No outcome history has been published for this record.</Text>
                )}
              </View>

              <Pressable
                onPress={openOfficialSource}
                accessibilityRole="link"
                style={({ pressed }) => [tw`h-14 rounded-2xl border border-slate-200 bg-white flex-row items-center justify-center gap-2 mb-3`, pressed && tw`bg-slate-50`]}
              >
                <ExternalLink size={17} color="#4f46e5" />
                <Text style={tw`text-sm font-black text-indigo-600`}>View raw Police.uk source</Text>
              </Pressable>

              <Pressable onPress={onBack} style={tw`h-14 rounded-2xl bg-slate-900 items-center justify-center`}>
                <Text style={tw`text-white font-black`}>Back to report</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={tw`flex-row items-start mb-5`}>
      <View style={tw`w-10 h-10 rounded-xl bg-slate-50 items-center justify-center mr-3`}>{icon}</View>
      <View style={tw`flex-1`}>
        <Text style={tw`text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-1`}>{label}</Text>
        <Text style={tw`text-sm font-black text-slate-900`}>{value}</Text>
      </View>
    </View>
  );
}
