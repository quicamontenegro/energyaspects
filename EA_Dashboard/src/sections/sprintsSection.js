import { escapeHtml, formatStatus, initials } from '../utils/format.js';
import { icon } from '../utils/icons.js';

const TICKET_STATUSES = ['todo', 'inprogress', 'inreview', 'testing', 'done', 'blocked', 'onhold', 'deployed'];
const PRIORITY_OPTIONS = ['High', 'Medium', 'Low'];

const PRIORITY_COLOR = {
  High: { bg: '#fee2e2', text: '#b91c1c' },
  Medium: { bg: '#fef3c7', text: '#92400e' },
  Low: { bg: '#dcfce7', text: '#166534' },
};

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

const NOTE_COLORS = ['', '#4f46e5', '#0f766e', '#0891b2', '#d97706', '#dc2626', '#be185d', '#334155'];

export function renderSprintsSection(state, uiState) {
  const sprintMembers = getSprintMembers(state.spTeamMembers);
  const sprintNotes = Array.isArray(state.spNotes) ? state.spNotes : [];
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
  
  const globalEpics = Array.isArray(state.spEpics) ? state.spEpics : [];
  const today = new Date().toLocaleDateString('en-CA');
  const active = sprintEntries.find(entry=>entry.index===uiState.selectedSprintIndex) || sprintEntries.find(({sprint})=>sprint.startDate<=today&&sprint.endDate>=today) || sprintEntries[0];
  const activePosition = sprintEntries.indexOf(active);
  const sprintView = uiState.sprintView || 'board';
  return `
    <section class="panel-stack sprint-panel-stack sprint-view-${sprintView}">
      <header class="workspace-titlebar"><h1>${icon('sprints')}Sprints</h1><button class="button button--primary" type="button" data-action="open-sprint-panel" data-panel="create">${icon('plus')}New Sprint</button></header>
      <div class="sprint-toolbar"><div class="sprint-selector"><button class="button" type="button" data-action="select-sprint" data-index="${sprintEntries[activePosition+1]?.index??''}" ${activePosition+1>=sprintEntries.length?'disabled':''} title="Previous sprint" aria-label="Previous sprint">${icon('left')}</button><select aria-label="Sprint" data-action="select-sprint">${sprintEntries.length?sprintEntries.map(({sprint,index})=>`<option value="${index}" ${active?.index===index?'selected':''}>${escapeHtml(sprint.name||'Untitled sprint')}</option>`).join(''):'<option>No sprints</option>'}</select><button class="button" type="button" data-action="select-sprint" data-index="${sprintEntries[activePosition-1]?.index??''}" ${activePosition<=0?'disabled':''} title="Next sprint" aria-label="Next sprint">${icon('right')}</button>${active?`<span class="sprint-toolbar-date">${icon('calendar')}${escapeHtml([active.sprint.startDate,active.sprint.endDate].filter(Boolean).join(' – ')||'Dates not set')}</span><span class="sprint-state">${active.sprint.endDate&&active.sprint.endDate<today?'Completed':active.sprint.startDate&&active.sprint.startDate>today?'Planned':'In Progress'}</span>`:''}</div><div class="workspace-actions"><button class="button" type="button" data-action="open-sprint-panel" data-panel="history">${icon('history')}Sprint History</button><button class="button" type="button" data-action="open-sprint-panel" data-panel="epics">${icon('layers')}Manage Epics</button><button class="button" type="button" data-action="open-sprint-panel" data-panel="members">${icon('users')}Team</button><button class="button" type="button" data-action="open-sprint-panel" data-panel="notes">${icon('report')}Notes</button></div></div>
      ${active?renderSprintOverview(active.sprint):''}
      <nav class="workspace-tabs" aria-label="Sprint views">${[['board','Team Board','users'],['notes','Sprint Notes','report']].map(([key,label,symbol])=>`<button type="button" class="${sprintView===key?'is-active':''}" data-action="sprint-view" data-view="${key}" aria-pressed="${sprintView===key}">${icon(symbol)}${label}</button>`).join('')}</nav>
      ${active?renderSprintCard(active.index,active.sprint,sprintMembers,uiState,{isCollapsed:false,sprintKey:getSprintUiKey(active.sprint,active.index),quickLinks:state.spQuickLinks || []}):`<div class="empty-card"><h3>No sprints yet</h3></div>${sprintView === 'notes' ? renderSprintQuickLinks(state.spQuickLinks || []) : ''}`}
      <details class="sprint-management-panel" data-sprint-panel="epics"><summary>Global epics · ${globalEpics.length}</summary><section class="sprint-epics-library">
        <div class="section-header-inline">
          <div><p class="section-kicker">Reusable library</p><h2>Global epics</h2><p class="velocity-subtitle">Create an epic once and reuse its title and Jira link across sprints.</p></div>
          <span class="sprint-members-count">${globalEpics.length} epics</span>
        </div>
        <datalist id="global-epic-options">${globalEpics.map(epic => `<option value="${escapeHtml(epic.title || '')}"></option>`).join('')}</datalist>
        <div class="global-epics-list">${globalEpics.map(epic => `<div class="global-epic-chip"><span>${escapeHtml(epic.title || '')}</span>${epic.url ? `<a href="${escapeHtml(epic.url)}" target="_blank" rel="noopener noreferrer">Open Jira ↗</a>` : ''}<button class="btn-icon" type="button" data-action="remove-global-epic" data-epic-id="${escapeHtml(epic.id || '')}" title="Remove epic">×</button></div>`).join('') || '<p class="velocity-subtitle">No global epics yet. Add your first epic below.</p>'}</div>
        <div class="global-epic-form" data-form="global-epic-create">
          <input class="field-input field-input--sm" name="title" placeholder="Epic name (e.g. Global Search V2)" required />
          <input class="field-input field-input--sm" name="url" type="url" placeholder="Jira epic URL (optional)" />
          <button class="button button--secondary button--sm" type="button" data-action="add-global-epic">Add epic</button>
        </div>
      </section></details>
      <details class="sprint-management-panel" data-sprint-panel="members"><summary>Team members · ${sprintMembers.length}</summary><section class="sprint-members-card">
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
      </section></details>

      <details class="sprint-management-panel shared-notes-panel" data-sprint-panel="notes"><summary>Shared notes · ${sprintNotes.length}</summary><section class="shared-notes-workspace" aria-label="Shared notes">
        <div class="shared-notes-toolbar">
          <h2>Shared notes <span>${sprintNotes.length}</span></h2>
          <button class="button button--primary" type="button" data-action="open-shared-note-create" aria-controls="shared-note-create">${icon('plus')}New note</button>
        </div>
        <details class="shared-note-compose" id="shared-note-create" data-ui-panel="shared-note-create">
          <summary>New shared note</summary>
          <div data-form="sprint-note-create">
            ${renderSharedNoteTitle(uiState.sharedNoteTitleDrafts?.get('create') || '', 'create')}
            ${renderSprintNoteEditor({ noteId: 'create', text: uiState.sharedNoteDrafts?.get('create') || '', placeholder: 'Write a shared note...' })}
            <div class="sprint-note-item__actions"><button class="button" type="button" data-action="cancel-shared-note-create">Cancel</button><button class="button button--primary" type="button" data-action="add-sprint-note">Save note</button></div>
          </div>
        </details>
        <div class="shared-notes-search"><input class="field-input" type="search" placeholder="Search notes..." aria-label="Search shared notes" data-action="search-shared-notes" value="${escapeHtml(uiState.sharedNotesQuery || '')}" /><output data-shared-notes-results aria-live="polite">${sprintNotes.length} notes</output></div>
        <div class="shared-notes-list">
          ${sprintNotes.length ? sprintNotes.map((note, index) => renderSprintNoteItem(note, uiState, index, sprintNotes.length)).join('') : `<div class="shared-notes-empty">${icon('report')}<h3>No shared notes yet</h3></div>`}
        </div>
        <div class="shared-notes-empty" data-shared-notes-no-results hidden><h3>No matching notes</h3></div>
      </section></details>

      <details class="sprint-management-panel" data-sprint-panel="create" ${!sprints.length?'open':''}><summary>Create sprint</summary><section class="sprint-backlog-card">
        <div class="section-header-inline">
          <div>
            <p class="section-kicker">Sprint Plans</p>
            <h2>Sprint backlog</h2>
          </div>
          <div class="sprint-backlog-meta">
            <span class="sprint-backlog-kpi">${sprints.length} sprints</span>
          </div>
        </div>
        <div class="sprint-create-form" data-form="sprint-create">
          <input name="name" class="field-input field-input--sm" type="text" placeholder="Sprint name" />
          <input name="startDate" class="field-input field-input--sm" type="date" />
          <input name="endDate" class="field-input field-input--sm" type="date" />
          <button class="button button--secondary button--sm" type="button" data-action="add-sprint-plan">Add sprint</button>
        </div>
      </section></details>
      <details class="sprint-management-panel" data-sprint-panel="history"><summary>Sprint history · ${sprints.length}</summary><div class="sprint-history-list">${sprintEntries.map(({sprint,index})=>renderSprintHistoryItem(sprint,index,active?.index===index,uiState.editingHistorySprintId===sprint.id)).join('')}</div></details>
    </section>
  `;
}

