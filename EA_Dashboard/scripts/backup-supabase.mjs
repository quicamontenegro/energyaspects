import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(rootDir, '.env.local') });
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const TABLES = [
  'settings',
  'projects',
  'project_members',
  'velocity_teams',
  'velocity_sprints',
  'velocity_members',
  'velocity_points',
  'data_explorer_tasks',
  'rpde_tickets',
  'milestones',
  'milestone_tasks',
  'sprints',
  'sprint_tickets',
];

const PAGE_SIZE = 1000;

async function fetchAllRows(tableName) {
  const rows = [];
  let from = 0;

  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(from, to);

    if (error) {
      throw new Error(`Failed to read ${tableName}: ${error.message}`);
    }

    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    rows.push(...data);

    if (data.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return rows;
}

async function main() {
  const backup = {
    meta: {
      projectUrl: SUPABASE_URL,
      exportedAt: new Date().toISOString(),
      tables: TABLES,
    },
    data: {},
  };

  for (const table of TABLES) {
    const rows = await fetchAllRows(table);
    backup.data[table] = rows;
    console.log(`${table}: ${rows.length} rows`);
  }

  const backupDir = path.join(rootDir, 'backups');
  await fs.mkdir(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `supabase-backup-${timestamp}.json`);

  await fs.writeFile(backupPath, JSON.stringify(backup, null, 2), 'utf8');

  console.log(`\nBackup saved to: ${backupPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});