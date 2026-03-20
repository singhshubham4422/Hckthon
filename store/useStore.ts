import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { assertSupabaseConfigured, isSupabaseConfigured, supabase } from '../lib/supabase';

// SECURITY NOTE: When connecting to real Supabase, this store should 
// sync with the Supabase client. Queries would be automatically secured 
// by the RLS policies in the database ensuring users only sync their own profile.

export interface User {
  id: string;
  name: string;
  email?: string;
  age?: number;
  gender?: string;
  conditions: string[];
  allergies: string[];
  isSetup: boolean;
  hasPasscode?: boolean;
  hasBiometrics?: boolean;
}

export interface Medicine {
  id: string;
  user_id: string;
  name: string;
  dose: string;
  timing: string;
  duration: string;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface LogEntry {
  id: string;
  user_id: string;
  medicine_id: string;
  status: 'taken' | 'missed';
  taken_at: string;
  created_at?: string;
}

export interface AIHistoryEntry {
  id: string;
  user_id: string;
  query: string;
  response: string;
  created_at?: string;
}

interface SignUpPayload {
  email: string;
  password: string;
  name: string;
}

interface SignInPayload {
  email: string;
  password: string;
}

interface ProfilePayload {
  name: string;
  age?: number;
  gender?: string;
  allergies: string[];
  conditions: string[];
}

interface SignUpResult {
  needsEmailConfirmation: boolean;
}

type SyncStatus = 'syncing' | 'synced' | 'offline';

interface ScheduleSnapshotEntry {
  medicine_id: string;
  name: string;
  timing: string;
  status: 'taken' | 'missed' | 'pending';
}

interface OfflineCachePayload {
  version: 1;
  updatedAt: string;
  userId: string;
  profile: User;
  medicines: Medicine[];
  logs: LogEntry[];
  lastSchedule: ScheduleSnapshotEntry[];
  lastAIResult: AIHistoryEntry | null;
}

interface ProfileRow {
  id: string;
  email: string;
  name: string;
  age: number | null;
  gender: string | null;
  allergies: string[] | null;
  conditions: string[] | null;
}

interface MedicineInput {
  name: string;
  dose: string;
  timing: string;
  duration: string;
  notes?: string;
}

interface MedicineUpdateInput {
  name?: string;
  dose?: string;
  timing?: string;
  duration?: string;
  notes?: string;
}

interface AppState {
  session: Session | null;
  user: User;
  medicines: Medicine[];
  logs: LogEntry[];
  aiHistory: AIHistoryEntry[];
  lastSchedule: ScheduleSnapshotEntry[];
  theme: 'light' | 'dark';
  appLockEnabled: boolean;
  syncStatus: SyncStatus;
  lastOfflineSyncAt: string | null;
  isAuthReady: boolean;
  authLoading: boolean;
  authError: string | null;
  authNotice: string | null;
  initializeAuth: () => Promise<void>;
  startAuthListener: () => () => void;
  signUpWithEmail: (payload: SignUpPayload) => Promise<SignUpResult>;
  signInWithEmail: (payload: SignInPayload) => Promise<void>;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
  clearAuthNotice: () => void;
  updateUserProfile: (payload: ProfilePayload) => Promise<void>;
  loadMedicines: () => Promise<void>;
  addMedicine: (medicine: MedicineInput) => Promise<void>;
  updateMedicine: (id: string, updates: MedicineUpdateInput) => Promise<void>;
  deleteMedicine: (id: string) => Promise<void>;
  loadLogs: () => Promise<void>;
  logMedicineStatus: (medicineId: string, status: 'taken' | 'missed') => Promise<void>;
  loadAIHistory: () => Promise<void>;
  saveAIHistory: (query: string, response: string) => Promise<void>;
  setTheme: (theme: 'light' | 'dark') => void;
  setAppLockEnabled: (enabled: boolean) => void;
  clearOfflineCache: () => void;
  setSyncStatus: (status: SyncStatus) => void;
}

const defaultUser = (): User => ({
  id: '',
  email: '',
  name: '',
  age: undefined,
  gender: undefined,
  conditions: [],
  allergies: [],
  isSetup: false,
});

const getNavigatorSyncStatus = (): SyncStatus => {
  if (typeof navigator === 'undefined') return 'synced';
  return navigator.onLine ? 'synced' : 'offline';
};

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
};

const formatNameFromEmail = (email: string): string => {
  const value = email.split('@')[0] ?? '';
  if (!value) return 'New User';

  return value
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const toErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string') return maybeMessage;
  }
  return fallback;
};

