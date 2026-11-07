import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../app/App';
import { loadSettings } from '../services/settings-service/settings';
import '../styles/index.css';

void loadSettings();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
