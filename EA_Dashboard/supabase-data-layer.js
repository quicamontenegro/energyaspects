let sbClient=null;

export function setSupabaseClient(client){
  sbClient=client;
}

const STRUCTURED_STATUS = {
  deTask: ['inprogress','completed','roadmap','blocked','onhold'],
  rpdeTicket: ['todo','inprogress','inreview','testing','done','blocked','onhold','deployed'],
  milestone: ['notstarted','inprogress','completed','blocked','onhold'],
  milestoneTask: ['notstarted','inprogress','completed','blocked','onhold'],
  sprintTicket: ['todo','inprogress','inreview','testing','done','blocked','onhold','deployed']
};

const STRUCTURED_SCHEMA_FLAGS = {
  dataExplorerTasks:null,
  sprints:null,
  sprintTickets:null,
  milestones:null,
  milestoneTasks:null,
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

function normalizeVelocityGroupForWrite(groupValue){
  const group=String(groupValue || '').trim().toLowerCase();
  if(group==='rp')return 'rp';
  if(group==='de' || group==='ia')return 'ia';
  return 'rp';
}

function normalizeVelocityGroupForRead(groupValue){
  const group=String(groupValue || '').trim().toLowerCase();
  if(group==='rp')return 'rp';
  if(group==='ia' || group==='de')return 'de';
  return 'rp';
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

  const {data:existingRows,error:existingError}=await sbClient.from(table).select('id');
  if(existingError)throw existingError;

  const existingIds=(existingRows || []).map(row=>String(row?.id || '')).filter(Boolean);
  const incomingIds=new Set(dedupedRows.map(row=>String(row.id)));

  if(!dedupedRows.length){
    if(!existingIds.length)return;
    const CHUNK_SIZE=500;
    for(let index=0; index<existingIds.length; index+=CHUNK_SIZE){
      const chunk=existingIds.slice(index,index + CHUNK_SIZE);
      const {error:deleteError}=await sbClient.from(table).delete().in('id',chunk);
      if(deleteError)throw deleteError;
    }
    return;
  }

  const {error:upsertError}=await sbClient.from(table).upsert(dedupedRows,{onConflict:'id'});
  if(upsertError)throw upsertError;

  const staleIds=existingIds.filter(id=>!incomingIds.has(id));
  if(!staleIds.length)return;

  const CHUNK_SIZE=500;
  for(let index=0; index<staleIds.length; index+=CHUNK_SIZE){
    const chunk=staleIds.slice(index,index + CHUNK_SIZE);
    const {error:deleteError}=await sbClient.from(table).delete().in('id',chunk);
    if(deleteError)throw deleteError;
  }
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
    group_id:normalizeVelocityGroupForWrite(team.group),
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
  const sprintRows = buildSprintRows(!!sprintFlags.completed);
  try{
    await replaceTableRows('velocity_sprints', sprintRows);
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
  if(!sbClient)return;
  const now=new Date().toISOString();
  const taskRows = structuredSafeRows(tasks).map(task=>{
    const row={
      id:task.id,
      name:task.name || '',
      week:task.week || null,
      meeting_id:task.meetingId || '',
      status:STRUCTURED_STATUS.deTask.includes(task.status) ? task.status : 'inprogress',
      assignee:task.assignee || '',
      jira_id:task.jiraId || '',
      priority:task.priority || 'Média',
      due_date:task.dueDate || null,
      notes:task.notes || '',
      created_at:task.createdAt || now,
      updated_at:now
    };
    const flags=STRUCTURED_SCHEMA_FLAGS.dataExplorerTasks || {};
    if(flags.title)row.title=task.name || '';
    return row;
  });
  await replaceTableRows('data_explorer_tasks', taskRows);
}

async function replaceRPDETicketsSnapshot(tickets){
  const now=new Date().toISOString();
  const ticketRows = structuredSafeRows(tickets).map(ticket=>({
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
  }));
  await replaceTableRows('rpde_tickets', ticketRows);
}

async function saveStructuredMetadata(snapshot){
  if(!sbClient)return;
  const now=new Date().toISOString();
  const sprintMembersRaw=Array.isArray(snapshot.spTeamMembers)
    ? snapshot.spTeamMembers
    : [
      ...structuredSafeRows(snapshot.spTeamMembers?.rp),
      ...structuredSafeRows(snapshot.spTeamMembers?.de)
    ];
  const seenMembers=new Set();
  let sprintMembers=sprintMembersRaw
    .map(member=>({name:member?.name || '',role:member?.role || ''}))
    .filter(member=>{
      const key=member.name.trim().toLowerCase();
      if(!key || seenMembers.has(key))return false;
      seenMembers.add(key);
      return true;
    });

  if(!sprintMembers.length){
    const {data:existingMemberSetting,error:existingMemberSettingError}=await sbClient
      .from('settings')
      .select('value')
      .eq('key','spTeamMembers')
      .maybeSingle();
    if(existingMemberSettingError)throw existingMemberSettingError;

    const existingValue=existingMemberSetting?.value;
    const existingMembers=Array.isArray(existingValue)
      ? existingValue
      : [
        ...structuredSafeRows(existingValue?.rp),
        ...structuredSafeRows(existingValue?.de)
      ];
    if(existingMembers.length){
      sprintMembers=existingMembers
        .map(member=>({name:member?.name || '',role:member?.role || ''}))
        .filter(member=>String(member.name || '').trim());
    }
  }
  const rows=[
    {
      key:'deMeetings',
      value:structuredSafeRows(snapshot.deMeetings).map(meeting=>({
        id:meeting?.id || '',
        date:meeting?.date || '',
        week:meeting?.week || '',
        name:meeting?.name || '',
        notes:meeting?.notes || '',
        createdAt:meeting?.createdAt || ''
      })),
      updated_at:now
    },
    {
      key:'spTeamMembers',
      value:sprintMembers,
      updated_at:now
    },
    {
      key:'spNotes',
      value:structuredSafeRows(snapshot.spNotes).map(note=>({
        id:note?.id || '',
        text:note?.text || '',
        color:note?.color || '',
        link:note?.link || '',
        createdAt:note?.createdAt || ''
      })),
      updated_at:now
    },
    {
      key:'spSprintNotesBoard',
      value:structuredSafeRows(snapshot.spData).map(sprint=>({
        sprintId:sprint?.id || '',
        notes:structuredSafeRows(sprint?.notesBoard).map(note=>({
          id:note?.id || '',
          text:note?.text || '',
          color:note?.color || '',
          link:note?.link || '',
          createdAt:note?.createdAt || ''
        }))
      })).filter(item=>String(item.sprintId || '').trim()),
      updated_at:now
    },
    {
      key:'spSprintColumns',
      value:structuredSafeRows(snapshot.spData).map(sprint=>({
        sprintId:sprint?.id || '',
        assignees:structuredSafeRows(sprint?.columnAssignees)
          .map(name=>String(name || '').trim())
          .filter(Boolean)
      })).filter(item=>String(item.sprintId || '').trim()),
      updated_at:now
    },
    {
      key:'spSprintTicketExtras',
      value:structuredSafeRows(snapshot.spData).flatMap(sprint=>
        structuredSafeRows(sprint?.tickets).map(ticket=>({
          ticketId:ticket?.id || '',
          storyPoints:ticket?.storyPoints ?? null,
          epicUrl:ticket?.epicUrl || '',
          epicTitle:ticket?.epicTitle || ''
        }))
      ).filter(item=>String(item.ticketId || '').trim()),
      updated_at:now
    },
    {
      key:'spSprintTicketIndex',
      value:structuredSafeRows(snapshot.spData).map(sprint=>({
        sprintId:sprint?.id || '',
        ticketIds:structuredSafeRows(sprint?.tickets)
          .map(ticket=>String(ticket?.id || '').trim())
          .filter(Boolean)
      })).filter(item=>String(item.sprintId || '').trim()),
      updated_at:now
    },
    {
      key:'spDataCanonical',
      value:structuredSafeRows(snapshot.spData),
      updated_at:now
    }
  ];
  const {error}=await sbClient.from('settings').upsert(rows,{onConflict:'key'});
  if(error)throw error;
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
  const taskFlags=STRUCTURED_SCHEMA_FLAGS.milestoneTasks || await detectTableColumns('milestone_tasks',['name','title','sort_order']);
  STRUCTURED_SCHEMA_FLAGS.milestones=flags;
  STRUCTURED_SCHEMA_FLAGS.milestoneTasks=taskFlags;
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
  const taskRows=milestoneRows.flatMap((milestone,index)=>structuredSafeRows(milestones[index]?.tasks).map((task,taskIndex)=>{
    const taskName=task.name || task.title || '';
    const row={
      id:task.id,
      milestone_id:milestone.id,
      status:STRUCTURED_STATUS.milestoneTask.includes(task.status) ? task.status : 'notstarted',
      notes:task.notes || '',
      updated_at:now
    };
    if(taskFlags.name)row.name=taskName;
    if(taskFlags.title)row.title=taskName;
    if(taskFlags.sort_order)row.sort_order=taskIndex;
    return row;
  }));
  await replaceTableRows('milestones', milestoneRows);
  await replaceTableRows('milestone_tasks', taskRows);
}

async function replaceSprintsSnapshot(sprints){
  if(!sbClient)return;
  const now=new Date().toISOString();
  const flags=STRUCTURED_SCHEMA_FLAGS.sprints || await detectTableColumns('sprints',['team','team_id','sort_order','start_date','end_date']);
  const ticketFlags=STRUCTURED_SCHEMA_FLAGS.sprintTickets || await detectTableColumns('sprint_tickets',['priority','epic_id']);
  STRUCTURED_SCHEMA_FLAGS.sprints=flags;
  STRUCTURED_SCHEMA_FLAGS.sprintTickets=ticketFlags;
  const sprintRows=structuredSafeRows(sprints).map((sprint,index)=>{
    const row={
      id:sprint.id,
      name:sprint.name || '',
      updated_at:now
    };
    if(flags.team)row.team=sprint.team || 'rp';
    if(flags.team_id)row.team_id=(sprint.team || 'rp')==='de' ? 'team_de' : 'team_rp';
    if(flags.sort_order)row.sort_order=index;
    if(flags.start_date)row.start_date=sprint.startDate || null;
    if(flags.end_date)row.end_date=sprint.endDate || null;
    return row;
  });
  const ticketRows=sprintRows.flatMap((sprint,index)=>structuredSafeRows(sprints[index]?.tickets).map((ticket,ticketIndex)=>{
    const epicFallback = String(ticket.epicId || ticket.epicTitle || ticket.epicUrl || '').trim();
    const row={
      id:ticket.id,
      sprint_id:sprint.id,
      assignee:ticket.assignee || '',
      jira_id:ticket.jiraId || '',
      epic_id:epicFallback,
      jira_url:ticket.jiraUrl || '',
      title:ticket.title || '',
      description:ticket.notes || ticket.desc || '',
      status:STRUCTURED_STATUS.sprintTicket.includes(ticket.status) ? ticket.status : 'todo',
      sort_order:ticketIndex,
      updated_at:now
    };
    if(!ticketFlags.epic_id)delete row.epic_id;
    if(ticketFlags.priority){
      const normalizedPriority=String(ticket.priority || '').trim().toLowerCase();
      row.priority=normalizedPriority==='high' ? 'High' : normalizedPriority==='low' ? 'Low' : 'Medium';
    }
    return row;
  }));
  await replaceTableRows('sprints', sprintRows);
  await replaceTableRows('sprint_tickets', ticketRows);
}

export async function saveSprintsCanonical(spData){
  if(!sbClient)return;
  const now=new Date().toISOString();
  const {error}=await sbClient.from('settings').upsert(
    [{key:'spDataCanonical',value:structuredSafeRows(spData),updated_at:now}],
    {onConflict:'key'}
  );
  if(error)throw error;
}

export async function saveCoreSnapshot(snapshot){
  return queueCoreSnapshotWrite(async()=>{
    const failures=[];
    const runStep=async(stepName, task)=>{
      try{
        await task();
      }catch(error){
        failures.push({stepName,error});
        console.error(`Supabase save step failed: ${stepName}`, error);
      }
    };

    await runStep('settings',()=>saveSettingsSnapshot(snapshot.settings || {}));
    await runStep('projects',()=>replaceProjectsSnapshot(snapshot.projects || []));
    await runStep('velocity',()=>replaceVelocitySnapshot(snapshot.teams || []));
    await runStep('data-explorer',()=>replaceDataExplorerSnapshot(snapshot.deTasks || []));
    await runStep('structured-metadata',()=>saveStructuredMetadata(snapshot));
    await runStep('rpde-tickets',()=>replaceRPDETicketsSnapshot(snapshot.rpdeTickets || []));
    await runStep('milestones',()=>replaceMilestonesSnapshot(snapshot.msData || []));
    await runStep('sprints',()=>replaceSprintsSnapshot(snapshot.spData || []));

    if(failures.length){
      const message=failures.map(item=>item.stepName).join(', ');
      console.warn(`Supabase snapshot saved with partial failures: ${message}`);
    }
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

async function loadStructuredMetadata(){
  const result={
    deMeetings:[],
    spTeamMembers:[],
    spNotes:[],
    spSprintNotesBoard:[],
    spSprintColumns:[],
    spSprintTicketExtras:[],
    spSprintTicketIndex:null,
    spDataCanonical:null
  };
  const {data,error}=await sbClient.from('settings').select('key,value').in('key',['deMeetings','spTeamMembers','spNotes','spSprintNotesBoard','spSprintColumns','spSprintTicketExtras','spSprintTicketIndex','spDataCanonical']);
  if(error)throw error;
  (data || []).forEach(row=>{
    if(row.key==='deMeetings'){
      result.deMeetings=structuredSafeRows(row.value).map(meeting=>({
        id:meeting?.id || '',
        date:meeting?.date || meeting?.week || '',
        week:meeting?.week || '',
        name:meeting?.name || '',
        notes:meeting?.notes || '',
        createdAt:meeting?.createdAt || ''
      }));
    }
    if(row.key==='spTeamMembers'){
      if(Array.isArray(row.value)){
        result.spTeamMembers=structuredSafeRows(row.value).map(member=>({
          name:member?.name || '',
          role:member?.role || ''
        }));
      }else{
        const members=row.value && typeof row.value==='object' ? row.value : {};
        const seen=new Set();
        result.spTeamMembers=[...structuredSafeRows(members.rp),...structuredSafeRows(members.de)]
          .map(member=>({name:member?.name || '',role:member?.role || ''}))
          .filter(member=>{
            const key=member.name.trim().toLowerCase();
            if(!key || seen.has(key))return false;
            seen.add(key);
            return true;
          });
      }
    }
    if(row.key==='spNotes'){
      result.spNotes=structuredSafeRows(row.value).map(note=>({
        id:note?.id || '',
        text:note?.text || '',
        color:note?.color || '',
        link:note?.link || '',
        createdAt:note?.createdAt || ''
      }));
    }
    if(row.key==='spSprintNotesBoard'){
      result.spSprintNotesBoard=structuredSafeRows(row.value)
        .map(item=>({
          sprintId:item?.sprintId || '',
          notes:structuredSafeRows(item?.notes).map(note=>({
            id:note?.id || '',
            text:note?.text || '',
            color:note?.color || '',
            link:note?.link || '',
            createdAt:note?.createdAt || ''
          }))
        }))
        .filter(item=>String(item.sprintId || '').trim());
    }
    if(row.key==='spSprintColumns'){
      result.spSprintColumns=structuredSafeRows(row.value)
        .map(item=>({
          sprintId:item?.sprintId || '',
          assignees:structuredSafeRows(item?.assignees)
            .map(name=>String(name || '').trim())
            .filter(Boolean)
        }))
        .filter(item=>String(item.sprintId || '').trim());
    }
    if(row.key==='spSprintTicketExtras'){
      result.spSprintTicketExtras=structuredSafeRows(row.value)
        .map(item=>({
          ticketId:item?.ticketId || '',
          storyPoints:item?.storyPoints ?? null,
          epicUrl:item?.epicUrl || '',
          epicTitle:item?.epicTitle || ''
        }))
        .filter(item=>String(item.ticketId || '').trim());
    }
    if(row.key==='spSprintTicketIndex'){
      result.spSprintTicketIndex=structuredSafeRows(row.value)
        .map(item=>({
          sprintId:item?.sprintId || '',
          ticketIds:structuredSafeRows(item?.ticketIds)
            .map(ticketId=>String(ticketId || '').trim())
            .filter(Boolean)
        }))
        .filter(item=>String(item.sprintId || '').trim());
    }
    if(row.key==='spDataCanonical'){
      result.spDataCanonical=structuredSafeRows(row.value);
    }
  });
  return result;
}

function mergeSprintNotesBoardIntoSprints(spData, metadata){
  const safeSprints=structuredSafeRows(spData);
  const boardRows=structuredSafeRows(metadata?.spSprintNotesBoard);
  const columnRows=structuredSafeRows(metadata?.spSprintColumns);
  const ticketExtraRows=structuredSafeRows(metadata?.spSprintTicketExtras);
  const ticketIndexRows=Array.isArray(metadata?.spSprintTicketIndex) ? metadata.spSprintTicketIndex : null;
  if(!boardRows.length && !columnRows.length && !ticketExtraRows.length && !ticketIndexRows){
    return safeSprints;
  }

  const boardBySprintId=boardRows.reduce((acc,row)=>{
    const key=String(row?.sprintId || '').trim();
    if(!key)return acc;
    acc[key]=structuredSafeRows(row?.notes).map(note=>({
      id:note?.id || '',
      text:note?.text || '',
      color:note?.color || '',
      link:note?.link || '',
      createdAt:note?.createdAt || ''
    }));
    return acc;
  },{});

  const columnsBySprintId=columnRows.reduce((acc,row)=>{
    const key=String(row?.sprintId || '').trim();
    if(!key)return acc;
    acc[key]=structuredSafeRows(row?.assignees)
      .map(name=>String(name || '').trim())
      .filter(Boolean);
    return acc;
  },{});

  const ticketExtrasById=ticketExtraRows.reduce((acc,row)=>{
    const key=String(row?.ticketId || '').trim();
    if(!key)return acc;
    acc[key]={
      storyPoints:row?.storyPoints ?? null,
      epicUrl:row?.epicUrl || '',
      epicTitle:row?.epicTitle || ''
    };
    return acc;
  },{});

  const ticketIndexBySprintId=(ticketIndexRows || []).reduce((acc,row)=>{
    const sprintId=String(row?.sprintId || '').trim();
    if(!sprintId)return acc;
    const ids=structuredSafeRows(row?.ticketIds)
      .map(ticketId=>String(ticketId || '').trim())
      .filter(Boolean);
    acc[sprintId]=ids;
    return acc;
  },{});

  return safeSprints.map((sprint)=>{
    const sprintId=String(sprint?.id || '').trim();
    const sprintTicketOrder=ticketIndexBySprintId[sprintId];
    const baseTickets=structuredSafeRows(sprint?.tickets).map(ticket=>({
      ...ticket,
      ...(ticketExtrasById[String(ticket?.id || '').trim()] || {})
    }));

    let tickets=baseTickets;
    if(Array.isArray(sprintTicketOrder)){
      const allowedIdSet=new Set(sprintTicketOrder);
      const orderMap=new Map(sprintTicketOrder.map((id,index)=>[id,index]));
      tickets=baseTickets
        .filter(ticket=>allowedIdSet.has(String(ticket?.id || '').trim()))
        .sort((left,right)=>{
          const leftId=String(left?.id || '').trim();
          const rightId=String(right?.id || '').trim();
          const leftOrder=orderMap.has(leftId) ? orderMap.get(leftId) : Number.MAX_SAFE_INTEGER;
          const rightOrder=orderMap.has(rightId) ? orderMap.get(rightId) : Number.MAX_SAFE_INTEGER;
          return leftOrder-rightOrder;
        });
    }

    return {
      ...sprint,
      notesBoard:boardBySprintId[sprintId] || structuredSafeRows(sprint?.notesBoard),
      columnAssignees:columnsBySprintId[sprintId] || structuredSafeRows(sprint?.columnAssignees),
      tickets
    };
  });
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
      group:normalizeVelocityGroupForRead(team.group_id),
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
  STRUCTURED_SCHEMA_FLAGS.dataExplorerTasks={
    title:(data || []).some(task=>Object.prototype.hasOwnProperty.call(task,'title'))
  };
  return (data || []).map(task=>({
    id:task.id,
    name:task.name || task.title || '',
    week:task.week || '',
    meetingId:task.meeting_id || '',
    status:task.status,
    assignee:task.assignee || '',
    jiraId:task.jira_id || '',
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
  STRUCTURED_SCHEMA_FLAGS.milestoneTasks={
    name:(tasks || []).some(task=>Object.prototype.hasOwnProperty.call(task,'name')),
    title:(tasks || []).some(task=>Object.prototype.hasOwnProperty.call(task,'title')),
    sort_order:(tasks || []).some(task=>Object.prototype.hasOwnProperty.call(task,'sort_order'))
  };
  const groupedTasks=sortStructuredRows(tasks).reduce((acc,task)=>{
    if(!acc[task.milestone_id])acc[task.milestone_id]=[];
    acc[task.milestone_id].push({
      id:task.id,
      name:task.name || task.title || '',
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
    sort_order:(sprints || []).some(sprint=>Object.prototype.hasOwnProperty.call(sprint,'sort_order')),
    start_date:(sprints || []).some(sprint=>Object.prototype.hasOwnProperty.call(sprint,'start_date')),
    end_date:(sprints || []).some(sprint=>Object.prototype.hasOwnProperty.call(sprint,'end_date'))
  };
  STRUCTURED_SCHEMA_FLAGS.sprintTickets={
    priority:(tickets || []).some(ticket=>Object.prototype.hasOwnProperty.call(ticket,'priority')),
    epic_id:(tickets || []).some(ticket=>Object.prototype.hasOwnProperty.call(ticket,'epic_id'))
  };
  const groupedTickets=sortStructuredRows(tickets).reduce((acc,ticket)=>{
    if(!acc[ticket.sprint_id])acc[ticket.sprint_id]=[];
    const normalizedPriority=String(ticket.priority || '').trim().toLowerCase();
    const epicFallback = String(ticket.epic_id || '').trim();
    const epicUrlFallback = /^https?:\/\//i.test(epicFallback) ? epicFallback : '';
    const epicTitleFallback = epicUrlFallback ? '' : epicFallback;
    acc[ticket.sprint_id].push({
      id:ticket.id,
      assignee:ticket.assignee || '',
      jiraId:ticket.jira_id || '',
      epicId:epicFallback,
      epicTitle:epicTitleFallback,
      epicUrl:epicUrlFallback,
      jiraUrl:ticket.jira_url || '',
      title:ticket.title,
      desc:ticket.description || '',
      notes:ticket.description || '',
      priority:normalizedPriority==='high' ? 'High' : normalizedPriority==='low' ? 'Low' : 'Medium',
      status:ticket.status
    });
    return acc;
  },{});
  const mapped=sortStructuredRows(sprints).map(sprint=>({
    id:sprint.id,
    team:normalizeStructuredTeam(sprint.team, sprint.team_id),
    name:sprint.name,
    startDate:sprint.start_date || '',
    endDate:sprint.end_date || '',
    createdAt:sprint.created_at || sprint.updated_at || new Date().toISOString(),
    tickets:groupedTickets[sprint.id] || []
  }));
  return mapped;
}

export async function loadAllData(){
  if(!sbClient)return null;
  try{
    const [settings,projects,teams,deTasks,rpdeTickets,msData,spData,metadata]=await Promise.allSettled([
      loadStructuredSettings(),
      loadStructuredProjects(),
      loadStructuredVelocity(),
      loadStructuredDataExplorer(),
      loadStructuredRPDETickets(),
      loadStructuredMilestones(),
      loadStructuredSprints(),
      loadStructuredMetadata()
    ]);
    if(settings.status==='rejected')console.error('Structured settings load failed:', settings.reason);
    if(projects.status==='rejected')console.error('Structured projects load failed:', projects.reason);
    if(teams.status==='rejected')console.error('Structured velocity load failed:', teams.reason);
    if(deTasks.status==='rejected')console.error('Structured DE load failed:', deTasks.reason);
    if(rpdeTickets.status==='rejected')console.error('Structured RPDE load failed:', rpdeTickets.reason);
    if(msData.status==='rejected')console.error('Structured milestones load failed:', msData.reason);
    if(spData.status==='rejected')console.error('Structured sprints load failed:', spData.reason);
    if(metadata.status==='rejected')console.error('Structured metadata load failed:', metadata.reason);
    const resolvedMetadata=metadata.status==='fulfilled' ? metadata.value : {deMeetings:[],spTeamMembers:[],spNotes:[],spSprintNotesBoard:[],spSprintColumns:[],spSprintTicketExtras:[],spSprintTicketIndex:null,spDataCanonical:null};
    const resolvedSpData = Array.isArray(resolvedMetadata.spDataCanonical)
      ? resolvedMetadata.spDataCanonical
      : (spData.status==='fulfilled' ? mergeSprintNotesBoardIntoSprints(spData.value, resolvedMetadata) : []);

    return {
      settings:settings.status==='fulfilled' ? settings.value : {monthlyHours:176,hoursPerDay:8},
      projects:projects.status==='fulfilled' ? projects.value : [],
      teams:teams.status==='fulfilled' ? teams.value : [],
      deTasks:deTasks.status==='fulfilled' ? deTasks.value : [],
      deMeetings:resolvedMetadata.deMeetings,
      rpdeTickets:rpdeTickets.status==='fulfilled' ? rpdeTickets.value : [],
      msData:msData.status==='fulfilled' ? msData.value : [],
      spData:resolvedSpData,
      spTeamMembers:resolvedMetadata.spTeamMembers,
      spNotes:resolvedMetadata.spNotes
    };
  }catch(err){
    console.error('Structured load failed:', err);
    return null;
  }
}
