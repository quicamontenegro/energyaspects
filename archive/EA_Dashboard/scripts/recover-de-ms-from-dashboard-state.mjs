import { createClient } from '@supabase/supabase-js'

const sbUrl = 'https://dhfgtvuwxpssoovrpemo.supabase.co'
const sbKey = 'sb_publishable_gnKuPqDC4wCBNNrSwbANBw_KrNsp14Z'
const supabase = createClient(sbUrl, sbKey, { auth: { persistSession: false } })

function safeArray(v) { return Array.isArray(v) ? v : [] }

async function upsertMilestonesWithFallback(rows) {
  if (!rows.length) return { count: 0, mode: 'none' }
  let { error } = await supabase.from('milestones').upsert(rows, { onConflict: 'id' })
  if (!error) return { count: rows.length, mode: 'full' }

  const fallback = rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    assignee: r.assignee,
    url: r.url,
    notes: r.notes,
    updated_at: r.updated_at,
  }))

  ;({ error } = await supabase.from('milestones').upsert(fallback, { onConflict: 'id' }))
  if (error) throw error
  return { count: fallback.length, mode: 'fallback' }
}

async function main() {
  const { data: stateRecord, error: stateError } = await supabase
    .from('dashboard_state')
    .select('id, state')
    .eq('id', 'invoicing_dashboard')
    .single()

  if (stateError) throw stateError
  if (!stateRecord?.state) throw new Error('dashboard_state vazio ou inexistente')

  const state = stateRecord.state
  const now = new Date().toISOString()

  const deTasks = safeArray(state.deTasks)
  const deRows = deTasks.map((t, i) => ({
    id: t?.id || `de_${i}_${crypto.randomUUID()}`,
    name: t?.name || '',
    title: t?.name || '',
    week: t?.week || null,
    status: t?.status || 'inprogress',
    assignee: t?.assignee || '',
    priority: t?.priority || 'Média',
    due_date: t?.dueDate || null,
    notes: t?.notes || '',
    created_at: t?.createdAt || now,
    updated_at: now,
  }))

  if (deRows.length) {
    const { error: deError } = await supabase.from('data_explorer_tasks').upsert(deRows, { onConflict: 'id' })
    if (deError) throw deError
  }

  const milestones = safeArray(state.msData)
  const milestoneRows = milestones.map((m, idx) => ({
    id: m?.id || `ms_${idx}_${crypto.randomUUID()}`,
    team: m?.team || 'rp',
    team_id: (m?.team || 'rp') === 'de' ? 'team_de' : 'team_rp',
    name: m?.name || '',
    status: m?.status || 'notstarted',
    assignee: m?.assignee || '',
    url: m?.url || '',
    notes: m?.notes || '',
    sort_order: idx,
    updated_at: now,
  }))

  const milestoneTasks = []
  milestones.forEach((m, mi) => {
    safeArray(m?.tasks).forEach((task, ti) => {
      milestoneTasks.push({
        id: task?.id || `mst_${mi}_${ti}_${crypto.randomUUID()}`,
        milestone_id: m?.id || milestoneRows[mi]?.id,
        name: task?.name || '',
        title: task?.name || '',
        status: task?.status || 'notstarted',
        notes: task?.notes || '',
        sort_order: ti,
        updated_at: now,
      })
    })
  })

  const milestoneResult = await upsertMilestonesWithFallback(milestoneRows)

  if (milestoneTasks.length) {
    const { error: taskError } = await supabase.from('milestone_tasks').upsert(milestoneTasks, { onConflict: 'id' })
    if (taskError) throw taskError
  }

  console.log(JSON.stringify({
    ok: true,
    recovered: {
      deTasks: deRows.length,
      milestones: milestoneRows.length,
      milestoneTasks: milestoneTasks.length,
    },
    milestoneMode: milestoneResult.mode,
  }, null, 2))
}

main().catch((err) => {
  console.error('RECOVERY_FAILED')
  console.error(err?.message || err)
  process.exit(1)
})
