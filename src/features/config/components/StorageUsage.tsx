import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { IconRefreshCw } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiClient } from '@/services/api/client';
import { storageApi, type StorageUsage as StorageSnapshot } from '@/services/api/storage';
import { clickHouseSegments, formatStorageBytes, storageSegments } from '../storageUsage';
import styles from './StorageUsage.module.scss';
import fieldStyles from './fields/Field.module.scss';

const S = (key: string) => `config_management.visual.sections.analytics.storage_usage.${key}`;
const subscribe = (listener: () => void) => apiClient.onConnectionChange(listener);
const connectionRevision = () => apiClient.getConnectionRevision();

/** Remount on connection changes so a previous host's readings never remain visible. */
export function StorageUsage({ wide }: { wide?: boolean }) {
  const revision = useSyncExternalStore(subscribe, connectionRevision, connectionRevision);
  return (
    <div className={`${fieldStyles.row} ${fieldStyles.rowCell} ${wide ? fieldStyles.rowWide : ''}`}>
      <StorageUsageSession key={revision} revision={revision} />
    </div>
  );
}

function StorageUsageSession({ revision }: { revision: number }) {
  const { t, i18n } = useTranslation();
  const [snapshot, setSnapshot] = useState<StorageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'unavailable' | 'unsupported' | null>(null);
  const request = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const isCurrent = () =>
      !controller.signal.aborted && revision === apiClient.getConnectionRevision();
    setLoading(true);
    try {
      const next = await storageApi.get(controller.signal);
      if (!isCurrent()) return;
      setSnapshot(next);
      setError(null);
    } catch (cause) {
      if (!isCurrent()) return;
      setError((cause as { status?: number }).status === 404 ? 'unsupported' : 'unavailable');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [revision]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 60_000);
    return () => {
      window.clearInterval(timer);
      request.current?.abort();
    };
  }, [refresh]);

  const bytes = (value: number) => formatStorageBytes(value, i18n.language);
  const percent = (value: number) => {
    const formatted = new Intl.NumberFormat(i18n.language, {
      style: 'percent',
      maximumFractionDigits: value > 0 && value < 1 ? 2 : 1,
    }).format((value > 0 ? Math.max(0.01, value) : 0) / 100);
    return value > 0 && value < 0.01 ? `<${formatted}` : formatted;
  };

  const clickHouse = snapshot?.clickhouse;
  const used = (capacity: number, available: number) => capacity - Math.min(capacity, available);

  return (
    <div className={styles.root} aria-busy={loading}>
      <div className={styles.heading}>
        <h4>{t(S('title'))}</h4>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<IconRefreshCw size={14} />}
          loading={loading}
          onClick={() => void refresh()}
          aria-label={t(S('refresh'))}
        >
          {t('common.refresh')}
        </Button>
      </div>

      {loading && !snapshot && !error && (
        <div role="status" aria-label={t('common.loading')} className={styles.skeleton}>
          <Skeleton width="65%" height={16} />
          <Skeleton height={12} rounded={6} />
          <Skeleton width="85%" height={16} />
        </div>
      )}

      {error && (
        <p className={styles.warning} role="status">
          {t(S(error))}
        </p>
      )}

      {snapshot && (
        <>
          {snapshot.partial && (
            <p className={styles.warning} role="status">
              {t(S('partial'))}
            </p>
          )}
          {snapshot.volumes.length === 0 && <p className={styles.note}>{t(S('empty'))}</p>}
          {snapshot.volumes.map((volume) => {
            const segments = storageSegments(volume);
            const summary = t(S('used'), {
              used: bytes(used(volume.capacityBytes, volume.availableBytes)),
              capacity: bytes(volume.capacityBytes),
            });
            return (
              <div key={volume.path} className={styles.volume}>
                <div className={styles.volumeHeading}>
                  <span className={styles.drive}>
                    <span>{t(S('drive'))}</span>
                    <code>{volume.path}</code>
                  </span>
                  <span className={styles.summary}>{summary}</span>
                </div>
                <div className={styles.bar} role="img" aria-label={summary}>
                  {segments.map((segment) => (
                    <span
                      key={segment.key}
                      className={styles[segment.key]}
                      style={{ width: `${segment.percent}%` }}
                    />
                  ))}
                </div>
                <ul className={styles.legend}>
                  {segments.map((segment) => (
                    <li key={segment.key}>
                      <span className={`${styles.dot} ${styles[segment.key]}`} aria-hidden="true" />
                      <span>{t(S(segment.key))}</span>
                      <span className={styles.amount}>{bytes(segment.bytes)}</span>
                      <span className={styles.percent}>{percent(segment.percent)}</span>
                    </li>
                  ))}
                </ul>
                <details className={styles.details}>
                  <summary>{t(S('locations'))}</summary>
                  <p className={styles.note}>{t(S('scope'))}</p>
                  <ul>
                    {volume.locations.map((location) => (
                      <li key={`${location.category}:${location.path}`}>
                        <span>{t(S(location.category))}</span>
                        <code>{location.path}</code>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            );
          })}

          {clickHouse && !clickHouse.reachable && (
            <p className={styles.warning} role="status">
              {t(S('clickhouse_unreachable'), {
                database: clickHouse.database,
                reason: clickHouse.message || t(S('clickhouse_unreachable_generic')),
              })}
            </p>
          )}

          {clickHouse?.reachable && (
            <>
              {clickHouse.partial && (
                <p className={styles.warning} role="status">
                  {t(S('clickhouse_partial'))}
                </p>
              )}
              {clickHouse.disks.length === 0 && (
                <p className={styles.note}>{t(S('clickhouse_empty'))}</p>
              )}
              {clickHouse.disks.map((disk) => {
                const segments = clickHouseSegments(disk);
                const summary = t(S('used'), {
                  used: bytes(used(disk.capacityBytes, disk.availableBytes)),
                  capacity: bytes(disk.capacityBytes),
                });
                return (
                  <div key={`${disk.name}:${disk.path}`} className={styles.volume}>
                    <div className={styles.volumeHeading}>
                      <span className={styles.drive}>
                        <span>{t(S('clickhouse_drive'))}</span>
                        <code>{disk.name}</code>
                      </span>
                      <span className={styles.summary}>{summary}</span>
                    </div>
                    <div className={styles.bar} role="img" aria-label={summary}>
                      {segments.map((segment) => (
                        <span
                          key={segment.key}
                          className={styles[segment.key]}
                          style={{ width: `${segment.percent}%` }}
                        />
                      ))}
                    </div>
                    <ul className={styles.legend}>
                      {segments.map((segment) => (
                        <li key={segment.key}>
                          <span className={`${styles.dot} ${styles[segment.key]}`} aria-hidden="true" />
                          <span>{t(S(segment.key))}</span>
                          <span className={styles.amount}>{bytes(segment.bytes)}</span>
                          <span className={styles.percent}>{percent(segment.percent)}</span>
                        </li>
                      ))}
                    </ul>
                    <details className={styles.details}>
                      <summary>{t(S('clickhouse_details'))}</summary>
                      <p className={styles.note}>{t(S('clickhouse_scope'))}</p>
                      <ul>
                        <li>
                          <span>{t(S('clickhouse_database'))}</span>
                          <code>{clickHouse.database}</code>
                        </li>
                        <li>
                          <span>{t(S('clickhouse_path'))}</span>
                          <code>{disk.path}</code>
                        </li>
                        {disk.keepFreeBytes > 0 && (
                          <li>
                            <span>{t(S('clickhouse_keep_free'))}</span>
                            <code>{bytes(disk.keepFreeBytes)}</code>
                          </li>
                        )}
                      </ul>
                    </details>
                  </div>
                );
              })}
            </>
          )}

          <div className={styles.footer}>
            <time dateTime={snapshot.measuredAt}>
              {t(S('updated'), {
                time: new Date(snapshot.measuredAt).toLocaleTimeString(i18n.language, {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })}
            </time>
          </div>
        </>
      )}
    </div>
  );
}
