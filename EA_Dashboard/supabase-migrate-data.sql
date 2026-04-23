with src as (
  select state
  from public.dashboard_state
  where id = 'invoicing_dashboard'
)
insert into public.settings (key, value, updated_at)
values
  ('monthlyHours', (select coalesce((state->'settings'->>'monthlyHours')::jsonb, '176'::jsonb) from src), timezone('utc', now())),
  ('hoursPerDay', (select coalesce((state->'settings'->>'hoursPerDay')::jsonb, '8'::jsonb) from src), timezone('utc', now()))
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

with src as (
  select state
  from public.dashboard_state
  where id = 'invoicing_dashboard'
), project_rows as (
  select
    coalesce(project->>'id', 'proj_' || project_ord::text) as id,
    coalesce(project->>'name', 'Project ' || project_ord::text) as name,
    coalesce(project->>'tag', '') as tag,
    coalesce(project->>'color', '#4f46e5') as color,
    coalesce((project->>'active')::boolean, true) as active,
    project_ord - 1 as sort_order
  from src,
  jsonb_array_elements(coalesce(state->'projects', '[]'::jsonb)) with ordinality as project(project, project_ord)
)
insert into public.projects (id, name, tag, color, active, sort_order, updated_at)
select id, name, tag, color, active, sort_order, timezone('utc', now())
from project_rows
on conflict (id) do update
set name = excluded.name,
    tag = excluded.tag,
    color = excluded.color,
    active = excluded.active,
    sort_order = excluded.sort_order,
    updated_at = excluded.updated_at;

with src as (
  select state
  from public.dashboard_state
  where id = 'invoicing_dashboard'
), member_rows as (
  select
    'pmem_' || coalesce(project->>'id', 'proj_' || project_ord::text) || '_' || (member_ord - 1)::text as id,
    coalesce(project->>'id', 'proj_' || project_ord::text) as project_id,
    coalesce(member->>'name', 'Member ' || member_ord::text) as name,
    coalesce((member->>'pto')::double precision, 0) as pto,
    coalesce((member->>'feriados')::double precision, 0) as feriados,
    coalesce((member->>'hoursOff')::double precision, 0) as hours_off,
    coalesce((member->>'tl')::double precision, 0) as total_logged,
    member_ord - 1 as sort_order
  from src,
  jsonb_array_elements(coalesce(state->'projects', '[]'::jsonb)) with ordinality as project(project, project_ord),
  jsonb_array_elements(coalesce(project->'members', '[]'::jsonb)) with ordinality as member(member, member_ord)
)
insert into public.project_members (id, project_id, name, pto, feriados, hours_off, total_logged, sort_order, updated_at)
select id, project_id, name, pto, feriados, hours_off, total_logged, sort_order, timezone('utc', now())
from member_rows
on conflict (id) do update
set project_id = excluded.project_id,
    name = excluded.name,
    pto = excluded.pto,
    feriados = excluded.feriados,
    hours_off = excluded.hours_off,
    total_logged = excluded.total_logged,
    sort_order = excluded.sort_order,
    updated_at = excluded.updated_at;

with src as (
  select state
  from public.dashboard_state
  where id = 'invoicing_dashboard'
), team_rows as (
  select
    coalesce(team->>'id', 'team_' || team_ord::text) as id,
    coalesce(team->>'name', 'Team ' || team_ord::text) as name,
    coalesce(team->>'color', '#4f46e5') as color,
    coalesce(team->>'group', 'rp') as group_id,
    team_ord - 1 as sort_order
  from src,
  jsonb_array_elements(coalesce(state->'teams', '[]'::jsonb)) with ordinality as team(team, team_ord)
)
insert into public.velocity_teams (id, name, color, group_id, sort_order, updated_at)
select id, name, color, group_id, sort_order, timezone('utc', now())
from team_rows
on conflict (id) do update
set name = excluded.name,
    color = excluded.color,
    group_id = excluded.group_id,
    sort_order = excluded.sort_order,
    updated_at = excluded.updated_at;

with src as (
  select state
  from public.dashboard_state
  where id = 'invoicing_dashboard'
), sprint_rows as (
  select
    'vs_' || coalesce(team->>'id', 'team_' || team_ord::text) || '_' || (sprint_ord - 1)::text as id,
    coalesce(team->>'id', 'team_' || team_ord::text) as team_id,
    sprint_ord - 1 as position,
    sprint_label #>> '{}' as label
  from src,
  jsonb_array_elements(coalesce(state->'teams', '[]'::jsonb)) with ordinality as team(team, team_ord),
  jsonb_array_elements(coalesce(team->'sprints', '[]'::jsonb)) with ordinality as sprint_label(sprint_label, sprint_ord)
)
insert into public.velocity_sprints (id, team_id, position, label, updated_at)
select id, team_id, position, label, timezone('utc', now())
from sprint_rows
on conflict (id) do update
set team_id = excluded.team_id,
    position = excluded.position,
    label = excluded.label,
    updated_at = excluded.updated_at;

