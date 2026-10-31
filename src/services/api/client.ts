/**
 * Axios client for the Management API, replacing the original project's src/core/api-client.js.
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import type { ApiClientConfig, ApiError } from '@/types';
import {
  BUILD_DATE_HEADER_KEYS,
  CPA_BUILD_DATE_HEADER_KEYS,
  CPA_SUPPORT_PLUGIN_HEADER_KEYS,
  CPA_VERSION_HEADER_KEYS,
  REQUEST_TIMEOUT_MS,
  VERSION_HEADER_KEYS,
} from '@/utils/constants';
import { computeApiUrl } from '@/utils/connection';
import { parseApiErrorResponse } from './apiError';

/** `Retry-After` (seconds) attached by the client whenever the server throttles a request. */
export type ApiErrorWithRetry = ApiError & { retryAfterSeconds?: number };

/** Accepts both `Retry-After` forms: delta-seconds and an HTTP date. */
export function parseRetryAfterSeconds(
  value: string | null | undefined,
  now: number = Date.now()
): number | null {
  const text = (value ?? '').trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);
  const at = Date.parse(text);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

class ApiClient {
  private instance: AxiosInstance;
  private apiBase: string = '';
  private managementKey: string = '';
  private connectionRevision = 0;
  private connectionListeners = new Set<(revision: number) => void>();

