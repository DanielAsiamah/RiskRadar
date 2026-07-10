import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import { Globe, FileText, ShieldAlert, Activity } from 'lucide-react-native';
import tw from 'twrnc';

interface ScannerProps {
  postcode: string;
  duration?: number;
}

const loadingMessages = [
  "Analyzing target area",
  "Checking local crime data",
  "Reviewing transit and area context",
  "Calculating risk index",
  "Finalising report"
];

export default function Scanner({ postcode, duration = 10000 }: ScannerProps) {
  const [step, setStep] = useState(0);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [dots, setDots] = useState('');
  const orbitValue = useRef(new Animated.Value(0)).current;

  // Premium motion: keep the ring mostly still and let the data markers orbit.
  useEffect(() => {
    Animated.loop(
      Animated.timing(orbitValue, {
        toValue: 1,
        duration: 5200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const orbit = orbitValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  const counterOrbit = orbitValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg']
  });

  // Message sequence
  useEffect(() => {
    const interval = setInterval(() => {
      setStep((prev) => Math.min(prev + 1, loadingMessages.length - 1));
    }, 1100);
    return () => clearInterval(interval);
  }, []);

  // Searching dots effect
  useEffect(() => {
    const dotsInterval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 400);
    return () => clearInterval(dotsInterval);
  }, []);

  // Animate progress
  useEffect(() => {
    let currentProgress = 0;
    let isRunning = true;
    const startTime = Date.now();

    const tick = () => {
      if (!isRunning) return;

      const elapsed = Date.now() - startTime;
      const targetBase = Math.min(100, (elapsed / duration) * 100);

      let actualTarget = targetBase;
      if (targetBase > 72 && targetBase < 90) {
        actualTarget = 72 + (targetBase - 72) * 0.45;
      }

      if (currentProgress < actualTarget) {
        currentProgress += Math.max(0.35, (actualTarget - currentProgress) * 0.18);
      }

      if (elapsed >= duration) {
        currentProgress = Math.max(currentProgress, 100);
      }

      setDisplayProgress(Math.min(100, Math.floor(currentProgress)));

      if (currentProgress < 100) {
        setTimeout(tick, 40);
      }
    };

    tick();
    return () => { isRunning = false; };
  }, [duration]);

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

        {/* Orbiting Icons Container */}
        <Animated.View style={[tw`absolute w-64 h-64`, { transform: [{ rotate: orbit }] }]}>
          <Animated.View style={[tw`absolute -top-4 left-1/2 -ml-5 bg-white border border-slate-100 p-2 rounded-full shadow-sm z-10`, { transform: [{ rotate: counterOrbit }] }]}>
            <FileText size={20} color={tw.color('emerald-500')} />
          </Animated.View>
          <Animated.View style={[tw`absolute -bottom-4 left-1/2 -ml-5 bg-white border border-slate-100 p-2 rounded-full shadow-sm z-10`, { transform: [{ rotate: counterOrbit }] }]}>
            <Activity size={20} color={tw.color('amber-500')} />
          </Animated.View>
          <Animated.View style={[tw`absolute -left-4 top-1/2 -mt-5 bg-white border border-slate-100 p-2 rounded-full shadow-sm z-10`, { transform: [{ rotate: counterOrbit }] }]}>
            <Globe size={20} color={tw.color('sky-500')} />
          </Animated.View>
          <Animated.View style={[tw`absolute -right-4 top-1/2 -mt-5 bg-white border border-slate-100 p-2 rounded-full shadow-sm z-10`, { transform: [{ rotate: counterOrbit }] }]}>
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
