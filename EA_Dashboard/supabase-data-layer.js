const STRUCTURED_STATUS = {
  deTask: ['inprogress','completed','roadmap','blocked','onhold'],
  rpdeTicket: ['todo','inprogress','inreview','testing','done','blocked','onhold','deployed'],
  milestone: ['notstarted','inprogress','completed','blocked','onhold'],
  milestoneTask: ['notstarted','inprogress','completed','blocked','onhold'],
  sprintTicket: ['todo','inprogress','inreview','testing','done','blocked','onhold','deployed']
};

const STRUCTURED_SCHEMA_FLAGS = {
  sprints:null,
  milestones:null,
  velocitySprintCompleted:null
};

let coreSnapshotWriteQueue=Promise.resolve();

function queueCoreSnapshotWrite(task){
  const next=coreSnapshotWriteQueue.then(task,task);
  coreSnapshotWriteQueue=next.catch(()=>{});
  return next;
}

function structuredSafeRows(rows){
  return Array.isArray(rows) ? rows : [];
}

async function replaceTableRows(table, rows){
  if(!sbClient)return;
  const safeRows=structuredSafeRows(rows);
  // Avoid duplicate ids in the same payload.
  const dedupedRows=[];
  const seen=new Map();
  safeRows.forEach(row=>{
    const key=String(row?.id ?? '');
    if(!key)return;
    if(seen.has(key)){
      dedupedRows[seen.get(key)]={...dedupedRows[seen.get(key)],...row};
      return;
    }
    seen.set(key,dedupedRows.length);
    dedupedRows.push(row);
  });

  // Replace semantics: remove stale rows first, then insert current snapshot.
  const {error:deleteError}=await sbClient.from(table).delete().neq('id','__never__');
  if(deleteError)throw deleteError;
  if(!dedupedRows.length)return;

  const {error:insertError}=await sbClient.from(table).insert(dedupedRows);
  if(insertError)throw insertError;
}

async function saveSettingsSnapshot(settings){
  if(!sbClient)return;
  const rows=[
    {key:'monthlyHours',value:settings.monthlyHours ?? 176,updated_at:new Date().toISOString()},
    {key:'hoursPerDay',value:settings.hoursPerDay ?? 8,updated_at:new Date().toISOString()}
  ];
  const {error}=await sbClient.from('settings').upsert(rows,{onConflict:'key'});
  if(error)throw error;
}

async function replaceProjectsSnapshot(projects){
  if(!sbClient)return;
  const now=new Date().toISOString();
  const projectRows=structuredSafeRows(projects).map((project,index)=>({
    id:project.id || `proj_${index}`,
    name:project.name || `Project ${index + 1}`,
    tag:project.tag || '',
    color:project.color || '#4f46e5',
    active:project.active !== false,
    sort_order:index,
    updated_at:now
  }));
  const memberRows=projectRows.flatMap((project,index)=>{
    const sourceMembers=structuredSafeRows(projects[index]?.members);
    return sourceMembers.map((member,memberIndex)=>({
      id:`pmem_${project.id}_${memberIndex}`,
      project_id:project.id,
      name:member.name || `Member ${memberIndex + 1}`,
      pto:Number(member.pto) || 0,
      feriados:Number(member.feriados) || 0,
      hours_off:Number(member.hoursOff) || 0,
      total_logged:Number(member.tl) || 0,
      sort_order:memberIndex,
      updated_at:now
    }));
  });
  await replaceTableRows('projects', projectRows);
  await replaceTableRows('project_members', memberRows);
}

