import { escapeHtml, formatNumber } from '../utils/format.js';
import { icon } from '../utils/icons.js';

const METRICS = [
  { key: 'plannedSP', label: 'PLANNED (SP)', group: 'Sprint Delivery', unit: 'sp', direction: 'lower' },
  { key: 'completedSP', label: 'COMPLETED (SP)', group: 'Sprint Delivery', unit: 'sp', direction: 'higher' },
  { key: 'predictability', label: 'Sprint PREDICTABILITY (%)', group: 'Sprint Delivery', unit: '%', direction: 'higher', calculated: true },
  { key: 'carryOverSP', label: 'CARRY OVER (SP)', group: 'Sprint Delivery', unit: 'sp', direction: 'lower' },
  { key: 'carryOverPct', label: 'CARRY OVER (%)', group: 'Sprint Delivery', unit: '%', direction: 'lower', calculated: true },
  { key: 'workItemsCompleted', label: 'WORK ITEMS COMPLETED', group: 'Productivity', unit: 'count', direction: 'higher' },
  { key: 'scopeChange', label: 'SCOPE CHANGE (SP)', group: 'Productivity', unit: 'sp', direction: 'lower' },
  { key: 'bugsFixed', label: 'BUGS FIXED', group: 'Productivity', unit: 'count', direction: 'higher' },
  { key: 'bugRatio', label: 'BUG RATIO (%)', group: 'Productivity', unit: '%', direction: 'lower', calculated: true },
  { key: 'devCompletedSP', label: 'DEV COMPLETED (SP)', group: 'DEV Team', unit: 'sp', direction: 'higher' },
  { key: 'devAverage', label: 'AVG SP / DEVELOPER', group: 'DEV Team', unit: 'sp', direction: 'higher' },
  { key: 'qaCompletedSP', label: 'QA COMPLETED (SP)', group: 'QA Team', unit: 'sp', direction: 'higher' },
  { key: 'qaAverage', label: 'AVG SP / QA', group: 'QA Team', unit: 'sp', direction: 'higher' },
];
const DISTRIBUTION = [
  ['notStarted', 'Not Started'], ['inProgress', 'In Progress'], ['codeReview', 'Code Review'],
  ['readyForQA', 'Ready for QA'], ['inQA', 'In QA'], ['blocked', 'Blocked / On Hold'],
];

function num(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function calc(sprint, key) {
  const raw = (field) => sprint?.[field] === '' || sprint?.[field] === null || sprint?.[field] === undefined ? null : num(sprint[field]);
  if (key === 'predictability') {
    const completed = raw('completedSP'), planned = raw('plannedSP');
    return completed === null || planned === null || planned === 0 ? null : completed / planned * 100;
  }
  if (key === 'carryOverPct') {
    const carry = raw('carryOverSP'), planned = raw('plannedSP');
    return carry === null || planned === null || planned === 0 ? null : carry / planned * 100;
  }
  if (key === 'bugRatio') {
    const bugs = raw('bugsFixed'), items = raw('workItemsCompleted');
    return bugs === null || items === null || items === 0 ? null : bugs / items * 100;
  }
  return raw(key);
}
function valueLabel(value, metric) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (metric.unit === '%') return `${value.toLocaleString('en-GB', { maximumFractionDigits: 1 })}%`;
  return value.toLocaleString('en-GB', { maximumFractionDigits: 1 });
}
function avg(values) {
  const valid = values.filter((v) => Number.isFinite(v));
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}
function getOrdered(sprints) {
  return [...(Array.isArray(sprints) ? sprints : [])].sort((a, b) =>
    String(a.startDate || a.createdAt || '').localeCompare(String(b.startDate || b.createdAt || '')));
}
function currentAndCompleted(sprints) {
  const ordered = getOrdered(sprints);
  const current = [...ordered].reverse().find((s) => !s.completed) || null;
  const completed = ordered.filter((s) => s.completed && s.id !== current?.id).slice(-7);
  return { current, completed, ordered };
}
function safeText(value) { return escapeHtml(String(value ?? '')); }

