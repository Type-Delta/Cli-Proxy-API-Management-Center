import { describe, expect, mock, test } from 'bun:test';
import {
  capabilitiesApi,
  INVALID_MANAGEMENT_CAPABILITIES_RESPONSE,
} from '@/services/api/capabilities';
import { apiClient } from '@/services/api/client';

describe('management capabilities API adapter', () => {
  test('rejects an HTML fallback instead of passing it to analytics pages', async () => {
    const originalGet = apiClient.get;
    apiClient.get = mock(async () => '<!doctype html><html><body>Management Center</body></html>') as
      typeof apiClient.get;

    try {
      await expect(capabilitiesApi.get()).rejects.toThrow(
        INVALID_MANAGEMENT_CAPABILITIES_RESPONSE
      );
    } finally {
      apiClient.get = originalGet;
    }
  });
});
