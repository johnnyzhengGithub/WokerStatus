const API_BASE = '';

let dashboardState = {
  users: [],
  presence: [],
  summary: null,
  tasks: [],
  selectedTaskId: null,
  events: []
};

function $(id) {
  return document.getElementById(id);
}

function stateClass(state) {
  if (state === 'WORKING') return 'state-pill state-pill--working';
  if (state === 'WAITING') return 'state-pill state-pill--waiting';
  if (state === 'BLOCKED') return 'state-pill state-pill--blocked';
  return 'state-pill state-pill--idle';
}

function minutesSince(iso) {
  if (!iso) return 0;
  const diffMs = Date.now() - new Date(iso).getTime();
  return Math.floor(diffMs / (60 * 1000));
}

function formatTimer(iso) {
  if (!iso) return 'since —';
  const diff = Date.now() - new Date(iso).getTime();
  const totalSeconds = Math.floor(diff / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `since ${h}:${m}:${s}`;
}

function renderKPI() {
  const { summary } = dashboardState;
  if (!summary) return;

  $('kpi-working').textContent = summary.working;
  $('kpi-waiting').textContent = summary.waiting;
  $('kpi-blocked').textContent = summary.blocked;
  $('kpi-idle').textContent = summary.idle;

  if (summary.longest_waiting_user) {
    const longestUser = summary.longest_waiting_user;
    $('kpi-longest').textContent =
      `${longestUser.name} · ${summary.longest_waiting_minutes}m`;

    const ev = getLastEventForUser(longestUser.id, ['waiting_escalated', 'presence_update']);
    const sub = document.getElementById('kpi-longest-log');
    if (sub) {
      sub.textContent = ev ? formatEventMessage(ev) : 'no recent intervention';
    }
  } else {
    $('kpi-longest').textContent = '—';
    const sub = document.getElementById('kpi-longest-log');
    if (sub) sub.textContent = '—';
  }
}

function getLastEventForUser(userId, preferredKinds) {
  const events = dashboardState.events || [];
  const filtered = events.filter(
    ev =>
      ev.user_id === userId ||
      ev.owner_user_id === userId ||
      ev.to_user_id === userId
  );
  if (!filtered.length) return null;
  if (preferredKinds && preferredKinds.length) {
    for (let i = filtered.length - 1; i >= 0; i--) {
      if (preferredKinds.includes(filtered[i].kind)) return filtered[i];
    }
  }
  return filtered[filtered.length - 1];
}

function formatEventMessage(ev) {
  switch (ev.kind) {
    case 'presence_update':
      return `${ev.user_name} → ${ev.state}`;
    case 'task_created':
      return `task created: ${ev.title}`;
    case 'task_stage_advanced':
      return `${ev.title} ${ev.from} → ${ev.to}`;
    case 'task_done':
      return `done: ${ev.title}`;
    case 'waiting_escalated':
      return `escalated to ${ev.to_user_name}`;
    case 'game_released':
      return `released game: ${ev.name}`;
    default:
      return ev.kind;
  }
}

function renderStage() {
  const container = $('stage');
  if (!container) return;
  container.innerHTML = '';

  // Create 6 tiles for the stage grid
  const tiles = [];
  for (let i = 0; i < 6; i++) {
    const tile = document.createElement('div');
    tile.className = 'stage-tile';
    container.appendChild(tile);
    tiles.push(tile);
  }

  dashboardState.users.forEach((user, index) => {
    const presenceRow = dashboardState.presence.find(p => p.user.id === user.id);
    const presence = presenceRow ? presenceRow.presence : null;
    const since = presence?.since_time;
    const waitingForUser =
      presence?.waiting_for_user_id &&
      dashboardState.users.find(u => u.id === presence.waiting_for_user_id);

    const lastEvent = getLastEventForUser(user.id, ['presence_update', 'waiting_escalated']);

    let bubble = '';
    if (!presence || presence.state === 'IDLE') {
      bubble = 'Idle';
    } else if (presence.state === 'WORKING') {
      bubble = presence.task_title ? `Working: ${presence.task_title}` : 'Working';
    } else if (presence.state === 'WAITING') {
      const who = waitingForUser ? waitingForUser.name : 'someone';
      bubble = `Waiting: ${who}`;
    } else if (presence.state === 'BLOCKED') {
      bubble = presence.reason ? `Blocked: ${presence.reason}` : 'Blocked';
    }

    const stateClassName =
      presence?.state === 'WORKING'
        ? 'agent--working'
        : presence?.state === 'WAITING'
        ? 'agent--waiting'
        : presence?.state === 'BLOCKED'
        ? 'agent--blocked'
        : 'agent--idle';

    const initials = user.name
      .split(' ')
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    const agent = document.createElement('div');
    agent.className = `agent ${stateClassName}`;
    agent.dataset.userId = String(user.id);

    const lastLog = lastEvent ? formatEventMessage(lastEvent) : '';
    const timeLabel = since ? formatTimer(since) : '';

    agent.innerHTML = `
      <div class="agent-avatar-ring">
        <div class="agent-avatar">${initials}</div>
      </div>
      <div class="agent-name">${user.name}</div>
      <div class="agent-role">${user.role}</div>
      <div class="agent-bubble" title="${bubble}">${bubble}</div>
    `;

    if (timeLabel || lastLog) {
      agent.title = `${timeLabel}${lastLog ? ' • ' + lastLog : ''}`;
    }

    const tileIndex = Math.min(index, tiles.length - 1);
    tiles[tileIndex].appendChild(agent);
  });
}

function renderTimers() {
  document.querySelectorAll('.timer').forEach(el => {
    const since = el.getAttribute('data-since');
    if (!since) return;
    el.textContent = formatTimer(since);
  });
}

function renderQueue() {
  const list = $('queue-list');
  list.innerHTML = '';

  dashboardState.tasks.forEach(task => {
    const owner =
      dashboardState.users.find(u => u.id === task.owner_user_id) || null;
    const li = document.createElement('li');
    li.className = 'queue-item';
    li.dataset.taskId = String(task.id);
    li.innerHTML = `
      <div class="queue-item__title">${task.title}</div>
      <div class="queue-item__meta">
        ${task.stage} · ${owner ? owner.name : 'Unknown'}
      </div>
    `;
    list.appendChild(li);
  });

  renderTaskDetail();
}

function renderTaskDetail() {
  const detail = $('task-detail');
  const task =
    dashboardState.tasks.find(t => t.id === dashboardState.selectedTaskId) ||
    null;

  if (!task) {
    detail.innerHTML =
      '<div class="task-detail__empty">点击左侧任务查看详情。</div>';
    return;
  }

  const owner =
    dashboardState.users.find(u => u.id === task.owner_user_id) || null;

  detail.innerHTML = `
    <div class="task-detail__card">
      <div class="task-detail__title">${task.title}</div>
      <div class="task-detail__row">
        <span class="task-detail__label">Stage</span>
        <span class="task-detail__value">${task.stage}</span>
      </div>
      <div class="task-detail__row">
        <span class="task-detail__label">Owner</span>
        <span class="task-detail__value">${owner ? owner.name : 'Unknown'}</span>
      </div>
      <div class="task-detail__row">
        <span class="task-detail__label">Created at</span>
        <span class="task-detail__value">${new Date(
          task.created_at
        ).toLocaleString()}</span>
      </div>
    </div>
  `;
}

function renderAll() {
  renderKPI();
  renderStage();
  renderQueue();
  renderActivity();
}

async function fetchDashboard() {
  const res = await fetch(`${API_BASE}/api/dashboard`);
  if (!res.ok) {
    console.error('Failed to fetch dashboard', await res.text());
    return;
  }
  const data = await res.json();
  dashboardState = {
    ...data,
    selectedTaskId: data.tasks && data.tasks[0] ? data.tasks[0].id : null
  };
  initFormOptions();
  renderAll();
}

function renderActivity() {
  const list = $('activity-list');
  if (!list) return;

  list.innerHTML = '';

  const events = (dashboardState.events || []).slice(-30).reverse();

  events.forEach(ev => {
    const li = document.createElement('li');
    li.className = 'activity__item';
    const time = new Date(ev.timestamp).toLocaleTimeString();
    const message = ev.message || ev.kind;
    li.innerHTML = `
      <div class="activity__time">${time}</div>
      <div class="activity__message">${message}</div>
    `;
    list.appendChild(li);
  });
}

function initFormOptions() {
  const userSelect = $('form-user');
  const waitingForSelect = $('form-waiting-for');

  userSelect.innerHTML = '';
  waitingForSelect.innerHTML = '<option value="">—</option>';

  dashboardState.users.forEach(user => {
    const opt = document.createElement('option');
    opt.value = String(user.id);
    opt.textContent = `${user.name} (${user.role})`;
    userSelect.appendChild(opt);

    const opt2 = document.createElement('option');
    opt2.value = String(user.id);
    opt2.textContent = `${user.name}`;
    waitingForSelect.appendChild(opt2);
  });

  const taskOwnerSelect = $('task-owner');
  taskOwnerSelect.innerHTML = '';
  dashboardState.users.forEach(user => {
    const opt = document.createElement('option');
    opt.value = String(user.id);
    opt.textContent = `${user.name}`;
    taskOwnerSelect.appendChild(opt);
  });
}

async function updatePresence(payload) {
  const res = await fetch(`${API_BASE}/api/presence/update`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Failed to update presence');
    return;
  }

  await fetchDashboard();
}

function attachFormHandler() {
  const form = $('update-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const user_id = Number($('form-user').value);
    const state = $('form-state').value;
    const task_title = $('form-task').value.trim();
    const waiting_for_user_id = $('form-waiting-for').value
      ? Number($('form-waiting-for').value)
      : null;
    const reason = $('form-reason').value.trim();

    const payload = { user_id, state, task_title, waiting_for_user_id, reason };
    await updatePresence(payload);
  });
}

