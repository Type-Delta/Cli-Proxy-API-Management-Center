import { SegmentedControl } from '@/components/ui/SegmentedControl';

export type AnalyticsSegmentOption<T extends string> = {
  value: T;
  label: string;
};

export type AnalyticsSegmentedProps<T extends string> = {
  value: T;
  options: readonly AnalyticsSegmentOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  /** Use tab semantics when the segments switch a labelled panel, such as dimensions. */
  role?: 'group' | 'tablist';
  idPrefix?: string;
};

/** A compact, keyboard friendly selector shared by analytics chart modes. */
export function AnalyticsSegmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  role = 'group',
  idPrefix,
}: AnalyticsSegmentedProps<T>) {
  return (
    <SegmentedControl
      value={value}
      options={options}
      onChange={onChange}
      ariaLabel={ariaLabel}
      role={role}
      idPrefix={idPrefix}
    />
  );
}
