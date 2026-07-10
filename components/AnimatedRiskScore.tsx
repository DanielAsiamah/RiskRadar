import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import tw from 'twrnc';
import Svg, { Circle } from 'react-native-svg';

interface Props {
  score: number;
  maxScore?: number;
  label?: string;
  loading?: boolean;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function AnimatedRiskScore({ score, maxScore = 100, label = "OVERALL RISK INDEX", loading = false }: Props) {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    if (!loading) {
      animatedValue.setValue(0);
      
      const listenerId = animatedValue.addListener((state) => {
        setDisplayScore(Math.floor(state.value));
      });

      Animated.timing(animatedValue, {
        toValue: score,
        duration: 1800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();

      return () => {
        animatedValue.removeListener(listenerId);
      };
    } else {
      setDisplayScore(0);
      animatedValue.setValue(0);
    }
  }, [score, loading]);

  const size = 160;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const strokeDashoffset = animatedValue.interpolate({
    inputRange: [0, maxScore],
    outputRange: [circumference, 0],
    extrapolate: 'clamp'
  });

  return (
    <View style={tw`relative items-center justify-center mb-2`}>
      <View style={tw`w-[160px] h-[160px]`}>
        <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
          {/* Background Track */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={tw.color('slate-100')}
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Animated Progress Ring */}
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={tw.color('indigo-500')}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
          />
        </Svg>
      </View>
      <View style={tw`absolute inset-0 flex flex-col items-center justify-center`}>
        <Text style={tw`text-5xl font-black text-slate-900`}>{displayScore}</Text>
        <Text style={tw`text-xs font-bold text-slate-400 mt-1`}>/ {maxScore}</Text>
      </View>
    </View>
  );
}