export function getVelocitySelection(state, uiState = {}) {
  return getOrdered(state.velocityReportSprints || []).filter(sprint => !uiState.velocityTeam || uiState.velocityTeam === 'all' || (sprint.team || 'Unassigned') === uiState.velocityTeam);
}

export function renderVelocitySection(state, uiState = {}) {
  const sprints = getOrdered(state.velocityReportSprints || []);
  const selected = getVelocitySelection(state, uiState);
  const selection = currentAndCompleted(selected);
  const current = selected.find(sprint => sprint.id === uiState.velocitySprint) || selection.current;
  const completed = selected.filter(sprint => sprint.completed && sprint.id !== current?.id && (!current?.startDate || !sprint.startDate || sprint.startDate <= current.startDate));
  const comparisonCount = Number(uiState.velocityComparison) || 3;
  const last3 = completed.slice(-comparisonCount).reverse();
  const historyCount = Number(uiState.velocityHistory) || 7;
  const history = getOrdered([...(current ? [current] : []), ...completed]).slice(-historyCount);
  const teams = [...new Set(sprints.map(sprint => sprint.team || 'Unassigned'))];
  const view = uiState.velocityView || 'analysis';
  const headlineMetrics = [['completedSP','Velocity','zap','sp'], ['predictability','Sprint Predictability','target','%'], ['carryOverSP','Carry Over','layers','sp'], ['bugRatio','Bug Ratio','bug','%']];
  return `
    <section class="velocity-workspace velocity-view-${safeText(view)}">
      <header class="workspace-titlebar"><h1>${icon('velocity')}Velocity</h1><div class="workspace-actions"><button class="button button--primary" type="button" data-action="generate-confluence-report">${icon('report')}Generate Confluence Report</button><button class="button" type="button" data-action="export-velocity-report">${icon('download')}Export</button></div></header>
      <nav class="workspace-tabs" aria-label="Velocity views">${[['analysis','Sprint Analysis','analysis'],['trends','Trends','trend'],['team','Team Performance','users']].map(([key,label,symbol])=>`<button type="button" data-action="velocity-view" data-view="${key}" class="${view===key?'is-active':''}" aria-pressed="${view===key}">${icon(symbol)}${label}</button>`).join('')}</nav>
      <div class="velocity-filters">
        <label>Team<select data-action="velocity-filter" data-field="velocityTeam"><option value="all">All teams</option>${teams.map(team=>`<option value="${safeText(team)}" ${uiState.velocityTeam===team?'selected':''}>${safeText(team)}</option>`).join('')}</select></label>
        <label>Current Sprint<select data-action="velocity-filter" data-field="velocitySprint"><option value="">${selection.current ? `${safeText(selection.current.label)} (In Progress)` : 'Latest in-progress sprint'}</option>${selected.filter(sprint=>sprint.id!==selection.current?.id).reverse().map(sprint=>`<option value="${safeText(sprint.id)}" ${current?.id===sprint.id?'selected':''}>${safeText(sprint.label)}${sprint.completed?' (Completed)':''}</option>`).join('')}</select></label>
        <label>Comparison<select data-action="velocity-filter" data-field="velocityComparison">${[3,5,7].map(count=>`<option value="${count}" ${count===comparisonCount?'selected':''}>Last ${count} completed${count===comparisonCount&&last3.length?` · ${safeText(last3.map(sprint=>sprint.label).join(', '))}`:''}</option>`).join('')}</select></label>
        <label>History<select data-action="velocity-filter" data-field="velocityHistory">${[7,10,14].map(count=>`<option value="${count}" ${count===historyCount?'selected':''}>${count} Sprints</option>`).join('')}</select></label>
      </div>
      <section class="velocity-kpis">
        ${headlineMetrics.map(([key,label,symbol,unit])=>`<article class="velocity-kpi kpi-${symbol}"><div class="kpi-icon">${icon(symbol)}</div><div><span>${label} (avg)</span><strong>${valueLabel(avg(last3.map(sprint=>calc(sprint,key))),{unit})}${unit==='sp'?' SP':''}</strong></div>${renderDelta(current,last3,key)}</article>`).join('')}
      </section>
      ${view!=='trends'?`<section class="velocity-delivery"><h2>${view==='team'?'Team Performance':'1. Sprint DELIVERY'} <span>— Last ${comparisonCount} Sprints${view==='team'?'':' (for Confluence)'}</span></h2><div class="velocity-delivery-grid">${renderComparisonTable(current,last3,view==='team'?'team':'delivery')}${renderDeliveryChart(current,last3)}</div></section>`:''}
      <div class="velocity-secondary-grid">
        ${view==='team'?renderBarChart('DEV vs QA completed SP',history,['devCompletedSP','qaCompletedSP'],['DEV','QA']):renderSprintTrend(history)}
        ${renderMetricsTrend(history)}
        <section class="velocity-insights"><h3>${icon('target')}Key Insights <span>(vs. completed avg)</span></h3>${headlineMetrics.map(([key,label])=>`<div class="insight-row"><span>${label}</span>${renderDelta(current,last3,key)}</div>`).join('')}</section>
      </div>
      <section class="velocity-history-panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Sprint</th><th>Dates</th><th>Planned SP</th><th>Completed SP</th><th>Predictability</th><th>Carry Over (SP)</th><th>Carry Over (%)</th><th>Work Items</th><th>Bug Ratio</th><th>Trend</th></tr></thead><tbody>${history.length?[...history].reverse().map(sprint=>`<tr class="${sprint.id===current?.id?'velocity-current-row':''}"><td><strong>${safeText(sprint.label)}${sprint.id===current?.id?' (Current)':''}</strong></td><td>${safeText(sprint.startDate||'—')}${sprint.endDate?` – ${safeText(sprint.endDate)}`:''}</td><td>${valueLabel(calc(sprint,'plannedSP'),{unit:'sp'})}</td><td>${valueLabel(calc(sprint,'completedSP'),{unit:'sp'})}</td><td>${metricPill(calc(sprint,'predictability'),'predictability')}</td><td>${valueLabel(calc(sprint,'carryOverSP'),{unit:'sp'})}</td><td>${metricPill(calc(sprint,'carryOverPct'),'carryOverPct')}</td><td>${valueLabel(calc(sprint,'workItemsCompleted'),{unit:'count'})}</td><td>${metricPill(calc(sprint,'bugRatio'),'bugRatio')}</td><td>${renderDelta(sprint,completed.filter(item=>item.id!==sprint.id&&String(item.startDate||'')<String(sprint.startDate||'')).slice(-3),'completedSP')}</td></tr>`).join(''):'<tr><td colspan="10">No sprint metrics yet.</td></tr>'}</tbody></table></div></section>
      <details class="velocity-editor-panel" data-ui-panel="velocity-editor" ${!sprints.length?'open':''}><summary>Sprint metrics · ${sprints.length} records</summary><div class="velocity-editor-actions"><button class="button" type="button" data-action="add-velocity-sprint">${icon('plus')}Add sprint data</button></div>${renderSprintEditor(sprints)}</details>
      <div class="velocity-report-output" data-report-output hidden><div class="section-header-inline"><h3>Confluence report</h3><button class="button" type="button" data-action="copy-confluence-report">Copy report</button></div><textarea class="field-input velocity-report-text" data-confluence-text rows="12" readonly></textarea></div>
    </section>
  `;
}

