const { runRoleAction, runAllRolesOnce } = require('../lib/store');

module.exports = (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const body = req.body || {};

  if (body.run_all) {
    return res.status(200).json(runAllRolesOnce());
  }

  const userId = Number(body.user_id);
  if (!userId) {
    return res.status(400).json({ error: 'user_id is required unless run_all=true' });
  }

  const result = runRoleAction(userId);
  if (result.error) return res.status(400).json(result);

  return res.status(200).json(result);
};
