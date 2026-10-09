import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { GlossaryProvider } from './context/GlossaryContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlossaryProvider>
      <App />
    </GlossaryProvider>
  </StrictMode>,
);
