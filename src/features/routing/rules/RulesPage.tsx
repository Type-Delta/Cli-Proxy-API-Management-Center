import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { useAuthStore } from '@/stores';
import { useConfigDocument } from '@/features/config/hooks/useConfigDocument';
import { DiffModal } from '@/features/config/components/DiffModal';
import type { VisualConfigValues } from '@/types/visualConfig';
import { RoutingSaveBar } from '../components/RoutingSaveBar';
import { RoutingTabs } from '../RoutingTabs';
import { SectionRouting } from './SectionRouting';
import { routingRulesChanges } from './logic';
import styles from '../RoutingPage.module.scss';

export function RulesPage() {
  const { t } = useTranslation();
  const visual = useVisualConfig();
  const doc = useConfigDocument({ mode: 'visual', ...visual });
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const scope = useAuthStore((state) => state.scope);
  const layer = usePageTransitionLayer();
  const layoutRef = useRef<HTMLDivElement>(null);
  const disabled =
    connectionStatus !== 'connected' ||
    scope === 'read-only' ||
    doc.loading ||
    doc.saving ||
    doc.diffModalOpen ||
    doc.recoveryRequired;
  const onChange = (patch: Partial<VisualConfigValues>) => {
    if (!disabled) visual.setVisualValues(routingRulesChanges(patch));
  };
  useHeaderRefresh(doc.handleReload);
  useUnsavedChangesGuard({
    enabled: layer?.isCurrentLayer ?? true,
    shouldBlock: doc.isDirty,
    dialog: {
      title: t('routing.unsaved_title'),
      message: t('routing.unsaved_message'),
      confirmText: t('routing.unsaved_confirm'),
      cancelText: t('routing.unsaved_cancel'),
      variant: 'danger',
    },
  });
  const validationBlocked = Boolean(visual.visualValidationErrors.routingRules);
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('routing.title')}</h1>
      </header>
      <RoutingTabs value="rules" />
      {doc.error || visual.visualParseError ? (
        <p role="alert">{doc.error || visual.visualParseError}</p>
      ) : null}
      {doc.loading ? (
        <p role="status">{t('routing.loading')}</p>
      ) : (
        <div ref={layoutRef}>
          <SectionRouting
            values={visual.visualValues}
            validationErrors={visual.visualValidationErrors}
            disabled={disabled || Boolean(doc.error || visual.visualParseError)}
            onChange={onChange}
          />
        </div>
      )}
      <RoutingSaveBar
        visible={(layer?.isCurrentLayer ?? true) && doc.isDirty}
        count={visual.visualDirtyFields.size}
        saving={doc.saving}
        saveDisabled={
          disabled || validationBlocked || Boolean(doc.error || visual.visualParseError)
        }
        onSave={() => {
          if (!disabled && !validationBlocked) void doc.handleSave();
        }}
        onDiscard={doc.handleDiscard}
        layoutRef={layoutRef}
      />
      <DiffModal
        open={doc.diffModalOpen}
        original={doc.serverYaml}
        modified={doc.mergedYaml}
        onConfirm={() => {
          if (scope !== 'read-only') void doc.handleConfirmSave();
        }}
        onCancel={doc.closeDiff}
        loading={doc.saving}
      />
    </div>
  );
}
