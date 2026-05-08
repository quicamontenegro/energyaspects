import './styles/app.css';

import { createDashboardApp } from './app/App.js';
import { createDashboardPersistence, loadDashboardSnapshot } from './lib/dashboard-data.js';

const root = document.querySelector('#app');

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
        <p class="hero-copy">Check the browser console and confirm the Supabase configuration is valid.</p>
      </section>
    </main>
  `;
});