async function replaceVelocitySnapshot(teams){
  if(!sbClient)return;
  const now=new Date().toISOString();
  const sprintFlags=STRUCTURED_SCHEMA_FLAGS.velocitySprintCompleted || {completed:true};
  STRUCTURED_SCHEMA_FLAGS.velocitySprintCompleted=sprintFlags;
  const teamRows=structuredSafeRows(teams).map((team,index)=>({
    id:team.id,
    name:team.name,
    color:team.color || '#4f46e5',
    group_id:team.group || 'rp',
    sort_order:index,
    updated_at:now
  }));
  const memberRows=[];
  const pointRows=[];
  structuredSafeRows(teams).forEach(team=>{
    structuredSafeRows(team.members).forEach((member,memberIndex)=>{
      const memberId=`vm_${team.id}_${memberIndex}`;
      memberRows.push({
        id:memberId,
        team_id:team.id,
        name:member.name,
        sort_order:memberIndex,
        updated_at:now
      });
      structuredSafeRows(member.sp).forEach((points,position)=>{
        pointRows.push({
          id:`vp_${team.id}_${memberIndex}_${position}`,
          member_id:memberId,
          sprint_position:position,
          points:Number(points) || 0,
          updated_at:now
        });
      });
    });
  });

  const buildSprintRows=(includeCompleted)=>teamRows.flatMap((team,index)=>structuredSafeRows(teams[index]?.sprints).map((label,position)=>{
    const row={
      id:`vs_${team.id}_${position}`,
      team_id:team.id,
      position,
      label,
      updated_at:now
    };
    if(includeCompleted){
      row.completed=!!teams[index]?.sprintCompleted?.[position];
    }
    return row;
  }));

  await replaceTableRows('velocity_teams', teamRows);
  try{
    await replaceTableRows('velocity_sprints', buildSprintRows(!!sprintFlags.completed));
  }catch(error){
    const message=String(error?.message || '');
    const details=String(error?.details || '');
    const missingCompleted=message.includes('completed') || details.includes('completed') || String(error?.code || '')==='PGRST204';
    if(!sprintFlags.completed || !missingCompleted)throw error;
    STRUCTURED_SCHEMA_FLAGS.velocitySprintCompleted={completed:false};
    await replaceTableRows('velocity_sprints', buildSprintRows(false));
  }
  await replaceTableRows('velocity_members', memberRows);
  await replaceTableRows('velocity_points', pointRows);
}

async function replaceDataExplorerSnapshot(tasks){
  const now=new Date().toISOString();
  await replaceTableRows('data_explorer_tasks', structuredSafeRows(tasks).map(task=>({
    id:task.id,
    name:task.name || '',
    week:task.week || null,
    status:STRUCTURED_STATUS.deTask.includes(task.status) ? task.status : 'inprogress',
    assignee:task.assignee || '',
    priority:task.priority || 'Média',
    due_date:task.dueDate || null,
    notes:task.notes || '',
    created_at:task.createdAt || now,
    updated_at:now
  })));
}

async function replaceRPDETicketsSnapshot(tickets){
  const now=new Date().toISOString();
  await replaceTableRows('rpde_tickets', structuredSafeRows(tickets).map(ticket=>({
    id:ticket.id,
    team:ticket.team || 'rp',
    assignee:ticket.assignee || '',
    jira_id:ticket.jiraId || '',
    jira_url:ticket.jiraUrl || '',
    title:ticket.title || '',
    status:STRUCTURED_STATUS.rpdeTicket.includes(ticket.status) ? ticket.status : 'todo',
    priority:ticket.priority || 'Média',
    notes:ticket.notes || '',
    created_at:ticket.createdAt || now,
    updated_at:now
  })));
}

async function detectTableColumns(table, columns){
  const checks=await Promise.all(columns.map(async column=>{
    const {error}=await sbClient.from(table).select(column).limit(1);
    return [column,!error];
  }));
  return Object.fromEntries(checks);
}

async function replaceMilestonesSnapshot(milestones){
  if(!sbClient)return;
  const now=new Date().toISOString();
  const flags=STRUCTURED_SCHEMA_FLAGS.milestones || await detectTableColumns('milestones',['team','team_id','sort_order']);
  STRUCTURED_SCHEMA_FLAGS.milestones=flags;
  const milestoneRows=structuredSafeRows(milestones).map((milestone,index)=>{
    const row={
      id:milestone.id,
      name:milestone.name || '',
      status:STRUCTURED_STATUS.milestone.includes(milestone.status) ? milestone.status : 'notstarted',
      assignee:milestone.assignee || '',
      url:milestone.url || '',
      notes:milestone.notes || '',
      updated_at:now
    };
    if(flags.team)row.team=milestone.team || 'rp';
    if(flags.team_id)row.team_id=(milestone.team || 'rp')==='de' ? 'team_de' : 'team_rp';
    if(flags.sort_order)row.sort_order=index;
    return row;
  });
  const taskRows=milestoneRows.flatMap((milestone,index)=>structuredSafeRows(milestones[index]?.tasks).map((task,taskIndex)=>({
    id:task.id,
    milestone_id:milestone.id,
    name:task.name || '',
    status:STRUCTURED_STATUS.milestoneTask.includes(task.status) ? task.status : 'notstarted',
    notes:task.notes || '',
    sort_order:taskIndex,
    updated_at:now
  })));
  await replaceTableRows('milestones', milestoneRows);
  await replaceTableRows('milestone_tasks', taskRows);
}

