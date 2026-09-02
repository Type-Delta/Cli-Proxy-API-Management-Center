import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '@/i18n';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';

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
        <Card>
          <div role="alert">
            <EmptyState
              title={i18n.t('analytics.error_title')}
              description={i18n.t('analytics.error_route')}
              action={
                <Button variant="secondary" onClick={() => this.setState({ failed: false })}>
                  {i18n.t('common.refresh')}
                </Button>
              }
            />
          </div>
        </Card>
      );
    }
    return this.props.children;
  }
}
