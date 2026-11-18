import { escapeHtml, formatStatus, initials } from '../utils/format.js';

const STATUS_OPTIONS = ['inprogress', 'completed', 'roadmap', 'blocked', 'onhold'];

const STATUS_COLOR = {
  inprogress: '#4338ca',
  completed:  '#16a34a',
  roadmap:    '#0891b2',
  blocked:    '#dc2626',
  onhold:     '#d97706',
};

const PRIORITY_COLOR = {
  High:  { bg: '#fee2e2', text: '#b91c1c' },
  Alta:  { bg: '#fee2e2', text: '#b91c1c' },
  Medium:{ bg: '#fef3c7', text: '#92400e' },
  Média: { bg: '#fef3c7', text: '#92400e' },
  Low:   { bg: '#dcfce7', text: '#166534' },
  Baixa: { bg: '#dcfce7', text: '#166534' },
};

export function renderDataExplorerSection(state, uiState) {
  // Sort meetings by date (most recent first)
  const sortedMeetings = [...(state.deMeetings || [])].sort((a, b) => {
    const dateA = new Date(a.date || a.createdAt || '1970-01-01').getTime();
    const dateB = new Date(b.date || b.createdAt || '1970-01-01').getTime();
    return dateB - dateA;
  });

  return `
    <section class="panel-stack">
      <section class="board-card">
        <div class="section-header-inline">
          <div>
            <p class="section-kicker">Meetings & Tasks</p>
            <h2>Meeting boards</h2>
          </div>
        </div>
        <div class="de-forms-bar">
          <form class="de-form--meeting-create" data-form="meeting-create">
            <div class="meeting-form__fields">
              <div class="form-group">
                <label class="form-label">Date</label>
                <input name="date" class="field-input" type="date" />
              </div>
              <div class="form-group">
                <label class="form-label">Meeting Name</label>
                <input name="name" class="field-input" type="text" placeholder="e.g., Sprint Planning, Daily Standup" />
              </div>
              <div class="form-group form-group--full">
                <label class="form-label">Notes (Optional)</label>
                <textarea name="notes" class="field-input" rows="2" placeholder="Add any relevant notes..."></textarea>
              </div>
            </div>
            <div class="meeting-form__footer">
              <button class="button button--primary" type="button" data-action="add-meeting">Create Meeting</button>
            </div>
          </form>
        </div>
        <div class="stack-list">
          ${sortedMeetings.length ? sortedMeetings.map((meeting) => renderMeetingBoard(meeting, getTasksForMeeting(state.deTasks || [], meeting), uiState, state.spTeamMembers || [])).join('') : renderEmptyBoard()}
        </div>
      </section>
    </section>
  `;
}

function getTasksForMeeting(tasks, meeting) {
  const meetingId = String(meeting?.id || '').trim();
  const meetingDate = String(meeting?.date || '').trim();
  const meetingName = String(meeting?.name || '').trim();
  return tasks.filter((task) => {
    const taskWeek = String(task?.week || '').trim();
    const taskMeetingId = String(task?.meetingId || '').trim();
    return taskMeetingId === meetingId || taskWeek === meetingId || taskWeek === meetingDate || taskWeek === meetingName;
  });
}

