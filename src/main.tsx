import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadPublicCatalog } from './lib/catalog';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(<App load={loadPublicCatalog} base="" />);
