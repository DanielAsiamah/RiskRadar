import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import tw from 'twrnc';
import { apiRequest } from '../api/client';

type Purpose = 'marketplace' | 'travel' | 'holiday' | 'date' | 'work' | 'other';

interface SafetySessionRecord {
  id: string;
  destination: string;
  purpose: Purpose;
  meetingContact?: string;
  trustedEmail?: string;
  expectedEndAt: string;
  notes?: string;
  shareUrl: string;
  status: 'active' | 'checked-in' | string;
  alertState: 'pending' | 'cancelled' | string;
}

interface SafetySessionProps {
  onBack: () => void;
}

const purposeOptions: Purpose[] = ['marketplace', 'travel', 'holiday', 'date', 'work', 'other'];

function defaultExpectedEndAt() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  return date.toISOString().slice(0, 16);
}

function toIsoDateTime(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
}

export default function SafetySession({ onBack }: SafetySessionProps) {
  const [destination, setDestination] = useState('');
  const [purpose, setPurpose] = useState<Purpose>('marketplace');
  const [meetingContact, setMeetingContact] = useState('');
  const [trustedEmail, setTrustedEmail] = useState('');
  const [expectedEndAt, setExpectedEndAt] = useState(defaultExpectedEndAt());
  const [notes, setNotes] = useState('');
  const [session, setSession] = useState<SafetySessionRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canCreate = useMemo(
    () => Boolean(destination.trim() && trustedEmail.trim() && expectedEndAt.trim()),
    [destination, trustedEmail, expectedEndAt],
  );

  const createSession = async () => {
    if (!canCreate || busy) return;
    setBusy(true);
    setMessage(null);

    try {
      const created = await apiRequest<SafetySessionRecord>('/api/safety-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination,
          purpose,
          meetingContact,
          trustedEmail,
          expectedEndAt: toIsoDateTime(expectedEndAt),
          notes,
        }),
      });
      setSession(created);
      setMessage('Safety Session created. Share the link with someone you trust before you go.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create Safety Session.');
    } finally {
      setBusy(false);
    }
  };

  const checkIn = async () => {
    if (!session || busy) return;
    setBusy(true);
    setMessage(null);

    try {
      const updated = await apiRequest<SafetySessionRecord>('/api/safety-sessions/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: session.id }),
      });
      setSession(updated);
      setMessage('Checked in. Your pending alert state has been cancelled.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to check in right now.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={tw`flex-1 bg-white`} contentContainerStyle={tw`px-5 pt-8 pb-12`}>
      <View style={tw`w-full max-w-md self-center`}>
        <Text style={tw`text-[10px] font-bold tracking-widest text-indigo-500 mb-3`}>PRO SAFETY SESSION</Text>
        <Text style={tw`text-4xl font-black tracking-tight text-slate-950 mb-3`}>Set up before you meet or travel.</Text>
        <Text style={tw`text-base text-slate-500 leading-6 mb-6`}>
          Create a simple plan for places like holidays, dates, work visits, or Facebook Marketplace meetups. Share it with someone you trust.
        </Text>

        <Field label="Destination or postcode" value={destination} onChangeText={setDestination} placeholder="SW1A 1AA or place name" />

        <Text style={tw`text-[10px] font-bold tracking-widest text-slate-400 mb-2`}>PURPOSE</Text>
        <View style={tw`flex-row flex-wrap gap-2 mb-4`}>
          {purposeOptions.map((option) => (
            <Pressable
              key={option}
              onPress={() => setPurpose(option)}
              accessibilityRole="button"
              style={({ pressed }) => [
                tw`px-4 py-3 rounded-full border`,
                purpose === option ? tw`bg-indigo-600 border-indigo-600` : tw`bg-white border-slate-200`,
                pressed && tw`opacity-80`,
              ]}
            >
              <Text style={purpose === option ? tw`text-white font-black capitalize` : tw`text-slate-600 font-black capitalize`}>{option}</Text>
            </Pressable>
          ))}
        </View>

        <Field label="Who are you meeting? optional" value={meetingContact} onChangeText={setMeetingContact} placeholder="Seller name, date, company..." />
        <Field label="Trusted contact email" value={trustedEmail} onChangeText={setTrustedEmail} placeholder="friend@example.com" keyboardType="email-address" />
        <Field label="Expected end time" value={expectedEndAt} onChangeText={setExpectedEndAt} placeholder="2026-08-02T18:30" />
        <Field label="Notes to share" value={notes} onChangeText={setNotes} placeholder="Meet outside a busy public place." multiline />

        {message ? <Text selectable style={tw`text-sm font-bold text-indigo-700 mb-4`}>{message}</Text> : null}

        <Pressable
          onPress={createSession}
          disabled={!canCreate || busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canCreate || busy }}
          style={({ pressed }) => [
            tw`h-16 rounded-2xl items-center justify-center mb-3`,
            canCreate && !busy ? tw`bg-indigo-600` : tw`bg-indigo-300`,
            pressed && canCreate && !busy && tw`opacity-80`,
          ]}
        >
          <Text style={tw`text-white text-lg font-black`}>{busy ? 'Working...' : 'Create Safety Session'}</Text>
        </Pressable>

        {session ? (
          <View style={tw`rounded-3xl border border-emerald-100 bg-emerald-50 p-5 mb-5`}>
            <Text style={tw`text-[10px] font-bold tracking-widest text-emerald-700 mb-2`}>ACTIVE SESSION</Text>
            <Text style={tw`text-slate-950 font-black text-lg mb-1`}>{session.destination}</Text>
            <Text style={tw`text-slate-600 mb-2`}>Status: {session.status} · Alert: {session.alertState}</Text>
            <Text selectable style={tw`text-indigo-700 font-bold leading-6 mb-4`}>{session.shareUrl}</Text>
            <Pressable
              onPress={checkIn}
              disabled={busy || session.status === 'checked-in'}
              accessibilityRole="button"
              style={({ pressed }) => [
                tw`h-14 rounded-2xl items-center justify-center`,
                session.status === 'checked-in' ? tw`bg-slate-300` : tw`bg-emerald-600`,
                pressed && session.status !== 'checked-in' && tw`opacity-80`,
              ]}
            >
              <Text style={tw`text-white font-black`}>{session.status === 'checked-in' ? 'Checked in' : 'I am safe — check in'}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={tw`rounded-2xl border border-amber-100 bg-amber-50 p-4 mb-5`}>
          <Text style={tw`text-amber-900 font-black mb-2`}>Important safety note</Text>
          <Text style={tw`text-amber-900 leading-6`}>
            RiskRadar does not call emergency services, verify people or venues, or provide live tracking in this version. In immediate danger, call 999.
          </Text>
        </View>

        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          style={({ pressed }) => [tw`h-14 rounded-2xl border border-slate-200 items-center justify-center`, pressed && tw`bg-slate-50`]}
        >
          <Text style={tw`text-slate-700 font-black`}>Back</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'email-address';
  multiline?: boolean;
}) {
  return (
    <View style={tw`mb-4`}>
      <Text style={tw`text-[10px] font-bold tracking-widest text-slate-400 mb-2 uppercase`}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        autoCorrect={keyboardType !== 'email-address'}
        multiline={multiline}
        style={[
          tw`rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-900`,
          multiline ? tw`min-h-24 py-4` : tw`h-14`,
        ]}
      />
    </View>
  );
}
