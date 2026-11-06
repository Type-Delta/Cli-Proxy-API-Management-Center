import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { IconAlertTriangle, IconInfo } from '@/components/ui/icons';
import { formatAccumulatedDuration } from '@/features/analytics/components/analyticsFormatting';
import type { RoutingTrace, RoutingTraceCandidate } from '@/types/routing';
import {
  buildDecayCurve,
  buildStrategyView,
  formatShare,
  strategyName,
  strategyColorVar,
  strategyDecay,
  type StrategyRow,
  type StrategyView,
} from './strategyModel';
import styles from './StrategyBreakdown.module.scss';

const cx = (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(' ');

function recoverySourceLabel(source: string | undefined, t: TFunction) {
  if (!source) return '';
  if (source.startsWith('signal:')) {
    return t('routing.strategy.source_signal', { header: source.slice('signal:'.length) });
  }
  return t(`routing.strategy.source_${source}`, { defaultValue: source.replace(/_/g, ' ') });
}

/** Explains the strategy's ranking of the tier pool: shares, factors, decay curve, next picks. */
export function StrategyBreakdown({
  trace,
  labelOf,
  now,
}: {
  trace: RoutingTrace;
  labelOf: (candidate: RoutingTraceCandidate | undefined) => string;
  /** Reference time for "recovers in": the dry-run response or the event's request time. */
  now: number;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  const view = useMemo(() => buildStrategyView(trace), [trace]);
  if (!view) return null;

  const nameOf = (index: number) => labelOf(trace.candidates[index]);
  const number = new Intl.NumberFormat(locale);
  const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 2 });
  const duration = (ms: number) => formatAccumulatedDuration(ms, locale);
  const fallbackApplied = view.fallback !== '' || view.configured !== view.applied;
  const decider = trace.decided_by;

  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <span className={styles.algorithm}>{strategyName(view.applied, t)}</span>
        {view.isGsr && view.halfLifeMs ? (
          <span className={styles.meta}>
            {t('routing.strategy.half_life', { duration: duration(view.halfLifeMs) })}
          </span>
        ) : null}
      </div>

      {fallbackApplied ? (
        <p className={styles.notice} role="note">
          <IconAlertTriangle size={14} aria-hidden="true" />
          <span>
            {t('routing.strategy.fallback', {
              configured: strategyName(view.configured, t),
              applied: strategyName(view.applied, t),
            })}{' '}
            {view.fallback
              ? t(`routing.strategy.fallback_${view.fallback}`, {
                  defaultValue: view.fallback.replace(/_/g, ' '),
                })
              : ''}
          </span>
        </p>
      ) : null}

      {view.overridden ? (
        <p className={styles.override} role="note">
          <IconInfo size={14} aria-hidden="true" />
          <span>
            {t(`routing.strategy.overridden_${decider}`, {
              wanted: nameOf(view.wanted),
              pick: nameOf(view.pick),
              defaultValue: t('routing.strategy.overridden_other', {
                wanted: nameOf(view.wanted),
                pick: nameOf(view.pick),
              }),
            })}
          </span>
        </p>
      ) : null}

      <ShareBar view={view} nameOf={nameOf} locale={locale} t={t} />

      <ul className={styles.rows}>
        {view.rows.map((row) => (
          <FactorCard
            key={row.index}
            row={row}
            view={view}
            name={nameOf(row.index)}
            now={now}
            t={t}
            number={number}
            compact={compact}
            duration={duration}
            locale={locale}
          />
        ))}
      </ul>

      {view.factorsMissing ? (
        <p className={styles.hint}>
          {t(
            view.factorsRebuilt
              ? 'routing.strategy.factors_trimmed_rebuilt'
              : 'routing.strategy.factors_trimmed'
          )}
        </p>
      ) : null}

      {view.isGsr && (!view.factorsMissing || view.factorsRebuilt) ? (
        <DecayCurve view={view} nameOf={nameOf} duration={duration} t={t} />
      ) : null}

      {view.next.length > 0 ? (
        <div className={styles.next}>
          <span className={styles.sectionLabel}>{t('routing.strategy.next_title')}</span>
          <ol className={styles.nextList}>
            {view.next.map((index, position) => {
              const row = view.rows.find((entry) => entry.index === index);
              return (
                <li key={position} className={styles.nextItem}>
                  <span
                    className={styles.swatch}
                    style={{ background: strategyColorVar(row?.slot ?? 99) }}
                    aria-hidden="true"
                  />
                  <span className={styles.nextName}>{nameOf(index)}</span>
                </li>
              );
            })}
          </ol>
          <p className={styles.hint}>
            {view.smooth
              ? t('routing.strategy.next_hint_smooth')
              : t('routing.strategy.next_hint_cursor')}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ShareBar({
  view,
  nameOf,
  locale,
  t,
}: {
  view: StrategyView;
  nameOf: (index: number) => string;
  locale: string | undefined;
  t: TFunction;
}) {
  const visible = view.rows.filter((row) => row.share > 0);
  return (
    <div className={styles.share}>
      <span className={styles.sectionLabel}>
        {t(
          view.estimate ? 'routing.strategy.share_title_estimate' : 'routing.strategy.share_title'
        )}
      </span>
      <div
        className={styles.bar}
        role="img"
        aria-label={view.ranked
          .map((row) => `${nameOf(row.index)} ${formatShare(row.share, locale)}`)
          .join(', ')}
      >
        {visible.map((row) => (
          <span
            key={row.index}
            className={cx(styles.segment, row.wanted && styles.segmentWanted)}
            style={{ flexGrow: row.share, background: strategyColorVar(row.slot) }}
            data-cpamc-tooltip={`${nameOf(row.index)} · ${formatShare(row.share, locale)}`}
          />
        ))}
      </div>
      <ul className={styles.legend}>
        {view.ranked.map((row) => (
          <li key={row.index} className={styles.legendItem}>
            <span
              className={styles.swatch}
              style={{ background: strategyColorVar(row.slot) }}
              aria-hidden="true"
            />
            <span className={styles.legendName}>{nameOf(row.index)}</span>
            <span className={styles.legendValue}>{formatShare(row.share, locale)}</span>
          </li>
        ))}
      </ul>
      <p className={styles.hint}>
        {view.estimate
          ? t('routing.strategy.share_hint_estimate')
          : view.applied === 'fill-first'
            ? t('routing.strategy.share_hint_fill_first')
            : t('routing.strategy.share_hint')}
      </p>
    </div>
  );
}

function FactorCard({
  row,
  view,
  name,
  now,
  t,
  number,
  compact,
  duration,
  locale,
}: {
  row: StrategyRow;
  view: StrategyView;
  name: string;
  now: number;
  t: TFunction;
  number: Intl.NumberFormat;
  compact: Intl.NumberFormat;
  duration: (ms: number) => string;
  locale: string | undefined;
}) {
  const decay = strategyDecay(row, view.halfLifeMs);
  const gsrFactors = view.isGsr && (!view.factorsMissing || view.factorsRebuilt);
  const value = (amount: number | undefined) =>
    amount === undefined ? (
      '—'
    ) : (
      <span data-cpamc-tooltip={number.format(amount)}>{compact.format(amount)}</span>
    );
  const recoveryIn =
    row.recovery_at_ms !== undefined && now > 0 ? row.recovery_at_ms - now : undefined;

  return (
    <li className={cx(styles.card, row.wanted && styles.cardWanted)}>
      <div className={styles.cardHead}>
        <span
          className={styles.swatch}
          style={{ background: strategyColorVar(row.slot) }}
          aria-hidden="true"
        />
        <span className={styles.cardName}>{name}</span>
        <span className={styles.cardShare}>{formatShare(row.share, locale)}</span>
      </div>
      <div className={styles.badges}>
        {row.wanted ? (
          <span className={cx(styles.badge, styles.badgeWanted)}>
            {t('routing.strategy.badge_wanted')}
          </span>
        ) : null}
        {row.picked && !row.wanted ? (
          <span className={styles.badge}>{t('routing.strategy.badge_picked')}</span>
        ) : null}
        {row.last ? <span className={styles.badge}>{t('routing.strategy.badge_last')}</span> : null}
        {row.nextPositions.length > 0 ? (
          <span className={styles.badge}>
            {t('routing.strategy.badge_next', {
              positions: row.nextPositions.map((position) => `#${position}`).join(' '),
            })}
          </span>
        ) : null}
      </div>

      {gsrFactors ? (
        <dl className={styles.factors}>
          {view.factorsRebuilt ? null : (
            <>
              <dt>{t('routing.strategy.recovery')}</dt>
              <dd>
                {row.recovery_at_ms !== undefined ? (
                  <>
                    {new Date(row.recovery_at_ms).toLocaleString(locale, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {recoveryIn !== undefined ? (
                      <span className={styles.muted}>
                        {' · '}
                        {recoveryIn > 0
                          ? t('routing.strategy.recovers_in', { duration: duration(recoveryIn) })
                          : t('routing.strategy.recovered')}
                      </span>
                    ) : null}
                    {row.recovery_source ? (
                      <span className={styles.source}>
                        {recoverySourceLabel(row.recovery_source, t)}
                      </span>
                    ) : null}
                  </>
                ) : (
                  '—'
                )}
              </dd>
            </>
          )}
          <dt>{t('routing.strategy.delay')}</dt>
          <dd>
            {row.delay_ms === undefined || row.delay_ms === 0
              ? t('routing.strategy.delay_earliest')
              : t('routing.strategy.delay_after', { duration: duration(row.delay_ms) })}
          </dd>
          <dt>{t('routing.strategy.decay')}</dt>
          <dd>
            {decay === null
              ? '—'
              : new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(decay)}
          </dd>
          <dt>{t('routing.strategy.tier')}</dt>
          <dd>
            {row.tier
              ? t(`routing.strategy.tier_${row.tier}`, { defaultValue: row.tier })
              : view.factorsRebuilt
                ? ''
                : t('routing.strategy.tier_unknown')}
            {row.tier_multiplier !== undefined
              ? `${row.tier ? ' ' : ''}×${number.format(row.tier_multiplier)}`
              : view.factorsRebuilt
                ? '—'
                : ''}
            {row.tier_source ? (
              <span className={styles.source}>
                {t(`routing.strategy.tier_source_${row.tier_source}`, {
                  defaultValue: row.tier_source,
                })}
              </span>
            ) : null}
          </dd>
        </dl>
      ) : null}

      {view.smooth ? (
        <div className={styles.formula}>
          {gsrFactors ? (
            <span className={styles.formulaLine}>
              <span className={styles.term}>
                {t('routing.strategy.term_base')} {value(row.base_weight)}
              </span>
              <span className={styles.op}>×</span>
              <span className={styles.term}>
                {t('routing.strategy.term_tier')} {value(row.tier_multiplier)}
              </span>
              <span className={styles.op}>+</span>
              <span className={styles.term}>
                {t('routing.strategy.term_config')} {value(row.config_weight)}
              </span>
              <span className={styles.op}>=</span>
              <span className={cx(styles.term, styles.termResult)}>
                {t('routing.strategy.term_weight')} {value(row.weight)}
              </span>
            </span>
          ) : (
            <span className={styles.formulaLine}>
              <span className={cx(styles.term, styles.termResult)}>
                {t('routing.strategy.term_weight')} {value(row.weight)}
              </span>
              {row.config_weight !== undefined && view.applied !== 'greedy-soonest-recovery' ? (
                <span className={styles.muted}>{t('routing.strategy.weight_is_config')}</span>
              ) : null}
            </span>
          )}
          <span className={styles.formulaLine}>
            <span className={styles.term}>
              {t('routing.strategy.term_credit')} {value(row.credit)}
            </span>
            <span className={styles.op}>+</span>
            <span className={styles.term}>
              {t('routing.strategy.term_weight')} {value(row.weight)}
            </span>
            <span className={styles.op}>=</span>
            <span className={cx(styles.term, row.wanted && styles.termResult)}>
              {t('routing.strategy.term_score')} {value(row.score ?? undefined)}
            </span>
          </span>
        </div>
      ) : null}
    </li>
  );
}

const PLOT = { width: 320, height: 150, left: 34, right: 12, top: 12, bottom: 30 };

function DecayCurve({
  view,
  nameOf,
  duration,
  t,
}: {
  view: StrategyView;
  nameOf: (index: number) => string;
  duration: (ms: number) => string;
  t: TFunction;
}) {
  const curve = useMemo(() => buildDecayCurve(view), [view]);
  if (!curve || curve.points.length === 0) return null;
  const innerWidth = PLOT.width - PLOT.left - PLOT.right;
  const innerHeight = PLOT.height - PLOT.top - PLOT.bottom;
  const px = (x: number) => PLOT.left + x * innerWidth;
  const py = (y: number) => PLOT.top + (1 - y) * innerHeight;
  const path = curve.curve
    .map(
      (point, index) => `${index ? 'L' : 'M'}${px(point.x).toFixed(1)},${py(point.y).toFixed(1)}`
    )
    .join(' ');
  const halfX = px(curve.halfLifeMs / curve.domainMs);
  const slotRow = (slot: number) => view.rows[slot];

  return (
    <figure className={styles.curve}>
      <figcaption className={styles.sectionLabel}>{t('routing.strategy.curve_title')}</figcaption>
      <svg
        viewBox={`0 0 ${PLOT.width} ${PLOT.height}`}
        className={styles.curveSvg}
        role="img"
        aria-label={t('routing.strategy.curve_aria', {
          halfLife: duration(curve.halfLifeMs),
        })}
      >
        {[0, 0.5, 1].map((y) => (
          <g key={y}>
            <line
              x1={PLOT.left}
              x2={PLOT.width - PLOT.right}
              y1={py(y)}
              y2={py(y)}
              className={styles.grid}
            />
            <text x={PLOT.left - 6} y={py(y) + 3} className={styles.axisText} textAnchor="end">
              {y.toFixed(1)}
            </text>
          </g>
        ))}
        <line
          x1={halfX}
          x2={halfX}
          y1={PLOT.top}
          y2={PLOT.top + innerHeight}
          className={styles.halfLife}
        />
        <path d={path} className={styles.curveLine} />
        <text x={PLOT.left} y={PLOT.height - 10} className={styles.axisText}>
          0
        </text>
        {/* A long domain squeezes the half-life marker against the origin; the dashed line stays. */}
        {halfX - PLOT.left >= 36 ? (
          <text x={halfX} y={PLOT.height - 10} className={styles.axisText} textAnchor="middle">
            {t('routing.strategy.curve_half_life')}
          </text>
        ) : null}
        <text
          x={PLOT.width - PLOT.right}
          y={PLOT.height - 10}
          className={styles.axisText}
          textAnchor="end"
        >
          {duration(curve.domainMs)}
        </text>
        {curve.points.map((point) => {
          const names = point.slots.map((slot) => nameOf(slotRow(slot).index)).join(', ');
          const label = t('routing.strategy.curve_point', {
            credentials: names,
            delay:
              point.delayMs > 0
                ? t('routing.strategy.delay_after', { duration: duration(point.delayMs) })
                : t('routing.strategy.delay_earliest'),
            decay: point.decay.toFixed(3),
          });
          return (
            <g key={`${point.x}:${point.y}`} data-cpamc-tooltip={label} aria-label={label}>
              <circle cx={px(point.x)} cy={py(point.y)} r={10} className={styles.hit} />
              <circle
                cx={px(point.x)}
                cy={py(point.y)}
                r={5}
                className={styles.point}
                style={{ fill: strategyColorVar(point.slots[0]) }}
              />
            </g>
          );
        })}
      </svg>
      <p className={styles.hint}>{t('routing.strategy.curve_hint')}</p>
    </figure>
  );
}
