import { ROUTING_FIELD_ICONS, splitRoutingCondition } from './routingIcons';
import styles from './RoutingConditionText.module.scss';

/** A one-line routing condition with an icon before each field it compares. */
export function RoutingConditionText({ text }: { text: string }) {
  return splitRoutingCondition(text).map((part, index) => {
    if (!part.field) return part.text;
    const Icon = ROUTING_FIELD_ICONS[part.field];
    return (
      <span key={index} className={styles.field}>
        <Icon size={12} strokeWidth={2.2} className={styles.icon} />
        {part.text}
      </span>
    );
  });
}
