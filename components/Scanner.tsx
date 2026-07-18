import React, { useEffect, useState, useRef } from 'react';
import { AccessibilityInfo, View, Text, Animated, Easing } from 'react-native';
import { Globe, FileText, ShieldAlert, Activity } from 'lucide-react-native';
import tw from 'twrnc';

interface ScannerProps {
  postcode: string;
  duration?: number;
  ready?: boolean;
}

const loadingMessages = [
  "Analyzing target area",
  "Checking local crime data",
  "Reviewing transit and area context",
  "Calculating risk index",
  "Finalising report"
];

export default function Scanner({ postcode, duration = 1800, ready = false }: ScannerProps) {
  const [step, setStep] = useState(0);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [dots, setDots] = useState('');
  const [reduceMotion, setReduceMotion] = useState(false);
  const orbitValue = useRef(new Animated.Value(0)).current;
  const pulseValues = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const sweepValue = useRef(new Animated.Value(0)).current;
  const lockValue = useRef(new Animated.Value(0)).current;
  const progressValue = useRef(0);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  // Premium motion: keep the ring mostly still and let the data markers orbit.
  useEffect(() => {
    if (reduceMotion) return;

    const orbitAnimation = Animated.loop(
      Animated.timing(orbitValue, {
        toValue: 1,
        duration: 4200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const sweepAnimation = Animated.loop(
      Animated.timing(sweepValue, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.stagger(140, pulseValues.map((value) => Animated.sequence([
          Animated.timing(value, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(value, { toValue: 0, duration: 260, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]))),
        Animated.delay(500),
      ])
    );

    orbitAnimation.start();
    sweepAnimation.start();
    pulseAnimation.start();
    return () => {
      orbitAnimation.stop();
      sweepAnimation.stop();
      pulseAnimation.stop();
    };
  }, [reduceMotion]);

  useEffect(() => {
    if (!ready || reduceMotion) return;
    lockValue.setValue(0);
    Animated.timing(lockValue, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [ready, reduceMotion]);

  const orbit = orbitValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  const counterOrbit = orbitValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg']
  });

  const sweep = sweepValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const lockScale = lockValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.82, 1.22],
  });

  const lockOpacity = lockValue.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0, 0.65, 0],
  });

  const markerStyle = (index: number) => ({
    transform: [
      { rotate: counterOrbit },
      {
        scale: pulseValues[index].interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.18],
        }),
      },
    ],
  });

  // Message sequence
  useEffect(() => {
    const interval = setInterval(() => {
      setStep((prev) => Math.min(prev + 1, loadingMessages.length - 1));
    }, Math.max(420, duration / loadingMessages.length));
    return () => clearInterval(interval);
  }, []);

  // Searching dots effect
  useEffect(() => {
    const dotsInterval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 400);
    return () => clearInterval(dotsInterval);
  }, []);

  // Progress waits below completion until the API response is actually ready.
  useEffect(() => {
    let isRunning = true;
    const startTime = Date.now();

    const tick = () => {
      if (!isRunning) return;

      const elapsed = Date.now() - startTime;
      const ratio = Math.min(1, elapsed / duration);
      const easedRatio = 1 - Math.pow(1 - ratio, 3);
      const target = ready ? 100 : 8 + easedRatio * 84;
      progressValue.current += Math.max(0.25, (target - progressValue.current) * (ready ? 0.32 : 0.16));
      progressValue.current = Math.min(ready ? 100 : 92, progressValue.current);
      setDisplayProgress(Math.floor(progressValue.current));
      setTimeout(tick, 40);
    };

    tick();
    return () => { isRunning = false; };
  }, [duration, ready]);

  return (
    <View style={tw`flex-1 items-center justify-center p-6 bg-white`}>
      <View style={tw`items-center mb-16`}>
        <Text style={tw`text-lg font-bold text-slate-400 uppercase tracking-widest mb-2`}>
          Target Locked
        </Text>
        <Text style={tw`text-4xl font-black text-slate-900`}>
          {postcode}
        </Text>
      </View>

      <View style={tw`relative w-64 h-64 flex items-center justify-center`}>
        <View
          style={[tw`absolute w-64 h-64 rounded-full border-slate-100`, { borderWidth: 10 }]}
        />
        <View
          style={tw`absolute w-58 h-58 rounded-full border border-slate-100 bg-white`}
        />
        <Animated.View
          style={[
            tw`absolute w-62 h-62 rounded-full border-2 border-indigo-100`,
            { borderTopColor: '#4f46e5', opacity: 0.55, transform: [{ rotate: sweep }] },
          ]}
        />
        <Animated.View
          style={[
            tw`absolute w-58 h-58 rounded-full border-2 border-indigo-400`,
            { opacity: lockOpacity, transform: [{ scale: lockScale }] },
          ]}
        />

        {/* Orbiting Icons Container */}
        <Animated.View style={[tw`absolute w-64 h-64`, { transform: [{ rotate: orbit }] }]}>
          <Animated.View style={[tw`absolute -top-4 left-1/2 -ml-5 bg-white border border-slate-100 p-2 rounded-full shadow-sm z-10`, markerStyle(0)]}>
            <FileText size={20} color={tw.color('emerald-500')} />
          </Animated.View>
          <Animated.View style={[tw`absolute -bottom-4 left-1/2 -ml-5 bg-white border border-slate-100 p-2 rounded-full shadow-sm z-10`, markerStyle(1)]}>
            <Activity size={20} color={tw.color('amber-500')} />
          </Animated.View>
          <Animated.View style={[tw`absolute -left-4 top-1/2 -mt-5 bg-white border border-slate-100 p-2 rounded-full shadow-sm z-10`, markerStyle(2)]}>
            <Globe size={20} color={tw.color('sky-500')} />
          </Animated.View>
          <Animated.View style={[tw`absolute -right-4 top-1/2 -mt-5 bg-white border border-slate-100 p-2 rounded-full shadow-sm z-10`, markerStyle(3)]}>
            <ShieldAlert size={20} color={tw.color('rose-500')} />
          </Animated.View>
        </Animated.View>

        {/* Center Text */}
        <View style={tw`items-center justify-center`}>
          <Text style={tw`text-5xl font-black text-indigo-600`}>
            {displayProgress}%
          </Text>
        </View>
      </View>

      <View style={tw`mt-16 h-12 w-full flex-row justify-center`}>
        <Text style={tw`text-slate-500 font-bold text-center`}>
          {loadingMessages[step]}<Text style={tw`text-indigo-500 text-lg leading-none`}>{dots}</Text>
        </Text>
      </View>
    </View>
  );
}
