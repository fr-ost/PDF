import { CategoryPage } from './pages/CategoryPage';
import { HomePage } from './pages/HomePage';
import { RecentPage } from './pages/RecentPage';
import { SettingsPage } from './pages/SettingsPage';
import { AboutPage } from './pages/AboutPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { ToolPage } from './pages/ToolPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { DonatePage } from './pages/DonatePage';
import { ReviewPrompt } from './shell/ReviewPrompt';
import { Layout } from './Layout';
import { cancelPendingNavigation, confirmPendingNavigation, usePendingNavigation, useRoute, type Route } from './router';
import { useApplyTheme } from '../hooks/useTheme';
import { ToastProvider } from '../components/ui/Toast';
import { ConfirmDialog } from '../components/ui/Dialog';
import { useEffect } from 'react';
import { CommandPalette, toggleCommandPalette } from './shell/CommandPalette';
import { CATEGORY_INFO, getTool } from '../features/registry';

function titleFor(route: Route): string {
  switch (route.name) {
    case 'category':
      return CATEGORY_INFO[route.category].title;
    case 'tool':
      return getTool(route.id)?.name ?? 'Tool';
    case 'recent':
      return 'Recent files';
    case 'settings':
      return 'Settings';
    case 'about':
      return 'About';
    case 'privacy':
      return 'Privacy';
    case 'donate':
      return 'Donate';
    default:
      return '';
  }
}

function Page({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <HomePage />;
    case 'category':
      return <CategoryPage category={route.category} />;
    case 'tool':
      return <ToolPage key={route.id} id={route.id} />;
    case 'recent':
      return <RecentPage />;
    case 'settings':
      return <SettingsPage />;
    case 'about':
      return <AboutPage />;
    case 'privacy':
      return <PrivacyPage />;
    case 'donate':
      return <DonatePage />;
    default:
      return <NotFoundPage />;
  }
}

export function App() {
  useApplyTheme();
  const route = useRoute();
  const pending = usePendingNavigation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // A file dropped outside a drop zone would make Chrome open it in place of
  // the app (losing any work). Drop zones handle their own events first.
  useEffect(() => {
    const isFileDrag = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
    const onDragOver = (e: DragEvent) => {
      if (!isFileDrag(e) || e.defaultPrevented) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'none';
    };
    const onDrop = (e: DragEvent) => {
      if (isFileDrag(e) && !e.defaultPrevented) e.preventDefault();
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  // When the browser is idle, load the most used tools so they open instantly.
  useEffect(() => {
    const preload = () => ['ai-chat', 'merge', 'compress', 'split', 'ai-summary', 'edit'].forEach((id) => getTool(id)?.preload());
    const idle = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const handle = idle ? idle(preload, { timeout: 4000 }) : window.setTimeout(preload, 2500);
    return () => {
      const cancel = (globalThis as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
      if (idle && cancel) cancel(handle);
      else window.clearTimeout(handle);
    };
  }, []);
  useEffect(() => {
    const t = titleFor(route);
    document.title = t ? `${t} · Unique PDF` : 'Unique PDF — Free PDF Toolkit';
  }, [route]);
  return (
    <ToastProvider>
      <Layout>
        <Page route={route} />
      </Layout>
      <CommandPalette />
      <ReviewPrompt />
      <ConfirmDialog
        open={!!pending}
        onCancel={cancelPendingNavigation}
        onConfirm={confirmPendingNavigation}
        title="Leave this tool?"
        message={pending?.message ?? ''}
        confirmLabel="Leave"
        tone="danger"
      />
    </ToastProvider>
  );
}
