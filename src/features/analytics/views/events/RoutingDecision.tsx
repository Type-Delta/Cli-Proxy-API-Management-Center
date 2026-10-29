import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  IconBan,
  IconInfo,
  IconListTree,
  IconRefreshCw,
  IconShare2,
  IconShield,
} from '@/components/ui/icons';
import { RoutingConditionText } from '@/components/ui/RoutingConditionText';
import { ROUTING_GATE_ICONS } from '@/components/ui/routingIcons';
import type {
  RoutingGateReason,
  RoutingRuleTrace,
  RoutingTrace,
  RoutingTraceCandidate,
} from '@/types';
import { formatAccumulatedDuration } from '../../components/analyticsFormatting';
import {
  buildRoutingMatrix,
  normalizeRoutingTrace,
  summarizeRoutingDecision,
  type RoutingCell,
  type RoutingLayerId,
  type RoutingMatrixRow,
} from './eventRoutingModel';
import { shortIdentifier } from './eventColumns';
import styles from './RoutingDecision.module.scss';

const layerIcons: Record<RoutingLayerId, typeof IconShield> = {
  rules: IconListTree,
  strategy: IconRefreshCw,
  affinity: IconShare2,
  gate: IconShield,
};

const glyphClassName = (glyph: RoutingCell['glyph']) =>
  `glyph${glyph.replace(/^./, (char) => char.toUpperCase())}`;

function CrownIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.crown} focusable="false">
      <path d="M3 8.5 7.5 12 12 5.5 16.5 12 21 8.5 19 18H5Z" fill="currentColor" />
    </svg>
  );
}

const credentialLabel = (candidate: RoutingTraceCandidate | undefined) =>
  candidate?.label?.trim() || shortIdentifier(candidate?.id || '');

function timeUntil(untilMs: number | undefined, locale: string | undefined, t: TFunction) {
  if (!Number.isFinite(untilMs)) return '';
  const remaining = (untilMs as number) - Date.now();
  if (remaining <= 0) return '';
  return t('analytics.routing_decision.time_until_clear', {
    time: formatAccumulatedDuration(remaining, locale),
    defaultValue: 'Resets in {{time}}.',
  });
}

function gateReason(
  reason: RoutingGateReason,
  untilMs: number | undefined,
  locale: string | undefined,
  t: TFunction
) {
  const reasonText = t(`analytics.routing_decision.reason.${reason}`, {
    defaultValue: reason.replace(/_/g, ' '),
  });
  const reset = timeUntil(untilMs, locale, t);
  return reset ? `${reasonText} ${reset}` : reasonText;
}

function sentence(value: string) {
  const text = value.trim().replace(/([.。!?！？])[.。!?！？]+$/u, '$1');
  if (!text) return '';
  return /[.。!?！？]$/.test(text) ? text : `${text}.`;
}

function strategyKey(strategy: string | undefined) {
  const value = (strategy || 'round-robin').trim().toLowerCase();
  if (['gsr', 'greedysoonest-recovery', 'greedysoonestrecovery'].includes(value)) {
    return 'greedy_soonest_recovery';
  }
  return value.replace(/-/g, '_');
}

function strategyShortLabel(strategy: string | undefined, t: TFunction) {
  const key = strategyKey(strategy);
  const defaults: Record<string, string> = {
    round_robin: 'RR',
    weighted_round_robin: 'WRR',
    fill_first: 'Fill-first',
    greedy_soonest_recovery: 'GSR',
  };
  if (!defaults[key]) return strategy?.trim() || '—';
  return t(`analytics.routing_decision.strategies_short.${key}`, { defaultValue: defaults[key] });
}

function strategyLabel(strategy: string | undefined, t: TFunction) {
  const key = strategyKey(strategy);
  const defaults: Record<string, string> = {
    round_robin: 'Round-robin',
    weighted_round_robin: 'Weighted round-robin',
    fill_first: 'Fill-first',
    greedy_soonest_recovery: 'Greedy soonest-recovery',
  };
  if (!defaults[key]) return strategy?.trim() || t('analytics.routing_decision.decidors.strategy');
  return t(`analytics.routing_decision.strategies.${key}`, { defaultValue: defaults[key] });
}

