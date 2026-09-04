import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { IconCheck, IconChevronDown, IconChevronLeft } from '@/components/ui/icons';
import {
  analyticsRangeInputValue,
  analyticsRangeLabel,
  formatAnalyticsCustomRange,
  MAX_ANALYTICS_RANGE_DAYS,
  type AnalyticsRange,
  type AnalyticsRangeGrain,
} from '@/features/analytics/query';
import {
  addCalendarMonths,
  calendarDateFromIso,
  calendarDateFromRangeInput,
  calendarDateKey,
  calendarDateToInput,
  calendarMonthGrid,
  firstCalendarDateOfMonth,
  formatCalendarDay,
  formatCalendarMonth,
  formatCalendarWeekday,
  isSameCalendarDate,
  moveCalendarDate,
  movePresetIndex,
  validateCustomRange,
  type CalendarDate,
} from './calendar';
import styles from './DateRangePicker.module.scss';

export interface DateRangePickerProps {
  value: AnalyticsRange;
  onChange: (range: AnalyticsRange) => void;
  ariaLabel: string;
  resolvedBounds: { start: string; end: string };
  locale?: string;
  className?: string;
  disabled?: boolean;
}

type PickerPreset = Exclude<AnalyticsRange['preset'], 'custom'>;
type PresetOption = {
  preset: PickerPreset | 'custom';
  label: string;
  badge?: string;
};
type Pane = 'presets' | 'custom';

const VIEWPORT_MARGIN = 8;
const DROPDOWN_OFFSET = 6;
const PRESET_WIDTH = 340;
const CUSTOM_WIDTH = 740;
const MAX_PRESET_HEIGHT = 560;
const MAX_CUSTOM_HEIGHT = 640;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function CalendarIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

type PositionStyle = CSSProperties & Record<`--${string}`, string>;

function resolvePopoverPosition(
  element: HTMLElement,
  preferredWidth: number,
  preferredHeight: number
): PositionStyle {
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(preferredWidth, Math.max(0, viewportWidth - VIEWPORT_MARGIN * 2));
  const left = clamp(
    rect.left,
    VIEWPORT_MARGIN,
    Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN)
  );
  const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_MARGIN - DROPDOWN_OFFSET;
  const spaceAbove = rect.top - VIEWPORT_MARGIN - DROPDOWN_OFFSET;
  const down = spaceBelow >= preferredHeight || spaceBelow >= spaceAbove;
  const maxHeight = Math.max(0, Math.min(preferredHeight, down ? spaceBelow : spaceAbove));
  return {
    '--picker-left': `${left}px`,
    '--picker-width': `${width}px`,
    '--picker-max-height': `${maxHeight}px`,
    ...(down
      ? { '--picker-top': `${rect.bottom + DROPDOWN_OFFSET}px` }
      : { '--picker-bottom': `${viewportHeight - rect.top + DROPDOWN_OFFSET}px` }),
  };
}

function makePresetRange(preset: PickerPreset, timeZone: string): AnalyticsRange {
  switch (preset) {
    case 'last_n_hours':
      return { preset, n: 24, timeZone, grain: '1h' };
    case 'last_n_days':
      return { preset, n: 7, timeZone, grain: '1d' };
    case 'today':
    case 'yesterday':
      return { preset, timeZone, grain: '1h' };
    default:
      return { preset, timeZone, grain: '1d' };
  }
}

function compareCalendarDates(left: CalendarDate, right: CalendarDate) {
  return calendarDateKey(left).localeCompare(calendarDateKey(right));
}

