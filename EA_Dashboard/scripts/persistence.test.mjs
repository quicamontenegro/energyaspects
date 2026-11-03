import assert from 'node:assert/strict';
import test from 'node:test';

import { loadAllData, saveCoreSnapshot, setSupabaseClient } from '../supabase-data-layer.js';
import { createDashboardPersistence } from '../src/lib/dashboard-data.js';
import { createDefaultSnapshot, mergeSnapshot } from '../src/state/defaults.js';
import { renderSprintsSection } from '../src/sections/sprintsSection.js';
import { duplicateSprintTicket } from '../src/utils/dashboard.js';

const columns = {
  settings: ['key', 'value', 'updated_at'],
  projects: ['id', 'name', 'tag', 'color', 'active', 'sort_order', 'updated_at'],
  project_members: ['id', 'project_id', 'name', 'pto', 'feriados', 'hours_off', 'total_logged', 'sort_order', 'updated_at'],
  velocity_teams: ['id', 'name', 'color', 'group_id', 'sort_order', 'updated_at'],
  velocity_sprints: ['id', 'team_id', 'position', 'label', 'completed', 'updated_at'],
  velocity_members: ['id', 'team_id', 'name', 'sort_order', 'updated_at'],
  velocity_points: ['id', 'member_id', 'sprint_position', 'points', 'updated_at'],
  data_explorer_tasks: ['id', 'name', 'title', 'week', 'meeting_id', 'status', 'assignee', 'jira_id', 'priority', 'due_date', 'notes', 'created_at', 'updated_at'],
  rpde_tickets: ['id', 'team', 'assignee', 'jira_id', 'jira_url', 'title', 'status', 'priority', 'notes', 'created_at', 'updated_at'],
  milestones: ['id', 'name', 'team', 'team_id', 'status', 'assignee', 'url', 'notes', 'sort_order', 'updated_at'],
  milestone_tasks: ['id', 'milestone_id', 'name', 'title', 'status', 'notes', 'sort_order', 'updated_at'],
  sprints: ['id', 'name', 'team', 'team_id', 'sort_order', 'start_date', 'end_date', 'updated_at'],
  sprint_tickets: ['id', 'sprint_id', 'assignee', 'jira_id', 'epic_id', 'jira_url', 'title', 'description', 'status', 'sort_order', 'priority', 'updated_at'],
};

function createDatabase() {
  const tables = Object.fromEntries(Object.keys(columns).map(table => [table, []]));
  const writes = [];
  const starts = [];
  const failures = new Map();
  const gates = new Map();

  function from(table) {
    let action = 'select';
    let projection = '*';
    let payload = [];
    let conflict = 'id';
    let ignoreDuplicates = false;
    let single = false;
    let limit = Infinity;
    const filters = [];
    const query = {
      select(value = '*') { projection = value; return query; },
      order() { return query; },
      limit(value) { limit = value; return query; },
      eq(key, value) { filters.push(row => row[key] === value); return query; },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; },
      maybeSingle() { single = true; return query; },
      upsert(value, options = {}) { action = 'upsert'; payload = value; conflict = options.onConflict || 'id'; ignoreDuplicates = options.ignoreDuplicates === true; return query; },
      delete() { action = 'delete'; return query; },
      then(resolve, reject) {
        return execute().then(resolve, reject);
      },
    };
    async function execute() {
      if (action === 'upsert') starts.push(table);
      if (gates.has(`${table}:${action}`)) await gates.get(`${table}:${action}`);
      const failure = failures.get(`${table}:${action}`);
      if (failure) return { data: null, error: failure };
      if (action === 'select') {
        const selectedColumns = projection === '*' ? columns[table] : projection.split(',');
        const unknown = selectedColumns.find(column => !columns[table].includes(column));
        if (unknown) return { data: null, error: new Error(`Unknown ${table}.${unknown}`) };
        const data = tables[table].filter(row => filters.every(filter => filter(row)))
          .slice(0, limit).map(row => Object.fromEntries(selectedColumns.map(column => [column, row[column]])));
        return { data: single ? data[0] || null : data, error: null };
      }
      if (action === 'upsert') {
        for (const row of payload) {
          const unknown = Object.keys(row).find(column => !columns[table].includes(column));
          if (unknown) return { data: null, error: new Error(`Unknown ${table}.${unknown}`) };
          if (['data_explorer_tasks', 'milestone_tasks'].includes(table) && row.title == null) {
            return { data: null, error: new Error(`${table}.title is required`) };
          }
        }
        writes.push({ table, payload: structuredClone(payload) });
        for (const row of payload) {
          const index = tables[table].findIndex(existing => existing[conflict] === row[conflict]);
          if (index < 0) tables[table].push(structuredClone(row));
          else if (!ignoreDuplicates) tables[table][index] = { ...tables[table][index], ...structuredClone(row) };
        }
      } else {
        writes.push({ table, deleted: true });
        tables[table] = tables[table].filter(row => !filters.every(filter => filter(row)));
      }
      return { data: null, error: null };
    }
    return query;
  }
  return { from, tables, writes, starts, failures, gates };
}

