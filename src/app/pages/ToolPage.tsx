import { Component, Suspense, useState, type ReactNode } from 'react';
import { getTool } from '../../features/registry';
import { takeHandedOffFiles } from '../router';
import { Spinner } from '../../components/ui/Feedback';
import { Alert } from '../../components/ui/Feedback';
import { Button } from '../../components/ui/Button';
import { NotFoundPage } from './NotFoundPage';

class ToolErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error) {
    console.error('[Unique PDF] tool crashed', error);
  }
  override render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-2xl px-6 py-16">
          <Alert tone="danger" title="This tool hit an unexpected problem" action={<Button size="sm" onClick={() => location.reload()}>Reload</Button>}>
            Your original files were not changed. Reload the page and try again. Details: {this.state.error.message}
          </Alert>
        </div>
      );
    }
    return this.props.children;
  }
}

export function ToolPage({ id }: { id: string }) {
  const tool = getTool(id);
  // ToolPage is keyed by tool id, so this runs once per opened tool.
  const [initialFiles] = useState(takeHandedOffFiles);
  if (!tool) return <NotFoundPage />;
  const ToolComponent = tool.component;
  return (
    <ToolErrorBoundary key={id}>
      <Suspense
        fallback={
          <div className="flex items-center justify-center gap-2 py-32 text-sm text-fg-muted">
            <Spinner /> Loading {tool.name}…
          </div>
        }
      >
        <ToolComponent tool={tool} initialFiles={initialFiles} />
      </Suspense>
    </ToolErrorBoundary>
  );
}
