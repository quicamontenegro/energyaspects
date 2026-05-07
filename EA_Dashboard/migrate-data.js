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

    // 2. Migrate deTasks
    if (Array.isArray(state.deTasks) && state.deTasks.length > 0) {
      console.log(`📝 Migrating ${state.deTasks.length} deTasks...`);
      
      const tasks = state.deTasks.map(t => ({
        id: t.id || crypto.randomUUID(),
        name: t.name || '',
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

    // 3. Migrate rpdeTickets
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

    // 4. Migrate milestones
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

      // 5. Migrate milestone_tasks
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
    }

    console.log('🎉 Migration completed!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
