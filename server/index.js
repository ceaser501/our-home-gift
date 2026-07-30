const path = require('path');
const express = require('express');
const cors = require('cors');
const gifticonsRouter = require('./routes/gifticons');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/gifticons', gifticonsRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get(/^\/(?!api\/|uploads\/).*/, (req, res, next) => {
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next();
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message || '요청을 처리할 수 없습니다.' });
});

app.listen(PORT, () => {
  console.log(`OurHomeGift server listening on http://localhost:${PORT}`);
});
