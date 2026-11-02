import { getProjectTotals, getWorkingDays, normalizeProjectMember } from '../utils/dashboard.js';
import { escapeHtml, formatNumber, initials } from '../utils/format.js';
import { icon } from '../utils/icons.js';

export function renderInvoicingSection(state, uiState = {}) {
  const monthlyHours = Number(state.settings.monthlyHours) || 176;
  const hoursPerDay = Number(state.settings.hoursPerDay) || 8;
  const workingDays = getWorkingDays(state.settings);
  const projects = state.projects || [];
  const totals = projects.map(project => getProjectTotals(project, monthlyHours, hoursPerDay));
  const totalMembers = totals.reduce((sum, project) => sum + project.members, 0);
  const available = totals.reduce((sum, project) => sum + project.totalLogged, 0);
  const timeOff = totals.reduce((sum, project) => sum + project.totalHoursOff, 0);
  const capacity = totalMembers * monthlyHours;
  const availability = capacity ? Math.round(available / capacity * 100) : 0;
  const metrics = [['Team allocations', totalMembers, '', 'users'], ['Available hours', available, 'h', 'zap'], ['Time off', timeOff, 'h', 'calendar'], ['Availability', availability, '%', 'target']];

  return `
    <section class="invoicing-workspace">
      <header class="workspace-titlebar"><h1>${icon('invoicing')}Invoicing</h1><button class="button button--primary" type="button" data-action="open-invoicing-create" aria-controls="invoicing-create">${icon('plus')}New project</button></header>
      <section class="velocity-kpis invoicing-kpis" aria-label="Billing totals">
        ${metrics.map(([label, value, unit, symbol]) => `<article class="velocity-kpi kpi-${symbol}"><div class="kpi-icon">${icon(symbol)}</div><div><span>${label}</span><strong>${formatNumber(value, value % 1 ? 1 : 0)}${unit ? `<small>${unit}</small>` : ''}</strong></div></article>`).join('')}
      </section>
      <section class="invoicing-period" aria-label="Monthly capacity">
        <div><h2>Monthly capacity</h2><span>${projects.length} projects</span></div>
        <label>Working days<input class="field-input" data-action="update-working-days" type="number" min="1" step="1" required value="${workingDays}" /></label>
        <div><span>Hours / day</span><strong>${formatNumber(hoursPerDay)} h</strong></div>
        <div><span>Hours / member</span><strong>${formatNumber(monthlyHours)} h</strong></div>
      </section>
      <details class="invoicing-create" id="invoicing-create" data-ui-panel="invoicing-create"><summary>New project</summary><form class="invoicing-project-form" data-form="project-create">
        <label>Name<input name="name" class="field-input" type="text" placeholder="Project name" required /></label>
        <label>Tag<input name="tag" class="field-input" type="text" placeholder="Optional tag" /></label>
        <label>Color<input name="color" class="field-input" type="color" value="#0f766e" /></label>
        <button class="button button--primary" type="button" data-action="add-project">${icon('plus')}Create project</button>
      </form></details>
      <div class="invoicing-roster-toolbar"><h2>Billing roster</h2><input class="field-input" type="search" aria-label="Search projects or members" placeholder="Search projects or members..." data-action="search-invoicing" value="${escapeHtml(uiState.invoicingQuery || '')}" /></div>
      <div class="invoicing-projects">${projects.length ? projects.map((project, index) => renderProject(project, index, monthlyHours, hoursPerDay)).join('') : renderEmpty('No projects yet')}</div>
      <div class="invoicing-empty" data-invoicing-no-results hidden><h3>No matching projects</h3></div>
    </section>
  `;
}

