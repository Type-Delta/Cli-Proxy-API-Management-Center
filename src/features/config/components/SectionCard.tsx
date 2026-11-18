import type { ReactNode } from 'react';
import { InfoTip } from '@/components/ui/Tooltip';
import { FIELDS_ROOT_CLASS } from './fields/FieldPrimitives';
import styles from './SectionCard.module.scss';

export type SectionCardProps = {
  /** Section number (01–06). Alias views omit the badge. */
  indexLabel?: string;
  icon?: ReactNode;
  title: ReactNode;
  /** Section help defaults to the InfoTip next to the title. */
  description?: ReactNode;
  /** Keep safety or scope notes visible below the title. */
  keepDescriptionVisible?: boolean;
  /** Animate only on initial page entry, without replaying when switching tabs. */
  animateIn?: boolean;
  children: ReactNode;
};

/**
 * Section card with natural height in the vertical document flow.
 * Matches shared cards: 14px radius, 1px border, and an 82% color mix.
 */
export function SectionCard({
  indexLabel,
  icon,
  title,
  description,
  keepDescriptionVisible = false,
  animateIn = false,
  children,
}: SectionCardProps) {
  return (
    <section className={`${styles.card} ${animateIn ? styles.cardEnter : ''}`}>
      <header
        className={
          description && keepDescriptionVisible
            ? `${styles.header} ${styles.headerWithDescription}`
            : styles.header
        }
      >
        <div className={styles.badges}>
          {indexLabel ? <span className={styles.indexBadge}>{indexLabel}</span> : null}
          {icon ? <span className={styles.iconBadge}>{icon}</span> : null}
        </div>
        <div className={styles.heading}>
          <div className={styles.titleLine}>
            <h2 className={styles.title}>{title}</h2>
            {description && !keepDescriptionVisible ? (
              <InfoTip
                content={description}
                label={typeof title === 'string' ? title : undefined}
              />
            ) : null}
          </div>
          {description && keepDescriptionVisible ? (
            <p className={styles.description}>{description}</p>
          ) : null}
        </div>
      </header>
      <div className={`${styles.content} ${FIELDS_ROOT_CLASS}`}>{children}</div>
    </section>
  );
}
