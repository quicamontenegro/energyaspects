#!/usr/bin/env node

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');

dotenv.config({ path: envPath });

async function main() {
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.error('❌ Missing env vars');
    process.exit(1);
  }

  const sbClient = createClient(url, anonKey, {
    auth: { persistSession: false },
  });

  console.log('📍 Checking sprints in Supabase...\n');

  try {
    const { data: sprints, error } = await sbClient
      .from('sprints')
      .select('id, name, team, team_id, sort_order');

    if (error) throw error;

    if (!sprints || sprints.length === 0) {
      console.log('❌ No sprints found in Supabase');
      return;
    }

    console.log(`✅ Found ${sprints.length} sprints:\n`);
    sprints.forEach((sprint) => {
      console.log(`  📌 ${sprint.name}`);
      console.log(`     ID: ${sprint.id}`);
      console.log(`     Team: ${sprint.team || 'NULL'}`);
      console.log(`     Team ID: ${sprint.team_id || 'NULL'}`);
      console.log();
    });

    // Count tickets per sprint
    console.log('📍 Counting tickets per sprint...\n');
    for (const sprint of sprints) {
      const { data: tickets, error: ticketError } = await sbClient
        .from('sprint_tickets')
        .select('id')
        .eq('sprint_id', sprint.id);

      if (ticketError) throw ticketError;
      console.log(`  ${sprint.name}: ${tickets?.length || 0} tickets`);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
