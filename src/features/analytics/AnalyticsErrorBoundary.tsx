import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '@/i18n';
import { Button } from '@/components/ui/Button';
import styles from './Analytics.module.scss';

export class AnalyticsErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The route remains contained. API and credential content is never logged here.
  }

  render() {
    if (this.state.failed) {
      return (
        <section className={styles.state} role="alert">
          <h2>{i18n.t('analytics.error_title')}</h2>
          <p>{i18n.t('analytics.error_route')}</p>
          <Button variant="secondary" onClick={() => this.setState({ failed: false })}>
            {i18n.t('common.refresh')}
          </Button>
        </section>
      );
    }
    return this.props.children;
  }
}
