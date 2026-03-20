import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
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

const WEB_URL = 'https://hckthon-sigma.vercel.app';
const ALLOWED_HOSTS = ['hckthon-sigma.vercel.app'];
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
  const [webError, setWebError] = useState<string | null>(null);
  const [isWebReady, setIsWebReady] = useState(false);

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

    if (finalStatus !== 'granted') return;

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
      const lockEnabled =
        storedLockPreference === null
          ? lockEnabledFromStore
          : storedLockPreference === 'true';

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
      const wasInBackground =
        appStateRef.current === 'background' ||
        appStateRef.current === 'inactive';

      appStateRef.current = nextState;

      if (wasInBackground && nextState === 'active' && appLockEnabled) {
        setIsLocked(true);
        void authenticateDeviceOwner();
      }
    });

    return () => subscription.remove();
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

  const isAllowedNavigation = useCallback((rawUrl: string): boolean => {
    if (!rawUrl) return false;

    if (
      rawUrl.startsWith('about:blank') ||
      rawUrl.startsWith('blob:') ||
      rawUrl.startsWith('data:')
    ) {
      return true;
    }

    try {
      const parsedUrl = new URL(rawUrl);

      if (parsedUrl.protocol !== 'https:') {
        return false;
      }

      return ALLOWED_HOSTS.includes(parsedUrl.host);
    } catch {
      return false;
    }
  }, []);

  const onMessage = async (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'WEB_CONSOLE') {
        const level = typeof data.level === 'string' ? data.level.toUpperCase() : 'LOG';
        const message = Array.isArray(data.args) ? data.args.join(' ') : '';
        console.log(`[WebView ${level}] ${message}`);
        return;
      }

      if (data.type === 'WEB_JS_ERROR') {
        const message = typeof data.message === 'string' ? data.message : 'Unknown JS error in WebView';
        console.error('[WebView JS Error]', message, data);
        setWebError(message);
        return;
      }

      if (data.type === 'WEB_UNHANDLED_REJECTION') {
        const message = typeof data.reason === 'string' ? data.reason : 'Unhandled promise rejection in WebView';
        console.error('[WebView Promise Rejection]', message, data);
        setWebError(message);
        return;
      }

      if (data.type === 'CACHE_SET') {
        await persistCacheEntry(data.key, data.value);
        return;
      }

      if (data.type === 'CACHE_LOAD') {
        const entries = await loadCacheEntries();
        webViewRef.current?.postMessage(
          JSON.stringify({ type: 'CACHE_LOAD_RESPONSE', entries })
        );
        return;
      }

      if (data.type === 'CACHE_REMOVE') {
        await removeCacheEntry(data.key);
        return;
      }

      if (data.type === 'SCHEDULE_NOTIFICATION') {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Time for your Medicine',
            body: data.message || 'Time for your medicine.',
          },
          trigger: { seconds: 5, repeats: false },
        });
      }
    } catch (error) {
      console.error('WebView message error:', error);
    }
  };

  const injectedJS = useMemo(
    () => `
      (function() {
        var CACHE_KEYS = ${JSON.stringify(SYNC_KEYS)};
        var cacheKeySet = {};
        for (var i = 0; i < CACHE_KEYS.length; i += 1) {
          cacheKeySet[CACHE_KEYS[i]] = true;
        }

        var bridge = window.ReactNativeWebView;
        var originalSetItem = window.localStorage.setItem.bind(window.localStorage);
        var originalRemoveItem = window.localStorage.removeItem.bind(window.localStorage);
        var isRestoring = false;

        var safeStringify = function(value) {
          try {
            return typeof value === 'string' ? value : JSON.stringify(value);
          } catch (_err) {
            return String(value);
          }
        };

        var post = function(payload) {
          if (!bridge) return;
          try {
            bridge.postMessage(JSON.stringify(payload));
          } catch (_err) {
            // Ignore bridge serialization failures.
          }
        };

        ['log', 'warn', 'error'].forEach(function(level) {
          var originalConsole = console[level] ? console[level].bind(console) : null;
          console[level] = function() {
            var args = Array.prototype.slice.call(arguments).map(safeStringify);
            post({ type: 'WEB_CONSOLE', level: level, args: args });
            if (originalConsole) {
              originalConsole.apply(null, arguments);
            }
          };
        });

        window.addEventListener('error', function(event) {
          post({
            type: 'WEB_JS_ERROR',
            message: event && event.message ? event.message : 'Unknown error',
            source: event && event.filename ? event.filename : null,
            line: event && event.lineno ? event.lineno : null,
            column: event && event.colno ? event.colno : null,
            stack: event && event.error && event.error.stack ? event.error.stack : null,
          });
        });

        window.addEventListener('unhandledrejection', function(event) {
          var reason = event && event.reason ? safeStringify(event.reason) : 'Unknown rejection reason';
          post({ type: 'WEB_UNHANDLED_REJECTION', reason: reason });
        });

        window.localStorage.setItem = function(key, value) {
          var stringValue = String(value);
          if (!isRestoring && cacheKeySet[key]) {
            post({ type: 'CACHE_SET', key: key, value: stringValue });
          }

          return originalSetItem(key, stringValue);
        };

        window.localStorage.removeItem = function(key) {
          if (!isRestoring && cacheKeySet[key]) {
            post({ type: 'CACHE_REMOVE', key: key });
          }

          return originalRemoveItem(key);
        };

        var restoreListener = function(event) {
          try {
            var rawData = event && typeof event.data !== 'undefined' ? event.data : null;
            var payload = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
            if (!payload || payload.type !== 'CACHE_LOAD_RESPONSE' || !payload.entries) return;

            isRestoring = true;
            Object.keys(payload.entries).forEach(function(key) {
              var value = payload.entries[key];
              if (typeof value !== 'string') return;
              originalSetItem(key, value);
              try {
                window.dispatchEvent(new StorageEvent('storage', {
                  key: key,
                  newValue: value,
                }));
              } catch (_err) {
                // Older WebViews may not support StorageEvent constructor.
              }
            });
            isRestoring = false;
            window.removeEventListener('message', restoreListener);
            document.removeEventListener('message', restoreListener);
          } catch (_err) {
            isRestoring = false;
          }
        };

        window.addEventListener('message', restoreListener);
        document.addEventListener('message', restoreListener);

        if (bridge) {
          bridge.postMessage(JSON.stringify({ type: 'CACHE_LOAD' }));
        }
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
            {hasBiometrics ? 'Use biometrics or device passcode to continue.' : 'Use device passcode to continue.'}
          </Text>
          <TouchableOpacity
            style={styles.unlockButton}
            onPress={() => void authenticateDeviceOwner()}
          >
            <Text style={styles.unlockButtonText}>
              {isUnlocking ? 'Unlocking...' : 'Unlock App'}
            </Text>
          </TouchableOpacity>
          {lockError ? <Text style={styles.lockError}>{lockError}</Text> : null}
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

        originWhitelist={['https://*', 'http://*']}

        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        allowsFullscreenVideo={false}

        startInLoadingState
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.loadingText}>Loading MediCare...</Text>
          </View>
        )}
        renderError={(domain, code, description) => (
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Unable to load app</Text>
            <Text style={styles.errorText}>{domain} ({code})</Text>
            <Text style={styles.errorText}>{description}</Text>
          </View>
        )}

        injectedJavaScriptBeforeContentLoaded={injectedJS}
        onMessage={onMessage}
        onLoadStart={() => {
          setIsWebReady(false);
          setWebError(null);
          console.log('[WebView] Load started');
        }}
        onLoadProgress={(event) => {
          const progress = Math.round(event.nativeEvent.progress * 100);
          console.log(`[WebView] Load progress: ${progress}%`);
        }}
        onLoadEnd={() => {
          setIsWebReady(true);
          console.log('[WebView] Load ended');
        }}

        onShouldStartLoadWithRequest={(request) => {
          const isAllowed = isAllowedNavigation(request.url);

          if (isAllowed) return true;

          void Linking.openURL(request.url).catch(() => {
            console.warn('[WebView] Blocked navigation and failed to open externally:', request.url);
          });

          return false;
        }}

        onError={(event) => {
          const message = event.nativeEvent.description || 'Unknown WebView load error';
          setWebError(message);
          console.error('[WebView] Error:', event.nativeEvent);
        }}
        onHttpError={(event) => {
          const message = `HTTP ${event.nativeEvent.statusCode}: ${event.nativeEvent.description}`;
          setWebError(message);
          console.error('[WebView] HTTP Error:', event.nativeEvent);
        }}

        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
      />
      {isWebReady && webError ? (
        <View style={styles.debugBanner}>
          <Text style={styles.debugBannerText} numberOfLines={2}>
            Web error: {webError}
          </Text>
        </View>
      ) : null}
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  webview: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 12,
    color: '#334155',
    fontSize: 15,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#FFF1F2',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#9F1239',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorText: {
    color: '#881337',
    textAlign: 'center',
    marginTop: 4,
  },
  lockContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingHorizontal: 24,
  },
  lockCard: {
    width: '100%',
    maxWidth: 360,
    padding: 24,
    backgroundColor: '#fff',
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  lockTitle: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    color: '#1E3A8A',
  },
  lockSubtitle: {
    marginTop: 10,
    textAlign: 'center',
    color: '#334155',
    lineHeight: 20,
  },
  unlockButton: {
    marginTop: 18,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  unlockButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  lockError: {
    marginTop: 10,
    textAlign: 'center',
    color: '#B91C1C',
    fontWeight: '600',
  },
  debugBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(127,29,29,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  debugBannerText: {
    color: '#FEE2E2',
    fontSize: 12,
    fontWeight: '600',
  },
});