async function replaceSprintsSnapshot(sprints){
  if(!sbClient)return;
  const now=new Date().toISOString();
  const flags=STRUCTURED_SCHEMA_FLAGS.sprints || await detectTableColumns('sprints',['team','team_id','sort_order']);
  STRUCTURED_SCHEMA_FLAGS.sprints=flags;
  const sprintRows=structuredSafeRows(sprints).map((sprint,index)=>{
    const row={
      id:sprint.id,
      name:sprint.name || '',
      updated_at:now
    };
    if(flags.team)row.team=sprint.team || 'rp';
    if(flags.team_id)row.team_id=(sprint.team || 'rp')==='de' ? 'team_de' : 'team_rp';
    if(flags.sort_order)row.sort_order=index;
    return row;
  });
  const ticketRows=sprintRows.flatMap((sprint,index)=>structuredSafeRows(sprints[index]?.tickets).map((ticket,ticketIndex)=>({
    id:ticket.id,
    sprint_id:sprint.id,
    assignee:ticket.assignee || '',
    jira_id:ticket.jiraId || '',
    jira_url:ticket.jiraUrl || '',
    title:ticket.title || '',
    description:ticket.desc || '',
    status:STRUCTURED_STATUS.sprintTicket.includes(ticket.status) ? ticket.status : 'todo',
    sort_order:ticketIndex,
    updated_at:now
  })));
  await replaceTableRows('sprints', sprintRows);
  await replaceTableRows('sprint_tickets', ticketRows);
}

async function saveCoreSnapshot(snapshot){
  return queueCoreSnapshotWrite(async()=>{
    await saveSettingsSnapshot(snapshot.settings || {});
    await replaceProjectsSnapshot(snapshot.projects || []);
    await replaceVelocitySnapshot(snapshot.teams || []);
  });
}

async function loadStructuredSettings(){
  const result={monthlyHours:176,hoursPerDay:8};
  const {data,error}=await sbClient.from('settings').select('key,value');
  if(error)throw error;
  (data || []).forEach(row=>{
    if(row.key==='monthlyHours')result.monthlyHours=Number(row.value) || 176;
    if(row.key==='hoursPerDay')result.hoursPerDay=Number(row.value) || 8;
  });
  return result;
}

async function loadStructuredProjects(){
  const {data:projects,error:projectError}=await sbClient.from('projects').select('*').order('sort_order');
  if(projectError)throw projectError;
  const {data:members,error:memberError}=await sbClient.from('project_members').select('*').order('sort_order');
  if(memberError)throw memberError;
  const groupedMembers=(members || []).reduce((acc,member)=>{
    if(!acc[member.project_id])acc[member.project_id]=[];
    acc[member.project_id].push({
      name:member.name,
      pto:Number(member.pto) || 0,
      feriados:Number(member.feriados) || 0,
      hoursOff:Number(member.hours_off) || 0,
      tl:Number(member.total_logged) || 0
    });
    return acc;
  },{});
  return (projects || []).map(project=>({
    id:project.id,
    name:project.name,
    tag:project.tag || '',
    color:project.color || '#4f46e5',
    active:project.active !== false,
    members:groupedMembers[project.id] || []
  }));
}