const mapProfileToUser = (profile: ProfileRow): User => ({
  id: profile.id,
  email: profile.email,
  name: profile.name,
  age: profile.age ?? undefined,
  gender: profile.gender ?? undefined,
  allergies: normalizeStringArray(profile.allergies),
  conditions: normalizeStringArray(profile.conditions),
  isSetup: true,
});

const OFFLINE_CACHE_KEY = 'medicare-offline-cache';

const buildScheduleSnapshot = (medicines: Medicine[], logs: LogEntry[]): ScheduleSnapshotEntry[] => {
  const today = new Date().toISOString().split('T')[0];
  const statusByMedicine = new Map<string, 'taken' | 'missed'>();

  for (const log of logs) {
    if (!log.taken_at.startsWith(today)) continue;
    if (!statusByMedicine.has(log.medicine_id)) {
      statusByMedicine.set(log.medicine_id, log.status);
    }
  }

  return medicines.map((medicine) => ({
    medicine_id: medicine.id,
    name: medicine.name,
    timing: medicine.timing,
    status: statusByMedicine.get(medicine.id) ?? 'pending',
  }));
};

const buildOfflineCachePayload = (params: {
  userId: string;
  profile: User;
  medicines: Medicine[];
  logs: LogEntry[];
  aiHistory: AIHistoryEntry[];
}): OfflineCachePayload => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  userId: params.userId,
  profile: params.profile,
  medicines: params.medicines,
  logs: params.logs,
  lastSchedule: buildScheduleSnapshot(params.medicines, params.logs),
  lastAIResult: params.aiHistory[0] ?? null,
});

const writeOfflineCache = (payload: OfflineCachePayload) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore local storage failures; Supabase remains source of truth.
  }
};

const readOfflineCache = (): OfflineCachePayload | null => {
  if (typeof window === 'undefined') return null;

  try {
    const rawValue = window.localStorage.getItem(OFFLINE_CACHE_KEY);
    if (!rawValue) return null;

    const parsed = JSON.parse(rawValue) as Partial<OfflineCachePayload>;
    if (parsed.version !== 1 || typeof parsed.userId !== 'string' || !parsed.userId) {
      return null;
    }

    const cachedProfile = parsed.profile as Partial<User> | undefined;
    const profile: User = {
      ...defaultUser(),
      ...(cachedProfile ?? {}),
      id: cachedProfile?.id ?? parsed.userId,
      name: cachedProfile?.name ?? 'New User',
      email: cachedProfile?.email,
      conditions: normalizeStringArray(cachedProfile?.conditions),
      allergies: normalizeStringArray(cachedProfile?.allergies),
      isSetup: true,
    };

    const medicines = Array.isArray(parsed.medicines) ? (parsed.medicines as Medicine[]) : [];
    const logs = Array.isArray(parsed.logs) ? (parsed.logs as LogEntry[]) : [];
    const schedule = Array.isArray(parsed.lastSchedule)
      ? (parsed.lastSchedule as ScheduleSnapshotEntry[])
      : buildScheduleSnapshot(medicines, logs);

    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
      userId: parsed.userId,
      profile,
      medicines,
      logs,
      lastSchedule: schedule,
      lastAIResult:
        parsed.lastAIResult && typeof parsed.lastAIResult === 'object'
          ? (parsed.lastAIResult as AIHistoryEntry)
          : null,
    };
  } catch {
    return null;
  }
};

const clearOfflineCacheStorage = () => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(OFFLINE_CACHE_KEY);
  } catch {
    // Ignore local storage failures.
  }
};

