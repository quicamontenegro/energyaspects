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
          <form class="de-form de-form--meeting" data-form="meeting-create">
            <input name="date" class="field-input field-input--sm" type="date" placeholder="Date" />
            <input name="name" class="field-input field-input--sm" type="text" placeholder="Meeting name" />
            <textarea name="notes" class="field-input field-input--sm" rows="1" placeholder="Notes"></textarea>
            <button class="button button--secondary button--sm" type="button" data-action="add-meeting">Add Meeting</button>
          </form>
        </div>
        <div class="stack-list">
          ${sortedMeetings.length ? sortedMeetings.map((meeting) => renderMeetingBoard(meeting, getTasksForMeeting(state.deTasks || [], meeting), uiState)).join('') : renderEmptyBoard()}
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

function renderMeetingBoard(meeting, tasks, uiState) {
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
              <input name="notes" class="field-input field-input--sm" type="text" value="${notesValue}" placeholder="Notes" />
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
        <input name="assignee" class="field-input field-input--sm" type="text" placeholder="Assignee" />
        <select name="priority" class="field-input field-input--sm"><option value="High">High</option><option value="Média" selected>Média</option><option value="Low">Low</option></select>
        <input name="dueDate" class="field-input field-input--sm" type="date" />
        <button class="button button--primary button--sm" type="button" data-action="add-task" data-meeting-id="${meetingId}">Add Task</button>
      </form>
      <div class="week-board__columns">
        ${STATUS_OPTIONS.map((status) => renderStatusColumn(status, tasks.filter((task) => task.status === status))).join('')}
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
  const pColor = PRIORITY_COLOR[task.priority] || PRIORITY_COLOR['Média'];
  const hasNotes = task.notes && task.notes.trim();
  const hasDue = task.dueDate && task.dueDate.trim();
  return `
    <article class="task-card">
      <div class="task-card__top">
        <strong class="task-card__title">${escapeHtml(task.name)}</strong>
        <button class="btn-icon btn-icon--danger" type="button" data-action="remove-task" data-task-id="${escapeHtml(task.id)}" title="Delete">✕</button>
      </div>
      <div class="task-card__row">
        <span class="priority-badge" style="background:${pColor.bg};color:${pColor.text}">${escapeHtml(task.priority || 'Média')}</span>
        ${task.assignee ? `<span class="assignee-chip"><span class="av-xs">${initials(task.assignee)}</span>${escapeHtml(task.assignee)}</span>` : ''}
      </div>
      ${hasDue ? `<div class="task-due">📅 ${escapeHtml(task.dueDate)}</div>` : ''}
      ${hasNotes ? `<p class="task-notes">${escapeHtml(task.notes)}</p>` : ''}
      <select class="status-select" data-action="update-de-status" data-task-id="${escapeHtml(task.id)}">
        ${STATUS_OPTIONS.map((option) => `<option value="${option}" ${task.status === option ? 'selected' : ''}>${formatStatus(option)}</option>`).join('')}
      </select>
    </article>
  `;
}

function renderEmptyBoard() {
  return `
    <article class="empty-card">
      <h3>No meetings yet</h3>
      <p>Create a meeting first, then add tasks inside that meeting board.</p>
    </article>
  `;
}