import type { ReactNode } from 'react';
import { FIELDS_ROOT_CLASS } from './fields/FieldPrimitives';
import styles from './SectionCard.module.scss';

export type SectionCardProps = {
  /** Section number (01–06). Alias views omit the badge. */
  indexLabel?: string;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
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
  animateIn = false,
  children,
}: SectionCardProps) {
  return (
    <section className={`${styles.card} ${animateIn ? styles.cardEnter : ''}`}>
      <header className={styles.header}>
        <div className={styles.badges}>
          {indexLabel ? <span className={styles.indexBadge}>{indexLabel}</span> : null}
          {icon ? <span className={styles.iconBadge}>{icon}</span> : null}
        </div>
        <div className={styles.heading}>
          <h2 className={styles.title}>{title}</h2>
          {description ? <p className={styles.description}>{description}</p> : null}
        </div>
      </header>
      <div className={`${styles.content} ${FIELDS_ROOT_CLASS}`}>{children}</div>
    </section>
  );
}
