import './styles/app.css';

import { createDashboardApp } from './app/App.js';
import { createDashboardPersistence, loadDashboardSnapshot } from './lib/dashboard-data.js';

const root = document.querySelector('#app');
const THEME_STORAGE_KEY = 'ea-dashboard-theme';

function initializeTheme() {
  let theme = 'light';
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === 'dark' || storedTheme === 'light') {
      theme = storedTheme;
    }
  } catch (error) {
    console.warn('Could not read saved dashboard theme.', error);
  }
  document.documentElement.dataset.theme = theme;
}

initializeTheme();

async function bootstrap() {
  const { snapshot, canSync } = await loadDashboardSnapshot();
  const persistence = createDashboardPersistence(canSync);
  createDashboardApp(root, snapshot, persistence);
}

bootstrap().catch((error) => {
  console.error('Failed to start EA Dashboard', error);
  root.innerHTML = `
    <main class="app-shell error-shell">
      <section class="hero-card">
        <p class="eyebrow">Initialization Error</p>
        <h1>EA Dashboard could not start.</h1>
        <p class="hero-copy">Supabase is mandatory and local mode is disabled. Check the browser console and confirm the Supabase configuration/connection is valid.</p>
      </section>
    </main>
  `;
});