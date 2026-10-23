import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { EmptyState } from '@/components/ui/EmptyState';
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

/**
 * One award: header and runners-up in the right column, the 2nd-1st-3rd podium on the left.
 * Empty awards collapse to a calm message; partially filled podiums keep placeholder slots.
 */
export function ModelLeaderboardAwardCard({
  metric,
  rows,
  runnersCollapsed,
  refreshing = false,
}: {
  metric: AnalyticsModelLeaderboardMetric;
  rows: AnalyticsModelLeaderboardRow[];
  runnersCollapsed: boolean;
  /** Reload over existing data: keep the card and show the Usage-style corner pill. */
  refreshing?: boolean;
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
        return row.samples === undefined
          ? ''
          : t('analytics.leaderboard.measured', { count: row.samples });
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
    return (
      <>
        <img
          className={
            avatar.kind === 'mascot'
              ? styles.avatarMascot
              : styles.glyphLight +
                ' ' +
                (avatar.art.darkSrc ? styles.glyphHasDark : styles.glyphInvert) +
                ' ' +
                styles.avatarLogo
          }
          src={avatar.art.src}
          alt={avatarAlt(model, avatar.kind, t)}
          loading="lazy"
          onError={avatar.kind === 'mascot' ? () => onMascotError(avatar.art.src) : undefined}
        />
        {avatar.art.darkSrc && (
          <img
            className={
              styles.glyphDark +
              ' ' +
              (avatar.kind === 'mascot' ? styles.avatarMascot : styles.avatarLogo)
            }
            src={avatar.art.darkSrc}
            alt=""
            aria-hidden="true"
            loading="lazy"
            onError={avatar.kind === 'mascot' ? () => onMascotError(avatar.art.src) : undefined}
          />
        )}
      </>
    );
  };

  return (
    <section
      className={'card ' + styles.award}
      aria-labelledby={headingId}
      aria-busy={refreshing || undefined}
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
      {rows.length === 0 ? (
        <div className={styles.awardEmpty}>
          <EmptyState title={t('analytics.leaderboard.empty_' + metric)} />
        </div>
      ) : (
        <>
          <ol className={styles.podium}>
            {podium.map((slot) =>
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
                    {slot.row.model}
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
                  <span className={styles.sub}>{subline(slot.row)}</span>
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
          {runners.length > 0 && (
            <details
              className={styles.runners}
              open={runnersCollapsed ? runnersOpen : true}
              onToggle={(event) => {
                if (runnersCollapsed) setRunnersOpen(event.currentTarget.open);
              }}
            >
              <summary
                className={styles.runnersSummary}
                onClick={(event) => {
                  if (!runnersCollapsed) event.preventDefault();
                }}
              >
                {t('analytics.leaderboard.runners_up')}
              </summary>
              <ol className={styles.runnerList}>
                {runners.map((row) => (
                  <li key={row.rank} className={styles.runner}>
                    <span className={styles.runnerRank}>{row.rank}</span>
                    <FamilyGlyph model={row.model} className={styles.runnerGlyph} />
                    <span className={styles.runnerModel}>{row.model}</span>
                    <b className={styles.runnerValue}>{valueOf(row)}</b>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </>
      )}
    </section>
  );
}
