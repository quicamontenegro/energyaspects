import { renderDataExplorerSection } from '../sections/dataExplorerSection.js';
import { renderInvoicingSection } from '../sections/invoicingSection.js';
import { renderMilestonesSection } from '../sections/milestonesSection.js';
import { renderSprintsSection, renderGlobalTicketEditModal, getSprintMembers } from '../sections/sprintsSection.js';
import { renderVelocitySection } from '../sections/velocitySection.js';
import { cloneState, createDefaultSnapshot } from '../state/defaults.js';
import { createStore } from '../state/store.js';
import { normalizeProjectMember } from '../utils/dashboard.js';
import { createId, slugify } from '../utils/format.js';

const TAB_ORDER = ['invoicing', 'velocity', 'data-explorer', 'milestones', 'sprints'];

export function createDashboardApp(root, initialSnapshot, persistence) {
  const store = createStore(initialSnapshot || createDefaultSnapshot());
  const uiState = {
    tab: resolveTabFromHash(),
    velocityGroup: 'rp',
    deWeekFilter: 'all',
    milestoneTeam: 'rp',
    milestoneStatus: 'all',
    editingTicket: null,
    editingSprintIndex: null,
  };

  function persist(snapshot) {
    persistence.setSnapshot(snapshot);
    return persistence.schedule(snapshot);
  }

  function render() {
    const state = store.getState();
    let modal = '';
    
    if (uiState.editingTicket) {
      const { sprintIndex, ticketIndex } = uiState.editingTicket;
      const ticket = state.spData[sprintIndex]?.tickets[ticketIndex];
      if (ticket) {
        const members = getSprintMembers(state.spTeamMembers);
        modal = renderGlobalTicketEditModal(sprintIndex, ticketIndex, ticket, members);
      }
    }
    
    root.innerHTML = `
      <main class="app-shell">
        <header class="app-header">
          <span class="app-logo">Energy<strong>Aspects</strong></span>
          <nav class="app-tabs">
            ${TAB_ORDER.map((tab) => `<button class="app-tabs__button ${uiState.tab === tab ? 'is-active' : ''}" type="button" data-action="switch-tab" data-tab="${tab}">${getTabLabel(tab)}</button>`).join('')}
          </nav>
          <div class="sync-indicator ${persistence.canSync ? 'is-live' : 'is-local'}">${persistence.canSync ? '● Supabase' : '○ Local'}</div>
        </header>
        <section class="app-content">
          ${renderCurrentTab(state, uiState)}
        </section>
      </main>
      ${modal}
    `;
  }

  function updateState(mutator, options = {}) {
    const waitForSync = options.waitForSync === true && persistence.canSync;

    if (!waitForSync) {
      store.update(mutator);
      persist(store.getState()).catch((error) => {
        console.error('Dashboard sync failed.', error);
      });
      return Promise.resolve();
    }

    const nextState = cloneState(store.getState());
    mutator(nextState);
    persistence.setSnapshot(nextState);
    return persistence.schedule(nextState)
      .then(() => {
        store.replace(nextState);
      })
      .catch((error) => {
        console.error('Dashboard sync failed.', error);
      });
  }

  root.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) {
      return;
    }

    const action = trigger.dataset.action;

    // Require confirmation for destructive actions
    if (action.includes('remove')) {
      const message = getRemovalConfirmMessage(action, trigger);
      if (!window.confirm(message)) {
        return;
      }
    }

    if (action === 'switch-tab') {
      uiState.tab = trigger.dataset.tab;
      window.location.hash = uiState.tab;
      render();
      return;
    }

    if (action === 'switch-velocity-group') {
      uiState.velocityGroup = trigger.dataset.group || 'rp';
      render();
      return;
    }

    if (action === 'switch-milestone-team') {
      uiState.milestoneTeam = trigger.dataset.team || 'rp';
      render();
      return;
    }

    handleClickAction(trigger, updateState, root, uiState, render);
  });

  root.addEventListener('change', (event) => {
    const field = event.target.closest('[data-action]');
    if (!field) {
      return;
    }

    handleChangeAction(field, updateState, uiState, render);
  });

  root.addEventListener('input', (event) => {
    const field = event.target.closest('[data-action]');
    if (!field) {
      return;
    }

    // Handle input events for textarea and text fields
    const action = field.dataset.action;
    if (action === 'update-sprint-ticket-notes') {
      handleChangeAction(field, updateState, uiState, render);
    }
  });

  window.addEventListener('hashchange', () => {
    uiState.tab = resolveTabFromHash();
    render();
  });

  window.addEventListener('pagehide', () => {
    persistence.flush().catch((error) => {
      console.error('Final sync failed.', error);
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      persistence.flush().catch((error) => {
        console.error('Visibility sync failed.', error);
      });
    }
  });

  store.subscribe(() => render());
  render();
}

