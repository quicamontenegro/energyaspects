import { getMilestoneProgress } from '../utils/dashboard.js';
import { escapeHtml, formatStatus, initials } from '../utils/format.js';
import { icon } from '../utils/icons.js';

const STATUS_OPTIONS = ['notstarted', 'inprogress', 'completed', 'blocked', 'onhold'];

export function renderMilestonesSection(state, uiState = {}) {
  const milestones = (state.msData || []).filter(milestone => (milestone.team || 'rp') === 'rp');
  const statusFilter = uiState.milestoneStatus || 'all';
  const visibleMilestones = milestones.filter(milestone => statusFilter === 'all' || milestone.status === statusFilter);
  const totalTasks = milestones.reduce((total, milestone) => total + getMilestoneProgress(milestone).total, 0);
  const completedTasks = milestones.reduce((total, milestone) => total + getMilestoneProgress(milestone).completed, 0);
  const progress = totalTasks ? Math.round(completedTasks / totalTasks * 100) : 0;
  const metrics = [
    ['Total milestones', milestones.length, 'milestones', 'total'],
    ['In progress', milestones.filter(milestone => milestone.status === 'inprogress').length, 'zap', 'active'],
    ['Completed', milestones.filter(milestone => milestone.status === 'completed').length, 'target', 'complete'],
    ['Blocked', milestones.filter(milestone => milestone.status === 'blocked').length, 'layers', 'blocked'],
  ];

  return `
    <section class="milestones-workspace">
      <header class="workspace-titlebar">
        <h1>${icon('milestones')}Milestones</h1>
        <div class="workspace-actions"><button class="button button--primary" type="button" data-action="open-milestone-create" aria-controls="milestone-create-panel">${icon('plus')}New milestone</button></div>
      </header>
      <section class="velocity-kpis milestones-kpis" aria-label="Milestone totals">
        ${metrics.map(([label, value, symbol, tone]) => `<article class="velocity-kpi milestone-kpi--${tone}"><div class="kpi-icon">${icon(symbol)}</div><div><span>${label}</span><strong>${value}</strong></div></article>`).join('')}
      </section>
      <section class="milestones-overview" aria-label="Delivery overview">
        <div><h2>Delivery overview</h2><span>${completedTasks} / ${totalTasks} tasks completed</span></div>
        <div class="milestones-overall-progress">${renderProgress(progress, 'Overall task completion')}<strong>${progress}%</strong></div>
        <div class="milestones-status-distribution">${STATUS_OPTIONS.map(status => `<span><i class="milestones-status-dot ms-status-${status}"></i>${formatStatus(status)}<strong>${milestones.filter(milestone => milestone.status === status).length}</strong></span>`).join('')}</div>
      </section>
      <details class="milestones-create" id="milestone-create-panel" data-ui-panel="milestone-create">
        <summary>${icon('plus')}Create milestone</summary>
        <form class="milestones-form" data-form="milestone-create">
          <label>Name<input name="name" class="field-input" type="text" placeholder="Milestone name" required /></label>
          <label>Status<select name="status" class="field-input">${renderStatusOptions('notstarted')}</select></label>
          <label>Owner<input name="assignee" class="field-input" type="text" placeholder="Unassigned" /></label>
          <label>Link<input name="url" class="field-input" type="url" placeholder="https://" /></label>
          <button class="button button--primary" type="button" data-action="add-milestone" data-team="rp">${icon('plus')}Create milestone</button>
        </form>
      </details>
      <div class="milestones-list-header"><h2>Milestone register <span>${visibleMilestones.length} / ${milestones.length}</span></h2><label>Status<select class="field-input" data-action="filter-milestone-status"><option value="all" ${statusFilter === 'all' ? 'selected' : ''}>All statuses</option>${renderStatusOptions(statusFilter)}</select></label></div>
      <div class="milestones-register">
        <div class="milestones-column-head" aria-hidden="true"><span>Milestone</span><span>Owner</span><span>Status</span><span>Task completion</span><span></span></div>
        ${visibleMilestones.length ? visibleMilestones.map(milestone => renderMilestone(state.msData.indexOf(milestone), milestone)).join('') : `<div class="milestones-empty">${icon('milestones')}<h3>${milestones.length ? 'No matching milestones' : 'No milestones yet'}</h3></div>`}
      </div>
    </section>
  `;
}

