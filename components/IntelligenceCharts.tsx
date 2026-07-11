import React, { useState } from 'react';
import { Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { MapPin, TrendingDown, TrendingUp, Minus } from 'lucide-react-native';
import tw from 'twrnc';
import { HotspotData, TrendData } from '../types';

type SeriesKey = 'totalCrimes' | 'violentCrimes' | 'antiSocialCrimes' | 'robberyCrimes';

const seriesOptions: { key: SeriesKey; label: string; color: string }[] = [
  { key: 'totalCrimes', label: 'All', color: '#4f46e5' },
  { key: 'violentCrimes', label: 'Violent', color: '#e11d48' },
  { key: 'antiSocialCrimes', label: 'ASB', color: '#d97706' },
  { key: 'robberyCrimes', label: 'Robbery', color: '#0284c7' },
];

export function TrendChart({ trendData }: { trendData: TrendData }) {
  const [seriesKey, setSeriesKey] = useState<SeriesKey>('totalCrimes');
  const { width } = useWindowDimensions();
  const points = trendData.monthly.filter((point) => point.dataAvailable !== false);
  const option = seriesOptions.find((item) => item.key === seriesKey) ?? seriesOptions[0];
  const chartWidth = Math.min(Math.max(width - 82, 260), 560);
  const chartHeight = 180;
  const values = points.map((point) => point[seriesKey]);
  const maximum = Math.max(...values, 1);
  const coordinates = points.map((point, index) => ({
    x: points.length === 1 ? chartWidth / 2 : 18 + index * ((chartWidth - 36) / (points.length - 1)),
    y: 18 + (1 - point[seriesKey] / maximum) * 112,
  }));
  const directionIcon = trendData.direction === 'rising'
    ? <TrendingUp size={18} color="#e11d48" />
    : trendData.direction === 'cooling'
      ? <TrendingDown size={18} color="#059669" />
      : <Minus size={18} color="#64748b" />;

  return (
    <View>
      <View style={tw`flex-row items-center justify-between mb-4`}>
        <View style={tw`flex-row items-center gap-2`}>
          {directionIcon}
          <Text style={tw`text-sm font-black text-slate-900 capitalize`}>{trendData.direction}</Text>
        </View>
        <Text style={tw`text-xs font-bold ${trendData.changePercent > 0 ? 'text-rose-600' : trendData.changePercent < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
          {trendData.changePercent > 0 ? '+' : ''}{trendData.changePercent}%
        </Text>
      </View>

      <View style={tw`flex-row flex-wrap gap-2 mb-4`}>
        {seriesOptions.map((item) => (
          <TouchableOpacity
            key={item.key}
            onPress={() => setSeriesKey(item.key)}
            style={tw`px-3 py-2 rounded-full ${seriesKey === item.key ? 'bg-slate-900' : 'bg-slate-100'}`}
          >
            <Text style={tw`text-xs font-bold ${seriesKey === item.key ? 'text-white' : 'text-slate-600'}`}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {points.length > 0 ? (
        <View style={tw`items-center`}>
          <Svg width={chartWidth} height={chartHeight} accessibilityLabel={`${option.label} crime trend chart`}>
            {[0, 1, 2].map((line) => (
              <Line key={line} x1="18" x2={chartWidth - 18} y1={18 + line * 56} y2={18 + line * 56} stroke="#e2e8f0" strokeWidth="1" />
            ))}
            <Polyline points={coordinates.map(({ x, y }) => `${x},${y}`).join(' ')} fill="none" stroke={option.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            {coordinates.map(({ x, y }, index) => (
              <React.Fragment key={points[index].month}>
                <Circle cx={x} cy={y} r="5" fill="white" stroke={option.color} strokeWidth="3" />
                <SvgText x={x} y={y - 12} fill="#475569" fontSize="10" textAnchor="middle">{values[index]}</SvgText>
                <SvgText x={x} y="158" fill="#94a3b8" fontSize="9" textAnchor="middle">{points[index].monthDisplay.split(' ')[0].slice(0, 3)}</SvgText>
              </React.Fragment>
            ))}
          </Svg>
        </View>
      ) : (
        <Text style={tw`text-sm text-slate-500 py-6 text-center`}>Monthly trend data is temporarily unavailable.</Text>
      )}
      <Text style={tw`text-xs text-slate-500 leading-5 mt-2`}>{trendData.summary}</Text>
    </View>
  );
}

export function HotspotView({ hotspotData }: { hotspotData?: HotspotData }) {
  const clusters = hotspotData?.clusters ?? [];
  const maximum = Math.max(...clusters.map((cluster) => cluster.count), 1);

  return (
    <View>
      <Text style={tw`text-xs text-slate-500 leading-5 mb-5`}>
        {hotspotData?.summary ?? 'No hotspot information is available for this search.'}
      </Text>
      {clusters.map((cluster, index) => (
        <View key={`${cluster.latitude}-${cluster.longitude}`} style={tw`flex-row items-center mb-4`}>
          <View style={[tw`items-center justify-center rounded-full mr-4`, {
            width: 38 + (cluster.count / maximum) * 20,
            height: 38 + (cluster.count / maximum) * 20,
            backgroundColor: index === 0 ? '#ffe4e6' : '#eef2ff',
          }]}>
            <MapPin size={18} color={index === 0 ? '#e11d48' : '#4f46e5'} />
          </View>
          <View style={tw`flex-1`}>
            <Text style={tw`text-sm font-black text-slate-900`}>{cluster.count} incident cluster</Text>
            <Text style={tw`text-xs text-slate-500 mt-1`}>{cluster.distanceMeters}m away · {cluster.topCategoryLabel}</Text>
          </View>
        </View>
      ))}
      {!clusters.length && <Text style={tw`text-sm text-slate-500 text-center py-4`}>No concentrated clusters detected.</Text>}
    </View>
  );
}
