import '../polyfills/modern';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../app/App';
import { loadSettings } from '../services/settings-service/settings';
import { startUsageStats } from '../services/telemetry/usageStats';
import '../styles/index.css';

void loadSettings();
startUsageStats({ trackTime: true });
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
