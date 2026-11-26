import { ProviderArtwork } from '@/components/common/ProviderArtwork';
import { useId, type ReactNode } from 'react';
import { IconNetwork } from '@/components/ui/icons';
import styles from './ModelRules.module.scss';

export type RuleGroupProps = {
  provider: string;
  label: string;
  icon: string | null;
  /** Mono telemetry, e.g. "6 mappings". */
  summary: string;
  dirty: boolean;
  dirtyLabel: string;
  actions?: ReactNode;
  children: ReactNode;
};

/** One provider's rule panel: both workspaces (excluded / alias) share the same shell. */
export function RuleGroup({
  provider,
  label,
  icon,
  summary,
  dirty,
  dirtyLabel,
  actions,
  children,
}: RuleGroupProps) {
  const headingId = useId();
  return (
    <section className={styles.group} aria-labelledby={headingId}>
      <header className={styles.groupHead}>
        <span className={styles.groupIcon} aria-hidden="true">
          <ProviderArtwork provider={provider} src={icon}>
            <IconNetwork size={16} />
          </ProviderArtwork>
        </span>
        <div className={styles.groupCopy}>
          <h2 className={styles.groupTitle} id={headingId}>
            {label}
            {dirty ? (
              <span className={styles.groupDirty} role="img" aria-label={dirtyLabel} />
            ) : null}
          </h2>
          <p className={styles.groupSummary}>
            <span className={styles.groupKey}>{provider}</span>
            <span className={styles.metaDot} aria-hidden="true">
              ·
            </span>
            {summary}
          </p>
        </div>
        {actions ? <div className={styles.groupActions}>{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}
