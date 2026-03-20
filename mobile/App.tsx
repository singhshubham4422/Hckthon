import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type AppStateStatus,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';

const WEB_URL = 'http://localhost:3000';
const CACHE_PREFIX = '@medicare_cache:';
const LOCK_SETTING_KEY = '@medicare_lock_enabled';
const SYNC_KEYS = ['smart-medicine-storage', 'medicare-offline-cache'] as const;

type SyncKey = (typeof SYNC_KEYS)[number];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function parseAppLockEnabled(rawValue: string | null): boolean {
  if (!rawValue) return false;

  try {
    const parsed = JSON.parse(rawValue) as { state?: { appLockEnabled?: boolean } };
    return parsed?.state?.appLockEnabled === true;
  } catch {
    return false;
  }
}

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const [appLockEnabled, setAppLockEnabled] = useState(false);
  const [isLockReady, setIsLockReady] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [hasBiometrics, setHasBiometrics] = useState(false);

  const authenticateDeviceOwner = useCallback(async () => {
    setIsUnlocking(true);
    setLockError(null);

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock MediCare',
        fallbackLabel: 'Use Device Passcode',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });

      if (result.success) {
        setIsLocked(false);
        return true;
      }

      setIsLocked(true);
      if (result.error !== 'user_cancel' && result.error !== 'system_cancel') {
        setLockError('Authentication failed. Please try again.');
      }
      return false;
    } catch (error) {
      console.error('Authentication error:', error);
      setIsLocked(true);
      setLockError('Could not authenticate on this device.');
      return false;
    } finally {
      setIsUnlocking(false);
    }
  }, []);

  const registerForPushNotificationsAsync = async () => {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }
  };

  useEffect(() => {
    void (async () => {
      await registerForPushNotificationsAsync();

      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      setHasBiometrics(hasHardware && isEnrolled);

      const [storedLockPreference, persistedStore] = await Promise.all([
        AsyncStorage.getItem(LOCK_SETTING_KEY),
        AsyncStorage.getItem(`${CACHE_PREFIX}smart-medicine-storage`),
      ]);

      const lockEnabledFromStore = parseAppLockEnabled(persistedStore);
      const lockEnabled = storedLockPreference === null ? lockEnabledFromStore : storedLockPreference === 'true';

      setAppLockEnabled(lockEnabled);
      setIsLocked(lockEnabled);
      setIsLockReady(true);

      if (lockEnabled) {
        await authenticateDeviceOwner();
      }
    })();
  }, [authenticateDeviceOwner]);

  useEffect(() => {
    if (!isLockReady) return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasInBackground = appStateRef.current === 'background' || appStateRef.current === 'inactive';
      appStateRef.current = nextState;

      if (wasInBackground && nextState === 'active' && appLockEnabled) {
        setIsLocked(true);
        void authenticateDeviceOwner();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [appLockEnabled, authenticateDeviceOwner, isLockReady]);

  const persistCacheEntry = async (key: string, value: string) => {
    await AsyncStorage.setItem(`${CACHE_PREFIX}${key}`, value);

    if (key !== 'smart-medicine-storage') return;

    const lockEnabled = parseAppLockEnabled(value);
    await AsyncStorage.setItem(LOCK_SETTING_KEY, lockEnabled ? 'true' : 'false');
    setAppLockEnabled(lockEnabled);

    if (!lockEnabled) {
      setIsLocked(false);
      setLockError(null);
      return;
    }

    if (AppState.currentState === 'active') {
      setIsLocked(true);
      void authenticateDeviceOwner();
    }
  };

  const loadCacheEntries = async () => {
    const entries: Partial<Record<SyncKey, string>> = {};

    await Promise.all(
      SYNC_KEYS.map(async (key) => {
        const value = await AsyncStorage.getItem(`${CACHE_PREFIX}${key}`);
        if (typeof value === 'string') {
          entries[key] = value;
        }
      })
    );

    return entries;
  };

  const removeCacheEntry = async (key: string) => {
    await AsyncStorage.removeItem(`${CACHE_PREFIX}${key}`);

    if (key !== 'smart-medicine-storage') return;

    await AsyncStorage.setItem(LOCK_SETTING_KEY, 'false');
    setAppLockEnabled(false);
    setIsLocked(false);
    setLockError(null);
  };

  const onMessage = async (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        key?: string;
        value?: string;
        message?: string;
      };

      if (data.type === 'CACHE_SET' && typeof data.key === 'string' && typeof data.value === 'string') {
        await persistCacheEntry(data.key, data.value);
        return;
      }

      if (data.type === 'CACHE_LOAD') {
        const entries = await loadCacheEntries();
        webViewRef.current?.postMessage(
          JSON.stringify({
            type: 'CACHE_LOAD_RESPONSE',
            entries,
          })
        );
        return;
      }

      if (data.type === 'CACHE_REMOVE' && typeof data.key === 'string') {
        await removeCacheEntry(data.key);
        return;
      }

      if (data.type === 'SCHEDULE_NOTIFICATION') {
        const body = typeof data.message === 'string' ? data.message : 'Time for your medicine.';
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Time for your Medicine',
            body,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: 5,
            repeats: false,
          },
        });
      }
    } catch (error) {
      console.error('Failed to parse message from WebView:', error);
    }
  };

  const injectedJS = useMemo(
    () => `
      (function() {
        var CACHE_KEYS = ${JSON.stringify(SYNC_KEYS)};
        var cacheKeyMap = {};
        for (var i = 0; i < CACHE_KEYS.length; i += 1) {
          cacheKeyMap[CACHE_KEYS[i]] = true;
        }

        var bridge = window.ReactNativeWebView;
        var originalSetItem = window.localStorage.setItem.bind(window.localStorage);
        var originalRemoveItem = window.localStorage.removeItem.bind(window.localStorage);

        window.localStorage.setItem = function(key, value) {
          if (bridge && cacheKeyMap[key]) {
            bridge.postMessage(JSON.stringify({
              type: 'CACHE_SET',
              key: key,
              value: value,
            }));
          }

          return originalSetItem(key, value);
        };

        window.localStorage.removeItem = function(key) {
          if (bridge && cacheKeyMap[key]) {
            bridge.postMessage(JSON.stringify({
              type: 'CACHE_REMOVE',
              key: key,
            }));
          }

          return originalRemoveItem(key);
        };

        if (bridge) {
          bridge.postMessage(JSON.stringify({
            type: 'CACHE_LOAD',
            keys: CACHE_KEYS,
          }));
        }

        var cacheListener = function(event) {
          try {
            var data = JSON.parse(event.data);
            if (data.type !== 'CACHE_LOAD_RESPONSE' || !data.entries) return;

            Object.keys(data.entries).forEach(function(key) {
              var value = data.entries[key];
              if (typeof value !== 'string') return;

              originalSetItem(key, value);

              try {
                window.dispatchEvent(new StorageEvent('storage', {
                  key: key,
                  newValue: value,
                }));
              } catch (storageError) {
                console.error('Failed to dispatch storage event', storageError);
              }
            });

            window.removeEventListener('message', cacheListener);
          } catch (error) {
            console.error('Failed to restore cache', error);
          }
        };

        window.addEventListener('message', cacheListener);
      })();
      true;
    `,
    []
  );

  if (!isLockReady) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Preparing secure session...</Text>
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  if (appLockEnabled && isLocked) {
    return (
      <SafeAreaView style={styles.lockContainer}>
        <View style={styles.lockCard}>
          <Text style={styles.lockTitle}>App Locked</Text>
          <Text style={styles.lockSubtitle}>
            {hasBiometrics
              ? 'Use Face ID, fingerprint, or device passcode to continue.'
              : 'Use your device passcode to continue.'}
          </Text>

          {lockError && <Text style={styles.lockError}>{lockError}</Text>}

          <TouchableOpacity
            style={[styles.unlockButton, isUnlocking ? styles.unlockButtonDisabled : null]}
            onPress={() => {
              void authenticateDeviceOwner();
            }}
            disabled={isUnlocking}
          >
            <Text style={styles.unlockButtonText}>{isUnlocking ? 'Unlocking...' : 'Unlock App'}</Text>
          </TouchableOpacity>
        </View>
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: WEB_URL }}
        style={styles.webview}
        injectedJavaScriptBeforeContentLoaded={injectedJS}
        onMessage={onMessage}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
      />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#334155',
  },
  lockContainer: {
    flex: 1,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  lockCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  lockTitle: {
    fontSize: 30,
    fontWeight: '700',
    color: '#1E3A8A',
    textAlign: 'center',
  },
  lockSubtitle: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    color: '#475569',
    textAlign: 'center',
  },
  lockError: {
    marginTop: 14,
    fontSize: 14,
    color: '#DC2626',
    textAlign: 'center',
  },
  unlockButton: {
    marginTop: 24,
    borderRadius: 16,
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  unlockButtonDisabled: {
    opacity: 0.7,
  },
  unlockButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