function DayGrid({
  month,
  activeDate,
  startDate,
  endDate,
  today,
  locale,
  onDaySelect,
  onDayKeyDown,
  dayRef,
}: {
  month: CalendarDate;
  activeDate: CalendarDate;
  startDate: CalendarDate | null;
  endDate: CalendarDate | null;
  today: CalendarDate;
  locale: string;
  onDaySelect: (date: CalendarDate) => void;
  onDayKeyDown: (event: KeyboardEvent<HTMLButtonElement>, date: CalendarDate) => void;
  dayRef: (element: HTMLButtonElement | null, date: CalendarDate) => void;
}) {
  const days = calendarMonthGrid(month);
  return (
    <section className={styles.month} aria-label={formatCalendarMonth(month, locale)}>
      <h3>{formatCalendarMonth(month, locale)}</h3>
      <div className={styles.weekdays} aria-hidden="true">
        {Array.from({ length: 7 }, (_, index) => (
          <span key={index}>{formatCalendarWeekday(index, locale)}</span>
        ))}
      </div>
      <div
        className={styles.grid}
        role="grid"
        aria-label={formatCalendarMonth(month, locale)}
        aria-rowcount={6}
        aria-colcount={7}
      >
        {days.map((date) => {
          const inMonth = date.month === month.month && date.year === month.year;
          const selected =
            (startDate !== null && isSameCalendarDate(date, startDate)) ||
            (endDate !== null && isSameCalendarDate(date, endDate));
          const inRange =
            startDate !== null &&
            endDate !== null &&
            compareCalendarDates(date, startDate) >= 0 &&
            compareCalendarDates(date, endDate) <= 0;
          const isActive = isSameCalendarDate(date, activeDate);
          const label = new Intl.DateTimeFormat(locale, {
            dateStyle: 'full',
            timeZone: 'UTC',
          }).format(new Date(Date.UTC(date.year, date.month - 1, date.day)));
          return (
            <button
              key={calendarDateKey(date)}
              ref={(element) => dayRef(element, date)}
              type="button"
              role="gridcell"
              tabIndex={isActive ? 0 : -1}
              className={`${styles.day} ${!inMonth ? styles.dayOutside : ''} ${inRange ? styles.dayInRange : ''} ${selected ? styles.daySelected : ''}`.trim()}
              aria-label={label}
              aria-selected={selected}
              aria-current={isSameCalendarDate(date, today) ? 'date' : undefined}
              onClick={() => onDaySelect(date)}
              onKeyDown={(event) => onDayKeyDown(event, date)}
            >
              {formatCalendarDay(date, locale)}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function DateRangePicker({
  value,
  onChange,
  ariaLabel,
  resolvedBounds,
  locale = 'en',
  className = '',
  disabled = false,
}: DateRangePickerProps) {
  const { t, i18n } = useTranslation();
  const activeLocale = locale || i18n.resolvedLanguage || 'en';
  const [open, setOpen] = useState(false);
  const [pane, setPane] = useState<Pane>('presets');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [grain, setGrain] = useState<AnalyticsRangeGrain>('1d');
  const [error, setError] = useState('');
  const [month, setMonth] = useState<CalendarDate>(() =>
    firstCalendarDateOfMonth(calendarDateFromIso(resolvedBounds.start, value.timeZone))
  );
  const [activeDate, setActiveDate] = useState<CalendarDate>(() =>
    calendarDateFromIso(resolvedBounds.start, value.timeZone)
  );
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const activeDayRef = useRef<HTMLButtonElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [positionStyle, setPositionStyle] = useState<PositionStyle | null>(null);

  const rollingOptions = useMemo<PresetOption[]>(
    () => [
      {
        preset: 'last_n_hours',
        badge: '1h',
        label: t('analytics.range.past_hour', { defaultValue: 'Past hour' }),
      },
      {
        preset: 'last_n_hours',
        badge: '6h',
        label: t('analytics.range.past_6_hours', { defaultValue: 'Past 6 hours' }),
      },
      {
        preset: 'last_n_hours',
        badge: '24h',
        label: t('analytics.range.past_24_hours', { defaultValue: 'Past 24 hours' }),
      },
      {
        preset: 'last_n_days',
        badge: '7d',
        label: t('analytics.range.past_7_days', { defaultValue: 'Past 7 days' }),
      },
      {
        preset: 'last_n_days',
        badge: '30d',
        label: t('analytics.range.past_30_days', { defaultValue: 'Past 30 days' }),
      },
      {
        preset: 'last_n_days',
        badge: '90d',
        label: t('analytics.range.past_90_days', { defaultValue: 'Past 90 days' }),
      },
      {
        preset: 'last_n_days',
        badge: '1y',
        label: t('analytics.range.past_year', { defaultValue: 'Past year' }),
      },
    ],
    [t]
  );
  const calendarOptions = useMemo<PresetOption[]>(
    () => [
      { preset: 'today', label: t('analytics.range_today') },
      { preset: 'yesterday', label: t('analytics.range_yesterday') },
      { preset: 'this_week', label: t('analytics.range_this_week') },
      { preset: 'prev_week', label: t('analytics.range.prev_week', { defaultValue: 'Prev week' }) },
      { preset: 'this_month', label: t('analytics.range_this_month') },
      {
        preset: 'prev_month',
        label: t('analytics.range.prev_month', { defaultValue: 'Prev month' }),
      },
      { preset: 'this_year', label: t('analytics.range.this_year', { defaultValue: 'This year' }) },
      { preset: 'prev_year', label: t('analytics.range.prev_year', { defaultValue: 'Prev year' }) },
    ],
    [t]
  );
  const options = useMemo(
    () => [
      ...rollingOptions,
      ...calendarOptions,
      {
        preset: 'custom' as const,
        label: t('analytics.range.custom_range', { defaultValue: 'Custom range…' }),
      },
    ],
    [calendarOptions, rollingOptions, t]
  );
  const selectedIndex = useMemo(() => {
    if (value.preset === 'custom') return options.length - 1;
    if (value.preset === 'last_n_hours') {
      const hours = [1, 6, 24].indexOf(value.n);
      return hours >= 0 ? hours : 0;
    }
    if (value.preset === 'last_n_days') {
      const days = [7, 30, 90, 365].indexOf(value.n);
      return days >= 0 ? 3 + days : 3;
    }
    const index = calendarOptions.findIndex((option) => option.preset === value.preset);
    return index >= 0 ? rollingOptions.length + index : 0;
  }, [calendarOptions, options.length, rollingOptions.length, value]);
  const resolvedIndex = highlightedIndex >= 0 ? highlightedIndex : selectedIndex;
  const displayLabel =
    value.preset === 'custom'
      ? formatAnalyticsCustomRange(value, activeLocale)
      : analyticsRangeLabel(t, value);
  const isOpen = open && !disabled;

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    setPane('presets');
    setHighlightedIndex(-1);
    if (restoreFocus && typeof window !== 'undefined') {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);
  const returnToPresets = useCallback(() => {
    setPane('presets');
    setHighlightedIndex(selectedIndex);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, [selectedIndex]);
  const updatePosition = useCallback(() => {
    if (!wrapRef.current) return;
    setPositionStyle(
      resolvePopoverPosition(
        wrapRef.current,
        pane === 'custom' ? CUSTOM_WIDTH : PRESET_WIDTH,
        pane === 'custom' ? MAX_CUSTOM_HEIGHT : MAX_PRESET_HEIGHT
      )
    );
  }, [pane]);
  const schedulePosition = useCallback(() => {
    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      updatePosition();
    });
  }, [updatePosition]);

  useEffect(() => {
    if (!isOpen) return;
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!wrapRef.current?.contains(target) && !popoverRef.current?.contains(target)) close();
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [close, isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedulePosition) : null;
    if (observer && wrapRef.current) observer.observe(wrapRef.current);
    if (observer && popoverRef.current) observer.observe(popoverRef.current);
    window.addEventListener('resize', schedulePosition);
    window.addEventListener('scroll', schedulePosition, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', schedulePosition);
      window.removeEventListener('scroll', schedulePosition, true);
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, [isOpen, schedulePosition, updatePosition]);

  useEffect(() => {
    if (!isOpen || pane !== 'custom') return;
    window.requestAnimationFrame(() => {
      if (activeDayRef.current) activeDayRef.current.focus();
      else popoverRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    });
  }, [isOpen, pane]);

  useEffect(() => {
    if (!isOpen || pane !== 'custom' || !activeDayRef.current) return;
    activeDayRef.current.focus();
  }, [activeDate, isOpen, pane]);

  const openCustom = useCallback(() => {
    const bounds = value.preset === 'custom' ? value : resolvedBounds;
    const startValue = analyticsRangeInputValue(bounds.start, value.timeZone);
    const endValue = analyticsRangeInputValue(bounds.end, value.timeZone);
    const startDate = calendarDateFromIso(bounds.start, value.timeZone);
    setStart(startValue);
    setEnd(endValue);
    setGrain(value.grain);
    setError('');
    setActiveDate(startDate);
    setMonth(firstCalendarDateOfMonth(startDate));
    setPane('custom');
  }, [resolvedBounds, value]);

  const commitPreset = useCallback(
    (option: PresetOption) => {
      if (option.preset === 'custom') {
        openCustom();
        return;
      }
      const n =
        option.preset === 'last_n_hours'
          ? Number(option.badge?.replace('h', ''))
          : option.preset === 'last_n_days'
            ? option.badge === '1y'
              ? 365
              : Number(option.badge?.replace('d', ''))
            : undefined;
      const selected = n
        ? { ...makePresetRange(option.preset, value.timeZone), n }
        : makePresetRange(option.preset, value.timeZone);
      onChange(selected);
      close(true);
    },
    [close, onChange, openCustom, value.timeZone]
  );

  const openPicker = () => {
    if (disabled) return;
    setOpen(true);
    setPane('presets');
    setHighlightedIndex(selectedIndex);
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) openPicker();
      else if (pane === 'presets')
        setHighlightedIndex((current) =>
          movePresetIndex(
            current < 0 ? selectedIndex : current,
            event.key,
            rollingOptions.length,
            calendarOptions.length
          )
        );
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!isOpen) openPicker();
      else if (pane === 'presets') commitPreset(options[resolvedIndex]);
    } else if (
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
      isOpen &&
      pane === 'presets'
    ) {
      event.preventDefault();
      setHighlightedIndex((current) =>
        movePresetIndex(
          current < 0 ? selectedIndex : current,
          event.key,
          rollingOptions.length,
          calendarOptions.length
        )
      );
    } else if (event.key === 'Home' && isOpen && pane === 'presets') {
      event.preventDefault();
      setHighlightedIndex(0);
    } else if (event.key === 'End' && isOpen && pane === 'presets') {
      event.preventDefault();
      setHighlightedIndex(options.length - 1);
    } else if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      if (pane === 'custom') setPane('presets');
      else close(true);
    } else if (event.key === 'Tab' && isOpen) {
      close();
    }
  };

  const selectDay = (date: CalendarDate) => {
    const currentStart = calendarDateFromRangeInput(start, value.timeZone);
    const currentEnd = calendarDateFromRangeInput(end, value.timeZone);
    if (!currentStart || currentEnd || compareCalendarDates(date, currentStart) < 0) {
      setStart(calendarDateToInput(date));
      setEnd('');
    } else {
      setEnd(calendarDateToInput(date, '23:59'));
    }
    setActiveDate(date);
    setError('');
  };

  const handleDayKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: CalendarDate) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectDay(date);
      return;
    }
    if (
      ![
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Home',
        'End',
        'PageUp',
        'PageDown',
      ].includes(event.key)
    )
      return;
    event.preventDefault();
    const next = moveCalendarDate(date, event.key);
    setActiveDate(next);
    setMonth(firstCalendarDateOfMonth(next));
  };

  const applyCustom = () => {
    const result = validateCustomRange(start, end, value.timeZone);
    if (result.error) {
      setError(
        result.error === 'order'
          ? t('analytics.range_custom_order_error')
          : t('analytics.range_custom_length_error', { count: MAX_ANALYTICS_RANGE_DAYS })
      );
      return;
    }
    if (!result.startIso || !result.endIso) return;
    onChange({
      preset: 'custom',
      start: result.startIso,
      end: result.endIso,
      timeZone: value.timeZone,
      grain,
    });
    close(true);
  };

  const handlePopoverKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (pane === 'custom') returnToPresets();
      else close(true);
      return;
    }
    if (event.key !== 'Tab' || pane !== 'custom' || !popoverRef.current) return;
    const focusable = Array.from(
      popoverRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  };

  const startDate = calendarDateFromRangeInput(start, value.timeZone);
  const endDate = calendarDateFromRangeInput(end, value.timeZone);
  const today = calendarDateFromIso(new Date().toISOString(), value.timeZone);
  const nextMonth = addCalendarMonths(month, 1);
  const triggerLabel = [ariaLabel, displayLabel].filter(Boolean).join(' ');
  const dropdown =
    isOpen && positionStyle ? (
      <div
        ref={popoverRef}
        id="date-range-popover"
        className={`${styles.popover} ${pane === 'custom' ? styles.customPopover : styles.presetPopover} ${positionStyle['--picker-top'] ? styles.popoverBelow : styles.popoverAbove}`}
        style={positionStyle}
        onKeyDown={handlePopoverKeyDown}
        role={pane === 'presets' ? 'listbox' : 'dialog'}
        aria-label={
          pane === 'presets' ? t('analytics.range.presets', { defaultValue: 'Presets' }) : ariaLabel
        }
      >
        {pane === 'presets' ? (
          <>
            <div className={styles.rollingOptions}>
              {rollingOptions.map((option, index) => (
                <button
                  key={`${option.preset}-${option.badge}`}
                  id={`date-range-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={selectedIndex === index}
                  className={`${styles.option} ${selectedIndex === index ? styles.optionActive : ''} ${resolvedIndex === index ? styles.optionHighlighted : ''}`.trim()}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => commitPreset(option)}
                >
                  <span className={styles.badge}>{option.badge}</span>
                  <span className={styles.optionLabel}>{option.label}</span>
                  <span className={styles.check} aria-hidden="true">
                    {selectedIndex === index && <IconCheck size={14} />}
                  </span>
                </button>
              ))}
            </div>
            <div className={styles.divider} />
            <div className={styles.calendarOptions}>
              {calendarOptions.map((option, index) => {
                const optionIndex = rollingOptions.length + index;
                return (
                  <button
                    key={option.preset}
                    id={`date-range-option-${optionIndex}`}
                    type="button"
                    role="option"
                    aria-selected={selectedIndex === optionIndex}
                    className={`${styles.option} ${styles.calendarOption} ${selectedIndex === optionIndex ? styles.optionActive : ''} ${resolvedIndex === optionIndex ? styles.optionHighlighted : ''}`.trim()}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlightedIndex(optionIndex)}
                    onClick={() => commitPreset(option)}
                  >
                    <span className={styles.optionLabel}>{option.label}</span>
                    <span className={styles.check} aria-hidden="true">
                      {selectedIndex === optionIndex && <IconCheck size={14} />}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className={styles.divider} />
            <button
              id={`date-range-option-${options.length - 1}`}
              type="button"
              role="option"
              aria-selected={value.preset === 'custom'}
              className={`${styles.option} ${styles.customOption} ${value.preset === 'custom' ? styles.optionActive : ''} ${resolvedIndex === options.length - 1 ? styles.optionHighlighted : ''}`.trim()}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlightedIndex(options.length - 1)}
              onClick={() => commitPreset(options[options.length - 1])}
            >
              <span className={styles.calendarIcon}>
                <CalendarIcon />
              </span>
              <span className={styles.optionLabel}>
                {t('analytics.range.custom_range', { defaultValue: 'Custom range…' })}
              </span>
              <span className={styles.check} aria-hidden="true">
                {value.preset === 'custom' && <IconCheck size={14} />}
              </span>
            </button>
          </>
        ) : (
          <>
            <button type="button" className={styles.backButton} onClick={returnToPresets}>
              <IconChevronLeft size={16} aria-hidden="true" />
              {t('analytics.range.presets', { defaultValue: 'Presets' })}
            </button>
            <div className={styles.customFields}>
              <Input
                label={t('analytics.range_start')}
                type="datetime-local"
                value={start}
                className={styles.dateInput}
                onChange={(event) => {
                  setStart(event.target.value);
                  setError('');
                }}
              />
              <Input
                label={t('analytics.range_end')}
                type="datetime-local"
                value={end}
                className={styles.dateInput}
                onChange={(event) => {
                  setEnd(event.target.value);
                  setError('');
                }}
              />
              <div className={styles.grainField}>
                <span>{t('analytics.range_grain')}</span>
                <Select
                  value={grain}
                  onChange={(next) => setGrain(next as AnalyticsRangeGrain)}
                  options={[
                    { value: '1h', label: t('analytics.range_grain_1h') },
                    { value: '1d', label: t('analytics.range_grain_1d') },
                  ]}
                  ariaLabel={t('analytics.range_grain')}
                />
              </div>
            </div>
            <p className={styles.zone}>{t('analytics.range_zone', { zone: value.timeZone })}</p>
            {error && (
              <div className={styles.error} role="alert">
                {error}
              </div>
            )}
            <div className={styles.calendarToolbar}>
              <button
                type="button"
                className={styles.monthNav}
                aria-label={t('analytics.range_previous_month', { defaultValue: 'Previous month' })}
                onClick={() => {
                  const previous = addCalendarMonths(month, -1);
                  setMonth(firstCalendarDateOfMonth(previous));
                  setActiveDate(previous);
                }}
              >
                <IconChevronLeft size={15} aria-hidden="true" />
              </button>
              <span className={styles.monthLabel} aria-live="polite">
                {formatCalendarMonth(month, activeLocale)} ·{' '}
                {formatCalendarMonth(nextMonth, activeLocale)}
              </span>
              <button
                type="button"
                className={styles.monthNav}
                aria-label={t('analytics.range_next_month', { defaultValue: 'Next month' })}
                onClick={() => {
                  const next = addCalendarMonths(month, 1);
                  setMonth(firstCalendarDateOfMonth(next));
                  setActiveDate(next);
                }}
              >
                <IconChevronLeft size={15} aria-hidden="true" />
              </button>
            </div>
            <div className={styles.months}>
              <DayGrid
                month={month}
                activeDate={activeDate}
                startDate={startDate}
                endDate={endDate}
                today={today}
                locale={activeLocale}
                onDaySelect={selectDay}
                onDayKeyDown={handleDayKeyDown}
                dayRef={(element, date) => {
                  if (isSameCalendarDate(date, activeDate)) activeDayRef.current = element;
                }}
              />
              <DayGrid
                month={nextMonth}
                activeDate={activeDate}
                startDate={startDate}
                endDate={endDate}
                today={today}
                locale={activeLocale}
                onDaySelect={selectDay}
                onDayKeyDown={handleDayKeyDown}
                dayRef={(element, date) => {
                  if (isSameCalendarDate(date, activeDate)) activeDayRef.current = element;
                }}
              />
            </div>
            <div className={styles.footer}>
              <Button variant="secondary" onClick={returnToPresets}>
                {t('common.cancel')}
              </Button>
              <Button onClick={applyCustom}>{t('common.apply')}</Button>
            </div>
          </>
        )}
      </div>
    ) : null;

  return (
    <>
      <div ref={wrapRef} className={`${styles.wrap} ${className}`.trim()}>
        <button
          ref={triggerRef}
          type="button"
          className={styles.trigger}
          onClick={() => (isOpen ? close() : openPicker())}
          onKeyDown={handleTriggerKeyDown}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? 'date-range-popover' : undefined}
          aria-activedescendant={
            isOpen && pane === 'presets' ? `date-range-option-${resolvedIndex}` : undefined
          }
          aria-label={triggerLabel}
          title={`${resolvedBounds.start} → ${resolvedBounds.end}`}
          disabled={disabled}
        >
          <span className={styles.triggerText}>{displayLabel}</span>
          <span className={styles.triggerIcon} aria-hidden="true">
            <IconChevronDown size={16} />
          </span>
        </button>
      </div>
      {typeof document === 'undefined'
        ? dropdown
        : dropdown && createPortal(dropdown, document.body)}
    </>
  );
}

export default DateRangePicker;