  constructor(private readonly emitEvents: () => boolean = () => true) {
    this.instance = axios.create({
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  /**
   * Applies the server address, management key, and timeout used by later requests.
   */
  setConfig(config: ApiClientConfig): void {
    const apiBase = computeApiUrl(config.apiBase);
    const changed = apiBase !== this.apiBase || config.managementKey !== this.managementKey;
    if (changed) {
      this.connectionRevision += 1;
    }
    this.apiBase = apiBase;
    this.managementKey = config.managementKey;

    if (config.timeout) {
      this.instance.defaults.timeout = config.timeout;
    } else {
      this.instance.defaults.timeout = REQUEST_TIMEOUT_MS;
    }

    if (changed) {
      for (const listener of this.connectionListeners) listener(this.connectionRevision);
    }
  }

  /**
   * Registers a listener for connection changes (server address or management key), which fire
   * after the increment shown by `getConnectionRevision`. Domain modules use this to drop caches
   * whose entries belong to the previous session.
   */
  onConnectionChange(listener: (revision: number) => void): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  getApiBase(): string {
    return this.apiBase;
  }

  /** Guards read/modify/write operations across connection changes, including ABA switches. */
  getConnectionRevision(): number {
    return this.connectionRevision;
  }

  /** Pin credentials and suppress response side effects after the owning connection changes. */
  captureConnection(): ApiClient {
    const revision = this.connectionRevision;
    const client = new ApiClient(() => this.connectionRevision === revision);
    client.apiBase = this.apiBase;
    client.managementKey = this.managementKey;
    return client;
  }

  private readHeader(headers: Record<string, unknown> | undefined, keys: string[]): string | null {
    if (!headers) return null;

    const normalizeValue = (value: unknown): string | null => {
      if (value === undefined || value === null) return null;
      if (Array.isArray(value)) {
        const first = value.find(
          (entry) => entry !== undefined && entry !== null && String(entry).trim()
        );
        return first !== undefined ? String(first) : null;
      }
      const text = String(value);
      return text ? text : null;
    };

    const headerGetter = (headers as { get?: (name: string) => unknown }).get;
    if (typeof headerGetter === 'function') {
      for (const key of keys) {
        const match = normalizeValue(headerGetter.call(headers, key));
        if (match) return match;
      }
    }

    const entries =
      typeof (headers as { entries?: () => Iterable<[string, unknown]> }).entries === 'function'
        ? Array.from((headers as { entries: () => Iterable<[string, unknown]> }).entries())
        : Object.entries(headers);

    const normalized = Object.fromEntries(
      entries.map(([key, value]) => [String(key).toLowerCase(), value])
    );
    for (const key of keys) {
      const match = normalizeValue(normalized[key.toLowerCase()]);
      if (match) return match;
    }
    return null;
  }

  private readBooleanHeader(
    headers: Record<string, unknown> | undefined,
    keys: string[]
  ): boolean | null {
    const value = this.readHeader(headers, keys);
    if (value === null) return null;

    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return null;
  }

  /**
   * Installs the request and response interceptors.
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.instance.interceptors.request.use(
      (config) => {
        // Base URL
        config.baseURL = this.apiBase;

        // Bearer authentication
        if (this.managementKey) {
          config.headers.Authorization = `Bearer ${this.managementKey}`;
        }

        return config;
      },
      (error) => Promise.reject(this.handleError(error))
    );

    // Response interceptor
    this.instance.interceptors.response.use(
      (response) => {
        const headers = response.headers as Record<string, string | undefined>;
        const cpaVersion = this.readHeader(headers, CPA_VERSION_HEADER_KEYS);
        const cpaBuildDate = this.readHeader(headers, CPA_BUILD_DATE_HEADER_KEYS);
        const version = cpaVersion || this.readHeader(headers, VERSION_HEADER_KEYS);
        const buildDate = cpaBuildDate || this.readHeader(headers, BUILD_DATE_HEADER_KEYS);
        const supportsPlugin = this.readBooleanHeader(headers, CPA_SUPPORT_PLUGIN_HEADER_KEYS);

        // Dispatch version updates for store consumers
        if (this.emitEvents() && (version || buildDate)) {
          window.dispatchEvent(
            new CustomEvent('server-version-update', {
              detail: { version: version || null, buildDate: buildDate || null },
            })
          );
        }
        if (this.emitEvents() && supportsPlugin !== null) {
          window.dispatchEvent(
            new CustomEvent('server-plugin-support-update', {
              detail: { supportsPlugin },
            })
          );
        }

        return response;
      },
      (error) => Promise.reject(this.handleError(error))
    );
  }

  /**
   * Normalizes a transport failure into an `ApiError`.
   */
  private handleError(error: unknown): ApiError {
    if (axios.isAxiosError(error)) {
      const responseData: unknown = error.response?.data;
      const parsedError = parseApiErrorResponse(responseData, error.message);
      const apiError = new Error(parsedError.message) as ApiErrorWithRetry;
      apiError.name = 'ApiError';
      apiError.status = error.response?.status;
      if (error.response?.status === 429) {
        const header = this.readHeader(
          error.response.headers as Record<string, unknown> | undefined,
          ['Retry-After']
        );
        apiError.retryAfterSeconds = parseRetryAfterSeconds(header) ?? 60;
      }
      apiError.code = error.code;
      apiError.apiCode = parsedError.apiCode;
      apiError.details = responseData;
      apiError.data = responseData;

      // Dispatch logout for unauthorized responses
      if (this.emitEvents() && error.response?.status === 401) {
        window.dispatchEvent(new Event('unauthorized'));
      }

      return apiError;
    }

    const fallbackMessage =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Unknown error occurred';
    const fallback = new Error(fallbackMessage) as ApiError;
    fallback.name = 'ApiError';
    return fallback;
  }

  /**
   * GET, resolving with the response body.
   */
  async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.get<T>(url, config);
    return response.data;
  }

  /**
   * POST, resolving with the response body.
   */
  async post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.post<T>(url, data, config);
    return response.data;
  }

  /**
   * PUT, resolving with the response body.
   */
  async put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.put<T>(url, data, config);
    return response.data;
  }

  /**
   * PATCH, resolving with the response body.
   */
  async patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.patch<T>(url, data, config);
    return response.data;
  }

  /**
   * DELETE, resolving with the response body.
   */
  async delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.delete<T>(url, config);
    return response.data;
  }

  /**
   * Full response, for downloads and other callers that need the status or headers.
   */
  async getRaw(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse> {
    return this.instance.get(url, config);
  }

  async postRaw(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse> {
    return this.instance.post(url, data, config);
  }

  /**
   * Sends a multipart form body.
   */
  async postForm<T = unknown>(
    url: string,
    formData: FormData,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.instance.post<T>(url, formData, {
      ...config,
      headers: {
        ...(config?.headers || {}),
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }
}

// Shared singleton
export const apiClient = new ApiClient();