export function RoutingDecision({ trace: traceInput }: { trace: RoutingTrace | null | undefined }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  const [focusedColumn, setFocusedColumn] = useState<number | null>(null);
  const trace = useMemo(() => normalizeRoutingTrace(traceInput), [traceInput]);
  const summary = useMemo(() => (trace ? summarizeRoutingDecision(trace) : null), [trace]);
  const matrix = useMemo(() => (trace ? buildRoutingMatrix(trace) : null), [trace]);

  if (!trace || !summary || !matrix) return null;

  const winnerCandidate = summary.winner >= 0 ? trace.candidates[summary.winner] : undefined;
  const winnerName =
    summary.winner >= 0
      ? credentialLabel(winnerCandidate)
      : t('analytics.routing_decision.no_credential', { defaultValue: 'No credential' });
  const appliedRule = summary.appliedRule;
  const fellThroughRule = summary.fellThroughRule;
  const conditionRule = appliedRule ?? fellThroughRule;
  const isHome = trace.mode === 'home';
  const explanation = [
    summary.winner >= 0
      ? t('analytics.routing_decision.explanation_intro', {
          credential: winnerName,
          defaultValue: 'Routed to {{credential}}.',
        })
      : t('analytics.routing_decision.explanation_no_credential', {
          defaultValue: 'No credential was routed.',
        }),
    isHome
      ? t('analytics.routing_decision.explanation_home', {
          defaultValue: 'Home mode selected the credential directly; routing rules did not run.',
        })
      : summary.appliedRule
        ? t('analytics.routing_decision.explanation_applied_rule', {
            rule: `R${summary.appliedRule.index + 1}`,
            condition: summary.appliedRule.condition,
            defaultValue: '{{rule}} matched ({{condition}}) and narrowed the eligible pool.',
          })
        : summary.fellThroughRule
          ? t('analytics.routing_decision.explanation_fell_through', {
              rule: `R${summary.fellThroughRule.index + 1}`,
              condition: summary.fellThroughRule.condition,
              defaultValue:
                '{{rule}} matched ({{condition}}), but none of its targets could serve the request, so it fell through.',
            })
          : t('analytics.routing_decision.explanation_no_rule', {
              defaultValue: 'No custom routing rule applied.',
            }),
    summary.affinityState === 'kept'
      ? t('analytics.routing_decision.explanation_affinity_kept', {
          defaultValue: 'An existing session binding decided the credential.',
        })
      : summary.affinityState === 'held'
        ? t('analytics.routing_decision.explanation_affinity_held', {
            defaultValue:
              'The existing session binding was preserved while another credential served this attempt.',
          })
        : summary.affinityState === 'broken'
          ? t('analytics.routing_decision.explanation_affinity_broken', {
              defaultValue:
                'The previous session binding was broken and the session rebound to the routed credential.',
            })
          : '',
    trace.decided_by === 'strategy'
      ? t('analytics.routing_decision.explanation_strategy', {
          strategy: strategyLabel(trace.strategy, t),
          defaultValue: 'Picked by {{strategy}}.',
        })
      : '',
    summary.gateBlockers.length
      ? [
          t('analytics.routing_decision.explanation_gate', {
            count: new Intl.NumberFormat(locale).format(summary.gateBlockers.length),
            defaultValue: '{{count}} candidate(s) were blocked by the routing gate.',
          }),
          t('analytics.routing_decision.explanation_gate_detail', {
            details: summary.gateBlockers
              .map(
                ({ candidate }) =>
                  `${credentialLabel(candidate)}: ${candidate.gate ? gateReason(candidate.gate, candidate.until_ms, locale, t) : t('analytics.routing_decision.reason.disabled', { defaultValue: 'Credential is disabled.' })}`
              )
              .join('; '),
            defaultValue: 'Blocked: {{details}}.',
          }),
        ].join(' ')
      : '',
    trace.error
      ? t('analytics.routing_decision.explanation_error', {
          error: trace.error,
          defaultValue: 'Selection error: {{error}}',
        })
      : '',
  ]
    .filter(Boolean)
    .map(sentence)
    .join(' ');

  const layerName = (id: RoutingLayerId) =>
    t(`analytics.routing_decision.layers.${id}`, {
      defaultValue:
        id === 'rules'
          ? 'Custom rules'
          : id === 'strategy'
            ? 'Strategy'
            : id === 'affinity'
              ? 'Session affinity'
              : 'Routing gate',
    });

  const ruleTooltip = (rule: RoutingRuleTrace) => {
    const overriddenByAffinity =
      rule.status === 'overridden' &&
      trace.decided_by === 'affinity' &&
      (summary?.affinityState === 'kept' || summary?.affinityState === 'held');
    const status = overriddenByAffinity
      ? t('analytics.routing_decision.rule_status.overridden_by_session_binding', {
          defaultValue: 'overridden by session binding',
        })
      : t(`analytics.routing_decision.rule_status.${rule.status}`, {
          defaultValue: rule.status.replace(/_/g, ' '),
        });
    const condition = rule.condition
      ? t('analytics.routing_decision.condition_in_parens', {
          condition: rule.condition,
          defaultValue: ' ({{condition}})',
        })
      : '';
    return t('analytics.routing_decision.rule_tooltip', {
      rule: `R${rule.index + 1}${rule.name ? ` · ${rule.name}` : ''}`,
      status,
      condition,
      defaultValue: '{{rule}} — {{status}}{{condition}}.',
    });
  };

  const layerOutcome = (row: RoutingMatrixRow) => {
    if (row.id === 'rules') {
      const matched = trace.rules?.matched ?? [];
      return matched.length
        ? matched.map((rule) => ruleTooltip(rule)).join(' · ')
        : t('analytics.routing_decision.outcome.no_rule', {
            defaultValue: 'No enabled rule matched.',
          });
    }
    if (row.id === 'strategy') {
      return row.status.kind === 'strategy'
        ? t('analytics.routing_decision.outcome.strategy_pool', {
            strategy: strategyLabel(row.status.strategy, t),
            defaultValue: 'The {{strategy}} pool held the credentials that could be picked.',
          })
        : t('analytics.routing_decision.outcome.strategy_skipped', {
            defaultValue: 'The strategy did not run.',
          });
    }
    if (row.id === 'affinity') {
      return row.status.kind === 'affinity'
        ? t('analytics.routing_decision.outcome.affinity_state', {
            state: t(`analytics.routing_decision.states.${row.status.state}`, {
              defaultValue: row.status.state,
            }),
            defaultValue: 'Session affinity state: {{state}}.',
          })
        : t('analytics.routing_decision.outcome.affinity_inactive', {
            defaultValue: 'Session affinity did not participate.',
          });
    }
    return t('analytics.routing_decision.outcome.gate', {
      blocked: new Intl.NumberFormat(locale).format(
        row.status.kind === 'gate' ? row.status.blocked : 0
      ),
      total: new Intl.NumberFormat(locale).format(
        row.status.kind === 'gate' ? row.status.total : 0
      ),
      defaultValue: '{{blocked}} of {{total}} candidates were blocked by the routing gate.',
    });
  };

  const cellExplanation = (
    row: RoutingMatrixRow,
    candidateIndex: number | null,
    glyph: RoutingCell['glyph'],
    blockedReason?: RoutingGateReason,
    collapsedIndexes?: number[]
  ) => {
    const layer = layerName(row.id);
    if (collapsedIndexes?.length) {
      const names = collapsedIndexes
        .map((index) => credentialLabel(trace.candidates[index]))
        .join(', ');
      return t('analytics.routing_decision.cell.collapsed', {
        layer,
        count: new Intl.NumberFormat(locale).format(collapsedIndexes.length),
        credentials: names,
        defaultValue: '{{layer}}: {{count}} gate-blocked candidates — {{credentials}}.',
      });
    }
    const candidate = candidateIndex === null ? undefined : trace.candidates[candidateIndex];
    const name = credentialLabel(candidate);
    if (row.id === 'gate' && glyph === 'blocked') {
      return t('analytics.routing_decision.cell.gate_blocked', {
        credential: name,
        layer,
        reason: gateReason(blockedReason ?? 'disabled', candidate?.until_ms, locale, t),
        defaultValue: '{{credential}} — {{layer}}: {{reason}}',
      });
    }
    const heldBinding =
      row.id === 'affinity' &&
      glyph === 'kept' &&
      row.status.kind === 'affinity' &&
      row.status.state === 'held';
    const lostToAffinity =
      row.id === 'rules' &&
      glyph === 'lost' &&
      trace.decided_by === 'affinity' &&
      (summary?.affinityState === 'kept' || summary?.affinityState === 'held');
    const key = `analytics.routing_decision.cell.${row.id}.${
      heldBinding ? 'held' : lostToAffinity ? 'lost_by_affinity' : glyph
    }`;
    return t(key, {
      credential: name,
      layer,
      defaultValue:
        glyph === 'none'
          ? `${name} — ${layer}: no opinion.`
          : glyph === 'wanted'
            ? `${name} — wanted by this layer.`
            : glyph === 'lost'
              ? lostToAffinity
                ? `${name} — wanted by this rule, overridden by session binding.`
                : `${name} — wanted, then overridden by a stronger layer.`
              : glyph === 'routed'
                ? `${name} — routed here.`
                : glyph === 'bound'
                  ? `${name} — newly bound.`
                  : glyph === 'kept'
                    ? heldBinding
                      ? `${name} — existing binding kept while another credential served this attempt.`
                      : `${name} — existing binding kept.`
                    : glyph === 'broken'
                      ? `${name} — previous binding broken.`
                      : `${name} — passed this layer.`,
    });
  };

  const statusText = (row: RoutingMatrixRow) => {
    if (row.id === 'rules') {
      const matched = trace.rules?.matched ?? [];
      if (matched.length > 1) {
        return matched.map((rule) => `R${rule.index + 1}`).join(' · ');
      }
      if (matched.length === 1) {
        const rule = matched[0];
        if (rule.status === 'overridden') return `R${rule.index + 1}`;
      }
      return row.status.kind === 'rule'
        ? row.status.fellThrough
          ? t('analytics.routing_decision.status.rule_fell_through', {
              rule: `R${row.status.index + 1}`,
              defaultValue: '{{rule}} · fell through',
            })
          : row.status.name
            ? `R${row.status.index + 1} · ${row.status.name}`
            : `R${row.status.index + 1}`
        : '';
    }
    if (row.id === 'strategy') {
      if (row.status.kind !== 'strategy') return '';
      return strategyLabel(row.status.strategy, t);
    }
    if (row.id === 'affinity') {
      if (row.status.kind !== 'affinity') return '';
      const state = t(`analytics.routing_decision.states.${row.status.state}`, {
        defaultValue: row.status.state,
      });
      return state;
    }
    const blocked = row.status.kind === 'gate' ? row.status.blocked : 0;
    return blocked
      ? t('analytics.routing_decision.status.blocked', {
          count: new Intl.NumberFormat(locale).format(blocked),
          defaultValue: '{{count}} blocked',
        })
      : '';
  };

  // A strategy verdict names the configured strategy; the generic decider label would hide it.
  const decider =
    trace.decided_by === 'strategy'
      ? strategyLabel(trace.strategy, t)
      : t(`analytics.routing_decision.decidors.${trace.decided_by}`, {
          defaultValue:
            trace.decided_by === 'affinity'
              ? 'Session binding'
              : trace.decided_by === 'pin'
                ? 'Pinned'
                : trace.decided_by === 'plugin'
                  ? 'Plugin'
                  : trace.decided_by === 'credits'
                    ? 'Paid credits'
                    : trace.decided_by === 'home'
                      ? 'Home'
                      : 'None',
        });

  const cellProps = (
    row: RoutingMatrixRow,
    cell: RoutingCell,
    columnIndex: number | null,
    className: string
  ) => {
    const description = cellExplanation(
      row,
      cell.index,
      cell.glyph,
      cell.blockedReason,
      cell.collapsedIndexes
    );
    const isCollapsed = Boolean(cell.collapsedIndexes?.length);
    const GateIcon =
      cell.glyph === 'blocked' && !isCollapsed
        ? (cell.blockedReason && ROUTING_GATE_ICONS[cell.blockedReason]) || IconBan
        : null;
    return {
      tabIndex: 0,
      role: 'img',
      className: [
        styles.cell,
        className,
        cell.glyph === 'blocked' ? styles.blocked : '',
        columnIndex !== null && focusedColumn === columnIndex ? styles.columnActive : '',
        columnIndex !== null && columnIndex === matrix.columns.length - 1 ? styles.lastColumn : '',
      ]
        .filter(Boolean)
        .join(' '),
      'data-cpamc-tooltip': description,
      'aria-label': description,
      onFocus: () => setFocusedColumn(columnIndex),
      onBlur: () => setFocusedColumn(null),
      onMouseEnter: () => setFocusedColumn(columnIndex),
      onMouseLeave: () => setFocusedColumn(null),
      children: (
        <>
          {columnIndex === 0 ? <span className={styles.columnTop} aria-hidden="true" /> : null}
          {columnIndex !== null && columnIndex === matrix.columns.length - 1 ? (
            <span className={styles.columnBottom} aria-hidden="true" />
          ) : null}
          {cell.index === matrix.winner ? (
            <span className={`${styles.columnBand} ${styles.winnerBand}`} aria-hidden="true" />
          ) : null}
          <span
            className={[
              styles.glyph,
              isCollapsed ? styles.glyphCollapsed : styles[glyphClassName(cell.glyph)] || '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-hidden="true"
          >
            {isCollapsed
              ? t('analytics.routing_decision.status.collapsed_short', {
                  count: new Intl.NumberFormat(locale).format(cell.collapsedIndexes!.length),
                  defaultValue: '+{{count}}',
                })
              : null}
            {GateIcon ? <GateIcon size={13} strokeWidth={2.4} /> : null}
          </span>
        </>
      ),
    };
  };

  return (
    <div className={styles.root}>
      <div className={styles.verdict} aria-live="polite">
        <span
          className={[
            styles.credential,
            summary.winner < 0 || trace.decided_by === 'none' ? styles.credentialFailed : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {winnerName}
        </span>
        <span className={styles.viaLabel}>
          {t('analytics.routing_decision.via', { defaultValue: 'via' })}
        </span>
        <span className={styles.viaItem}>{decider}</span>
        {appliedRule?.condition ? (
          <span className={styles.viaItem}>
            {`R${appliedRule.index + 1}${appliedRule.name ? ` · ${appliedRule.name}` : ''}`}
          </span>
        ) : null}
        {summary.affinityState === 'broken' ? (
          <span className={styles.viaItem}>
            {t('analytics.routing_decision.rebound', { defaultValue: 'rebound' })}
          </span>
        ) : null}
        <span
          tabIndex={0}
          role="note"
          aria-label={t('analytics.routing_decision.info_aria', {
            defaultValue: 'Routing explanation',
          })}
          className={styles.info}
          data-cpamc-tooltip={explanation}
        >
          <IconInfo size={15} />
        </span>
      </div>

      {isHome ? (
        <p className={styles.homeNote}>
          {t('analytics.routing_decision.home_note', {
            defaultValue: 'Home mode selected the credential directly.',
          })}
        </p>
      ) : (
        <>
          {conditionRule ? (
            <div className={styles.conditionRow}>
              {fellThroughRule ? (
                <span className={styles.fellThroughMarker}>
                  {t('analytics.routing_decision.status.rule_fell_through', {
                    rule: `R${fellThroughRule.index + 1}`,
                    defaultValue: '{{rule}} · fell through',
                  })}
                </span>
              ) : null}
              <span
                tabIndex={0}
                className={styles.condition}
                data-cpamc-tooltip={conditionRule.condition}
              >
                <RoutingConditionText text={conditionRule.condition ?? ''} />
              </span>
            </div>
          ) : null}

          <div
            className={styles.matrix}
            role="group"
            aria-label={t('analytics.routing_decision.matrix_aria', {
              defaultValue: 'Routing decision by routing layer',
            })}
          >
            <span className={styles.rail} aria-hidden="true" />
            {matrix.rows.map((row) => {
              const Icon = layerIcons[row.id];
              return (
                <div
                  key={row.id}
                  className={styles.matrixRow}
                  aria-label={`${layerName(row.id)}: ${layerOutcome(row)}`}
                >
                  <span
                    className={[styles.label, row.deciding ? styles.labelDeciding : '']
                      .filter(Boolean)
                      .join(' ')}
                    data-cpamc-tooltip={layerOutcome(row)}
                  >
                    <Icon size={14} />
                    <span className={styles.labelName}>{layerName(row.id)}</span>
                  </span>
                  <span className={styles.dots} role="presentation">
                    {matrix.columns.map((candidateIndex, columnIndex) => {
                      const cell = row.cells[candidateIndex];
                      if (!cell) return null;
                      return (
                        <span
                          key={`${row.id}-${candidateIndex}`}
                          {...cellProps(
                            row,
                            cell,
                            columnIndex,
                            row.deciding && candidateIndex === matrix.winner
                              ? styles.cellDeciding
                              : ''
                          )}
                        />
                      );
                    })}
                    {matrix.collapsed && row.id === 'gate' ? (
                      <span
                        key={`${row.id}-collapsed`}
                        {...cellProps(row, row.cells[-1], matrix.columns.length, '')}
                      />
                    ) : null}
                  </span>
                  <span
                    className={[
                      styles.status,
                      row.deciding ? styles.statusDeciding : '',
                      row.id === 'affinity' &&
                      row.status.kind === 'affinity' &&
                      row.status.state === 'broken'
                        ? styles.statusWarning
                        : '',
                      row.id === 'rules' &&
                      trace.decided_by === 'affinity' &&
                      (trace.rules?.matched ?? []).some((rule) => rule.status === 'overridden')
                        ? styles.statusOverridden
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    data-cpamc-tooltip={layerOutcome(row)}
                  >
                    {row.deciding ? <CrownIcon /> : null}
                    <span className={styles.statusText}>
                      <span
                        className={
                          row.id === 'strategy' && row.status.kind === 'strategy'
                            ? `${styles.statusLong} ${styles.statusCollapsible}`
                            : styles.statusLong
                        }
                      >
                        {statusText(row)}
                      </span>
                      {row.id === 'strategy' && row.status.kind === 'strategy' ? (
                        <span className={styles.statusShort} aria-hidden="true">
                          {strategyShortLabel(row.status.strategy, t)}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          <div className={styles.legend}>
            {(
              [
                ['wanted', 'wanted'],
                ['lost', 'overridden'],
                ['bound', 'bound'],
                ['blocked', 'blocked'],
                ['routed', 'routed'],
              ] as const
            ).map(([glyph, key]) => (
              <span key={glyph} className={styles.legendItem}>
                {glyph === 'blocked' ? (
                  <IconBan size={12} strokeWidth={2.4} className={styles.legendBlocked} />
                ) : (
                  <span
                    className={`${styles.glyph} ${styles[`legend${glyph.replace(/^./, (char) => char.toUpperCase())}`]}`}
                    aria-hidden="true"
                  />
                )}
                {t(`analytics.routing_decision.legend.${key}`, { defaultValue: key })}
              </span>
            ))}
            <span className={styles.legendItem}>
              <IconArrowDown />
              {t('analytics.routing_decision.legend.lower_wins', {
                defaultValue: 'lower row wins',
              })}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function IconArrowDown() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.legendIcon} focusable="false">
      <path
        d="M12 4v16m0 0 6-6m-6 6-6-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
