import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { ArrowLeft, CloudOff, RotateCw } from 'lucide-react-native';
import tw from 'twrnc';

import { membershipColors, membershipStyles } from './membershipStyles';

export interface MembershipUnavailableProps {
  onBack(): void;
  onRetry(): Promise<void>;
  onSignOut?(): Promise<void>;
  footer?: React.ReactNode;
}

export default function MembershipUnavailable({ onBack, onRetry, onSignOut, footer }: MembershipUnavailableProps) {
  const [retrying, setRetrying] = React.useState(false);

  const retry = async () => {
    try {
      setRetrying(true);
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <View style={membershipStyles.screen}>
      <ScrollView contentContainerStyle={membershipStyles.scrollContent} contentInsetAdjustmentBehavior="automatic">
        <View style={membershipStyles.content}>
          <Pressable onPress={onBack} style={({ pressed }) => [tw`self-start flex-row items-center px-4 py-3 rounded-full bg-slate-100 mb-10`, pressed && tw`opacity-70`]}>
            <ArrowLeft size={17} color={membershipColors.slate} />
            <Text style={tw`text-sm font-black text-slate-700 ml-2`}>Back to RiskRadar</Text>
          </Pressable>

          <View style={[membershipStyles.card, membershipStyles.elevatedCard, tw`items-center py-10`]}>
            <View style={tw`w-16 h-16 rounded-3xl bg-slate-100 items-center justify-center mb-6`}>
              <CloudOff size={29} color={membershipColors.slate} />
            </View>
            <Text style={tw`text-2xl font-black text-slate-950 text-center mb-3`}>Membership is temporarily unavailable</Text>
            <Text style={tw`text-sm text-slate-500 text-center leading-6 mb-7`}>
              RiskRadar could not verify account and billing services. Public postcode search remains available, and no Premium status has been guessed on this device.
            </Text>
            <Pressable
              onPress={() => void retry()}
              disabled={retrying}
              style={({ pressed }) => [membershipStyles.primaryButton, tw`self-stretch`, pressed && tw`opacity-80`, retrying && tw`opacity-60`]}
            >
              {retrying ? <ActivityIndicator color="white" /> : <RotateCw size={18} color="white" />}
              <Text style={tw`text-white font-black ml-2`}>{retrying ? 'Checking...' : 'Try again'}</Text>
            </Pressable>
            {onSignOut ? (
              <Pressable onPress={() => void onSignOut()} hitSlop={8} style={tw`py-5`}>
                <Text style={tw`text-sm font-black text-slate-500`}>Sign out</Text>
              </Pressable>
            ) : null}
          </View>
          {footer}
        </View>
      </ScrollView>
    </View>
  );
}
