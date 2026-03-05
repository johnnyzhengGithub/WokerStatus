const API_BASE = '';

const STAGE_PROGRESS = {
  IDEA: 15,
  DESIGN: 35,
  BUILD: 60,
  REVIEW: 80,
  RELEASE: 92,
  DONE: 100
};

const STAGE_ICON = {
  IDEA: '??',
  DESIGN: '??',
  BUILD: '?',
  REVIEW: '??',
  RELEASE: '??',
  DONE: '?'
};

let dashboardState = {
  users: [],
  presence: [],
  summary: null,
  tasks: [],
  selectedTaskId: null,
  selectedWorkerId: null,
  events: [],
  decisions: []
};

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function minutesSince(iso) {
  if (!iso) return 0;
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return 0;
  return Math.floor(diff / 60000);
}

function sinceText(iso) {
  const mins = minutesSince(iso);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m ago`;
}

function eventMessage(ev) {
  return ev.message || ev.kind || 'event';
}

function getUserById(userId) {
  return dashboardState.users.find(user => user.id === Number(userId)) || null;
}

function getPresenceByUserId(userId) {
  return dashboardState.presence.find(row => row.user.id === Number(userId)) || null;
}

function getTaskForPresence(presence) {
  if (!presence || !presence.task_title) return null;
  return dashboardState.tasks.find(task => task.title === presence.task_title) || null;
}

function taskProgress(task, presenceState) {
  if (task && STAGE_PROGRESS[task.stage] !== undefined) {
    return STAGE_PROGRESS[task.stage];
  }
  if (presenceState === 'WORKING') return 45;
  if (presenceState === 'WAITING') return 40;
  if (presenceState === 'BLOCKED') return 35;
  return 0;
}

function progressBar(percent) {
  const blocks = Math.round((percent / 100) * 10);
  const done = '¦'.repeat(blocks);
  const todo = '¦'.repeat(Math.max(0, 10 - blocks));
  return `${done}${todo}`;
}

function priorityMeta(priority) {
  const value = Number(priority || 3);
  if (value <= 1) return { icon: '??', label: 'High' };
  if (value === 2) return { icon: '?', label: 'Medium' };
  return { icon: '•', label: 'Low' };
}

function stageMeta(stage) {
  return `${STAGE_ICON[stage] || '•'} ${stage || 'UNKNOWN'}`;
}

function taskDurationStats() {
  const events = dashboardState.events || [];
  const createByTask = new Map();
  const durations = [];

  events.forEach(ev => {
    if (ev.kind === 'task_created' && ev.task_id) {
      createByTask.set(String(ev.task_id), new Date(ev.timestamp).getTime());
    }
  });

  events.forEach(ev => {
    if (ev.kind === 'task_done' && ev.task_id) {
      const start = createByTask.get(String(ev.task_id));
      const end = new Date(ev.timestamp).getTime();
      if (start && end > start) {
        durations.push(Math.floor((end - start) / 60000));
      }
    }
  });

  if (!durations.length) return null;
  const total = durations.reduce((sum, d) => sum + d, 0);
  return Math.round(total / durations.length);
}

function completedTodayCount() {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();

  return (dashboardState.events || []).filter(ev => {
    if (ev.kind !== 'task_done') return false;
    const t = new Date(ev.timestamp);
    return t.getFullYear() === y && t.getMonth() === m && t.getDate() === d;
  }).length;
}

function queueTimeAverage() {
  const rows = dashboardState.presence.filter(row => row.presence.state === 'WAITING');
  if (!rows.length) return 0;
  const total = rows.reduce((sum, row) => sum + minutesSince(row.presence.since_time), 0);
  return Math.round(total / rows.length);
}

function getDependencyChain() {
  const waits = dashboardState.presence
    .map(row => row.presence)
    .filter(p => p.state === 'WAITING' && p.waiting_for_user_id)
    .map(p => ({ from: p.user_id, to: p.waiting_for_user_id }));

  if (!waits.length) return [];

  const outByFrom = new Map(waits.map(w => [w.from, w.to]));
  let best = [];

  waits.forEach(edge => {
    const chain = [edge.from];
    let current = edge.from;
    const seen = new Set(chain);
    while (outByFrom.get(current)) {
      const next = outByFrom.get(current);
      if (seen.has(next)) break;
      chain.push(next);
      seen.add(next);
      current = next;
    }
    if (chain.length > best.length) best = chain;
  });

  return best;
}

function renderKPI() {
  const summary = dashboardState.summary;
  if (!summary) return;

  $('kpi-working').textContent = String(summary.working || 0);
  $('kpi-waiting').textContent = String(summary.waiting || 0);
  $('kpi-blocked').textContent = String(summary.blocked || 0);
  $('kpi-idle').textContent = String(summary.idle || 0);

  $('kpi-throughput').textContent = String(completedTodayCount());

  const avg = taskDurationStats();
  $('kpi-avg-time').textContent = avg ? `${avg}m` : '-';

  const queue = queueTimeAverage();
  $('kpi-queue-time').textContent = queue ? `${queue}m` : '-';

  const longestUser = summary.longest_waiting_user;
  if (!longestUser || !longestUser.name) {
    $('kpi-longest').textContent = 'No waiting users';
    $('kpi-longest-log').textContent = '-';
    return;
  }

  const row = getPresenceByUserId(longestUser.id);
  const p = row ? row.presence : null;
  const blockedBy = p && p.waiting_for_user_id ? getUserById(p.waiting_for_user_id) : null;

  $('kpi-longest').textContent = `${longestUser.name} waiting ${summary.longest_waiting_minutes || 0}m`;
  $('kpi-longest-log').textContent = blockedBy ? `Blocked by ${blockedBy.name}` : 'Blocked by unknown dependency';
}

function buildAlertRows() {
  const alerts = [];

  dashboardState.presence.forEach(row => {
    const user = row.user;
    const p = row.presence;
    const waitingFor = p.waiting_for_user_id ? getUserById(p.waiting_for_user_id) : null;

    if (p.state === 'WAITING' && minutesSince(p.since_time) >= 2) {
      alerts.push(`? ${user.name} waiting > ${minutesSince(p.since_time)}m${waitingFor ? ` (for ${waitingFor.name})` : ''}`);
    }
    if (p.state === 'BLOCKED') {
      alerts.push(`? ${user.name} blocked${p.reason ? `: ${p.reason}` : ''}`);
    }
    if (p.state === 'IDLE' && minutesSince(p.since_time) >= 5) {
      alerts.push(`? ${user.name} idle ${minutesSince(p.since_time)}m`);
    }
  });

  return alerts.slice(0, 8);
}

function renderAlerts() {
  const list = $('alert-list');
  list.innerHTML = '';

  const alerts = buildAlertRows();
  if (!alerts.length) {
    const li = document.createElement('li');
    li.className = 'alerts__item alerts__item--ok';
    li.textContent = '? No active alerts';
    list.appendChild(li);
  } else {
    alerts.forEach(text => {
      const li = document.createElement('li');
      li.className = 'alerts__item';
      li.textContent = text;
      list.appendChild(li);
    });
  }

  const chain = getDependencyChain()
    .map(userId => getUserById(userId))
    .filter(Boolean)
    .map(user => user.name);

  $('dependency-chain').textContent =
    chain.length > 1 ? `Dependency chain: ${chain.join(' ? ')}` : 'Dependency chain: clear';
}

function workerCardDetail(user, p) {
  const task = getTaskForPresence(p);
  const waitingFor = p.waiting_for_user_id ? getUserById(p.waiting_for_user_id) : null;
  const dependsText = waitingFor ? waitingFor.name : 'None';
  const progress = taskProgress(task, p.state);
  const taskText = p.task_title || '-';

  if (p.state === 'WAITING') {
    return {
      headline: `Waiting for ${dependsText}`,
      taskLine: `Task: ${taskText}`,
      reasonLine: p.reason || ''
    };
  }

  return {
    headline: p.state,
    taskLine: `Task: ${taskText}`,
    reasonLine: p.reason || ''
  };
}

function renderStage() {
  const container = $('stage');
  container.innerHTML = '';

  dashboardState.users.forEach(user => {
    const row = getPresenceByUserId(user.id);
    const p = row ? row.presence : {
      state: 'IDLE',
      task_title: '',
      waiting_for_user_id: null,
      reason: '',
      since_time: null
    };

    const task = getTaskForPresence(p);
    const waitingFor = p.waiting_for_user_id ? getUserById(p.waiting_for_user_id) : null;
    const initials = user.name
      .split(' ')
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    const info = workerCardDetail(user, p);
    const progress = taskProgress(task, p.state);
    const progressVisual = progressBar(progress);

    const card = document.createElement('article');
    card.className = `agent-card agent-card--${p.state.toLowerCase()}${dashboardState.selectedWorkerId === user.id ? ' agent-card--selected' : ''}`;
    card.dataset.userId = String(user.id);

    card.title = `${user.name}\nCurrent task: ${p.task_title || '-'}\nStarted: ${sinceText(p.since_time)}\nDepends: ${waitingFor ? waitingFor.name : 'None'}`;

    card.innerHTML = `
      <div class="agent-card__header">
        <div class="agent-avatar-ring">
          <div class="agent-avatar">${initials}</div>
        </div>
        <div>
          <div class="agent-name">${escapeHtml(user.name)}</div>
          <div class="agent-role">${escapeHtml(user.role)}</div>
        </div>
        <div class="agent-state-pill">${escapeHtml(p.state)}</div>
      </div>
      <div class="agent-line">${escapeHtml(info.taskLine)}</div>
      <div class="agent-line">Progress: <span class="agent-progress-visual">${progressVisual}</span> ${progress}%</div>
      <div class="agent-line">Started: ${escapeHtml(sinceText(p.since_time))}</div>
      <div class="agent-line">Depends: ${escapeHtml(waitingFor ? waitingFor.name : 'None')}</div>
      ${info.reasonLine ? `<div class="agent-line agent-line--reason">Reason: ${escapeHtml(info.reasonLine)}</div>` : ''}
      ${p.state === 'WAITING' ? `<div class="agent-line agent-line--waiting">Waiting for ${escapeHtml(waitingFor ? waitingFor.name : 'dependency')}</div>` : ''}
    `;

    container.appendChild(card);
  });
}

function renderWorkerDetail() {
  const panel = $('worker-detail');
  const userId = dashboardState.selectedWorkerId || (dashboardState.users[0] && dashboardState.users[0].id);

  if (!userId) {
    panel.innerHTML = '<div class="task-detail__empty">No worker selected.</div>';
    return;
  }

  const user = getUserById(userId);
  const row = getPresenceByUserId(userId);
  const p = row ? row.presence : null;

  if (!user || !p) {
    panel.innerHTML = '<div class="task-detail__empty">No worker data.</div>';
    return;
  }

  const waitingFor = p.waiting_for_user_id ? getUserById(p.waiting_for_user_id) : null;
  const recent = (dashboardState.events || [])
    .filter(ev => ev.user_id === userId || ev.owner_user_id === userId || ev.to_user_id === userId)
    .slice(-3)
    .reverse();

  panel.innerHTML = `
    <div class="task-detail__card">
      <div class="task-detail__title">${escapeHtml(user.name)} detail</div>
      <div class="task-detail__row"><span class="task-detail__label">State</span><span class="task-detail__value">${escapeHtml(p.state)}</span></div>
      <div class="task-detail__row"><span class="task-detail__label">Task</span><span class="task-detail__value">${escapeHtml(p.task_title || '-')}</span></div>
      <div class="task-detail__row"><span class="task-detail__label">Started</span><span class="task-detail__value">${escapeHtml(sinceText(p.since_time))}</span></div>
      <div class="task-detail__row"><span class="task-detail__label">Depends</span><span class="task-detail__value">${escapeHtml(waitingFor ? waitingFor.name : 'None')}</span></div>
      <div class="task-detail__row"><span class="task-detail__label">Reason</span><span class="task-detail__value">${escapeHtml(p.reason || '-')}</span></div>
      <div class="task-detail__history">${
        recent.length
          ? recent.map(ev => `<div>• ${escapeHtml(eventMessage(ev))}</div>`).join('')
          : '• No recent history'
      }</div>
    </div>
  `;
}

function renderQueue() {
  const list = $('queue-list');
  list.innerHTML = '';

  dashboardState.tasks.forEach(task => {
    const ownerId = task.owner_user_id || task.owner_id;
    const owner = getUserById(ownerId);
    const priority = priorityMeta(task.priority);

    const li = document.createElement('li');
    li.className = 'queue-item';
    if (dashboardState.selectedTaskId === task.id) {
      li.classList.add('queue-item--selected');
    }

    li.dataset.taskId = String(task.id);
    li.innerHTML = `
      <div class="queue-item__title">${priority.icon} ${escapeHtml(task.title)}</div>
      <div class="queue-item__meta">${escapeHtml(stageMeta(task.stage))} · ${escapeHtml(owner ? owner.name : 'Unknown')} · ${priority.label}</div>
    `;

    list.appendChild(li);
  });

  renderTaskDetail();
}

function renderTaskDetail() {
  const detail = $('task-detail');
  const task = dashboardState.tasks.find(item => item.id === dashboardState.selectedTaskId);

  if (!task) {
    detail.innerHTML = '<div class="task-detail__empty">Select a task in queue to inspect details.</div>';
    return;
  }

  const ownerId = task.owner_user_id || task.owner_id;
  const owner = getUserById(ownerId);
  const priority = priorityMeta(task.priority);

  detail.innerHTML = `
    <div class="task-detail__card">
      <div class="task-detail__title">${escapeHtml(task.title)}</div>
      <div class="task-detail__row"><span class="task-detail__label">Priority</span><span class="task-detail__value">${priority.icon} ${priority.label}</span></div>
      <div class="task-detail__row"><span class="task-detail__label">Stage</span><span class="task-detail__value">${escapeHtml(stageMeta(task.stage))}</span></div>
      <div class="task-detail__row"><span class="task-detail__label">Owner</span><span class="task-detail__value">${escapeHtml(owner ? owner.name : 'Unknown')}</span></div>
      <div class="task-detail__row"><span class="task-detail__label">Depends on</span><span class="task-detail__value">${
        Array.isArray(task.depends_on) && task.depends_on.length ? escapeHtml(task.depends_on.join(', ')) : '-'
      }</span></div>
    </div>
  `;
}

function renderActivity() {
  const list = $('activity-list');
  list.innerHTML = '';

  const rows = (dashboardState.events || []).slice(-25).reverse();
  rows.forEach(ev => {
    const li = document.createElement('li');
    li.className = 'activity__item';
    li.innerHTML = `
      <div class="activity__time">${new Date(ev.timestamp).toLocaleTimeString()}</div>
      <div class="activity__message">${escapeHtml(eventMessage(ev))}</div>
    `;
    list.appendChild(li);
  });
}

function renderDecisions() {
  const list = $('decision-list');
  list.innerHTML = '';

  const rows = (dashboardState.decisions || []).slice(-20).reverse();
  if (!rows.length) {
    const li = document.createElement('li');
    li.className = 'activity__item';
    li.innerHTML = '<div class="activity__message">No decisions yet.</div>';
    list.appendChild(li);
    return;
  }

  rows.forEach(item => {
    const li = document.createElement('li');
    li.className = 'activity__item';
    li.innerHTML = `
      <div class="activity__time">${new Date(item.created_at).toLocaleTimeString()}</div>
      <div class="activity__message">[${escapeHtml(item.source)}] ${escapeHtml(item.decision)}</div>
    `;
    list.appendChild(li);
  });
}

function renderAll() {
  renderKPI();
  renderAlerts();
  renderStage();
  renderWorkerDetail();
  renderQueue();
  renderActivity();
  renderDecisions();
}

function initFormOptions() {
  const formUser = $('form-user');
  const formWaiting = $('form-waiting-for');
  const taskOwner = $('task-owner');
  const actionUser = $('role-action-user');

  formUser.innerHTML = '';
  formWaiting.innerHTML = '<option value="">-</option>';
  taskOwner.innerHTML = '';
  actionUser.innerHTML = '';

  dashboardState.users.forEach(user => {
    const display = `${user.name} (${user.role})`;

    const userOpt = document.createElement('option');
    userOpt.value = String(user.id);
    userOpt.textContent = display;
    formUser.appendChild(userOpt);

    const waitOpt = document.createElement('option');
    waitOpt.value = String(user.id);
    waitOpt.textContent = user.name;
    formWaiting.appendChild(waitOpt);

    const ownerOpt = document.createElement('option');
    ownerOpt.value = String(user.id);
    ownerOpt.textContent = user.name;
    taskOwner.appendChild(ownerOpt);

    const actionOpt = document.createElement('option');
    actionOpt.value = String(user.id);
    actionOpt.textContent = display;
    actionUser.appendChild(actionOpt);
  });
}

async function fetchDashboard() {
  const res = await fetch(`${API_BASE}/api/dashboard`);
  if (!res.ok) {
    console.error('Failed to fetch dashboard', await res.text());
    return;
  }

  const data = await res.json();

  dashboardState = {
    users: data.users || [],
    presence: data.presence || [],
    summary: data.summary || null,
    tasks: data.tasks || [],
    selectedTaskId:
      dashboardState.selectedTaskId && (data.tasks || []).some(task => task.id === dashboardState.selectedTaskId)
        ? dashboardState.selectedTaskId
        : data.tasks && data.tasks[0]
        ? data.tasks[0].id
        : null,
    selectedWorkerId:
      dashboardState.selectedWorkerId && (data.users || []).some(user => user.id === dashboardState.selectedWorkerId)
        ? dashboardState.selectedWorkerId
        : data.users && data.users[0]
        ? data.users[0].id
        : null,
    events: data.events || [],
    decisions: data.decisions || []
  };

  initFormOptions();
  renderAll();
}

async function updatePresence(payload) {
  const res = await fetch(`${API_BASE}/api/presence/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Failed to update presence');
    return;
  }

  await fetchDashboard();
}

