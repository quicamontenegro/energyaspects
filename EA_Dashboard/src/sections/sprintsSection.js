import { escapeHtml, formatStatus, initials } from '../utils/format.js';

const TICKET_STATUSES = ['todo', 'inprogress', 'inreview', 'testing', 'done', 'blocked', 'onhold', 'deployed'];

const STATUS_COLOR = {
  todo: '#9ca3af',
  inprogress: '#4338ca',
  inreview: '#0891b2',
  testing: '#f59e0b',
  done: '#16a34a',
  blocked: '#dc2626',
  onhold: '#d97706',
  deployed: '#7c3aed',
};

export function renderSprintsSection(state, uiState) {
  const sprintMembers = getSprintMembers(state.spTeamMembers);
  const sprints = state.spData || [];
  const sprintEntries = sprints
    .map((sprint, index) => ({ sprint, index }))
    .sort((left, right) => {
      const leftEnd = parseSprintDate(left.sprint?.endDate);
      const rightEnd = parseSprintDate(right.sprint?.endDate);
      
      // Primary: sort by end date (most recent first)
      if (leftEnd && rightEnd && leftEnd.getTime() !== rightEnd.getTime()) {
        return rightEnd.getTime() - leftEnd.getTime();
      }
      
      // Secondary: if end dates are equal, sort by start date (most recent first)
      const leftStart = parseSprintDate(left.sprint?.startDate);
      const rightStart = parseSprintDate(right.sprint?.startDate);
      if (leftStart && rightStart && leftStart.getTime() !== rightStart.getTime()) {
        return rightStart.getTime() - leftStart.getTime();
      }
      
      // Tertiary: if dates are equal, sort by creation date (most recent first)
      const leftCreated = parseSprintDate(left.sprint?.createdAt);
      const rightCreated = parseSprintDate(right.sprint?.createdAt);
      if (leftCreated && rightCreated) {
        return rightCreated.getTime() - leftCreated.getTime();
      }
      
      return 0;
    });
  
  const totalTickets = sprints.reduce((sum, sprint) => sum + (sprint.tickets || []).length, 0);

  return `
    <section class="panel-stack sprint-panel-stack">
      <section class="board-card sprint-members-card">
        <div class="section-header-inline">
          <div>
            <p class="section-kicker">Team Members</p>
            <h2>Sprint members</h2>
          </div>
          <div class="sprint-members-count">${sprintMembers.length} members</div>
        </div>
        <div class="sprint-members-grid">
          ${sprintMembers.length ? sprintMembers.map((member, memberIndex) => `
            <article class="sprint-member-item">
              <div class="av-sm" style="background: linear-gradient(135deg, var(--accent), var(--indigo));">${initials(member.name)}</div>
              <div class="sprint-member-item__meta">
                <h3>${escapeHtml(member.name)}</h3>
                <p>${escapeHtml(member.role || 'No role')}</p>
              </div>
              <button class="btn-icon" type="button" data-action="remove-sprint-member" data-member-index="${memberIndex}" title="Delete member">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h12zM10 11v6M14 11v6"/></svg>
              </button>
            </article>
          `).join('') : '<article class="empty-card"><h3>No members yet</h3><p>Add a member inline below.</p></article>'}
        </div>
        <div class="sprint-members-form" data-form="sprint-member-create">
          <input name="name" class="field-input field-input--sm" type="text" placeholder="Member name" />
          <input name="role" class="field-input field-input--sm" type="text" placeholder="Role" />
          <button class="button button--secondary button--sm" type="button" data-action="add-sprint-member">Add member</button>
        </div>
      </section>

      <section class="board-card sprint-backlog-card">
        <div class="section-header-inline">
          <div>
            <p class="section-kicker">Sprint Plans</p>
            <h2>Sprint backlog</h2>
          </div>
          <div class="sprint-backlog-meta">
            <span class="sprint-backlog-kpi">${sprints.length} sprints</span>
            <span class="sprint-backlog-kpi">${totalTickets} tickets</span>
          </div>
        </div>
        <div class="sprint-create-form" data-form="sprint-create">
          <input name="name" class="field-input field-input--sm" type="text" placeholder="Sprint name" />
          <input name="startDate" class="field-input field-input--sm" type="date" />
          <input name="endDate" class="field-input field-input--sm" type="date" />
          <button class="button button--secondary button--sm" type="button" data-action="add-sprint-plan">Add sprint</button>
        </div>
        <div class="stack-list sprint-list">
          ${sprintEntries.length ? sprintEntries.map(({ sprint, index }) => renderSprintCard(index, sprint, getSprintMembers(state.spTeamMembers), uiState)).join('') : '<article class="empty-card"><h3>No sprint plans</h3><p>Create a sprint inline and start assigning tickets.</p></article>'}
        </div>
      </section>
    </section>
  `;
}

