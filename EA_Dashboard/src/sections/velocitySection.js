import { computeTeamMetrics } from '../utils/dashboard.js';
import { escapeHtml, formatNumber } from '../utils/format.js';

const GROUP_LABELS = {
  rp: 'RP Team',
};

export function renderVelocitySection(state, uiState) {
  const activeGroup = uiState.velocityGroup;
  const teams = state.teams.filter((team) => (team.group || 'rp') === activeGroup);

  return `
    <section class="panel-stack">
      <section class="board-card">
        <div class="section-header-inline">
          <div class="segment-switch">
            ${['rp'].map((group) => `<button class="segment-switch__button ${group === activeGroup ? 'is-active' : ''}" type="button" data-action="switch-velocity-group" data-group="${group}">${GROUP_LABELS[group]}</button>`).join('')}
          </div>
        </div>
        <div class="stack-list">
          ${teams.length ? teams.map((team) => renderTeam(team, state.teams.indexOf(team))).join('') : renderEmptyTeamGroup(activeGroup)}
        </div>
      </section>
    </section>
  `;
}

function renderTeam(team, teamIndex) {
  const metrics = computeTeamMetrics(team);
  return `
    <article class="team-card">
      <header class="team-card__header" style="--team-color:${escapeHtml(team.color || '#4338ca')}">
        <div>
          <h3>${escapeHtml(team.name)}</h3>
          <p>${metrics.members} members · ${metrics.completedCount}/${metrics.sprintCount} completed sprints</p>
        </div>
        <div class="team-card__badges">
          <span class="badge">Avg ${metrics.displayAverage} pts</span>
          <span class="badge">Top ${escapeHtml(metrics.topMember?.name || 'No data')}</span>
          <button class="button button--ghost-danger" type="button" data-action="remove-team" data-team-index="${teamIndex}">Remove</button>
        </div>
      </header>
      <div class="team-card__body">
        <div class="team-summary-grid">
          ${metrics.totals.map((total, sprintIndex) => `
            <article class="mini-card">
              <span>${escapeHtml(team.sprints?.[sprintIndex] || `Sprint ${sprintIndex + 1}`)}</span>
              <strong>${formatNumber(total)}</strong>
              <small>${team.sprintCompleted?.[sprintIndex] ? 'Completed' : 'Open'}</small>
            </article>
          `).join('')}
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Member</th>
                ${(team.sprints || []).map((label, sprintIndex) => `<th><input class="sprint-lbl" type="text" data-action="rename-sprint" data-team-index="${teamIndex}" data-sprint-index="${sprintIndex}" value="${escapeHtml(label)}" /></th>`).join('')}
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${(team.members || []).map((member, memberIndex) => `
                <tr>
                  <td>${escapeHtml(member.name || '')}</td>
                  ${(team.sprints || []).map((_, sprintIndex) => `<td class="col-num"><input class="num-cell" type="number" min="0" data-action="update-team-points" data-team-index="${teamIndex}" data-member-index="${memberIndex}" data-sprint-index="${sprintIndex}" value="${Number(member.sp?.[sprintIndex]) || 0}" /></td>`).join('')}
                  <td class="col-num col-total">${formatNumber((member.sp || []).reduce((sum, value) => sum + (Number(value) || 0), 0))}</td>
                  <td><button class="button button--ghost-danger btn-xs" type="button" data-action="remove-team-member" data-team-index="${teamIndex}" data-member-index="${memberIndex}">✕</button></td>
                </tr>
              `).join('')}
              <tr>
                <td colspan="${(team.sprints?.length || 0) + 2}">
                  <div class="inline-form" data-form="velocity-member-create" data-team-index="${teamIndex}">
                    <input name="name" class="field-input" type="text" placeholder="New member" />
                    <button class="button button--secondary" type="button" data-action="add-team-member" data-team-index="${teamIndex}">Add member</button>
                    <button class="button button--ghost" type="button" data-action="add-sprint" data-team-index="${teamIndex}">Add sprint</button>
                    <button class="button button--ghost" type="button" data-action="remove-sprint" data-team-index="${teamIndex}">Remove sprint</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </article>
  `;
}

function renderEmptyTeamGroup(group) {
  return `
    <article class="empty-card">
      <h3>No teams in ${escapeHtml(GROUP_LABELS[group])}</h3>
      <p>Create a team inline and the sprint table appears immediately.</p>
    </article>
  `;
}