function renderProject(project, projectIndex, monthlyHours, hoursPerDay) {
  const totals = getProjectTotals(project, monthlyHours, hoursPerDay);
  const members = project.members || [];
  const name = project.name || 'Untitled project';
  const color = /^#[0-9a-f]{6}$/i.test(project.color || '') ? project.color : '#0f766e';
  const search = [name, project.tag || '', ...members.map(member => member.name || '')].join(' ');
  return `
    <article class="invoicing-project" data-invoicing-project data-project-search="${escapeHtml(search)}" style="--project-color:${color}">
      <header class="invoicing-project-header">
        <div class="invoicing-project-name"><i></i><div><h3>${escapeHtml(name)}</h3><span>${project.tag ? `${escapeHtml(project.tag)} · ` : ''}${totals.members} members</span></div></div>
        <div class="invoicing-project-availability"><span>${formatNumber(totals.totalLogged, 1)} / ${formatNumber(totals.totalCapacity)} h</span><div class="invoicing-progress" role="progressbar" aria-label="${escapeHtml(name)} availability" aria-valuenow="${totals.utilization}" aria-valuemin="0" aria-valuemax="100"><span style="width:${totals.utilization}%"></span></div><strong>${totals.utilization}%</strong></div>
        <button class="button invoicing-remove" type="button" data-action="remove-project" data-project-index="${projectIndex}" title="Delete project" aria-label="Delete ${escapeHtml(name)}">${icon('remove')}</button>
      </header>
      <div class="table-wrap invoicing-table-wrap" role="region" aria-label="${escapeHtml(name)} members" tabindex="0"><table class="data-table invoicing-table">
        <thead><tr><th scope="col">Member</th><th scope="col">PTO <small>days</small></th><th scope="col">Holidays <small>days</small></th><th scope="col">Time off <small>h</small></th><th scope="col">Available <small>h</small></th><th scope="col" aria-label="Actions"></th></tr></thead>
        <tbody>${members.length ? members.map((member, memberIndex) => renderMember(member, projectIndex, memberIndex, monthlyHours, hoursPerDay)).join('') : '<tr><td colspan="6" class="invoicing-no-members">No members assigned</td></tr>'}</tbody>
        ${members.length ? `<tfoot><tr><th scope="row">Project total</th><td>${formatNumber(members.reduce((sum, member) => sum + Math.max(0, Number(member.pto) || 0), 0), 1)}</td><td>${formatNumber(members.reduce((sum, member) => sum + Math.max(0, Number(member.feriados) || 0), 0), 1)}</td><td>${formatNumber(totals.totalHoursOff, 1)}</td><td><strong>${formatNumber(totals.totalLogged, 1)}</strong></td><td></td></tr></tfoot>` : ''}
      </table></div>
      <div class="invoicing-add-member" data-form="member-create" data-project-index="${projectIndex}"><input name="name" class="field-input" type="text" aria-label="New member for ${escapeHtml(name)}" placeholder="Member name" required /><button class="button" type="button" data-action="add-project-member" data-project-index="${projectIndex}">${icon('plus')}Add member</button></div>
      <details class="invoicing-project-settings" data-ui-panel="invoicing-project-${escapeHtml(project.id || String(projectIndex))}"><summary>${icon('settings')}Project settings</summary><div class="invoicing-project-form">
        <label>Name<input class="field-input" type="text" value="${escapeHtml(name)}" data-action="update-invoicing-project-field" data-field="name" data-project-index="${projectIndex}" required /></label>
        <label>Tag<input class="field-input" type="text" value="${escapeHtml(project.tag || '')}" data-action="update-invoicing-project-field" data-field="tag" data-project-index="${projectIndex}" /></label>
        <label>Color<input class="field-input" type="color" value="${color}" data-action="update-invoicing-project-field" data-field="color" data-project-index="${projectIndex}" /></label>
      </div></details>
    </article>
  `;
}

function renderMember(member, projectIndex, memberIndex, monthlyHours, hoursPerDay) {
  const normalized = normalizeProjectMember(member, monthlyHours, hoursPerDay);
  const name = member.name || 'Member';
  return `<tr>
    <td><div class="invoicing-member-name"><span class="invoicing-avatar">${escapeHtml(initials(name))}</span><input class="field-input" type="text" aria-label="Member name" title="${escapeHtml(name)}" value="${escapeHtml(member.name || '')}" data-action="update-project-member-text" data-field="name" data-project-index="${projectIndex}" data-member-index="${memberIndex}" required /></div></td>
    ${[['pto', 'PTO'], ['feriados', 'Holidays']].map(([field, label]) => `<td><input class="field-input invoicing-number" aria-label="${label} for ${escapeHtml(name)}" data-action="update-project-member-number" data-project-index="${projectIndex}" data-member-index="${memberIndex}" data-field="${field}" type="number" min="0" step="any" required value="${normalized[field]}" /></td>`).join('')}
    <td>${formatNumber(normalized.hoursOff, 1)}</td><td class="invoicing-available">${formatNumber(normalized.tl, 1)}${normalized.hoursOff > monthlyHours ? '<span class="invoicing-capacity-warning" title="Time off exceeds monthly capacity" aria-label="Time off exceeds monthly capacity">!</span>' : ''}</td>
    <td><button class="button invoicing-remove" type="button" data-action="remove-project-member" data-project-index="${projectIndex}" data-member-index="${memberIndex}" title="Remove member" aria-label="Remove ${escapeHtml(name)}">${icon('remove')}</button></td>
  </tr>`;
}

function renderEmpty(title) {
  return `
    <div class="invoicing-empty">
      ${icon('invoicing')}
      <h3>${escapeHtml(title)}</h3>
    </div>
  `;
}