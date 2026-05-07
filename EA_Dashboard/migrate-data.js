import { createClient } from '@supabase/supabase-js';

const sbUrl = 'https://dhfgtvuwxpssoovrpemo.supabase.co';
const sbKey = 'sb_publishable_gnKuPqDC4wCBNNrSwbANBw_KrNsp14Z';

const supabase = createClient(sbUrl, sbKey);

async function migrate() {
  console.log('🔄 Starting data migration...');

  try {
    // 1. Load dashboard_state
    const { data: stateRecords, error: stateError } = await supabase
      .from('dashboard_state')
      .select('id, state')
      .eq('id', 'invoicing_dashboard')
      .single();

    if (stateError) throw stateError;
    if (!stateRecords?.state) {
      console.log('❌ No dashboard_state found');
      return;
    }

    const state = stateRecords.state;
    console.log('✅ Loaded dashboard_state');

    // 2. Migrate settings-backed metadata
    const settingsRows = [
      {
        key: 'monthlyHours',
        value: state.settings?.monthlyHours ?? 176,
        updated_at: new Date().toISOString()
      },
      {
        key: 'hoursPerDay',
        value: state.settings?.hoursPerDay ?? 8,
        updated_at: new Date().toISOString()
      },
      {
        key: 'deMeetings',
        value: Array.isArray(state.deMeetings) ? state.deMeetings.map(m => ({
          id: m.id || crypto.randomUUID(),
          name: m.name || '',
          week: m.week || '',
          notes: m.notes || '',
          createdAt: m.createdAt || new Date().toISOString()
        })) : [],
        updated_at: new Date().toISOString()
      },
      {
        key: 'spTeamMembers',
        value: {
          rp: Array.isArray(state.spTeamMembers?.rp) ? state.spTeamMembers.rp.map(member => ({
            name: member?.name || '',
            role: member?.role || ''
          })) : [],
          de: Array.isArray(state.spTeamMembers?.de) ? state.spTeamMembers.de.map(member => ({
            name: member?.name || '',
            role: member?.role || ''
          })) : []
        },
        updated_at: new Date().toISOString()
      }
    ];

    const { error: settingsError } = await supabase
      .from('settings')
      .upsert(settingsRows, { onConflict: 'key' });

    if (settingsError) throw settingsError;
    console.log('✅ Migrated settings metadata');

    // 3. Migrate invoicing projects
    if (Array.isArray(state.projects) && state.projects.length > 0) {
      console.log(`📦 Migrating ${state.projects.length} projects...`);

      const projects = state.projects.map((project, idx) => ({
        id: project.id || `proj_${idx}`,
        name: project.name || `Project ${idx + 1}`,
        tag: project.tag || '',
        color: project.color || '#4f46e5',
        active: project.active !== false,
        sort_order: idx,
        updated_at: new Date().toISOString()
      }));

      const projectMembers = state.projects.flatMap((project, projectIdx) =>
        (Array.isArray(project.members) ? project.members : []).map((member, memberIdx) => ({
          id: `pmem_${project.id || `proj_${projectIdx}`}_${memberIdx}`,
          project_id: project.id || `proj_${projectIdx}`,
          name: member.name || `Member ${memberIdx + 1}`,
          pto: Number(member.pto) || 0,
          feriados: Number(member.feriados) || 0,
          hours_off: Number(member.hoursOff) || 0,
          total_logged: Number(member.tl) || 0,
          sort_order: memberIdx,
          updated_at: new Date().toISOString()
        }))
      );

      const { error: projectsError } = await supabase.from('projects').upsert(projects, { onConflict: 'id' });
      if (projectsError) throw projectsError;
      const { error: projectMembersError } = await supabase.from('project_members').upsert(projectMembers, { onConflict: 'id' });
      if (projectMembersError) throw projectMembersError;
      console.log(`✅ Migrated ${projects.length} projects and ${projectMembers.length} project members`);
    } else {
      console.log('ℹ️  No projects to migrate');
    }

    // 4. Migrate velocity teams
    if (Array.isArray(state.teams) && state.teams.length > 0) {
      console.log(`⚡ Migrating ${state.teams.length} velocity teams...`);

      const teams = state.teams.map((team, idx) => ({
        id: team.id || `team_${idx}`,
        name: team.name || `Team ${idx + 1}`,
        color: team.color || '#4f46e5',
        group_id: team.group || 'rp',
        sort_order: idx,
        updated_at: new Date().toISOString()
      }));

      const velocitySprints = state.teams.flatMap((team, teamIdx) =>
        (Array.isArray(team.sprints) ? team.sprints : []).map((label, sprintIdx) => ({
          id: `vs_${team.id || `team_${teamIdx}`}_${sprintIdx}`,
          team_id: team.id || `team_${teamIdx}`,
          position: sprintIdx,
          label: label || `Sprint ${sprintIdx + 1}`,
          updated_at: new Date().toISOString()
        }))
      );

      const velocityMembers = [];
      const velocityPoints = [];
      state.teams.forEach((team, teamIdx) => {
        (Array.isArray(team.members) ? team.members : []).forEach((member, memberIdx) => {
          const memberId = `vm_${team.id || `team_${teamIdx}`}_${memberIdx}`;
          velocityMembers.push({
            id: memberId,
            team_id: team.id || `team_${teamIdx}`,
            name: member.name || `Member ${memberIdx + 1}`,
            sort_order: memberIdx,
            updated_at: new Date().toISOString()
          });

          (Array.isArray(member.sp) ? member.sp : []).forEach((points, sprintIdx) => {
            velocityPoints.push({
              id: `vp_${team.id || `team_${teamIdx}`}_${memberIdx}_${sprintIdx}`,
              member_id: memberId,
              sprint_position: sprintIdx,
              points: Number(points) || 0,
              updated_at: new Date().toISOString()
            });
          });
        });
      });

      const { error: teamsError } = await supabase.from('velocity_teams').upsert(teams, { onConflict: 'id' });
      if (teamsError) throw teamsError;
      const { error: velocitySprintsError } = await supabase.from('velocity_sprints').upsert(velocitySprints, { onConflict: 'id' });
      if (velocitySprintsError) throw velocitySprintsError;
      const { error: velocityMembersError } = await supabase.from('velocity_members').upsert(velocityMembers, { onConflict: 'id' });
      if (velocityMembersError) throw velocityMembersError;
      const { error: velocityPointsError } = await supabase.from('velocity_points').upsert(velocityPoints, { onConflict: 'id' });
      if (velocityPointsError) throw velocityPointsError;
      console.log(`✅ Migrated velocity teams (${teams.length}), sprints (${velocitySprints.length}), members (${velocityMembers.length}) and points (${velocityPoints.length})`);
    } else {
      console.log('ℹ️  No velocity teams to migrate');
    }

    // 5. Migrate deTasks
    if (Array.isArray(state.deTasks) && state.deTasks.length > 0) {
      console.log(`📝 Migrating ${state.deTasks.length} deTasks...`);
      
      const tasks = state.deTasks.map(t => ({
        id: t.id || crypto.randomUUID(),
        name: t.name || '',
        title: t.name || '',
        week: t.week ? new Date(t.week).toISOString().split('T')[0] : null,
        status: t.status || 'inprogress',
        assignee: t.assignee || '',
        priority: t.priority || 'Média',
        due_date: t.dueDate ? new Date(t.dueDate).toISOString().split('T')[0] : null,
        notes: t.notes || '',
        created_at: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      const { error: insertError } = await supabase
        .from('data_explorer_tasks')
        .upsert(tasks, { onConflict: 'id' });

      if (insertError) throw insertError;
      console.log(`✅ Migrated ${tasks.length} deTasks`);
    } else {
      console.log('ℹ️  No deTasks to migrate');
    }

    // 6. Migrate rpdeTickets
    if (Array.isArray(state.rpdeTickets) && state.rpdeTickets.length > 0) {
      console.log(`🎫 Migrating ${state.rpdeTickets.length} rpdeTickets...`);
      
      const tickets = state.rpdeTickets.map(t => ({
        id: t.id || crypto.randomUUID(),
        team: t.team || 'rp',
        assignee: t.assignee || '',
        jira_id: t.jiraId || '',
        jira_url: t.jiraUrl || '',
        title: t.title || '',
        status: t.status || 'todo',
        priority: t.priority || 'Média',
        notes: t.notes || '',
        created_at: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      const { error: insertError } = await supabase
        .from('rpde_tickets')
        .upsert(tickets, { onConflict: 'id' });

      if (insertError) throw insertError;
      console.log(`✅ Migrated ${tickets.length} rpdeTickets`);
    } else {
      console.log('ℹ️  No rpdeTickets to migrate');
    }

    // 7. Migrate milestones
    if (Array.isArray(state.msData) && state.msData.length > 0) {
      console.log(`🏁 Migrating ${state.msData.length} milestones...`);
      
      const milestones = state.msData.map((m, idx) => ({
        id: m.id || crypto.randomUUID(),
        team: m.team || 'rp',
        team_id: m.team === 'de' ? 'team_de' : 'team_rp',
        name: m.name || '',
        status: m.status || 'notstarted',
        assignee: m.assignee || '',
        url: m.url || '',
        notes: m.notes || '',
        sort_order: idx,
        updated_at: new Date().toISOString()
      }));

      const { error: insertError } = await supabase
        .from('milestones')
        .upsert(milestones, { onConflict: 'id' });

      if (insertError) throw insertError;
      console.log(`✅ Migrated ${milestones.length} milestones`);

      // 8. Migrate milestone_tasks
      let taskCount = 0;
      const milestoneTasks = [];
      
      state.msData.forEach(m => {
        if (Array.isArray(m.tasks) && m.tasks.length > 0) {
          m.tasks.forEach((t, idx) => {
            if (t && t.name) {  // Only add if task has a name
              milestoneTasks.push({
                id: t.id || crypto.randomUUID(),
                milestone_id: m.id || crypto.randomUUID(),
                name: t.name,
                title: t.name, // Also set title
                status: t.status || 'notstarted',
                notes: t.notes || '',
                sort_order: idx,
                updated_at: new Date().toISOString()
              });
              taskCount++;
            }
          });
        }
      });

      if (milestoneTasks.length > 0) {
        const { error: insertError } = await supabase
          .from('milestone_tasks')
          .upsert(milestoneTasks, { onConflict: 'id' });

        if (insertError) throw insertError;
        console.log(`✅ Migrated ${taskCount} milestone_tasks`);
      }
    } else {
      console.log('ℹ️  No milestones to migrate');
    }

    // 9. Migrate sprints
    if (Array.isArray(state.spData) && state.spData.length > 0) {
      console.log(`🏃 Migrating ${state.spData.length} sprints...`);

      const sprints = state.spData.map((sprint, idx) => ({
        id: sprint.id || crypto.randomUUID(),
        team: sprint.team || 'rp',
        team_id: sprint.team === 'de' ? 'team_de' : 'team_rp',
        name: sprint.name || `Sprint ${idx + 1}`,
        sort_order: idx,
        updated_at: new Date().toISOString()
      }));

      const sprintTickets = [];
      state.spData.forEach((sprint, sprintIdx) => {
        (Array.isArray(sprint.tickets) ? sprint.tickets : []).forEach((ticket, ticketIdx) => {
          sprintTickets.push({
            id: ticket.id || crypto.randomUUID(),
            sprint_id: sprint.id || sprints[sprintIdx].id,
            assignee: ticket.assignee || '',
            jira_id: ticket.jiraId || '',
            jira_url: ticket.jiraUrl || '',
            title: ticket.title || '',
            description: ticket.desc || '',
            status: ticket.status || 'todo',
            sort_order: ticketIdx,
            updated_at: new Date().toISOString()
          });
        });
      });

      const { error: sprintsError } = await supabase.from('sprints').upsert(sprints, { onConflict: 'id' });
      if (sprintsError) throw sprintsError;
      const { error: sprintTicketsError } = await supabase.from('sprint_tickets').upsert(sprintTickets, { onConflict: 'id' });
      if (sprintTicketsError) throw sprintTicketsError;
      console.log(`✅ Migrated ${sprints.length} sprints and ${sprintTickets.length} sprint tickets`);
    } else {
      console.log('ℹ️  No sprints to migrate');
    }

    console.log('🎉 Migration completed!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
