const http = require('http');

function post(path, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: process.env.PORT || 3000,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      },
      res => {
        let body = '';
        res.on('data', chunk => {
          body += chunk.toString();
        });
        res.on('end', () => {
          resolve({ status: res.statusCode, body });
        });
      }
    );

    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

async function main() {
  // Create gomoku tasks for each AI role
  const tasks = [
    {
      title: 'gomoku - 产品目标 & 骨架需求',
      stage: 'DESIGN',
      owner_user_id: 4, // Orion
      project: 'gomoku'
    },
    {
      title: 'gomoku - UI 草图 & 交互（桌面版）',
      stage: 'DESIGN',
      owner_user_id: 3, // Muse
      project: 'gomoku'
    },
    {
      title: 'gomoku - 后端对局引擎 & 房间模型',
      stage: 'BUILD',
      owner_user_id: 1, // Atlas
      project: 'gomoku'
    },
    {
      title: 'gomoku - 前端棋盘 & 下子逻辑',
      stage: 'BUILD',
      owner_user_id: 2, // Nova
      project: 'gomoku'
    },
    {
      title: 'gomoku - QA 用例 & 回归清单',
      stage: 'REVIEW',
      owner_user_id: 5, // Echo
      project: 'gomoku'
    },
    {
      title: 'gomoku - 上线 & 发布说明',
      stage: 'RELEASE',
      owner_user_id: 6, // Forge
      project: 'gomoku'
    }
  ];

  for (const t of tasks) {
    const res = await post('/api/tasks', t);
    console.log('Create task', t.title, res.status);
  }

  // Set presence for each AI
  const presences = [
    {
      user_id: 1,
      state: 'WORKING',
      task_title: 'gomoku - 后端对局引擎 & 房间模型'
    },
    {
      user_id: 2,
      state: 'WORKING',
      task_title: 'gomoku - 前端棋盘 & 下子逻辑'
    },
    {
      user_id: 3,
      state: 'WAITING',
      task_title: 'gomoku - UI 草图 & 交互（桌面版）',
      waiting_for_user_id: 4,
      reason: '等待 Orion 确认棋盘布局与对局流程'
    },
    {
      user_id: 4,
      state: 'WORKING',
      task_title: 'gomoku - 产品目标 & 骨架需求'
    },
    {
      user_id: 5,
      state: 'WAITING',
      task_title: 'gomoku - QA 用例 & 回归清单',
      waiting_for_user_id: 1,
      reason: '等待 Atlas 提供对局规则细节 & API 返回格式'
    },
    {
      user_id: 6,
      state: 'BLOCKED',
      task_title: 'gomoku - 上线 & 发布说明',
      reason: '部署环境端口冲突，等待清理旧服务'
    }
  ];

  for (const p of presences) {
    const res = await post('/api/presence/update', p);
    console.log('Update presence for user', p.user_id, res.status);
  }

  console.log('Seed gomoku scenario completed.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

