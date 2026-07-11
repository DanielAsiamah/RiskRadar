import Constants from 'expo-constants';

const API_PORT = process.env.EXPO_PUBLIC_API_PORT || '3001';

function getApiBaseUrl() {
  const configuredBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (configuredBaseUrl) return configuredBaseUrl.replace(/\/+$/, '');

  const hostUri = Constants.expoConfig?.hostUri || Constants.platform?.web?.hostUri;
  const host = hostUri?.replace(/^https?:\/\//, '').split(':')[0];
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
