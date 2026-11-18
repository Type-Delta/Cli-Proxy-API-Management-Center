import { useLayoutEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '@/hooks/motion';
import styles from './RollingNumber.module.scss';

/** Cells in each digit's strip: 0–9 three times, resting in the middle run. */
const RUN = 10;

/**
 * Strip cell a digit rolls to: forward through the digits when the number rose, backward when it
 * fell, wrapping past 9 or 0 like a slot reel. The roll then settles on the middle run.
 */
const rollTarget = (from: number, to: number, rising: boolean) =>
  RUN + from + (rising ? (to - from + 10) % 10 : -((from - to + 10) % 10));

const cell = (index: number) => `translateY(${-index * 1.15}em)`;

function Digit({ digit, rising }: { digit: number; rising: boolean }) {
  const strip = useRef<HTMLSpanElement>(null);
  const shown = useRef(digit);
  const [first] = useState(digit);

  useLayoutEffect(() => {
    const el = strip.current;
    const from = shown.current;
    shown.current = digit;
    if (!el || from === digit) return;
    // Start from the resting cell, so a roll cut short by the next change does not run backwards.
    el.style.transition = 'none';
    el.style.transform = cell(RUN + from);
    if (prefersReducedMotion()) {
      el.style.transform = cell(RUN + digit);
      return;
    }
    void el.offsetHeight;
    el.style.transition = '';
    el.style.transform = cell(rollTarget(from, digit, rising));
    const settle = () => {
      el.style.transition = 'none';
      el.style.transform = cell(RUN + digit);
    };
    el.addEventListener('transitionend', settle, { once: true });
    return () => el.removeEventListener('transitionend', settle);
  }, [digit, rising]);

  return (
    <span className={styles.digit}>
      <span ref={strip} className={styles.strip} style={{ transform: cell(RUN + first) }}>
        {Array.from({ length: RUN * 3 }, (_, index) => (
          <span key={index}>{index % 10}</span>
        ))}
      </span>
    </span>
  );
}

/**
 * A number whose digits roll like a slot machine when it changes: up as it rises, down as it
 * falls. Other characters from `format` (separators, suffixes such as K) change in place.
 * Screen readers get the plain formatted text.
 */
export function RollingNumber({
  value,
  format = (n) => n.toLocaleString(),
  className,
}: {
  value: number;
  format?: (value: number) => string;
  className?: string;
}) {
  // Which way the last change went, kept until the next one.
  const [last, setLast] = useState({ value, rising: true });
  // Object.is, so NaN equals itself instead of asking for another render forever.
  if (!Object.is(value, last.value)) setLast({ value, rising: value > last.value });
  const rising = Object.is(value, last.value) ? last.rising : value > last.value;
  const text = format(value);
  const chars = [...text];

  return (
    <span className={[styles.root, className].filter(Boolean).join(' ')}>
      <span className={styles.sr}>{text}</span>
      <span className={styles.reel} aria-hidden="true">
        {/* Keyed from the right, so the ones column stays put as the number grows. */}
        {chars.map((char, index) => {
          const place = chars.length - index;
          return /\d/.test(char) ? (
            <Digit key={`d${place}`} digit={Number(char)} rising={rising} />
          ) : (
            <span key={`c${place}`}>{char}</span>
          );
        })}
      </span>
    </span>
  );
}