function renderCurrentTab(state, uiState) {
  switch (uiState.tab) {
    case 'velocity':
      return renderVelocitySection(state, uiState);
    case 'data-explorer':
      return renderDataExplorerSection(state, uiState);
    case 'milestones':
      return renderMilestonesSection(state, uiState);
    case 'sprints':
      return renderSprintsSection(state, uiState);
    case 'invoicing':
    default:
      return renderInvoicingSection(state, uiState);
  }
}

function resolveTabFromHash() {
  const hash = window.location.hash.replace('#', '').trim();
  return TAB_ORDER.includes(hash) ? hash : 'invoicing';
}

function getTabLabel(tab) {
  const labels = {
    invoicing: 'Invoicing',
    velocity: 'Velocity',
    'data-explorer': 'Data Explorer',
    milestones: 'Milestones',
    sprints: 'Sprints',
  };
  return labels[tab] || tab;
}

function getRemovalConfirmMessage(action, trigger) {
  const messages = {
    'remove-project': 'Remove this project and all its members?',
    'remove-project-member': 'Remove this member from the project?',
    'remove-team': 'Remove this team and all its sprints?',
    'remove-team-member': 'Remove this member from the team?',
    'remove-task': 'Delete this task?',
    'remove-milestone': 'Remove this milestone and all its tasks?',
    'remove-milestone-task': 'Remove this task from the milestone?',
    'remove-sprint-member': 'Remove this member from the team?',
    'remove-rpde-ticket': 'Remove this queue item?',
    'remove-sprint-plan': 'Remove this sprint and all its tickets?',
    'remove-sprint-ticket': 'Remove this ticket from the sprint?',
  };
  return messages[action] || `Remove this item?\n\nThis action cannot be undone.`;
}

function readForm(root, selector) {
  const form = root.querySelector(selector);
  if (!form) {
    return null;
  }

  if (form instanceof HTMLFormElement) {
    return new FormData(form);
  }

  // Fallback for div containers with data-form attribute
  const data = new Map();
  form.querySelectorAll('[name]').forEach((el) => {
    data.set(el.name, el.value);
  });
  return { get: (key) => data.get(key) ?? null };
}

function resetForm(root, selector) {
  const form = root.querySelector(selector);
  if (form instanceof HTMLFormElement) {
    form.reset();
    return;
  }
  // Fallback: clear input values inside div containers
  if (form) {
    form.querySelectorAll('input, textarea, select').forEach((el) => {
      if (el.tagName === 'SELECT') {
        el.selectedIndex = 0;
      } else {
        el.value = '';
      }
    });
  }
}

