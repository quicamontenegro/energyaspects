import { renderDataExplorerSection, renderDataExplorerTaskEditModal } from '../sections/dataExplorerSection.js';
import { renderInvoicingSection } from '../sections/invoicingSection.js';
import { renderMilestonesSection } from '../sections/milestonesSection.js';
import { renderSprintsSection, renderGlobalTicketEditModal, renderSprintTicketCreateModal, getSprintMembers } from '../sections/sprintsSection.js';
import { renderVelocitySection, buildConfluenceReport, getVelocitySelection } from '../sections/velocitySection.js';
import { cloneState, createDefaultSnapshot } from '../state/defaults.js';
import { createStore } from '../state/store.js';
import { normalizeProjectMember } from '../utils/dashboard.js';
import { createId, slugify } from '../utils/format.js';
import { icon } from '../utils/icons.js';

const TAB_ORDER = ['sprints', 'velocity', 'milestones', 'invoicing'];
const THEME_STORAGE_KEY = 'ea-dashboard-theme';

export function createDashboardApp(root, initialSnapshot, persistence) {
  const store = createStore(initialSnapshot || createDefaultSnapshot());
  // Keep persistence aligned with the loaded snapshot to avoid flushing defaults on refresh.
  persistence.setSnapshot(store.getState());
  const uiState = {
    tab: resolveTabFromHash(),
    velocityGroup: 'rp',
    velocityTeam: 'all',
    velocitySprint: '',
    velocityComparison: 3,
    velocityHistory: 7,
    velocityView: 'analysis',
    selectedSprintIndex: null,
    sprintView: 'board',
    sharedNotesQuery: '',
    invoicingQuery: '',
    sharedNoteDrafts: new Map(),
    sharedNoteTitleDrafts: new Map(),
    deWeekFilter: 'all',
    editingMeetingId: null,
    editingDeTaskId: null,
    milestoneStatus: 'all',
    editingTicket: null,
    creatingSprintTicket: null,
    editingSprintIndex: null,
    reorderingSprintIndex: null,
    editingSprintNoteId: null,
    editingSprintBoardNoteKey: null,
  };
  const dragState = {
    type: '',
    sprintIndex: null,
    ticketIndex: null,
    assignee: '',
    epicKey: '',
  };
  let modalReturnAction = null;
  let modalWasOpen = false;
  const noteResizeObserver = new ResizeObserver(entries => {
    entries.forEach(({ target: body }) => {
      const expansion = body.closest('.shared-note-entry')?.querySelector('.shared-note-expand');
      if (expansion && !expansion.open && body.clientHeight > 0) expansion.hidden = body.scrollHeight <= body.clientHeight + 1;
    });
  });

  function persist(snapshot) {
    persistence.setSnapshot(snapshot);
    return persistence.schedule(snapshot);
  }

  function filterSharedNotes() {
    const query = uiState.sharedNotesQuery.trim().toLocaleLowerCase();
    const entries = Array.from(root.querySelectorAll('.shared-note-entry'));
    let visible = 0;
    entries.forEach(entry => {
      const body = entry.querySelector('.sprint-note-item__text, [contenteditable="true"]');
      const date = entry.querySelector('.shared-note-date, .shared-note-heading');
      const title = entry.querySelector('.shared-note-identity h3, [name="title"]');
      const text = `${title?.value || title?.textContent || ''} ${body?.textContent || ''} ${date?.textContent || ''}`.toLocaleLowerCase();
      entry.hidden = Boolean(query && !text.includes(query) && !entry.classList.contains('sprint-note-item--editing'));
      if (!entry.hidden) visible++;
    });
    const result = root.querySelector('[data-shared-notes-results]');
    if (result) result.textContent = query ? `${visible} of ${entries.length} notes` : `${entries.length} notes`;
    const empty = root.querySelector('[data-shared-notes-no-results]');
    if (empty) empty.hidden = !entries.length || visible > 0;
  }

  function filterInvoicingProjects() {
    const query = uiState.invoicingQuery.trim().toLocaleLowerCase();
    const projects = Array.from(root.querySelectorAll('[data-invoicing-project]'));
    projects.forEach(project => {
      project.hidden = !project.dataset.projectSearch.toLocaleLowerCase().includes(query);
    });
    const empty = root.querySelector('[data-invoicing-no-results]');
    if (empty) empty.hidden = !projects.length || projects.some(project => !project.hidden);
  }

  function render() {
    const state = store.getState();
    const panelStates = new Map(Array.from(root.querySelectorAll('details[data-sprint-panel], details[data-ui-panel]'), panel =>
      [panel.dataset.sprintPanel || panel.dataset.uiPanel, panel.open]));
    let modal = '';
    
    if (uiState.editingTicket) {
      const { sprintIndex, ticketIndex } = uiState.editingTicket;
      const sprint = state.spData[sprintIndex];
      const ticket = sprint?.tickets?.[ticketIndex];
      if (ticket) {
        const members = getSprintMembers(state.spTeamMembers);
        const relatedTickets = getRelatedEpicTicketsForEdit(sprint, ticketIndex);
        modal = renderGlobalTicketEditModal(sprintIndex, ticketIndex, ticket, members, relatedTickets);
      }
    }

    if (!modal && uiState.creatingSprintTicket) {
      const { sprintIndex, assignee } = uiState.creatingSprintTicket;
      const sprint = state.spData[sprintIndex];
      if (sprint) {
        const members = getSprintMembers(state.spTeamMembers);
        modal = renderSprintTicketCreateModal(sprintIndex, assignee, members);
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
      <main class="app-shell redesigned-shell">
        <aside class="app-header app-sidebar">
          <span class="app-logo">Energy<strong>Aspects</strong></span>
          <nav class="app-tabs" aria-label="Main navigation">
            ${TAB_ORDER.map((tab) => `<button class="app-tabs__button ${uiState.tab === tab ? 'is-active' : ''}" type="button" data-action="switch-tab" data-tab="${tab}" aria-label="${getTabLabel(tab)}" title="${getTabLabel(tab)}" ${uiState.tab === tab ? 'aria-current="page"' : ''}>${icon(tab)}<span>${getTabLabel(tab)}</span></button>`).join('')}
          </nav>
          <div class="sidebar-footer"><button class="theme-toggle" type="button" data-action="toggle-theme" title="${getThemeToggleLabel()}" aria-label="${getThemeToggleLabel()}">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
          <div class="sync-indicator ${persistence.canSync ? 'is-live' : 'is-local'}">${persistence.canSync ? '● Supabase' : '○ Local'}</div></div>
        </aside>
        <section class="app-content">
          ${renderCurrentTab(state, uiState)}
        </section>
      </main>
      ${modal}
    `;
    root.querySelectorAll('details[data-sprint-panel], details[data-ui-panel]').forEach(panel => {
      const key = panel.dataset.sprintPanel || panel.dataset.uiPanel;
      if (panelStates.has(key)) panel.open = panelStates.get(key);
    });
    syncStatusSelectThemes(root);
    noteResizeObserver.disconnect();
    root.querySelectorAll('.shared-note-entry').forEach(entry => {
      const body = entry.querySelector('.sprint-note-item__text');
      const expansion = entry.querySelector('.shared-note-expand');
      if (body && expansion) {
        if (!expansion.open && body.clientHeight > 0) expansion.hidden = body.scrollHeight <= body.clientHeight + 1;
        noteResizeObserver.observe(body);
      }
    });
    filterSharedNotes();
    filterInvoicingProjects();
    const dialog = root.querySelector('.modal-card');
    root.querySelector('.app-shell').inert = Boolean(dialog);
    if (dialog) {
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.tabIndex = -1;
      const heading = dialog.querySelector('h2');
      if (heading) {
        heading.id = 'dashboard-dialog-title';
        dialog.setAttribute('aria-labelledby', heading.id);
      }
      const initialField = dialog.querySelector('.modal-body input:not([type="hidden"]), .modal-body select, .modal-body textarea');
      (initialField || dialog).focus();
    } else if (modalWasOpen && modalReturnAction) {
      const trigger = Array.from(root.querySelectorAll('[data-action]')).find(element =>
        element.getClientRects().length > 0 && Object.entries(modalReturnAction).every(([key, value]) => element.dataset[key] === value));
      trigger?.focus();
    }
    modalWasOpen = Boolean(dialog);
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
    if (['edit-de-task', 'edit-sprint-ticket', 'open-add-sprint-ticket-modal'].includes(action)) {
      modalReturnAction = { ...trigger.dataset };
    }

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
      window.scrollTo({ top: 0 });
      return;
    }

    if (action === 'toggle-theme') {
      const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = nextTheme;
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      } catch (error) {
        console.warn('Could not save dashboard theme.', error);
      }
      render();
      return;
    }

    if (action === 'switch-velocity-group') {
      uiState.velocityGroup = trigger.dataset.group || 'rp';
      render();
      return;
    }

    if (action === 'velocity-view' || action === 'sprint-view') {
      uiState[action === 'velocity-view' ? 'velocityView' : 'sprintView'] = trigger.dataset.view;
      render();
      return;
    }

    if (action === 'select-sprint') {
      uiState.selectedSprintIndex = Number(trigger.dataset.index);
      uiState.editingSprintIndex = null;
      uiState.reorderingSprintIndex = null;
      render();
      return;
    }

    if (action === 'open-sprint-panel') {
      const panel = root.querySelector(`[data-sprint-panel="${trigger.dataset.panel}"]`);
      if (panel) {
        panel.open = !panel.open;
        if (panel.open) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      return;
    }

    if (action === 'open-shared-note-create' || action === 'cancel-shared-note-create') {
      const panel = root.querySelector('[data-ui-panel="shared-note-create"]');
      if (panel) {
        panel.open = action === 'open-shared-note-create';
        const editor = panel.querySelector('[contenteditable="true"]');
        if (panel.open) panel.querySelector('[name="title"]')?.focus();
        else {
          uiState.sharedNoteDrafts.delete('create');
          uiState.sharedNoteTitleDrafts.delete('create');
          panel.querySelector('[name="title"]').value = '';
          if (editor) editor.innerHTML = '';
          panel.querySelector('[name="text"]').value = '';
          root.querySelector('[data-action="open-shared-note-create"]')?.focus();
        }
      }
      return;
    }

    if (action === 'open-invoicing-create') {
      const panel = root.querySelector('[data-ui-panel="invoicing-create"]');
      if (panel) {
        panel.open = true;
        panel.querySelector('[name="name"]')?.focus();
      }
      return;
    }

    if (action === 'open-milestone-create') {
      const panel = root.querySelector('[data-ui-panel="milestone-create"]');
      if (panel) {
        panel.open = true;
        panel.querySelector('[name="name"]')?.focus();
      }
      return;
    }

    handleClickAction(trigger, updateState, root, uiState, render, () => store.getState());
  });

  root.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.closest('.invoicing-workspace')) {
      const form = event.target.closest('[data-form="project-create"], [data-form="member-create"]');
      if (form) {
        event.preventDefault();
        form.querySelector('button[data-action]')?.click();
        return;
      }
    }
    const dialog = root.querySelector('.modal-card');
    if (!dialog || document.querySelector('.link-input-popup-overlay')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      uiState.editingTicket = null;
      uiState.creatingSprintTicket = null;
      uiState.editingDeTaskId = null;
      render();
      return;
    }
    if (event.key !== 'Tab') return;
    const fields = Array.from(dialog.querySelectorAll('button:not([disabled]), a[href], input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'))
      .filter(element => element.getClientRects().length > 0);
    const first = fields[0];
    const last = fields[fields.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });

  root.addEventListener('mousedown', (event) => {
    const toolBtn = event.target instanceof Element ? event.target.closest('.sprint-note-tool, .note-color-swatch') : null;
    if (toolBtn) {
      event.preventDefault();
    }
  });

  root.addEventListener('change', (event) => {
    const field = event.target.closest('[data-action]');
    if (!field) {
      return;
    }

    if (field.dataset.action === 'velocity-filter') {
      uiState[field.dataset.field] = field.value;
      if (field.dataset.field === 'velocityTeam') uiState.velocitySprint = '';
      render();
      return;
    }

    if (field.dataset.action === 'select-sprint') {
      uiState.selectedSprintIndex = Number(field.value);
      uiState.editingSprintIndex = null;
      uiState.reorderingSprintIndex = null;
      render();
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
        if (richEditor.closest('.shared-notes-workspace')) {
          uiState.sharedNoteDrafts.set(editorRoot.dataset.noteEditor, editorRoot.querySelector('[name="text"]').value);
        }
        return;
      }
    }

    const field = event.target.closest('[data-action]');
    if (!field) {
      return;
    }

    // Handle input events for textarea and text fields
    const action = field.dataset.action;
    if (action === 'search-invoicing') {
      uiState.invoicingQuery = field.value;
      filterInvoicingProjects();
      return;
    }
    if (action === 'draft-shared-note-title') {
      uiState.sharedNoteTitleDrafts.set(field.dataset.noteId, field.value);
      return;
    }
    if (action === 'search-shared-notes') {
      uiState.sharedNotesQuery = field.value;
      filterSharedNotes();
      return;
    }
    if (action === 'update-sprint-ticket-notes') {
      handleChangeAction(field, updateState, uiState, render);
    }
  });

  root.addEventListener('dragstart', (event) => {
    const ticketHandle = event.target instanceof Element ? event.target.closest('[data-ticket-drag]') : null;
    const epicHandle = event.target instanceof Element ? event.target.closest('[data-epic-drag]') : null;

    if (ticketHandle instanceof HTMLElement) {
      const sprintIndex = Number(ticketHandle.dataset.sprintIndex);
      const ticketIndex = Number(ticketHandle.dataset.ticketIndex);
      if (!Number.isInteger(sprintIndex) || !Number.isInteger(ticketIndex)) return;
      if (uiState.reorderingSprintIndex !== sprintIndex) return;

      dragState.type = 'ticket';
      dragState.sprintIndex = sprintIndex;
      dragState.ticketIndex = ticketIndex;
      dragState.assignee = '';
      dragState.epicKey = '';
      const dropItem = ticketHandle.closest('[data-ticket-drop]');
      if (dropItem instanceof HTMLElement) {
        dropItem.classList.add('is-dragging');
      }

      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', `ticket:${sprintIndex}:${ticketIndex}`);
      }
      return;
    }

    if (epicHandle instanceof HTMLElement) {
      const sprintIndex = Number(epicHandle.dataset.sprintIndex);
      const assignee = String(epicHandle.dataset.assignee || '').trim();
      const epicKey = String(epicHandle.dataset.epicKey || '').trim();
      if (!Number.isInteger(sprintIndex) || !assignee || !epicKey) return;
      if (uiState.reorderingSprintIndex !== sprintIndex) return;

      dragState.type = 'epic';
      dragState.sprintIndex = sprintIndex;
      dragState.ticketIndex = null;
      dragState.assignee = assignee;
      dragState.epicKey = epicKey;

      const epicCard = epicHandle.closest('[data-epic-drop]');
      if (epicCard instanceof HTMLElement) {
        epicCard.classList.add('is-epic-dragging');
      }

      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', `epic:${sprintIndex}:${assignee}:${epicKey}`);
      }
    }
  });

  root.addEventListener('dragover', (event) => {
    if (dragState.type === 'ticket') {
      const dropItem = event.target instanceof Element ? event.target.closest('[data-ticket-drop]') : null;
      if (!(dropItem instanceof HTMLElement)) return;

      const sprintIndex = Number(dropItem.dataset.sprintIndex);
      if (!Number.isInteger(sprintIndex) || sprintIndex !== dragState.sprintIndex) return;

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      root.querySelectorAll('.sprint-ticket-preview__list-item.is-drag-over').forEach((node) => node.classList.remove('is-drag-over'));
      dropItem.classList.add('is-drag-over');
      return;
    }

    if (dragState.type === 'epic') {
      const dropCard = event.target instanceof Element ? event.target.closest('[data-epic-drop]') : null;
      if (!(dropCard instanceof HTMLElement)) return;

      const sprintIndex = Number(dropCard.dataset.sprintIndex);
      const assignee = String(dropCard.dataset.assignee || '').trim();
      if (!Number.isInteger(sprintIndex) || sprintIndex !== dragState.sprintIndex) return;
      if (!assignee || assignee !== dragState.assignee) return;

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      root.querySelectorAll('.sprint-ticket-card.is-epic-drag-over').forEach((node) => node.classList.remove('is-epic-drag-over'));
      dropCard.classList.add('is-epic-drag-over');
    }
  });

  root.addEventListener('drop', (event) => {
    if (dragState.type === 'ticket') {
      const dropItem = event.target instanceof Element ? event.target.closest('[data-ticket-drop]') : null;
      if (!(dropItem instanceof HTMLElement)) return;
      event.preventDefault();

      const sourceSprint = dragState.sprintIndex;
      const sourceIndex = dragState.ticketIndex;
      const targetSprint = Number(dropItem.dataset.sprintIndex);
      const targetIndex = Number(dropItem.dataset.ticketIndex);

      clearSprintDragClasses(root);

      if (!Number.isInteger(sourceSprint) || !Number.isInteger(sourceIndex)) return;
      if (!Number.isInteger(targetSprint) || !Number.isInteger(targetIndex)) return;
      if (sourceSprint !== targetSprint || sourceIndex === targetIndex) return;

      const rect = dropItem.getBoundingClientRect();
      const placeAfter = event.clientY > rect.top + (rect.height / 2);
      const rawInsertIndex = placeAfter ? targetIndex + 1 : targetIndex;

      updateState((state) => {
        const sprint = state.spData[sourceSprint];
        if (!sprint || !Array.isArray(sprint.tickets)) return;
        const tickets = sprint.tickets;
        if (sourceIndex < 0 || sourceIndex >= tickets.length) return;

        const [movedTicket] = tickets.splice(sourceIndex, 1);
        if (!movedTicket) return;

        let insertIndex = Math.max(0, Math.min(rawInsertIndex, tickets.length));
        if (sourceIndex < rawInsertIndex) {
          insertIndex -= 1;
        }
        tickets.splice(insertIndex, 0, movedTicket);
      });

      resetSprintDragState(dragState);
      return;
    }

    if (dragState.type === 'epic') {
      const dropCard = event.target instanceof Element ? event.target.closest('[data-epic-drop]') : null;
      if (!(dropCard instanceof HTMLElement)) return;
      event.preventDefault();

      const sourceSprint = dragState.sprintIndex;
      const sourceAssignee = dragState.assignee;
      const sourceEpicKey = dragState.epicKey;
      const targetSprint = Number(dropCard.dataset.sprintIndex);
      const targetAssignee = String(dropCard.dataset.assignee || '').trim();
      const targetEpicKey = String(dropCard.dataset.epicKey || '').trim();

      clearSprintDragClasses(root);

      if (!Number.isInteger(sourceSprint) || !sourceEpicKey || !sourceAssignee) return;
      if (!Number.isInteger(targetSprint) || !targetEpicKey || !targetAssignee) return;
      if (sourceSprint !== targetSprint) return;
      if (sourceAssignee !== targetAssignee) return;
      if (sourceEpicKey === targetEpicKey) return;

      const rect = dropCard.getBoundingClientRect();
      const placeAfter = event.clientY > rect.top + (rect.height / 2);

      updateState((state) => {
        const sprint = state.spData[sourceSprint];
        if (!sprint || !Array.isArray(sprint.tickets)) return;
        reorderEpicGroupInSprintTickets(sprint.tickets, sourceAssignee, sourceEpicKey, targetEpicKey, placeAfter);
      });

      resetSprintDragState(dragState);
    }
  });

  root.addEventListener('dragend', () => {
    clearSprintDragClasses(root);
    resetSprintDragState(dragState);
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

function getThemeToggleLabel() {
  return document.documentElement.dataset.theme === 'dark' ? 'Use light mode' : 'Use dark mode';
}

function getThemeIcon() {
  return document.documentElement.dataset.theme === 'dark' ? '&#9788;' : '&#9790;';
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
    'remove-sprint-quick-link': 'Remove this quick link? The original ticket will not be deleted.',
    'remove-rpde-ticket': 'Remove this queue item?',
    'remove-sprint-plan': 'Remove this sprint and all its tickets?',
    'remove-sprint-ticket': 'Remove this ticket from the sprint?',
    'remove-sprint-epic': 'Remove this epic and all tickets under it?',
    'remove-sprint-ticket-in-form': 'Remove this ticket from the sprint?',
    'remove-ticket-link-row': 'Remove this ticket from More Tickets?',
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

function handleClickAction(trigger, updateState, root, uiState, render, getState) {
  const projectIndex = Number(trigger.dataset.projectIndex);
  const memberIndex = Number(trigger.dataset.memberIndex);
  const teamIndex = Number(trigger.dataset.teamIndex);
  const sprintIndex = Number(trigger.dataset.sprintIndex);
  const taskIndex = Number(trigger.dataset.taskIndex);
  const milestoneIndex = Number(trigger.dataset.milestoneIndex);
  const ticketIndex = Number(trigger.dataset.ticketIndex);

  if (trigger.dataset.action === 'open-sprint-quick-link-create') {
    const editor = trigger.closest('.sprint-quick-links').querySelector('.sprint-quick-link-create');
    editor.open = true;
    editor.querySelector('[name="label"]').focus();
    return;
  }

  if (trigger.dataset.action === 'remove-sprint-quick-link') {
    const sourceUrl = trigger.dataset.sourceUrl;
    const linkId = trigger.dataset.linkId;
    if (!Number.isInteger(sprintIndex) || (!sourceUrl && !linkId)) return;
    updateState(state => {
      const sprint = state.spData[sprintIndex];
      if (!sprint) return;
      if (linkId) sprint.quickLinks = (sprint.quickLinks || []).filter(link => link.id !== linkId);
      else sprint.quickLinkOverrides = { ...sprint.quickLinkOverrides, [sourceUrl]: { ...sprint.quickLinkOverrides?.[sourceUrl], removed: true } };
    });
    return;
  }

  if (trigger.dataset.action === 'cancel-sprint-quick-link') {
    const editor = trigger.closest('.sprint-quick-link-edit');
    editor.querySelector('form').reset();
    editor.querySelector('[name="label"]').setCustomValidity('');
    editor.querySelector('[name="url"]').setCustomValidity('');
    editor.open = false;
    return;
  }

  if (trigger.dataset.action === 'save-sprint-quick-link' || trigger.dataset.action === 'add-sprint-quick-link') {
    const editor = trigger.closest('.sprint-quick-link-edit');
    const form = editor.querySelector('form');
    const labelInput = form.querySelector('[name="label"]');
    const urlInput = form.querySelector('[name="url"]');
    const label = labelInput.value.trim();
    const url = urlInput.value.trim();
    let validUrl = false;
    try { validUrl = ['http:', 'https:'].includes(new URL(url).protocol); } catch {}
    labelInput.setCustomValidity(label ? '' : 'Enter a title.');
    urlInput.setCustomValidity(validUrl ? '' : 'Enter an HTTP or HTTPS URL.');
    if (!form.reportValidity()) return;
    const sourceUrl = trigger.dataset.sourceUrl;
    const linkId = trigger.dataset.linkId;
    const creating = trigger.dataset.action === 'add-sprint-quick-link';
    if (!Number.isInteger(sprintIndex) || (!creating && !sourceUrl && !linkId)) return;
    editor.open = false;
    updateState(state => {
      const sprint = state.spData[sprintIndex];
      if (!sprint) return;
      if (creating) {
        sprint.quickLinks = [...(sprint.quickLinks || []), { id: createId('quick-link'), label, url }];
      } else if (linkId) {
        const link = (sprint.quickLinks || []).find(item => item.id === linkId);
        if (link) Object.assign(link, { label, url });
      } else {
        sprint.quickLinkOverrides = { ...sprint.quickLinkOverrides, [sourceUrl]: { label, url } };
      }
    });
    return;
  }

  if (trigger.dataset.action === 'add-global-epic') {
    const form = readForm(root, '[data-form="global-epic-create"]');
    const title = String(form?.get('title') || '').trim();
    const url = String(form?.get('url') || '').trim();
    if (!title) return;
    updateState((draft) => {
      draft.spEpics = Array.isArray(draft.spEpics) ? draft.spEpics : [];
      const duplicate = draft.spEpics.some((epic) => String(epic.title || '').trim().toLowerCase() === title.toLowerCase());
      if (!duplicate) draft.spEpics.push({ id: createId('epic'), title, url, createdAt: new Date().toISOString() });
    });
    resetForm(root, '[data-form="global-epic-create"]');
    return;
  }

  if (trigger.dataset.action === 'remove-global-epic') {
    const id = trigger.dataset.epicId;
    updateState((draft) => { draft.spEpics = (draft.spEpics || []).filter((epic) => epic.id !== id); });
    return;
  }

  if (trigger.dataset.action === 'add-velocity-sprint') {
    const state = getState();
    const existing = Array.isArray(state.velocityReportSprints) ? state.velocityReportSprints : [];
    const nextNumber = existing.length + 1;
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    updateState((draft) => {
      draft.velocityReportSprints = Array.isArray(draft.velocityReportSprints) ? draft.velocityReportSprints : [];
      draft.velocityReportSprints.push({
        id: createId('velocity'), label: `Sprint ${nextNumber}`, startDate: date, completed: false,
        plannedSP: '', completedSP: '', carryOverSP: '', workItemsCompleted: '', scopeChange: '',
        bugsFixed: '', devCompletedSP: '', devAverage: '', qaCompletedSP: '', qaAverage: '',
        distribution: { notStarted: '', inProgress: '', codeReview: '', readyForQA: '', inQA: '', blocked: '' },
        createdAt: now.toISOString()
      });
    });
    return;
  }

  if (trigger.dataset.action === 'remove-velocity-sprint') {
    const id = trigger.dataset.sprintId;
    updateState((draft) => { draft.velocityReportSprints = (draft.velocityReportSprints || []).filter((item) => item.id !== id); });
    return;
  }

  if (trigger.dataset.action === 'generate-confluence-report' || trigger.dataset.action === 'export-velocity-report') {
    const state = getState();
    const selected = getVelocitySelection(state, uiState);
    const current = selected.find(sprint => sprint.id === uiState.velocitySprint) || [...selected].reverse().find(sprint => !sprint.completed);
    const completed = selected.filter(sprint => sprint.completed && sprint.id !== current?.id && (!current?.startDate || !sprint.startDate || sprint.startDate <= current.startDate));
    const report = buildConfluenceReport(completed, Number(uiState.velocityComparison) || 3);
    if (trigger.dataset.action === 'export-velocity-report') {
      const url = URL.createObjectURL(new Blob([report], { type: 'text/markdown;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'sprint-velocity-report.md';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    const output = root.querySelector('[data-report-output]');
    const textarea = root.querySelector('[data-confluence-text]');
    if (output && textarea) {
      textarea.value = report;
      output.hidden = false;
      output.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      textarea.focus();
      textarea.select();
    }
    return;
  }

  if (trigger.dataset.action === 'copy-confluence-report') {
    const textarea = root.querySelector('[data-confluence-text]');
    if (textarea) {
      textarea.select();
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(textarea.value).catch(() => document.execCommand('copy'));
      else document.execCommand('copy');
      trigger.textContent = 'Copied ✓';
    }
    return;
  }

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

  if (trigger.dataset.action === 'set-epic-link') {
    const form = trigger.closest('.ticket-edit-form');
    if (!(form instanceof Element)) return;
    const epicUrlInput = form.querySelector('input[name="epicUrl"]');
    if (!(epicUrlInput instanceof HTMLInputElement)) return;

    openLinkInputPopup({
      title: 'Epic link',
      initialValue: epicUrlInput.value || 'https://',
      onConfirm: (rawUrl) => {
        const trimmed = String(rawUrl || '').trim();
        const normalized = trimmed ? normalizeUrl(trimmed) : '';
        if (trimmed && !normalized) {
          window.alert('URL invalido. Usa um link como https://jira/...');
          return false;
        }

        epicUrlInput.value = normalized;
        updateLinkPreview(form, 'epicUrl', normalized);
        return true;
      },
    });
    return;
  }

  if (trigger.dataset.action === 'set-ticket-link') {
    const form = trigger.closest('.ticket-edit-form');
    if (!(form instanceof Element)) return;
    const row = trigger.closest('[data-ticket-link-row]') || trigger.closest('.form-group');
    const ticketUrlInput = row?.querySelector('input[name="jiraUrl"]');
    if (!(ticketUrlInput instanceof HTMLInputElement)) return;

    openLinkInputPopup({
      title: 'Ticket link',
      initialValue: ticketUrlInput.value || 'https://',
      onConfirm: (rawUrl) => {
        const trimmed = String(rawUrl || '').trim();
        const normalized = trimmed ? normalizeUrl(trimmed) : '';
        if (trimmed && !normalized) {
          window.alert('URL invalido. Usa um link como https://jira/...');
          return false;
        }

        ticketUrlInput.value = normalized;
        if (row instanceof Element) {
          updateLinkPreview(row, 'jiraUrl', normalized);
        }
        return true;
      },
    });
    return;
  }

  if (trigger.dataset.action === 'add-ticket-link-row') {
    const list = trigger.closest('.form-group')?.querySelector('[data-ticket-links-list]');
    if (!(list instanceof Element)) return;

    const row = document.createElement('div');
    row.className = 'ticket-link-row';
    row.setAttribute('data-ticket-link-row', 'true');
    row.innerHTML = `
      <div class="inline-link-field inline-link-field--with-delete">
        <input class="field-input" name="jiraId" type="text" placeholder="DP-3333" />
        <button class="button button--secondary button--sm" type="button" data-action="set-ticket-link">Link</button>
        <button class="btn-icon" type="button" data-action="remove-ticket-link-row" title="Delete ticket">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 6l-1.4 14H6.4L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </button>
      </div>
      <input name="existingTicketIndex" type="hidden" value="" />
      <input name="existingTicketId" type="hidden" value="" />
      <input name="jiraUrl" type="hidden" value="" />
      <input class="field-input" name="storyPoints" type="number" min="0" step="0.5" value="" placeholder="Story points" />
      <input class="field-input" name="notes" type="text" value="" placeholder="Notes" />
      <p class="sprint-link-hint" data-link-preview="jiraUrl">Sem link</p>
    `;
    list.appendChild(row);
    const newInput = row.querySelector('input[name="jiraId"]');
    if (newInput instanceof HTMLInputElement) newInput.focus();
    return;
  }

  if (trigger.dataset.action === 'remove-ticket-link-row') {
    const row = trigger.closest('[data-ticket-link-row]');
    const list = row?.parentElement;
    if (!(row instanceof Element) || !(list instanceof Element)) return;
    const rows = list.querySelectorAll('[data-ticket-link-row]');
    if (rows.length <= 1) {
      const idInput = row.querySelector('input[name="jiraId"]');
      const urlInput = row.querySelector('input[name="jiraUrl"]');
      const existingIdInput = row.querySelector('input[name="existingTicketId"]');
      const spInput = row.querySelector('input[name="storyPoints"]');
      const notesInput = row.querySelector('input[name="notes"]');
      if (idInput instanceof HTMLInputElement) idInput.value = '';
      if (urlInput instanceof HTMLInputElement) urlInput.value = '';
      if (existingIdInput instanceof HTMLInputElement) existingIdInput.value = '';
      if (spInput instanceof HTMLInputElement) spInput.value = '';
      if (notesInput instanceof HTMLInputElement) notesInput.value = '';
      updateLinkPreview(row, 'jiraUrl', '');
      return;
    }
    row.remove();
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

  if (trigger.dataset.action === 'toggle-sprint-ticket-reorder-mode' && Number.isInteger(sprintIndex)) {
    uiState.reorderingSprintIndex = uiState.reorderingSprintIndex === sprintIndex ? null : sprintIndex;
    render();
    return;
  }

  if (trigger.dataset.action === 'add-project') {
    if (!root.querySelector('[data-form="project-create"]')?.reportValidity()) return;
    const form = readForm(root, '[data-form="project-create"]');
    const name = String(form?.get('name') || '').trim();
    if (!name) return;
    const tag = String(form?.get('tag') || '').trim();
    const color = String(form?.get('color') || '#0f766e');
    uiState.invoicingQuery = '';
    updateState((state) => {
      state.projects.push({ id: createId(`project-${slugify(name)}`), name, tag, color, members: [] });
    });
    resetForm(root, '[data-form="project-create"]');
    const composer = root.querySelector('[data-ui-panel="invoicing-create"]');
    if (composer) composer.open = false;
    return;
  }

  if (trigger.dataset.action === 'remove-project' && Number.isInteger(projectIndex)) {
    updateState((state) => {
      state.projects.splice(projectIndex, 1);
    });
    return;
  }

  if (trigger.dataset.action === 'add-project-member' && Number.isInteger(projectIndex)) {
    if (!root.querySelector(`[data-form="member-create"][data-project-index="${projectIndex}"] [name="name"]`)?.reportValidity()) return;
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
    if (!root.querySelector('[data-form="milestone-create"]')?.reportValidity()) return;
    const form = readForm(root, '[data-form="milestone-create"]');
    const name = String(form?.get('name') || '').trim();
    if (!name) return;
    updateState((state) => {
      state.msData.push({
        id: createId('milestone'),
        team: 'rp',
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
    const titleField = root.querySelector('[data-form="sprint-note-create"] [name="title"]');
    if (!titleField?.reportValidity() || !titleField.value.trim()) return;
    syncSprintNoteEditors(root.querySelector('[data-form="sprint-note-create"]'));
    const form = readForm(root, '[data-form="sprint-note-create"]');
    const text = String(form?.get('text') || '').trim();
    if (!text) return;
    uiState.sharedNoteDrafts.delete('create');
    uiState.sharedNoteTitleDrafts.delete('create');
    uiState.sharedNotesQuery = '';
    updateState((state) => {
      const notes = Array.isArray(state.spNotes) ? state.spNotes : [];
      notes.unshift({
        id: createId('sprint-note'),
        title: titleField.value.trim(),
        text,
        link: '',
        createdAt: new Date().toISOString(),
      });
      state.spNotes = notes;
    });
    resetForm(root, '[data-form="sprint-note-create"]');
    const composer = root.querySelector('[data-ui-panel="shared-note-create"]');
    if (composer) composer.open = false;
    root.querySelector('[data-action="open-shared-note-create"]')?.focus();
    return;
  }

  if (trigger.dataset.action === 'move-sprint-note') {
    const noteId = String(trigger.dataset.noteId || '').trim();
    const direction = trigger.dataset.direction;
    if (!noteId || !['up', 'down'].includes(direction)) return;
    updateState((state) => {
      const notes = Array.isArray(state.spNotes) ? state.spNotes : [];
      const index = notes.findIndex(note => String(note?.id || '') === noteId);
      const targetIndex = index + (direction === 'up' ? -1 : 1);
      if (index < 0 || targetIndex < 0 || targetIndex >= notes.length) return;
      [notes[index], notes[targetIndex]] = [notes[targetIndex], notes[index]];
    });
    const movedButton = Array.from(root.querySelectorAll('[data-action="move-sprint-note"]')).find(button => button.dataset.noteId === noteId && button.dataset.direction === direction && !button.disabled);
    movedButton?.focus();
    return;
  }

  if (trigger.dataset.action === 'edit-sprint-note') {
    uiState.editingSprintNoteId = String(trigger.dataset.noteId || '').trim() || null;
    render();
    root.querySelector('.shared-note-entry.sprint-note-item--editing [name="title"]')?.focus();
    return;
  }

  if (trigger.dataset.action === 'cancel-edit-sprint-note') {
    uiState.sharedNoteDrafts.delete(uiState.editingSprintNoteId);
    uiState.sharedNoteTitleDrafts.delete(uiState.editingSprintNoteId);
    uiState.editingSprintNoteId = null;
    render();
    return;
  }

  if (trigger.dataset.action === 'save-edit-sprint-note') {
    const noteId = String(trigger.dataset.noteId || '').trim();
    if (!noteId) return;
    const titleField = root.querySelector(`[data-form="sprint-note-edit"][data-note-id="${noteId}"] [name="title"]`);
    if (!titleField?.reportValidity() || !titleField.value.trim()) return;
    syncSprintNoteEditors(root.querySelector(`[data-form="sprint-note-edit"][data-note-id="${noteId}"]`));
    const form = readForm(root, `[data-form="sprint-note-edit"][data-note-id="${noteId}"]`);
    const text = String(form?.get('text') || '').trim();
    if (!text) return;
    uiState.sharedNoteDrafts.delete(noteId);
    uiState.sharedNoteTitleDrafts.delete(noteId);
    updateState((state) => {
      const notes = Array.isArray(state.spNotes) ? state.spNotes : [];
      const note = notes.find((item) => String(item?.id || '') === noteId);
      if (!note) return;
      note.title = titleField.value.trim();
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
    uiState.sharedNoteDrafts.delete(noteId);
    uiState.sharedNoteTitleDrafts.delete(noteId);
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
    uiState.selectedSprintIndex = (getState().spData || []).length;
    uiState.sprintView = 'board';
    
    updateState((state) => {
      const columnAssignees = normalizeSprintMembers(state.spTeamMembers)
        .map((member) => String(member?.name || '').trim())
        .filter((memberName) => memberName.length > 0);

      state.spData.push({
        id: createId('sprint'),
        name: formattedName,
        startDate: normalizedStartDate,
        endDate: normalizedEndDate,
        createdAt: new Date().toISOString(),
        columnAssignees,
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
    if (uiState.reorderingSprintIndex === sprintIndex) {
      uiState.reorderingSprintIndex = null;
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

  if (trigger.dataset.action === 'open-add-sprint-ticket-modal' && Number.isInteger(sprintIndex)) {
    const assignee = String(trigger.dataset.assignee || '').trim();
    uiState.creatingSprintTicket = { sprintIndex, assignee };
    render();
    return;
  }

  if (trigger.dataset.action === 'edit-sprint-epic' && Number.isInteger(sprintIndex) && Number.isInteger(ticketIndex)) {
    uiState.editingTicket = { sprintIndex, ticketIndex };
    render();
    return;
  }

  if (trigger.dataset.action === 'duplicate-sprint-epic' && Number.isInteger(sprintIndex)) {
    const assignee = String(trigger.dataset.assignee || '').trim();
    const epicKey = String(trigger.dataset.epicKey || '').trim();
    if (!assignee || !epicKey) return;

    const state = typeof getState === 'function' ? getState() : null;
    const sprintOptions = (state.spData || [])
      .map((sprint, index) => ({
        value: String(index),
        label: `${String(sprint?.name || `Sprint ${index + 1}`)}${index === sprintIndex ? ' (current)' : ''}`,
      }));

    if (sprintOptions.length <= 1) {
      window.alert('Nao existem outros sprints para duplicar este epic.');
      return;
    }

    openSelectPopup({
      title: 'Duplicate epic to sprint',
      options: sprintOptions,
      initialValue: String(sprintIndex),
      onConfirm: (selectedValue) => {
        const targetSprintIndex = Number(selectedValue);
        if (!Number.isInteger(targetSprintIndex) || targetSprintIndex === sprintIndex) {
          window.alert('Seleciona um sprint diferente do atual para duplicar este epic.');
          return false;
        }

        updateState((nextState) => {
          const sourceSprint = nextState.spData[sprintIndex];
          const targetSprint = nextState.spData[targetSprintIndex];
          if (!sourceSprint || !targetSprint || !Array.isArray(sourceSprint.tickets)) return;

          const sourceTickets = sourceSprint.tickets.filter((ticket) => {
            return getTicketAssigneeKey(ticket) === assignee && getTicketEpicKey(ticket) === epicKey;
          });
          if (!sourceTickets.length) return;

          if (!Array.isArray(targetSprint.tickets)) {
            targetSprint.tickets = [];
          }
          if (!Array.isArray(targetSprint.columnAssignees)) {
            targetSprint.columnAssignees = [];
          }
          if (assignee && !targetSprint.columnAssignees.includes(assignee)) {
            targetSprint.columnAssignees.push(assignee);
          }

          sourceTickets.forEach((ticket) => {
            targetSprint.tickets.push({
              ...ticket,
              id: createId('sprint-ticket'),
            });
          });
        });

        return true;
      },
    });
    return;
  }

  if (trigger.dataset.action === 'remove-sprint-epic' && Number.isInteger(sprintIndex)) {
    const assignee = String(trigger.dataset.assignee || '').trim();
    const epicKey = String(trigger.dataset.epicKey || '').trim();
    const epicTicketIds = String(trigger.dataset.epicTicketIds || '')
      .split(',')
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    if (!assignee || !epicKey) return;

    updateState((state) => {
      const sprint = state.spData[sprintIndex];
      if (!sprint || !Array.isArray(sprint.tickets)) return;
      const idSet = new Set(epicTicketIds);
      sprint.tickets = sprint.tickets.filter((ticket) => {
        const ticketId = String(ticket?.id || '').trim();
        if (ticketId && idSet.has(ticketId)) {
          return false;
        }
        return !(getTicketAssigneeKey(ticket) === assignee && getTicketEpicKey(ticket) === epicKey);
      });
    });

    if (uiState.editingTicket && uiState.editingTicket.sprintIndex === sprintIndex) {
      uiState.editingTicket = null;
      render();
    }
    return;
  }

  if (trigger.dataset.action === 'cancel-create-sprint-ticket' && Number.isInteger(sprintIndex)) {
    uiState.creatingSprintTicket = null;
    render();
    return;
  }

  if (trigger.dataset.action === 'save-create-sprint-ticket' && Number.isInteger(sprintIndex)) {
    const modal = root.querySelector(`[data-form="sprint-ticket-create-modal"][data-sprint-index="${sprintIndex}"]`);
    if (!modal) return;
    const form = modal.querySelector('.ticket-edit-form');
    const formData = new FormData(form);
    const epicTitle = String(formData.get('epicTitle') || '').trim();
    const globalEpic = (getState().spEpics || []).find(epic => String(epic.title || '').trim() === epicTitle);
    const epicUrl = normalizeUrl(String(formData.get('epicUrl') || '')) || normalizeUrl(globalEpic?.url || '');
    const status = String(formData.get('status') || 'todo').trim() || 'todo';
    const priority = String(formData.get('priority') || 'Medium').trim() || 'Medium';
    const assignee = String(formData.get('assignee') || '').trim();
    const ticketRows = Array.from(modal.querySelectorAll('[data-ticket-link-row]'));
    const ticketsToCreate = ticketRows
      .map((row) => {
        const jiraIdInput = row.querySelector('input[name="jiraId"]');
        const jiraUrlInput = row.querySelector('input[name="jiraUrl"]');
        const storyPointsInput = row.querySelector('input[name="storyPoints"]');
        const notesInput = row.querySelector('input[name="notes"]');
        const jiraId = jiraIdInput instanceof HTMLInputElement ? String(jiraIdInput.value || '').trim() : '';
        const jiraUrlRaw = jiraUrlInput instanceof HTMLInputElement ? String(jiraUrlInput.value || '') : '';
        const notes = notesInput instanceof HTMLInputElement ? String(notesInput.value || '').trim() : '';
        if (!jiraId) return null;
        return {
          jiraId,
          jiraUrl: normalizeUrl(jiraUrlRaw),
          storyPoints: normalizeStoryPoints(storyPointsInput instanceof HTMLInputElement ? storyPointsInput.value : ''),
          notes,
        };
      })
      .filter(Boolean);

    if (!ticketsToCreate.length) return;

    updateState((state) => {
      const sprint = state.spData[sprintIndex];
      if (!sprint) return;
      ticketsToCreate.forEach((ticketSeed) => {
        sprint.tickets.push({
          id: createId('sprint-ticket'),
          title: ticketSeed.jiraId,
          jiraId: ticketSeed.jiraId,
          epicId: '',
          jiraUrl: ticketSeed.jiraUrl,
          epicUrl,
          epicTitle,
          desc: ticketSeed.notes,
          notes: ticketSeed.notes,
          assignee,
          storyPoints: ticketSeed.storyPoints,
          priority,
          status,
        });
      });
    });

    uiState.creatingSprintTicket = null;
    render();
    return;
  }

  if (trigger.dataset.action === 'remove-sprint-ticket' && Number.isInteger(sprintIndex) && Number.isInteger(ticketIndex)) {
    updateState((state) => {
      state.spData[sprintIndex].tickets.splice(ticketIndex, 1);
    });
  }

  if (trigger.dataset.action === 'toggle-delete-sprint-ticket-in-form' && Number.isInteger(sprintIndex) && Number.isInteger(ticketIndex)) {
    const modal = root.querySelector(`[data-form="sprint-ticket-edit-modal"][data-sprint-index="${sprintIndex}"][data-ticket-index="${ticketIndex}"]`);
    const form = modal?.querySelector('.ticket-edit-form');
    const pendingDeleteInput = form?.querySelector('input[name="pendingDelete"]');
    if (!(pendingDeleteInput instanceof HTMLInputElement)) return;

    const shouldDelete = pendingDeleteInput.value !== '1';
    pendingDeleteInput.value = shouldDelete ? '1' : '0';
    trigger.classList.toggle('is-pending-delete', shouldDelete);
    trigger.setAttribute('title', shouldDelete ? 'Delete pending (Save to apply)' : 'Delete ticket');
    return;
  }

  if (trigger.dataset.action === 'edit-sprint-ticket' && Number.isInteger(sprintIndex) && Number.isInteger(ticketIndex)) {
    uiState.editingTicket = { sprintIndex, ticketIndex };
    render();
    return;
  }

  if (trigger.dataset.action === 'cancel-edit-sprint-ticket' && Number.isInteger(sprintIndex) && Number.isInteger(ticketIndex)) {
    uiState.editingTicket = null;
    render();
  }

  if (trigger.dataset.action === 'save-edit-sprint-ticket' && Number.isInteger(sprintIndex) && Number.isInteger(ticketIndex)) {
    const modal = root.querySelector(`[data-form="sprint-ticket-edit-modal"][data-sprint-index="${sprintIndex}"][data-ticket-index="${ticketIndex}"]`);
    if (!modal) return;
    const form = modal.querySelector('.ticket-edit-form');
    const pendingDeleteInput = form?.querySelector('input[name="pendingDelete"]');
    const shouldDelete = pendingDeleteInput instanceof HTMLInputElement && pendingDeleteInput.value === '1';
    if (shouldDelete) {
      updateState((state) => {
        state.spData[sprintIndex].tickets.splice(ticketIndex, 1);
      });
      uiState.editingTicket = null;
      render();
      return;
    }

    const formData = new FormData(form);
    const jiraId = String(formData.get('jiraId') || '').trim();
    if (!jiraId) return;
    const mainStoryPointsInput = form?.querySelector('input[name="mainStoryPoints"]');
    const mainNotesInput = form?.querySelector('input[name="mainNotes"]');
    const epicTitle = String(formData.get('epicTitle') || '').trim();
    const globalEpic = (getState().spEpics || []).find(epic => String(epic.title || '').trim() === epicTitle);
    const epicUrl = normalizeUrl(String(formData.get('epicUrl') || '')) || normalizeUrl(globalEpic?.url || '');
    updateState((state) => {
      const sprint = state.spData[sprintIndex];
      const ticket = sprint?.tickets?.[ticketIndex];
      if (!ticket || !sprint || !Array.isArray(sprint.tickets)) return;

      // Snapshot the original epic group for deterministic replace-on-save behavior.
      const originalAssigneeKey = getTicketAssigneeKey(ticket);
      const originalEpicKey = getTicketEpicKey(ticket);
      const originalGroupIndexes = sprint.tickets
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => getTicketAssigneeKey(item) === originalAssigneeKey && getTicketEpicKey(item) === originalEpicKey)
        .map(({ index }) => index)
        .sort((a, b) => a - b);
      if (!originalGroupIndexes.length) return;

      const desiredAssignee = String(formData.get('assignee') || '').trim();
      const desiredStatus = String(formData.get('status') || 'todo').trim() || 'todo';
      const desiredPriority = String(formData.get('priority') || 'Medium').trim() || 'Medium';
      const mainJiraUrl = normalizeUrl(String(formData.get('jiraUrl') || ''));
      const mainStoryPoints = normalizeStoryPoints(mainStoryPointsInput instanceof HTMLInputElement ? mainStoryPointsInput.value : '');
      const notes = mainNotesInput instanceof HTMLInputElement ? String(mainNotesInput.value || '').trim() : '';

      const oldTicketById = new Map(
        sprint.tickets
          .map((item) => [String(item?.id || '').trim(), item])
          .filter(([id]) => Boolean(id))
      );
      const idsReferencedByForm = new Set([String(ticket?.id || '').trim()].filter(Boolean));

      const desiredRows = [
        {
          isMain: true,
          jiraId,
          jiraUrl: mainJiraUrl,
          storyPoints: mainStoryPoints,
          notes,
          existingTicketId: String(ticket?.id || '').trim(),
        },
      ];

      const extraRows = Array.from(modal.querySelectorAll('[data-ticket-link-row]'));
      extraRows.forEach((row) => {
        const idInput = row.querySelector('input[name="jiraId"]');
        const existingIdInput = row.querySelector('input[name="existingTicketId"]');
        const urlInput = row.querySelector('input[name="jiraUrl"]');
        const storyPointsInput = row.querySelector('input[name="storyPoints"]');
        const notesInput = row.querySelector('input[name="notes"]');
        const extraId = idInput instanceof HTMLInputElement ? String(idInput.value || '').trim() : '';
        if (!extraId || extraId === jiraId) return;
        const extraNotes = notesInput instanceof HTMLInputElement ? String(notesInput.value || '').trim() : '';
        const existingTicketId = existingIdInput instanceof HTMLInputElement
          ? String(existingIdInput.value || '').trim()
          : '';
        if (existingTicketId) {
          idsReferencedByForm.add(existingTicketId);
        }
        desiredRows.push({
          isMain: false,
          jiraId: extraId,
          jiraUrl: urlInput instanceof HTMLInputElement ? normalizeUrl(String(urlInput.value || '')) : '',
          storyPoints: normalizeStoryPoints(storyPointsInput instanceof HTMLInputElement ? storyPointsInput.value : ''),
          notes: extraNotes,
          existingTicketId,
        });
      });

      const rebuiltGroup = desiredRows.map((row) => {
        const reused = row.existingTicketId ? oldTicketById.get(row.existingTicketId) : null;
        const ticketId = row.existingTicketId || (row.isMain ? String(ticket?.id || '').trim() : '') || createId('sprint-ticket');
        return {
          ...(reused || {}),
          id: ticketId,
          title: row.jiraId,
          jiraId: row.jiraId,
          epicId: '',
          jiraUrl: row.jiraUrl,
          epicUrl,
          epicTitle,
          desc: row.notes,
          notes: row.notes,
          assignee: desiredAssignee,
          storyPoints: row.storyPoints,
          priority: desiredPriority,
          status: desiredStatus,
        };
      });

      const desiredEpicKey = (epicTitle || epicUrl || `ticket:${String(ticket?.id || '').trim()}`).trim();
      const removalIndexes = sprint.tickets
        .map((item, index) => ({ item, index }))
        .filter(({ item, index }) => {
          if (originalGroupIndexes.includes(index)) return true;
          const itemId = String(item?.id || '').trim();
          if (itemId && idsReferencedByForm.has(itemId)) return true;
          const itemAssigneeKey = getTicketAssigneeKey(item);
          const itemEpicKey = getTicketEpicKey(item);
          const matchesOriginalGroup = itemAssigneeKey === originalAssigneeKey && itemEpicKey === originalEpicKey;
          const matchesDesiredGroup = itemAssigneeKey === (desiredAssignee || 'Unassigned') && itemEpicKey === desiredEpicKey;
          return matchesOriginalGroup || matchesDesiredGroup;
        })
        .map(({ index }) => index)
        .sort((a, b) => a - b);

      const insertAt = removalIndexes.length ? removalIndexes[0] : originalGroupIndexes[0];
      const removalIndexSet = new Set(removalIndexes);
      sprint.tickets = sprint.tickets.filter((_, index) => !removalIndexSet.has(index));
      sprint.tickets.splice(insertAt, 0, ...rebuiltGroup);
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

function updateLinkPreview(scope, fieldName, value) {
  if (!(scope instanceof Element)) return;
  const preview = scope.querySelector(`[data-link-preview="${fieldName}"]`);
  if (!(preview instanceof HTMLElement)) return;
  preview.textContent = String(value || '').trim() || 'Sem link';
}

function openLinkInputPopup({ title, initialValue, onConfirm }) {
  const overlay = document.createElement('div');
  overlay.className = 'link-input-popup-overlay';
  overlay.innerHTML = `
    <div class="link-input-popup" role="dialog" aria-modal="true" aria-label="${String(title || 'Link input')}">
      <h3>${String(title || 'Link')}</h3>
      <input class="field-input" type="text" value="" placeholder="https://..." />
      <div class="link-input-popup__actions">
        <button class="button button--secondary button--sm" type="button" data-popup-action="cancel">Cancel</button>
        <button class="button button--primary button--sm" type="button" data-popup-action="save">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const card = overlay.querySelector('.link-input-popup');
  const input = overlay.querySelector('input');
  const cancelBtn = overlay.querySelector('[data-popup-action="cancel"]');
  const saveBtn = overlay.querySelector('[data-popup-action="save"]');

  if (!(card instanceof HTMLElement) || !(input instanceof HTMLInputElement)) {
    overlay.remove();
    return;
  }
  input.value = String(initialValue || '');

  const close = () => {
    overlay.remove();
  };

  const submit = () => {
    if (typeof onConfirm === 'function') {
      const ok = onConfirm(input.value);
      if (ok === false) return;
    }
    close();
  };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  cancelBtn?.addEventListener('click', close);
  saveBtn?.addEventListener('click', submit);

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });

  setTimeout(() => {
    input.focus();
    input.select();
  }, 0);
}

function openSelectPopup({ title, options, initialValue, onConfirm }) {
  const safeOptions = Array.isArray(options) ? options : [];
  const overlay = document.createElement('div');
  overlay.className = 'link-input-popup-overlay';
  overlay.innerHTML = `
    <div class="link-input-popup" role="dialog" aria-modal="true" aria-label="${String(title || 'Select option')}">
      <h3>${String(title || 'Select')}</h3>
      <select class="field-input"></select>
      <div class="link-input-popup__actions">
        <button class="button button--secondary button--sm" type="button" data-popup-action="cancel">Cancel</button>
        <button class="button button--primary button--sm" type="button" data-popup-action="save">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const select = overlay.querySelector('select');
  const cancelBtn = overlay.querySelector('[data-popup-action="cancel"]');
  const saveBtn = overlay.querySelector('[data-popup-action="save"]');
  if (!(select instanceof HTMLSelectElement)) {
    overlay.remove();
    return;
  }

  safeOptions.forEach((option, index) => {
    const optionNode = document.createElement('option');
    optionNode.value = String(option?.value ?? index);
    optionNode.textContent = String(option?.label ?? option?.value ?? 'Option');
    select.appendChild(optionNode);
  });
  if (typeof initialValue !== 'undefined') {
    select.value = String(initialValue);
  }

  const close = () => {
    overlay.remove();
  };

  const submit = () => {
    if (typeof onConfirm === 'function') {
      const ok = onConfirm(select.value);
      if (ok === false) return;
    }
    close();
  };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  cancelBtn?.addEventListener('click', close);
  saveBtn?.addEventListener('click', submit);
  select.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });

  setTimeout(() => {
    select.focus();
  }, 0);
}

function syncStatusSelectThemes(root) {
  if (!(root instanceof Element)) return;
  root.querySelectorAll('.status-select').forEach((select) => {
    if (select instanceof HTMLSelectElement) {
      select.dataset.status = String(select.value || '').trim().toLowerCase();
    }
  });
}

function clearSprintDragClasses(root) {
  if (!(root instanceof Element)) return;
  root.querySelectorAll('.sprint-ticket-preview__list-item.is-drag-over').forEach((node) => {
    node.classList.remove('is-drag-over');
  });
  root.querySelectorAll('.sprint-ticket-preview__list-item.is-dragging').forEach((node) => {
    node.classList.remove('is-dragging');
  });
  root.querySelectorAll('.sprint-ticket-card.is-epic-drag-over').forEach((node) => {
    node.classList.remove('is-epic-drag-over');
  });
  root.querySelectorAll('.sprint-ticket-card.is-epic-dragging').forEach((node) => {
    node.classList.remove('is-epic-dragging');
  });
}

function resetSprintDragState(dragState) {
  dragState.type = '';
  dragState.sprintIndex = null;
  dragState.ticketIndex = null;
  dragState.assignee = '';
  dragState.epicKey = '';
}

function getTicketAssigneeKey(ticket) {
  const raw = String(ticket?.assignee || '').trim();
  return raw || 'Unassigned';
}

function getTicketEpicKey(ticket) {
  const epicTitle = String(ticket?.epicTitle || '').trim();
  const epicUrl = String(ticket?.epicUrl || '').trim();
  const ticketId = String(ticket?.id || '').trim();
  return epicTitle || epicUrl || `ticket:${ticketId}`;
}

function getRelatedEpicTicketsForEdit(sprint, mainTicketIndex) {
  if (!sprint || !Array.isArray(sprint.tickets) || !Number.isInteger(mainTicketIndex)) {
    return [];
  }

  const mainTicket = sprint.tickets[mainTicketIndex];
  if (!mainTicket) {
    return [];
  }

  const assigneeKey = getTicketAssigneeKey(mainTicket);
  const epicKey = getTicketEpicKey(mainTicket);

  return sprint.tickets
    .map((ticket, ticketIndex) => ({ ticket, ticketIndex }))
    .filter(({ ticket, ticketIndex }) => {
      if (ticketIndex === mainTicketIndex) return false;
      return getTicketAssigneeKey(ticket) === assigneeKey && getTicketEpicKey(ticket) === epicKey;
    });
}

function reorderEpicGroupInSprintTickets(tickets, assignee, sourceEpicKey, targetEpicKey, placeAfter) {
  if (!Array.isArray(tickets) || !assignee || !sourceEpicKey || !targetEpicKey) return;

  const assigneeIndexes = [];
  const assigneeTickets = [];
  tickets.forEach((ticket, index) => {
    if (getTicketAssigneeKey(ticket) !== assignee) return;
    assigneeIndexes.push(index);
    assigneeTickets.push(ticket);
  });
  if (!assigneeTickets.length) return;

  const epicGroups = [];
  const groupMap = new Map();
  assigneeTickets.forEach((ticket) => {
    const key = getTicketEpicKey(ticket);
    if (!groupMap.has(key)) {
      const group = { key, tickets: [] };
      groupMap.set(key, group);
      epicGroups.push(group);
    }
    groupMap.get(key).tickets.push(ticket);
  });

  const sourceIndex = epicGroups.findIndex((group) => group.key === sourceEpicKey);
  const targetIndex = epicGroups.findIndex((group) => group.key === targetEpicKey);
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return;

  const [movedGroup] = epicGroups.splice(sourceIndex, 1);
  let insertIndex = placeAfter ? targetIndex + 1 : targetIndex;
  if (sourceIndex < targetIndex) {
    insertIndex -= 1;
  }
  insertIndex = Math.max(0, Math.min(insertIndex, epicGroups.length));
  epicGroups.splice(insertIndex, 0, movedGroup);

  const reorderedAssigneeTickets = epicGroups.flatMap((group) => group.tickets);
  assigneeIndexes.forEach((ticketIndex, position) => {
    tickets[ticketIndex] = reorderedAssigneeTickets[position];
  });
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

  const selection = window.getSelection();
  const hasSelectionInEditable = selection && selection.rangeCount > 0 &&
    editable.contains(selection.anchorNode) && !selection.isCollapsed;

  if (!hasSelectionInEditable && editable.textContent.trim().length > 0) {
    const range = document.createRange();
    range.selectNodeContents(editable);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  if (/^#[0-9a-f]{6}$/i.test(normalizedColor)) {
    document.execCommand('foreColor', false, normalizedColor);
  } else {
    document.execCommand('removeFormat');
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

  if (action === 'update-velocity-sprint' || action === 'update-velocity-metric' || action === 'update-velocity-distribution' || action === 'toggle-velocity-sprint-completed') {
    const id = field.dataset.sprintId;
    updateState((draft) => {
      const sprint = (draft.velocityReportSprints || []).find((item) => item.id === id);
      if (!sprint) return;
      if (action === 'toggle-velocity-sprint-completed') {
        sprint.completed = field.checked;
      } else if (action === 'update-velocity-sprint') {
        sprint[field.dataset.field] = field.value;
      } else if (action === 'update-velocity-metric') {
        sprint[field.dataset.field] = field.value === '' ? '' : Math.max(0, Number(field.value) || 0);
      } else if (action === 'update-velocity-distribution') {
        sprint.distribution = sprint.distribution || {};
        sprint.distribution[field.dataset.field] = field.value === '' ? '' : Math.max(0, Number(field.value) || 0);
      }
    });
    return;
  }


  if (action === 'update-setting') {
    const value = Math.max(1, Number(field.value) || 1);
    updateState((state) => {
      state.settings[field.dataset.field] = value;
      state.projects = state.projects.map((project) => ({
        ...project,
        members: (project.members || []).map((member) => normalizeProjectMember(member, state.settings.monthlyHours, Number(state.settings.hoursPerDay) || 8)),
      }));
    });
    return;
  }

  if (action === 'update-working-days') {
    if (!field.reportValidity()) return;
    const days = Math.max(1, Number(field.value) || 1);
    updateState((state) => {
      state.settings.monthlyHours = days * (Number(state.settings.hoursPerDay) || 8);
      state.projects = state.projects.map((project) => ({
        ...project,
        members: (project.members || []).map((member) => normalizeProjectMember(member, state.settings.monthlyHours, Number(state.settings.hoursPerDay) || 8)),
      }));
    });
    return;
  }

  if (action === 'update-invoicing-project-field' && Number.isInteger(projectIndex)) {
    const key = field.dataset.field;
    if (!['name', 'tag', 'color'].includes(key) || !field.reportValidity()) return;
    const value = String(field.value || '').trim();
    if (key === 'name' && !value) return;
    updateState((state) => { state.projects[projectIndex][key] = value; });
    return;
  }

  if (action === 'update-project-member-text' && Number.isInteger(projectIndex) && Number.isInteger(memberIndex)) {
    if (!field.reportValidity() || !String(field.value || '').trim()) return;
    updateState((state) => {
      state.projects[projectIndex].members[memberIndex][field.dataset.field] = String(field.value || '');
    });
    return;
  }

  if (action === 'update-project-member-number' && Number.isInteger(projectIndex) && Number.isInteger(memberIndex)) {
    if (!field.reportValidity()) return;
    updateState((state) => {
      const member = state.projects[projectIndex].members[memberIndex];
      member[field.dataset.field] = Math.max(0, Number(field.value) || 0);
      Object.assign(member, normalizeProjectMember(member, Number(state.settings.monthlyHours) || 176, Number(state.settings.hoursPerDay) || 8));
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
    if (field instanceof HTMLSelectElement) {
      field.dataset.status = String(field.value || 'inprogress').trim().toLowerCase();
    }
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

  if (action === 'update-milestone-field' && Number.isInteger(milestoneIndex)) {
    const key = field.dataset.field;
    if (!['name', 'status', 'assignee', 'url'].includes(key) || !field.reportValidity()) return;
    const value = String(field.value || '').trim();
    if (key === 'name' && !value) return;
    updateState((state) => {
      state.msData[milestoneIndex][key] = value;
    });
    return;
  }

  if (action === 'update-milestone-task-name' && Number.isInteger(milestoneIndex) && Number.isInteger(taskIndex)) {
    updateState((state) => {
      state.msData[milestoneIndex].tasks[taskIndex].name = String(field.value || '');
    });
    return;
  }

  if (action === 'update-milestone-task-status' && Number.isInteger(milestoneIndex) && Number.isInteger(taskIndex)) {
    if (field instanceof HTMLSelectElement) {
      field.dataset.status = String(field.value || 'notstarted').trim().toLowerCase();
    }
    updateState((state) => {
      state.msData[milestoneIndex].tasks[taskIndex].status = String(field.value || 'notstarted');
    });
    return;
  }

  if (action === 'update-rpde-status' && Number.isInteger(ticketIndex)) {
    if (field instanceof HTMLSelectElement) {
      field.dataset.status = String(field.value || 'todo').trim().toLowerCase();
    }
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
    if (field instanceof HTMLSelectElement) {
      field.dataset.status = String(field.value || 'todo').trim().toLowerCase();
    }
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

function normalizeUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  return /^https?:\/\//i.test(value) ? value : '';
}

function normalizeStoryPoints(rawValue) {
  const value = String(rawValue ?? '').trim();
  if (!value) return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) return null;
  return parsed;
}