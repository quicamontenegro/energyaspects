import { getProjectTotals, getWorkingDays } from '../utils/dashboard.js';
import { escapeHtml, formatNumber, initials } from '../utils/format.js';

export function renderInvoicingSection(state) {
  const monthlyHours = Number(state.settings.monthlyHours) || 176;
  const hoursPerDay = Number(state.settings.hoursPerDay) || 8;
  const workingDays = getWorkingDays(state.settings);
  const totalMembers = state.projects.reduce((sum, p) => sum + (p.members?.length || 0), 0);

  return `
    <section class="panel-stack">
      <section class="stats-bar">
        <article class="stat-card">
          <span class="stat-label">Working Days</span>
          <div class="stat-editable">
            <input class="wdays-input" data-action="update-working-days" type="number" min="1" value="${workingDays}" />
            <span class="stat-unit">days</span>
          </div>
          <small class="stat-sub">This month</small>
        </article>
        <article class="stat-card">
          <span class="stat-label">Hours / Day</span>
          <strong class="stat-highlight">${formatNumber(hoursPerDay)}<span class="stat-unit"> h</span></strong>
          <small class="stat-sub">Standard workday</small>
        </article>
        <article class="stat-card">
          <span class="stat-label">Monthly Hours</span>
          <strong class="stat-highlight">${formatNumber(monthlyHours)}</strong>
          <small class="stat-sub">Days × hours/day</small>
        </article>
        <article class="stat-card">
          <span class="stat-label">Total Members</span>
          <strong class="stat-highlight">${formatNumber(totalMembers)}</strong>
          <small class="stat-sub">Across all projects</small>
        </article>
      </section>

      <section class="board-card">
        <div class="section-header-inline">
          <div>
            <p class="section-kicker">Projects</p>
            <h2>Billing roster</h2>
          </div>
          <form class="inline-form inline-form--project" data-form="project-create">
            <input name="name" class="field-input" type="text" placeholder="New project" />
            <input name="tag" class="field-input" type="text" placeholder="Tag" />
            <input name="color" class="field-input field-input--color" type="color" value="#0f766e" />
            <button class="button button--primary" type="button" data-action="add-project">Add project</button>
          </form>
        </div>
        <div class="stack-list">
          ${state.projects.length
            ? state.projects.map((p, i) => renderProject(p, i, monthlyHours)).join('')
            : renderEmpty('No projects yet', 'Create the first project above.')}
        </div>
      </section>
    </section>
  `;
}

function renderProject(project, projectIndex, monthlyHours) {
  const totals = getProjectTotals(project, monthlyHours);
  return `
    <article class="project-card">
      <header class="project-card__header" style="--project-color:${escapeHtml(project.color || '#0f766e')}">
        <div>
          <h3>${escapeHtml(project.name || 'Untitled Project')}</h3>
          <p>${escapeHtml(project.tag || 'No tag')} · ${formatNumber(totals.utilization)}% utilization</p>
        </div>
        <div class="project-card__meta">
          <span>${formatNumber(totals.members)} members</span>
          <span>${formatNumber(totals.totalLogged)}h logged</span>
          <button class="button button--ghost-danger" type="button" data-action="remove-project" data-project-index="${projectIndex}">Remove</button>
        </div>
      </header>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Member</th>
              <th class="col-num">PTO</th>
              <th class="col-num">Holidays</th>
              <th class="col-num">Hours Off</th>
              <th class="col-num">Logged</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${(project.members || []).map((member, memberIndex) => `
              <tr>
                <td>
                  <div class="cell-name">
                    <div class="av-sm">${initials(member.name)}</div>
                    ${escapeHtml(member.name || '')}
                  </div>
                </td>
                <td class="col-num"><input class="num-cell" data-action="update-project-member-number" data-project-index="${projectIndex}" data-member-index="${memberIndex}" data-field="pto" type="number" min="0" value="${Number(member.pto) || 0}" /></td>
                <td class="col-num"><input class="num-cell" data-action="update-project-member-number" data-project-index="${projectIndex}" data-member-index="${memberIndex}" data-field="feriados" type="number" min="0" value="${Number(member.feriados) || 0}" /></td>
                <td class="col-num"><input class="num-cell" data-action="update-project-member-number" data-project-index="${projectIndex}" data-member-index="${memberIndex}" data-field="hoursOff" type="number" min="0" value="${Number(member.hoursOff) || 0}" /></td>
                <td class="col-num col-total">${formatNumber(Number(member.tl) || Math.max(0, monthlyHours - (Number(member.hoursOff) || 0)))}</td>
                <td><button class="button button--ghost-danger btn-xs" type="button" data-action="remove-project-member" data-project-index="${projectIndex}" data-member-index="${memberIndex}">✕</button></td>
              </tr>
            `).join('')}
            <tr class="row-add">
              <td colspan="6">
                <div class="inline-form inline-form--member" data-form="member-create" data-project-index="${projectIndex}">
                  <input name="name" class="field-input" type="text" placeholder="Add member to ${escapeHtml(project.name || 'project')}" />
                  <button class="button button--secondary" type="button" data-action="add-project-member" data-project-index="${projectIndex}">Add member</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderEmpty(title, description) {
  return `
    <article class="empty-card">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
    </article>
  `;
}