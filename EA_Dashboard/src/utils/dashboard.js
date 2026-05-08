import { formatNumber, initials } from './format.js';

export function getWorkingDays(settings) {
  const hoursPerDay = Number(settings.hoursPerDay) || 8;
  const monthlyHours = Number(settings.monthlyHours) || 176;
  return Math.max(1, Math.round(monthlyHours / hoursPerDay));
}

export function getProjectTotals(project, monthlyHours) {
  const members = Array.isArray(project.members) ? project.members : [];
  const totalLogged = members.reduce((sum, member) => sum + (Number(member.tl) || 0), 0);
  const totalCapacity = members.length * (Number(monthlyHours) || 0);
  const utilization = totalCapacity > 0 ? Math.round((totalLogged / totalCapacity) * 100) : 0;

  return {
    members: members.length,
    totalLogged,
    totalCapacity,
    utilization,
  };
}

export function normalizeProjectMember(member, monthlyHours) {
  const hoursOff = Number(member.hoursOff) || 0;
  return {
    ...member,
    pto: Number(member.pto) || 0,
    feriados: Number(member.feriados) || 0,
    hoursOff,
    tl: Math.max(0, Number(member.tl) || (Number(monthlyHours) || 0) - hoursOff),
  };
}

export function computeTeamMetrics(team) {
  const sprints = Array.isArray(team.sprints) ? team.sprints : [];
  const members = Array.isArray(team.members) ? team.members : [];
  const totals = sprints.map((_, sprintIndex) => members.reduce((sum, member) => sum + (Number(member.sp?.[sprintIndex]) || 0), 0));
  const completedTotals = totals.filter((value) => value > 0);
  const total = completedTotals.reduce((sum, value) => sum + value, 0);
  const average = completedTotals.length ? total / completedTotals.length : 0;
  const topMember = [...members]
    .map((member) => {
      const storyPoints = Array.isArray(member.sp) ? member.sp : [];
      const score = storyPoints.reduce((sum, value) => sum + (Number(value) || 0), 0);
      return {
        name: member.name,
        initials: initials(member.name),
        score,
      };
    })
    .sort((left, right) => right.score - left.score)[0];

  return {
    totals,
    average,
    completedCount: completedTotals.length,
    topMember,
    total,
    sprintCount: sprints.length,
    members: members.length,
    displayAverage: formatNumber(average, average % 1 === 0 ? 0 : 1),
  };
}

export function getWeekOptions(tasks, meetings) {
  const weeks = new Set();
  tasks.forEach((task) => weeks.add(task.week || 'Backlog'));
  meetings.forEach((meeting) => weeks.add(meeting.week || meeting.name || 'Backlog'));
  return [...weeks].filter(Boolean).sort();
}

export function getMilestoneProgress(milestone) {
  const tasks = Array.isArray(milestone.tasks) ? milestone.tasks : [];
  const completed = tasks.filter((task) => task.status === 'completed').length;
  const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  return { completed, total: tasks.length, progress };
}