function fixture() {
  return {
    ...createDefaultSnapshot(),
    settings: { monthlyHours: 160, hoursPerDay: 7 },
    projects: [{ id: 'project', name: 'Project', tag: 'RP', color: '#123456', active: false, members: [{ name: 'Member', pto: 2, feriados: 1, hoursOff: 21, tl: 139 }] }],
    teams: [{ id: 'team', name: 'Team', group: 'de', color: '#234567', sprints: ['Custom Sprint', 'Empty Sprint'], sprintCompleted: [true, false], members: [{ name: 'Member', sp: [13, 0] }] }],
    deTasks: [{ id: 'task', name: 'Task', week: '2026-W45', meetingId: 'meeting', status: 'blocked', assignee: 'Member', jiraId: 'DP-1', priority: 'High', dueDate: '2026-11-06', notes: 'DE notes', createdAt: '2026-11-03T10:00:00Z' }],
    deMeetings: [{ id: 'meeting', date: '2026-11-03', week: '', name: 'Meeting', notes: 'Meeting notes', createdAt: '2026-11-03T10:00:00Z' }],
    rpdeTickets: [{ id: 'rpde', team: 'de', title: 'Ticket', assignee: 'Member', jiraId: 'DP-2', jiraUrl: 'https://example.com/DP-2', status: 'testing', priority: 'High', notes: 'Ticket notes', createdAt: '2026-11-03T10:00:00Z' }],
    msData: [{ id: 'milestone', team: 'de', name: 'Milestone', status: 'blocked', assignee: 'Member', url: 'https://example.com', notes: 'Milestone notes', tasks: [{ id: 'milestone-task', name: 'Milestone task', status: 'completed', notes: 'Task notes' }] }],
    spTeamMembers: [{ name: 'Member', role: 'QA' }],
    spNotes: [{ id: 'note', title: 'Shared title', text: 'Shared text', color: '#345678', link: 'https://example.com/note', createdAt: '2026-11-03T10:00:00Z' }],
    spEpics: [{ id: 'epic', title: 'Epic', url: 'https://example.com/epic', createdAt: '2026-11-03T10:00:00Z' }],
    velocityReportSprints: [{ id: 'report', label: 'Sprint', team: 'RP', startDate: '2026-11-03', endDate: '2026-11-17', plannedSP: 34, completedSP: 21, carryOverSP: 13, workItemsCompleted: 8, scopeChange: 3, bugsFixed: 2, devCompletedSP: 13, devAverage: 6.5, qaCompletedSP: 8, qaAverage: 4, distribution: { notStarted: 1, inProgress: 2, codeReview: 3, readyForQA: 4, inQA: 5, blocked: 6 }, completed: true }],
    spCollapsedByKey: { sprint: true },
    spQuickLinks: [{ id: 'shared-link', label: 'Shared dashboard', url: 'https://example.com/shared' }],
    spData: [{ id: 'sprint', team: 'de', name: 'Sprint', startDate: '2026-11-03', endDate: '2026-11-17', columnAssignees: ['Member'], notesBoard: [{ id: 'board-note', text: 'Board notes', color: '#456789' }], quickLinks: [{ id: 'link', label: 'Jira', url: 'https://example.com' }], tickets: [{ id: 'sprint-ticket', title: 'Sprint ticket', assignee: 'Member', jiraId: 'DP-3', epicTitle: 'Epic', epicUrl: 'https://example.com/epic', storyPoints: 8, status: 'inreview', priority: 'High', notes: 'Sprint ticket notes' }] }],
  };
}

