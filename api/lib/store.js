const { readFileSync } = require('fs');
const { join } = require('path');

const rosterPath = join(process.cwd(), 'company', 'roster.json');
const seedTasksPath = join(process.cwd(), 'company', 'seed_tasks.json');
const workflowPath = join(process.cwd(), 'company', 'workflow.json');

const roster = JSON.parse(readFileSync(rosterPath, 'utf-8'));
const seedTasks = JSON.parse(readFileSync(seedTasksPath, 'utf-8'));
const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8'));

const STAGES = Array.isArray(workflow.stages)
  ? workflow.stages
  : ['IDEA', 'DESIGN', 'BUILD', 'REVIEW', 'RELEASE', 'DONE'];

const SLA_WAITING_WARNING_MINUTES =
  workflow?.sla_minutes?.WAITING_WARNING || 30;
const SLA_WAITING_CRITICAL_MINUTES =
  workflow?.sla_minutes?.WAITING_CRITICAL || 120;

const ROLE_KEYS = {
  PM: 'PM',
  DESIGNER: 'DESIGNER',
  BACKEND: 'BACKEND',
  FRONTEND: 'FRONTEND',
  QA: 'QA',
  OPS: 'OPS',
  UNKNOWN: 'UNKNOWN'
};

const ROLE_WORK_MINUTES = {
  [ROLE_KEYS.PM]: 7,
  [ROLE_KEYS.DESIGNER]: 10,
  [ROLE_KEYS.BACKEND]: 12,
  [ROLE_KEYS.FRONTEND]: 12,
  [ROLE_KEYS.QA]: 8,
  [ROLE_KEYS.OPS]: 6,
  [ROLE_KEYS.UNKNOWN]: 10
};

const AUTO_TICK_MS = 15 * 1000;
const MANUAL_STICKY_MS = 3 * 60 * 1000;
const MAX_EVENTS = 300;
const MAX_DECISIONS = 200;

const users = roster.employees.map(emp => ({
  id: Number(emp.id),
  name: emp.name,
  role: emp.role,
  mission: emp.mission || '',
  outputs: Array.isArray(emp.outputs) ? emp.outputs : []
}));

const userById = new Map(users.map(u => [u.id, u]));

const pmUser =
  users.find(user => classifyRole(user.role) === ROLE_KEYS.PM) || users[0] || null;
const designerUser = users.find(
  user => classifyRole(user.role) === ROLE_KEYS.DESIGNER
);
const backendUser = users.find(
  user => classifyRole(user.role) === ROLE_KEYS.BACKEND
);
const frontendUser = users.find(
  user => classifyRole(user.role) === ROLE_KEYS.FRONTEND
);
const qaUser = users.find(user => classifyRole(user.role) === ROLE_KEYS.QA);
const opsUser = users.find(user => classifyRole(user.role) === ROLE_KEYS.OPS);

let events = [];
let decisions = [];
let games = [];

function nowIso() {
  return new Date().toISOString();
}

function classifyRole(roleText) {
  const lower = String(roleText || '').toLowerCase();
  if (lower.includes('pm') || lower.includes('product')) return ROLE_KEYS.PM;
  if (lower.includes('design')) return ROLE_KEYS.DESIGNER;
  if (lower.includes('backend')) return ROLE_KEYS.BACKEND;
  if (lower.includes('frontend')) return ROLE_KEYS.FRONTEND;
  if (lower.includes('qa') || lower.includes('test')) return ROLE_KEYS.QA;
  if (lower.includes('ops') || lower.includes('sre') || lower.includes('devops')) {
    return ROLE_KEYS.OPS;
  }
  return ROLE_KEYS.UNKNOWN;
}

function stageIndex(stage) {
  const idx = STAGES.indexOf(stage);
  return idx >= 0 ? idx : 999;
}

function makeTaskIdSeed() {
  let maxN = 0;
  for (const t of seedTasks.tasks || []) {
    const n = Number(String(t.id || '').replace(/^T/i, ''));
    if (Number.isFinite(n)) maxN = Math.max(maxN, n);
  }
  return maxN + 1;
}

let nextTaskNumber = makeTaskIdSeed();