function renderMilestone(index, milestone) {
  const progress = getMilestoneProgress(milestone);
  const status = STATUS_OPTIONS.includes(milestone.status) ? milestone.status : 'notstarted';
  const name = escapeHtml(milestone.name || 'Untitled milestone');
  const tasks = milestone.tasks || [];
  const panelKey = escapeHtml(`milestone-${milestone.id || index}`);
  const link = getMilestoneLink(milestone.url);
  return `
    <details class="milestones-row" data-ui-panel="${panelKey}">
      <summary class="milestones-summary">
        <span class="milestones-name"><i class="milestones-status-dot ms-status-${status}"></i><strong>${name}</strong></span>
        <span class="milestones-owner">${milestone.assignee ? `<span class="milestones-avatar">${escapeHtml(initials(milestone.assignee))}</span>${escapeHtml(milestone.assignee)}` : 'Unassigned'}</span>
        <span class="milestones-status ms-status-${status}">${formatStatus(status)}</span>
        <span class="milestones-row-progress">${renderProgress(progress.progress, `${milestone.name || 'Milestone'} task completion`)}<span>${progress.completed}/${progress.total}<strong>${progress.progress}%</strong></span></span>
        <span class="milestones-expand">${icon('right')}</span>
      </summary>
      <div class="milestones-detail">
        <div class="milestones-detail-toolbar"><h3>Milestone details</h3><div>${link ? `<a class="button" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${icon('report')}Open link</a>` : ''}<button class="button milestones-delete" type="button" data-action="remove-milestone" data-milestone-index="${index}" title="Delete milestone" aria-label="Delete ${name}">${icon('remove')}</button></div></div>
        <div class="milestones-fields">
          ${renderField(index, 'name', 'Name', milestone.name || '', 'text', true)}
          <label>Status<select class="field-input" data-action="update-milestone-field" data-field="status" data-milestone-index="${index}">${renderStatusOptions(status)}</select></label>
          ${renderField(index, 'assignee', 'Owner', milestone.assignee || '')}
          ${renderField(index, 'url', 'Link', milestone.url || '', 'url')}
        </div>
        <div class="milestones-tasks-heading"><h3>Tasks</h3><span>${progress.completed} of ${progress.total} completed</span></div>
        <div class="milestones-task-list">
          ${tasks.map((task, taskIndex) => `<div class="milestones-task-row">
            <input class="field-input" type="text" value="${escapeHtml(task.name || '')}" aria-label="Task name" data-action="update-milestone-task-name" data-milestone-index="${index}" data-task-index="${taskIndex}" />
            <select class="field-input" aria-label="Status for ${escapeHtml(task.name || 'task')}" data-action="update-milestone-task-status" data-milestone-index="${index}" data-task-index="${taskIndex}">${renderStatusOptions(task.status || 'notstarted')}</select>
            <button class="button milestones-delete" type="button" data-action="remove-milestone-task" data-milestone-index="${index}" data-task-index="${taskIndex}" title="Delete task" aria-label="Delete task ${escapeHtml(task.name || '')}">${icon('remove')}</button>
          </div>`).join('')}
        </div>
        <div class="milestones-task-row milestones-task-create" data-form="milestone-task-create" data-milestone-index="${index}">
          <input name="name" class="field-input" type="text" placeholder="Task name" aria-label="New task name" />
          <select name="status" class="field-input" aria-label="New task status">${renderStatusOptions('notstarted')}</select>
          <button class="button" type="button" data-action="add-milestone-task" data-milestone-index="${index}" title="Add task" aria-label="Add task">${icon('plus')}</button>
        </div>
      </div>
    </details>
  `;
}

function renderStatusOptions(selected) {
  return STATUS_OPTIONS.map(status => `<option value="${status}" ${status === selected ? 'selected' : ''}>${formatStatus(status)}</option>`).join('');
}

function renderProgress(value, label) {
  return `<span class="milestones-progress-track" role="progressbar" aria-label="${escapeHtml(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"><span style="width:${value}%"></span></span>`;
}

function renderField(index, field, label, value, type = 'text', required = false) {
  return `<label>${label}<input class="field-input" type="${type}" value="${escapeHtml(value)}" data-action="update-milestone-field" data-field="${field}" data-milestone-index="${index}" ${required ? 'required' : ''} /></label>`;
}

function getMilestoneLink(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}