const syncOfflineCacheFromState = (params: {
  userId: string;
  profile: User;
  medicines: Medicine[];
  logs: LogEntry[];
  aiHistory: AIHistoryEntry[];
}): { updatedAt: string; lastSchedule: ScheduleSnapshotEntry[] } | null => {
  if (!params.userId || !params.profile.isSetup) return null;

  const payload = buildOfflineCachePayload(params);
  writeOfflineCache(payload);

  return {
    updatedAt: payload.updatedAt,
    lastSchedule: payload.lastSchedule,
  };
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      session: null,
      user: defaultUser(),
      medicines: [],
      logs: [],
      aiHistory: [],
      lastSchedule: [],
      theme: 'light',
      appLockEnabled: false,
      syncStatus: getNavigatorSyncStatus(),
      lastOfflineSyncAt: null,
      isAuthReady: false,
      authLoading: false,
      authError: null,
      authNotice: null,
      initializeAuth: async () => {
        const cachedData = readOfflineCache();

        const clearAuthState = () => {
          set({
            session: null,
            user: defaultUser(),
            medicines: [],
            logs: [],
            aiHistory: [],
            lastSchedule: [],
            lastOfflineSyncAt: null,
            syncStatus: getNavigatorSyncStatus(),
          });
        };

        const loadUserData = async (session: Session, preferredName?: string) => {
          const metadataName =
            typeof session.user.user_metadata?.name === 'string'
              ? session.user.user_metadata.name
              : undefined;
          const fallbackName = preferredName || metadataName || formatNameFromEmail(session.user.email ?? '');

          const { data: existingProfile, error: fetchProfileError } = await supabase
            .from('profiles')
            .select('id,email,name,age,gender,allergies,conditions')
            .eq('id', session.user.id)
            .maybeSingle();

          if (fetchProfileError && fetchProfileError.code !== 'PGRST116') {
            throw fetchProfileError;
          }

          let profileRow = existingProfile as ProfileRow | null;
          if (!profileRow) {
            const { data: createdProfile, error: createProfileError } = await supabase
              .from('profiles')
              .insert({
                id: session.user.id,
                email: session.user.email ?? '',
                name: fallbackName,
                age: null,
                gender: null,
                allergies: [],
                conditions: [],
              })
              .select('id,email,name,age,gender,allergies,conditions')
              .single();

            if (createProfileError) {
              throw createProfileError;
            }

            profileRow = createdProfile as ProfileRow;
          }

          const [{ data: medicinesData, error: medicinesError }, { data: logsData, error: logsError }, { data: historyData, error: historyError }] = await Promise.all([
            supabase.from('medicines').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }),
            supabase.from('logs').select('*').eq('user_id', session.user.id).order('taken_at', { ascending: false }).limit(200),
            supabase.from('ai_history').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(30),
          ]);

          if (medicinesError) throw medicinesError;
          if (logsError) throw logsError;
          if (historyError) throw historyError;

          const nextUser = mapProfileToUser(profileRow);
          const nextMedicines = (medicinesData ?? []) as Medicine[];
          const nextLogs = (logsData ?? []) as LogEntry[];
          const nextHistory = (historyData ?? []) as AIHistoryEntry[];
          const cacheSnapshot = syncOfflineCacheFromState({
            userId: session.user.id,
            profile: nextUser,
            medicines: nextMedicines,
            logs: nextLogs,
            aiHistory: nextHistory,
          });

          set({
            session,
            user: nextUser,
            medicines: nextMedicines,
            logs: nextLogs,
            aiHistory: nextHistory,
            lastSchedule: cacheSnapshot?.lastSchedule ?? buildScheduleSnapshot(nextMedicines, nextLogs),
            lastOfflineSyncAt: cacheSnapshot?.updatedAt ?? new Date().toISOString(),
            syncStatus: getNavigatorSyncStatus() === 'offline' ? 'offline' : 'synced',
          });
        };

        if (cachedData) {
          set({
            user: cachedData.profile,
            medicines: cachedData.medicines,
            logs: cachedData.logs,
            aiHistory: cachedData.lastAIResult ? [cachedData.lastAIResult] : [],
            lastSchedule: cachedData.lastSchedule,
            lastOfflineSyncAt: cachedData.updatedAt,
            syncStatus: 'offline',
          });
        }

        set({ authLoading: true, authError: null });

        try {
          assertSupabaseConfigured();
          const { data, error } = await supabase.auth.getSession();
          if (error) throw error;

          if (!data.session) {
            clearAuthState();
          } else {
            await loadUserData(data.session);
          }
        } catch (error) {
          const message = toErrorMessage(error, 'Failed to initialize authentication.');
          if (!cachedData) {
            clearAuthState();
            set({ authError: message });
          } else {
            set({
              authError: getNavigatorSyncStatus() === 'offline' ? null : message,
              syncStatus: 'offline',
            });
          }
        } finally {
          set({ isAuthReady: true, authLoading: false });
        }
      },
      startAuthListener: () => {
        if (!isSupabaseConfigured) {
          return () => undefined;
        }

        const clearAuthState = () => {
          set({
            session: null,
            user: defaultUser(),
            medicines: [],
            logs: [],
            aiHistory: [],
            lastSchedule: [],
            lastOfflineSyncAt: null,
            syncStatus: getNavigatorSyncStatus(),
          });
        };

        const loadUserData = async (session: Session, preferredName?: string) => {
          const metadataName =
            typeof session.user.user_metadata?.name === 'string'
              ? session.user.user_metadata.name
              : undefined;
          const fallbackName = preferredName || metadataName || formatNameFromEmail(session.user.email ?? '');

          const { data: existingProfile, error: fetchProfileError } = await supabase
            .from('profiles')
            .select('id,email,name,age,gender,allergies,conditions')
            .eq('id', session.user.id)
            .maybeSingle();

          if (fetchProfileError && fetchProfileError.code !== 'PGRST116') {
            throw fetchProfileError;
          }

          let profileRow = existingProfile as ProfileRow | null;
          if (!profileRow) {
            const { data: createdProfile, error: createProfileError } = await supabase
              .from('profiles')
              .insert({
                id: session.user.id,
                email: session.user.email ?? '',
                name: fallbackName,
                age: null,
                gender: null,
                allergies: [],
                conditions: [],
              })
              .select('id,email,name,age,gender,allergies,conditions')
              .single();

            if (createProfileError) {
              throw createProfileError;
            }

            profileRow = createdProfile as ProfileRow;
          }

          const [{ data: medicinesData, error: medicinesError }, { data: logsData, error: logsError }, { data: historyData, error: historyError }] = await Promise.all([
            supabase.from('medicines').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }),
            supabase.from('logs').select('*').eq('user_id', session.user.id).order('taken_at', { ascending: false }).limit(200),
            supabase.from('ai_history').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(30),
          ]);

          if (medicinesError) throw medicinesError;
          if (logsError) throw logsError;
          if (historyError) throw historyError;

          const nextUser = mapProfileToUser(profileRow);
          const nextMedicines = (medicinesData ?? []) as Medicine[];
          const nextLogs = (logsData ?? []) as LogEntry[];
          const nextHistory = (historyData ?? []) as AIHistoryEntry[];
          const cacheSnapshot = syncOfflineCacheFromState({
            userId: session.user.id,
            profile: nextUser,
            medicines: nextMedicines,
            logs: nextLogs,
            aiHistory: nextHistory,
          });

          set({
            session,
            user: nextUser,
            medicines: nextMedicines,
            logs: nextLogs,
            aiHistory: nextHistory,
            lastSchedule: cacheSnapshot?.lastSchedule ?? buildScheduleSnapshot(nextMedicines, nextLogs),
            lastOfflineSyncAt: cacheSnapshot?.updatedAt ?? new Date().toISOString(),
            syncStatus: getNavigatorSyncStatus() === 'offline' ? 'offline' : 'synced',
          });
        };

        const { data } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session) => {
          void (async () => {
            try {
              if (!session) {
                clearAuthState();
              } else {
                await loadUserData(session);
              }
              set({ isAuthReady: true, authLoading: false });
            } catch (error) {
              set({ authError: toErrorMessage(error, 'Failed to sync auth state.'), authLoading: false });
            }
          })();
        });

        return () => {
          data.subscription.unsubscribe();
        };
      },
      signUpWithEmail: async ({ email, password, name }) => {
        const cleanName = name.trim() || formatNameFromEmail(email);
        set({ authLoading: true, authError: null, authNotice: null });

        try {
          assertSupabaseConfigured();
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                name: cleanName,
              },
            },
          });

          if (error) throw error;

          if (!data.session) {
            set({ authNotice: 'Signup successful. Check your inbox to confirm email, then log in.' });
            return { needsEmailConfirmation: true };
          }

          const metadataName =
            typeof data.session.user.user_metadata?.name === 'string'
              ? data.session.user.user_metadata.name
              : undefined;
          const fallbackName = metadataName || cleanName;

          const { data: profileRow, error: profileError } = await supabase
            .from('profiles')
            .upsert(
              {
                id: data.session.user.id,
                email: data.session.user.email ?? email,
                name: fallbackName,
                age: null,
                gender: null,
                allergies: [],
                conditions: [],
              },
              { onConflict: 'id' }
            )
            .select('id,email,name,age,gender,allergies,conditions')
            .single();

          if (profileError) throw profileError;

          const nextUser = mapProfileToUser(profileRow as ProfileRow);
          const cacheSnapshot = syncOfflineCacheFromState({
            userId: data.session.user.id,
            profile: nextUser,
            medicines: [],
            logs: [],
            aiHistory: [],
          });

          set({
            session: data.session,
            user: nextUser,
            medicines: [],
            logs: [],
            aiHistory: [],
            lastSchedule: cacheSnapshot?.lastSchedule ?? [],
            lastOfflineSyncAt: cacheSnapshot?.updatedAt ?? new Date().toISOString(),
            syncStatus: getNavigatorSyncStatus() === 'offline' ? 'offline' : 'synced',
            authNotice: null,
          });

          return { needsEmailConfirmation: false };
        } catch (error) {
          const message = toErrorMessage(error, 'Failed to sign up.');
          set({ authError: message });
          throw new Error(message);
        } finally {
          set({ authLoading: false, isAuthReady: true });
        }
      },
      signInWithEmail: async ({ email, password }) => {
        set({ authLoading: true, authError: null, authNotice: null, syncStatus: 'syncing' });

        try {
          assertSupabaseConfigured();
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;

          const metadataName =
            typeof data.session.user.user_metadata?.name === 'string'
              ? data.session.user.user_metadata.name
              : undefined;
          const fallbackName = metadataName || formatNameFromEmail(data.session.user.email ?? email);

          const { data: existingProfile, error: fetchProfileError } = await supabase
            .from('profiles')
            .select('id,email,name,age,gender,allergies,conditions')
            .eq('id', data.session.user.id)
            .maybeSingle();

          if (fetchProfileError && fetchProfileError.code !== 'PGRST116') {
            throw fetchProfileError;
          }

          let profileRow = existingProfile as ProfileRow | null;
          if (!profileRow) {
            const { data: createdProfile, error: createProfileError } = await supabase
              .from('profiles')
              .insert({
                id: data.session.user.id,
                email: data.session.user.email ?? email,
                name: fallbackName,
                age: null,
                gender: null,
                allergies: [],
                conditions: [],
              })
              .select('id,email,name,age,gender,allergies,conditions')
              .single();

            if (createProfileError) throw createProfileError;
            profileRow = createdProfile as ProfileRow;
          }

          const [{ data: medicinesData, error: medicinesError }, { data: logsData, error: logsError }, { data: historyData, error: historyError }] = await Promise.all([
            supabase.from('medicines').select('*').eq('user_id', data.session.user.id).order('created_at', { ascending: false }),
            supabase.from('logs').select('*').eq('user_id', data.session.user.id).order('taken_at', { ascending: false }).limit(200),
            supabase.from('ai_history').select('*').eq('user_id', data.session.user.id).order('created_at', { ascending: false }).limit(30),
          ]);

          if (medicinesError) throw medicinesError;
          if (logsError) throw logsError;
          if (historyError) throw historyError;

          const nextUser = mapProfileToUser(profileRow);
          const nextMedicines = (medicinesData ?? []) as Medicine[];
          const nextLogs = (logsData ?? []) as LogEntry[];
          const nextHistory = (historyData ?? []) as AIHistoryEntry[];
          const cacheSnapshot = syncOfflineCacheFromState({
            userId: data.session.user.id,
            profile: nextUser,
            medicines: nextMedicines,
            logs: nextLogs,
            aiHistory: nextHistory,
          });

          set({
            session: data.session,
            user: nextUser,
            medicines: nextMedicines,
            logs: nextLogs,
            aiHistory: nextHistory,
            lastSchedule: cacheSnapshot?.lastSchedule ?? buildScheduleSnapshot(nextMedicines, nextLogs),
            lastOfflineSyncAt: cacheSnapshot?.updatedAt ?? new Date().toISOString(),
            syncStatus: getNavigatorSyncStatus() === 'offline' ? 'offline' : 'synced',
          });
        } catch (error) {
          const message = toErrorMessage(error, 'Failed to sign in.');
          set({ authError: message });
          throw new Error(message);
        } finally {
          set({ authLoading: false, isAuthReady: true });
        }
      },
      signOut: async () => {
        set({ authLoading: true, authError: null });

        try {
          assertSupabaseConfigured();
          const { error } = await supabase.auth.signOut();
          if (error) throw error;

          clearOfflineCacheStorage();

          set({
            session: null,
            user: defaultUser(),
            medicines: [],
            logs: [],
            aiHistory: [],
            lastSchedule: [],
            lastOfflineSyncAt: null,
            authNotice: null,
            syncStatus: getNavigatorSyncStatus(),
          });
        } catch (error) {
          const message = toErrorMessage(error, 'Failed to sign out.');
          set({ authError: message });
          throw new Error(message);
        } finally {
          set({ authLoading: false });
        }
      },
      clearAuthError: () => set({ authError: null }),
      clearAuthNotice: () => set({ authNotice: null }),
      updateUserProfile: async ({ name, age, gender, allergies, conditions }) => {
        const currentSession = useAppStore.getState().session;
        if (!currentSession) throw new Error('You must be logged in to update profile.');

        set({ syncStatus: 'syncing', authError: null });

        try {
          assertSupabaseConfigured();
          const cleanName = name.trim() || useAppStore.getState().user.name || formatNameFromEmail(currentSession.user.email ?? '');

          const { data, error } = await supabase
            .from('profiles')
            .upsert(
              {
                id: currentSession.user.id,
                email: currentSession.user.email ?? useAppStore.getState().user.email ?? '',
                name: cleanName,
                age: typeof age === 'number' ? age : null,
                gender: gender?.trim() ? gender.trim() : null,
                allergies,
                conditions,
              },
              { onConflict: 'id' }
            )
            .select('id,email,name,age,gender,allergies,conditions')
            .single();

          if (error) throw error;

          const nextUser = mapProfileToUser(data as ProfileRow);
          const currentState = useAppStore.getState();
          const cacheSnapshot = syncOfflineCacheFromState({
            userId: currentSession.user.id,
            profile: nextUser,
            medicines: currentState.medicines,
            logs: currentState.logs,
            aiHistory: currentState.aiHistory,
          });

          set({
            user: nextUser,
            lastOfflineSyncAt: cacheSnapshot?.updatedAt ?? currentState.lastOfflineSyncAt,
            syncStatus: getNavigatorSyncStatus() === 'offline' ? 'offline' : 'synced',
          });
        } catch (error) {
          const message = toErrorMessage(error, 'Failed to update profile.');
          set({ authError: message, syncStatus: getNavigatorSyncStatus() });
          throw new Error(message);
        }
      },
      loadMedicines: async () => {
        const currentSession = useAppStore.getState().session;
        if (!currentSession) {
          set({ medicines: [] });
          return;
        }

        try {
          assertSupabaseConfigured();
          const { data, error } = await supabase
            .from('medicines')
            .select('*')
            .eq('user_id', currentSession.user.id)
            .order('created_at', { ascending: false });

          if (error) throw error;

          const nextMedicines = (data ?? []) as Medicine[];
          const currentState = useAppStore.getState();
          const cacheSnapshot = syncOfflineCacheFromState({
            userId: currentSession.user.id,
            profile: currentState.user,
            medicines: nextMedicines,
            logs: currentState.logs,
            aiHistory: currentState.aiHistory,
          });

          set({
            medicines: nextMedicines,
            lastSchedule: cacheSnapshot?.lastSchedule ?? buildScheduleSnapshot(nextMedicines, currentState.logs),
            lastOfflineSyncAt: cacheSnapshot?.updatedAt ?? currentState.lastOfflineSyncAt,
            syncStatus: getNavigatorSyncStatus() === 'offline' ? 'offline' : 'synced',
          });
        } catch (error) {
          const message = toErrorMessage(error, 'Failed to load medicines.');
          set({ authError: message });
        }
      },
      addMedicine: async (medicine) => {
        const currentSession = useAppStore.getState().session;
        if (!currentSession) throw new Error('You must be logged in to add medicines.');

        set({ syncStatus: 'syncing', authError: null });

        try {
          assertSupabaseConfigured();
          const { data, error } = await supabase
            .from('medicines')
            .insert({
              user_id: currentSession.user.id,
              name: medicine.name.trim(),
              dose: medicine.dose.trim(),
              timing: medicine.timing.trim(),
              duration: medicine.duration.trim(),
              notes: medicine.notes?.trim() ? medicine.notes.trim() : null,
            })
            .select('*')
            .single();

          if (error) throw error;

          set((state) => ({
            medicines: [data as Medicine, ...state.medicines],
            lastSchedule: buildScheduleSnapshot([data as Medicine, ...state.medicines], state.logs),
            syncStatus: getNavigatorSyncStatus() === 'offline' ? 'offline' : 'synced',
          }));

          const currentState = useAppStore.getState();
          const cacheSnapshot = syncOfflineCacheFromState({
            userId: currentSession.user.id,
            profile: currentState.user,
            medicines: currentState.medicines,
            logs: currentState.logs,
            aiHistory: currentState.aiHistory,
          });
          if (cacheSnapshot) {
            set({ lastOfflineSyncAt: cacheSnapshot.updatedAt });
          }
        } catch (error) {
          const message = toErrorMessage(error, 'Failed to add medicine.');
          set({ authError: message, syncStatus: getNavigatorSyncStatus() });
          throw new Error(message);
        }
      },
      updateMedicine: async (id, updates) => {
        const currentSession = useAppStore.getState().session;
        if (!currentSession) throw new Error('You must be logged in to update medicines.');

        const updatePayload: Record<string, string | null> = {};
        if (updates.name !== undefined) updatePayload.name = updates.name.trim();
        if (updates.dose !== undefined) updatePayload.dose = updates.dose.trim();
        if (updates.timing !== undefined) updatePayload.timing = updates.timing.trim();
        if (updates.duration !== undefined) updatePayload.duration = updates.duration.trim();
        if (updates.notes !== undefined) updatePayload.notes = updates.notes.trim() ? updates.notes.trim() : null;

        if (Object.keys(updatePayload).length === 0) return;

        set({ syncStatus: 'syncing', authError: null });

        try {
          assertSupabaseConfigured();
          const { data, error } = await supabase
            .from('medicines')
            .update(updatePayload)
            .eq('id', id)
            .eq('user_id', currentSession.user.id)
            .select('*')
            .single();

          if (error) throw error;

          set((state) => ({
            medicines: state.medicines.map((medicine) => (medicine.id === id ? (data as Medicine) : medicine)),
            lastSchedule: buildScheduleSnapshot(
              state.medicines.map((medicine) => (medicine.id === id ? (data as Medicine) : medicine)),
              state.logs
            ),
            syncStatus: getNavigatorSyncStatus() === 'offline' ? 'offline' : 'synced',
          }));

          const currentState = useAppStore.getState();
          const cacheSnapshot = syncOfflineCacheFromState({
            userId: currentSession.user.id,
            profile: currentState.user,
            medicines: currentState.medicines,
            logs: currentState.logs,
            aiHistory: currentState.aiHistory,
          });
          if (cacheSnapshot) {
            set({ lastOfflineSyncAt: cacheSnapshot.updatedAt });
          }
        } catch (error) {
          const message = toErrorMessage(error, 'Failed to update medicine.');
          set({ authError: message, syncStatus: getNavigatorSyncStatus() });
          throw new Error(message);
        }
      },
      deleteMedicine: async (id) => {
        const currentSession = useAppStore.getState().session;
        if (!currentSession) throw new Error('You must be logged in to delete medicines.');

        set({ syncStatus: 'syncing', authError: null });

        try {
          assertSupabaseConfigured();
          const { error } = await supabase.from('medicines').delete().eq('id', id).eq('user_id', currentSession.user.id);
          if (error) throw error;

          set((state) => ({
            medicines: state.medicines.filter((medicine) => medicine.id !== id),
            logs: state.logs.filter((entry) => entry.medicine_id !== id),
            lastSchedule: buildScheduleSnapshot(
              state.medicines.filter((medicine) => medicine.id !== id),
              state.logs.filter((entry) => entry.medicine_id !== id)
            ),
            syncStatus: getNavigatorSyncStatus() === 'offline' ? 'offline' : 'synced',
          }));

          const currentState = useAppStore.getState();
          const cacheSnapshot = syncOfflineCacheFromState({
            userId: currentSession.user.id,
            profile: currentState.user,
            medicines: currentState.medicines,
            logs: currentState.logs,
            aiHistory: currentState.aiHistory,
          });
          if (cacheSnapshot) {
            set({ lastOfflineSyncAt: cacheSnapshot.updatedAt });
          }
        } catch (error) {
          const message = toErrorMessage(error, 'Failed to delete medicine.');
          set({ authError: message, syncStatus: getNavigatorSyncStatus() });
          throw new Error(message);
        }
      },
      loadLogs: async () => {
        const currentSession = useAppStore.getState().session;
        if (!currentSession) {
          set({ logs: [] });
          return;
        }

        try {
          assertSupabaseConfigured();
          const { data, error } = await supabase
            .from('logs')
            .select('*')
            .eq('user_id', currentSession.user.id)
            .order('taken_at', { ascending: false })
            .limit(200);

          if (error) throw error;

          const nextLogs = (data ?? []) as LogEntry[];
          const currentState = useAppStore.getState();
          const cacheSnapshot = syncOfflineCacheFromState({
            userId: currentSession.user.id,
            profile: currentState.user,
            medicines: currentState.medicines,
            logs: nextLogs,
            aiHistory: currentState.aiHistory,
          });

          set({
            logs: nextLogs,
            lastSchedule: cacheSnapshot?.lastSchedule ?? buildScheduleSnapshot(currentState.medicines, nextLogs),
            lastOfflineSyncAt: cacheSnapshot?.updatedAt ?? currentState.lastOfflineSyncAt,
            syncStatus: getNavigatorSyncStatus() === 'offline' ? 'offline' : 'synced',
          });
        } catch (error) {
          const message = toErrorMessage(error, 'Failed to load logs.');
          set({ authError: message });
        }
      },
      logMedicineStatus: async (medicineId, status) => {
        const currentSession = useAppStore.getState().session;
        if (!currentSession) throw new Error('You must be logged in to create logs.');

        set({ syncStatus: 'syncing', authError: null });

        try {
          assertSupabaseConfigured();
          const { data, error } = await supabase
            .from('logs')
            .insert({
              user_id: currentSession.user.id,
              medicine_id: medicineId,
              status,
              taken_at: new Date().toISOString(),
            })
            .select('*')
            .single();

          if (error) throw error;

          set((state) => ({
            logs: [data as LogEntry, ...state.logs],
            lastSchedule: buildScheduleSnapshot(state.medicines, [data as LogEntry, ...state.logs]),
            syncStatus: getNavigatorSyncStatus() === 'offline' ? 'offline' : 'synced',
          }));

          const currentState = useAppStore.getState();
          const cacheSnapshot = syncOfflineCacheFromState({
            userId: currentSession.user.id,
            profile: currentState.user,
            medicines: currentState.medicines,
            logs: currentState.logs,
            aiHistory: currentState.aiHistory,
          });
          if (cacheSnapshot) {
            set({ lastOfflineSyncAt: cacheSnapshot.updatedAt });
          }
        } catch (error) {
          const message = toErrorMessage(error, 'Failed to create medicine log.');
          set({ authError: message, syncStatus: getNavigatorSyncStatus() });
          throw new Error(message);
        }
      },
      loadAIHistory: async () => {
        const currentSession = useAppStore.getState().session;
        if (!currentSession) {
          set({ aiHistory: [] });
          return;
        }

        try {
          assertSupabaseConfigured();
          const { data, error } = await supabase
            .from('ai_history')
            .select('*')
            .eq('user_id', currentSession.user.id)
            .order('created_at', { ascending: false })
            .limit(30);

          if (error) throw error;

          const nextHistory = (data ?? []) as AIHistoryEntry[];
          const currentState = useAppStore.getState();
          const cacheSnapshot = syncOfflineCacheFromState({
            userId: currentSession.user.id,
            profile: currentState.user,
            medicines: currentState.medicines,
            logs: currentState.logs,
            aiHistory: nextHistory,
          });

          set({
            aiHistory: nextHistory,
            lastOfflineSyncAt: cacheSnapshot?.updatedAt ?? currentState.lastOfflineSyncAt,
            syncStatus: getNavigatorSyncStatus() === 'offline' ? 'offline' : 'synced',
          });
        } catch (error) {
          const message = toErrorMessage(error, 'Failed to load AI history.');
          set({ authError: message });
        }
      },
      saveAIHistory: async (query, response) => {
        const currentSession = useAppStore.getState().session;
        if (!currentSession) throw new Error('You must be logged in to save AI history.');

        try {
          assertSupabaseConfigured();
          const { data, error } = await supabase
            .from('ai_history')
            .insert({
              user_id: currentSession.user.id,
              query: query.trim(),
              response: response.trim(),
            })
            .select('*')
            .single();

          if (error) throw error;

          set((state) => ({
            aiHistory: [data as AIHistoryEntry, ...state.aiHistory],
          }));

          const currentState = useAppStore.getState();
          const cacheSnapshot = syncOfflineCacheFromState({
            userId: currentSession.user.id,
            profile: currentState.user,
            medicines: currentState.medicines,
            logs: currentState.logs,
            aiHistory: currentState.aiHistory,
          });
          if (cacheSnapshot) {
            set({
              lastOfflineSyncAt: cacheSnapshot.updatedAt,
              syncStatus: getNavigatorSyncStatus() === 'offline' ? 'offline' : 'synced',
            });
          }
        } catch (error) {
          const message = toErrorMessage(error, 'Failed to save AI history.');
          set({ authError: message });
          throw new Error(message);
        }
      },
      setTheme: (theme) => set({ theme }),
      setAppLockEnabled: (appLockEnabled) => set({ appLockEnabled }),
      clearOfflineCache: () => {
        clearOfflineCacheStorage();
        set({ lastOfflineSyncAt: null, lastSchedule: [] });
      },
      setSyncStatus: (syncStatus) => set({ syncStatus }),
    }),
    {
      name: 'smart-medicine-storage',
      version: 3,
      partialize: (state) => ({
        theme: state.theme,
        appLockEnabled: state.appLockEnabled,
      }),
      migrate: (persistedState) => {
        const previous = persistedState as Partial<AppState> | undefined;

        return {
          theme: previous?.theme === 'dark' ? 'dark' : 'light',
          appLockEnabled: previous?.appLockEnabled === true,
        };
      },
    }
  )
);