function renderDelta(current, completed, key) {
  const metric = METRICS.find(item=>item.key===key);
  const mean = avg(completed.map(sprint=>calc(sprint,key)));
  const value = current ? calc(current,key) : null;
  if (value===null || mean===null || (metric.unit!=='%'&&mean===0)) return '<span class="delta is-neutral">—</span>';
  const delta = metric.unit==='%' ? value-mean : (value-mean)/Math.abs(mean)*100;
  const good = metric.direction==='higher' ? delta>=0 : delta<=0;
  return `<span class="delta ${delta===0?'is-neutral':good?'is-positive':'is-negative'}" title="Current sprint vs completed sprint average">${delta===0?'':icon(delta>0?'up':'down')}${delta>0?'+':''}${delta.toLocaleString('en-GB',{maximumFractionDigits:1})}${metric.unit==='%'?' pp':'%'}</span>`;
}

function metricPill(value, key) {
  if(value===null) return '—';
  const bad = key==='predictability'?value<60:key==='bugRatio'?value>15:value>60;
  const warning = key==='predictability'?value<80:key==='bugRatio'?value>10:value>30;
  return `<span class="metric-pill ${bad?'is-danger':warning?'is-warning':''}">${valueLabel(value,{unit:'%'})}</span>`;
}

function kpi(label, value, hint) {
  return `<article class="velocity-kpi"><span>${safeText(label)}</span><strong>${safeText(value)}</strong><small>${safeText(hint)}</small></article>`;
}
function renderComparisonTable(current, last3, group = 'delivery') {
  const columns = [...(current ? [{sprint:current, label:'Current Sprint'}] : []), ...last3.map(s => ({sprint:s,label:s.label}))];
  return `<div class="table-wrap velocity-comparison-table"><table class="data-table"><thead><tr><th>KPI</th>${columns.map(c=>`<th>${safeText(c.label)}</th>`).join('')}<th>AVG (last 3)</th><th>TREND</th></tr></thead><tbody>
    ${METRICS.filter(metric=>group==='team'?['Productivity','DEV Team','QA Team'].includes(metric.group):metric.group==='Sprint Delivery').map(metric=> {
      const values = last3.map(s=>calc(s,metric.key));
      const mean = avg(values);
      const currentValue = current ? calc(current,metric.key) : null;
      const trend = current && currentValue !== null && mean !== null && (metric.unit==='%' || mean !== 0) ? (metric.unit==='%' ? currentValue-mean : ((currentValue - mean) / Math.abs(mean)) * 100) : null;
      const trendGood = trend === null ? '' : ((metric.direction === 'higher' ? trend >= 0 : trend <= 0) ? 'is-positive' : 'is-negative');
      return `<tr><th>${safeText(metric.label)}</th>${columns.map(c=>`<td>${valueLabel(calc(c.sprint,metric.key),metric)}</td>`).join('')}<td class="velocity-avg">${valueLabel(mean,metric)}</td><td class="velocity-trend ${trendGood}">${trend === null ? '—' : `${trend > 0 ? '+' : ''}${trend.toLocaleString('en-GB',{maximumFractionDigits:1})}${metric.unit==='%'?' pp':'%'}`}</td></tr>`;
    }).join('')}
    ${group==='team'?`<tr class="velocity-group-row"><th colspan="${columns.length + 3}">Work Distribution</th></tr>${DISTRIBUTION.map(([key,label])=>`<tr><th>${safeText(label)}</th>${columns.map(c=>`<td>${valueLabel(c.sprint.distribution?.[key] === '' || c.sprint.distribution?.[key] == null ? null : num(c.sprint.distribution[key]),{unit:'count'})}</td>`).join('')}<td>—</td><td>—</td></tr>`).join('')}`:''}
  </tbody></table></div>`;
}
function renderSprintEditor(sprints) {
  return `<div class="velocity-sprint-editor">
    ${sprints.length ? sprints.map(s=>`<article class="velocity-sprint-edit-card">
      <div class="velocity-sprint-edit-card__head"><div><strong>${safeText(s.label)}</strong><small>${safeText(s.startDate || 'No start date')} · ${s.completed ? 'Completed' : 'Current / in progress'}</small></div><div class="velocity-inline-actions"><label class="velocity-check"><input type="checkbox" data-action="toggle-velocity-sprint-completed" data-sprint-id="${safeText(s.id)}" ${s.completed ? 'checked' : ''}/> Completed</label><button class="button button--ghost-danger btn-xs" type="button" data-action="remove-velocity-sprint" data-sprint-id="${safeText(s.id)}">Delete</button></div></div>
      <div class="velocity-edit-grid">
        <label>Sprint name<input class="field-input" data-action="update-velocity-sprint" data-sprint-id="${safeText(s.id)}" data-field="label" value="${safeText(s.label)}"/></label>
        <label>Start date<input type="date" class="field-input" data-action="update-velocity-sprint" data-sprint-id="${safeText(s.id)}" data-field="startDate" value="${safeText(s.startDate || '')}"/></label>
        <label>End date<input type="date" class="field-input" data-action="update-velocity-sprint" data-sprint-id="${safeText(s.id)}" data-field="endDate" value="${safeText(s.endDate || '')}"/></label>
        <label>Team<input class="field-input" data-action="update-velocity-sprint" data-sprint-id="${safeText(s.id)}" data-field="team" value="${safeText(s.team || '')}"/></label>
        ${METRICS.filter(m=>!m.calculated).map(m=>`<label>${safeText(m.label)}<input type="number" min="0" step="0.1" class="field-input" data-action="update-velocity-metric" data-sprint-id="${safeText(s.id)}" data-field="${m.key}" value="${safeText(s[m.key] ?? '')}" placeholder="—"/></label>`).join('')}
        ${DISTRIBUTION.map(([key,label])=>`<label>${safeText(label)}<input type="number" min="0" step="1" class="field-input" data-action="update-velocity-distribution" data-sprint-id="${safeText(s.id)}" data-field="${key}" value="${safeText(s.distribution?.[key] ?? '')}" placeholder="—"/></label>`).join('')}
      </div>
    </article>`).join('') : '<div class="empty-card"><h3>No sprint metrics yet</h3><p>Add a sprint data record, then enter the metrics from your Excel report.</p></div>'}
  </div>`;
}
function chartGrid(max, percent = false) {
  return [0,.25,.5,.75,1].map(fraction=>`<line x1="38" x2="590" y1="${170-fraction*145}" y2="${170-fraction*145}" class="chart-grid"/><text x="30" y="${174-fraction*145}" text-anchor="end" class="chart-axis">${Math.round(max*fraction)}${percent?'%':''}</text>`).join('');
}

