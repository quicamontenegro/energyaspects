import { createClient } from '@supabase/supabase-js'

const sbUrl = 'https://dhfgtvuwxpssoovrpemo.supabase.co'
const sbKey = 'sb_publishable_gnKuPqDC4wCBNNrSwbANBw_KrNsp14Z'
const supabase = createClient(sbUrl, sbKey, { auth: { persistSession: false } })

function safeArray(v) {
  return Array.isArray(v) ? v : []
}

function normalizeVelocityGroup(groupValue) {
  const group = String(groupValue || '').trim().toLowerCase()
  if (group === 'rp') return 'rp'
  if (group === 'ia' || group === 'de') return 'ia'
  return 'rp'
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

  const settingsRows = [
    { key: 'monthlyHours', value: state.settings?.monthlyHours ?? 176, updated_at: now },
    { key: 'hoursPerDay', value: state.settings?.hoursPerDay ?? 8, updated_at: now },
  ]

  const projects = safeArray(state.projects)
  const projectRows = projects.map((project, idx) => ({
    id: project?.id || `proj_${idx}`,
    name: project?.name || `Project ${idx + 1}`,
    tag: project?.tag || '',
    color: project?.color || '#4f46e5',
    active: project?.active !== false,
    sort_order: idx,
    updated_at: now,
  }))

  const projectMemberRows = projects.flatMap((project, projectIdx) =>
    safeArray(project?.members).map((member, memberIdx) => ({
      id: `pmem_${project?.id || `proj_${projectIdx}`}_${memberIdx}`,
      project_id: project?.id || `proj_${projectIdx}`,
      name: member?.name || `Member ${memberIdx + 1}`,
      pto: Number(member?.pto) || 0,
      feriados: Number(member?.feriados) || 0,
      hours_off: Number(member?.hoursOff) || 0,
      total_logged: Number(member?.tl) || 0,
      sort_order: memberIdx,
      updated_at: now,
    }))
  )

  const teams = safeArray(state.teams)
  const teamRows = teams.map((team, idx) => ({
    id: team?.id || `team_${idx}`,
    name: team?.name || `Team ${idx + 1}`,
    color: team?.color || '#4f46e5',
    group_id: normalizeVelocityGroup(team?.group),
    sort_order: idx,
    updated_at: now,
  }))

  const sprintRows = teams.flatMap((team, teamIdx) =>
    safeArray(team?.sprints).map((label, sprintIdx) => ({
      id: `vs_${team?.id || `team_${teamIdx}`}_${sprintIdx}`,
      team_id: team?.id || `team_${teamIdx}`,
      position: sprintIdx,
      label: label || `Sprint ${sprintIdx + 1}`,
      completed: !!safeArray(team?.sprintCompleted)[sprintIdx],
      updated_at: now,
    }))
  )

  const memberRows = []
  const pointRows = []

  teams.forEach((team, teamIdx) => {
    const teamId = team?.id || `team_${teamIdx}`
    safeArray(team?.members).forEach((member, memberIdx) => {
      const memberId = `vm_${teamId}_${memberIdx}`
      memberRows.push({
        id: memberId,
        team_id: teamId,
        name: member?.name || `Member ${memberIdx + 1}`,
        sort_order: memberIdx,
        updated_at: now,
      })

      safeArray(member?.sp).forEach((points, sprintIdx) => {
        pointRows.push({
          id: `vp_${teamId}_${memberIdx}_${sprintIdx}`,
          member_id: memberId,
          sprint_position: sprintIdx,
          points: Number(points) || 0,
          updated_at: now,
        })
      })
    })
  })

  const { error: settingsError } = await supabase.from('settings').upsert(settingsRows, { onConflict: 'key' })
  if (settingsError) throw settingsError

  if (projectRows.length) {
    const { error } = await supabase.from('projects').upsert(projectRows, { onConflict: 'id' })
    if (error) throw error
  }

  if (projectMemberRows.length) {
    const { error } = await supabase.from('project_members').upsert(projectMemberRows, { onConflict: 'id' })
    if (error) throw error
  }

  if (teamRows.length) {
    const { error } = await supabase.from('velocity_teams').upsert(teamRows, { onConflict: 'id' })
    if (error) throw error
  }

  if (sprintRows.length) {
    let { error } = await supabase.from('velocity_sprints').upsert(sprintRows, { onConflict: 'id' })
    if (error) {
      const fallbackRows = sprintRows.map(({ completed, ...row }) => row)
      ;({ error } = await supabase.from('velocity_sprints').upsert(fallbackRows, { onConflict: 'id' }))
      if (error) throw error
    }
  }

  if (memberRows.length) {
    const { error } = await supabase.from('velocity_members').upsert(memberRows, { onConflict: 'id' })
    if (error) throw error
  }

  if (pointRows.length) {
    const { error } = await supabase.from('velocity_points').upsert(pointRows, { onConflict: 'id' })
    if (error) throw error
  }

  console.log(JSON.stringify({
    ok: true,
    recovered: {
      projects: projectRows.length,
      projectMembers: projectMemberRows.length,
      velocityTeams: teamRows.length,
      velocitySprints: sprintRows.length,
      velocityMembers: memberRows.length,
      velocityPoints: pointRows.length,
    },
  }, null, 2))
}

main().catch((err) => {
  console.error('RECOVERY_FAILED')
  console.error(err?.message || err)
  process.exit(1)
})
