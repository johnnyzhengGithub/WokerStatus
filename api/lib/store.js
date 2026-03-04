const { readFileSync } = require('fs');
const { join } = require('path');

const rosterPath = join(process.cwd(), 'company', 'roster.json');
const seedTasksPath = join(process.cwd(), 'company', 'seed_tasks.json');

const roster = JSON.parse(readFileSync(rosterPath, 'utf-8'));
const seedTasks = JSON.parse(readFileSync(seedTasksPath, 'utf-8'));

const users = roster.employees.map((e) => ({ id: e.id, name: e.name, role: e.role }));
let tasks = seedTasks.tasks.map((t) => ({ ...t, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));
let presence = users.map((u) => ({
  user_id: u.id,
  state: 'IDLE',
  task_title: '',
  waiting_for_user_id: null,
  reason: '',
  since_time: new Date().toISOString(),
  last_updated_at: new Date().toISOString()
}));

function computeSummary() {
  const now = Date.now();
  const counts = { working: 0, waiting: 0, blocked: 0, idle: 0 };
  let longest_waiting_minutes = 0;
  let longest_waiting_user = null;

  for (const p of presence) {
    const s = p.state.toLowerCase();
    if (counts[s] !== undefined) counts[s] += 1;
    if (p.state === 'WAITING') {
      const mins = Math.floor((now - new Date(p.since_time).getTime()) / 60000);
      if (mins >= longest_waiting_minutes) {
        longest_waiting_minutes = mins;
        const u = users.find((x) => x.id === p.user_id);
        longest_waiting_user = u ? u.name : null;
      }
    }
  }

  return { ...counts, longest_waiting_user, longest_waiting_minutes };
}

function dashboardData() {
  return {
    users,
    presence: presence.map((p) => ({ user: users.find((u) => u.id === p.user_id), presence: p })),
    tasks,
    summary: computeSummary()
  };
}

function updatePresence(payload) {
  const { user_id, state, task_title, waiting_for_user_id, reason } = payload;
  const user = users.find((u) => u.id === Number(user_id));
  if (!user) return { error: 'invalid user_id' };

  if (state === 'WORKING' && !task_title) return { error: 'task_title required for WORKING' };
  if (state === 'WAITING' && (!waiting_for_user_id || !reason)) return { error: 'waiting_for_user_id and reason required for WAITING' };
  if (state === 'BLOCKED' && !reason) return { error: 'reason required for BLOCKED' };

  const existing = presence.find((p) => p.user_id === Number(user_id));
  existing.state = state;
  existing.task_title = task_title || '';
  existing.waiting_for_user_id = waiting_for_user_id || null;
  existing.reason = reason || '';
  existing.since_time = new Date().toISOString();
  existing.last_updated_at = new Date().toISOString();

  return { ok: true, user, presence: existing };
}

function createTask(payload) {
  const { title, stage, owner_user_id } = payload;
  if (!title || !stage || !owner_user_id) return { error: 'title, stage, owner_user_id are required' };
  const id = `T${tasks.length + 1}`;
  const task = {
    id,
    title,
    stage,
    owner_id: Number(owner_user_id),
    depends_on: [],
    status: 'OPEN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  tasks.push(task);
  return { task };
}

module.exports = { dashboardData, updatePresence, createTask, getTasks: () => tasks };
