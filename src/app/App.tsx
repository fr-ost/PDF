import { CategoryPage } from './pages/CategoryPage';
import { HomePage } from './pages/HomePage';
import { RecentPage } from './pages/RecentPage';
import { SettingsPage } from './pages/SettingsPage';
import { AboutPage } from './pages/AboutPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { ToolPage } from './pages/ToolPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { Layout } from './Layout';
import { cancelPendingNavigation, confirmPendingNavigation, usePendingNavigation, useRoute, type Route } from './router';
import { useApplyTheme } from '../hooks/useTheme';
import { ToastProvider } from '../components/ui/Toast';
import { ConfirmDialog } from '../components/ui/Dialog';
import { useEffect } from 'react';
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
    default:
      return <NotFoundPage />;
  }
}

export function App() {
  useApplyTheme();
  const route = useRoute();
  const pending = usePendingNavigation();
  useEffect(() => {
    const t = titleFor(route);
    document.title = t ? `${t} · Unique PDF` : 'Unique PDF — Free PDF Toolkit';
  }, [route]);
  return (
    <ToastProvider>
      <Layout>
        <Page route={route} />
      </Layout>
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