async function loadStructuredVelocity(){
  const [{data:teams,error:teamError},{data:sprints,error:sprintError},{data:members,error:memberError},{data:points,error:pointError}] = await Promise.all([
    selectRowsWithOptionalOrder('velocity_teams','sort_order'),
    selectRowsWithOptionalOrder('velocity_sprints','position'),
    selectRowsWithOptionalOrder('velocity_members','sort_order'),
    selectRowsWithOptionalOrder('velocity_points','sprint_position')
  ]);
  if(teamError)throw teamError;
  if(sprintError)console.warn('Structured velocity_sprints load failed; using positional fallback labels.', sprintError);
  if(memberError)throw memberError;
  if(pointError)throw pointError;

  const sortedTeams=sortStructuredRows(teams);
  const safeSprints=Array.isArray(sprints) ? sprints : [];
  const sortedMembers=sortStructuredRows(members);
  const sortedPoints=sortStructuredRows(points);

  return (sortedTeams || []).map(team=>{
    const teamMembers=(sortedMembers || []).filter(member=>member.team_id===team.id);
    const memberPoints=teamMembers.map(member=>
      (sortedPoints || [])
        .filter(point=>point.member_id===member.id)
        .sort((a,b)=>(a.sprint_position||0)-(b.sprint_position||0))
    );
    const sprintCount=memberPoints.reduce((maxCount,row)=>Math.max(maxCount,row.length),0);
    const teamSprintRows=safeSprints
      .filter(sprint=>sprint.team_id===team.id)
      .sort((a,b)=>(a.position||0)-(b.position||0));
    const sprintLabels=Array.from({length:sprintCount},(_,idx)=>{
      const structuredLabel=teamSprintRows.find(row=>(row.position||0)===idx)?.label;
      return structuredLabel || `Sprint ${idx+1}`;
    });
    const sprintCompleted=sprintLabels.map((_,idx)=>!!teamSprintRows.find(row=>(row.position||0)===idx)?.completed);

    return {
      id:team.id,
      name:team.name,
      color:team.color,
      group:team.group_id,
      sprints:sprintLabels,
      sprintCompleted,
      members:teamMembers.map(member=>({
        name:member.name,
        sp:(sortedPoints || [])
          .filter(point=>point.member_id===member.id)
          .sort((a,b)=>(a.sprint_position||0)-(b.sprint_position||0))
          .map(point=>Number(point.points) || 0)
      }))
    };
  });
}

async function loadStructuredDataExplorer(){
  const {data,error}=await sbClient.from('data_explorer_tasks').select('*').order('created_at');
  if(error)throw error;
  return (data || []).map(task=>({
    id:task.id,
    name:task.name,
    week:task.week || '',
    status:task.status,
    assignee:task.assignee || '',
    priority:task.priority || 'Média',
    dueDate:task.due_date || '',
    notes:task.notes || '',
    createdAt:task.created_at
  }));
}

async function loadStructuredRPDETickets(){
  const {data,error}=await sbClient.from('rpde_tickets').select('*').order('created_at');
  if(error)throw error;
  return (data || []).map(ticket=>({
    id:ticket.id,
    team:ticket.team,
    assignee:ticket.assignee || '',
    jiraId:ticket.jira_id || '',
    jiraUrl:ticket.jira_url || '',
    title:ticket.title,
    status:ticket.status,
    priority:ticket.priority || 'Média',
    notes:ticket.notes || '',
    createdAt:ticket.created_at
  }));
}

async function selectRowsWithOptionalOrder(table, orderColumn){
  // Some deployments don't have all expected sort columns yet.
  // Query without server-side order to avoid noisy 400 responses in the console.
  return sbClient.from(table).select('*');
}

function normalizeStructuredTeam(teamValue, teamIdValue){
  if(teamValue==='de' || teamValue==='rp')return teamValue;
  if(teamIdValue==='team_de')return 'de';
  if(teamIdValue==='team_rp')return 'rp';
  return 'rp';
}

function sortStructuredRows(rows){
  return [...(rows || [])].sort((left,right)=>{
    const leftOrder=Number.isFinite(Number(left?.sort_order)) ? Number(left.sort_order) : Number.MAX_SAFE_INTEGER;
    const rightOrder=Number.isFinite(Number(right?.sort_order)) ? Number(right.sort_order) : Number.MAX_SAFE_INTEGER;
    if(leftOrder!==rightOrder)return leftOrder-rightOrder;
    const leftCreated=left?.created_at ? Date.parse(left.created_at) : 0;
    const rightCreated=right?.created_at ? Date.parse(right.created_at) : 0;
    return leftCreated-rightCreated;
  });
}

