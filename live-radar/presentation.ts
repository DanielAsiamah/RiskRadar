import type { LiveRadarAlertEvent, LiveRadarReading } from './types.ts';

export function findCurrentLiveRadarAlert(
  reading: LiveRadarReading | null,
  history: LiveRadarAlertEvent[],
) {
  if (!reading) return null;
  return history.find((event) => (
    event.createdAt === reading.checkedAt
    && event.postcode === reading.postcode
    && event.score === reading.score
  )) ?? null;
}

export function formatLiveRadarDataMonth(value: string | null) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value ?? '');
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