function renderDeliveryChart(current, completed) {
  const sprints = [...(current?[current]:[]), ...completed];
  if (!sprints.length) return '<div class="velocity-chart"><div class="velocity-chart-empty">No sprint data</div></div>';
  const metrics = [['plannedSP','PLANNED (SP)'],['completedSP','COMPLETED (SP)'],['carryOverSP','CARRY OVER (SP)']];
  const max = Math.max(1,...sprints.flatMap(sprint=>metrics.map(([key])=>calc(sprint,key)??0)))*1.15;
  const barWidth = Math.min(38,140/sprints.length);
  const bars = metrics.map(([key,label],metricIndex)=>sprints.map((sprint,sprintIndex)=>{
    const value = calc(sprint,key);
    if(value===null) return '';
    const x = 50+metricIndex*180+(160-sprints.length*(barWidth+3))/2+sprintIndex*(barWidth+3);
    const height = value/max*145;
    return `<rect x="${x}" y="${170-height}" width="${barWidth}" height="${height}" rx="2" class="chart-bar--${sprintIndex%4}"><title>${safeText(sprint.label)}: ${valueLabel(value,{unit:'sp'})}</title></rect><text x="${x+barWidth/2}" y="${164-height}" text-anchor="middle" class="chart-value">${valueLabel(value,{unit:'sp'})}</text>`;
  }).join('')+`<text x="${130+metricIndex*180}" y="191" text-anchor="middle" class="chart-label">${label}</text>`).join('');
  return `<div class="velocity-chart"><svg viewBox="0 0 610 210" role="img" aria-label="Sprint delivery comparison">${chartGrid(max)}${bars}</svg><div class="chart-legend">${sprints.map((sprint,index)=>`<span><i class="chart-dot chart-dot--${index%4}"></i>${safeText(sprint.label)}${sprint.id===current?.id?' (Current)':''}</span>`).join('')}</div></div>`;
}

