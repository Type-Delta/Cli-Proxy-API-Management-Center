import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { AnimatedMetric } from '../../components/AnimatedMetric';
import type { AnalyticsModelLeaderboardMetric, AnalyticsModelLeaderboardRow } from '@/types';
import { formatLeaderboardValue, podiumSlots, runnersUpRows } from './modelLeaderboardModel';
import {
  markMascotUrlBroken,
  resolveModelAvatar,
  resolveModelFamily,
  resolveModelLogo,
} from './mascots';
import styles from './ModelLeaderboard.module.scss';

const UNIT_KEYS = {
  most_used: 'unit_sessions',
  most_reliable: 'unit_success',
  speed: 'unit_speed',
  most_talkative: 'unit_tokens',
} as const satisfies Record<AnalyticsModelLeaderboardMetric, string>;

const MEDAL_CLASS: Record<number, string> = {
  1: styles.podFirst,
  2: styles.podSecond,
  3: styles.podThird,
};

const STEP_CLASS: Record<number, string> = {
  1: styles.stepFirst,
  2: styles.stepSecond,
  3: styles.stepThird,
};

/** Integer precision for the count-up: reliability shows 2 decimals of a %, speed shows 1. */
const VALUE_SCALE = {
  most_used: 1,
  most_reliable: 10_000,
  speed: 10,
  most_talkative: 1,
} as const satisfies Record<AnalyticsModelLeaderboardMetric, number>;

const RANK_KEYS = { 1: 'rank_first', 2: 'rank_second', 3: 'rank_third' } as const;

/**
 * A failed mascot img is remembered module-wide (see 'markMascotUrlBroken'); the returned handler
 * records the url and re-renders so 'resolveModelAvatar' swaps in the lab logo with no retry.
 */
function useMascotOnError() {
  const [, setFailures] = useState(0);
  return useCallback((url: string) => {
    markMascotUrlBroken(url);
    setFailures((count) => count + 1);
  }, []);
}

/**
 * The small glyph beside a model name; pure decoration, the name carries the meaning. It always
 * shows the lab logo, because a mascot photo is unreadable at 14px.
 */
function FamilyGlyph({ model, className }: { model: string; className: string }) {
  const logo = resolveModelLogo(model);
  if (!logo) return null;
  return (
    <>
      <img
        className={
          className +
          ' ' +
          styles.glyphLight +
          ' ' +
          (logo.darkSrc ? styles.glyphHasDark : styles.glyphInvert)
        }
        src={logo.src}
        alt=""
        aria-hidden="true"
        loading="lazy"
      />
      {logo.darkSrc && (
        <img
          className={className + ' ' + styles.glyphDark}
          src={logo.darkSrc}
          alt=""
          aria-hidden="true"
          loading="lazy"
        />
      )}
    </>
  );
}

function avatarAlt(model: string, kind: 'mascot' | 'logo', t: TFunction) {
  const family = resolveModelFamily(model);
  const familyLabel = t('analytics.leaderboard.family_' + (family ?? 'unknown'));
  return t(
    kind === 'mascot' ? 'analytics.leaderboard.avatar_mascot' : 'analytics.leaderboard.avatar_logo',
    { family: familyLabel }
  );
}

/** Keeps the lab logo visible until this optional image has decoded, including on cache hits. */
function MascotImage({
  model,
  src,
  className = '',
  onError,
}: {
  model: string;
  src: string;
  className?: string;
  onError: (url: string) => void;
}) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState(false);
  return (
    <span className={styles.avatarArt + ' ' + className} data-avatar-loading={!loaded}>
      {!loaded && (
        <span className={styles.avatarFallback} role="img" aria-label={avatarAlt(model, 'logo', t)}>
          <FamilyGlyph model={model} className={styles.avatarLogo} />
        </span>
      )}
      <img
        className={styles.avatarMascot}
        src={src}
        alt={avatarAlt(model, 'mascot', t)}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => onError(src)}
      />
    </span>
  );
}

/** Neutral bars reserve each rank's text, avatar, and podium space until rankings arrive. */
function PodSkeleton({ rank }: { rank: 1 | 2 | 3 }) {
  return (
    <li className={styles.pod + ' ' + MEDAL_CLASS[rank]} aria-hidden="true">
      <div className={styles.name}>
        <Skeleton width="80%" height={12} rounded={6} />
      </div>
      <div className={styles.value}>
        <Skeleton width="3ch" height="1.2em" rounded={6} />
        <Skeleton className={styles.unit} width="5ch" height="1.2em" rounded={4} />
      </div>
      <div className={styles.sub + ' ' + styles.skeletonLine}>
        <Skeleton width="80%" height={11} rounded={6} />
      </div>
      <Skeleton className={rank === 1 ? styles.frameLg : styles.frameMd} rounded={16} />
      <Skeleton className={styles.skeletonStep + ' ' + STEP_CLASS[rank]} />
    </li>
  );
}