function getSprintUiKey(sprint, sprintIndex) {
  const sprintId = String(sprint?.id || '').trim();
  if (sprintId) return sprintId;
  const fallback = [
    String(sprint?.name || '').trim(),
    String(sprint?.startDate || '').trim(),
    String(sprint?.endDate || '').trim(),
    String(sprint?.createdAt || '').trim(),
    String(sprintIndex),
  ].join('|');
  return fallback;
}

function renderSprintNoteItem(note, uiState, noteIndex, noteCount) {
  const noteId = escapeHtml(note?.id || '');
  const title = String(note?.title || '').trim() || 'Untitled note';
  const noteTextRaw = uiState.sharedNoteDrafts?.get(String(note?.id || '')) ?? String(note?.text || '');
  const noteDate = formatNoteDate(note?.createdAt);
  const noteLinkValue = String(note?.link || '').trim();
  const noteLinkHref = resolveNoteHref(noteLinkValue);
  const isEditing = uiState?.editingSprintNoteId === String(note?.id || '');

  if (isEditing) {
    return `
      <article class="sprint-note-item shared-note-entry sprint-note-item--editing" data-shared-note-id="${noteId}">
        <div class="shared-note-heading"><span>${icon('calendar')}${escapeHtml(noteDate)}</span><strong>Editing note</strong></div>
        <form class="sprint-note-edit-form" data-form="sprint-note-edit" data-note-id="${noteId}">
          ${renderSharedNoteTitle(uiState.sharedNoteTitleDrafts?.get(String(note?.id || '')) ?? String(note?.title || ''), note?.id || '')}
          ${renderSprintNoteEditor({
            noteId,
            text: noteTextRaw,
            placeholder: 'Note text'
          })}
        </form>
        <div class="sprint-note-item__actions">
          <button class="button button--secondary button--sm" type="button" data-action="cancel-edit-sprint-note" data-note-id="${noteId}">Cancel</button>
          <button class="button button--primary button--sm" type="button" data-action="save-edit-sprint-note" data-note-id="${noteId}">Save changes</button>
        </div>
      </article>
    `;
  }

  return `
    <article class="sprint-note-item shared-note-entry" data-shared-note-id="${noteId}">
      <div class="sprint-note-item__meta">
        <div class="shared-note-identity"><h3>${escapeHtml(title)}</h3><span class="shared-note-date">${icon('calendar')}${escapeHtml(noteDate)}</span></div>
        <div class="sprint-note-item__action-icons">
          <button class="button" type="button" data-action="move-sprint-note" data-note-id="${noteId}" data-direction="up" title="Move note earlier" aria-label="Move ${escapeHtml(title)} earlier" ${noteIndex===0?'disabled':''}>${icon('up')}</button>
          <button class="button" type="button" data-action="move-sprint-note" data-note-id="${noteId}" data-direction="down" title="Move note later" aria-label="Move ${escapeHtml(title)} later" ${noteIndex===noteCount-1?'disabled':''}>${icon('down')}</button>
          <button class="button" type="button" data-action="edit-sprint-note" data-note-id="${noteId}" title="Edit note" aria-label="Edit ${escapeHtml(title)}">
            ${icon('edit')}
          </button>
          <button class="button shared-note-delete" type="button" data-action="remove-sprint-note" data-note-id="${noteId}" title="Delete note" aria-label="Delete ${escapeHtml(title)}">
            ${icon('remove')}
          </button>
        </div>
      </div>
      <div class="sprint-note-item__text">${renderSprintNoteBody(note?.text || '')}</div>
      ${noteLinkHref ? `<a class="sprint-note-link" href="${escapeHtml(noteLinkHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(noteLinkValue)}</a>` : ''}
      <details class="shared-note-expand" data-ui-panel="shared-note-reading-${noteId}"><summary><span class="shared-note-read-more">Read More ${icon('down')}</span><span class="shared-note-read-less">Show Less ${icon('up')}</span></summary></details>
    </article>
  `;
}

function renderSharedNoteTitle(value, noteId) {
  return `<label class="shared-note-title-field">Title<input class="field-input" type="text" name="title" placeholder="Note title" value="${escapeHtml(value)}" data-action="draft-shared-note-title" data-note-id="${escapeHtml(noteId)}" required /></label>`;
}

function renderSprintNoteEditor({ noteId, text, placeholder }) {
  const rawValue = String(text || '');
  const initialHtml = renderSprintNoteEditorHtml(rawValue);

  return `
    <div class="sprint-note-editor" data-note-editor="${escapeHtml(String(noteId || ''))}">
      <div class="sprint-note-toolbar" role="group" aria-label="Note formatting">
        ${[['bold','Bold'],['italic','Italic'],['code','Code'],['link','Link'],['list','Bullet list']].map(([format,label]) => `<button class="sprint-note-tool" type="button" data-action="format-sprint-note-text" data-format="${format}" title="${label}" aria-label="${label}">${icon(format)}</button>`).join('')}
      </div>
      <input type="hidden" name="text" value="${escapeHtml(rawValue)}" />
      <div class="sprint-note-color-row" role="group" aria-label="Note color">
        ${NOTE_COLORS.map((swatchColor) => renderNoteColorSwatch(swatchColor)).join('')}
      </div>
      <div class="field-input field-input--sm sprint-note-editor__input" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${escapeHtml(placeholder)}" data-placeholder="${escapeHtml(placeholder)}">${initialHtml}</div>
    </div>
  `;
}

function renderNoteColorSwatch(color) {
  const normalized = normalizeNoteColor(color);
  const label = normalized ? `Use ${normalized}` : 'No color';
  const swatchStyle = normalized ? ` style="--swatch:${escapeHtml(normalized)}"` : '';
  return `<button class="note-color-swatch" type="button" data-action="select-sprint-note-color" data-color="${escapeHtml(normalized)}" title="${label}"${swatchStyle}></button>`;
}

function normalizeNoteColor(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : '';
}

function renderSprintNoteBody(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (isRichTextHtml(raw)) {
    return linkifyUrlsInHtml(sanitizeRichTextHtml(raw));
  }
  return renderSprintNoteRichText(raw);
}

function renderSprintNoteEditorHtml(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (isRichTextHtml(raw)) {
    return sanitizeRichTextHtml(raw);
  }
  return renderSprintNoteRichText(raw);
}

function isRichTextHtml(value) {
  return /<(p|br|strong|b|em|i|code|ul|ol|li|a|span|font|div|h[1-6]|u|s)(\s|\/|>)/i.test(String(value || ''));
}

function sanitizeRichTextHtml(value) {
  let html = String(value || '');
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  html = html.replace(/\s+on\w+=("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  html = html.replace(/\s+(?:bgcolor|background)=("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  html = html.replace(/\s+style=("[^"]*"|'[^']*'|[^\s>]+)/gi, (match, styleContent) => {
    const rawStyle = styleContent.replace(/^["']|["']$/g, '');
    const cleanStyle = sanitizeInlineStyle(rawStyle);
    return cleanStyle ? ` style="${escapeHtml(cleanStyle)}"` : '';
  });
  html = html.replace(/href=["']\s*javascript:[^"']*["']/gi, 'href="#"');
  return html;
}

function sanitizeInlineStyle(styleString) {
  if (!styleString) return '';
  const declarations = styleString.split(';');
  const safeDeclarations = [];
  const allowedProps = new Set(['color', 'text-decoration', 'font-weight', 'font-style']);
  for (const decl of declarations) {
    const parts = decl.split(':');
    if (parts.length < 2) continue;
    const prop = parts[0].trim().toLowerCase();
    const val = parts.slice(1).join(':').trim();
    if (allowedProps.has(prop) && !/javascript:|url\(|expression\(/i.test(val)) {
      safeDeclarations.push(`${prop}: ${val}`);
    }
  }
  return safeDeclarations.join('; ');
}

function linkifyUrlsInHtml(html) {
  const parts = String(html || '').split(/(<[^>]+>)/g);
  return parts
    .map((part) => {
      if (!part || part.startsWith('<')) {
        return part;
      }
      return linkifyPlainUrls(part);
    })
    .join('');
}

function linkifyPlainUrls(text) {
  return String(text || '').replace(/(https?:\/\/[^\s<]+)/gi, (rawUrl) => {
    const safeHref = resolveNoteHref(rawUrl);
    if (!safeHref) return rawUrl;
    return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(rawUrl)}</a>`;
  });
}