function renderSprintTrend(sprints) {
  if(!sprints.length) return '<div class="velocity-chart"><h3>Sprint Trend</h3><div class="velocity-chart-empty">No sprint history</div></div>';
  const max = Math.max(1,...sprints.flatMap(sprint=>[calc(sprint,'plannedSP')??0,calc(sprint,'completedSP')??0]))*1.15;
  const groupWidth = 540/sprints.length;
  const barWidth = Math.min(42,groupWidth*.7);
  const bars = sprints.map((sprint,index)=>{
    const x = 44+index*groupWidth+(groupWidth-barWidth)/2;
    return [['plannedSP','#63717f'],['completedSP','#14d7ad']].map(([key,color])=>{
      const value = calc(sprint,key);
      if(value===null) return '';
      const height = value/max*145;
      return `<rect x="${x}" y="${170-height}" width="${barWidth}" height="${height}" rx="2" fill="${color}" ${key==='plannedSP'?'opacity=".5"':''}><title>${safeText(sprint.label)} ${key}: ${valueLabel(value,{unit:'sp'})}</title></rect><text x="${x+barWidth/2}" y="${key==='completedSP'?Math.max(28,170-height+14):164-height}" text-anchor="middle" class="chart-value">${valueLabel(value,{unit:'sp'})}</text>`;
    }).join('')+`<text x="${x+barWidth/2}" y="192" text-anchor="middle" class="chart-label">${safeText(sprint.label)}</text>`;
  }).join('');
  return `<div class="velocity-chart"><h3>Sprint Trend <span>(Last ${sprints.length} Sprints)</span></h3><svg viewBox="0 0 610 210" role="img" aria-label="Planned and completed story points">${chartGrid(max)}${bars}</svg><div class="chart-legend"><span><i class="chart-dot" style="background:#14d7ad"></i>Completed SP</span><span><i class="chart-dot" style="background:#63717f"></i>Planned SP</span></div></div>`;
}

