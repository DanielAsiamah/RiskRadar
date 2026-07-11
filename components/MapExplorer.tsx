import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, Crosshair, MapPin, Search, Trash2 } from 'lucide-react-native';
import tw from 'twrnc';
import { apiRequest } from '../api/client';
import CrimeMapCanvas from './CrimeMapCanvas';
import { CrimeMapMarker, MapCoordinate } from './map-types';

type MapMode = 'postcode' | 'point' | 'area';
type PointSearchMode = 'radius' | 'exact';

interface FilterMetadata {
  months: { month: string; monthDisplay: string }[];
  categories: { category: string; label: string }[];
  defaults: { postcodeRadiusMeters: number };
}

interface CrimeFeed {
  postcode?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
  point?: MapCoordinate & { radiusMeters?: number };
  polygon?: MapCoordinate[];
  radiusMeters?: number;
  month: string;
  totalCrimes: number;
  summary: string;
  locationStreet?: string;
  categories: { category: string; count: number }[];
  crimes: {
    category: string;
    categoryLabel: string;
    month: string;
    latitude: number;
    longitude: number;
    locationStreet: string;
    outcome: string;
  }[];
}

const UK_CENTER = { latitude: 52.6, longitude: -1.5 };
const modeLabels: Record<MapMode, string> = { postcode: 'Postcode', point: 'Click map', area: 'Draw area' };

