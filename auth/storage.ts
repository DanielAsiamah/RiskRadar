import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export interface AuthStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const webStorage: AuthStorageAdapter = {
  async getItem(key) {
    if (typeof globalThis.localStorage?.getItem !== 'function') {
      return null;
    }
    return globalThis.localStorage.getItem(key);
  },
  async setItem(key, value) {
    if (typeof globalThis.localStorage?.setItem === 'function') {
      globalThis.localStorage.setItem(key, value);
    }
  },
  async removeItem(key) {
    if (typeof globalThis.localStorage?.removeItem === 'function') {
      globalThis.localStorage.removeItem(key);
    }
  },
};

const nativeStorage: AuthStorageAdapter = {
  async getItem(key) {
    return AsyncStorage.getItem(key);
  },
  async setItem(key, value) {
    await AsyncStorage.setItem(key, value);
  },
  async removeItem(key) {
    await AsyncStorage.removeItem(key);
  },
};

export const authStorage: AuthStorageAdapter = Platform.OS === 'web' ? webStorage : nativeStorage;