async function createTask(payload) {
  const res = await fetch(`${API_BASE}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Failed to create task');
    return;
  }

  await fetchDashboard();
}

async function runRoleAction(userId) {
  const res = await fetch(`${API_BASE}/api/roles/act`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: Number(userId) })
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Role action failed');
    return null;
  }

  return data;
}

async function runAllRoles() {
  const res = await fetch(`${API_BASE}/api/roles/act`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ run_all: true })
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Run all roles failed');
    return null;
  }

  return data;
}

function attachQueueActions() {
  $('queue-list').addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const row = target.closest('.queue-item');
    if (!row) return;

    dashboardState.selectedTaskId = row.getAttribute('data-taskId');
    renderQueue();
  });
}

function attachPresenceForm() {
  $('update-form').addEventListener('submit', async event => {
    event.preventDefault();

    const payload = {
      user_id: Number($('form-user').value),
      state: $('form-state').value,
      task_title: $('form-task').value.trim(),
      waiting_for_user_id: $('form-waiting-for').value ? Number($('form-waiting-for').value) : null,
      reason: $('form-reason').value.trim()
    };

    await updatePresence(payload);
  });
}

function attachTaskForm() {
  $('create-task-form').addEventListener('submit', async event => {
    event.preventDefault();

    const dependsRaw = $('task-depends').value.trim();
    const dependsOn = dependsRaw
      ? dependsRaw
          .split(',')
          .map(item => item.trim())
          .filter(Boolean)
      : [];

    const payload = {
      title: $('task-title').value.trim(),
      stage: $('task-stage').value,
      owner_user_id: Number($('task-owner').value),
      depends_on: dependsOn
    };

    await createTask(payload);

    $('task-title').value = '';
    $('task-depends').value = '';
  });
}

function attachStageActions() {
  $('stage').addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const card = target.closest('.agent-card');
    if (!card) return;

    const userId = Number(card.getAttribute('data-user-id'));
    if (!userId) return;

    dashboardState.selectedWorkerId = userId;
    $('form-user').value = String(userId);
    $('role-action-user').value = String(userId);
    renderStage();
    renderWorkerDetail();
  });
}

function attachRoleActions() {
  $('btn-run-role').addEventListener('click', async () => {
    const userId = Number($('role-action-user').value);
    const result = await runRoleAction(userId);
    if (!result) return;

    $('role-action-result').textContent = `${result.user.name}: ${result.action}`;
    await fetchDashboard();
  });

  $('btn-run-all').addEventListener('click', async () => {
    const result = await runAllRoles();
    if (!result) return;

    const count = Array.isArray(result.results) ? result.results.length : 0;
    $('role-action-result').textContent = `Executed role actions for ${count} users.`;
    await fetchDashboard();
  });
}

function startPolling() {
  setInterval(fetchDashboard, 10000);
}

async function init() {
  await fetchDashboard();
  attachQueueActions();
  attachPresenceForm();
  attachTaskForm();
  attachStageActions();
  attachRoleActions();
  startPolling();
}

window.addEventListener('DOMContentLoaded', init);
