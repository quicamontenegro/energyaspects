# Persistence verification - 2026-11-03

## Scope and results

- Canonical application: EA_Dashboard, port 3000. No production deployment or live data restoration performed.
- `npm run test:persistence`: 14 automated tests passed. Tests use an in-memory Supabase query mock, never real database writes.
- Round-trip coverage includes settings, invoicing projects/members, legacy velocity teams/sprints/points, Data Explorer tasks/meetings, RPDE tickets, milestones/tasks, sprint tickets/notes/columns/quick links, shared note titles/body, global epics, manual Velocity metrics/distribution and collapsed sprint state.
- Failure injection covers reads and writes for every structured table, invalid metadata, retry after failure, empty tables, removal of the final team member, sparse velocity points and sprints with no members.
- Concurrency checks cover rapid edits, ordered metadata writes, interleaved core/metadata writes, different components edited by stale windows and an unrelated successful write not hiding a failed component.
- Browser mutation checks passed using isolated bootstrap, blocked Supabase requests and the real persistence/data-layer modules connected to an in-memory query mock: Velocity fields/distribution, focused-field refresh guard, epics, shared note title/body, note draft refresh guard, sprint notes, ticket status, RP milestone creation/inline edit, invoicing absence edits, save failure display and retry.
- Sync indicator visible at 1440x900 and 390x844; no document/body horizontal overflow in the checked invoicing view.
- `npm run build`: passed. Source diagnostics: no errors reported.

## Corrections

- Metadata has an independent ordered queue and does not wait for unrelated table synchronization.
- Normal app persistence saves changed components only. Clean mounting, hiding or closing no longer rewrites loaded snapshots.
- Failed components remain retryable; save errors are surfaced rather than reported as success.
- Empty tables use column probes instead of assuming absent columns. Required task titles and optional milestone/sprint fields are preserved.
- Velocity read errors block startup; sprint labels and sparse point positions survive loading.
- Invalid metadata blocks a writable snapshot instead of becoming empty arrays.
- Saving/error status is visible on desktop/mobile. Reload warns about pending saves, failed saves and unsaved drafts; a focused inline field triggers its normal change handler before the warning.

## Read-only data audit

- Live database: 5 shared notes with retained body text but empty titles, 15 sprint notes, 1 manual Velocity record with no numeric metrics populated and 0 global epics.
- Other retained records: 3 projects/6 members, 14 DE tasks/5 meetings, 7 milestones/5 tasks and 15 sprints/149 tickets.
- Existing nonempty 2026-11-03 03:15 backup has the same notes/Velocity/epic counts; restoring it is not proven to recover the missing entries. No restore was attempted.
- Legacy dashboard_state snapshots date from May and do not contain the new notes/epics/manual Velocity collections.
- Saved tickets contain 42 distinct epic-title recovery candidates; duplicate Jira URLs require review before recovery.

## Remaining Limits

- No live mutation tests or database restoration. The in-memory query mock does not reproduce every PostgreSQL constraint, RLS rule, cascade or network condition.
- Different-component writes are isolated; simultaneous stale edits inside the same component still use last-write-wins. Database-side version checks/transactions are not implemented.
- Structured multi-table saves are not atomic. Partial failures remain visible and retryable, but require database transactions for full atomicity.
- Unsaved note drafts trigger a reload warning, but are not stored across reloads. No local backups were created.
- Existing RP-only Milestones filtering remains unchanged; DE records stay in the snapshot but are not displayed in that view.

## Sprint controls follow-up

- Quick Links now use the global `spQuickLinks` setting. Legacy manual links and visible overrides are migrated; source-sprint deletion preserves migrated links, and explicitly empty global lists do not resurrect old links.
- Sprint dropdown clicks no longer recreate the native select. Browser click/selection checks passed without data writes.
- Sprint History exposes inline name editing. Renames persist in canonical metadata and the structured sprints table.
- Individual tickets expose a copy icon and sprint destination picker. Copies retain ticket fields, receive a fresh ID and remain independent of the source; destination assignee columns are retained.
- Latest `npm run test:persistence`: 18 tests passed, including canonical/structured rename and duplication round trips. Browser checks passed for rename, picker cancellation, chosen destination, fresh copy ID, preserved fields and destination visibility. Build passed.
- All mutation checks remained isolated from the real database. No production data recovery was performed.

# UI verification - 2026-11-02

## Environment and isolation

- Application: redesigned v2 at port 3002.
- Browser: VS Code integrated browser controlled through Playwright.
- Existing data was inspected with Supabase writes blocked.
- Mutation tests used synthetic snapshots and mock persistence in the browser.
- The isolated test entry replaced the main module at request time, without changing application files or connecting test fixtures to Supabase.
- This is a record of interactive checks, not a committed automated regression suite.

## Responsive matrix

All five areas were checked at widths 1365, 768 and 390 pixels in dark and light themes: 30 combinations.

Final populated-state matrix: 30 passed, no page-level horizontal overflow, no controls spilling outside the viewport except intentionally scrollable tables/navigation, and no JavaScript errors.

The fixtures included long project names, long ticket titles and an unbroken milestone task name. Screenshots were inspected for the five areas across desktop/mobile checks; not every matrix combination received a separate screenshot review.

## Functional coverage

