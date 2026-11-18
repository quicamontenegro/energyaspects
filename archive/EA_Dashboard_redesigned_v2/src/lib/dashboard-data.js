import { createClient } from '@supabase/supabase-js';

import { setSupabaseClient, loadAllData, saveCoreSnapshot, saveSprintsCanonical } from '../../supabase-data-layer.js';
import { cloneState, createDefaultSnapshot, mergeSnapshot } from '../state/defaults.js';

function getMetaValue(name) {
  return document.querySelector(`meta[name="${name}"]`)?.content?.trim() || '';
}

function getRuntimeValue(name) {
  const runtime = globalThis.__EA_ENV__;
  if (!runtime || typeof runtime !== 'object') {
    return '';
  }

  return String(runtime[name] || '').trim();
}

function resolveSupabaseConfig() {
  const url = getRuntimeValue('url') || import.meta.env.VITE_SUPABASE_URL || getMetaValue('supabase-url');
  const anonKey = getRuntimeValue('key') || import.meta.env.VITE_SUPABASE_ANON_KEY || getMetaValue('supabase-anon-key');
  const validUrl = url && !url.includes('VITE_SUPABASE_URL');
  const validKey = anonKey && !anonKey.includes('VITE_SUPABASE_ANON_KEY');

  return {
    url: validUrl ? url : '',
    anonKey: validKey ? anonKey : '',
  };
}

export async function loadDashboardSnapshot() {
  const config = resolveSupabaseConfig();
  const baseline = createDefaultSnapshot();

  if (!config.url || !config.anonKey) {
    throw new Error('Supabase configuration is required. Local-only mode is disabled.');
  }

  const client = createClient(config.url, config.anonKey, {
    auth: { persistSession: false },
  });

  setSupabaseClient(client);

  try {
    const remote = await loadAllData();
    if (!remote || typeof remote !== 'object') {
      throw new Error('Supabase returned an invalid snapshot payload.');
    }

    return {
      snapshot: mergeSnapshot(baseline, remote),
      canSync: true,
    };
  } catch (error) {
    console.error('Failed to load dashboard snapshot from Supabase.', error);
    throw new Error('Supabase sync is mandatory. Dashboard start blocked to prevent local-only data.');
  }
}

export function createDashboardPersistence(canSync) {
  if (!canSync) {
    throw new Error('Supabase sync is mandatory. Persistence cannot run in local mode.');
  }

  let latestState = createDefaultSnapshot();

  async function flush() {
    await saveCoreSnapshot(cloneState(latestState));
  }

  return {
    setSnapshot(nextState) {
      latestState = cloneState(nextState);
    },
    schedule(nextState) {
      latestState = cloneState(nextState);
      // Save canonical sprint data first (fast, single DB call) so refresh
      // always sees the latest sprint state even if full sync is still in flight.
      const spData = Array.isArray(nextState.spData) ? nextState.spData : [];
      const canonical = saveSprintsCanonical(spData).catch((err) => {
        console.error('Sprint canonical save failed.', err);
      });
      // Full sync runs in background — don't block the caller.
      flush().catch((err) => {
        console.error('Background full sync failed.', err);
      });
      return canonical;
    },
    flush,
    canSync,
  };
}