/**
 * Authentication state management.
 * Migrated from src/modules/login.js and src/core/connection.js.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthState, LoginCredentials, ConnectionStatus } from '@/types';
import { STORAGE_KEY_AUTH } from '@/utils/constants';
import { isCurrentObfuscated } from '@/utils/encryption';
import { obfuscatedStorage } from '@/services/storage/secureStorage';
import { apiClient } from '@/services/api/client';
import { LegacyBackendError, probeLegacyBackend } from '@/services/api/legacyBackendProbe';
import { managementSessionApi } from '@/services/api/managementKeys';
import { useConfigStore } from './useConfigStore';
import { useModelsStore } from './useModelsStore';
import { useQuotaStore } from './useQuotaStore';
import { useOverviewStore } from './useOverviewStore';
import { detectApiBaseFromLocation, normalizeApiBase } from '@/utils/connection';

interface AuthStoreState extends AuthState {
  connectionStatus: ConnectionStatus;

  // Actions
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  restoreSession: () => Promise<boolean>;
  /** Predicts automatic login without side effects so the first screen can choose its state. */
  hasRestorableSession: () => boolean;
  updateServerVersion: (version: string | null, buildDate?: string | null) => void;
  updateServerPluginSupport: (supportsPlugin: boolean) => void;
}

let restoreSessionPromise: Promise<boolean> | null = null;
let loginGeneration = 0;

/**
 * Automatic login requires a saved key, remember-password consent, and no subsequent logout.
 * Both session restoration and the initial screen use this predicate.
 */
export const shouldAttemptAutoLogin = (
  wasLoggedIn: boolean,
  apiBase: string,
  managementKey: string
): boolean => wasLoggedIn && Boolean(apiBase) && Boolean(managementKey);

