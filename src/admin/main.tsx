import { createRoot } from 'react-dom/client';
import { AdminShell } from './AdminShell';
import '../styles/app.css';

// Il bundle admin non contiene segreti: la protezione e' sulle API. Senza sessione si va al login.
fetch('/api/admin', { cache: 'no-store', credentials: 'same-origin' })
  .then((res) => res.ok, () => false)
  .then((ok) => {
    if (!ok) return location.replace('/admin-login.html');
    createRoot(document.getElementById('root')!).render(<AdminShell />);
  });