function renderMetricsTrend(sprints) {
  if(!sprints.length) return '<div class="velocity-chart"><h3>Key Metrics Trend</h3><div class="velocity-chart-empty">No sprint history</div></div>';
  const max = Math.max(100,...sprints.flatMap(sprint=>[calc(sprint,'predictability')??0,calc(sprint,'bugRatio')??0]));
  const x = index=>50+(sprints.length===1?260:index*530/(sprints.length-1));
  const y = value=>170-value/max*145;
  const lines = [['predictability','#14d7ad'],['bugRatio','#b064ed']].map(([key,color])=>{
    const segments = [];
    let points = [];
    sprints.forEach((sprint,index)=>{
      const value = calc(sprint,key);
      if(value===null) { if(points.length) segments.push(points); points=[]; }
      else points.push(`${x(index)},${y(value)}`);
    });
    if(points.length) segments.push(points);
    return segments.map(segment=>`<polyline points="${segment.join(' ')}" fill="none" stroke="${color}" stroke-width="3"/>`).join('')+sprints.map((sprint,index)=>{const value=calc(sprint,key); return value===null?'':`<circle cx="${x(index)}" cy="${y(value)}" r="4" fill="${color}"><title>${safeText(sprint.label)} ${key}: ${valueLabel(value,{unit:'%'})}</title></circle>`;}).join('');
  }).join('');
  return `<div class="velocity-chart"><h3>Key Metrics Trend <span>(Last ${sprints.length} Sprints)</span></h3><svg viewBox="0 0 610 210" role="img" aria-label="Predictability and bug ratio">${chartGrid(max,true)}${lines}${sprints.map((sprint,index)=>`<text x="${x(index)}" y="192" text-anchor="middle" class="chart-label">${safeText(sprint.label)}</text>`).join('')}</svg><div class="chart-legend"><span><i class="chart-dot" style="background:#14d7ad"></i>Predictability</span><span><i class="chart-dot chart-dot--3"></i>Bug Ratio</span></div></div>`;
}