function renderMeetingBoard(meeting, tasks, uiState, teamMembers) {
  const meetingId = escapeHtml(meeting.id || '');
  const dateValue = escapeHtml(meeting.date || '');
  const nameValue = escapeHtml(meeting.name || '');
  const notesValue = escapeHtml(meeting.notes || '');
  const isEditing = uiState?.editingMeetingId === (meeting.id || '');

  return `
    <article class="week-board">
      <header class="week-board__header de-meeting-head">
        <div class="de-meeting-head__main">
          ${isEditing ? `
            <form class="de-form de-form--meeting de-form--meeting-edit" data-form="meeting-edit" data-meeting-id="${meetingId}">
              <input name="date" class="field-input field-input--sm" type="date" value="${dateValue}" />
              <input name="name" class="field-input field-input--sm" type="text" value="${nameValue}" placeholder="Meeting name" />
              <textarea name="notes" class="field-input field-input--sm" rows="2" placeholder="Notes">${notesValue}</textarea>
            </form>
          ` : `
            <div class="de-meeting-summary">
              <p class="de-meeting-summary__kicker">Meeting</p>
              <h3>${nameValue || 'Untitled meeting'}${dateValue ? ` · ${dateValue}` : ''}</h3>
              ${notesValue ? `<p class="de-meeting-summary__notes">${notesValue}</p>` : ''}
            </div>
          `}
        </div>
        <div class="de-meeting-actions">
          <span class="badge">${tasks.length} tasks</span>
          ${isEditing
            ? `<button class="button button--primary btn-xs" type="button" data-action="save-edit-meeting" data-meeting-id="${meetingId}">Save</button>
               <button class="button btn-xs" type="button" data-action="cancel-edit-meeting" data-meeting-id="${meetingId}">Cancel</button>`
            : `<button class="btn-icon btn-icon--edit" type="button" data-action="edit-meeting" data-meeting-id="${meetingId}" title="Edit meeting">
                 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
               </button>`}
          <button class="btn-icon btn-icon--danger" type="button" data-action="remove-meeting" data-meeting-id="${meetingId}" title="Delete meeting">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 6l-1.4 14H6.4L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
        </div>
      </header>
      <form class="de-form de-form--task" data-form="task-create" data-meeting-id="${meetingId}">
        <input name="name" class="field-input field-input--sm" type="text" placeholder="Task title" />
        <select name="assignee" class="field-input field-input--sm">
          <option value="">Select Assignee</option>
          ${(teamMembers || []).map((member) => `<option value="${escapeHtml(member.name)}">${escapeHtml(member.name)}</option>`).join('')}
        </select>
        <input name="jiraId" class="field-input field-input--sm" type="text" placeholder="JIRA ID" />
        <select name="status" class="field-input field-input--sm">
          <option value="inprogress" selected>In Progress</option>
          <option value="completed">Completed</option>
          <option value="roadmap">Roadmap</option>
          <option value="blocked">Blocked</option>
          <option value="onhold">On Hold</option>
        </select>
        <select name="priority" class="field-input field-input--sm"><option value="High">High</option><option value="Medium" selected>Medium</option><option value="Low">Low</option></select>
        <input name="notes" class="field-input field-input--sm" type="text" placeholder="Notes" />
        <button class="button button--primary button--sm" type="button" data-action="add-task" data-meeting-id="${meetingId}">Add Task</button>
      </form>
      <div class="week-board__columns">
        ${STATUS_OPTIONS.filter((status) => tasks.some((task) => task.status === status)).map((status) => renderStatusColumn(status, tasks.filter((task) => task.status === status))).join('')}
      </div>
    </article>
  `;
}

function renderStatusColumn(status, tasks) {
  const color = STATUS_COLOR[status] || '#64748b';
  return `
    <section class="status-column status-column--${status}">
      <h4 class="status-col-title">
        <span class="status-dot" style="background:${color}"></span>
        ${formatStatus(status)}
        <span class="status-col-count">${tasks.length}</span>
      </h4>
      ${tasks.length ? tasks.map((task) => renderTaskCard(task)).join('') : '<div class="empty-column">No tasks</div>'}
    </section>
  `;
}

function renderTaskCard(task) {
  const priority = normalizePriority(task.priority);
  const pColor = PRIORITY_COLOR[priority] || PRIORITY_COLOR.Medium;
  const taskNotes = String(task.notes || task.desc || task.description || '').trim();
  const hasNotes = taskNotes.length > 0;
  const jiraId = String(task.jiraId || '').trim();
  const jiraHref = resolveTaskJiraHref(task);
  const jiraLabel = resolveTaskJiraLabel(jiraId);
  return `
    <article class="task-card">
      <div class="task-card__top">
        <strong class="task-card__title">${escapeHtml(task.name)}</strong>
        <div class="task-card__actions">
          <button class="btn-icon btn-icon--edit" type="button" data-action="edit-de-task" data-task-id="${escapeHtml(task.id)}" title="Edit task">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon btn-icon--danger" type="button" data-action="remove-task" data-task-id="${escapeHtml(task.id)}" title="Delete">✕</button>
        </div>
      </div>
      <div class="task-card__row">
        <span class="priority-badge" style="background:${pColor.bg};color:${pColor.text}">${escapeHtml(priority)}</span>
        ${task.assignee ? `<span class="assignee-chip"><span class="av-xs">${initials(task.assignee)}</span>${escapeHtml(task.assignee)}</span>` : ''}
      </div>
      ${jiraId ? `<div class="sprint-ticket-ids">${jiraHref ? `<a class="sprint-ticket-id" href="${escapeHtml(jiraHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(jiraLabel)}</a>` : `<span class="sprint-ticket-id">${escapeHtml(jiraLabel)}</span>`}</div>` : ''}
      ${hasNotes ? `<p class="task-notes">${escapeHtml(taskNotes)}</p>` : ''}
      <select class="status-select" data-action="update-de-status" data-task-id="${escapeHtml(task.id)}">
        ${STATUS_OPTIONS.map((option) => `<option value="${option}" ${task.status === option ? 'selected' : ''}>${formatStatus(option)}</option>`).join('')}
      </select>
    </article>
  `;
}

