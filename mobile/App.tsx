import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Notifications from 'expo-notifications';

const WEB_URL = 'https://hckthon-sigma.vercel.app';
const ALLOWED_HOSTS = ['hckthon-sigma.vercel.app'];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function getMessageText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;

  const trimmed = value.trim();
  return trimmed || fallback;
}

export default function App() {
  const [isWebReady, setIsWebReady] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);

  const requestNotificationPermission = useCallback(async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
  }, []);

  useEffect(() => {
    void requestNotificationPermission();
  }, [requestNotificationPermission]);

  const scheduleMedicineReminder = useCallback(async (title?: unknown, message?: unknown) => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: getMessageText(title, 'Medicine Reminder'),
        body: getMessageText(message, 'Time to take your medicine'),
      },
      trigger: {
        seconds: 10,
      },
    });
  }, []);

  const isAllowedNavigation = useCallback((rawUrl: string) => {
    if (!rawUrl) return false;

    if (
      rawUrl.startsWith('about:blank') ||
      rawUrl.startsWith('blob:') ||
      rawUrl.startsWith('data:')
    ) {
      return true;
    }

    try {
      const parsed = new URL(rawUrl);
      return parsed.protocol === 'https:' && ALLOWED_HOSTS.includes(parsed.host);
    } catch {
      return false;
    }
  }, []);

  const onMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data) as {
          type?: string;
          title?: unknown;
          message?: unknown;
        };

        if (data.type === 'SCHEDULE_NOTIFICATION') {
          await scheduleMedicineReminder(data.title, data.message);
        }
      } catch (error) {
        console.error('WebView message error:', error);
      }
    },
    [scheduleMedicineReminder]
  );

  return (
    <SafeAreaView style={styles.container}>
      <WebView
        source={{ uri: WEB_URL }}
        style={styles.webview}
        originWhitelist={['https://*']}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
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
        onMessage={(event) => {
          void onMessage(event);
        }}
        onLoadStart={() => {
          setIsWebReady(false);
          setWebError(null);
        }}
        onLoadEnd={() => {
          setIsWebReady(true);
        }}
        onShouldStartLoadWithRequest={(request) => {
          if (isAllowedNavigation(request.url)) {
            return true;
          }

          void Linking.openURL(request.url).catch(() => {
            console.warn('Blocked navigation and failed to open externally:', request.url);
          });

          return false;
        }}
        onError={(event) => {
          const message = event.nativeEvent.description || 'Unknown WebView load error';
          setWebError(message);
          console.error('WebView error:', event.nativeEvent);
        }}
        onHttpError={(event) => {
          const message = `HTTP ${event.nativeEvent.statusCode}: ${event.nativeEvent.description}`;
          setWebError(message);
          console.error('WebView HTTP error:', event.nativeEvent);
        }}
      />
      {isWebReady && webError ? (
        <View style={styles.debugBanner}>
          <Text style={styles.debugBannerText} numberOfLines={2}>
            Web error: {webError}
          </Text>
        </View>
      ) : null}
      <StatusBar barStyle="dark-content" />
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
