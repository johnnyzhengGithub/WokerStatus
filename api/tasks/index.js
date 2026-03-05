const { createTask, getTasks } = require('../lib/store');

module.exports = (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).json({ tasks: getTasks() });
  }

  if (req.method === 'POST') {
    const result = createTask(req.body || {});
    if (result.error) return res.status(400).json(result);
    return res.status(200).json(result);
  }

  return res.status(405).json({ error: 'method not allowed' });
};