function renderSprintNoteRichText(value) {
  const source = String(value || '').trim();
  if (!source) {
    return '';
  }

  const lines = source.split('\n');
  const html = [];
  let listItems = [];

  const flushList = () => {
    if (!listItems.length) return;
    html.push(`<ul>${listItems.map((item) => `<li>${item}</li>`).join('')}</ul>`);
    listItems = [];
  };

  lines.forEach((line) => {
    const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (bulletMatch) {
      listItems.push(formatNoteInlineMarkup(bulletMatch[1]));
      return;
    }

    if (!line.trim()) {
      flushList();
      return;
    }

    flushList();
    html.push(`<p>${formatNoteInlineMarkup(line)}</p>`);
  });

  flushList();
  return html.join('');
}

function formatNoteInlineMarkup(rawText) {
  let text = escapeHtml(String(rawText || ''));

  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, hrefRaw) => {
    const href = resolveNoteHref(hrefRaw);
    if (!href) return label;
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  text = linkifyPlainUrls(text);

  return text;
}

function formatNoteDate(value) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) {
    return 'No date';
  }
  return date.toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function resolveNoteHref(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^www\./i.test(raw)) return `https://${raw}`;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) return `https://${raw}`;
  return '';
}

function renderSprintCard(sprintIndex, sprint, sprintMembers, uiState, options = {}) {
  const columnAssignees = getSprintColumnAssignees(sprint, sprintMembers);
  const grouped = groupSprintTicketsByAssignee(sprint.tickets || [], columnAssignees);
  const visibleAssignees = Object.keys(grouped);
  const sprintBoardNotes = Array.isArray(sprint?.notesBoard) ? sprint.notesBoard : [];
  const isEditingSprint = uiState.editingSprintIndex === sprintIndex;
  const isReorderingTickets = uiState.reorderingSprintIndex === sprintIndex;
  const isCollapsed = options.isCollapsed === true;
  const sprintKey = String(options.sprintKey || '').trim();
  const collapseLabel = isCollapsed ? 'Expand sprint' : 'Collapse sprint';

  return `
    <article class="sprint-card">
      <div class="sprint-card__top">
        <div class="sprint-card__head">
          <h3 class="sprint-card__title">${escapeHtml(sprint.name || 'Untitled sprint')}</h3>
          <div class="sprint-card__actions">
            <button class="btn-icon ${isReorderingTickets ? 'is-active' : ''}" type="button" data-action="toggle-sprint-ticket-reorder-mode" data-sprint-index="${sprintIndex}" title="Reorder tickets" aria-label="Reorder tickets">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h11M8 12h11M8 18h11"/><path d="M4 8l2-2 2 2M6 6v12M4 16l2 2 2-2"/></svg>
            </button>
            <button class="btn-icon btn-icon--edit" type="button" data-action="edit-sprint-plan" data-sprint-index="${sprintIndex}" title="Edit sprint">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon" type="button" data-action="remove-sprint-plan" data-sprint-index="${sprintIndex}" title="Delete sprint">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h12zM10 11v6M14 11v6"/></svg>
            </button>
          </div>
        </div>
      </div>

      <div class="sprint-card__body ${isCollapsed ? 'is-collapsed' : ''}">
        ${isEditingSprint ? renderSprintEditForm(sprintIndex, sprint) : ''}
        ${isReorderingTickets ? '<div class="sprint-reorder-hint">Modo de ordenacao ativo: arrasta os tickets para cima/baixo e larga para guardar.</div>' : ''}

        <div class="sprint-board">
          ${visibleAssignees.length
            ? visibleAssignees.map((assignee) => renderAssigneeColumn(sprintIndex, assignee, grouped[assignee] || [], sprintMembers, uiState)).join('')
            : '<div class="sprint-board__empty">No sprint members configured yet.</div>'}
        </div>

        ${uiState.sprintView === 'notes' ? `<div class="sprint-lower-grid"><div class="sprint-card-notesboard">
          <div class="sprint-card-notesboard__head">
            <h4>Sprint notes</h4>
            <span class="sprint-members-count">${sprintBoardNotes.length} notes</span>
          </div>

          <div class="sprint-card-notesboard__list">
            ${sprintBoardNotes.length
              ? sprintBoardNotes.map((note) => renderSprintBoardNoteItem(note, sprintIndex, uiState)).join('')
              : '<article class="empty-card sprint-card-notesboard__empty"><h3>No notes yet</h3><p>Add notes specific to this sprint.</p></article>'}
          </div>

          <div class="sprint-card-notesboard__form" data-form="sprint-board-note-create" data-sprint-index="${sprintIndex}">
            ${renderSprintNoteEditor({
              noteId: `sprint-${sprintIndex}-create`,
              text: '',
              placeholder: 'Add note for this sprint...'
            })}
            <button class="button button--secondary button--sm" type="button" data-action="add-sprint-board-note" data-sprint-index="${sprintIndex}">Add note</button>
          </div>
        </div>${renderSprintQuickLinks(options.quickLinks || [])}</div>` : ''}
      </div>
    </article>
  `;
}

