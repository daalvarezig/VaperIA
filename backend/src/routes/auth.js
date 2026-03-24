const router = require('express').Router();
router.post('/pin', (req, res) => {
  const { pin } = req.body;
  const correct = process.env.APP_PIN || '1234';
  if (String(pin) === String(correct)) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false, error: 'PIN incorrecto' });
  }
});
module.exports = router;
