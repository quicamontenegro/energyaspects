import { getMilestoneProgress } from '../utils/dashboard.js';
import { escapeHtml, formatStatus, initials } from '../utils/format.js';

const STATUS_OPTIONS = ['notstarted', 'inprogress', 'completed', 'blocked', 'onhold'];

const STATUS_COLOR = {
  notstarted: '#9ca3af',
  inprogress: '#4338ca',
  completed:  '#16a34a',
  blocked:    '#dc2626',
  onhold:     '#d97706',
};

export function renderMilestonesSection(state, uiState) {
  const teamFilter = uiState.milestoneTeam;
  const statusFilter = uiState.milestoneStatus;
  const visibleMilestones = state.msData.filter((milestone) => {
    const sameTeam = (milestone.team || 'rp') === teamFilter;
    const sameStatus = statusFilter === 'all' || milestone.status === statusFilter;
    return sameTeam && sameStatus;
  });

  return `
    <section class="panel-stack">
      <section class="board-card">
        <div class="segment-switch" style="margin-bottom:16px">
          ${['rp', 'de'].map((team) => `<button class="segment-switch__button ${team === teamFilter ? 'is-active' : ''}" type="button" data-action="switch-milestone-team" data-team="${team}">${team.toUpperCase()} Team</button>`).join('')}
        </div>
        <div class="section-header-inline">
          <div>
            <p class="section-kicker">Delivery Tracking</p>
            <h2>${teamFilter.toUpperCase()} milestones</h2>
          </div>
          <div class="inline-form inline-form--filter">
            <select class="field-input" data-action="filter-milestone-status">
              <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>All statuses</option>
              ${STATUS_OPTIONS.map((status) => `<option value="${status}" ${statusFilter === status ? 'selected' : ''}>${formatStatus(status)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="ms-form-bar">
          <form class="ms-form" data-form="milestone-create">
            <input name="name" class="field-input field-input--sm" type="text" placeholder="Milestone name" />
            <select name="status" class="field-input field-input--sm">${STATUS_OPTIONS.map((status) => `<option value="${status}">${formatStatus(status)}</option>`).join('')}</select>
            <input name="assignee" class="field-input field-input--sm" type="text" placeholder="Assignee" />
            <input name="url" class="field-input field-input--sm" type="url" placeholder="URL (optional)" />
            <button class="button button--primary button--sm" type="button" data-action="add-milestone" data-team="${teamFilter}">Add Milestone</button>
          </form>
        </div>

        <div class="stack-list">
          ${visibleMilestones.length ? visibleMilestones.map((milestone) => renderMilestone(state.msData.indexOf(milestone), milestone)).join('') : renderEmptyMilestones(teamFilter)}
        </div>
      </section>
    </section>
  `;
}

function renderMilestone(index, milestone) {
  const progress = getMilestoneProgress(milestone);
  const statusColor = STATUS_COLOR[milestone.status] || '#64748b';
  return `
    <article class="milestone-card">
      <div class="milestone-card__top">
        <div class="milestone-card__head">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="status-dot" style="background:${statusColor}"></span>
            <h3 class="milestone-card__title">${escapeHtml(milestone.name || 'Untitled milestone')}</h3>
          </div>
          <div class="milestone-card__meta">
            ${milestone.assignee ? `<span class="assignee-chip"><span class="av-xs">${initials(milestone.assignee)}</span>${escapeHtml(milestone.assignee)}</span>` : '<span style="font-size:12px;color:var(--muted)">Unassigned</span>'}
            <span class="status-badge" style="background:${statusColor}20;color:${statusColor}">${formatStatus(milestone.status)}</span>
            <button class="btn-icon btn-icon--danger" type="button" data-action="remove-milestone" data-milestone-index="${index}" title="Delete">✕</button>
          </div>
        </div>
        <div class="milestone-progress">
          <div class="progress-bar"><span style="width:${progress.progress}%"></span></div>
          <span class="progress-text">${progress.progress}%</span>
        </div>
      </div>
      <div class="milestone-tasks">
        ${(milestone.tasks || []).map((task, taskIndex) => `
          <div class="milestone-task">
            <span class="task-label">${escapeHtml(task.name || '')}</span>
            <select class="status-select" data-action="update-milestone-task-status" data-milestone-index="${index}" data-task-index="${taskIndex}">
              ${STATUS_OPTIONS.map((status) => `<option value="${status}" ${task.status === status ? 'selected' : ''}>${formatStatus(status)}</option>`).join('')}
            </select>
            <button class="btn-icon btn-icon--danger" type="button" data-action="remove-milestone-task" data-milestone-index="${index}" data-task-index="${taskIndex}" style="opacity:0.6" title="Delete">✕</button>
          </div>
        `).join('')}
        <div class="milestone-task-add">
          <div class="inline-form" data-form="milestone-task-create" data-milestone-index="${index}">
            <input name="name" class="field-input field-input--sm" type="text" placeholder="Add task" />
            <select name="status" class="field-input field-input--sm">${STATUS_OPTIONS.map((status) => `<option value="${status}">${formatStatus(status)}</option>`).join('')}</select>
            <button class="button button--secondary button--sm" type="button" data-action="add-milestone-task" data-milestone-index="${index}">Add</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderEmptyMilestones(team) {
  return `
    <article class="empty-card">
      <h3>No ${escapeHtml(team.toUpperCase())} milestones yet</h3>
      <p>Create one inline and the task rows will be ready underneath it.</p>
    </article>
  `;
}