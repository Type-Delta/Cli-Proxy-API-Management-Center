import styles from './HeatmapReadout.module.scss';

export type HeatmapReadoutItem = {
  text: string;
  /** Exact value behind a compacted `text`, surfaced as a native tooltip. */
  title?: string;
  /** Renders the identity of the hovered cell (key/model, timestamp) rather than a measure. */
  strong?: boolean;
};

/**
 * The single readout both analytics heatmaps write into. It is a live region rather than a
 * tooltip so pointer, touch and keyboard all reach the same text, and it reserves its height
 * so the grid below never shifts when a cell becomes active.
 */
export function HeatmapReadout({
  items,
  placeholder,
}: {
  items: HeatmapReadoutItem[];
  /** Shown while no cell is active, so the strip is never an unexplained empty box. */
  placeholder: string;
}) {
  return (
    <p className={styles.readout} role="status" aria-live="polite">
      {items.length === 0 ? (
        <span className={styles.placeholder}>{placeholder}</span>
      ) : (
        items.map((item, index) =>
          item.strong ? (
            <strong key={index} title={item.title}>
              {item.text}
            </strong>
          ) : (
            <span key={index} title={item.title}>
              {item.text}
            </span>
          )
        )
      )}
    </p>
  );
}
