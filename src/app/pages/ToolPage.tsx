import { Component, Suspense, useState, type ReactNode } from 'react';
import { getTool } from '../../features/registry';
import { takeHandedOffFiles } from '../router';
import { Skeleton, Spinner } from '../../components/ui/Feedback';
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
          <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-10" aria-busy="true" aria-label={`Loading ${tool.name}`}>
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 rounded-2xl" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-6 w-56" />
              </div>
            </div>
            <Skeleton className="mt-8 h-72 w-full rounded-[28px]" />
            <span className="sr-only">
              <Spinner /> Loading {tool.name}…
            </span>
          </div>
        }
      >
        <ToolComponent tool={tool} initialFiles={initialFiles} />
      </Suspense>
    </ToolErrorBoundary>
  );
}