function normalizeTask(raw) {
  const ownerUserId = Number(raw.owner_user_id ?? raw.owner_id);
  return {
    id: String(raw.id || `T${nextTaskNumber++}`),
    title: String(raw.title || '').trim(),
    stage: STAGES.includes(raw.stage) ? raw.stage : 'IDEA',
    owner_user_id: ownerUserId,
    owner_id: ownerUserId,
    depends_on: Array.isArray(raw.depends_on)
      ? raw.depends_on.map(dep => String(dep))
      : [],
    status: raw.status === 'DONE' ? 'DONE' : 'OPEN',
    project: raw.project || seedTasks.project || 'default',
    kind: raw.kind || 'GENERAL',
    priority: Number.isFinite(raw.priority) ? Number(raw.priority) : 3,
    target_user_id: raw.target_user_id ? Number(raw.target_user_id) : null,
    created_by: raw.created_by || 'seed',
    resolution: raw.resolution || '',
    active_since_at: raw.active_since_at || null,
    created_at: raw.created_at || nowIso(),
    updated_at: raw.updated_at || nowIso()
  };
}

let tasks = (seedTasks.tasks || []).map(normalizeTask);

let presence = users.map(user => ({
  user_id: user.id,
  state: 'IDLE',
  task_title: '',
  waiting_for_user_id: null,
  reason: '',
  since_time: nowIso(),
  last_updated_at: nowIso(),
  sticky_until: null,
  waiting_warning_notified_at: null,
  waiting_critical_notified_at: null
}));

const presenceByUserId = new Map(presence.map(p => [p.user_id, p]));