with src as (
  select state
  from public.dashboard_state
  where id = 'invoicing_dashboard'
), member_rows as (
  select
    'vm_' || coalesce(team->>'id', 'team_' || team_ord::text) || '_' || (member_ord - 1)::text as id,
    coalesce(team->>'id', 'team_' || team_ord::text) as team_id,
    coalesce(member->>'name', 'Member ' || member_ord::text) as name,
    member_ord - 1 as sort_order,
    member,
    team,
    team_ord
  from src,
  jsonb_array_elements(coalesce(state->'teams', '[]'::jsonb)) with ordinality as team(team, team_ord),
  jsonb_array_elements(coalesce(team->'members', '[]'::jsonb)) with ordinality as member(member, member_ord)
)
insert into public.velocity_members (id, team_id, name, sort_order, updated_at)
select id, team_id, name, sort_order, timezone('utc', now())
from member_rows
on conflict (id) do update
set team_id = excluded.team_id,
    name = excluded.name,
    sort_order = excluded.sort_order,
    updated_at = excluded.updated_at;

with src as (
  select state
  from public.dashboard_state
  where id = 'invoicing_dashboard'
), point_rows as (
  select
    'vp_' || coalesce(team->>'id', 'team_' || team_ord::text) || '_' || (member_ord - 1)::text || '_' || (point_ord - 1)::text as id,
    'vm_' || coalesce(team->>'id', 'team_' || team_ord::text) || '_' || (member_ord - 1)::text as member_id,
    point_ord - 1 as sprint_position,
    coalesce((point #>> '{}')::double precision, 0) as points
  from src,
  jsonb_array_elements(coalesce(state->'teams', '[]'::jsonb)) with ordinality as team(team, team_ord),
  jsonb_array_elements(coalesce(team->'members', '[]'::jsonb)) with ordinality as member(member, member_ord),
  jsonb_array_elements(coalesce(member->'sp', '[]'::jsonb)) with ordinality as point(point, point_ord)
)
insert into public.velocity_points (id, member_id, sprint_position, points, updated_at)
select id, member_id, sprint_position, points, timezone('utc', now())
from point_rows
on conflict (id) do update
set member_id = excluded.member_id,
    sprint_position = excluded.sprint_position,
    points = excluded.points,
    updated_at = excluded.updated_at;

with src as (
  select state
  from public.dashboard_state
  where id = 'invoicing_dashboard'
), rows_data as (
  select task
  from src,
  jsonb_array_elements(coalesce(state->'deTasks', '[]'::jsonb)) as task
)
insert into public.data_explorer_tasks (id, name, week, status, assignee, priority, due_date, notes, created_at, updated_at)
select
  coalesce(task->>'id', md5(random()::text)),
  coalesce(task->>'name', ''),
  nullif(task->>'week', '')::date,
  coalesce(task->>'status', 'inprogress'),
  coalesce(task->>'assignee', ''),
  coalesce(task->>'priority', 'Média'),
  nullif(task->>'dueDate', '')::date,
  coalesce(task->>'notes', ''),
  coalesce((task->>'createdAt')::timestamptz, timezone('utc', now())),
  timezone('utc', now())
from rows_data
on conflict (id) do update
set name = excluded.name,
    week = excluded.week,
    status = excluded.status,
    assignee = excluded.assignee,
    priority = excluded.priority,
    due_date = excluded.due_date,
    notes = excluded.notes,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

with src as (
  select state
  from public.dashboard_state
  where id = 'invoicing_dashboard'
), rows_data as (
  select ticket
  from src,
  jsonb_array_elements(coalesce(state->'rpdeTickets', '[]'::jsonb)) as ticket
)
insert into public.rpde_tickets (id, team, assignee, jira_id, jira_url, title, status, priority, notes, created_at, updated_at)
select
  coalesce(ticket->>'id', md5(random()::text)),
  coalesce(ticket->>'team', 'rp'),
  coalesce(ticket->>'assignee', ''),
  coalesce(ticket->>'jiraId', ''),
  coalesce(ticket->>'jiraUrl', ''),
  coalesce(ticket->>'title', ''),
  coalesce(ticket->>'status', 'todo'),
  coalesce(ticket->>'priority', 'Média'),
  coalesce(ticket->>'notes', ''),
  coalesce((ticket->>'createdAt')::timestamptz, timezone('utc', now())),
  timezone('utc', now())
from rows_data
on conflict (id) do update
set team = excluded.team,
    assignee = excluded.assignee,
    jira_id = excluded.jira_id,
    jira_url = excluded.jira_url,
    title = excluded.title,
    status = excluded.status,
    priority = excluded.priority,
    notes = excluded.notes,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

with src as (
  select state
  from public.dashboard_state
  where id = 'invoicing_dashboard'
), rows_data as (
  select milestone, milestone_ord
  from src,
  jsonb_array_elements(coalesce(state->'msData', '[]'::jsonb)) with ordinality as milestone(milestone, milestone_ord)
)
insert into public.milestones (id, team, team_id, name, status, assignee, url, notes, sort_order, updated_at)
select
  coalesce(milestone->>'id', md5(random()::text)),
  coalesce(milestone->>'team', 'rp'),
  case coalesce(milestone->>'team', 'rp') when 'de' then 'team_de' else 'team_rp' end,
  coalesce(milestone->>'name', ''),
  coalesce(milestone->>'status', 'notstarted'),
  coalesce(milestone->>'assignee', ''),
  coalesce(milestone->>'url', ''),
  coalesce(milestone->>'notes', ''),
  milestone_ord - 1,
  timezone('utc', now())
from rows_data
on conflict (id) do update
set team = excluded.team,
  team_id = excluded.team_id,
    name = excluded.name,
    status = excluded.status,
    assignee = excluded.assignee,
    url = excluded.url,
    notes = excluded.notes,
    sort_order = excluded.sort_order,
    updated_at = excluded.updated_at;

with src as (
  select state
  from public.dashboard_state
  where id = 'invoicing_dashboard'
), rows_data as (
  select milestone, task, milestone_ord, task_ord
  from src,
  jsonb_array_elements(coalesce(state->'msData', '[]'::jsonb)) with ordinality as milestone(milestone, milestone_ord),
  jsonb_array_elements(coalesce(milestone->'tasks', '[]'::jsonb)) with ordinality as task(task, task_ord)
)
insert into public.milestone_tasks (id, milestone_id, name, status, notes, sort_order, updated_at)
select
  coalesce(task->>'id', md5(random()::text)),
  coalesce(milestone->>'id', md5(random()::text)),
  coalesce(task->>'name', ''),
  coalesce(task->>'status', 'notstarted'),
  coalesce(task->>'notes', ''),
  task_ord - 1,
  timezone('utc', now())
from rows_data
on conflict (id) do update
set milestone_id = excluded.milestone_id,
    name = excluded.name,
    status = excluded.status,
    notes = excluded.notes,
    sort_order = excluded.sort_order,
    updated_at = excluded.updated_at;

with src as (
  select state
  from public.dashboard_state
  where id = 'invoicing_dashboard'
), rows_data as (
  select sprint, sprint_ord
  from src,
  jsonb_array_elements(coalesce(state->'spData', '[]'::jsonb)) with ordinality as sprint(sprint, sprint_ord)
)
insert into public.sprints (id, team, team_id, name, sort_order, updated_at)
select
  coalesce(sprint->>'id', md5(random()::text)),
  coalesce(sprint->>'team', 'rp'),
  case coalesce(sprint->>'team', 'rp') when 'de' then 'team_de' else 'team_rp' end,
  coalesce(sprint->>'name', ''),
  sprint_ord - 1,
  timezone('utc', now())
from rows_data
on conflict (id) do update
set team = excluded.team,
    team_id = excluded.team_id,
    name = excluded.name,
    sort_order = excluded.sort_order,
    updated_at = excluded.updated_at;

with src as (
  select state
  from public.dashboard_state
  where id = 'invoicing_dashboard'
), rows_data as (
  select sprint, ticket, ticket_ord
  from src,
  jsonb_array_elements(coalesce(state->'spData', '[]'::jsonb)) as sprint(sprint),
  jsonb_array_elements(coalesce(sprint->'tickets', '[]'::jsonb)) with ordinality as ticket(ticket, ticket_ord)
)
insert into public.sprint_tickets (id, sprint_id, assignee, jira_id, jira_url, title, description, status, sort_order, updated_at)
select
  coalesce(ticket->>'id', md5(random()::text)),
  coalesce(sprint->>'id', md5(random()::text)),
  coalesce(ticket->>'assignee', ''),
  coalesce(ticket->>'jiraId', ''),
  coalesce(ticket->>'jiraUrl', ''),
  coalesce(ticket->>'title', ''),
  coalesce(ticket->>'desc', ''),
  coalesce(ticket->>'status', 'todo'),
  ticket_ord - 1,
  timezone('utc', now())
from rows_data
on conflict (id) do update
set sprint_id = excluded.sprint_id,
    assignee = excluded.assignee,
    jira_id = excluded.jira_id,
    jira_url = excluded.jira_url,
    title = excluded.title,
    description = excluded.description,
    status = excluded.status,
    sort_order = excluded.sort_order,
    updated_at = excluded.updated_at;
