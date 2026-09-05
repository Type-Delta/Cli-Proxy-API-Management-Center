import type { ComponentProps } from 'react';
import { Card } from '@/components/ui/Card';
import { useRevealOnScroll } from '@/hooks/motion';

export function AnalyticsCard(props: Omit<ComponentProps<typeof Card>, 'ref'>) {
  const ref = useRevealOnScroll<HTMLDivElement>();
  return <Card {...props} ref={ref} />;
}