function renderSprintOverview(sprint) {
  const tickets = Array.isArray(sprint?.tickets) ? sprint.tickets : [];
  const totalSP = tickets.reduce((sum, ticket) => {
    const points = Number(ticket?.storyPoints);
    return sum + (Number.isFinite(points) && points > 0 ? points : 0);
  }, 0);
  const completedTickets = tickets.filter(ticket=>['done','deployed'].includes(String(ticket.status||'').toLowerCase()));
  const completedSP = completedTickets.reduce((sum,ticket)=>sum+Math.max(0,Number(ticket.storyPoints)||0),0);
  const progress = totalSP ? Math.round(completedSP/totalSP*100) : 0;
  const members = getSprintColumnAssignees(sprint,[]).filter(Boolean).length;
  return `
    <section class="sprint-summary-band"><div class="sprint-summary-intro"><h2>${escapeHtml(sprint.name||'Untitled sprint')}</h2><div class="sprint-goal">${icon('target')}<div><strong>Sprint goal</strong><p>${escapeHtml(sprint.goal||sprint.description||'No sprint goal set')}</p></div></div></div><div class="sprint-summary-metric">${icon('layers')}<div><strong>${tickets.length}</strong><span>Tickets</span></div></div><div class="sprint-summary-metric">${icon('users')}<div><strong>${members}</strong><span>Team members</span></div></div><div class="sprint-summary-metric">${icon('zap')}<div><strong>${formatStoryPointsDisplay(totalSP)||'0'} SP</strong><span>Assigned</span></div></div><div class="sprint-summary-metric sprint-summary-progress">${icon('target')}<div><strong>${progress}%</strong><span>Progress</span></div><progress max="${totalSP||1}" value="${completedSP}" aria-label="Completed story points"></progress><small>${formatStoryPointsDisplay(completedSP)||0} / ${formatStoryPointsDisplay(totalSP)||0} SP</small></div>
    </section>
  `;
}

function renderQuickLinkForm(label = '', url = '', linkId = '', creating = false) {
  return `<form data-form="sprint-quick-link-edit"><label>Title<input class="field-input" name="label" value="${escapeHtml(label)}" required /></label><label>URL<input class="field-input" type="url" name="url" value="${escapeHtml(url)}" required /></label><div class="sprint-quick-link-edit__actions"><button class="button button--sm" type="button" data-action="cancel-sprint-quick-link">Cancel</button><button class="button button--primary button--sm" type="button" data-action="${creating?'add-sprint-quick-link':'save-sprint-quick-link'}" data-link-id="${escapeHtml(linkId)}">Save</button></div></form>`;
}

function renderSprintQuickLinks(links) {
  return `<aside class="sprint-quick-links"><div class="sprint-quick-links__head"><h3>${icon('layers')}Quick Links</h3><button class="btn-icon" type="button" data-action="open-sprint-quick-link-create" title="Add link" aria-label="Add quick link">${icon('plus')}</button></div><details class="sprint-quick-link-edit sprint-quick-link-create" data-ui-panel="quick-link-create"><summary>New link</summary>${renderQuickLinkForm('', '', '', true)}</details>${links.map(({label,url,id})=>`<div class="sprint-quick-link-row"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}${icon('right')}</a><details class="sprint-quick-link-edit" data-ui-panel="quick-link-${escapeHtml(id)}"><summary title="Edit link" aria-label="Edit ${escapeHtml(label)}">${icon('edit')}</summary>${renderQuickLinkForm(label, url, id)}</details><button class="btn-icon sprint-quick-link-delete" type="button" data-action="remove-sprint-quick-link" data-link-id="${escapeHtml(id)}" title="Delete link" aria-label="Delete ${escapeHtml(label)}">${icon('remove')}</button></div>`).join('')||'<p>No quick links yet.</p>'}</aside>`;
}