function resolveTaskJiraHref(task) {
  const value = String(task?.jiraId || '').trim();
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return '';
}

function resolveTaskJiraLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) return raw;

  const browseMatch = raw.match(/\/browse\/([^/?#]+)/i);
  if (browseMatch && browseMatch[1]) return browseMatch[1];

  const lastSegmentMatch = raw.match(/\/([^/?#]+)(?:[?#].*)?$/);
  if (lastSegmentMatch && lastSegmentMatch[1]) return lastSegmentMatch[1];

  return raw;
}

export function renderDataExplorerTaskEditModal(task, teamMembers) {
  if (!task) return '';

  const taskId = escapeHtml(task.id || '');
  const taskName = escapeHtml(task.name || '');
  const taskAssignee = String(task.assignee || '').trim();
  const taskStatus = STATUS_OPTIONS.includes(task.status) ? task.status : 'inprogress';
  const taskPriority = normalizePriority(task.priority);
  const taskJiraId = escapeHtml(task.jiraId || '');
  const taskNotes = escapeHtml(String(task.notes || task.desc || task.description || '').trim());

  return `
    <article class="sprint-ticket-edit-modal" data-form="de-task-edit-modal" data-task-id="${taskId}">
      <div class="modal-overlay"></div>
      <div class="modal-card">
        <div class="modal-header">
          <h2>Edit Ticket</h2>
          <button class="btn-icon" type="button" data-action="cancel-edit-de-task" data-task-id="${taskId}" title="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <form class="ticket-edit-form">
            <div class="form-group">
              <label>Title</label>
              <input class="field-input" name="name" type="text" value="${taskName}" placeholder="Ticket title" />
            </div>
            <div class="form-group">
              <label>Assignee</label>
              <select class="field-input" name="assignee">
                <option value="">Unassigned</option>
                ${(teamMembers || []).map((member) => {
                  const memberName = String(member?.name || '').trim();
                  const selected = memberName === taskAssignee ? 'selected' : '';
                  return `<option value="${escapeHtml(memberName)}" ${selected}>${escapeHtml(memberName)}</option>`;
                }).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Status</label>
              <select class="field-input" name="status">
                ${STATUS_OPTIONS.map((status) => `<option value="${status}" ${taskStatus === status ? 'selected' : ''}>${formatStatus(status)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Priority</label>
              <select class="field-input" name="priority">
                <option value="High" ${taskPriority === 'High' ? 'selected' : ''}>High</option>
                <option value="Medium" ${taskPriority === 'Medium' ? 'selected' : ''}>Medium</option>
                <option value="Low" ${taskPriority === 'Low' ? 'selected' : ''}>Low</option>
              </select>
            </div>
            <div class="form-group">
              <label>Ticket ID</label>
              <input class="field-input" name="jiraId" type="text" value="${taskJiraId}" placeholder="Ticket ID or URL" />
            </div>
            <div class="form-group">
              <label>Notes</label>
              <textarea class="field-input" name="notes" rows="3" placeholder="Add notes...">${taskNotes}</textarea>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="button button--secondary" type="button" data-action="cancel-edit-de-task" data-task-id="${taskId}">Cancel</button>
          <button class="button button--primary" type="button" data-action="save-edit-de-task" data-task-id="${taskId}">Save</button>
        </div>
      </div>
    </article>
  `;
}

function normalizePriority(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'high' || normalized === 'alta') return 'High';
  if (normalized === 'low' || normalized === 'baixa') return 'Low';
  if (normalized === 'média' || normalized === 'media' || normalized === 'medium') return 'Medium';
  return 'Medium';
}

function renderEmptyBoard() {
  return `
    <article class="empty-card">
      <h3>No meetings yet</h3>
      <p>Create a meeting first, then add tasks inside that meeting board.</p>
    </article>
  `;
}