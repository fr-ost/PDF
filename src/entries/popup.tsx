import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Popup } from '../popup/Popup';
import { loadSettings } from '../services/settings-service/settings';
import '../styles/index.css';

void loadSettings();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
