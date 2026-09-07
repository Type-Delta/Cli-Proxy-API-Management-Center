import { useEffect, useRef, useState } from 'react';
import { useCountUp } from '@/hooks/motion';

type AnimatedMetricProps = {
  value: number | null | undefined;
  format: (value: number) => string;
  /** Integer precision used by the counter while preserving formatted decimals. */
  scale?: number;
};

/** Reuses the dashboard count-up motion for values displayed directly in analytics cards. */
export function AnimatedMetric({ value, format, scale = 1 }: AnimatedMetricProps) {
  const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : null;
  const target = numericValue === null ? 0 : Math.round(numericValue * scale);
  const elementRef = useRef<HTMLSpanElement | null>(null);
  const [visible, setVisible] = useState(false);
  const animatedValue = useCountUp(visible ? target : 0, numericValue !== null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisible(true);
        observer.disconnect();
      },
      { threshold: 0.01 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const displayValue = visible && animatedValue === target ? numericValue : animatedValue / scale;

  if (typeof window === 'undefined')
    return <>{numericValue === null ? '—' : format(numericValue)}</>;
  return (
    <span ref={elementRef}>
      {numericValue === null ? '—' : format(displayValue ?? target / scale)}
    </span>
  );
}
