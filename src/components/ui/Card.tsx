import type { PropsWithChildren, ReactNode, Ref } from 'react';

interface CardProps {
  ref?: Ref<HTMLDivElement>;
  title?: ReactNode;
  extra?: ReactNode;
  className?: string;
}

export function Card({ title, extra, children, className, ref }: PropsWithChildren<CardProps>) {
  return (
    <div ref={ref} className={className ? `card ${className}` : 'card'}>
      {(title || extra) && (
        <div className="card-header">
          <div className="title">{title}</div>
          {extra}
        </div>
      )}
      {children}
    </div>
  );
}
