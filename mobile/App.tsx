import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Notifications from 'expo-notifications';
import * as LocalAuthentication from 'expo-local-authentication';

const WEB_URL = 'https://hckthon-sigma.vercel.app';
const ALLOWED_HOSTS = ['hckthon-sigma.vercel.app'];
const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TWELVE_HOUR_REGEX = /^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$/i;
const LEGACY_TIMING_MAP: Record<string, string> = {
  morning: '08:00',
  noon: '12:00',
  afternoon: '14:00',
  evening: '18:00',
  night: '21:00',
  bedtime: '22:00',
};

type AuthState = 'checking' | 'locked' | 'unlocked';

interface ScheduledMedicine {
  id: string;
  name: string;
  timing: string;
  durationDays: number;
  startDate: string;
}

interface MessageEnvelope {
  type?: string;
  data?: unknown;
}

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

function toLocalDateString(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDurationDays(rawDuration: unknown): number | null {
  if (typeof rawDuration === 'number' && Number.isFinite(rawDuration)) {
    const days = Math.trunc(rawDuration);
    return days > 0 ? days : null;
  }

  if (typeof rawDuration === 'string') {
    const days = Number.parseInt(rawDuration, 10);
    if (!Number.isNaN(days) && days > 0) {
      return days;
    }
  }

  return null;
}

function parseTimingToHHmm(rawTiming: unknown): string | null {
  if (typeof rawTiming !== 'string') {
    return null;
  }

  const value = rawTiming.trim();
  if (!value) {
    return null;
  }

  if (HHMM_REGEX.test(value)) {
    return value;
  }

  const legacy = LEGACY_TIMING_MAP[value.toLowerCase()];
  if (legacy) {
    return legacy;
  }

  const match = value.match(TWELVE_HOUR_REGEX);
  if (!match) {
    return null;
  }

  const parsedHour = Number.parseInt(match[1], 10);
  const parsedMinute = Number.parseInt(match[2] ?? '0', 10);
  if (Number.isNaN(parsedHour) || Number.isNaN(parsedMinute) || parsedHour < 1 || parsedHour > 12) {
    return null;
  }

  const suffix = match[3].toLowerCase();
  let hour24 = parsedHour % 12;
  if (suffix === 'pm') {
    hour24 += 12;
  }

  return `${String(hour24).padStart(2, '0')}:${String(parsedMinute).padStart(2, '0')}`;
}

function buildScheduleId(name: string, timing: string, durationDays: number, rawId: unknown): string {
  if (typeof rawId === 'string' && rawId.trim()) {
    return rawId.trim();
  }

  return `${name.toLowerCase()}|${timing}|${durationDays}`;
}

function parseStartDate(rawStartDate: unknown): string {
  if (typeof rawStartDate !== 'string' || !rawStartDate.trim()) {
    return toLocalDateString(new Date());
  }

  const parsed = new Date(rawStartDate);
  if (Number.isNaN(parsed.getTime())) {
    return toLocalDateString(new Date());
  }

  return toLocalDateString(parsed);
}

function toScheduledMedicine(rawData: unknown): ScheduledMedicine | null {
  if (typeof rawData !== 'object' || rawData === null) {
    return null;
  }

  const record = rawData as Record<string, unknown>;
  const name = getMessageText(record.name, '');
  const timing = parseTimingToHHmm(record.timing);
  const durationDays = parseDurationDays(record.duration) ?? 1;
  if (!name || !timing) {
    return null;
  }

  return {
    id: buildScheduleId(name, timing, durationDays, record.id),
    name,
    timing,
    durationDays,
    startDate: parseStartDate(record.startDate),
  };
}

function upsertSchedule(current: ScheduledMedicine[], nextEntry: ScheduledMedicine): ScheduledMedicine[] {
  const existingIndex = current.findIndex((entry) => entry.id === nextEntry.id);
  if (existingIndex === -1) {
    return [...current, nextEntry];
  }

  return current.map((entry, index) => (index === existingIndex ? nextEntry : entry));
}

function dedupeSchedules(entries: ScheduledMedicine[]): ScheduledMedicine[] {
  const seenIds = new Set<string>();
  const deduped: ScheduledMedicine[] = [];

  for (const entry of entries) {
    if (seenIds.has(entry.id)) continue;
    seenIds.add(entry.id);
    deduped.push(entry);
  }

  return deduped;
}

export default function App() {
  const schedulesRef = useRef<ScheduledMedicine[]>([]);
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isWebReady, setIsWebReady] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);

  const requestNotificationPermission = useCallback(async (): Promise<boolean> => {
    const existing = await Notifications.getPermissionsAsync();
    let finalStatus = existing.status;

    if (finalStatus !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      finalStatus = requested.status;
    }

    if (finalStatus !== 'granted') {
      return false;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    return true;
  }, []);

  useEffect(() => {
    void requestNotificationPermission();
  }, [requestNotificationPermission]);

  const authenticateDevice = useCallback(async () => {
    setAuthState('checking');
    setAuthError(null);

    try {
      const [hasHardware, isEnrolled, supportedTypes] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        LocalAuthentication.supportedAuthenticationTypesAsync(),
      ]);

      if (!hasHardware || supportedTypes.length === 0) {
        setAuthError('Secure unlock is not available on this device.');
        setAuthState('locked');
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock MediCare',
        fallbackLabel: 'Use device passcode',
        disableDeviceFallback: false,
        cancelLabel: 'Cancel',
      });

      if (result.success) {
        setAuthState('unlocked');
        setAuthError(null);
        return;
      }

      if (!isEnrolled) {
        setAuthError('No biometrics enrolled. Retry and use your device passcode fallback.');
      } else {
        setAuthError('Authentication failed. Please retry to unlock.');
      }
      setAuthState('locked');
    } catch (error) {
      console.error('Authentication error:', error);
      setAuthError('Unable to verify device lock right now. Please retry.');
      setAuthState('locked');
    }
  }, []);

  useEffect(() => {
    void authenticateDevice();
  }, [authenticateDevice]);

  const rescheduleAllMedicineNotifications = useCallback(async (medicines: ScheduledMedicine[]) => {
    const permissionGranted = await requestNotificationPermission();
    if (!permissionGranted) {
      return;
    }

    await Notifications.cancelAllScheduledNotificationsAsync();

    const now = new Date();
    for (const medicine of medicines) {
      const [hour, minute] = medicine.timing.split(':').map(Number);
      if (Number.isNaN(hour) || Number.isNaN(minute)) {
        console.warn('Skipping schedule due to invalid timing:', medicine.timing);
        continue;
      }

      const nextTrigger = new Date(now);
      nextTrigger.setHours(hour, minute, 0, 0);
      if (nextTrigger.getTime() <= now.getTime()) {
        nextTrigger.setDate(nextTrigger.getDate() + 1);
      }

      console.log('Scheduling notification at:', hour, minute, 'next run:', nextTrigger.toISOString());

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Medicine Reminder',
          body: `Take your medicine: ${medicine.name}`,
          data: {
            medicineId: medicine.id,
            timing: medicine.timing,
          },
        },
        trigger: {
          hour,
          minute,
          repeats: true,
        },
      });
    }
  }, [requestNotificationPermission]);

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
        const message = JSON.parse(event.nativeEvent.data) as MessageEnvelope;

        if (message.type === 'SCHEDULE_NOTIFICATION') {
          const nextEntry = toScheduledMedicine(message.data);
          if (!nextEntry) {
            return;
          }

          const nextSchedules = upsertSchedule(schedulesRef.current, nextEntry);
          schedulesRef.current = nextSchedules;
          await rescheduleAllMedicineNotifications(nextSchedules);
          return;
        }

        if (message.type === 'SYNC_MEDICINES') {
          const payload = Array.isArray(message.data) ? message.data : [];
          const parsed = payload
            .map((entry) => toScheduledMedicine(entry))
            .filter((entry): entry is ScheduledMedicine => entry !== null);

          const nextSchedules = dedupeSchedules(parsed);
          schedulesRef.current = nextSchedules;
          await rescheduleAllMedicineNotifications(nextSchedules);
          return;
        }

        if (message.type === 'CLEAR_SCHEDULES') {
          schedulesRef.current = [];
          await Notifications.cancelAllScheduledNotificationsAsync();
        }
      } catch (error) {
        console.error('WebView message error:', error);
      }
    },
    [rescheduleAllMedicineNotifications]
  );

  if (authState !== 'unlocked') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.lockContainer}>
          {authState === 'checking' ? (
            <>
              <ActivityIndicator size="large" color="#2563EB" />
              <Text style={styles.lockTitle}>Securing MediCare...</Text>
              <Text style={styles.lockText}>Device authentication is required before loading your data.</Text>
            </>
          ) : (
            <>
              <Text style={styles.lockTitle}>App Locked</Text>
              <Text style={styles.lockText}>{authError ?? 'Authentication is required to continue.'}</Text>
              <Pressable
                onPress={() => {
                  void authenticateDevice();
                }}
                style={styles.retryButton}
              >
                <Text style={styles.retryButtonText}>Retry Unlock</Text>
              </Pressable>
            </>
          )}
        </View>
        <StatusBar barStyle="dark-content" />
      </SafeAreaView>
    );
  }

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
  lockContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 24,
  },
  lockTitle: {
    marginTop: 14,
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  lockText: {
    marginTop: 8,
    textAlign: 'center',
    color: '#475569',
    fontSize: 15,
    lineHeight: 21,
  },
  retryButton: {
    marginTop: 20,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
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
