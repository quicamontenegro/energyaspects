import { renderDataExplorerSection, renderDataExplorerTaskEditModal } from '../sections/dataExplorerSection.js';
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
  // Keep persistence aligned with the loaded snapshot to avoid flushing defaults on refresh.
  persistence.setSnapshot(store.getState());
  const uiState = {
    tab: resolveTabFromHash(),
    velocityGroup: 'rp',
    deWeekFilter: 'all',
    editingMeetingId: null,
    editingDeTaskId: null,
    milestoneTeam: 'rp',
    milestoneStatus: 'all',
    editingTicket: null,
    editingSprintIndex: null,
    editingSprintNoteId: null,
    editingSprintBoardNoteKey: null,
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

    if (!modal && uiState.editingDeTaskId) {
      const task = (state.deTasks || []).find((item) => String(item?.id || '') === String(uiState.editingDeTaskId || ''));
      if (task) {
        const members = getSprintMembers(state.spTeamMembers);
        modal = renderDataExplorerTaskEditModal(task, members);
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
    if (event.target instanceof Element) {
      const richEditor = event.target.closest('.sprint-note-editor__input[contenteditable="true"]');
      if (richEditor) {
        const editorRoot = richEditor.closest('[data-note-editor]');
        syncSprintNoteEditorValue(editorRoot);
        return;
      }
    }

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
    'remove-sprint-note': 'Remove this sprint note?',
    'remove-sprint-board-note': 'Remove this sprint board note?',
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

  if (trigger.dataset.action === 'format-sprint-note-text') {
    const editor = trigger.closest('[data-note-editor]');
    if (!editor) return;
    const editable = editor.querySelector('.sprint-note-editor__input[contenteditable="true"]');
    const hiddenInput = editor.querySelector('input[name="text"]');
    if (!(editable instanceof HTMLElement) || !(hiddenInput instanceof HTMLInputElement)) return;
    applySprintNoteFormatting(editable, hiddenInput, String(trigger.dataset.format || '').trim());
    return;
  }

  if (trigger.dataset.action === 'select-sprint-note-color') {
    const editor = trigger.closest('[data-note-editor]');
    if (!editor) return;
    applySprintNoteTextColor(editor, String(trigger.dataset.color || '').trim());
    return;
  }

  if (trigger.dataset.action === 'toggle-sprint-collapse') {
    const sprintKey = String(trigger.dataset.sprintKey || '').trim();
    if (!sprintKey) return;
    const isCurrentlyCollapsed = String(trigger.dataset.collapsed || 'false') === 'true';
    updateState((state) => {
      if (!state.spCollapsedByKey || typeof state.spCollapsedByKey !== 'object' || Array.isArray(state.spCollapsedByKey)) {
        state.spCollapsedByKey = {};
      }
      state.spCollapsedByKey[sprintKey] = !isCurrentlyCollapsed;
    });
    return;
  }

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
    const date = String(form?.get('date') || '').trim();
    const name = String(form?.get('name') || '').trim();
    if (!date || !name) return;
    const notes = String(form?.get('notes') || '').trim();
    updateState((state) => {
      state.deMeetings.push({ id: createId('meeting'), date, name, notes, createdAt: new Date().toISOString() });
    });
    resetForm(root, '[data-form="meeting-create"]');
    return;
  }

  if (trigger.dataset.action === 'edit-meeting') {
    uiState.editingMeetingId = String(trigger.dataset.meetingId || '').trim() || null;
    render();
    return;
  }

  if (trigger.dataset.action === 'cancel-edit-meeting') {
    uiState.editingMeetingId = null;
    render();
    return;
  }

  if (trigger.dataset.action === 'save-edit-meeting') {
    const meetingId = String(trigger.dataset.meetingId || '').trim();
    if (!meetingId) return;
    const form = readForm(root, `[data-form="meeting-edit"][data-meeting-id="${meetingId}"]`);
    const date = String(form?.get('date') || '').trim();
    const name = String(form?.get('name') || '').trim();
    const notes = String(form?.get('notes') || '').trim();
    if (!date || !name) return;

    updateState((state) => {
      const meeting = state.deMeetings.find((m) => m.id === meetingId);
      if (!meeting) return;
      meeting.date = date;
      meeting.name = name;
      meeting.notes = notes;
    });

    uiState.editingMeetingId = null;
    render();
    return;
  }

  if (trigger.dataset.action === 'remove-meeting') {
    const meetingId = trigger.dataset.meetingId;
    updateState((state) => {
      const meeting = state.deMeetings.find((m) => m.id === meetingId);
      const index = state.deMeetings.findIndex((m) => m.id === meetingId);
      if (index !== -1) {
        state.deMeetings.splice(index, 1);
      }

      // Keep tasks linked to meetings and remove the ones that belonged to the deleted meeting.
      state.deTasks = state.deTasks.filter((task) => {
        const taskWeek = String(task?.week || '').trim();
        const taskMeetingId = String(task?.meetingId || '').trim();
        if (taskMeetingId === String(meetingId || '').trim()) return false;
        if (taskWeek === String(meetingId || '').trim()) return false;
        if (meeting && meeting.date && taskWeek === String(meeting.date).trim()) return false;
        if (meeting && meeting.name && taskWeek === String(meeting.name).trim()) return false;
        return true;
      });
    });
    if (uiState.editingMeetingId === String(meetingId || '')) {
      uiState.editingMeetingId = null;
      render();
    }
    return;
  }

  if (trigger.dataset.action === 'add-task') {
    const meetingId = String(trigger.dataset.meetingId || '').trim();
    if (!meetingId) return;
    const form = readForm(root, `[data-form="task-create"][data-meeting-id="${meetingId}"]`);
    const name = String(form?.get('name') || '').trim();
    if (!name) return;
    updateState((state) => {
      state.deTasks.push({
        id: createId('de-task'),
        name,
        week: null,
        meetingId,
        assignee: String(form?.get('assignee') || '').trim(),
        jiraId: String(form?.get('jiraId') || '').trim(),
        status: String(form?.get('status') || 'inprogress'),
        priority: String(form?.get('priority') || 'Medium'),
        notes: String(form?.get('notes') || '').trim(),
        createdAt: new Date().toISOString(),
      });
    });
    resetForm(root, `[data-form="task-create"][data-meeting-id="${meetingId}"]`);
    return;
  }

  if (trigger.dataset.action === 'remove-task') {
    const taskId = trigger.dataset.taskId;
    updateState((state) => {
      state.deTasks = state.deTasks.filter((task) => task.id !== taskId);
    });
    if (uiState.editingDeTaskId === String(taskId || '')) {
      uiState.editingDeTaskId = null;
      render();
    }
    return;
  }

  if (trigger.dataset.action === 'edit-de-task') {
    const taskId = String(trigger.dataset.taskId || '').trim();
    if (!taskId) return;
    uiState.editingDeTaskId = taskId;
    render();
    return;
  }

  if (trigger.dataset.action === 'cancel-edit-de-task') {
    uiState.editingDeTaskId = null;
    render();
    return;
  }

  if (trigger.dataset.action === 'save-edit-de-task') {
    const taskId = String(trigger.dataset.taskId || '').trim();
    if (!taskId) return;
    const modal = root.querySelector(`[data-form="de-task-edit-modal"][data-task-id="${taskId}"]`);
    if (!modal) return;
    const formElement = modal.querySelector('.ticket-edit-form');
    const formData = formElement ? new FormData(formElement) : null;
    const form = formData || readForm(root, `[data-form="de-task-edit-modal"][data-task-id="${taskId}"] .ticket-edit-form`);
    const name = String(form?.get('name') || '').trim();
    if (!name) return;
    updateState((state) => {
      const task = state.deTasks.find((item) => String(item?.id || '') === taskId);
      if (!task) return;
      task.name = name;
      task.assignee = String(form?.get('assignee') || '').trim();
      task.jiraId = String(form?.get('jiraId') || '').trim();
      task.status = String(form?.get('status') || 'inprogress').trim() || 'inprogress';
      task.priority = String(form?.get('priority') || 'Medium').trim() || 'Medium';
      task.notes = String(form?.get('notes') || '').trim();
    });
    uiState.editingDeTaskId = null;
    render();
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

  if (trigger.dataset.action === 'add-sprint-note') {
    syncSprintNoteEditors(root.querySelector('[data-form="sprint-note-create"]'));
    const form = readForm(root, '[data-form="sprint-note-create"]');
    const text = String(form?.get('text') || '').trim();
    if (!text) return;
    updateState((state) => {
      const notes = Array.isArray(state.spNotes) ? state.spNotes : [];
      notes.unshift({
        id: createId('sprint-note'),
        text,
        link: '',
        createdAt: new Date().toISOString(),
      });
      state.spNotes = notes;
    });
    resetForm(root, '[data-form="sprint-note-create"]');
    return;
  }

  if (trigger.dataset.action === 'edit-sprint-note') {
    uiState.editingSprintNoteId = String(trigger.dataset.noteId || '').trim() || null;
    render();
    return;
  }

  if (trigger.dataset.action === 'cancel-edit-sprint-note') {
    uiState.editingSprintNoteId = null;
    render();
    return;
  }

  if (trigger.dataset.action === 'save-edit-sprint-note') {
    const noteId = String(trigger.dataset.noteId || '').trim();
    if (!noteId) return;
    syncSprintNoteEditors(root.querySelector(`[data-form="sprint-note-edit"][data-note-id="${noteId}"]`));
    const form = readForm(root, `[data-form="sprint-note-edit"][data-note-id="${noteId}"]`);
    const text = String(form?.get('text') || '').trim();
    if (!text) return;
    updateState((state) => {
      const notes = Array.isArray(state.spNotes) ? state.spNotes : [];
      const note = notes.find((item) => String(item?.id || '') === noteId);
      if (!note) return;
      note.text = text;
      note.link = String(note.link || '').trim();
    });
    uiState.editingSprintNoteId = null;
    render();
    return;
  }

  if (trigger.dataset.action === 'remove-sprint-note') {
    const noteId = String(trigger.dataset.noteId || '').trim();
    if (!noteId) return;
    updateState((state) => {
      const notes = Array.isArray(state.spNotes) ? state.spNotes : [];
      state.spNotes = notes.filter((note) => String(note?.id || '') !== noteId);
    });
    if (uiState.editingSprintNoteId === noteId) {
      uiState.editingSprintNoteId = null;
      render();
    }
    return;
  }

  if (trigger.dataset.action === 'add-sprint-board-note' && Number.isInteger(sprintIndex)) {
    syncSprintNoteEditors(root.querySelector(`[data-form="sprint-board-note-create"][data-sprint-index="${sprintIndex}"]`));
    const form = readForm(root, `[data-form="sprint-board-note-create"][data-sprint-index="${sprintIndex}"]`);
    const text = String(form?.get('text') || '').trim();
    if (!text) return;
    updateState((state) => {
      const sprint = state.spData[sprintIndex];
      if (!sprint) return;
      if (!Array.isArray(sprint.notesBoard)) {
        sprint.notesBoard = [];
      }
      sprint.notesBoard.unshift({
        id: createId('sprint-board-note'),
        text,
        link: '',
        createdAt: new Date().toISOString(),
      });
    });
    resetForm(root, `[data-form="sprint-board-note-create"][data-sprint-index="${sprintIndex}"]`);
    return;
  }

  if (trigger.dataset.action === 'edit-sprint-board-note' && Number.isInteger(sprintIndex)) {
    const noteId = String(trigger.dataset.noteId || '').trim();
    if (!noteId) return;
    uiState.editingSprintBoardNoteKey = `${sprintIndex}:${noteId}`;
    render();
    return;
  }

  if (trigger.dataset.action === 'cancel-edit-sprint-board-note' && Number.isInteger(sprintIndex)) {
    const noteId = String(trigger.dataset.noteId || '').trim();
    if (!noteId) return;
    const key = `${sprintIndex}:${noteId}`;
    if (uiState.editingSprintBoardNoteKey === key) {
      uiState.editingSprintBoardNoteKey = null;
    }
    render();
    return;
  }

  if (trigger.dataset.action === 'save-edit-sprint-board-note' && Number.isInteger(sprintIndex)) {
    const noteId = String(trigger.dataset.noteId || '').trim();
    if (!noteId) return;
    syncSprintNoteEditors(root.querySelector(`[data-form="sprint-board-note-edit"][data-sprint-index="${sprintIndex}"][data-note-id="${noteId}"]`));
    const form = readForm(root, `[data-form="sprint-board-note-edit"][data-sprint-index="${sprintIndex}"][data-note-id="${noteId}"]`);
    const text = String(form?.get('text') || '').trim();
    if (!text) return;
    updateState((state) => {
      const sprint = state.spData[sprintIndex];
      if (!sprint || !Array.isArray(sprint.notesBoard)) return;
      const note = sprint.notesBoard.find((item) => String(item?.id || '') === noteId);
      if (!note) return;
      note.text = text;
    });
    uiState.editingSprintBoardNoteKey = null;
    render();
    return;
  }

  if (trigger.dataset.action === 'remove-sprint-board-note' && Number.isInteger(sprintIndex)) {
    const noteId = String(trigger.dataset.noteId || '').trim();
    if (!noteId) return;
    updateState((state) => {
      const sprint = state.spData[sprintIndex];
      if (!sprint || !Array.isArray(sprint.notesBoard)) return;
      sprint.notesBoard = sprint.notesBoard.filter((note) => String(note?.id || '') !== noteId);
    });
    if (uiState.editingSprintBoardNoteKey === `${sprintIndex}:${noteId}`) {
      uiState.editingSprintBoardNoteKey = null;
      render();
    }
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
    
    // Format dates as DD/MM for the sprint name
    const formattedName = formatSprintNameWithDates(name, normalizedStartDate, normalizedEndDate);
    
    updateState((state) => {
      state.spData.push({
        id: createId('sprint'),
        name: formattedName,
        startDate: normalizedStartDate,
        endDate: normalizedEndDate,
        createdAt: new Date().toISOString(),
        tickets: [],
        notesBoard: [],
      });
    });
    resetForm(root, '[data-form="sprint-create"]');
    return;
  }

  if (trigger.dataset.action === 'remove-sprint-plan' && Number.isInteger(sprintIndex)) {
    updateState((state) => {
      const sprintToRemove = state.spData[sprintIndex];
      const sprintId = String(sprintToRemove?.id || '').trim();
      if (sprintId) {
        if (!state.spCollapsedByKey || typeof state.spCollapsedByKey !== 'object' || Array.isArray(state.spCollapsedByKey)) {
          state.spCollapsedByKey = {};
        }
        delete state.spCollapsedByKey[sprintId];
      }
      state.spData.splice(sprintIndex, 1);
    });
    if (uiState.editingSprintIndex === sprintIndex) {
      uiState.editingSprintIndex = null;
    }
    uiState.editingSprintBoardNoteKey = null;
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
    const priority = String(form?.get('priority') || 'Medium').trim() || 'Medium';
    const notes = String(form?.get('notes') || '').trim();
    if (!title) return;
    updateState((state) => {
      state.spData[sprintIndex].tickets.push({
        id: createId('sprint-ticket'),
        title,
        jiraId: String(form?.get('jiraId') || '').trim(),
        epicId: String(form?.get('epicId') || '').trim(),
        jiraUrl: String(form?.get('jiraUrl') || '').trim(),
        desc: notes,
        notes,
        assignee: '',
        priority,
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
      ticket.priority = String(formData.get('priority') || 'Medium').trim() || 'Medium';
      ticket.jiraId = String(formData.get('jiraId') || '').trim();
      ticket.epicId = String(formData.get('epicId') || '').trim();
      ticket.jiraUrl = String(formData.get('jiraUrl') || '').trim();
      const notes = String(formData.get('notes') || '').trim();
      ticket.notes = notes;
      ticket.desc = notes;
    });
    uiState.editingTicket = null;
    render();
  }
}

function applySprintNoteFormatting(editable, hiddenInput, formatType) {
  editable.focus();

  if (formatType === 'bold') {
    document.execCommand('bold');
    syncSprintNoteEditorValue(editable.closest('[data-note-editor]'));
    return;
  }

  if (formatType === 'italic') {
    document.execCommand('italic');
    syncSprintNoteEditorValue(editable.closest('[data-note-editor]'));
    return;
  }

  if (formatType === 'list') {
    document.execCommand('insertUnorderedList');
    syncSprintNoteEditorValue(editable.closest('[data-note-editor]'));
    return;
  }

  if (formatType === 'code') {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const selectedText = selection.toString() || 'code';
    const codeElement = document.createElement('code');
    codeElement.textContent = selectedText;
    range.deleteContents();
    range.insertNode(codeElement);
    range.setStartAfter(codeElement);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    syncSprintNoteEditorValue(editable.closest('[data-note-editor]'));
    return;
  }

  if (formatType === 'link') {
    const rawUrl = window.prompt('Insere o URL do link', 'https://');
    if (rawUrl === null) return;
    const normalizedUrl = normalizeSprintNoteLinkUrl(rawUrl);
    if (!normalizedUrl) {
      window.alert('URL invalido. Usa um link como https://exemplo.com');
      return;
    }

    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() || '';
    if (selectedText) {
      document.execCommand('createLink', false, normalizedUrl);
    } else {
      document.execCommand('insertHTML', false, `<a href="${normalizedUrl}" target="_blank" rel="noopener noreferrer">link</a>`);
    }
    syncSprintNoteEditorValue(editable.closest('[data-note-editor]'));
    return;
  }

  hiddenInput.value = editable.innerHTML;
}

function syncSprintNoteEditorValue(editorRoot) {
  if (!(editorRoot instanceof Element)) return;
  const editable = editorRoot.querySelector('.sprint-note-editor__input[contenteditable="true"]');
  const hiddenInput = editorRoot.querySelector('input[name="text"]');
  if (!(editable instanceof HTMLElement) || !(hiddenInput instanceof HTMLInputElement)) return;
  hiddenInput.value = editable.innerHTML;
}

function syncSprintNoteEditors(container) {
  if (!(container instanceof Element)) return;
  container.querySelectorAll('[data-note-editor]').forEach((editorRoot) => {
    syncSprintNoteEditorValue(editorRoot);
  });
}

function applySprintNoteTextColor(editorRoot, color) {
  if (!(editorRoot instanceof Element)) return;
  const editable = editorRoot.querySelector('.sprint-note-editor__input[contenteditable="true"]');
  if (!(editable instanceof HTMLElement)) return;
  const normalizedColor = String(color || '').trim().toLowerCase();
  editable.focus();

  if (/^#[0-9a-f]{6}$/i.test(normalizedColor)) {
    document.execCommand('foreColor', false, normalizedColor);
  } else {
    document.execCommand('foreColor', false, '#0f172a');
  }

  syncSprintNoteEditorValue(editorRoot);
}

function normalizeSprintNoteLinkUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^www\./i.test(raw)) return `https://${raw}`;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) return `https://${raw}`;
  return '';
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

function formatSprintNameWithDates(baseName, startDate, endDate) {
  const parseDate = (dateStr) => {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
  };

  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const dateRange = start && end ? `${start} - ${end}` : '';
  
  return dateRange ? `${baseName} [${dateRange}]` : baseName;
}