function handleClickAction(trigger, updateState, root, uiState, render) {
  const projectIndex = Number(trigger.dataset.projectIndex);
  const memberIndex = Number(trigger.dataset.memberIndex);
  const teamIndex = Number(trigger.dataset.teamIndex);
  const sprintIndex = Number(trigger.dataset.sprintIndex);
  const taskIndex = Number(trigger.dataset.taskIndex);
  const milestoneIndex = Number(trigger.dataset.milestoneIndex);
  const ticketIndex = Number(trigger.dataset.ticketIndex);

  if (trigger.dataset.action === 'add-project') {
    const form = readForm(root, '[data-form="project-create"]');
    const name = String(form?.get('name') || '').trim();
    if (!name) return;
    const tag = String(form?.get('tag') || '').trim();
    const color = String(form?.get('color') || '#0f766e');
    updateState((state) => {
      state.projects.push({ id: createId(`project-${slugify(name)}`), name, tag, color, members: [] });
    });
    resetForm(root, '[data-form="project-create"]');
    return;
  }

  if (trigger.dataset.action === 'remove-project' && Number.isInteger(projectIndex)) {
    updateState((state) => {
      state.projects.splice(projectIndex, 1);
    });
    return;
  }

  if (trigger.dataset.action === 'add-project-member' && Number.isInteger(projectIndex)) {
    const form = readForm(root, `[data-form="member-create"][data-project-index="${projectIndex}"]`);
    const name = String(form?.get('name') || '').trim();
    if (!name) return;
    updateState((state) => {
      const monthlyHours = Number(state.settings.monthlyHours) || 176;
      state.projects[projectIndex].members.push({ name, pto: 0, feriados: 0, hoursOff: 0, tl: monthlyHours });
    });
    resetForm(root, `[data-form="member-create"][data-project-index="${projectIndex}"]`);
    return;
  }

  if (trigger.dataset.action === 'remove-project-member' && Number.isInteger(projectIndex) && Number.isInteger(memberIndex)) {
    updateState((state) => {
      state.projects[projectIndex].members.splice(memberIndex, 1);
    });
    return;
  }

  if (trigger.dataset.action === 'add-team') {
    const form = readForm(root, '[data-form="team-create"]');
    const name = String(form?.get('name') || '').trim();
    if (!name) return;
    const color = String(form?.get('color') || '#4338ca');
    updateState((state) => {
      state.teams.push({
        id: createId(`team-${slugify(name)}`),
        name,
        color,
        group: trigger.dataset.group || 'rp',
        sprints: ['Sprint 1', 'Sprint 2', 'Sprint 3'],
        sprintCompleted: [true, true, false],
        members: [],
      });
    });
    resetForm(root, '[data-form="team-create"]');
    return;
  }

  if (trigger.dataset.action === 'remove-team' && Number.isInteger(teamIndex)) {
    updateState((state) => {
      state.teams.splice(teamIndex, 1);
    });
    return;
  }

  if (trigger.dataset.action === 'add-team-member' && Number.isInteger(teamIndex)) {
    const form = readForm(root, `[data-form="velocity-member-create"][data-team-index="${teamIndex}"]`);
    const name = String(form?.get('name') || '').trim();
    if (!name) return;
    updateState((state) => {
      const sprintCount = state.teams[teamIndex].sprints.length;
      state.teams[teamIndex].members.push({ name, sp: Array.from({ length: sprintCount }, () => 0) });
    });
    resetForm(root, `[data-form="velocity-member-create"][data-team-index="${teamIndex}"]`);
    return;
  }

  if (trigger.dataset.action === 'remove-team-member' && Number.isInteger(teamIndex) && Number.isInteger(memberIndex)) {
    updateState((state) => {
      state.teams[teamIndex].members.splice(memberIndex, 1);
    });
    return;
  }

  if (trigger.dataset.action === 'add-sprint' && Number.isInteger(teamIndex)) {
    updateState((state) => {
      const team = state.teams[teamIndex];
      team.sprints.push(`Sprint ${team.sprints.length + 1}`);
      team.sprintCompleted.push(false);
      team.members.forEach((member) => member.sp.push(0));
    });
    return;
  }

  if (trigger.dataset.action === 'remove-sprint' && Number.isInteger(teamIndex)) {
    updateState((state) => {
      const team = state.teams[teamIndex];
      if (team.sprints.length <= 1) return;
      team.sprints.pop();
      team.sprintCompleted.pop();
      team.members.forEach((member) => member.sp.pop());
    });
    return;
  }

  if (trigger.dataset.action === 'add-meeting') {
    const form = readForm(root, '[data-form="meeting-create"]');
    const week = String(form?.get('week') || '').trim();
    const name = String(form?.get('name') || '').trim();
    if (!week || !name) return;
    const notes = String(form?.get('notes') || '').trim();
    updateState((state) => {
      state.deMeetings.push({ id: createId('meeting'), week, name, notes, createdAt: new Date().toISOString() });
    });
    resetForm(root, '[data-form="meeting-create"]');
    return;
  }

  if (trigger.dataset.action === 'add-task') {
    const form = readForm(root, '[data-form="task-create"]');
    const name = String(form?.get('name') || '').trim();
    if (!name) return;
    updateState((state) => {
      state.deTasks.push({
        id: createId('de-task'),
        name,
        week: String(form?.get('week') || '').trim() || 'Backlog',
        assignee: String(form?.get('assignee') || '').trim(),
        status: String(form?.get('status') || 'inprogress'),
        priority: String(form?.get('priority') || 'Média'),
        dueDate: String(form?.get('dueDate') || ''),
        notes: String(form?.get('notes') || '').trim(),
        createdAt: new Date().toISOString(),
      });
    });
    resetForm(root, '[data-form="task-create"]');
    return;
  }

  if (trigger.dataset.action === 'remove-task') {
    const taskId = trigger.dataset.taskId;
    updateState((state) => {
      state.deTasks = state.deTasks.filter((task) => task.id !== taskId);
    });
    return;
  }

  if (trigger.dataset.action === 'add-milestone') {
    const form = readForm(root, '[data-form="milestone-create"]');
    const name = String(form?.get('name') || '').trim();
    if (!name) return;
    updateState((state) => {
      state.msData.push({
        id: createId('milestone'),
        team: trigger.dataset.team || 'rp',
        name,
        status: String(form?.get('status') || 'inprogress'),
        assignee: String(form?.get('assignee') || '').trim(),
        url: String(form?.get('url') || '').trim(),
        notes: String(form?.get('notes') || '').trim(),
        tasks: [],
      });
    });
    resetForm(root, '[data-form="milestone-create"]');
    return;
  }

  if (trigger.dataset.action === 'remove-milestone' && Number.isInteger(milestoneIndex)) {
    updateState((state) => {
      state.msData.splice(milestoneIndex, 1);
    });
    return;
  }

  if (trigger.dataset.action === 'add-milestone-task' && Number.isInteger(milestoneIndex)) {
    const form = readForm(root, `[data-form="milestone-task-create"][data-milestone-index="${milestoneIndex}"]`);
    const name = String(form?.get('name') || '').trim();
    if (!name) return;
    updateState((state) => {
      state.msData[milestoneIndex].tasks.push({ id: createId('milestone-task'), name, status: String(form?.get('status') || 'notstarted'), notes: '' });
    });
    resetForm(root, `[data-form="milestone-task-create"][data-milestone-index="${milestoneIndex}"]`);
    return;
  }

  if (trigger.dataset.action === 'remove-milestone-task' && Number.isInteger(milestoneIndex) && Number.isInteger(taskIndex)) {
    updateState((state) => {
      state.msData[milestoneIndex].tasks.splice(taskIndex, 1);
    });
    return;
  }

  if (trigger.dataset.action === 'add-sprint-member') {
    const form = readForm(root, '[data-form="sprint-member-create"]');
    const name = String(form?.get('name') || '').trim();
    if (!name) return;
    const role = String(form?.get('role') || '').trim();
    updateState((state) => {
      const members = normalizeSprintMembers(state.spTeamMembers);
      members.push({ name, role });
      state.spTeamMembers = members;
    });
    resetForm(root, '[data-form="sprint-member-create"]');
    return;
  }

  if (trigger.dataset.action === 'remove-sprint-member') {
    updateState((state) => {
      const members = normalizeSprintMembers(state.spTeamMembers);
      members.splice(memberIndex, 1);
      state.spTeamMembers = members;
    });
    return;
  }

  if (trigger.dataset.action === 'add-rpde-ticket') {
    const team = trigger.dataset.team || 'rp';
    const form = readForm(root, '[data-form="rpde-ticket-create"]');
    const title = String(form?.get('title') || '').trim();
    if (!title) return;
    updateState((state) => {
      state.rpdeTickets.push({
        id: createId('rpde-ticket'),
        team,
        title,
        jiraId: String(form?.get('jiraId') || '').trim(),
        jiraUrl: String(form?.get('jiraUrl') || '').trim(),
        assignee: String(form?.get('assignee') || '').trim(),
        status: String(form?.get('status') || 'todo'),
        priority: String(form?.get('priority') || 'Média'),
        notes: String(form?.get('notes') || '').trim(),
        createdAt: new Date().toISOString(),
      });
    });
    resetForm(root, '[data-form="rpde-ticket-create"]');
    return;
  }

  if (trigger.dataset.action === 'remove-rpde-ticket' && Number.isInteger(ticketIndex)) {
    updateState((state) => {
      state.rpdeTickets.splice(ticketIndex, 1);
    });
    return;
  }

  if (trigger.dataset.action === 'add-sprint-plan') {
    const form = readForm(root, '[data-form="sprint-create"]');
    const name = String(form?.get('name') || '').trim();
    const startDate = String(form?.get('startDate') || '').trim();
    const endDate = String(form?.get('endDate') || '').trim();
    if (!name || !startDate || !endDate) return;
    const [normalizedStartDate, normalizedEndDate] = startDate <= endDate
      ? [startDate, endDate]
      : [endDate, startDate];
    updateState((state) => {
      state.spData.push({
        id: createId('sprint'),
        name,
        startDate: normalizedStartDate,
        endDate: normalizedEndDate,
        createdAt: new Date().toISOString(),
        tickets: [],
      });
    });
    resetForm(root, '[data-form="sprint-create"]');
    return;
  }

  if (trigger.dataset.action === 'remove-sprint-plan' && Number.isInteger(sprintIndex)) {
    updateState((state) => {
      state.spData.splice(sprintIndex, 1);
    });
    if (uiState.editingSprintIndex === sprintIndex) {
      uiState.editingSprintIndex = null;
    }
    render();
    return;
  }

  if (trigger.dataset.action === 'edit-sprint-plan' && Number.isInteger(sprintIndex)) {
    uiState.editingSprintIndex = sprintIndex;
    render();
    return;
  }

  if (trigger.dataset.action === 'cancel-edit-sprint-plan' && Number.isInteger(sprintIndex)) {
    uiState.editingSprintIndex = null;
    render();
    return;
  }

  if (trigger.dataset.action === 'save-edit-sprint-plan' && Number.isInteger(sprintIndex)) {
    const form = readForm(root, `[data-form="sprint-edit"][data-sprint-index="${sprintIndex}"]`);
    const name = String(form?.get('name') || '').trim();
    const startDate = String(form?.get('startDate') || '').trim();
    const endDate = String(form?.get('endDate') || '').trim();
    if (!name || !startDate || !endDate) return;
    const [normalizedStartDate, normalizedEndDate] = startDate <= endDate
      ? [startDate, endDate]
      : [endDate, startDate];

    updateState((state) => {
      const sprint = state.spData[sprintIndex];
      if (!sprint) return;
      sprint.name = name;
      sprint.startDate = normalizedStartDate;
      sprint.endDate = normalizedEndDate;
    });

    uiState.editingSprintIndex = null;
    render();
    return;
  }

  if (trigger.dataset.action === 'add-sprint-ticket' && Number.isInteger(sprintIndex)) {
    const form = readForm(root, `[data-form="sprint-ticket-create"][data-sprint-index="${sprintIndex}"]`);
    const title = String(form?.get('title') || '').trim();
    const status = String(form?.get('status') || 'todo').trim() || 'todo';
    const notes = String(form?.get('notes') || '').trim();
    if (!title) return;
    updateState((state) => {
      state.spData[sprintIndex].tickets.push({
        id: createId('sprint-ticket'),
        title,
        jiraId: String(form?.get('jiraId') || '').trim(),
        jiraUrl: String(form?.get('jiraUrl') || '').trim(),
        desc: notes,
        notes,
        assignee: '',
        status,
      });
    });
    resetForm(root, `[data-form="sprint-ticket-create"][data-sprint-index="${sprintIndex}"]`);
    return;
  }

  if (trigger.dataset.action === 'remove-sprint-ticket' && Number.isInteger(sprintIndex) && Number.isInteger(ticketIndex)) {
    updateState((state) => {
      state.spData[sprintIndex].tickets.splice(ticketIndex, 1);
    }, { waitForSync: true });
  }

  if (trigger.dataset.action === 'edit-sprint-ticket' && Number.isInteger(sprintIndex) && Number.isInteger(ticketIndex)) {
    uiState.editingTicket = { sprintIndex, ticketIndex };
    render();
  }

  if (trigger.dataset.action === 'cancel-edit-sprint-ticket' && Number.isInteger(sprintIndex) && Number.isInteger(ticketIndex)) {
    uiState.editingTicket = null;
    render();
  }

  if (trigger.dataset.action === 'save-edit-sprint-ticket' && Number.isInteger(sprintIndex) && Number.isInteger(ticketIndex)) {
    const modal = root.querySelector(`[data-form="sprint-ticket-edit-modal"][data-sprint-index="${sprintIndex}"][data-ticket-index="${ticketIndex}"]`);
    if (!modal) return;
    const form = modal.querySelector('.ticket-edit-form');
    const formData = new FormData(form);
    updateState((state) => {
      const ticket = state.spData[sprintIndex].tickets[ticketIndex];
      ticket.title = String(formData.get('title') || '').trim();
      ticket.assignee = String(formData.get('assignee') || '').trim();
      ticket.status = String(formData.get('status') || 'todo').trim();
      ticket.jiraId = String(formData.get('jiraId') || '').trim();
      ticket.jiraUrl = String(formData.get('jiraUrl') || '').trim();
      const notes = String(formData.get('notes') || '').trim();
      ticket.notes = notes;
      ticket.desc = notes;
    });
    uiState.editingTicket = null;
    render();
  }
}