test('all component fields survive save and reload starting from empty tables', async () => {
  const database = createDatabase();
  setSupabaseClient(database);
  assert.ok(await loadAllData());
  const snapshot = fixture();
  await saveCoreSnapshot(snapshot);
  const reloaded = await loadAllData();
  assert.ok(reloaded);
  for (const key of ['settings', 'projects', 'deTasks', 'deMeetings', 'rpdeTickets', 'msData', 'spTeamMembers', 'spNotes', 'spEpics', 'spQuickLinks', 'spCollapsedByKey', 'velocityReportSprints', 'spData']) {
    assert.deepEqual(reloaded[key], snapshot[key], key);
  }
  assert.deepEqual(reloaded.teams, snapshot.teams, 'legacy velocity labels and points');
});

test('a failed read in any table blocks a writable snapshot', async () => {
  for (const table of Object.keys(columns)) {
    const database = createDatabase();
    database.failures.set(`${table}:select`, new Error(`Read failed: ${table}`));
    setSupabaseClient(database);
    assert.equal(await loadAllData(), null, table);
    assert.equal(database.writes.length, 0);
  }
});

test('velocity preserves sprints without members and sparse point positions', async () => {
  const database = createDatabase();
  setSupabaseClient(database);
  const snapshot = fixture();
  snapshot.teams[0].members = [];
  await saveCoreSnapshot(snapshot);
  assert.deepEqual((await loadAllData()).teams[0].sprints, ['Custom Sprint', 'Empty Sprint']);
  database.tables.velocity_members.push({ id: 'sparse-member', team_id: 'team', name: 'Sparse member' });
  database.tables.velocity_points.push({ id: 'sparse-point', member_id: 'sparse-member', sprint_position: 2, points: 8 });
  const reloaded = await loadAllData();
  assert.deepEqual(reloaded.teams[0].members[0].sp, [0, 0, 8]);
  assert.equal(reloaded.teams[0].sprints[2], 'Sprint 3');
});

test('an edit in one component must not rewrite other components', async () => {
  const database = createDatabase();
  setSupabaseClient(database);
  const snapshot = fixture();
  const persistence = createDashboardPersistence(true);
  persistence.setSnapshot(snapshot);
  await persistence.flush();
  assert.equal(database.writes.length, 0, 'loading or closing without edits is read-only');
  const changed = structuredClone(snapshot);
  changed.spEpics.push({ id: 'new-epic', title: 'New epic', url: '' });
  await persistence.schedule(changed);
  assert.ok(database.writes.length);
  assert.ok(database.writes.every(write => write.table === 'settings' && write.payload.every(row => row.key === 'spEpics')), 'only spEpics is updated');
});

test('removing the last team member persists an empty member library', async () => {
  const database = createDatabase();
  database.tables.settings.push({ key: 'spTeamMembers', value: [{ name: 'Old member' }] });
  setSupabaseClient(database);
  await saveCoreSnapshot({ ...fixture(), spTeamMembers: [] });
  assert.deepEqual(database.tables.settings.find(row => row.key === 'spTeamMembers').value, []);
});

