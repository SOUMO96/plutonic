import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// The admin lives at /#/admin/login. People also type /admin (the host redirects it; this covers local development).
if (window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/')) window.location.replace('/#/admin/login');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
