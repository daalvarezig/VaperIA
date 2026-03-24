require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*' }));
app.use(morgan('dev'));
app.use(express.json({ limit: '5mb' }));

app.use('/webhook',   require('./routes/webhook'));
app.use('/chat',      require('./routes/chat'));
app.use('/evolution', require('./routes/evolution'));
app.use('/auth',      require('./routes/auth'));
app.use('/data',      require('./routes/data'));

app.get('/health', (_, res) => res.json({ status: 'ok', ts: Date.now() }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 VaperIA Backend :${PORT}`);
  console.log(`   POST /auth/pin`);
  console.log(`   GET  /data/inventory\n`);
});
