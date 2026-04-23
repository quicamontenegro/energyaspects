create table if not exists public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.settings add column if not exists value jsonb;
alter table public.settings add column if not exists updated_at timestamptz default timezone('utc', now());

create table if not exists public.projects (
  id text primary key,
  name text not null,
  tag text not null default '',
  color text not null default '#4f46e5',
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.projects add column if not exists tag text not null default '';
alter table public.projects add column if not exists color text not null default '#4f46e5';
alter table public.projects add column if not exists active boolean not null default true;
alter table public.projects add column if not exists sort_order integer not null default 0;
alter table public.projects add column if not exists updated_at timestamptz default timezone('utc', now());

create table if not exists public.project_members (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  name text not null,
  pto double precision not null default 0,
  feriados double precision not null default 0,
  hours_off double precision not null default 0,
  total_logged double precision not null default 0,
  sort_order integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.project_members add column if not exists project_id text;
alter table public.project_members add column if not exists name text not null default '';
alter table public.project_members add column if not exists pto double precision not null default 0;
alter table public.project_members add column if not exists feriados double precision not null default 0;
alter table public.project_members add column if not exists hours_off double precision not null default 0;
alter table public.project_members add column if not exists total_logged double precision not null default 0;
alter table public.project_members add column if not exists sort_order integer not null default 0;
alter table public.project_members add column if not exists updated_at timestamptz default timezone('utc', now());

create table if not exists public.velocity_teams (
  id text primary key,
  name text not null,
  color text not null default '#4f46e5',
  group_id text not null check (group_id in ('rp','ia')),
  sort_order integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.velocity_teams add column if not exists name text not null default '';
alter table public.velocity_teams add column if not exists color text not null default '#4f46e5';
alter table public.velocity_teams add column if not exists group_id text not null default 'rp';
alter table public.velocity_teams add column if not exists sort_order integer not null default 0;
alter table public.velocity_teams add column if not exists updated_at timestamptz default timezone('utc', now());

create table if not exists public.velocity_sprints (
  id text primary key,
  team_id text not null references public.velocity_teams(id) on delete cascade,
  position integer not null,
  label text not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.velocity_sprints add column if not exists team_id text;
alter table public.velocity_sprints add column if not exists position integer not null default 0;
alter table public.velocity_sprints add column if not exists label text not null default '';
alter table public.velocity_sprints add column if not exists updated_at timestamptz default timezone('utc', now());

create table if not exists public.velocity_members (
  id text primary key,
  team_id text not null references public.velocity_teams(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.velocity_members add column if not exists team_id text;
alter table public.velocity_members add column if not exists name text not null default '';
alter table public.velocity_members add column if not exists sort_order integer not null default 0;
alter table public.velocity_members add column if not exists updated_at timestamptz default timezone('utc', now());

create table if not exists public.velocity_points (
  id text primary key,
  member_id text not null references public.velocity_members(id) on delete cascade,
  sprint_position integer not null,
  points double precision not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.velocity_points add column if not exists member_id text;
alter table public.velocity_points add column if not exists sprint_position integer not null default 0;
alter table public.velocity_points add column if not exists points double precision not null default 0;
alter table public.velocity_points add column if not exists updated_at timestamptz default timezone('utc', now());

create table if not exists public.data_explorer_tasks (
  id text primary key,
  name text not null,
  week date,
  status text not null check (status in ('inprogress','completed','roadmap','blocked','onhold')),
  assignee text not null default '',
  priority text not null default 'Média',
  due_date date,
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.data_explorer_tasks add column if not exists name text not null default '';
alter table public.data_explorer_tasks add column if not exists week date;
alter table public.data_explorer_tasks add column if not exists status text not null default 'inprogress';
alter table public.data_explorer_tasks add column if not exists assignee text not null default '';
alter table public.data_explorer_tasks add column if not exists priority text not null default 'Média';
alter table public.data_explorer_tasks add column if not exists due_date date;
alter table public.data_explorer_tasks add column if not exists notes text not null default '';
alter table public.data_explorer_tasks add column if not exists created_at timestamptz default timezone('utc', now());
alter table public.data_explorer_tasks add column if not exists updated_at timestamptz default timezone('utc', now());
alter table public.data_explorer_tasks drop constraint if exists data_explorer_tasks_status_check;
alter table public.data_explorer_tasks add constraint data_explorer_tasks_status_check check (status in ('inprogress','completed','roadmap','blocked','onhold'));

create table if not exists public.rpde_tickets (
  id text primary key,
  team text not null check (team in ('rp','de')),
  assignee text not null default '',
  jira_id text not null default '',
  jira_url text not null default '',
  title text not null,
  status text not null check (status in ('todo','inprogress','inreview','testing','done','blocked','onhold','deployed')),
  priority text not null default 'Média',
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.rpde_tickets add column if not exists team text not null default 'rp';
alter table public.rpde_tickets add column if not exists assignee text not null default '';
alter table public.rpde_tickets add column if not exists jira_id text not null default '';
alter table public.rpde_tickets add column if not exists jira_url text not null default '';
alter table public.rpde_tickets add column if not exists title text not null default '';
alter table public.rpde_tickets add column if not exists status text not null default 'todo';
alter table public.rpde_tickets add column if not exists priority text not null default 'Média';
alter table public.rpde_tickets add column if not exists notes text not null default '';
alter table public.rpde_tickets add column if not exists created_at timestamptz default timezone('utc', now());
alter table public.rpde_tickets add column if not exists updated_at timestamptz default timezone('utc', now());
alter table public.rpde_tickets drop constraint if exists rpde_tickets_status_check;
alter table public.rpde_tickets add constraint rpde_tickets_status_check check (status in ('todo','inprogress','inreview','testing','done','blocked','onhold','deployed'));
alter table public.rpde_tickets drop constraint if exists rpde_tickets_team_check;
alter table public.rpde_tickets add constraint rpde_tickets_team_check check (team in ('rp','de'));

create table if not exists public.milestones (
  id text primary key,
  team text not null check (team in ('rp','de')),
  name text not null,
  status text not null check (status in ('notstarted','inprogress','completed','blocked','onhold')),
  assignee text not null default '',
  url text not null default '',
  notes text not null default '',
  sort_order integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.milestones add column if not exists team text not null default 'rp';
alter table public.milestones add column if not exists name text not null default '';
alter table public.milestones add column if not exists status text not null default 'notstarted';
alter table public.milestones add column if not exists assignee text not null default '';
alter table public.milestones add column if not exists url text not null default '';
alter table public.milestones add column if not exists notes text not null default '';
alter table public.milestones add column if not exists sort_order integer not null default 0;
alter table public.milestones add column if not exists updated_at timestamptz default timezone('utc', now());
alter table public.milestones add column if not exists team_id text;
alter table public.milestones alter column team_id drop not null;
alter table public.milestones drop constraint if exists milestones_status_check;
alter table public.milestones add constraint milestones_status_check check (status in ('notstarted','inprogress','completed','blocked','onhold'));
alter table public.milestones drop constraint if exists milestones_team_check;
alter table public.milestones add constraint milestones_team_check check (team in ('rp','de'));

create table if not exists public.milestone_tasks (
  id text primary key,
  milestone_id text not null references public.milestones(id) on delete cascade,
  name text not null,
  status text not null check (status in ('notstarted','inprogress','completed','blocked','onhold')),
  notes text not null default '',
  sort_order integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.milestone_tasks add column if not exists milestone_id text;
alter table public.milestone_tasks add column if not exists name text not null default '';
alter table public.milestone_tasks add column if not exists status text not null default 'notstarted';
alter table public.milestone_tasks add column if not exists notes text not null default '';
alter table public.milestone_tasks add column if not exists sort_order integer not null default 0;
alter table public.milestone_tasks add column if not exists updated_at timestamptz default timezone('utc', now());
alter table public.milestone_tasks drop constraint if exists milestone_tasks_status_check;
alter table public.milestone_tasks add constraint milestone_tasks_status_check check (status in ('notstarted','inprogress','completed','blocked','onhold'));

create table if not exists public.sprints (
  id text primary key,
  team text not null check (team in ('rp','de')),
  name text not null,
  sort_order integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.sprints add column if not exists team text not null default 'rp';
alter table public.sprints add column if not exists name text not null default '';
alter table public.sprints add column if not exists sort_order integer not null default 0;
alter table public.sprints add column if not exists updated_at timestamptz default timezone('utc', now());
alter table public.sprints add column if not exists team_id text;
alter table public.sprints alter column team_id drop not null;
alter table public.sprints drop constraint if exists sprints_team_check;
alter table public.sprints add constraint sprints_team_check check (team in ('rp','de'));

create table if not exists public.sprint_tickets (
  id text primary key,
  sprint_id text not null references public.sprints(id) on delete cascade,
  assignee text not null default '',
  jira_id text not null default '',
  jira_url text not null default '',
  title text not null,
  description text not null default '',
  status text not null check (status in ('todo','inprogress','inreview','testing','done','blocked','onhold','deployed')),
  sort_order integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.sprint_tickets add column if not exists sprint_id text;
alter table public.sprint_tickets add column if not exists assignee text not null default '';
alter table public.sprint_tickets add column if not exists jira_id text not null default '';
alter table public.sprint_tickets add column if not exists jira_url text not null default '';
alter table public.sprint_tickets add column if not exists title text not null default '';
alter table public.sprint_tickets add column if not exists description text not null default '';
alter table public.sprint_tickets add column if not exists status text not null default 'todo';
alter table public.sprint_tickets add column if not exists sort_order integer not null default 0;
alter table public.sprint_tickets add column if not exists updated_at timestamptz default timezone('utc', now());
alter table public.sprint_tickets drop constraint if exists sprint_tickets_status_check;
alter table public.sprint_tickets add constraint sprint_tickets_status_check check (status in ('todo','inprogress','inreview','testing','done','blocked','onhold','deployed'));

create index if not exists idx_project_members_project_id on public.project_members(project_id);
create index if not exists idx_velocity_sprints_team_id on public.velocity_sprints(team_id);
create index if not exists idx_velocity_members_team_id on public.velocity_members(team_id);
create index if not exists idx_velocity_points_member_id on public.velocity_points(member_id);
create index if not exists idx_milestone_tasks_milestone_id on public.milestone_tasks(milestone_id);
create index if not exists idx_sprint_tickets_sprint_id on public.sprint_tickets(sprint_id);

alter table public.settings enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.velocity_teams enable row level security;
alter table public.velocity_sprints enable row level security;
alter table public.velocity_members enable row level security;
alter table public.velocity_points enable row level security;
alter table public.data_explorer_tasks enable row level security;
alter table public.rpde_tickets enable row level security;
alter table public.milestones enable row level security;
alter table public.milestone_tasks enable row level security;
alter table public.sprints enable row level security;
alter table public.sprint_tickets enable row level security;

drop policy if exists "Allow all settings" on public.settings;
create policy "Allow all settings" on public.settings for all to anon using (true) with check (true);
drop policy if exists "Allow all projects" on public.projects;
create policy "Allow all projects" on public.projects for all to anon using (true) with check (true);
drop policy if exists "Allow all project_members" on public.project_members;
create policy "Allow all project_members" on public.project_members for all to anon using (true) with check (true);
drop policy if exists "Allow all velocity_teams" on public.velocity_teams;
create policy "Allow all velocity_teams" on public.velocity_teams for all to anon using (true) with check (true);
drop policy if exists "Allow all velocity_sprints" on public.velocity_sprints;
create policy "Allow all velocity_sprints" on public.velocity_sprints for all to anon using (true) with check (true);
drop policy if exists "Allow all velocity_members" on public.velocity_members;
create policy "Allow all velocity_members" on public.velocity_members for all to anon using (true) with check (true);
drop policy if exists "Allow all velocity_points" on public.velocity_points;
create policy "Allow all velocity_points" on public.velocity_points for all to anon using (true) with check (true);
drop policy if exists "Allow all data_explorer_tasks" on public.data_explorer_tasks;
create policy "Allow all data_explorer_tasks" on public.data_explorer_tasks for all to anon using (true) with check (true);
drop policy if exists "Allow all rpde_tickets" on public.rpde_tickets;
create policy "Allow all rpde_tickets" on public.rpde_tickets for all to anon using (true) with check (true);
drop policy if exists "Allow all milestones" on public.milestones;
create policy "Allow all milestones" on public.milestones for all to anon using (true) with check (true);
drop policy if exists "Allow all milestone_tasks" on public.milestone_tasks;
create policy "Allow all milestone_tasks" on public.milestone_tasks for all to anon using (true) with check (true);
drop policy if exists "Allow all sprints" on public.sprints;
create policy "Allow all sprints" on public.sprints for all to anon using (true) with check (true);
drop policy if exists "Allow all sprint_tickets" on public.sprint_tickets;
create policy "Allow all sprint_tickets" on public.sprint_tickets for all to anon using (true) with check (true);

insert into public.settings (key, value)
values ('monthlyHours', '176'::jsonb), ('hoursPerDay', '8'::jsonb)
on conflict (key) do nothing;