function attachCardActions() {
  const stage = $('stage');
  if (!stage) return;
  stage.addEventListener('click', e => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const agent = target.closest('.agent');
    if (!agent) return;
    const userId = Number(agent.getAttribute('data-user-id'));
    if (!userId) return;
    $('form-user').value = String(userId);
  });
}

function attachQueueActions() {
  $('queue-list').addEventListener('click', e => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const item = target.closest('.queue-item');
    if (!item) return;
    const taskId = Number(item.getAttribute('data-taskId'));
    dashboardState.selectedTaskId = taskId;
    renderTaskDetail();
  });
}

function attachCreateTaskForm() {
  const form = $('create-task-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const title = $('task-title').value.trim();
    const stage = $('task-stage').value;
    const owner_user_id = Number($('task-owner').value);

    const res = await fetch(`${API_BASE}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title, stage, owner_user_id })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to create task');
      return;
    }

    $('task-title').value = '';

    await fetchDashboard();
  });
}

function setupWebSocket() {
  let protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('WebSocket connected');
  };

  ws.onmessage = event => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'presence_update') {
        const updated = message.payload;
        const index = dashboardState.presence.findIndex(
          row => row.user.id === updated.user.id
        );
        if (index >= 0) {
          dashboardState.presence[index] = updated;
        } else {
          dashboardState.presence.push(updated);
        }
        dashboardState.summary = computeSummaryFromPresence(
          dashboardState.presence
        );
        renderAll();
      }
    } catch (err) {
      console.error('Error handling WS message', err);
    }
  };

  ws.onclose = () => {
    console.warn('WebSocket closed, retrying in 3s');
    setTimeout(setupWebSocket, 3000);
  };
}

function computeSummaryFromPresence(presenceList) {
  const summary = {
    working: 0,
    waiting: 0,
    blocked: 0,
    idle: 0,
    longest_waiting_user: null,
    longest_waiting_minutes: 0
  };

  const now = Date.now();

  presenceList.forEach(row => {
    const p = row.presence;
    if (!p) return;
    if (p.state === 'WORKING') summary.working++;
    else if (p.state === 'WAITING') summary.waiting++;
    else if (p.state === 'BLOCKED') summary.blocked++;
    else if (p.state === 'IDLE') summary.idle++;

    if (p.state === 'WAITING') {
      const since = new Date(p.since_time).getTime();
      const minutes = Math.floor((now - since) / (60 * 1000));
      if (minutes > summary.longest_waiting_minutes) {
        summary.longest_waiting_minutes = minutes;
        summary.longest_waiting_user = {
          id: row.user.id,
          name: row.user.name
        };
      }
    }
  });

  return summary;
}

function startTimers() {
  setInterval(renderTimers, 1000);
}

function startDashboardPolling() {
  // Ensure tasks / activity 等状态会周期刷新
  setInterval(fetchDashboard, 15000);
}

async function init() {
  await fetchDashboard();
  attachFormHandler();
  attachCardActions();
  attachQueueActions();
  attachCreateTaskForm();
  setupWebSocket();
  startTimers();
  startDashboardPolling();
}

window.addEventListener('DOMContentLoaded', init);