function renderSprintBoardNoteItem(note, sprintIndex, uiState) {
  const noteId = escapeHtml(note?.id || '');
  const noteRawId = String(note?.id || '').trim();
  const noteDate = formatNoteDate(note?.createdAt);
  const noteLinkValue = String(note?.link || '').trim();
  const noteLinkHref = resolveNoteHref(noteLinkValue);
  const editKey = `${sprintIndex}:${noteRawId}`;
  const isEditing = uiState?.editingSprintBoardNoteKey === editKey;

  if (isEditing) {
    return `
      <article class="sprint-note-item sprint-note-item--inline sprint-note-item--editing">
        <form class="sprint-note-edit-form" data-form="sprint-board-note-edit" data-sprint-index="${sprintIndex}" data-note-id="${noteId}">
          ${renderSprintNoteEditor({
            noteId: `sprint-${sprintIndex}-note-${noteId}`,
            text: String(note?.text || ''),
            placeholder: 'Note text'
          })}
        </form>
        <div class="sprint-note-item__actions">
          <button class="button button--secondary button--sm" type="button" data-action="cancel-edit-sprint-board-note" data-sprint-index="${sprintIndex}" data-note-id="${noteId}">Cancel</button>
          <button class="button button--primary button--sm" type="button" data-action="save-edit-sprint-board-note" data-sprint-index="${sprintIndex}" data-note-id="${noteId}">Save</button>
        </div>
      </article>
    `;
  }

  return `
    <article class="sprint-note-item sprint-note-item--inline">
      <div class="sprint-note-item__meta">
        <span class="sprint-date-range">${escapeHtml(noteDate)}</span>
        <div class="sprint-note-item__action-icons">
          <button class="btn-icon btn-icon--edit" type="button" data-action="edit-sprint-board-note" data-sprint-index="${sprintIndex}" data-note-id="${noteId}" title="Edit note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon" type="button" data-action="remove-sprint-board-note" data-sprint-index="${sprintIndex}" data-note-id="${noteId}" title="Delete note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 6l-1.4 14H6.4L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
        </div>
      </div>
      <div class="sprint-note-item__text">${renderSprintNoteBody(note?.text || '')}</div>
      ${noteLinkHref ? `<a class="sprint-note-link" href="${escapeHtml(noteLinkHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(noteLinkValue)}</a>` : ''}
    </article>
  `;
}

function renderAssigneeColumn(sprintIndex, assignee, items, sprintMembers, uiState) {
  const member = sprintMembers.find((m) => m.name === assignee);
  const memberInitials = member ? initials(member.name) : '?';
  const epicGroups = groupSprintTicketsByEpic(items);
  const totalStoryPoints = items.reduce((sum, item) => {
    const points = Number(item?.ticket?.storyPoints);
    return Number.isFinite(points) && points > 0 ? sum + points : sum;
  }, 0);
  const totalStoryPointsLabel = formatStoryPointsDisplay(totalStoryPoints);
  const completedSP = items.filter(item=>['done','deployed'].includes(item.ticket.status)).reduce((sum,item)=>sum+Math.max(0,Number(item.ticket.storyPoints)||0),0);

  return `
    <section class="sprint-column" data-assignee="${escapeHtml(assignee)}">
      <header class="sprint-column__head">
        <div class="av-sm" style="background: linear-gradient(135deg, var(--accent), var(--indigo));">${memberInitials}</div>
        <span class="sprint-column__title">${escapeHtml(assignee || 'Unassigned')}<small>${escapeHtml(member?.role||'Team member')}</small></span>
        ${totalStoryPointsLabel ? `<span class="sprint-column__sp story-points-user-total">(${escapeHtml(totalStoryPointsLabel)} sp)</span>` : ''}
        <button class="btn-icon sprint-add-ticket-btn" type="button" data-action="open-add-sprint-ticket-modal" data-sprint-index="${sprintIndex}" data-assignee="${escapeHtml(assignee)}" title="Add ticket">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </header>
      <progress class="member-progress" max="${totalStoryPoints||1}" value="${completedSP}" aria-label="${escapeHtml(assignee)} completed story points"></progress>
      <div class="sprint-column__body">
        ${items.length ? (uiState.reorderingSprintIndex===sprintIndex?epicGroups.map(group=>renderSprintEpicCard(sprintIndex,assignee,group,sprintMembers,uiState)).join(''):items.map(({ticket,ticketIndex},position)=>renderSprintTicket(sprintIndex,ticketIndex,ticket,sprintMembers,uiState,{canMoveUp:position>0,canMoveDown:position<items.length-1})).join('')) : '<div class="sprint-column__empty">No tickets assigned</div>'}
      </div>
      <button class="sprint-add-ticket-inline" type="button" data-action="open-add-sprint-ticket-modal" data-sprint-index="${sprintIndex}" data-assignee="${escapeHtml(assignee)}">${icon('plus')}Add ticket</button>
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

function renderSprintHistoryItem(sprint, index, selected, editing) {
  const name = escapeHtml(sprint.name || 'Untitled sprint');
  const sprintId = escapeHtml(sprint.id);
  const dates = escapeHtml([sprint.startDate,sprint.endDate].filter(Boolean).join(' - '));
  return `<div class="sprint-history-item ${selected ? 'is-selected' : ''}">
    ${editing ? `<div class="sprint-history-rename" data-form="sprint-history-rename"><input class="field-input" name="name" value="${name}" aria-label="Sprint name" required /><button class="btn-icon" type="button" data-action="save-history-sprint-name" data-sprint-id="${sprintId}" title="Save name" aria-label="Save name">${icon('check')}</button><button class="btn-icon" type="button" data-action="cancel-history-sprint-name" title="Cancel" aria-label="Cancel">${icon('close')}</button></div>` : `<button type="button" class="sprint-history-open" data-action="select-sprint" data-index="${index}" ${selected ? 'aria-current="true"' : ''}><strong>${name}</strong><span>${dates || 'Dates not set'}</span><span class="sprint-history-count">${sprint.tickets?.length || 0} tickets</span>${icon('right')}</button><button class="btn-icon sprint-history-edit" type="button" data-action="edit-history-sprint-name" data-sprint-id="${sprintId}" title="Edit sprint name" aria-label="Edit ${name}">${icon('edit')}</button>`}
  </div>`;
}

function renderSprintTicket(sprintIndex, ticketIndex, ticket, sprintMembers, uiState, ordering = {}) {
  const jiraHref = resolveJiraHref(ticket);
  const epicHref = resolveEpicHref(ticket);
  const statusColor = STATUS_COLOR[ticket.status] || '#64748b';
  const epicTitle = String(ticket.epicTitle || '').trim() || 'No epic title';
  const ticketLabel = String(ticket.jiraId || ticket.title || '').trim() || 'No ticket';
  const ticketKey = ticketLabel.match(/[A-Z][A-Z0-9]+-\d+/)?.[0] || 'Ticket';
  const storyPointsLabel = formatStoryPointsDisplay(ticket.storyPoints);
  const ticketNotes = String(ticket.notes || ticket.desc || ticket.description || '').trim();
  const hasNotes = ticketNotes.length > 0;
  const indexLabel = `${ticketIndex + 1}->`;

  return `
    <article class="sprint-ticket-card compact-ticket" style="--ticket-status-color:${statusColor};">
      <div class="compact-ticket-top">${jiraHref?`<a href="${escapeHtml(jiraHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(ticketKey)}</a>`:`<span>${escapeHtml(ticketKey)}</span>`}<select aria-label="Status for ${escapeHtml(ticketLabel)}" class="status-select" name="status" data-status="${escapeHtml(String(ticket.status||'todo'))}" data-action="update-sprint-ticket-status" data-sprint-index="${sprintIndex}" data-ticket-index="${ticketIndex}">${TICKET_STATUSES.map(status=>`<option value="${status}" ${ticket.status===status?'selected':''}>${formatStatus(status)}</option>`).join('')}</select></div>
      <div class="compact-ticket-heading"><span class="compact-ticket-title">${escapeHtml(ticket.title||ticket.jiraId||'Untitled ticket')}</span><button class="btn-icon btn-icon--edit compact-ticket-edit" type="button" data-action="edit-sprint-ticket" data-sprint-index="${sprintIndex}" data-ticket-index="${ticketIndex}" title="Edit ticket" aria-label="Edit ${escapeHtml(ticketLabel)}">${icon('edit')}</button></div>
      <div class="compact-ticket-footer">${epicHref?`<a class="compact-epic" href="${escapeHtml(epicHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(epicTitle)}</a>`:`<span class="compact-epic">${escapeHtml(epicTitle)}</span>`}<span class="compact-points">${escapeHtml(storyPointsLabel||'0')} SP</span><span class="compact-ticket-order" aria-label="Ticket order">${[['up',ordering.canMoveUp],['down',ordering.canMoveDown]].map(([direction,enabled])=>`<button class="btn-icon" type="button" data-action="move-sprint-ticket" data-direction="${direction}" data-sprint-index="${sprintIndex}" data-ticket-index="${ticketIndex}" title="Move ticket ${direction}" aria-label="Move ${escapeHtml(ticketKey)} ${direction}" ${enabled?'':'disabled'}>${icon(direction)}</button>`).join('')}</span><button class="btn-icon" type="button" data-action="duplicate-sprint-ticket" data-sprint-index="${sprintIndex}" data-ticket-index="${ticketIndex}" title="Duplicate ticket to sprint" aria-label="Duplicate ${escapeHtml(ticketKey)}">${icon('copy')}</button><button class="btn-icon" type="button" data-action="remove-sprint-ticket" data-sprint-index="${sprintIndex}" data-ticket-index="${ticketIndex}" title="Delete ticket" aria-label="Delete ${escapeHtml(ticketKey)}">${icon('remove')}</button></div>
      ${hasNotes?`<p class="sprint-ticket-note-preview">${escapeHtml(ticketNotes)}</p>`:''}
    </article>
  `;
}

function renderSprintEpicCard(sprintIndex, assignee, group, sprintMembers, uiState) {
  const lead = group.items[0];
  const leadTicket = lead?.ticket || {};
  const leadTicketIndex = Number(lead?.ticketIndex);
  const epicTicketIds = group.items
    .map(({ ticket }) => String(ticket?.id || '').trim())
    .filter(Boolean)
    .join(',');
  const epicHref = resolveEpicHref(leadTicket);
  const epicTitle = String(leadTicket.epicTitle || '').trim() || 'No epic title';
  const totalSp = group.items.reduce((sum, item) => sum + (Number(item?.ticket?.storyPoints) || 0), 0);
  const totalSpLabel = totalSp > 0 ? formatStoryPointsDisplay(totalSp) : '';
  const canReorder = uiState.reorderingSprintIndex === sprintIndex;
  const epicDropAttrs = canReorder
    ? `data-epic-drop="true" data-epic-drag="true" draggable="true" data-sprint-index="${sprintIndex}" data-assignee="${escapeHtml(assignee)}" data-epic-key="${escapeHtml(String(group.key || ''))}"`
    : '';

  return `
    <article class="sprint-ticket-card ${canReorder ? 'is-epic-reorder-enabled' : ''}" style="--ticket-status-color:${STATUS_COLOR[leadTicket.status] || '#64748b'};" ${epicDropAttrs}>
      <div class="sprint-ticket-card__top">
        <div class="sprint-ticket-preview">
          <div class="sprint-ticket-preview__epic">
            ${canReorder ? `<button class="btn-icon sprint-epic-drag-handle" type="button" draggable="true" data-epic-drag="true" data-sprint-index="${sprintIndex}" data-assignee="${escapeHtml(assignee)}" data-epic-key="${escapeHtml(String(group.key || ''))}" title="Drag epic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 5h.01M10 12h.01M10 19h.01M14 5h.01M14 12h.01M14 19h.01"/></svg></button>` : ''}
            ${epicHref
              ? `<a class="sprint-ticket-preview__epic-link" href="${escapeHtml(epicHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(epicTitle)}</a>`
              : `<span class="sprint-ticket-preview__epic-text">${escapeHtml(epicTitle)}</span>`}
            ${totalSpLabel ? `<span class="sprint-ticket-preview__sp story-points-total">(${escapeHtml(totalSpLabel)} sp)</span>` : ''}
          </div>
          <ul class="sprint-ticket-preview__list">
            ${group.items.map(({ ticket, ticketIndex }) => {
              const jiraHref = resolveJiraHref(ticket);
              const ticketLabel = String(ticket.jiraId || ticket.title || '').trim() || 'No ticket';
              const storyPointsLabel = formatStoryPointsDisplay(ticket.storyPoints);
              const ticketNotes = String(ticket.notes || ticket.desc || ticket.description || '').trim();
              const reorderAttrs = canReorder
                ? `data-ticket-drop="true" data-sprint-index="${sprintIndex}" data-ticket-index="${ticketIndex}"`
                : '';
              return `
                <li class="sprint-ticket-preview__list-item ${canReorder ? 'is-reorder-enabled' : ''}" ${reorderAttrs}>
                  <div class="sprint-ticket-preview__line">
                    <span class="sprint-ticket-preview__main">
                      ${jiraHref
                        ? `<a class="sprint-ticket-preview__ticket-link" href="${escapeHtml(jiraHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(ticketLabel)}</a>`
                        : `<span class="sprint-ticket-preview__ticket-text">${escapeHtml(ticketLabel)}</span>`}
                      ${storyPointsLabel ? `<span class="sprint-ticket-preview__ticket-sp">(${escapeHtml(storyPointsLabel)} sp)</span>` : ''}
                      <select class="status-select status-select--inline" name="status" data-status="${escapeHtml(String(ticket.status || 'todo'))}" data-action="update-sprint-ticket-status" data-sprint-index="${sprintIndex}" data-ticket-index="${ticketIndex}">
                        ${TICKET_STATUSES.map((status) => `<option value="${status}" ${ticket.status === status ? 'selected' : ''}>${formatStatus(status)}</option>`).join('')}
                      </select>
                    </span>
                    <button class="btn-icon" type="button" data-action="duplicate-sprint-ticket" data-sprint-index="${sprintIndex}" data-ticket-index="${ticketIndex}" title="Duplicate ticket to sprint" aria-label="Duplicate ${escapeHtml(ticketLabel)}">${icon('copy')}</button>
                    ${canReorder ? `<button class="btn-icon sprint-ticket-drag-handle" type="button" draggable="true" data-ticket-drag="true" data-sprint-index="${sprintIndex}" data-ticket-index="${ticketIndex}" title="Drag to reorder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 5h.01M10 12h.01M10 19h.01M14 5h.01M14 12h.01M14 19h.01"/></svg></button>` : ''}
                  </div>
                  ${ticketNotes ? `<p class="sprint-ticket-preview__note">${escapeHtml(ticketNotes)}</p>` : ''}
                </li>
              `;
            }).join('')}
          </ul>
        </div>
        <div class="sprint-ticket-actions sprint-ticket-actions--epic">
          <button class="btn-icon" type="button" data-action="duplicate-sprint-epic" data-sprint-index="${sprintIndex}" data-assignee="${escapeHtml(assignee)}" data-epic-key="${escapeHtml(String(group.key || ''))}" title="Duplicate epic to another sprint">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/></svg>
          </button>
          <button class="btn-icon btn-icon--edit" type="button" data-action="edit-sprint-epic" data-sprint-index="${sprintIndex}" data-ticket-index="${leadTicketIndex}" title="Edit epic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon" type="button" data-action="remove-sprint-epic" data-sprint-index="${sprintIndex}" data-assignee="${escapeHtml(assignee)}" data-epic-key="${escapeHtml(String(group.key || ''))}" data-epic-ticket-ids="${escapeHtml(epicTicketIds)}" title="Delete epic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 6l-1.4 14H6.4L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
        </div>
      </div>
    </article>
  `;
}

function groupSprintTicketsByEpic(items) {
  const groups = new Map();

  items.forEach((item) => {
    const ticket = item?.ticket || {};
    const epicTitle = String(ticket.epicTitle || '').trim();
    const epicUrl = String(ticket.epicUrl || '').trim();
    const key = epicTitle || epicUrl || `ticket:${String(ticket.id || item.ticketIndex || '')}`;
    if (!groups.has(key)) {
      groups.set(key, { key, items: [] });
    }
    groups.get(key).items.push(item);
  });

  return Array.from(groups.values());
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

function resolveEpicHref(ticket) {
  const directUrl = String(ticket?.epicUrl || '').trim();
  if (/^https?:\/\//i.test(directUrl)) {
    return directUrl;
  }

  return '';
}

function formatStoryPointsDisplay(value) {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    return '';
  }
  return Number.isInteger(parsed) ? String(parsed) : String(parsed);
}

function normalizePriority(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'high') return 'High';
  if (normalized === 'low') return 'Low';
  if (normalized === 'média' || normalized === 'media' || normalized === 'medium') return 'Medium';
  return 'Medium';
}

function getSprintColumnAssignees(sprint, sprintMembers) {
  const fromSprint = Array.isArray(sprint?.columnAssignees) ? sprint.columnAssignees : [];
  const fromMembers = Array.isArray(sprintMembers) ? sprintMembers.map((member) => String(member?.name || '').trim()) : [];
  const seed = fromSprint.length ? fromSprint : fromMembers;
  const seen = new Set();

  return seed
    .map((name) => String(name || '').trim())
    .filter((name) => {
      if (!name) return false;
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function groupSprintTicketsByAssignee(tickets, columnAssignees) {
  const grouped = {};

  columnAssignees.forEach((assignee) => {
    grouped[assignee] = [];
  });

  tickets.forEach((ticket, ticketIndex) => {
    const assignee = ticket?.assignee?.trim() || '';
    const key = assignee || 'Unassigned';
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push({ ticket, ticketIndex });
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

export function renderGlobalTicketEditModal(sprintIndex, ticketIndex, ticket, sprintMembers, relatedTickets = []) {
  const ticketUrl = String(ticket.jiraUrl || '').trim();
  const epicUrl = String(ticket.epicUrl || '').trim();
  const relatedRows = Array.isArray(relatedTickets) ? relatedTickets : [];
  const relatedRowsMarkup = relatedRows.length
    ? relatedRows.map(({ ticket: relatedTicket, ticketIndex: relatedTicketIndex }) => {
      const relatedUrl = String(relatedTicket?.jiraUrl || '').trim();
      return `
        <div class="ticket-link-row" data-ticket-link-row>
          <div class="inline-link-field inline-link-field--with-delete">
            <input class="field-input" name="jiraId" type="text" value="${escapeHtml(String(relatedTicket?.jiraId || relatedTicket?.title || ''))}" placeholder="DP-9999" />
            <button class="button button--secondary button--sm" type="button" data-action="set-ticket-link">Link</button>
            <button class="btn-icon" type="button" data-action="remove-ticket-link-row" title="Delete ticket">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 6l-1.4 14H6.4L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
            </button>
          </div>
          <input name="existingTicketIndex" type="hidden" value="${escapeHtml(String(relatedTicketIndex))}" />
          <input name="existingTicketId" type="hidden" value="${escapeHtml(String(relatedTicket?.id || ''))}" />
          <input name="jiraUrl" type="hidden" value="${escapeHtml(relatedUrl)}" />
          <input class="field-input" name="storyPoints" type="number" min="0" step="0.5" value="${escapeHtml(String(relatedTicket?.storyPoints ?? ''))}" placeholder="Story points" />
          <input class="field-input" name="notes" type="text" value="${escapeHtml(String(relatedTicket?.notes || relatedTicket?.desc || ''))}" placeholder="Notes" />
          <p class="sprint-link-hint" data-link-preview="jiraUrl">${escapeHtml(relatedUrl || 'Sem link')}</p>
        </div>
      `;
    }).join('')
    : `
      <div class="ticket-link-row" data-ticket-link-row>
        <div class="inline-link-field inline-link-field--with-delete">
          <input class="field-input" name="jiraId" type="text" placeholder="DP-9999" />
          <button class="button button--secondary button--sm" type="button" data-action="set-ticket-link">Link</button>
          <button class="btn-icon" type="button" data-action="remove-ticket-link-row" title="Delete ticket">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 6l-1.4 14H6.4L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
        </div>
        <input name="existingTicketIndex" type="hidden" value="" />
        <input name="existingTicketId" type="hidden" value="" />
        <input name="jiraUrl" type="hidden" value="" />
        <input class="field-input" name="storyPoints" type="number" min="0" step="0.5" value="" placeholder="Story points" />
        <input class="field-input" name="notes" type="text" value="" placeholder="Notes" />
        <p class="sprint-link-hint" data-link-preview="jiraUrl">Sem link</p>
      </div>
    `;

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
              <label>Assignee</label>
              <select class="field-input" name="assignee">
                <option value="">Unassigned</option>
                ${sprintMembers.map((member) => `<option value="${escapeHtml(member.name)}" ${ticket.assignee === member.name ? 'selected' : ''}>${escapeHtml(member.name)}</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label>Epic Title</label>
              <div class="inline-link-field">
                <input class="field-input" name="epicTitle" type="text" value="${escapeHtml(ticket.epicTitle || '')}" placeholder="TESTING in EA DS" />
                <button class="button button--secondary button--sm" type="button" data-action="set-epic-link">Link</button>
              </div>
              <input name="epicUrl" type="hidden" value="${escapeHtml(epicUrl)}" />
              <p class="sprint-link-hint" data-link-preview="epicUrl">${escapeHtml(epicUrl || 'Sem link')}</p>
            </div>

            <div class="form-group">
              <label>Ticket ID</label>
              <div class="inline-link-field inline-link-field--with-delete">
                <input class="field-input" name="jiraId" type="text" value="${escapeHtml(ticket.jiraId || '')}" placeholder="DP-3333" />
                <button class="button button--secondary button--sm" type="button" data-action="set-ticket-link">Link</button>
                <button class="btn-icon" type="button" data-action="toggle-delete-sprint-ticket-in-form" data-sprint-index="${sprintIndex}" data-ticket-index="${ticketIndex}" title="Delete ticket">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 6l-1.4 14H6.4L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                </button>
              </div>
              <input name="pendingDelete" type="hidden" value="0" />
              <input name="jiraUrl" type="hidden" value="${escapeHtml(ticketUrl)}" />
              <input class="field-input" name="mainStoryPoints" type="number" min="0" step="0.5" value="${escapeHtml(String(ticket.storyPoints || ''))}" placeholder="Story points" />
              <input class="field-input" name="mainNotes" type="text" value="${escapeHtml(ticket.notes || ticket.desc || '')}" placeholder="Notes" />
              <p class="sprint-link-hint" data-link-preview="jiraUrl">${escapeHtml(ticketUrl || 'Sem link')}</p>
            </div>

            <div class="form-group">
              <label>More Tickets</label>
              <div class="ticket-links-list" data-ticket-links-list>
                ${relatedRowsMarkup}
              </div>
              <button class="button button--secondary button--sm" type="button" data-action="add-ticket-link-row">Add ticket</button>
            </div>

            <div class="form-group">
              <label>Status</label>
              <select class="field-input" name="status">
                ${TICKET_STATUSES.map((status) => `<option value="${status}" ${ticket.status === status ? 'selected' : ''}>${formatStatus(status)}</option>`).join('')}
              </select>
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

export function renderSprintTicketCreateRow() {
  return `<div class="ticket-link-row ticket-create-row" data-ticket-link-row>
    <label>Ticket ID<input class="field-input" name="jiraId" type="text" placeholder="DP-3333" /></label>
    <label>Title<input class="field-input" name="title" type="text" placeholder="Title" /></label>
    <label>Story Points<input class="field-input" name="storyPoints" type="number" min="0" step="0.5" placeholder="0" /></label>
    <label>Notes<input class="field-input" name="notes" type="text" placeholder="Notes" /></label>
    <div class="ticket-create-row__link"><span>Link</span><button class="button button--secondary button--sm" type="button" data-action="set-ticket-link" title="Set ticket link" aria-label="Set ticket link">${icon('link')}</button><input name="jiraUrl" type="hidden" value="" /><p class="sprint-link-hint" data-link-preview="jiraUrl">Sem link</p></div>
    <div class="ticket-create-row__actions">
      <button class="button button--sm" type="button" data-action="remove-ticket-link-row" title="Delete ticket" aria-label="Delete ticket">${icon('remove')}</button>
    </div>
  </div>`;
}

export function renderSprintTicketCreateModal(sprintIndex, defaultAssignee, sprintMembers) {
  const selectedAssignee = String(defaultAssignee || '').trim();

  return `
    <article class="sprint-ticket-edit-modal sprint-ticket-create-modal" data-form="sprint-ticket-create-modal" data-sprint-index="${sprintIndex}">
      <div class="modal-overlay"></div>
      <div class="modal-card">
        <div class="modal-header">
          <h2>Add Ticket</h2>
          <button class="btn-icon" type="button" data-action="cancel-create-sprint-ticket" data-sprint-index="${sprintIndex}" title="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <form class="ticket-edit-form">
            <div class="form-group">
              <label>Assignee</label>
              <select class="field-input" name="assignee">
                <option value="">Unassigned</option>
                ${sprintMembers.map((member) => `<option value="${escapeHtml(member.name)}" ${member.name === selectedAssignee ? 'selected' : ''}>${escapeHtml(member.name)}</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label>Epic Title</label>
              <div class="inline-link-field">
                <input class="field-input" name="epicTitle" list="global-epic-options" type="text" placeholder="Select or type epic title" />
                <button class="button button--secondary button--sm" type="button" data-action="set-epic-link">Link</button>
              </div>
              <input name="epicUrl" type="hidden" value="" />
              <p class="sprint-link-hint" data-link-preview="epicUrl">Sem link</p>
            </div>

            <div class="form-group">
              <label>Tickets</label>
              <div class="ticket-links-list" data-ticket-links-list>
                ${renderSprintTicketCreateRow()}
              </div>
              <button class="button button--secondary button--sm" type="button" data-action="add-ticket-link-row">Add ticket</button>
            </div>

            <div class="form-group">
              <label>Status</label>
              <select class="field-input" name="status">
                ${TICKET_STATUSES.map((status) => `<option value="${status}">${formatStatus(status)}</option>`).join('')}
              </select>
            </div>

          </form>
        </div>
        <div class="modal-footer">
          <button class="button button--secondary" type="button" data-action="cancel-create-sprint-ticket" data-sprint-index="${sprintIndex}">Cancel</button>
          <button class="button button--primary" type="button" data-action="save-create-sprint-ticket" data-sprint-index="${sprintIndex}">Add</button>
        </div>
      </div>
    </article>
  `;
}