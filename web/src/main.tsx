import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

/**
 * FieldLink starts here. The whole workspace is one client of the organisation's
 * database — the same code runs on a phone, a tablet and a laptop.
 */
const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
