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