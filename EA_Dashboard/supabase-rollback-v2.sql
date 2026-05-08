begin;

-- Rollback for objects created by supabase-schema-v2.sql
-- This removes only the known Energy Aspects dashboard objects in schema public.

-- Drop known RLS policies (safe no-op if table/policy does not exist)
drop policy if exists "Allow all settings" on public.settings;
drop policy if exists "Allow all projects" on public.projects;
drop policy if exists "Allow all project_members" on public.project_members;
drop policy if exists "Allow all velocity_teams" on public.velocity_teams;
drop policy if exists "Allow all velocity_sprints" on public.velocity_sprints;
drop policy if exists "Allow all velocity_members" on public.velocity_members;
drop policy if exists "Allow all velocity_points" on public.velocity_points;
drop policy if exists "Allow all data_explorer_tasks" on public.data_explorer_tasks;
drop policy if exists "Allow all rpde_tickets" on public.rpde_tickets;
drop policy if exists "Allow all milestones" on public.milestones;
drop policy if exists "Allow all milestone_tasks" on public.milestone_tasks;
drop policy if exists "Allow all sprints" on public.sprints;
drop policy if exists "Allow all sprint_tickets" on public.sprint_tickets;

-- Drop known indexes (safe no-op if index does not exist)
drop index if exists public.idx_project_members_project_id;
drop index if exists public.idx_velocity_sprints_team_id;
drop index if exists public.idx_velocity_members_team_id;
drop index if exists public.idx_velocity_points_member_id;
drop index if exists public.idx_milestone_tasks_milestone_id;
drop index if exists public.idx_sprint_tickets_sprint_id;

-- Drop tables in dependency order (children first)
drop table if exists public.sprint_tickets cascade;
drop table if exists public.sprints cascade;
drop table if exists public.milestone_tasks cascade;
drop table if exists public.milestones cascade;
drop table if exists public.rpde_tickets cascade;
drop table if exists public.data_explorer_tasks cascade;
drop table if exists public.velocity_points cascade;
drop table if exists public.velocity_members cascade;
drop table if exists public.velocity_sprints cascade;
drop table if exists public.velocity_teams cascade;
drop table if exists public.project_members cascade;
drop table if exists public.projects cascade;
drop table if exists public.settings cascade;

commit;
