import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { IconChevronDown, IconChevronUp } from '@/components/ui/icons';
import {
  EVENT_COLUMN_IDS,
  moveEventColumn,
  type EventColumnId,
  type EventColumnPreferences,
} from './eventColumns';
import styles from './Events.module.scss';

export type EventColumnOption = { id: EventColumnId; label: string };

export function EventColumnSettings({
  open,
  options,
  preferences,
  onApply,
  onClose,
}: {
  open: boolean;
  options: readonly EventColumnOption[];
  preferences: EventColumnPreferences;
  onApply: (preferences: EventColumnPreferences) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(preferences);

  useEffect(() => {
    if (open) setDraft(preferences);
  }, [open, preferences]);

  const labels = new Map(options.map((option) => [option.id, option.label]));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('analytics.event_columns_title', { defaultValue: 'Event columns' })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => onApply(draft)}>
            {t('common.apply', { defaultValue: 'Apply' })}
          </Button>
        </>
      }
    >
      <p className={styles.modalDescription}>
        {t('analytics.event_columns_description', {
          defaultValue: 'Choose visible columns and set their order.',
        })}
      </p>
      <div className={styles.columnList}>
        {draft.order.map((id, index) => {
          const checked = draft.visible.includes(id);
          return (
            <div className={styles.columnRow} key={id}>
              <SelectionCheckbox
                checked={checked}
                disabled={checked && draft.visible.length === 1}
                label={labels.get(id) ?? id}
                onChange={(nextChecked) =>
                  setDraft((current) => ({
                    ...current,
                    visible: nextChecked
                      ? EVENT_COLUMN_IDS.filter(
                          (column) => current.visible.includes(column) || column === id
                        )
                      : current.visible.filter((column) => column !== id),
                  }))
                }
              />
              <span className={styles.columnMoves}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={index === 0}
                  aria-label={t('analytics.move_column_up', {
                    column: labels.get(id) ?? id,
                    defaultValue: 'Move {{column}} up',
                  })}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      order: moveEventColumn(current.order, id, -1),
                    }))
                  }
                >
                  <IconChevronUp size={16} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={index === draft.order.length - 1}
                  aria-label={t('analytics.move_column_down', {
                    column: labels.get(id) ?? id,
                    defaultValue: 'Move {{column}} down',
                  })}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      order: moveEventColumn(current.order, id, 1),
                    }))
                  }
                >
                  <IconChevronDown size={16} />
                </Button>
              </span>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
