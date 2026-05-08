import { createClient } from '@supabase/supabase-js'

const c = createClient(
  'https://dhfgtvuwxpssoovrpemo.supabase.co',
  'sb_publishable_gnKuPqDC4wCBNNrSwbANBw_KrNsp14Z',
  { auth: { persistSession: false } }
)

async function run() {
  const { data: teams, error: te } = await c.from('velocity_teams').select('id,name')
  if (te) throw te

  const { data: members, error: me } = await c.from('velocity_members').select('team_id')
  if (me) throw me

  const memberTeamIds = new Set((members || []).map((m) => m.team_id))
  const orphanTeamIds = (teams || []).filter((t) => !memberTeamIds.has(t.id)).map((t) => t.id)

  if (orphanTeamIds.length) {
    const { error: se } = await c.from('velocity_sprints').delete().in('team_id', orphanTeamIds)
    if (se) throw se

    const { error: te2 } = await c.from('velocity_teams').delete().in('id', orphanTeamIds)
    if (te2) throw te2
  }

  console.log(JSON.stringify({ removedOrphanTeams: orphanTeamIds.length, orphanTeamIds }, null, 2))
}

run().catch((e) => {
  console.error(e?.message || e)
  process.exit(1)
})
