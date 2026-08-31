import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '@/i18n';
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
          <h1>{i18n.t('analytics.error_title')}</h1>
          <p>{i18n.t('analytics.error_route')}</p>
          <button className="btn btn-secondary" onClick={() => this.setState({ failed: false })}>
            <span>{i18n.t('common.refresh')}</span>
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}