export const useAuthStore = create<AuthStoreState>()(
  persist(
    (set, get) => ({
      // Initial state
      isAuthenticated: false,
      apiBase: '',
      managementKey: '',
      rememberPassword: false,
      serverVersion: null,
      serverBuildDate: null,
      supportsPlugin: false,
      scope: null,
      connectionStatus: 'disconnected',

      // Restore a remembered session.
      restoreSession: () => {
        if (restoreSessionPromise) return restoreSessionPromise;

        restoreSessionPromise = (async () => {
          const wasLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
          const legacyBase =
            obfuscatedStorage.getItem<string>('apiBase') ||
            obfuscatedStorage.getItem<string>('apiUrl', { encrypt: true });
          const { apiBase, managementKey, rememberPassword } = get();
          const resolvedBase = normalizeApiBase(
            apiBase || legacyBase || detectApiBaseFromLocation()
          );
          const resolvedKey = managementKey || '';
          const resolvedRememberPassword = rememberPassword;

          set({
            apiBase: resolvedBase,
            managementKey: resolvedKey,
            rememberPassword: resolvedRememberPassword,
          });
          apiClient.setConfig({ apiBase: resolvedBase, managementKey: resolvedKey });

          if (shouldAttemptAutoLogin(wasLoggedIn, resolvedBase, resolvedKey)) {
            try {
              await get().login({
                apiBase: resolvedBase,
                managementKey: resolvedKey,
                rememberPassword: resolvedRememberPassword,
              });
              return true;
            } catch (error) {
              console.warn('Auto login failed:', error);
              return false;
            }
          }

          return false;
        })();

        return restoreSessionPromise;
      },

      hasRestorableSession: () => {
        if (typeof localStorage === 'undefined') return false;
        const wasLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
        const { apiBase, managementKey } = get();
        // Session restoration can fall back to the current page origin.
        const base = apiBase || detectApiBaseFromLocation();
        return shouldAttemptAutoLogin(wasLoggedIn, base, managementKey);
      },

      // Sign in.
      login: async (credentials) => {
        const generation = ++loginGeneration;
        const apiBase = normalizeApiBase(credentials.apiBase);
        const managementKey = credentials.managementKey.trim();
        const rememberPassword = credentials.rememberPassword ?? get().rememberPassword ?? false;
        let revision = apiClient.getConnectionRevision();
        const isCurrent = () =>
          generation === loginGeneration && revision === apiClient.getConnectionRevision();

        try {
          set({
            connectionStatus: 'connecting',
            serverVersion: null,
            serverBuildDate: null,
            supportsPlugin: false,
            scope: null,
          });
          useConfigStore.getState().clearCache();
          useOverviewStore.getState().clearCache();
          useModelsStore.getState().clearCache();
          useQuotaStore.getState().clearQuotaCache();

          // Configure subsequent API requests.
          apiClient.setConfig({
            apiBase,
            managementKey,
          });

          // Read the key scope first: read-only keys may not fetch the full config, which holds
          // secrets. Full-access sessions then test the v8 config route as before and diagnose an
          // old backend only when v8 routes are missing.
          revision = apiClient.getConnectionRevision();
          const scope = await managementSessionApi.getScope();
          if (!isCurrent()) throw new Error('Connection changed during login');
          try {
            if (scope === 'full-access') await useConfigStore.getState().fetchConfig(true);
          } catch (error) {
            if (
              (error as { status?: number })?.status === 404 &&
              isCurrent() &&
              (await probeLegacyBackend(apiBase, managementKey)) &&
              isCurrent()
            ) {
              throw new LegacyBackendError();
            }
            throw error;
          }

          if (!isCurrent()) throw new Error('Connection changed during login');

          // Publish and persist only the latest login's credentials and scope.
          set({
            isAuthenticated: true,
            apiBase,
            managementKey,
            rememberPassword,
            scope,
            connectionStatus: 'connected',
          });
          if (rememberPassword) {
            localStorage.setItem('isLoggedIn', 'true');
          } else {
            localStorage.removeItem('isLoggedIn');
          }
        } catch (error: unknown) {
          if (isCurrent()) set({ connectionStatus: 'error' });
          throw error;
        }
      },

      // Sign out.
      logout: () => {
        loginGeneration += 1;
        restoreSessionPromise = null;
        apiClient.setConfig({ apiBase: '', managementKey: '' });
        useConfigStore.getState().clearCache();
        useOverviewStore.getState().clearCache();
        useModelsStore.getState().clearCache();
        useQuotaStore.getState().clearQuotaCache();
        set({
          isAuthenticated: false,
          apiBase: '',
          managementKey: '',
          serverVersion: null,
          serverBuildDate: null,
          supportsPlugin: false,
          scope: null,
          connectionStatus: 'disconnected',
        });
        localStorage.removeItem('isLoggedIn');
      },

      // Update server version metadata.
      updateServerVersion: (version, buildDate) => {
        set({
          serverVersion: version || null,
          serverBuildDate: buildDate || null,
        });
      },

      updateServerPluginSupport: (supportsPlugin) => {
        set({ supportsPlugin });
      },
    }),
    {
      name: STORAGE_KEY_AUTH,
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          // Retire all pre-v2 login credentials without decoding or migrating them.
          localStorage.removeItem('managementKey');
          const raw = localStorage.getItem(name);
          if (!raw || !isCurrentObfuscated(raw)) {
            localStorage.removeItem(name);
            localStorage.removeItem('isLoggedIn');
            return null;
          }
          const data = obfuscatedStorage.getItem<AuthStoreState>(name);
          return data ? JSON.stringify(data) : null;
        },
        setItem: (name, value) => {
          obfuscatedStorage.setItem(name, JSON.parse(value));
        },
        removeItem: (name) => {
          obfuscatedStorage.removeItem(name);
        },
      })),
      partialize: (state) => ({
        apiBase: state.apiBase,
        ...(state.rememberPassword ? { managementKey: state.managementKey } : {}),
        rememberPassword: state.rememberPassword,
        serverVersion: state.serverVersion,
        serverBuildDate: state.serverBuildDate,
      }),
    }
  )
);

// Clear the session when the API rejects its credentials.
if (typeof window !== 'undefined') {
  window.addEventListener('unauthorized', () => {
    useAuthStore.getState().logout();
  });

  window.addEventListener('server-version-update', ((e: CustomEvent) => {
    const detail = e.detail || {};
    useAuthStore.getState().updateServerVersion(detail.version || null, detail.buildDate || null);
  }) as EventListener);

  window.addEventListener('server-plugin-support-update', ((e: CustomEvent) => {
    useAuthStore.getState().updateServerPluginSupport(e.detail?.supportsPlugin === true);
  }) as EventListener);
}