let runtime = {
  last_tick_at: Date.now()
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function pushEvent(kind, payload) {
  const event = {
    id: events.length ? events[events.length - 1].id + 1 : 1,
    kind,
    timestamp: nowIso(),
    ...payload
  };

  if (!event.message) {
    event.message = formatEventMessage(event);
  }

  events.push(event);
  if (events.length > MAX_EVENTS) {
    events = events.slice(events.length - MAX_EVENTS);
  }

  return event;
}

function pushDecision(source, decision, impact, context = {}) {
  const item = {
    id: decisions.length ? decisions[decisions.length - 1].id + 1 : 1,
    source,
    decision,
    impact,
    context,
    created_at: nowIso()
  };
  decisions.push(item);
  if (decisions.length > MAX_DECISIONS) {
    decisions = decisions.slice(decisions.length - MAX_DECISIONS);
  }

  pushEvent('decision_logged', {
    source,
    decision,
    impact,
    message: `[${source}] ${decision}`
  });

  return item;
}

function formatEventMessage(event) {
  switch (event.kind) {
    case 'presence_update':
      return `${event.user_name} -> ${event.state}`;
    case 'task_created':
      return `Task created: ${event.title}`;
    case 'task_done':
      return `Task done: ${event.title}`;
    case 'waiting_warning':
      return `${event.user_name} waiting ${event.minutes_waiting}m`;
    case 'waiting_escalated':
      return `${event.user_name} escalated to ${event.to_user_name}`;
    case 'role_action':
      return `${event.user_name}: ${event.action}`;
    case 'game_released':
      return `Released game: ${event.name}`;
    default:
      return event.kind;
  }
}

function getTaskById(taskId) {
  return tasks.find(task => task.id === String(taskId)) || null;
}

function openTasks() {
  return tasks.filter(task => task.status === 'OPEN');
}

function getUser(userId) {
  return userById.get(Number(userId)) || null;
}

function firstBlockingDependency(task) {
  if (!task || !Array.isArray(task.depends_on) || !task.depends_on.length) {
    return null;
  }

  for (const depId of task.depends_on) {
    const depTask = getTaskById(depId);
    if (depTask && depTask.status !== 'DONE') return depTask;
  }

  return null;
}

function setPresence({
  user_id,
  state,
  task_title = '',
  waiting_for_user_id = null,
  reason = '',
  source = 'auto',
  sticky = false
}) {
  const user = getUser(user_id);
  if (!user) return { error: 'invalid user_id' };

  const row = presenceByUserId.get(user.id);
  if (!row) return { error: 'presence row missing' };

  const nextTaskTitle = String(task_title || '').trim();
  const nextWaitingFor = waiting_for_user_id ? Number(waiting_for_user_id) : null;
  const nextReason = String(reason || '').trim();

  const changed =
    row.state !== state ||
    row.task_title !== nextTaskTitle ||
    row.waiting_for_user_id !== nextWaitingFor ||
    row.reason !== nextReason;

  const timestamp = nowIso();
  const nextSinceTime = changed ? timestamp : row.since_time;

  row.state = state;
  row.task_title = nextTaskTitle;
  row.waiting_for_user_id = nextWaitingFor;
  row.reason = nextReason;
  row.since_time = nextSinceTime;
  row.last_updated_at = timestamp;

  if (source === 'manual' && sticky) {
    row.sticky_until = new Date(Date.now() + MANUAL_STICKY_MS).toISOString();
  }

  if (changed) {
    if (state !== 'WAITING') {
      row.waiting_warning_notified_at = null;
      row.waiting_critical_notified_at = null;
    }

    pushEvent('presence_update', {
      user_id: user.id,
      user_name: user.name,
      state,
      task_title: nextTaskTitle,
      waiting_for_user_id: nextWaitingFor,
      reason: nextReason,
      source
    });
  }

  return { ok: true, user, presence: clone(row), changed };
}

function canAutoMutatePresence(userId) {
  const row = presenceByUserId.get(Number(userId));
  if (!row) return false;
  if (!row.sticky_until) return true;
  return new Date(row.sticky_until).getTime() <= Date.now();
}

function createTaskInternal(payload, source = 'manual') {
  const { title, stage, owner_user_id, depends_on, project, kind, priority, target_user_id } =
    payload;

  const ownerId = Number(owner_user_id);
  const owner = getUser(ownerId);

  if (!title || !String(title).trim()) {
    return { error: 'title is required' };
  }
  if (!STAGES.includes(stage)) {
    return { error: `stage must be one of: ${STAGES.join(', ')}` };
  }
  if (!owner) {
    return { error: 'owner_user_id is invalid' };
  }

  const normalizedDeps = Array.isArray(depends_on)
    ? [...new Set(depends_on.map(dep => String(dep)))]
    : [];

  for (const depId of normalizedDeps) {
    if (!getTaskById(depId)) {
      return { error: `depends_on task not found: ${depId}` };
    }
  }

  const now = nowIso();
  const task = normalizeTask({
    id: `T${nextTaskNumber++}`,
    title: String(title).trim(),
    stage,
    owner_user_id: ownerId,
    depends_on: normalizedDeps,
    status: 'OPEN',
    project: project || seedTasks.project || 'default',
    kind: kind || 'GENERAL',
    priority: Number.isFinite(priority) ? Number(priority) : 3,
    target_user_id: target_user_id ? Number(target_user_id) : null,
    created_by: source,
    created_at: now,
    updated_at: now
  });

  tasks.push(task);

  pushEvent('task_created', {
    task_id: task.id,
    title: task.title,
    stage: task.stage,
    owner_user_id: task.owner_user_id,
    owner_name: owner.name,
    project: task.project,
    kind: task.kind,
    source
  });

  return { ok: true, task: clone(task) };
}

function completeTask(task, reason = '', source = 'auto') {
  if (!task || task.status === 'DONE') return;

  task.status = 'DONE';
  task.stage = 'DONE';
  task.resolution = reason || task.resolution || '';
  task.active_since_at = null;
  task.updated_at = nowIso();

  const owner = getUser(task.owner_user_id);
  pushEvent('task_done', {
    task_id: task.id,
    title: task.title,
    owner_user_id: task.owner_user_id,
    owner_name: owner ? owner.name : String(task.owner_user_id),
    project: task.project,
    reason,
    source
  });
}

function orderTasksForUser(userId, preferredStages = []) {
  const preferred = new Set(preferredStages);
  return openTasks()
    .filter(task => task.owner_user_id === Number(userId))
    .sort((a, b) => {
      const aPreferred = preferred.has(a.stage) ? 0 : 1;
      const bPreferred = preferred.has(b.stage) ? 0 : 1;
      if (aPreferred !== bPreferred) return aPreferred - bPreferred;
      if (a.priority !== b.priority) return a.priority - b.priority;
      const stageDiff = stageIndex(a.stage) - stageIndex(b.stage);
      if (stageDiff !== 0) return stageDiff;
      return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
    });
}

function minutesSince(iso) {
  if (!iso) return 0;
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return 0;
  return Math.floor(diff / 60000);
}

function maybeProgressTask(task, owner, source = 'auto') {
  if (!task || task.status !== 'OPEN') return false;

  const roleKey = classifyRole(owner.role);
  const isManualRoleRun = String(source || '').startsWith('manual-role-action');
  const requiredMinutes = isManualRoleRun
    ? 0
    : ROLE_WORK_MINUTES[roleKey] || ROLE_WORK_MINUTES.UNKNOWN;

  if (!task.active_since_at) {
    task.active_since_at = nowIso();
    task.updated_at = nowIso();
    return false;
  }

  const workedMinutes = minutesSince(task.active_since_at);
  if (workedMinutes < requiredMinutes) return false;

  completeTask(task, `${owner.name} completed role task`, source);

  if (roleKey === ROLE_KEYS.QA) {
    ensureReleaseTaskForProject(task.project, [task.id]);
  }

  if (roleKey === ROLE_KEYS.OPS) {
    publishGame(task.project, owner.id);
  }

  if (roleKey === ROLE_KEYS.PM) {
    pushDecision(
      'ORION',
      `PM completed: ${task.title}`,
      'Scope/priority updated for the team',
      { task_id: task.id, project: task.project }
    );
  }

  return true;
}

function ensureReleaseTaskForProject(project, dependsOn = []) {
  if (!opsUser) return;

  const exists = openTasks().find(
    task =>
      task.project === project &&
      task.kind === 'OPS_RELEASE' &&
      task.owner_user_id === opsUser.id
  );
  if (exists) return;

  const created = createTaskInternal(
    {
      title: `${project} - release checklist`,
      stage: 'RELEASE',
      owner_user_id: opsUser.id,
      depends_on: dependsOn,
      project,
      kind: 'OPS_RELEASE',
      priority: 2
    },
    'auto-qa'
  );

  if (!created.error) {
    pushDecision(
      'ECHO',
      `QA ready for release: ${project}`,
      'Created release handoff task for Ops/SRE',
      { project }
    );
  }
}

function ensureQaTaskForProject(project, dependsOn = []) {
  if (!qaUser) return;

  const exists = openTasks().find(
    task => task.project === project && task.kind === 'QA_REVIEW'
  );
  if (exists) return;

  const created = createTaskInternal(
    {
      title: `${project} - QA regression sweep`,
      stage: 'REVIEW',
      owner_user_id: qaUser.id,
      depends_on: dependsOn,
      project,
      kind: 'QA_REVIEW',
      priority: 2
    },
    'auto-build'
  );

  if (!created.error) {
    pushDecision(
      'SYSTEM',
      `Build complete for ${project}`,
      'Created QA review task',
      { project }
    );
  }
}

function publishGame(project, ownerUserId) {
  if (!project || project === 'default') return;

  const existing = games.find(game => game.project === project);
  if (existing) return;

  const owner = getUser(ownerUserId);
  const game = {
    id: games.length ? games[games.length - 1].id + 1 : 1,
    project,
    name: project,
    description: `${project} shipped by the autonomous team`,
    owner_user_id: ownerUserId,
    owner_name: owner ? owner.name : String(ownerUserId),
    status: 'RELEASED',
    download_url: '#',
    released_at: nowIso()
  };

  games.push(game);

  pushEvent('game_released', {
    game_id: game.id,
    project: game.project,
    name: game.name,
    owner_user_id: game.owner_user_id,
    owner_name: game.owner_name,
    message: `Released game: ${game.name}`
  });
}

function findRoleUser(roleKey) {
  switch (roleKey) {
    case ROLE_KEYS.PM:
      return pmUser;
    case ROLE_KEYS.DESIGNER:
      return designerUser;
    case ROLE_KEYS.BACKEND:
      return backendUser;
    case ROLE_KEYS.FRONTEND:
      return frontendUser;
    case ROLE_KEYS.QA:
      return qaUser;
    case ROLE_KEYS.OPS:
      return opsUser;
    default:
      return null;
  }
}

function findOpenPmUnblockTaskFor(waiterId) {
  return openTasks().find(
    task => task.kind === 'PM_UNBLOCK' && task.target_user_id === Number(waiterId)
  );
}

function ensurePmUnblockTask(waiter, waitingTaskTitle, minutesWaiting, source) {
  if (!pmUser) return null;

  const existing = findOpenPmUnblockTaskFor(waiter.id);
  if (existing) return existing;

  const created = createTaskInternal(
    {
      title: `PM unblock: ${waiter.name} - ${waitingTaskTitle || 'unknown task'}`,
      stage: 'IDEA',
      owner_user_id: pmUser.id,
      depends_on: [],
      project: 'operations',
      kind: 'PM_UNBLOCK',
      priority: 1,
      target_user_id: waiter.id
    },
    source
  );

  if (created.error) return null;

  pushDecision(
    'ORION',
    `Start unblock for ${waiter.name}`,
    `Waiting time reached ${minutesWaiting} minutes`,
    {
      waiter_user_id: waiter.id,
      waiting_task_title: waitingTaskTitle || ''
    }
  );

  return getTaskById(created.task.id);
}

function evaluateWaitingThresholds(source = 'auto') {
  if (!pmUser) return;

  for (const row of presence) {
    if (row.state !== 'WAITING') continue;

    const waiter = getUser(row.user_id);
    if (!waiter || waiter.id === pmUser.id) continue;

    const minutesWaiting = minutesSince(row.since_time);

    if (
      minutesWaiting >= SLA_WAITING_WARNING_MINUTES &&
      !row.waiting_warning_notified_at
    ) {
      row.waiting_warning_notified_at = nowIso();
      pushEvent('waiting_warning', {
        user_id: waiter.id,
        user_name: waiter.name,
        task_title: row.task_title,
        minutes_waiting: minutesWaiting,
        waiting_for_user_id: row.waiting_for_user_id,
        message: `${waiter.name} waiting for ${minutesWaiting}m`
      });
      ensurePmUnblockTask(waiter, row.task_title, minutesWaiting, source);
    }

    if (
      minutesWaiting >= SLA_WAITING_CRITICAL_MINUTES &&
      !row.waiting_critical_notified_at
    ) {
      row.waiting_critical_notified_at = nowIso();

      const coordTask = ensurePmUnblockTask(
        waiter,
        row.task_title,
        minutesWaiting,
        source
      );

      setPresence({
        user_id: waiter.id,
        state: 'BLOCKED',
        task_title: row.task_title,
        waiting_for_user_id: pmUser.id,
        reason: `Escalated to ${pmUser.name} after ${minutesWaiting}m waiting`,
        source,
        sticky: false
      });

      pushEvent('waiting_escalated', {
        user_id: waiter.id,
        user_name: waiter.name,
        task_title: row.task_title,
        minutes_waiting: minutesWaiting,
        to_user_id: pmUser.id,
        to_user_name: pmUser.name,
        pm_task_id: coordTask ? coordTask.id : null,
        message: `${waiter.name} escalated to ${pmUser.name}`
      });
    }
  }
}

function resolveWaitingForUser(user, source = 'auto') {
  const tasksForUser = orderTasksForUser(user.id);
  const task = tasksForUser[0] || null;

  if (!task) {
    setPresence({
      user_id: user.id,
      state: 'IDLE',
      task_title: '',
      waiting_for_user_id: null,
      reason: '',
      source,
      sticky: false
    });
    return { action: 'idle', task: null };
  }

  const blocker = firstBlockingDependency(task);
  if (blocker) {
    setPresence({
      user_id: user.id,
      state: 'WAITING',
      task_title: task.title,
      waiting_for_user_id: blocker.owner_user_id,
      reason: `Waiting dependency ${blocker.id}: ${blocker.title}`,
      source,
      sticky: false
    });

    return {
      action: 'waiting',
      task,
      blocker
    };
  }

  const presenceResult = setPresence({
    user_id: user.id,
    state: 'WORKING',
    task_title: task.title,
    waiting_for_user_id: null,
    reason: '',
    source,
    sticky: false
  });

  if (!task.active_since_at || presenceResult.changed) {
    task.active_since_at = nowIso();
    task.updated_at = nowIso();
  }

  const progressed = maybeProgressTask(task, user, source);

  if (progressed) {
    const roleKey = classifyRole(user.role);
    if (roleKey === ROLE_KEYS.BACKEND || roleKey === ROLE_KEYS.FRONTEND) {
      maybeCreateQaFromBuildCompletion(task.project);
    }
  }

  return {
    action: progressed ? 'completed' : 'working',
    task,
    progressed
  };
}

function maybeCreateQaFromBuildCompletion(project) {
  const doneBuildTasks = tasks.filter(task => {
    if (task.project !== project) return false;
    if (task.status !== 'DONE') return false;

    const owner = getUser(task.owner_user_id);
    const key = owner ? classifyRole(owner.role) : ROLE_KEYS.UNKNOWN;
    return key === ROLE_KEYS.BACKEND || key === ROLE_KEYS.FRONTEND;
  });

  if (doneBuildTasks.length < 2) return;

  ensureQaTaskForProject(
    project,
    doneBuildTasks.map(task => task.id)
  );
}

function pmAction(user, source = 'auto') {
  const waitingRows = presence
    .filter(row => row.user_id !== user.id && (row.state === 'WAITING' || row.state === 'BLOCKED'))
    .sort((a, b) => new Date(a.since_time).getTime() - new Date(b.since_time).getTime());

  if (waitingRows.length) {
    const targetPresence = waitingRows[0];
    const targetUser = getUser(targetPresence.user_id);

    const coordTask = ensurePmUnblockTask(
      targetUser,
      targetPresence.task_title,
      minutesSince(targetPresence.since_time),
      source
    );

    if (coordTask) {
      setPresence({
        user_id: user.id,
        state: 'WORKING',
        task_title: coordTask.title,
        waiting_for_user_id: null,
        reason: '',
        source,
        sticky: false
      });

      const userTask = orderTasksForUser(targetUser.id)[0] || null;
      const blocker = userTask ? firstBlockingDependency(userTask) : null;

      if (!blocker && userTask) {
        setPresence({
          user_id: targetUser.id,
          state: 'WORKING',
          task_title: userTask.title,
          waiting_for_user_id: null,
          reason: '',
          source,
          sticky: false
        });
        completeTask(coordTask, `Unblocked ${targetUser.name}`, source);

        pushDecision(
          'ORION',
          `Unblocked ${targetUser.name}`,
          `${targetUser.name} resumed work on ${userTask.title}`,
          { task_id: userTask.id }
        );

        pushEvent('role_action', {
          user_id: user.id,
          user_name: user.name,
          action: `Resolved blocker for ${targetUser.name}`,
          role: user.role
        });

        return {
          ok: true,
          action: 'pm_unblocked_worker',
          task: clone(coordTask)
        };
      }

      if (blocker) {
        const blockerOwner = getUser(blocker.owner_user_id);
        if (
          blockerOwner &&
          blockerOwner.id === user.id &&
          canAutoMutatePresence(blockerOwner.id)
        ) {
          setPresence({
            user_id: blockerOwner.id,
            state: 'WORKING',
            task_title: blocker.title,
            waiting_for_user_id: null,
            reason: '',
            source,
            sticky: false
          });

          maybeProgressTask(blocker, blockerOwner, source);

          const stillBlocked = firstBlockingDependency(userTask);
          if (!stillBlocked && userTask.status === 'OPEN') {
            setPresence({
              user_id: targetUser.id,
              state: 'WORKING',
              task_title: userTask.title,
              waiting_for_user_id: null,
              reason: '',
              source,
              sticky: false
            });
            completeTask(coordTask, `Unblocked ${targetUser.name}`, source);

            return {
              ok: true,
              action: 'pm_unblocked_worker',
              task: clone(coordTask),
              blocker_task_id: blocker.id
            };
          }
        } else if (blockerOwner && canAutoMutatePresence(blockerOwner.id)) {
          setPresence({
            user_id: blockerOwner.id,
            state: 'WORKING',
            task_title: blocker.title,
            waiting_for_user_id: null,
            reason: '',
            source,
            sticky: false
          });
        }

        pushEvent('role_action', {
          user_id: user.id,
          user_name: user.name,
          action: `Coordinating blocker for ${targetUser.name}`,
          role: user.role,
          blocker_task_id: blocker.id,
          blocker_owner_user_id: blocker.owner_user_id
        });

        return {
          ok: true,
          action: 'pm_coordinating_blocker',
          task: clone(coordTask),
          blocker_task_id: blocker.id
        };
      }
    }
  }

  const pmTasks = orderTasksForUser(user.id, ['IDEA']);
  const pmTask = pmTasks[0] || null;

  if (pmTask) {
    const result = resolveWaitingForUser(user, source);
    pushEvent('role_action', {
      user_id: user.id,
      user_name: user.name,
      role: user.role,
      action: result.action === 'completed' ? 'Completed PM task' : 'Working PM task',
      task_id: pmTask.id
    });
    return { ok: true, action: result.action, task: clone(pmTask) };
  }

  const planning = createTaskInternal(
    {
      title: 'PM daily planning and risk review',
      stage: 'IDEA',
      owner_user_id: user.id,
      depends_on: [],
      project: 'operations',
      kind: 'PM_PLAN',
      priority: 2
    },
    source
  );

  if (planning.error) return { error: planning.error };

  pushDecision(
    'ORION',
    'Created daily planning task',
    'Keeps roadmap and waiting risks visible',
    { task_id: planning.task.id }
  );

  setPresence({
    user_id: user.id,
    state: 'WORKING',
    task_title: planning.task.title,
    waiting_for_user_id: null,
    reason: '',
    source,
    sticky: false
  });

  pushEvent('role_action', {
    user_id: user.id,
    user_name: user.name,
    role: user.role,
    action: 'Created planning task',
    task_id: planning.task.id
  });

  return { ok: true, action: 'pm_created_planning_task', task: planning.task };
}

function genericRoleAction(user, preferredStages, source = 'auto') {
  const ordered = orderTasksForUser(user.id, preferredStages);
  const task = ordered[0] || null;

  if (!task) {
    if (canAutoMutatePresence(user.id)) {
      setPresence({
        user_id: user.id,
        state: 'IDLE',
        task_title: '',
        waiting_for_user_id: null,
        reason: '',
        source,
        sticky: false
      });
    }

    pushEvent('role_action', {
      user_id: user.id,
      user_name: user.name,
      role: user.role,
      action: 'No open task, staying idle'
    });

    return { ok: true, action: 'idle' };
  }

  const result = resolveWaitingForUser(user, source);

  pushEvent('role_action', {
    user_id: user.id,
    user_name: user.name,
    role: user.role,
    action:
      result.action === 'completed'
        ? `Completed ${task.id}`
        : result.action === 'waiting'
        ? `Waiting on dependency for ${task.id}`
        : `Working on ${task.id}`,
    task_id: task.id
  });

  return {
    ok: true,
    action: result.action,
    task: clone(task),
    blocker_task_id: result.blocker ? result.blocker.id : null
  };
}

function runRoleActionInternal(user, source = 'auto') {
  if (!user) return { error: 'invalid user' };

  if (source === 'auto' && !canAutoMutatePresence(user.id)) {
    return { ok: true, action: 'manual_sticky_skip' };
  }

  const roleKey = classifyRole(user.role);

  if (roleKey === ROLE_KEYS.PM) {
    return pmAction(user, source);
  }
  if (roleKey === ROLE_KEYS.DESIGNER) {
    return genericRoleAction(user, ['DESIGN'], source);
  }
  if (roleKey === ROLE_KEYS.BACKEND) {
    return genericRoleAction(user, ['BUILD'], source);
  }
  if (roleKey === ROLE_KEYS.FRONTEND) {
    return genericRoleAction(user, ['BUILD'], source);
  }
  if (roleKey === ROLE_KEYS.QA) {
    return genericRoleAction(user, ['REVIEW'], source);
  }
  if (roleKey === ROLE_KEYS.OPS) {
    return genericRoleAction(user, ['RELEASE'], source);
  }

  return genericRoleAction(user, [], source);
}

function roleOrder() {
  const ordered = [];
  if (pmUser) ordered.push(pmUser);
  for (const user of users) {
    if (!pmUser || user.id !== pmUser.id) ordered.push(user);
  }
  return ordered;
}

function runOneAutomationTick() {
  evaluateWaitingThresholds('auto');

  for (const user of roleOrder()) {
    runRoleActionInternal(user, 'auto');
  }

  evaluateWaitingThresholds('auto-after-action');
}

function runAutomation(force = false) {
  const now = Date.now();
  const elapsed = now - runtime.last_tick_at;

  if (!force && elapsed < AUTO_TICK_MS) return;

  const ticks = force ? 1 : Math.min(8, Math.max(1, Math.floor(elapsed / AUTO_TICK_MS)));

  for (let i = 0; i < ticks; i += 1) {
    runOneAutomationTick();
  }

  runtime.last_tick_at = now;
}

function validatePresencePayload(payload) {
  const { user_id, state, task_title, waiting_for_user_id, reason } = payload;
  const user = getUser(user_id);
  if (!user) return 'invalid user_id';

  const allowed = ['WORKING', 'WAITING', 'BLOCKED', 'IDLE'];
  if (!allowed.includes(state)) return `state must be one of: ${allowed.join(', ')}`;

  if (state === 'WORKING' && !String(task_title || '').trim()) {
    return 'task_title required for WORKING';
  }

  if (state === 'WAITING') {
    if (!waiting_for_user_id || !getUser(waiting_for_user_id)) {
      return 'waiting_for_user_id required for WAITING';
    }
    if (!String(reason || '').trim()) {
      return 'reason required for WAITING';
    }
  }

  if (state === 'BLOCKED' && !String(reason || '').trim()) {
    return 'reason required for BLOCKED';
  }

  return null;
}

function updatePresence(payload) {
  runAutomation();

  const err = validatePresencePayload(payload || {});
  if (err) return { error: err };

  const result = setPresence({
    user_id: Number(payload.user_id),
    state: payload.state,
    task_title: payload.task_title || '',
    waiting_for_user_id: payload.waiting_for_user_id || null,
    reason: payload.reason || '',
    source: 'manual',
    sticky: true
  });

  if (result.error) return result;

  return {
    ok: true,
    user: result.user,
    presence: result.presence
  };
}

function createTask(payload) {
  runAutomation();
  const result = createTaskInternal(payload || {}, 'manual');
  if (result.error) return result;
  return { task: result.task };
}

function sortedOpenTasks() {
  return openTasks()
    .slice()
    .sort((a, b) => {
      const pDiff = a.priority - b.priority;
      if (pDiff !== 0) return pDiff;
      const stageDiff = stageIndex(a.stage) - stageIndex(b.stage);
      if (stageDiff !== 0) return stageDiff;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
}

function computeSummary() {
  const summary = {
    working: 0,
    waiting: 0,
    blocked: 0,
    idle: 0,
    longest_waiting_user: null,
    longest_waiting_minutes: 0
  };

  for (const row of presence) {
    const key = String(row.state || '').toLowerCase();
    if (summary[key] !== undefined) summary[key] += 1;

    if (row.state === 'WAITING') {
      const mins = minutesSince(row.since_time);
      if (mins >= summary.longest_waiting_minutes) {
        const user = getUser(row.user_id);
        summary.longest_waiting_minutes = mins;
        summary.longest_waiting_user = user
          ? { id: user.id, name: user.name }
          : null;
      }
    }
  }

  return summary;
}

function dashboardData() {
  runAutomation();

  return {
    users: users.map(u => ({ id: u.id, name: u.name, role: u.role })),
    presence: presence.map(row => ({
      user: { id: row.user_id, name: getUser(row.user_id)?.name || 'Unknown', role: getUser(row.user_id)?.role || '' },
      presence: clone(row)
    })),
    tasks: sortedOpenTasks().map(task => clone(task)),
    summary: computeSummary(),
    events: events.slice(-80).map(event => clone(event)),
    decisions: decisions.slice(-80).map(item => clone(item)),
    games: games.map(game => clone(game)),
    workflow: {
      stages: STAGES,
      sla_minutes: {
        waiting_warning: SLA_WAITING_WARNING_MINUTES,
        waiting_critical: SLA_WAITING_CRITICAL_MINUTES
      }
    }
  };
}

function getTasks() {
  runAutomation();
  return sortedOpenTasks().map(task => clone(task));
}

function getGames() {
  runAutomation();
  return games.map(game => clone(game));
}

function runRoleAction(userId) {
  runAutomation();

  const user = getUser(userId);
  if (!user) return { error: 'invalid user_id' };

  const result = runRoleActionInternal(user, 'manual-role-action');
  if (result.error) return result;

  return {
    ok: true,
    user: { id: user.id, name: user.name, role: user.role },
    ...result
  };
}

function runAllRolesOnce() {
  runAutomation();

  const outputs = [];
  for (const user of roleOrder()) {
    outputs.push({ user_id: user.id, ...runRoleActionInternal(user, 'manual-role-action') });
  }

  return {
    ok: true,
    results: outputs
  };
}

runAutomation(true);

module.exports = {
  dashboardData,
  updatePresence,
  createTask,
  getTasks,
  getGames,
  runRoleAction,
  runAllRolesOnce
};
