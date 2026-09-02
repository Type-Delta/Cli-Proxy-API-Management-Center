export function resolveAnalyticsAsyncState(loading: boolean, error: string, hasContent: boolean) {
  if (loading && !hasContent) return 'initial-loading' as const;
  if (error && !hasContent) return 'error' as const;
  return 'content' as const;
}
