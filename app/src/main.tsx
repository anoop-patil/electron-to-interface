import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ConceptsProvider } from './concepts/ConceptsProvider';
import { startEngine } from './engine/engine';
import { thisBrowser, whyPythonCantRun } from './engine/support';
import { applyStoredTheme } from './theme';
import './fonts.css';
import './styles.css';

applyStoredTheme();
// A browser that can't run Python, such as a phone with too little memory, gets the Examples only.
const cantRun = whyPythonCantRun(thisBrowser());
const engine = cantRun ? null : startEngine();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConceptsProvider>
      <App engine={engine} cantRun={cantRun} />
    </ConceptsProvider>
  </StrictMode>,
);
