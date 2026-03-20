# Technical Report: MediCare Hybrid Application

## 1) System Overview

### Purpose

MediCare is a hybrid medication companion designed to deliver one shared product experience across web and mobile while preserving native capabilities where they matter (device auth, lifecycle handling, local notifications, and native storage).

### Problem Solved

The application addresses practical daily medication management by combining:

- Personal health profile setup
- Medicine schedule and adherence tracking
- Explicit taken/missed event logs
- Future-ready AI history capture
- Offline-first continuity for user experience
- Secure app entry on mobile devices

## 2) Architecture Deep Dive

## 2.1 Workspace and Runtime Model

The repository uses npm workspaces with two runtime targets:

- web workspace: Next.js frontend and API route surface
- mobile workspace: Expo app that hosts the web app inside a WebView

Shared domain/state logic exists in repository root folders:

- store/useStore.ts
- lib/supabase.ts
- components/*

This is enabled by Next externalDir and tsconfig path mapping.

## 2.2 Frontend Composition (Web)

Key shell:

- AppLayout initializes authentication and subscribes to auth state changes.
- ThemeProvider applies global dark class on html element.
- Navbar exposes sync state, theme toggle, and sign-out.
- BottomNav provides route-level navigation.

Feature pages:

- /: login/signup + dashboard + medicine status + reminder trigger
- /add: medicine create/update
- /profile: profile setup/update
- /ai: prompt history persistence and display
- /settings: lock setting, theme selection, sync status, clear cache

## 2.3 State and Domain Layer

All core business flows are centralized in useAppStore:

- Supabase auth lifecycle
- profile CRUD
- medicine CRUD
- adherence log writes
- AI history reads/writes
- sync state flags
- offline cache orchestration
- app lock preference persistence

The store is the principal domain orchestrator and single source of client truth.

## 2.4 Backend and Data Access

There is no custom backend service implementation in this repository (root api folder is empty).

Data backend is Supabase:

- Auth: email/password
- Postgres: profiles, medicines, logs, ai_history
- RLS: user-scoped read/write policies

A Next.js route exists at /api/chat but is currently a placeholder that returns HTTP 501.

## 2.5 WebView Bridge (Detailed)

Native side message handlers support:

- CACHE_LOAD: web requests native cached keys
- CACHE_SET: intended native write path
- CACHE_REMOVE: intended native delete path
- SCHEDULE_NOTIFICATION: schedule local notification

Current injected script in mobile shell posts CACHE_LOAD on startup and expects CACHE_LOAD_RESPONSE.

Important observation:

- The current injected script no longer overrides localStorage.setItem/removeItem to emit CACHE_SET/CACHE_REMOVE.
- Handler support exists in native code, but outbound emission for set/remove is currently absent in injected JS.

Implication:

- Cache restoration from AsyncStorage is wired.
- Ongoing write-through from web localStorage to AsyncStorage depends on whether web code emits CACHE_SET explicitly (it currently does not).

## 2.6 Storage Synchronization Logic

Web state cache:

- Key: medicare-offline-cache
- Stored in browser localStorage
- Payload includes profile, medicines, logs, schedule snapshot, last AI result, timestamp

Store behavior:

1. initializeAuth reads local cache first.
2. UI hydrates from cache as offline baseline.
3. Supabase session/data fetch runs next.
4. On success, state and local cache are refreshed; syncStatus becomes synced.

Mobile cache layer:

- AsyncStorage key namespace: @medicare_cache:<key>
- Supports cached key retrieval for WebView startup hydration.

Lock preference coupling:

- Native reads @medicare_lock_enabled first, and may fallback to parsing persisted web store payload.

## 3) Key Feature Breakdown

## 3.1 Authentication + Session

- signUpWithEmail and signInWithEmail use Supabase Auth APIs.
- Auth bootstrap and onAuthStateChange listener synchronize session and user data.
- Missing profile rows are created during runtime hydration path.

## 3.2 Biometric App Lock

- Controlled by appLockEnabled setting in web Settings page and persisted store.
- Native shell checks lock state on startup and on foreground transitions.
- authenticateAsync is configured with disableDeviceFallback=false, enabling device credential fallback.

## 3.3 Offline Caching

- Cache-first load implemented in store initializeAuth.
- Cache refresh triggered on profile/medicine/log/AI operations.
- Sync timestamp is captured and surfaced in settings.

## 3.4 Notifications

- Mobile shell requests notification permission.
- Android notification channel is configured.
- Web dashboard test button sends SCHEDULE_NOTIFICATION to native shell.

## 3.5 App Lifecycle Handling

- AppState listener detects background -> active transitions.
- If lock is enabled, app is re-locked and re-authentication is required.

## 4) Data Handling and Security

## 4.1 Storage Strategy

- localStorage (web): Zustand persisted preferences + medicare-offline-cache payload.
- AsyncStorage (mobile): mirrored cache keys and lock flag.

## 4.2 Security Considerations

Strengths:

- RLS policies are comprehensive for all domain tables.
- App lock integrates biometric + device fallback.
- Supabase client enforces env-based setup and does not hardcode fallback credentials.

Risks:

- localStorage/AsyncStorage are not encrypted-by-default secure vaults.
- Mobile bridge currently restores cache from AsyncStorage but lacks active set/remove emission in injected JS, reducing reliability of bidirectional cache sync.
- WebView originWhitelist is broad (*) while request filtering uses startsWith(WEB_URL); this should be narrowed further for defense-in-depth.

## 5) Strengths

- Shared domain logic across platforms reduces duplication.
- Clear separation of concerns: UI components, state orchestration, service access, SQL schema.
- Robust Supabase schema with RLS and consistency checks.
- Offline-first store hydration improves user continuity.
- Practical mobile-native integration without duplicating web feature development.

## 6) Weaknesses / Risks

- Bridge asymmetry: CACHE_SET/CACHE_REMOVE handlers exist but are not emitted by injected JS in current state.
- AI feature is persistence-only; actual conversational intelligence backend is not yet integrated.
- Limited automated testing coverage visible in repository.
- Notification trigger currently hardcoded to a short delay for demo behavior.
- Potential runtime mismatch between remote WEB_URL deployment behavior and expected local development behavior in mobile shell.

## 7) Suggested Improvements

## 7.1 Architecture and Reliability

- Reintroduce explicit localStorage setItem/removeItem interception in injected JS for deterministic CACHE_SET/CACHE_REMOVE mirroring.
- Add schema/type contracts for bridge message payloads shared between web and native to prevent drift.
- Move to an explicit bridge adapter module with typed event enums used by both shells.

## 7.2 Security Hardening

- Use secure storage mechanisms for sensitive preferences/session-adjacent data where feasible.
- Tighten WebView URL allowlist and validate all bridge messages more defensively.
- Add anti-tampering checks on parsed bridge payload shape.

## 7.3 Product and Feature Readiness

- Implement real AI provider integration behind /api/chat and persist response metadata.
- Add conflict-handling strategy for offline writes if future local mutation queue is introduced.
- Add medicine reminders scheduler tied to actual timing data rather than fixed test delay.

## 7.4 Engineering Quality

- Add unit tests for store actions and cache helpers.
- Add integration tests for auth bootstrap and route gating.
- Add E2E tests for mobile lock, cache restoration, and notification trigger path.
- Add CI validation pipeline for web build/lint and mobile type checks.

## 8) Assumptions and Notes

- This report is based strictly on code currently present in repository, including the latest mobile/App.tsx edits.
- Binary assets (png, ico) were inventoried by path but not semantically analyzed.
- package-lock.json is treated as generated dependency metadata rather than handwritten business logic.
