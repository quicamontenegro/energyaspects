import { getWeekOptions } from '../utils/dashboard.js';
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
  const weekOptions = getWeekOptions(state.deTasks, state.deMeetings);
  const activeWeek = uiState.deWeekFilter;
  const filteredTasks = activeWeek === 'all'
    ? state.deTasks
    : state.deTasks.filter((task) => (task.week || 'Backlog') === activeWeek);
  const grouped = groupTasksByWeek(filteredTasks);

  // Sort meetings by date (most recent first)
  const sortedMeetings = [...(state.deMeetings || [])].sort((a, b) => {
    const dateA = new Date(a.date || '9999-12-31').getTime();
    const dateB = new Date(b.date || '9999-12-31').getTime();
    return dateB - dateA;
  });

  return `
    <section class="panel-stack">
      <section class="board-card">
        <div class="section-header-inline">
          <div>
            <p class="section-kicker">Meetings & Tasks</p>
            <h2>Weekly explorer board</h2>
          </div>
          <div class="inline-form inline-form--filter">
            <select class="field-input" data-action="filter-de-week">
              <option value="all" ${activeWeek === 'all' ? 'selected' : ''}>All weeks</option>
              ${weekOptions.map((week) => `<option value="${escapeHtml(week)}" ${week === activeWeek ? 'selected' : ''}>${escapeHtml(week)}</option>`).join('')}
            </select>
          </div>
        </div>
        ${sortedMeetings.length ? `<div class="meetings-panel">${sortedMeetings.map((meeting, index) => renderMeetingItem(meeting, index)).join('')}</div>` : ''}
        <div class="de-forms-bar">
          <form class="de-form de-form--meeting" data-form="meeting-create">
            <input name="date" class="field-input field-input--sm" type="date" placeholder="Date" />
            <input name="name" class="field-input field-input--sm" type="text" placeholder="Meeting name" />
            <textarea name="notes" class="field-input field-input--sm" rows="1" placeholder="Notes"></textarea>
            <button class="button button--secondary button--sm" type="button" data-action="add-meeting">Add Meeting</button>
          </form>
          <form class="de-form de-form--task" data-form="task-create">
            <input name="name" class="field-input field-input--sm" type="text" placeholder="Task title" />
            <input name="week" class="field-input field-input--sm" type="text" placeholder="Week" />
            <input name="assignee" class="field-input field-input--sm" type="text" placeholder="Assignee" />
            <select name="status" class="field-input field-input--sm">${STATUS_OPTIONS.map((status) => `<option value="${status}">${formatStatus(status)}</option>`).join('')}</select>
            <select name="priority" class="field-input field-input--sm"><option value="High">High</option><option value="Média" selected>Média</option><option value="Low">Low</option></select>
            <input name="dueDate" class="field-input field-input--sm" type="date" />
            <button class="button button--primary button--sm" type="button" data-action="add-task">Add Task</button>
          </form>
        </div>
        <div class="stack-list">
          ${Object.keys(grouped).length ? Object.entries(grouped).map(([week, tasks]) => renderWeekBoard(week, tasks)).join('') : renderEmptyBoard()}
        </div>
      </section>
    </section>
  `;
}

function groupTasksByWeek(tasks) {
  return tasks.reduce((accumulator, task) => {
    const key = task.week || 'Backlog';
    if (!accumulator[key]) {
      accumulator[key] = [];
    }
    accumulator[key].push(task);
    return accumulator;
  }, {});
}

function renderWeekBoard(week, tasks) {
  return `
    <article class="week-board">
      <header class="week-board__header">
        <div>
          <h3>${escapeHtml(week)}</h3>
        </div>
        <span class="badge">${tasks.length} tasks</span>
      </header>
      <div class="week-board__columns">
        ${STATUS_OPTIONS.map((status) => renderStatusColumn(status, tasks.filter((task) => task.status === status))).join('')}
      </div>
    </article>
  `;
}

function renderMeetingItem(meeting, index) {
  const hasDate = meeting.date && meeting.date.trim();
  return `
    <div class="meeting-item">
      <div class="meeting-content">
        <strong>${escapeHtml(meeting.name || 'Untitled')}</strong>
        ${meeting.notes ? `<span class="meeting-notes"> · ${escapeHtml(meeting.notes)}</span>` : ''}
      </div>
      <div class="meeting-date-edit" data-meeting-index="${index}">
        <input class="meeting-date-input" type="date" value="${hasDate ? escapeHtml(meeting.date) : ''}" data-action="update-meeting-date" data-meeting-id="${escapeHtml(meeting.id)}" />
        <button class="btn-icon btn-icon--danger" type="button" data-action="remove-meeting" data-meeting-id="${escapeHtml(meeting.id)}" title="Delete" style="font-size: 0.85em;">✕</button>
      </div>
    </div>
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
      <h3>No tasks yet</h3>
      <p>Add a meeting or a task inline and the weekly board will populate automatically.</p>
    </article>
  `;
}