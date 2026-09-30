import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startEngine } from './engine/engine';
import { applyStoredTheme } from './theme';
import './fonts.css';
import './styles.css';

applyStoredTheme();
const engine = startEngine();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App engine={engine} />
  </StrictMode>,
);