| Area | Checks performed |
| --- | --- |
| Invoicing | Empty-name guard; project/member creation; PTO and holiday calculations; working-day changes; cancellation and confirmation of removals. |
| Data Explorer | Meeting creation, editing and cancellation; task creation and association; task status changes; modal editing of title, assignee, priority and notes; task removal; meeting removal with associated tasks. |
| Milestones | Empty-name guard; creation in RP/DE teams; team/status filtering including empty results; task creation and completion; progress; cancellation and confirmation of task/milestone removal; mobile text wrapping. |
| Sprints | Member/epic management; date normalization; sprint creation/editing; previous/next navigation; multi-ticket creation; status and story-point progress; epic URL reuse; explicit URL priority; link popups; ticket/sprint removal; ticket drag ordering; sprint/shared note creation, editing and removal; bold, italic and list formatting. |
| Velocity | Metric creation/editing/completion; average calculations; percentage-point deltas; current-sprint exclusion from reports; team/comparison/history filters; analysis/trends/team views; report generation; clipboard payload; export payload and filename. |
| Shared controls | Sidebar navigation; theme switching; empty/populated states; expanded-panel retention; keyboard focus, Tab containment, Escape and focus restoration for task edit, ticket edit and ticket creation modals. |

## Issues corrected and retested

1. Meeting creation form used a translucent white background in dark mode. It now uses theme colors; label contrast measured 7.20:1 in dark mode.
2. Milestone task names competed with status controls on narrow screens. Mobile task titles now have a separate row and long words wrap.
3. Global epic URLs were not reused when creating/editing tickets. A matching global URL is now used when the explicit URL is empty; explicit URLs retain priority.
4. Shared modals did not receive focus or close with Escape. They now expose dialog semantics, disable background interaction, contain Tab navigation, close with Escape and restore focus to the visible opening control.
5. Adding/editing records recreated closed details panels and hid the editor. Open/closed states now survive rendering for Velocity and sprint management panels.

## Final gates

- `npm run build`: passed.
- VS Code source diagnostics: no errors reported.
- Original EA_Dashboard: unchanged relative to HEAD.

## Milestones revamp follow-up

- The navigation now contains Sprints, Velocity, Milestones and Invoicing. Data Explorer is no longer listed.
- Milestones was rebuilt with the Velocity title bar, KPI styling, delivery overview and expandable register. The DE switch is removed; only RP/legacy untagged milestones are displayed. DE records remain in the snapshot.
- Rechecked creation, required name/valid URL, inline name/owner/status edits, task creation/renaming/status, task completion progress, cancellation/confirmation of task removal, filtered milestone removal and filtered empty state. A filtered deletion retained the hidden DE fixture.
- New milestone opens and focuses the inline form. A closed form is hidden to avoid duplicate creation controls.
- Desktop screenshot reviewed at 1440 pixels; light mobile overview and expanded task editor reviewed at 390 pixels. Six populated viewport/theme combinations (1440, 768, 390; dark/light) had no page overflow or offscreen controls and no runtime errors.
- These mutation checks used intercepted browser bootstrap and mock persistence, not live database writes. The initial coverage above describes the earlier UI pass; its RP/DE switching and Data Explorer navigation checks no longer describe the current navigation.

## Shared notes revamp follow-up

- Replaced the auto-fit multi-column board with a single-column reading list and natural card heights. Body text is 14px with 1.75 line height and a constrained reading measure.
- Long notes have a 320px preview with native keyboard-operable expansion; short notes remain fully visible. Reading expansion survives rerenders.
- Added content/date search, result counts and a no-results state. Search filters existing DOM rather than recreating editors on every keystroke.
- New-note composition is opened from one command, focuses the editor and closes after saving. Editing/deletion actions are always visible; formatting uses labeled Lucide controls.
- In-memory drafts survive navigation/theme changes. Save/cancel clears the relevant draft. Drafts are not stored across page reloads and are not sent to Supabase before saving.
- Isolated browser checks passed for empty creation, create/cancel, editor focus, edit/cancel, bold formatting and its preservation across theme changes, standalone links, search/no results/reset, delete cancellation/confirmation, expansion/collapse, draft retention and cancellation without writes.
- Six combinations (1440, 768, 390 pixels; dark/light) remained single-column with no page overflow, offscreen controls or runtime errors. Light mobile screenshots reviewed for composition and preview; real-data desktop reading layout also inspected.

## Invoicing revamp follow-up

- Rebuilt the workspace using the shared title bar/KPI styling, monthly capacity band, searchable roster, inline member editing and collapsible project settings. New project creation is hidden until requested; Enter submits project/member creation.
- Renamed computed hours to Available rather than Logged. KPI and project totals now derive from the same PTO/holiday calculation as the member rows; cached `tl`/`hoursOff` no longer cause inconsistent displayed totals.
- Absence/working-day changes update cached member values for persistence. The calculation respects configured hours per day, clamps available hours at zero and rejects invalid numeric inputs.
- Focused calculation checks passed for stale cached values, working-day changes, a seven-hour workday, empty projects and excessive absences.
- Mock browser checks passed for empty-name validation, keyboard creation, member additions/renaming, PTO changes, recomputation after working-day changes, project name/tag/color edits, settings expansion retention, project/member search and cancellation/confirmation of removals.
- Dark desktop and light mobile screenshots reviewed. Six viewport/theme combinations (1440, 768, 390 pixels; dark/light) had no offscreen controls or runtime errors. A mobile document-level overflow caused by an offscreen accessible header was corrected; final checks inspected both document and body widths. Wide member tables scroll independently.
- Mutation checks used isolated bootstrap and mock persistence; no live billing data was edited by the tests.

## Limitations

- No live Supabase writes, authentication/permission checks, concurrent-user tests or database persistence round trips.
- The clipboard was mocked for content verification; the system clipboard was not overwritten.
- Export content and filename were verified; an actual operating-system download was not confirmed in the integrated browser.
- External Jira/Confluence destinations were not opened or authenticated.
- Responsive viewports are not physical mobile-device tests; Safari, Firefox and other browser engines were not exercised.
- Keyboard checks are not a complete screen-reader or accessibility audit. Note color/code/link toolbar combinations and every possible input combination were not exhaustively tested.