function renderSprintCard(sprintIndex, sprint, sprintMembers, uiState) {
  const grouped = groupSprintTicketsByAssignee(sprint.tickets || [], sprintMembers);
  const visibleAssignees = Object.keys(grouped).filter((assignee) => grouped[assignee].length > 0);
  const dateRange = formatSprintDateRange(sprint.startDate, sprint.endDate);
  const isEditingSprint = uiState.editingSprintIndex === sprintIndex;

  return `
    <article class="sprint-card">
      <div class="sprint-card__top">
        <div class="sprint-card__head">
          <h3 class="sprint-card__title">${escapeHtml(sprint.name || 'Untitled sprint')}</h3>
          <div class="sprint-card__actions">
            <button class="btn-icon btn-icon--edit" type="button" data-action="edit-sprint-plan" data-sprint-index="${sprintIndex}" title="Edit sprint">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon" type="button" data-action="remove-sprint-plan" data-sprint-index="${sprintIndex}" title="Delete sprint">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h12zM10 11v6M14 11v6"/></svg>
            </button>
          </div>
        </div>
        <div class="sprint-card__meta">
          ${dateRange ? `<span class="sprint-date-range">${escapeHtml(dateRange)}</span>` : ''}
          <span class="sprint-badge">${(sprint.tickets || []).length} tickets</span>
        </div>
      </div>

      ${isEditingSprint ? renderSprintEditForm(sprintIndex, sprint) : ''}

      <div class="sprint-board">
        ${visibleAssignees.length
          ? visibleAssignees.map((assignee) => renderAssigneeColumn(sprintIndex, assignee, grouped[assignee] || [], sprintMembers, uiState)).join('')
          : '<div class="sprint-board__empty">No tickets in this sprint yet.</div>'}
      </div>

      <div class="sprint-add-ticket">
        <div class="sprint-add-form" data-form="sprint-ticket-create" data-sprint-index="${sprintIndex}">
          <input name="title" class="field-input field-input--sm" type="text" placeholder="Add ticket..." />
          <input name="jiraId" class="field-input field-input--sm" type="text" placeholder="Jira ID" />
          <input name="jiraUrl" class="field-input field-input--sm" type="url" placeholder="Jira URL" />
          <select name="status" class="field-input field-input--sm">${TICKET_STATUSES.map((status) => `<option value="${status}">${formatStatus(status)}</option>`).join('')}</select>
          <textarea name="notes" class="field-input field-input--sm sprint-ticket-notes-input" placeholder="Notes"></textarea>
          <button class="button button--secondary button--sm" type="button" data-action="add-sprint-ticket" data-sprint-index="${sprintIndex}">
            Add
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderAssigneeColumn(sprintIndex, assignee, items, sprintMembers, uiState) {
  const member = sprintMembers.find((m) => m.name === assignee);
  const memberInitials = member ? initials(member.name) : '?';

  return `
    <section class="sprint-column" data-assignee="${escapeHtml(assignee)}">
      <header class="sprint-column__head">
        <div class="av-sm" style="background: linear-gradient(135deg, var(--accent), var(--indigo));">${memberInitials}</div>
        <span class="sprint-column__title">${escapeHtml(assignee || 'Unassigned')}</span>
        <span class="sprint-column__count">${items.length}</span>
      </header>
      <div class="sprint-column__body">
        ${items.length ? items.map(({ ticket, ticketIndex }) => renderSprintTicket(sprintIndex, ticketIndex, ticket, sprintMembers, uiState)).join('') : '<div class="sprint-column__empty">No tickets assigned</div>'}
      </div>
    </section>
  `;
}

function renderSprintColumn(sprintIndex, status, items, sprintMembers, uiState) {
  const statusColor = STATUS_COLOR[status] || '#64748b';

  return `
    <section class="sprint-column" style="--status-color: ${statusColor};">
      <header class="sprint-column__head">
        <div class="status-dot" style="background:${statusColor};"></div>
        <span class="sprint-column__title">${formatStatus(status)}</span>
        <span class="sprint-column__count">${items.length}</span>
      </header>
      <div class="sprint-column__body">
        ${items.length ? items.map(({ ticket, ticketIndex }) => renderSprintTicket(sprintIndex, ticketIndex, ticket, statusColor, sprintMembers, uiState)).join('') : '<div class="sprint-column__empty">No tickets</div>'}
      </div>
    </section>
  `;
}

function renderSprintTicket(sprintIndex, ticketIndex, ticket, sprintMembers, uiState) {
  const jiraHref = resolveJiraHref(ticket);
  const statusColor = STATUS_COLOR[ticket.status] || '#64748b';

  return `
    <article class="sprint-ticket-card" style="--ticket-status-color:${statusColor};">
      <div class="sprint-ticket-card__top">
        ${jiraHref
          ? `<a class="sprint-ticket-id" href="${escapeHtml(jiraHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(ticket.jiraId || 'Jira')}</a>`
          : `<span class="sprint-ticket-id">${escapeHtml(ticket.jiraId || 'No Jira')}</span>`}
        <div class="sprint-ticket-actions">
          <button class="btn-icon btn-icon--edit" type="button" data-action="edit-sprint-ticket" data-sprint-index="${sprintIndex}" data-ticket-index="${ticketIndex}" title="Edit ticket">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon" type="button" data-action="remove-sprint-ticket" data-sprint-index="${sprintIndex}" data-ticket-index="${ticketIndex}" title="Delete ticket">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 6l-1.4 14H6.4L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
        </div>
      </div>
      <p class="sprint-ticket-title">${escapeHtml(ticket.title || 'Untitled')}</p>
      <div class="sprint-ticket-card__meta">
        <select class="status-select" name="status" data-action="update-sprint-ticket-status" data-sprint-index="${sprintIndex}" data-ticket-index="${ticketIndex}">
          ${TICKET_STATUSES.map((status) => `<option value="${status}" ${ticket.status === status ? 'selected' : ''}>${formatStatus(status)}</option>`).join('')}
        </select>
      </div>
    </article>
  `;
}

function resolveJiraHref(ticket) {
  const directUrl = String(ticket?.jiraUrl || '').trim();
  if (/^https?:\/\//i.test(directUrl)) {
    return directUrl;
  }

  const idAsUrl = String(ticket?.jiraId || '').trim();
  if (/^https?:\/\//i.test(idAsUrl)) {
    return idAsUrl;
  }

  return '';
}

function groupSprintTicketsByAssignee(tickets, sprintMembers) {
  const grouped = {};
  
  // Initialize with all team members
  sprintMembers.forEach((member) => {
    grouped[member.name] = [];
  });
  
  // Add unassigned bucket
  grouped['Unassigned'] = [];

  tickets.forEach((ticket, ticketIndex) => {
    const assignee = ticket?.assignee?.trim() || '';
    const key = assignee && grouped.hasOwnProperty(assignee) ? assignee : 'Unassigned';
    grouped[key].push({ ticket, ticketIndex });
  });

  // Remove empty members to avoid clutter (except unassigned if it has items)
  Object.keys(grouped).forEach((key) => {
    if (key !== 'Unassigned' && grouped[key].length === 0) {
      delete grouped[key];
    }
  });

  return grouped;
}

function renderSprintEditForm(sprintIndex, sprint) {
  return `
    <div class="sprint-edit-form" data-form="sprint-edit" data-sprint-index="${sprintIndex}">
      <input name="name" class="field-input field-input--sm" type="text" value="${escapeHtml(sprint.name || '')}" placeholder="Sprint name" />
      <input name="startDate" class="field-input field-input--sm" type="date" value="${escapeHtml(normalizeSprintDateInput(sprint.startDate))}" />
      <input name="endDate" class="field-input field-input--sm" type="date" value="${escapeHtml(normalizeSprintDateInput(sprint.endDate))}" />
      <button class="button button--secondary button--sm" type="button" data-action="cancel-edit-sprint-plan" data-sprint-index="${sprintIndex}">Cancel</button>
      <button class="button button--primary button--sm" type="button" data-action="save-edit-sprint-plan" data-sprint-index="${sprintIndex}">Save</button>
    </div>
  `;
}

function normalizeSprintDateInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = parseSprintDate(raw);
  if (!date) return '';
  return date.toISOString().slice(0, 10);
}

function parseSprintDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatSprintDateRange(startDate, endDate) {
  const start = formatSprintDate(startDate);
  const end = formatSprintDate(endDate);
  if (start && end) return `${start} - ${end}`;
  return start || end || '';
}

function formatSprintDate(value) {
  const date = parseSprintDate(value);
  if (!date) return '';
  return date.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
}

function groupSprintTicketsByStatus(tickets) {
  const grouped = Object.fromEntries(TICKET_STATUSES.map((status) => [status, []]));

  tickets.forEach((ticket, ticketIndex) => {
    const status = TICKET_STATUSES.includes(ticket?.status) ? ticket.status : 'todo';
    grouped[status].push({ ticket, ticketIndex });
  });

  return grouped;
}

export function getSprintMembers(rawMembers) {
  if (Array.isArray(rawMembers)) {
    return rawMembers;
  }

  if (!rawMembers || typeof rawMembers !== 'object') {
    return [];
  }

  const pool = [...(rawMembers.rp || []), ...(rawMembers.de || [])];
  const seen = new Set();
  return pool.filter((member) => {
    const key = String(member?.name || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function renderGlobalTicketEditModal(sprintIndex, ticketIndex, ticket, sprintMembers) {
  return `
    <article class="sprint-ticket-edit-modal" data-form="sprint-ticket-edit-modal" data-sprint-index="${sprintIndex}" data-ticket-index="${ticketIndex}">
      <div class="modal-overlay"></div>
      <div class="modal-card">
        <div class="modal-header">
          <h2>Edit Ticket</h2>
          <button class="btn-icon" type="button" data-action="cancel-edit-sprint-ticket" data-sprint-index="${sprintIndex}" data-ticket-index="${ticketIndex}" title="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <form class="ticket-edit-form">
            <div class="form-group">
              <label>Title</label>
              <input class="field-input" name="title" type="text" value="${escapeHtml(ticket.title || '')}" placeholder="Ticket title" />
            </div>
            
            <div class="form-group">
              <label>Assignee</label>
              <select class="field-input" name="assignee">
                <option value="">Unassigned</option>
                ${sprintMembers.map((member) => `<option value="${escapeHtml(member.name)}" ${ticket.assignee === member.name ? 'selected' : ''}>${escapeHtml(member.name)}</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label>Status</label>
              <select class="field-input" name="status">
                ${TICKET_STATUSES.map((status) => `<option value="${status}" ${ticket.status === status ? 'selected' : ''}>${formatStatus(status)}</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label>Jira ID</label>
              <input class="field-input" name="jiraId" type="text" value="${escapeHtml(ticket.jiraId || '')}" placeholder="Jira ID" />
            </div>

            <div class="form-group">
              <label>Jira URL</label>
              <input class="field-input" name="jiraUrl" type="url" value="${escapeHtml(ticket.jiraUrl || '')}" placeholder="Jira URL" />
            </div>

            <div class="form-group">
              <label>Notes</label>
              <textarea class="field-input" name="notes" placeholder="Add notes...">${escapeHtml(ticket.notes || ticket.desc || '')}</textarea>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="button button--secondary" type="button" data-action="cancel-edit-sprint-ticket" data-sprint-index="${sprintIndex}" data-ticket-index="${ticketIndex}">Cancel</button>
          <button class="button button--primary" type="button" data-action="save-edit-sprint-ticket" data-sprint-index="${sprintIndex}" data-ticket-index="${ticketIndex}">Save</button>
        </div>
      </div>
    </article>
  `;
}