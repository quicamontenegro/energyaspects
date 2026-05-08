import { createClient } from '@supabase/supabase-js';

import { setSupabaseClient, loadAllData, saveCoreSnapshot } from '../../supabase-data-layer.js';
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
    return {
      snapshot: baseline,
      canSync: false,
    };
  }

  const client = createClient(config.url, config.anonKey, {
    auth: { persistSession: false },
  });

  setSupabaseClient(client);

  try {
    const remote = await loadAllData();
    if (!remote || typeof remote !== 'object') {
      console.error('Supabase returned no snapshot payload. Falling back to local mode.');
      return {
        snapshot: baseline,
        canSync: false,
      };
    }

    return {
      snapshot: mergeSnapshot(baseline, remote),
      canSync: true,
    };
  } catch (error) {
    console.error('Failed to load dashboard snapshot from Supabase.', error);
    return {
      snapshot: baseline,
      canSync: false,
    };
  }
}

export function createDashboardPersistence(canSync) {
  let latestState = createDefaultSnapshot();

  async function flush() {
    if (!canSync) {
      return;
    }
    await saveCoreSnapshot(cloneState(latestState));
  }

  return {
    setSnapshot(nextState) {
      latestState = cloneState(nextState);
    },
    schedule(nextState) {
      latestState = cloneState(nextState);
      if (!canSync) {
        return Promise.resolve();
      }

      return flush();
    },
    flush,
    canSync,
  };
}