test('metadata persists in order without waiting for a slow unrelated table', async () => {
  const database = createDatabase();
  let release;
  database.gates.set('projects:upsert', new Promise(resolve => { release = resolve; }));
  setSupabaseClient(database);
  const first = fixture();
  const second = { ...fixture(), spEpics: [{ id: 'latest', title: 'Latest epic' }], spNotes: [{ ...first.spNotes[0], id: 'latest-note', title: 'Latest title', text: 'Latest text' }], velocityReportSprints: [{ id: 'latest-report', rpDev: 21 }] };
  const saves = [saveCoreSnapshot(first), saveCoreSnapshot(second)];
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(database.tables.settings.find(row => row.key === 'spEpics').value, second.spEpics);
    assert.deepEqual(database.tables.settings.find(row => row.key === 'spNotes').value, second.spNotes);
    assert.deepEqual(database.tables.settings.find(row => row.key === 'velocityReportSprints').value, second.velocityReportSprints);
  } finally {
    release();
    await Promise.all(saves);
  }
});

test('every failed write rejects and a subsequent retry succeeds', async () => {
  for (const table of Object.keys(columns)) {
    const database = createDatabase();
    database.failures.set(`${table}:upsert`, new Error(`Write failed: ${table}`));
    setSupabaseClient(database);
    await assert.rejects(saveCoreSnapshot(fixture()), undefined, table);
    database.failures.clear();
    await saveCoreSnapshot(fixture());
  }
});

test('two stale windows editing different components preserve both changes', async () => {
  const database = createDatabase();
  setSupabaseClient(database);
  const baseline = fixture();
  await saveCoreSnapshot(baseline);
  const notesWindow = createDashboardPersistence(true);
  const velocityWindow = createDashboardPersistence(true);
  notesWindow.setSnapshot(baseline);
  velocityWindow.setSnapshot(baseline);
  const notesEdit = structuredClone(baseline);
  notesEdit.spNotes[0].text = 'Updated in notes window';
  await notesWindow.schedule(notesEdit);
  const velocityEdit = structuredClone(baseline);
  velocityEdit.velocityReportSprints[0].completedSP = 55;
  await velocityWindow.schedule(velocityEdit);
  await notesWindow.flush();
  await velocityWindow.flush();
  const reloaded = await loadAllData();
  assert.equal(reloaded.spNotes[0].text, 'Updated in notes window');
  assert.equal(reloaded.velocityReportSprints[0].completedSP, 55);
});

test('persistence retries failed components along with a subsequent edit', async () => {
  const database = createDatabase();
  setSupabaseClient(database);
  const baseline = fixture();
  const persistence = createDashboardPersistence(true);
  persistence.setSnapshot(baseline);
  const changed = structuredClone(baseline);
  changed.spEpics.push({ id: 'retry-epic', title: 'Retry epic' });
  database.failures.set('settings:upsert', new Error('Offline'));
  await assert.rejects(persistence.schedule(changed));
  database.failures.clear();
  changed.spNotes[0].text = 'Also updated';
  await persistence.schedule(changed);
  assert.deepEqual(database.tables.settings.find(row => row.key === 'spEpics').value, changed.spEpics);
  assert.equal(database.tables.settings.find(row => row.key === 'spNotes').value[0].text, 'Also updated');
});

test('rapid edits persist the latest snapshot for every changed component', async () => {
  const database = createDatabase();
  setSupabaseClient(database);
  const baseline = fixture();
  const persistence = createDashboardPersistence(true);
  persistence.setSnapshot(baseline);
  const first = structuredClone(baseline);
  first.spNotes[0].text = 'First edit';
  const second = structuredClone(first);
  second.spNotes[0].text = 'Latest edit';
  const third = structuredClone(second);
  third.velocityReportSprints[0].completedSP = 89;
  await Promise.all([persistence.schedule(first), persistence.schedule(second), persistence.schedule(third)]);
  assert.equal(database.tables.settings.find(row => row.key === 'spNotes').value[0].text, 'Latest edit');
  assert.equal(database.tables.settings.find(row => row.key === 'velocityReportSprints').value[0].completedSP, 89);
});