function renderBarChart(title, sprints, keys, labels) {
  if (!sprints.length) return `<div class="velocity-chart"><h3>${safeText(title)}</h3><div class="velocity-chart-empty">Complete sprint records to see this chart.</div></div>`;
  const values = sprints.flatMap(s=>keys.map(k=>calc(s,k) ?? 0));
  const max = Math.max(...values,1);
  const width=620, height=230, left=38, top=18, bottom=42, chartH=height-top-bottom;
  const groupW=(width-left-12)/sprints.length, barW=Math.min(18,groupW/(keys.length+1));
  const bars=sprints.map((s,i)=>keys.map((key,j)=>{
    const v=calc(s,key) ?? 0, h=v/max*chartH, x=left+i*groupW+(groupW-(barW*keys.length+4*(keys.length-1)))/2+j*(barW+4);
    return `<rect x="${x}" y="${top+chartH-h}" width="${barW}" height="${h}" rx="3" class="chart-bar chart-bar--${j}"><title>${safeText(s.label)} · ${safeText(labels[j])}: ${valueLabel(v,{unit:'sp'})}</title></rect>`;
  }).join('')+`<text x="${left+i*groupW+groupW/2}" y="${height-18}" text-anchor="middle" class="chart-label">${safeText(s.label)}</text>`).join('');
  const grid=[0,.25,.5,.75,1].map(n=>`<line x1="${left}" x2="${width-8}" y1="${top+chartH*(1-n)}" y2="${top+chartH*(1-n)}" class="chart-grid"/><text x="${left-8}" y="${top+chartH*(1-n)+4}" text-anchor="end" class="chart-axis">${Math.round(max*n)}</text>`).join('');
  return `<div class="velocity-chart"><h3>${safeText(title)}</h3><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${safeText(title)}">${grid}${bars}</svg><div class="chart-legend">${labels.map((l,i)=>`<span><i class="chart-dot chart-dot--${i}"></i>${safeText(l)}</span>`).join('')}</div></div>`;
}
function renderLineChart(title, sprints, key, unit) {
  if (!sprints.length) return `<div class="velocity-chart"><h3>${safeText(title)}</h3><div class="velocity-chart-empty">Complete sprint records to see this chart.</div></div>`;
  const vals=sprints.map(s=>calc(s,key) ?? 0), max=Math.max(...vals,1)*1.1, min=Math.min(0,...vals);
  const width=620,height=230,left=40,right=16,top=18,bottom=42,chartH=height-top-bottom,chartW=width-left-right;
  const points=vals.map((v,i)=>`${left+(sprints.length===1?chartW/2:i*chartW/(sprints.length-1))},${top+chartH-(v-min)/(max-min||1)*chartH}`).join(' ');
  const circles=vals.map((v,i)=>{const x=left+(sprints.length===1?chartW/2:i*chartW/(sprints.length-1)),y=top+chartH-(v-min)/(max-min||1)*chartH;return `<circle cx="${x}" cy="${y}" r="4" class="chart-point"><title>${safeText(sprints[i].label)}: ${valueLabel(v,{unit})}</title></circle><text x="${x}" y="${height-18}" text-anchor="middle" class="chart-label">${safeText(sprints[i].label)}</text>`}).join('');
  return `<div class="velocity-chart"><h3>${safeText(title)}</h3><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${safeText(title)}"><line x1="${left}" x2="${width-right}" y1="${top+chartH}" y2="${top+chartH}" class="chart-grid"/><polyline points="${points}" class="chart-line"/>${circles}</svg></div>`;
}
export function buildConfluenceReport(sprints, count = 3) {
  const completed=getOrdered(sprints).filter(s=>s.completed).slice(-count);
  const lines=['Sprint Delivery & Velocity Report','',`Reporting window: ${completed.map(s=>s.label).join(', ') || 'No completed sprint data'}`,'','| KPI | '+completed.map(s=>s.label).join(' | ')+' | AVG |','|---|'+completed.map(()=> '---:').join('|')+'|---:|'];
  METRICS.forEach(m=>{const vals=completed.map(s=>calc(s,m.key));lines.push(`| ${m.label} | ${vals.map(v=>valueLabel(v,m)).join(' | ')} | ${valueLabel(avg(vals),m)} |`);});
  lines.push('','Work Distribution','', '| Sprint | '+DISTRIBUTION.map(d=>d[1]).join(' | ')+' |','|---|'+DISTRIBUTION.map(()=> '---:').join('|')+'|');
  completed.forEach(s=>lines.push(`| ${s.label} | ${DISTRIBUTION.map(([k])=>num(s.distribution?.[k])).join(' | ')} |`));
  return lines.join('\n');
}