/**
 * One award: header and runners-up in the right column, the 2nd-1st-3rd podium on the left.
 * Loading and empty awards retain the podium space; partial podiums keep placeholder slots.
 */
export function ModelLeaderboardAwardCard({
  metric,
  rows,
  runnersCollapsed,
  refreshing = false,
  loading = false,
}: {
  metric: AnalyticsModelLeaderboardMetric;
  rows: AnalyticsModelLeaderboardRow[];
  runnersCollapsed: boolean;
  /** Reload over existing data: keep the card and show the Usage-style corner pill. */
  refreshing?: boolean;
  /** First load keeps the real card header and reserves the ranking layout. */
  loading?: boolean;
}) {
  const onMascotError = useMascotOnError();
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || undefined;
  // Mobile users may collapse the runners-up; wide layouts always show them.
  const [runnersOpen, setRunnersOpen] = useState(false);
  const headingId = 'leaderboard-award-' + metric;
  const podium = podiumSlots(rows);
  const runners = runnersUpRows(rows);
  const valueOf = (row: AnalyticsModelLeaderboardRow) =>
    formatLeaderboardValue(metric, row.value, locale);

  const subline = (row: AnalyticsModelLeaderboardRow): string => {
    switch (metric) {
      case 'most_used':
        return row.providers === undefined
          ? ''
          : t('analytics.leaderboard.providers', { count: row.providers });
      case 'most_reliable':
        return row.attempts === undefined || row.failed === undefined
          ? ''
          : t('analytics.leaderboard.failed', { failed: row.failed, attempts: row.attempts });
      case 'speed':
        if (row.samples === undefined) return '';
        return row.attempts === undefined
          ? t('analytics.leaderboard.measured', { count: row.samples })
          : t('analytics.leaderboard.speed_coverage', {
              samples: row.samples,
              attempts: row.attempts,
            });
      case 'most_talkative':
        // A zero share usually means the provider never broke reasoning out, so it is not shown.
        return !row.reasoning_share
          ? ''
          : t('analytics.leaderboard.reasoning', {
              percent: Math.round(row.reasoning_share * 100),
            });
    }
  };

  const renderAvatar = (model: string) => {
    const avatar = resolveModelAvatar(model);
    if (avatar.kind === 'placeholder') {
      return (
        <span
          className={styles.avatarPlaceholder}
          role="img"
          aria-label={t('analytics.leaderboard.avatar_placeholder')}
        />
      );
    }
    if (avatar.kind === 'mascot') {
      return (
        <>
          <MascotImage
            key={avatar.art.src}
            model={model}
            src={avatar.art.src}
            className={styles.glyphLight + (avatar.art.darkSrc ? ' ' + styles.glyphHasDark : '')}
            onError={onMascotError}
          />
          {avatar.art.darkSrc && (
            <MascotImage
              key={avatar.art.darkSrc}
              model={model}
              src={avatar.art.darkSrc}
              className={styles.glyphDark}
              onError={() => onMascotError(avatar.art.src)}
            />
          )}
        </>
      );
    }
    return (
      <>
        <img
          className={
            styles.glyphLight +
            ' ' +
            (avatar.art.darkSrc ? styles.glyphHasDark : styles.glyphInvert) +
            ' ' +
            styles.avatarLogo
          }
          src={avatar.art.src}
          alt={avatarAlt(model, avatar.kind, t)}
          loading="lazy"
        />
        {avatar.art.darkSrc && (
          <img
            className={styles.glyphDark + ' ' + styles.avatarLogo}
            src={avatar.art.darkSrc}
            alt=""
            aria-hidden="true"
            loading="lazy"
          />
        )}
      </>
    );
  };

  return (
    <section
      className={'card ' + styles.award}
      aria-labelledby={headingId}
      aria-busy={loading || refreshing || undefined}
    >
      {refreshing && (
        <div className={styles.refreshing} role="status">
          <LoadingSpinner size={14} />
          <span>{t('analytics.refreshing')}</span>
        </div>
      )}
      <header className={styles.awardHead}>
        <h2 id={headingId} className={styles.awardTitle}>
          {t('analytics.leaderboard.award_' + metric + '_title')}
        </h2>
        <p className={styles.awardDescription}>
          {t('analytics.leaderboard.award_' + metric + '_description')}
        </p>
      </header>
      {loading && (
        <span className={styles.srOnly} role="status">
          {t('common.loading')}
        </span>
      )}
      {!loading && rows.length === 0 && (
        <div className={styles.awardEmpty}>
          <EmptyState title={t('analytics.leaderboard.empty_' + metric)} />
        </div>
      )}
      <ol className={styles.podium} aria-hidden={(!loading && rows.length === 0) || undefined}>
        {loading || rows.length === 0
          ? ([2, 1, 3] as const).map((rank) => <PodSkeleton key={rank} rank={rank} />)
          : podium.map((slot) =>
              slot.kind === 'placeholder' ? (
                <li
                  key={'placeholder-' + slot.rank}
                  className={styles.pod}
                  data-podium-placeholder=""
                  aria-hidden="true"
                >
                  <span className={styles.name}>&nbsp;</span>
                  <span
                    className={styles.frame + ' ' + styles.frameMd + ' ' + styles.framePlaceholder}
                  />
                  <span className={styles.step + ' ' + styles.stepPlaceholder} />
                </li>
              ) : (
                <li
                  key={slot.row.rank}
                  className={styles.pod + ' ' + (MEDAL_CLASS[slot.row.rank] ?? '')}
                >
                  <span className={styles.name}>
                    <FamilyGlyph model={slot.row.model} className={styles.nameGlyph} />
                    <span className={styles.nameText} title={slot.row.model}>
                      {slot.row.model}
                    </span>
                  </span>
                  <span className={styles.value}>
                    {/* Same count-up as the Usage cards; the scale keeps the shown decimals. */}
                    <AnimatedMetric
                      value={slot.row.value}
                      scale={VALUE_SCALE[metric]}
                      format={(value) => formatLeaderboardValue(metric, value, locale)}
                    />
                    <span className={styles.unit}>
                      {t('analytics.leaderboard.' + UNIT_KEYS[metric])}
                    </span>
                  </span>
                  <span className={styles.sub} title={subline(slot.row)}>
                    {subline(slot.row)}
                  </span>
                  <span
                    className={
                      styles.frame +
                      ' ' +
                      (slot.row.rank === 1 ? styles.frameLg : styles.frameMd) +
                      (resolveModelAvatar(slot.row.model).kind === 'logo'
                        ? ' ' + styles.frameLogo
                        : '')
                    }
                  >
                    {renderAvatar(slot.row.model)}
                    <span className={styles.medal}>
                      {t('analytics.leaderboard.' + RANK_KEYS[slot.row.rank as 1 | 2 | 3])}
                    </span>
                  </span>
                  <span
                    className={styles.step + ' ' + (STEP_CLASS[slot.row.rank] ?? '')}
                    aria-hidden="true"
                  />
                </li>
              )
            )}
      </ol>
      <details
        className={styles.runners + (loading ? ' ' + styles.runnersLoading : '')}
        data-empty={(!loading && runners.length === 0) || undefined}
        aria-hidden={loading || runners.length === 0 || undefined}
        open={runnersCollapsed ? runnersOpen : true}
        onToggle={(event) => {
          if (runnersCollapsed) setRunnersOpen(event.currentTarget.open);
        }}
      >
        <summary
          className={styles.runnersSummary}
          tabIndex={loading ? -1 : undefined}
          onClick={(event) => {
            if (loading || !runnersCollapsed) event.preventDefault();
          }}
        >
          {loading ? (
            <Skeleton width={80} height={12} rounded={6} />
          ) : (
            runners.length > 0 && t('analytics.leaderboard.runners_up')
          )}
        </summary>
        <ol className={styles.runnerList}>
          {loading || runners.length === 0
            ? [4, 5, 6].map((rank) => (
                <li key={rank} className={styles.runner}>
                  <Skeleton width="100%" height={14} rounded={6} />
                </li>
              ))
            : runners.map((row) => (
                <li key={row.rank} className={styles.runner}>
                  <span className={styles.runnerRank}>{row.rank}</span>
                  <FamilyGlyph model={row.model} className={styles.runnerGlyph} />
                  <span className={styles.runnerModel}>{row.model}</span>
                  <b className={styles.runnerValue}>{valueOf(row)}</b>
                </li>
              ))}
        </ol>
      </details>
    </section>
  );
}