function handleChangeAction(field, updateState, uiState, render) {
  const action = field.dataset.action;
  const projectIndex = Number(field.dataset.projectIndex);
  const memberIndex = Number(field.dataset.memberIndex);
  const teamIndex = Number(field.dataset.teamIndex);
  const sprintIndex = Number(field.dataset.sprintIndex);
  const taskIndex = Number(field.dataset.taskIndex);
  const milestoneIndex = Number(field.dataset.milestoneIndex);
  const ticketIndex = Number(field.dataset.ticketIndex);

  if (action === 'update-setting') {
    const value = Math.max(1, Number(field.value) || 1);
    updateState((state) => {
      state.settings[field.dataset.field] = value;
      state.projects = state.projects.map((project) => ({
        ...project,
        members: (project.members || []).map((member) => normalizeProjectMember(member, state.settings.monthlyHours)),
      }));
    });
    return;
  }

  if (action === 'update-working-days') {
    const days = Math.max(1, Number(field.value) || 1);
    updateState((state) => {
      state.settings.monthlyHours = days * (Number(state.settings.hoursPerDay) || 8);
      state.projects = state.projects.map((project) => ({
        ...project,
        members: (project.members || []).map((member) => normalizeProjectMember(member, state.settings.monthlyHours)),
      }));
    });
    return;
  }

  if (action === 'update-project-member-text' && Number.isInteger(projectIndex) && Number.isInteger(memberIndex)) {
    updateState((state) => {
      state.projects[projectIndex].members[memberIndex][field.dataset.field] = String(field.value || '');
    });
    return;
  }

  if (action === 'update-project-member-number' && Number.isInteger(projectIndex) && Number.isInteger(memberIndex)) {
    updateState((state) => {
      const member = state.projects[projectIndex].members[memberIndex];
      member[field.dataset.field] = Number(field.value) || 0;
      member.tl = Math.max(0, (Number(state.settings.monthlyHours) || 176) - (Number(member.hoursOff) || 0));
    });
    return;
  }

  if (action === 'rename-sprint' && Number.isInteger(teamIndex) && Number.isInteger(sprintIndex)) {
    updateState((state) => {
      state.teams[teamIndex].sprints[sprintIndex] = String(field.value || '').trim() || `Sprint ${sprintIndex + 1}`;
    });
    return;
  }

  if (action === 'rename-team-member' && Number.isInteger(teamIndex) && Number.isInteger(memberIndex)) {
    updateState((state) => {
      state.teams[teamIndex].members[memberIndex].name = String(field.value || '').trim();
    });
    return;
  }

  if (action === 'update-team-points' && Number.isInteger(teamIndex) && Number.isInteger(memberIndex) && Number.isInteger(sprintIndex)) {
    updateState((state) => {
      state.teams[teamIndex].members[memberIndex].sp[sprintIndex] = Number(field.value) || 0;
      state.teams[teamIndex].sprintCompleted[sprintIndex] = (Number(field.value) || 0) > 0 || state.teams[teamIndex].sprintCompleted[sprintIndex];
    });
    return;
  }

  if (action === 'filter-de-week') {
    uiState.deWeekFilter = String(field.value || 'all');
    render();
    return;
  }

  if (action === 'update-de-status') {
    const taskId = field.dataset.taskId;
    updateState((state) => {
      const task = state.deTasks.find((item) => item.id === taskId);
      if (task) task.status = String(field.value || 'inprogress');
    });
    return;
  }

  if (action === 'update-de-notes') {
    const taskId = field.dataset.taskId;
    updateState((state) => {
      const task = state.deTasks.find((item) => item.id === taskId);
      if (task) task.notes = String(field.value || '');
    });
    return;
  }

  if (action === 'filter-milestone-status') {
    uiState.milestoneStatus = String(field.value || 'all');
    render();
    return;
  }

  if (action === 'update-milestone-task-name' && Number.isInteger(milestoneIndex) && Number.isInteger(taskIndex)) {
    updateState((state) => {
      state.msData[milestoneIndex].tasks[taskIndex].name = String(field.value || '');
    });
    return;
  }

  if (action === 'update-milestone-task-status' && Number.isInteger(milestoneIndex) && Number.isInteger(taskIndex)) {
    updateState((state) => {
      state.msData[milestoneIndex].tasks[taskIndex].status = String(field.value || 'notstarted');
    });
    return;
  }

  if (action === 'update-rpde-status' && Number.isInteger(ticketIndex)) {
    updateState((state) => {
      state.rpdeTickets[ticketIndex].status = String(field.value || 'todo');
    });
    return;
  }

  if (action === 'update-sprint-ticket-title' && Number.isInteger(sprintIndex) && Number.isInteger(ticketIndex)) {
    updateState((state) => {
      state.spData[sprintIndex].tickets[ticketIndex].title = String(field.value || '');
    });
    return;
  }

  if (action === 'update-sprint-ticket-assignee' && Number.isInteger(sprintIndex) && Number.isInteger(ticketIndex)) {
    updateState((state) => {
      state.spData[sprintIndex].tickets[ticketIndex].assignee = String(field.value || '');
    });
    return;
  }

  if (action === 'update-sprint-ticket-status' && Number.isInteger(sprintIndex) && Number.isInteger(ticketIndex)) {
    updateState((state) => {
      state.spData[sprintIndex].tickets[ticketIndex].status = String(field.value || 'todo');
    });
    return;
  }

  if (action === 'update-sprint-ticket-notes' && Number.isInteger(sprintIndex) && Number.isInteger(ticketIndex)) {
    updateState((state) => {
      const notes = String(field.value || '');
      state.spData[sprintIndex].tickets[ticketIndex].notes = notes;
      state.spData[sprintIndex].tickets[ticketIndex].desc = notes;
    });
  }
}

function normalizeSprintMembers(rawMembers) {
  if (Array.isArray(rawMembers)) {
    return [...rawMembers];
  }

  if (!rawMembers || typeof rawMembers !== 'object') {
    return [];
  }

  const seen = new Set();
  return [...(rawMembers.rp || []), ...(rawMembers.de || [])].filter((member) => {
    const key = String(member?.name || '').trim().toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}