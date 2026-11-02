/**
 * 认证相关类型定义
 * 基于原项目 src/modules/login.js 和 src/core/connection.js
 */

// 登录凭据
export interface LoginCredentials {
  apiBase: string;
  managementKey: string;
  rememberPassword?: boolean;
}

/** Backend-authoritative scope of the management key used by this session. */
export type ManagementScope = 'full-access' | 'read-only';

/** Management key metadata; the backend never returns the secret itself. */
export interface ManagementKeyMetadata {
  id: string;
  name: string;
  scope: ManagementScope;
}

// 认证状态
export interface AuthState {
  isAuthenticated: boolean;
  apiBase: string;
  managementKey: string;
  rememberPassword: boolean;
  serverVersion: string | null;
  serverBuildDate: string | null;
  supportsPlugin: boolean;
  /** Scope of the current session; null until `/session` answers and after logout. */
  scope: ManagementScope | null;
}

// 连接状态
export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';
