import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { ArrowRight, Plus, X } from 'lucide-react-native';
import tw from 'twrnc';

import { membershipStyles } from './membershipStyles';

export interface WatchPlaceFormProps {
  initialLabel?: string;
  initialPostcode?: string;
  busy: boolean;
  onSubmit(input: { label: string; postcode: string }): Promise<void>;
  onCancel(): void;
}

export default function WatchPlaceForm({
  initialLabel = '',
  initialPostcode = '',
  busy,
  onSubmit,
  onCancel,
}: WatchPlaceFormProps) {
  const [label, setLabel] = useState(initialLabel);
  const [postcode, setPostcode] = useState(initialPostcode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLabel(initialLabel);
  }, [initialLabel]);

  useEffect(() => {
    setPostcode(initialPostcode);
  }, [initialPostcode]);

  const submit = async () => {
    const trimmedLabel = label.trim();
    const trimmedPostcode = postcode.trim().toUpperCase();

    if (!trimmedLabel || trimmedLabel.length > 40) {
      setError('Add a short label between 1 and 40 characters.');
      return;
    }

    if (!trimmedPostcode) {
      setError('Enter a postcode to watch.');
      return;
    }

    setError(null);
    try {
      await onSubmit({
        label: trimmedLabel,
        postcode: trimmedPostcode,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save this watched place right now.');
    }
  };

  return (
    <View style={[membershipStyles.card, tw`mb-5 border-dashed border-indigo-200 bg-white`]}>
      <View style={tw`flex-row items-center justify-between mb-4`}>
        <View>
          <Text style={tw`text-[10px] font-black tracking-widest text-indigo-600 mb-1`}>WATCH A PLACE</Text>
          <Text style={tw`text-lg font-black text-slate-950`}>Add a postcode to your dashboard</Text>
        </View>
        <Pressable onPress={onCancel} disabled={busy} style={({ pressed }) => [tw`w-10 h-10 rounded-full bg-slate-100 items-center justify-center`, pressed && tw`opacity-70`, busy && tw`opacity-50`]}>
          <X size={16} color={tw.color('slate-500')} />
        </Pressable>
      </View>

      <View style={tw`mb-4`}>
        <Text style={tw`text-[10px] font-black tracking-widest text-slate-400 mb-2`}>LABEL</Text>
        <TextInput
          value={label}
          onChangeText={setLabel}
          editable={!busy}
          placeholder="Home, Work, Family..."
          style={tw`h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-slate-900`}
        />
      </View>

      <View style={tw`mb-4`}>
        <Text style={tw`text-[10px] font-black tracking-widest text-slate-400 mb-2`}>POSTCODE</Text>
        <TextInput
          value={postcode}
          onChangeText={setPostcode}
          editable={!busy}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="SE10 8EP"
          style={tw`h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-slate-900 uppercase`}
        />
      </View>

      {error ? (
        <View style={tw`rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 mb-4`}>
          <Text selectable style={tw`text-sm font-bold text-rose-700`}>{error}</Text>
        </View>
      ) : null}

      <View style={tw`flex-row gap-3`}>
        <Pressable
          onPress={() => void submit()}
          disabled={busy}
          style={({ pressed }) => [membershipStyles.primaryButton, tw`flex-1`, pressed && tw`opacity-80`, busy && tw`opacity-60`]}
        >
          {busy ? <ActivityIndicator color="white" /> : <Plus size={18} color="white" />}
          <Text style={tw`text-white font-black ml-2`}>{busy ? 'Saving...' : 'Save watched place'}</Text>
        </Pressable>
        <Pressable
          onPress={onCancel}
          disabled={busy}
          style={({ pressed }) => [membershipStyles.secondaryButton, tw`px-5`, pressed && tw`bg-slate-50`, busy && tw`opacity-50`]}
        >
          <ArrowRight size={16} color={tw.color('slate-500')} />
        </Pressable>
      </View>
    </View>
  );
}
