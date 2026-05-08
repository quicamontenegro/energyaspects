const DEFAULT_TEAMS = [
  {
    id: 'rp-dev',
    name: 'RP DEV',
    color: '#0f766e',
    group: 'rp',
    sprints: ['Sprint 1', 'Sprint 2', 'Sprint 3'],
    sprintCompleted: [true, true, false],
    members: [],
  },
  {
    id: 'rp-qa',
    name: 'RP QA',
    color: '#c2410c',
    group: 'rp',
    sprints: ['Sprint 1', 'Sprint 2', 'Sprint 3'],
    sprintCompleted: [true, true, false],
    members: [],
  },
  {
    id: 'de-core',
    name: 'DE Core',
    color: '#4338ca',
    group: 'de',
    sprints: ['Sprint 1', 'Sprint 2', 'Sprint 3'],
    sprintCompleted: [true, true, false],
    members: [],
  },
];

export function createDefaultSnapshot() {
  return {
    settings: {
      monthlyHours: 176,
      hoursPerDay: 8,
    },
    projects: [],
    teams: cloneState(DEFAULT_TEAMS),
    deTasks: [],
    deMeetings: [],
    rpdeTickets: [],
    msData: [],
    spData: [],
    spTeamMembers: [],
    spNotes: [],
  };
}

export function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

export function mergeSnapshot(baseSnapshot, remoteSnapshot) {
  const base = cloneState(baseSnapshot);
  const remote = remoteSnapshot && typeof remoteSnapshot === 'object' ? remoteSnapshot : {};

  if (remote.settings && typeof remote.settings === 'object') {
    base.settings.monthlyHours = Number(remote.settings.monthlyHours) || base.settings.monthlyHours;
    base.settings.hoursPerDay = Number(remote.settings.hoursPerDay) || base.settings.hoursPerDay;
  }

  if (Array.isArray(remote.projects)) {
    base.projects = cloneState(remote.projects);
  }
  if (Array.isArray(remote.teams) && remote.teams.length) {
    base.teams = cloneState(remote.teams);
  }
  if (Array.isArray(remote.deTasks)) {
    base.deTasks = cloneState(remote.deTasks);
  }
  if (Array.isArray(remote.deMeetings)) {
    base.deMeetings = cloneState(remote.deMeetings);
  }
  if (Array.isArray(remote.rpdeTickets)) {
    base.rpdeTickets = cloneState(remote.rpdeTickets);
  }
  if (Array.isArray(remote.msData)) {
    base.msData = cloneState(remote.msData);
  }
  if (Array.isArray(remote.spData)) {
    base.spData = cloneState(remote.spData);
  }
  if (Array.isArray(remote.spTeamMembers)) {
    base.spTeamMembers = cloneState(remote.spTeamMembers);
  } else if (remote.spTeamMembers && typeof remote.spTeamMembers === 'object') {
    const combined = [
      ...(Array.isArray(remote.spTeamMembers.rp) ? remote.spTeamMembers.rp : []),
      ...(Array.isArray(remote.spTeamMembers.de) ? remote.spTeamMembers.de : []),
    ];
    const seen = new Set();
    base.spTeamMembers = combined.filter((member) => {
      const key = String(member?.name || '').trim().toLowerCase();
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    }).map((member) => ({
      name: member?.name || '',
      role: member?.role || '',
    }));
  }
  if (Array.isArray(remote.spNotes)) {
    base.spNotes = cloneState(remote.spNotes);
  }

  return base;
}