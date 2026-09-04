import type { ReactNode } from 'react';
import styles from './Eyebrow.module.scss';

interface EyebrowProps {
  children: ReactNode;
  as?: 'span' | 'h2' | 'h3';
  id?: string;
  className?: string;
}

export function Eyebrow({ children, as = 'span', id, className = '' }: EyebrowProps) {
  const Tag = as;
  return (
    <Tag id={id} className={`${styles.eyebrow} ${className}`.trim()}>
      {children}
    </Tag>
  );
}