test('a core-only write does not reset an in-flight metadata queue', async () => {
  const database = createDatabase();
  let release;
  database.gates.set('settings:upsert', new Promise(resolve => { release = resolve; }));
  setSupabaseClient(database);
  const first = fixture();
  const second = { ...fixture(), spEpics: [{ id: 'ordered', title: 'Ordered epic' }] };
  const saves = [saveCoreSnapshot(first, ['spEpics']), saveCoreSnapshot(first, ['projects']), saveCoreSnapshot(second, ['spEpics'])];
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(database.starts.filter(table => table === 'settings').length, 1);
  } finally {
    release();
    await Promise.all(saves);
  }
  assert.deepEqual(database.tables.settings.find(row => row.key === 'spEpics').value, second.spEpics);
});

test('invalid metadata never becomes a writable empty collection', async () => {
  for (const key of ['spNotes', 'spEpics', 'spQuickLinks', 'velocityReportSprints', 'spDataCanonical', 'spTeamMembers', 'spSprintNotesBoard', 'deMeetings', 'spCollapsedByKey']) {
    const database = createDatabase();
    database.tables.settings.push({ key, value: key === 'spCollapsedByKey' ? [] : 'invalid payload' });
    setSupabaseClient(database);
    assert.equal(await loadAllData(), null, key);
    assert.equal(database.writes.length, 0);
  }
});

test('failed upserts do not delete existing rows', async () => {
  const database = createDatabase();
  database.tables.projects.push({ id: 'existing-project', name: 'Existing project' });
  database.failures.set('projects:upsert', new Error('Permission denied'));
  setSupabaseClient(database);
  await assert.rejects(saveCoreSnapshot(fixture(), ['projects']));
  assert.deepEqual(database.tables.projects, [{ id: 'existing-project', name: 'Existing project' }]);
  assert.ok(database.writes.every(write => !write.deleted));
});

test('a successful concurrent component does not hide another failed component', async () => {
  const database = createDatabase();
  let release;
  database.gates.set('settings:upsert', new Promise(resolve => { release = resolve; }));
  database.failures.set('projects:upsert', new Error('Project save failed'));
  setSupabaseClient(database);
  const baseline = fixture();
  const persistence = createDashboardPersistence(true);
  persistence.setSnapshot(baseline);
  const first = structuredClone(baseline);
  first.projects[0].name = 'Updated project';
  const second = structuredClone(first);
  second.spNotes[0].text = 'Updated note';
  const projectWrite = persistence.schedule(first);
  const noteWrite = persistence.schedule(second);
  await assert.rejects(projectWrite);
  release();
  await noteWrite;
  assert.equal(persistence.hasFailedWrites(), true);
  database.failures.clear();
  await persistence.flush();
  assert.equal(persistence.hasFailedWrites(), false);
  assert.equal(database.tables.projects[0].name, 'Updated project');
});

test('legacy manual quick links become shared without importing ticket URLs', async () => {
  const database = createDatabase();
  const sprints = [
    { id: 'first', name: 'First', quickLinks: [{ id: 'link', label: 'Common', url: 'https://example.com/common' }], tickets: [{ id: 'ticket', jiraUrl: 'https://example.com/not-a-quick-link' }] },
    { id: 'second', name: 'Second', quickLinks: [{ id: 'duplicate', label: 'Duplicate', url: 'https://example.com/common' }], quickLinkOverrides: { 'https://example.com/original': { label: 'Edited', url: 'https://example.com/edited' }, 'https://example.com/removed': { removed: true } } },
  ];
  database.tables.settings.push({ key: 'spDataCanonical', value: sprints });
  setSupabaseClient(database);
  const snapshot = await loadAllData();
  assert.deepEqual(snapshot.spQuickLinks.map(link => link.url), ['https://example.com/common', 'https://example.com/edited']);
  assert.equal(database.writes.length, 0);
  assert.deepEqual(mergeSnapshot(createDefaultSnapshot(), { spData: sprints }).spQuickLinks, snapshot.spQuickLinks);
  const firstView = renderSprintsSection(snapshot, { selectedSprintIndex: 0 });
  const secondView = renderSprintsSection(snapshot, { selectedSprintIndex: 1 });
  assert.ok(firstView.includes('https://example.com/edited'));
  assert.ok(secondView.includes('https://example.com/edited'));
});

