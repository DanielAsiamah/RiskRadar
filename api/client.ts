import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = process.env.EXPO_PUBLIC_API_PORT || '3001';

function extractExpoHost() {
  const constants = Constants as typeof Constants & {
    expoGoConfig?: { debuggerHost?: string };
    manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
    manifest?: { debuggerHost?: string; hostUri?: string };
  };

  const candidates = [
    Constants.expoConfig?.hostUri,
    constants.expoGoConfig?.debuggerHost,
    constants.manifest2?.extra?.expoClient?.hostUri,
    constants.manifest?.hostUri,
    constants.manifest?.debuggerHost,
    Constants.linkingUri,
    Constants.experienceUrl,
  ];

  for (const value of candidates) {
    if (!value) continue;
    const host = value.replace(/^exp(?:s)?:\/\//, '').replace(/^https?:\/\//, '').split('/')[0]?.split(':')[0];
    if (host) return host;
  }

  return null;
}

function extractExpoTunnelOrigin() {
  const constants = Constants as typeof Constants & {
    expoGoConfig?: { debuggerHost?: string };
    manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
    manifest?: { debuggerHost?: string; hostUri?: string };
  };
  const candidates = [
    Constants.expoConfig?.hostUri,
    constants.expoGoConfig?.debuggerHost,
    constants.manifest2?.extra?.expoClient?.hostUri,
    constants.manifest?.hostUri,
    constants.manifest?.debuggerHost,
  ];

  for (const value of candidates) {
    if (!value) continue;
    const authority = value.replace(/^exp(?:s)?:\/\//, '').replace(/^https?:\/\//, '').split('/')[0];
    if (authority) return `https://${authority}`;
  }
  return null;
}

function getApiBaseUrl() {
  const configuredBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (configuredBaseUrl) return configuredBaseUrl.replace(/\/+$/, '');

  if (process.env.EXPO_PUBLIC_API_VIA_METRO === 'true') {
    return extractExpoTunnelOrigin() || 'http://localhost:8083';
  }

  if (Platform.OS === 'web' && typeof globalThis.location?.origin === 'string') {
    return globalThis.location.origin;
  }

  const host = extractExpoHost();
  return host ? `http://${host}:${API_PORT}` : `http://localhost:${API_PORT}`;
}

export const API_BASE_URL = getApiBaseUrl();

export class ApiError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, timeoutMs = 40_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...options.headers,
      },
      signal: controller.signal,
    });
    const responseText = await response.text();
    let data: unknown = null;

    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new ApiError(
          response.ok
            ? 'The RiskRadar API returned an unreadable response.'
            : `The server returned HTTP ${response.status} instead of RiskRadar data.`,
          response.status,
        );
      }
    }

    if (!response.ok) {
      const message = typeof data === 'object' && data && 'error' in data
        ? String(data.error)
        : `Request failed with HTTP ${response.status}.`;
      throw new ApiError(message, response.status);
    }

    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('The search took too long. Please try again.', 408);
    }
    throw new ApiError(`RiskRadar could not reach the API at ${API_BASE_URL}. Check your connection and backend server.`);
  } finally {
    clearTimeout(timeout);
  }
}