export default function MapExplorer({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<MapMode>('postcode');
  const [pointSearchMode, setPointSearchMode] = useState<PointSearchMode>('radius');
  const [postcode, setPostcode] = useState('BR1 5NN');
  const [metadata, setMetadata] = useState<FilterMetadata | null>(null);
  const [month, setMonth] = useState('');
  const [category, setCategory] = useState('');
  const [selectedPoint, setSelectedPoint] = useState<MapCoordinate | null>(null);
  const [areaPoints, setAreaPoints] = useState<MapCoordinate[]>([]);
  const [boundaryPoints, setBoundaryPoints] = useState<MapCoordinate[]>([]);
  const [neighbourhoodName, setNeighbourhoodName] = useState('');
  const [center, setCenter] = useState<MapCoordinate>(UK_CENTER);
  const [feed, setFeed] = useState<CrimeFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<FilterMetadata>('/api/filter-metadata', {}, 20_000)
      .then((value) => {
        setMetadata(value);
        setMonth(value.months[0]?.month ?? '');
      })
      .catch((reason) => setError(reason.message));
  }, []);

  const loadBoundary = async (coordinate: MapCoordinate) => {
    try {
      const value = await fetchBoundary(coordinate);
      setBoundaryPoints(value.boundary ?? []);
      setNeighbourhoodName(value.neighbourhood?.name || value.neighbourhood?.neighbourhood || '');
    } catch {
      setBoundaryPoints([]);
      setNeighbourhoodName('');
    }
  };

  const loadFeed = async (override?: { point?: MapCoordinate; points?: MapCoordinate[]; searchMode?: PointSearchMode }) => {
    const point = override?.point ?? selectedPoint;
    const points = override?.points ?? areaPoints;
    const effectivePointSearchMode = override?.searchMode ?? pointSearchMode;
    if (mode === 'postcode' && !postcode.trim()) return setError('Enter a postcode or UK place.');
    if (mode === 'point' && !point) return setError('Tap anywhere on the map to select a point.');
    if (mode === 'area' && points.length < 3) return setError('Tap at least three map points to create an area.');

    try {
      setLoading(true);
      setError(null);
      const body = {
        mode,
        postcode: mode === 'postcode' ? postcode.trim() : undefined,
        latitude: mode === 'point' ? point?.latitude : undefined,
        longitude: mode === 'point' ? point?.longitude : undefined,
        points: mode === 'area' ? points : undefined,
        month,
        categories: category ? [category] : [],
        radiusMeters: metadata?.defaults.postcodeRadiusMeters ?? 400,
      };
      const result = mode === 'point' && effectivePointSearchMode === 'exact'
        ? await apiRequest<CrimeFeed>('/api/location-crimes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : (await apiRequest<{ mode: MapMode; result: CrimeFeed }>('/api/map-feed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })).result;
      setFeed(result);
      const nextCenter = result.latitude != null && result.longitude != null
        ? { latitude: result.latitude, longitude: result.longitude }
        : result.point ?? (result.polygon?.length ? averagePoint(result.polygon) : point);
      if (nextCenter) {
        setCenter(nextCenter);
        if (mode === 'postcode') setSelectedPoint(nextCenter);
        void loadBoundary(nextCenter);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load map incidents.');
    } finally {
      setLoading(false);
    }
  };

  const onMapPress = (coordinate: MapCoordinate) => {
    if (mode === 'point') {
      setSelectedPoint(coordinate);
      void loadFeed({ point: coordinate });
    } else if (mode === 'area') {
      setAreaPoints((current) => [...current, coordinate].slice(0, 12));
    }
  };

  const changeMode = (nextMode: MapMode) => {
    setMode(nextMode);
    setFeed(null);
    setError(null);
    setSelectedPoint(null);
    setAreaPoints([]);
    setBoundaryPoints([]);
    setNeighbourhoodName('');
  };

  const markers: CrimeMapMarker[] = (feed?.crimes ?? [])
    .filter((crime) => Number.isFinite(crime.latitude) && Number.isFinite(crime.longitude))
    .map((crime, index) => ({ ...crime, id: `${crime.latitude}-${crime.longitude}-${index}` }));

  return (
    <View style={tw`flex-1 bg-white`}>
      <ScrollView contentContainerStyle={tw`p-4 pb-14`} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
        <View style={tw`flex-row items-center gap-3 mb-5`}>
          <TouchableOpacity onPress={onBack} style={tw`w-10 h-10 bg-slate-100 rounded-full items-center justify-center`} accessibilityLabel="Back to RiskRadar">
            <ArrowLeft size={20} color={tw.color('slate-700')} />
          </TouchableOpacity>
          <View>
            <Text style={tw`text-2xl font-black text-slate-900`}>Crime Explorer</Text>
            <Text style={tw`text-xs text-slate-500`}>Live street-level UK police data</Text>
          </View>
        </View>

        <View style={tw`flex-row bg-slate-100 p-1 rounded-2xl mb-4`}>
          {(Object.keys(modeLabels) as MapMode[]).map((item) => (
            <TouchableOpacity key={item} onPress={() => changeMode(item)} style={tw`flex-1 py-3 rounded-xl ${mode === item ? 'bg-white' : ''}`}>
              <Text style={tw`text-xs font-bold text-center ${mode === item ? 'text-indigo-600' : 'text-slate-500'}`}>{modeLabels[item]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {mode === 'postcode' && (
          <View style={tw`flex-row items-center border border-slate-200 rounded-2xl px-4 h-14 mb-4`}>
            <MapPin size={18} color={tw.color('slate-400')} />
            <TextInput
              value={postcode}
              onChangeText={setPostcode}
              onSubmitEditing={() => void loadFeed()}
              returnKeyType="search"
              placeholder="Postcode or UK place"
              style={tw`flex-1 ml-3 text-slate-900 uppercase`}
              autoCapitalize="characters"
            />
            <TouchableOpacity onPress={() => void loadFeed()}><Search size={20} color={tw.color('indigo-600')} /></TouchableOpacity>
          </View>
        )}

        {mode === 'point' && (
          <View style={tw`flex-row bg-slate-100 p-1 rounded-2xl mb-4`}>
            {(['radius', 'exact'] as PointSearchMode[]).map((item) => (
              <TouchableOpacity
                key={item}
                onPress={() => {
                  setPointSearchMode(item);
                  if (selectedPoint) void loadFeed({ point: selectedPoint, searchMode: item });
                }}
                style={tw`flex-1 py-3 rounded-xl ${pointSearchMode === item ? 'bg-white' : ''}`}
              >
                <Text style={tw`text-xs font-bold text-center ${pointSearchMode === item ? 'text-indigo-600' : 'text-slate-500'}`}>
                  {item === 'radius' ? 'Nearby radius' : 'Exact location'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tw`gap-2 mb-3`}>
          {metadata?.months.slice(0, 12).map((item) => (
            <TouchableOpacity key={item.month} onPress={() => setMonth(item.month)} style={tw`px-4 py-3 rounded-full ${month === item.month ? 'bg-slate-900' : 'bg-slate-100'}`}>
              <Text style={tw`text-xs font-bold ${month === item.month ? 'text-white' : 'text-slate-600'}`}>{item.monthDisplay}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={tw`flex-row gap-2 mb-4`}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tw`gap-2`}>
            <TouchableOpacity onPress={() => setCategory('')} style={tw`px-4 py-3 rounded-full ${!category ? 'bg-indigo-600' : 'bg-slate-100'}`}>
              <Text style={tw`text-xs font-bold ${!category ? 'text-white' : 'text-slate-600'}`}>All crime</Text>
            </TouchableOpacity>
            {metadata?.categories.map((item) => (
              <TouchableOpacity key={item.category} onPress={() => setCategory(item.category)} style={tw`px-4 py-3 rounded-full ${category === item.category ? 'bg-indigo-600' : 'bg-slate-100'}`}>
                <Text style={tw`text-xs font-bold ${category === item.category ? 'text-white' : 'text-slate-600'}`}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={tw`overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 mb-4`}>
          <CrimeMapCanvas
            center={center}
            markers={markers}
            selectedPoint={selectedPoint}
            areaPoints={areaPoints}
            boundaryPoints={boundaryPoints}
            radiusMeters={mode === 'point' && pointSearchMode === 'exact' ? undefined : feed?.radiusMeters ?? feed?.point?.radiusMeters ?? metadata?.defaults.postcodeRadiusMeters}
            onMapPress={onMapPress}
          />
          {loading && <View style={tw`absolute inset-0 bg-white/70 items-center justify-center`}><ActivityIndicator size="large" color="#4f46e5" /></View>}
        </View>

        {mode === 'point' && !feed && <Instruction icon={<Crosshair size={18} color="#4f46e5" />} text="Tap the map to inspect crimes around that exact point." />}
        {mode === 'area' && (
          <View style={tw`flex-row gap-2 mb-4`}>
            <TouchableOpacity onPress={() => void loadFeed()} disabled={areaPoints.length < 3} style={tw`flex-1 h-12 rounded-xl items-center justify-center ${areaPoints.length >= 3 ? 'bg-indigo-600' : 'bg-indigo-200'}`}>
              <Text style={tw`font-bold text-white`}>Analyse {areaPoints.length} points</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setAreaPoints([]); setFeed(null); }} style={tw`w-12 h-12 rounded-xl bg-slate-100 items-center justify-center`}>
              <Trash2 size={18} color={tw.color('slate-600')} />
            </TouchableOpacity>
          </View>
        )}

        {error && <Text selectable style={tw`text-sm font-bold text-rose-600 bg-rose-50 p-4 rounded-2xl mb-4`}>{error}</Text>}

        {feed && (
          <View style={tw`bg-white border border-slate-200 rounded-3xl p-5`}>
            <View style={tw`flex-row justify-between items-start mb-3`}>
              <View style={tw`flex-1`}>
                <Text style={tw`text-xs font-bold uppercase tracking-widest text-slate-400`}>Selected location</Text>
                <Text selectable style={tw`text-lg font-black text-slate-900 mt-1`}>{feed.postcode || feed.district || (mode === 'area' ? 'Custom area' : 'Map point')}</Text>
                {feed.locationStreet ? <Text selectable style={tw`text-xs text-slate-500 mt-1`}>{feed.locationStreet}</Text> : null}
                {neighbourhoodName ? <Text selectable style={tw`text-xs font-bold text-sky-600 mt-1`}>Police boundary: {neighbourhoodName}</Text> : null}
              </View>
              <Text style={tw`text-2xl font-black text-indigo-600`}>{feed.totalCrimes}</Text>
            </View>
            <Text style={tw`text-xs text-slate-500 leading-5 mb-4`}>{feed.summary}</Text>
            {feed.categories.slice(0, 6).map((item) => (
              <View key={item.category} style={tw`flex-row justify-between py-2 border-t border-slate-100`}>
                <Text style={tw`text-xs text-slate-600`}>{humanize(item.category)}</Text>
                <Text style={tw`text-xs font-black text-slate-900`}>{item.count}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

async function fetchBoundary(coordinate: MapCoordinate) {
  return apiRequest<{
    neighbourhood: { name?: string; neighbourhood?: string } | null;
    boundary: MapCoordinate[];
  }>(`/api/point-boundary?lat=${encodeURIComponent(coordinate.latitude)}&lng=${encodeURIComponent(coordinate.longitude)}`, {}, 20_000);
}

function Instruction({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <View style={tw`flex-row items-center gap-3 bg-indigo-50 p-4 rounded-2xl mb-4`}>{icon}<Text style={tw`text-xs text-indigo-900 flex-1`}>{text}</Text></View>;
}

function averagePoint(points: MapCoordinate[]): MapCoordinate {
  return points.reduce((value, point) => ({ latitude: value.latitude + point.latitude / points.length, longitude: value.longitude + point.longitude / points.length }), { latitude: 0, longitude: 0 });
}

function humanize(value: string) {
  return value.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}
