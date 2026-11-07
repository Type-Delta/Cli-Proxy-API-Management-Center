import { expect, mock, test } from 'bun:test';
import { analyticsApi } from '@/services/api/analytics';
import { apiClient } from '@/services/api/client';

const range = {
  start: '2026-11-07T00:00:00Z',
  end: '2026-11-08T00:00:00Z',
  time_zone: 'UTC',
};
const attempt = 'a'.repeat(32);

test('event details load when a privacy filter blocks /analytics/event URLs', async () => {
  const original = apiClient.get;
  const event = { attempt_id: attempt };
  const get = mock(async (path: string) => {
    // EasyPrivacy general rule: /analytics/event$domain=~app.diagrams.net.
    if (path.includes('/analytics/event')) throw new Error('Network Error');
    return event;
  });
  apiClient.get = get as typeof apiClient.get;
  try {
    expect(await analyticsApi.event(attempt, range)).toEqual(event);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]?.[0]).toStartWith(`/analytics/attempts/${attempt}?`);
  } finally {
    apiClient.get = original;
  }
});

for (const status of [404, 405]) {
  test(`event details use the legacy URL when an older server answers ${status}`, async () => {
    const original = apiClient.get;
    const event = { attempt_id: attempt };
    const get = mock(async (path: string) => {
      if (path.includes('/attempts/')) throw Object.assign(new Error('Route missing'), { status });
      return event;
    });
    apiClient.get = get as typeof apiClient.get;
    try {
      expect(await analyticsApi.event(attempt, range)).toEqual(event);
      expect(get).toHaveBeenCalledTimes(2);
      expect(get.mock.calls[1]?.[0]).toBe(
        get.mock.calls[0]?.[0]?.replace('/attempts/', '/events/')
      );
    } finally {
      apiClient.get = original;
    }
  });
}

for (const error of [
  new Error('Network Error'),
  Object.assign(new Error('Not found'), { status: 404, apiCode: 'analytics_invalid_query' }),
  Object.assign(new Error('Forbidden'), { status: 403 }),
  Object.assign(new Error('Throttled'), { status: 429 }),
]) {
  test(`event details preserve ${error.message} without a second request`, async () => {
    const original = apiClient.get;
    const get = mock(async () => {
      throw error;
    });
    apiClient.get = get as typeof apiClient.get;
    try {
      await expect(analyticsApi.event(attempt, range)).rejects.toBe(error);
      expect(get).toHaveBeenCalledTimes(1);
    } finally {
      apiClient.get = original;
    }
  });
}

test('event detail fallback cannot replay a request on a different connection', async () => {
  const original = apiClient.get;
  const apiBase = apiClient.getApiBase();
  const get = mock(async () => {
    apiClient.setConfig({ apiBase: 'https://changed.invalid', managementKey: 'fixture-only' });
    throw Object.assign(new Error('Route missing'), { status: 404 });
  });
  apiClient.get = get as typeof apiClient.get;
  try {
    await expect(analyticsApi.event(attempt, range)).rejects.toThrow('Route missing');
    expect(get).toHaveBeenCalledTimes(1);
  } finally {
    apiClient.get = original;
    apiClient.setConfig({ apiBase, managementKey: '' });
  }
});