async function loadStructuredMilestones(){
  const [{data:milestones,error:milestoneError},{data:tasks,error:taskError}] = await Promise.all([
    selectRowsWithOptionalOrder('milestones','sort_order'),
    selectRowsWithOptionalOrder('milestone_tasks','sort_order')
  ]);
  if(milestoneError)throw milestoneError;
  if(taskError)throw taskError;
  STRUCTURED_SCHEMA_FLAGS.milestones={
    team:(milestones || []).some(milestone=>Object.prototype.hasOwnProperty.call(milestone,'team')),
    team_id:(milestones || []).some(milestone=>Object.prototype.hasOwnProperty.call(milestone,'team_id')),
    sort_order:(milestones || []).some(milestone=>Object.prototype.hasOwnProperty.call(milestone,'sort_order'))
  };
  const groupedTasks=sortStructuredRows(tasks).reduce((acc,task)=>{
    if(!acc[task.milestone_id])acc[task.milestone_id]=[];
    acc[task.milestone_id].push({
      id:task.id,
      name:task.name,
      status:task.status,
      notes:task.notes || ''
    });
    return acc;
  },{});
  return sortStructuredRows(milestones).map(milestone=>({
    id:milestone.id,
    team:normalizeStructuredTeam(milestone.team, milestone.team_id),
    name:milestone.name,
    status:milestone.status,
    assignee:milestone.assignee || '',
    url:milestone.url || '',
    notes:milestone.notes || '',
    tasks:groupedTasks[milestone.id] || []
  }));
}

async function loadStructuredSprints(){
  const [{data:sprints,error:sprintError},{data:tickets,error:ticketError}] = await Promise.all([
    selectRowsWithOptionalOrder('sprints','sort_order'),
    selectRowsWithOptionalOrder('sprint_tickets','sort_order')
  ]);
  if(sprintError)throw sprintError;
  if(ticketError)throw ticketError;
  STRUCTURED_SCHEMA_FLAGS.sprints={
    team:(sprints || []).some(sprint=>Object.prototype.hasOwnProperty.call(sprint,'team')),
    team_id:(sprints || []).some(sprint=>Object.prototype.hasOwnProperty.call(sprint,'team_id')),
    sort_order:(sprints || []).some(sprint=>Object.prototype.hasOwnProperty.call(sprint,'sort_order'))
  };
  const groupedTickets=sortStructuredRows(tickets).reduce((acc,ticket)=>{
    if(!acc[ticket.sprint_id])acc[ticket.sprint_id]=[];
    acc[ticket.sprint_id].push({
      id:ticket.id,
      assignee:ticket.assignee || '',
      jiraId:ticket.jira_id || '',
      jiraUrl:ticket.jira_url || '',
      title:ticket.title,
      desc:ticket.description || '',
      status:ticket.status
    });
    return acc;
  },{});
  const mapped=sortStructuredRows(sprints).map(sprint=>({
    id:sprint.id,
    team:normalizeStructuredTeam(sprint.team, sprint.team_id),
    name:sprint.name,
    tickets:groupedTickets[sprint.id] || []
  }));
  return mapped;
}

async function loadAllData(){
  if(!sbClient)return null;
  try{
    const [settings,projects,teams,deTasks,rpdeTickets,msData,spData]=await Promise.allSettled([
      loadStructuredSettings(),
      loadStructuredProjects(),
      loadStructuredVelocity(),
      loadStructuredDataExplorer(),
      loadStructuredRPDETickets(),
      loadStructuredMilestones(),
      loadStructuredSprints()
    ]);
    if(settings.status==='rejected')console.error('Structured settings load failed:', settings.reason);
    if(projects.status==='rejected')console.error('Structured projects load failed:', projects.reason);
    if(teams.status==='rejected')console.error('Structured velocity load failed:', teams.reason);
    if(deTasks.status==='rejected')console.error('Structured DE load failed:', deTasks.reason);
    if(rpdeTickets.status==='rejected')console.error('Structured RPDE load failed:', rpdeTickets.reason);
    if(msData.status==='rejected')console.error('Structured milestones load failed:', msData.reason);
    if(spData.status==='rejected')console.error('Structured sprints load failed:', spData.reason);
    return {
      settings:settings.status==='fulfilled' ? settings.value : {monthlyHours:176,hoursPerDay:8},
      projects:projects.status==='fulfilled' ? projects.value : [],
      teams:teams.status==='fulfilled' ? teams.value : [],
      deTasks:deTasks.status==='fulfilled' ? deTasks.value : [],
      rpdeTickets:rpdeTickets.status==='fulfilled' ? rpdeTickets.value : [],
      msData:msData.status==='fulfilled' ? msData.value : [],
      spData:spData.status==='fulfilled' ? spData.value : []
    };
  }catch(err){
    console.error('Structured load failed:', err);
    return null;
  }
}
