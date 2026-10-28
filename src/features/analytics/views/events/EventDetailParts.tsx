import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AnalyticsEvent } from '@/types';
import { Button } from '@/components/ui/Button';
import { IconCheck, IconChevronDown, type IconProps } from '@/components/ui/icons';
import { copyToClipboard } from '@/utils/clipboard';
import {
  formatCostValue,
  formatNumber,
  formatAnalyticsEnum,
} from '../../components/analyticsFormatting';
import { tokenizeJson } from './eventDiagnostics';
import styles from './EventDetail.module.scss';

const DASH = '\u2014';

// Lucide "copy" (ISC), inlined like the shared icon set so the single-file build stays offline.
function IconCopy({ size = 20, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      {...props}
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

export type PillTone = 'neutral' | 'success' | 'failure' | 'warning';

export function StatusPill({
  caption,
  value,
  tone = 'neutral',
  title,
}: {
  caption?: string;
  value: ReactNode;
  tone?: PillTone;
  title?: string;
}) {
  const toneClass =
    tone === 'success'
      ? styles.pillSuccess
      : tone === 'failure'
        ? styles.pillFailure
        : tone === 'warning'
          ? styles.pillWarning
          : '';
  return (
    <span className={[styles.pill, toneClass].filter(Boolean).join(' ')} title={title}>
      {caption ? <span className={styles.pillCaption}>{caption}</span> : null}
      <span className={styles.pillValue}>{value}</span>
    </span>
  );
}

/** Copies without ever rendering the copied value in an attribute the tooltip would reveal. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(() => {
    void copyToClipboard(value).then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }, [value]);

  return (
    <Button
      variant="ghost"
      size="sm"
      className={styles.copyButton}
      onClick={onCopy}
      aria-label={label}
      title={
        copied
          ? t('analytics.event_detail.copied', { defaultValue: 'Copied' })
          : t('analytics.event_detail.copy', { defaultValue: 'Copy' })
      }
      icon={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
    />
  );
}

export function Fact({
  label,
  value,
  mono,
  muted,
  wide,
  copyValue,
  title,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  muted?: boolean;
  wide?: boolean;
  copyValue?: string | null;
  title?: string;
}) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className={[styles.fact, wide ? styles.factWide : ''].filter(Boolean).join(' ')}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={[styles.factValue, empty || muted ? styles.factValueMuted : ''].join(' ')}>
        <span className={mono && !empty ? styles.mono : undefined} title={title}>
          {empty ? DASH : value}
        </span>
        {copyValue && !empty ? <CopyButton value={copyValue} label={label} /> : null}
      </dd>
    </div>
  );
}

function JsonText({ source }: { source: string }) {
  const tokenClass: Record<string, string | undefined> = {
    key: styles.jsonKey,
    string: styles.jsonString,
    number: styles.jsonNumber,
    keyword: styles.jsonKeyword,
    punctuation: styles.jsonPunctuation,
    plain: undefined,
  };
  return (
    <>
      {tokenizeJson(source).map((token, index) => (
        <span key={`${index}-${token.type}`} className={tokenClass[token.type]}>
          {token.value}
        </span>
      ))}
    </>
  );
}

/** Collapsible raw payload: highlighted when JSON, plain text otherwise. */
export function RawPayload({
  label,
  source,
  language,
  defaultOpen = false,
  tone,
}: {
  label: string;
  source: string;
  language: 'json' | 'text';
  defaultOpen?: boolean;
  tone?: 'error';
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const contentId = `${label.replace(/\W+/g, '-').toLowerCase()}-raw`;

  return (
    <div className={styles.raw}>
      <div className={styles.rawHead}>
        <button
          type="button"
          className={styles.rawToggle}
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((previous) => !previous)}
        >
          <span
            className={[styles.rawChevron, open ? styles.rawChevronOpen : '']
              .filter(Boolean)
              .join(' ')}
            aria-hidden="true"
          >
            <IconChevronDown size={14} />
          </span>
          {label}
        </button>
        <CopyButton
          value={source}
          label={t('analytics.event_detail.copy_payload', {
            label,
            defaultValue: 'Copy {{label}}',
          })}
        />
      </div>
      {open ? (
        <pre
          id={contentId}
          className={[styles.rawPre, tone === 'error' ? styles.errorText : '']
            .filter(Boolean)
            .join(' ')}
          tabIndex={0}
        >
          {language === 'json' ? <JsonText source={source} /> : source}
        </pre>
      ) : null}
    </div>
  );
}

export function PricingBreakdown({ event }: { event: AnalyticsEvent }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  const missing = t('analytics.event_detail.not_recorded', { defaultValue: 'Not recorded' });
  const pricing = event.pricing_breakdown;
  const creditPriced =
    event.price_source === 'kiro-credits' || (event.provider === 'kiro' && !pricing);
  const money = (value: string | null | undefined) => {
    const fraction = value?.split('/');
    const display = fraction?.length === 2 ? Number(fraction[0]) / Number(fraction[1]) : value;
    const formatted = formatCostValue(display, locale);
    return <span title={value == null ? undefined : `${value} USD`}>{formatted.text}</span>;
  };
  const total = event.known_cost_usd == null ? missing : money(event.known_cost_usd);
  const tier = pricing?.service_tier || event.service_tier_used || event.service_tier_requested;
  const input = pricing?.input_tier_multiplier;
  const output = pricing?.output_tier_multiplier;
  const multiplier =
    input != null && input === output
      ? t('analytics.event_detail.tier_multiplier_both', { multiplier: input })
      : [
          input == null
            ? ''
            : t('analytics.event_detail.tier_multiplier_input', { multiplier: input }),
          output == null
            ? ''
            : t('analytics.event_detail.tier_multiplier_output', { multiplier: output }),
        ]
          .filter(Boolean)
          .join(' · ');
  return (
    <div className={styles.pricing}>
      <h4 className={styles.sectionTitle}>{t('analytics.event_detail.pricing')}</h4>
      {pricing && !creditPriced ? (
        <table className={styles.pricingTable} aria-label={t('analytics.event_detail.pricing')}>
          {tier || multiplier ? (
            <caption className={styles.pricingCaption}>
              {[tier ? formatAnalyticsEnum(t, 'service_tier', tier) : '', multiplier]
                .filter(Boolean)
                .join(' · ')}
            </caption>
          ) : null}
          <thead>
            <tr>
              <th scope="col">{t('analytics.event_detail.component')}</th>
              <th scope="col">{t('analytics.event_detail.component_tokens')}</th>
              <th scope="col">{t('analytics.event_detail.rate_per_million')}</th>
              <th scope="col">{t('analytics.event_detail.component_cost')}</th>
            </tr>
          </thead>
          <tbody>
            {(['input', 'output', 'cache_read', 'cache_write'] as const).map((name) => {
              const part = pricing[name];
              return (
                <tr key={name}>
                  <th scope="row">
                    {t(
                      name === 'input'
                        ? 'analytics.event_detail.uncached_input'
                        : `analytics.event_detail.component_${name}`
                    )}
                  </th>
                  <td>{formatNumber(part.tokens, locale)}</td>
                  <td>{money(part.rate_per_million_usd)}</td>
                  <td>{part.tokens === 0 ? DASH : money(part.cost_usd)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3}>
                {t('analytics.event_detail.cost_total')}
              </th>
              <td>{total}</td>
            </tr>
          </tfoot>
        </table>
      ) : creditPriced ? (
        <table className={styles.pricingTable} aria-label={t('analytics.event_detail.pricing')}>
          <thead>
            <tr>
              <th scope="col">{t('analytics.event_detail.credits_used')}</th>
              <th scope="col">{t('analytics.event_detail.credit_price')}</th>
              <th scope="col">{t('analytics.event_detail.component_cost')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{event.provider_credits ?? t('analytics.credits_not_reported')}</td>
              <td>
                {event.price_usd_per_credit == null
                  ? t('analytics.credit_rate_not_applied')
                  : money(event.price_usd_per_credit)}
              </td>
              <td>{total}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>
                {t('analytics.event_detail.cost_total')}
              </th>
              <td>{total}</td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <dl className={styles.factGrid}>
          <Fact label={t('analytics.event_detail.pricing_details')} value={missing} />
          <Fact label={t('analytics.event_detail.cost_total')} value={total} />
        </dl>
      )}
    </div>
  );
}
