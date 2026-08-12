import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Check, Pencil, Trash2 } from 'lucide-react-native';
import tw from 'twrnc';

import type { DashboardPlace } from '../membership/dashboard-types';
import { membershipColors } from './membershipStyles';

export interface WatchedPlaceCardProps {
  place: DashboardPlace;
  selected: boolean;
  onSelect(): void;
  onRename(id: string, label: string): Promise<void>;
  onRemove(id: string): Promise<void>;
  busy: boolean;
}

function formatMonth(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return 'Awaiting data';
  }

  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function statusColor(direction?: string) {
  if (direction === 'rising') return '#e11d48';
  if (direction === 'cooling') return '#059669';
  return '#64748b';
}

export default function WatchedPlaceCard({
  place,
  selected,
  onSelect,
  onRename,
  onRemove,
  busy,
}: WatchedPlaceCardProps) {
  const [editing, setEditing] = useState(false);
  const [labelDraft, setLabelDraft] = useState(place.label);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const direction = place.changeSummary?.direction ?? 'stable';
  const accentColor = useMemo(() => statusColor(direction), [direction]);

  const saveRename = async () => {
    const trimmed = labelDraft.trim();
    if (!trimmed || trimmed.length > 40) {
      setLocalError('Use a label between 1 and 40 characters.');
      return;
    }

    setLocalError(null);
    try {
      await onRename(place.id, trimmed);
      setEditing(false);
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : 'Unable to rename this watched place right now.');
    }
  };

  const remove = async () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }

    setLocalError(null);
    try {
      await onRemove(place.id);
      setConfirmRemove(false);
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : 'Unable to remove this watched place right now.');
    }
  };

  return (
    <View style={tw`rounded-3xl border ${selected ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 bg-white'} p-5 mb-4`}>
      <View style={tw`flex-row items-start justify-between mb-4`}>
        <View style={tw`flex-1 pr-4`}>
          {editing ? (
            <TextInput
              value={labelDraft}
              onChangeText={setLabelDraft}
              editable={!busy}
              style={tw`h-11 rounded-2xl border border-slate-200 bg-white px-3 text-slate-900 font-black mb-2`}
            />
          ) : (
            <Text style={tw`text-lg font-black text-slate-950 mb-1`}>{place.label}</Text>
          )}
          <Text selectable style={tw`text-xs font-bold text-slate-500`}>{place.postcode}</Text>
          <Text style={tw`text-[10px] font-bold tracking-widest text-slate-400 mt-2`}>DATA MONTH {formatMonth(place.lastCheckedMonth)}</Text>
        </View>

        <View style={tw`items-end`}>
          {place.available && place.snapshot ? (
            <>
              <Text style={[tw`text-3xl font-black`, { color: selected ? membershipColors.indigo : accentColor, fontVariant: ['tabular-nums'] }]}>{place.snapshot.score}</Text>
              <Text style={tw`text-[10px] font-black text-slate-400`}>RISK / 100</Text>
            </>
          ) : (
            <Text style={tw`text-xs font-black text-slate-400`}>Unavailable</Text>
          )}
        </View>
      </View>

      {place.available && place.snapshot && place.changeSummary ? (
        <>
          <View style={tw`flex-row gap-3 mb-4`}>
            <MetricPill label="Incidents" value={String(place.snapshot.totalIncidents)} />
            <MetricPill label="Trend" value={place.changeSummary.direction.toUpperCase()} color={accentColor} />
          </View>
          <Text style={tw`text-xs leading-5 text-slate-600 mb-3`}>{place.changeSummary.summary}</Text>
        </>
      ) : (
        <Text style={tw`text-xs leading-5 text-slate-500 mb-3`}>{place.error || 'We could not build a fresh dashboard view for this place yet.'}</Text>
      )}

      {localError ? <Text selectable style={tw`text-xs font-bold text-rose-600 mb-3`}>{localError}</Text> : null}

      <View style={tw`flex-row flex-wrap gap-2`}>
        <Pressable
          onPress={editing ? () => void saveRename() : onSelect}
          disabled={busy}
          style={({ pressed }) => [tw`px-4 py-3 rounded-full bg-slate-900 flex-row items-center`, pressed && tw`opacity-80`, busy && tw`opacity-50`]}
        >
          {busy && selected ? <ActivityIndicator color="white" size="small" /> : editing ? <Check size={15} color="white" /> : null}
          <Text style={tw`text-[11px] font-black text-white ${busy && selected ? 'ml-2' : editing ? 'ml-2' : ''}`}>
            {editing ? 'Save label' : selected ? 'Selected' : 'View details'}
          </Text>
        </Pressable>

        <Pressable
          onPress={editing ? () => setEditing(false) : () => {
            setLabelDraft(place.label);
            setEditing(true);
            setConfirmRemove(false);
          }}
          disabled={busy}
          style={({ pressed }) => [tw`px-4 py-3 rounded-full border border-slate-200 bg-white flex-row items-center`, pressed && tw`bg-slate-50`, busy && tw`opacity-50`]}
        >
          <Pencil size={14} color={tw.color('slate-600')} />
          <Text style={tw`text-[11px] font-black text-slate-700 ml-2`}>{editing ? 'Cancel rename' : 'Rename'}</Text>
        </Pressable>

        <Pressable
          onPress={() => void remove()}
          disabled={busy}
          style={({ pressed }) => [tw`px-4 py-3 rounded-full border border-rose-200 bg-rose-50 flex-row items-center`, pressed && tw`opacity-80`, busy && tw`opacity-50`]}
        >
          <Trash2 size={14} color="#e11d48" />
          <Text style={tw`text-[11px] font-black text-rose-700 ml-2`}>{confirmRemove ? 'Confirm remove' : 'Remove'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function MetricPill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={tw`flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3`}>
      <Text style={tw`text-[10px] font-black tracking-widest text-slate-400 mb-1`}>{label}</Text>
      <Text style={[tw`text-sm font-black`, { color: color || membershipColors.navy }]}>{value}</Text>
    </View>
  );
}
