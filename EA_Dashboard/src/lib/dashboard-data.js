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

  let latestState = null;
  let submittedState = null;
  const failedKeys = new Set();
  const revisions = new Map();
  const activeWrites = new Set();

  function setSnapshot(nextState) {
    latestState = cloneState(nextState);
    if (!submittedState) submittedState = cloneState(nextState);
  }

  function flush() {
    if (!latestState || !submittedState) {
      return Promise.reject(new Error('Load a dashboard snapshot before saving.'));
    }
    const changedKeys = Object.keys(latestState).filter(key =>
      failedKeys.has(key) || JSON.stringify(latestState[key]) !== JSON.stringify(submittedState[key]));
    if (!changedKeys.length) return Promise.all([...activeWrites]);

    const snapshot = cloneState(latestState);
    submittedState = cloneState(snapshot);
    const writeRevisions = new Map(changedKeys.map(key => {
      const revision = (revisions.get(key) || 0) + 1;
      revisions.set(key, revision);
      failedKeys.delete(key);
      return [key, revision];
    }));
    const write = saveCoreSnapshot(snapshot, changedKeys)
      .catch(error => {
        for (const [key, revision] of writeRevisions) {
          if (revisions.get(key) === revision) failedKeys.add(key);
        }
        throw error;
      })
      .finally(() => { activeWrites.delete(write); });
    activeWrites.add(write);
    return write;
  }

  return {
    setSnapshot,
    schedule(nextState) {
      if (!submittedState) {
        return Promise.reject(new Error('Load a dashboard snapshot before scheduling changes.'));
      }
      setSnapshot(nextState);
      return flush();
    },
    flush,
    hasFailedWrites: () => failedKeys.size > 0,
    canSync,
  };
}