test('editing and removing shared quick links only writes their global setting', async () => {
  const database = createDatabase();
  setSupabaseClient(database);
  const snapshot = fixture();
  await saveCoreSnapshot(snapshot);
  const persistence = createDashboardPersistence(true);
  persistence.setSnapshot(snapshot);
  database.writes.length = 0;
  const edited = structuredClone(snapshot);
  edited.spQuickLinks[0].label = 'Edited shared dashboard';
  await persistence.schedule(edited);
  assert.equal((await loadAllData()).spQuickLinks[0].label, 'Edited shared dashboard');
  assert.ok(database.writes.every(write => write.table === 'settings' && write.payload.every(row => row.key === 'spQuickLinks')));
  edited.spQuickLinks = [];
  await persistence.schedule(edited);
  assert.deepEqual((await loadAllData()).spQuickLinks, []);
  assert.deepEqual((await loadAllData()).spData, snapshot.spData);
  assert.ok(!renderSprintsSection({ ...edited, spData: [] }, {}).includes('Shared dashboard'));
});

test('migrated shared links survive deletion of their source sprint', async () => {
  const database = createDatabase();
  database.tables.settings.push({ key: 'spDataCanonical', value: [{ id: 'old-sprint', name: 'Old sprint', quickLinks: [{ id: 'old-link', label: 'Keep this link', url: 'https://example.com/keep' }] }] });
  setSupabaseClient(database);
  const snapshot = await loadAllData();
  const persistence = createDashboardPersistence(true);
  persistence.setSnapshot(snapshot);
  snapshot.spData = [];
  await persistence.schedule(snapshot);
  assert.equal((await loadAllData()).spQuickLinks[0].url, 'https://example.com/keep');
  const edited = await loadAllData();
  edited.spQuickLinks = [];
  await persistence.schedule(edited);
  edited.spData = [{ id: 'new-sprint', name: 'New sprint', quickLinks: [{ id: 'legacy-link', label: 'Do not resurrect', url: 'https://example.com/legacy' }] }];
  await persistence.schedule(edited);
  assert.deepEqual((await loadAllData()).spQuickLinks, []);
});

test('history rename and ticket duplication persist in both canonical and structured sprint data', async () => {
  const database = createDatabase();
  setSupabaseClient(database);
  await loadAllData();
  const baseline = fixture();
  baseline.spData.push({ id: 'destination', name: 'Destination', tickets: [], columnAssignees: [] });
  await saveCoreSnapshot(baseline);
  const persistence = createDashboardPersistence(true);
  persistence.setSnapshot(baseline);
  const changed = structuredClone(baseline);
  changed.spData[0].name = 'Renamed sprint';
  const original = structuredClone(changed.spData[0].tickets[0]);
  const copied = duplicateSprintTicket(changed, 'sprint', original.id, 'destination');
  assert.notEqual(copied.id, original.id);
  assert.deepEqual({ ...copied, id: original.id, createdAt: original.createdAt }, { ...original, createdAt: original.createdAt });
  assert.deepEqual(changed.spData[0].tickets[0], original);
  assert.ok(changed.spData[1].columnAssignees.includes(original.assignee));
  await persistence.schedule(changed);
  const reloaded = await loadAllData();
  assert.equal(reloaded.spData[0].name, 'Renamed sprint');
  assert.deepEqual(reloaded.spData[1].tickets[0], copied);
  assert.equal(database.tables.sprints.find(sprint => sprint.id === 'sprint').name, 'Renamed sprint');
  assert.equal(database.tables.sprint_tickets.find(ticket => ticket.id === copied.id).sprint_id, 'destination');
  assert.throws(() => duplicateSprintTicket(changed, 'sprint', original.id, 'missing'));
  assert.throws(() => duplicateSprintTicket(changed, 'sprint', 'missing', 'destination'));
});