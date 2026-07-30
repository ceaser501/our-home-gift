const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('지원하지 않는 이미지 형식입니다.'));
    }
    cb(null, true);
  },
});

function toPublicPath(imagePath) {
  if (!imagePath) return null;
  return `/uploads/${path.basename(imagePath)}`;
}

function serialize(row) {
  if (!row) return row;
  return {
    ...row,
    amount: row.amount === null ? null : Number(row.amount),
    image_url: toPublicPath(row.image_path),
  };
}

router.get('/', (req, res) => {
  const { search, category, status, owner } = req.query;
  const clauses = [];
  const params = {};

  if (search) {
    clauses.push('(name LIKE @search OR brand LIKE @search OR memo LIKE @search)');
    params.search = `%${search}%`;
  }
  if (category) {
    clauses.push('category = @category');
    params.category = category;
  }
  if (status) {
    clauses.push('status = @status');
    params.status = status;
  }
  if (owner) {
    clauses.push('owner = @owner');
    params.owner = owner;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM gifticons ${where} ORDER BY created_at DESC`).all(params);
  res.json(rows.map(serialize));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM gifticons WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '기프티콘을 찾을 수 없습니다.' });
  res.json(serialize(row));
});

router.post('/', upload.single('image'), (req, res) => {
  const { name, category, brand, amount, owner, code, code_type, expires_at, memo } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: '이름은 필수입니다.' });
  }

  const imagePath = req.file ? req.file.filename : null;
  const now = new Date().toISOString();

  const info = db
    .prepare(
      `INSERT INTO gifticons
        (name, category, brand, amount, owner, code, code_type, expires_at, memo, image_path, status, created_at, updated_at)
       VALUES (@name, @category, @brand, @amount, @owner, @code, @code_type, @expires_at, @memo, @image_path, 'unused', @now, @now)`
    )
    .run({
      name: name.trim(),
      category: category || '기타',
      brand: brand || null,
      amount: amount ? Number(amount) : null,
      owner: owner || null,
      code: code || null,
      code_type: code_type || null,
      expires_at: expires_at || null,
      memo: memo || null,
      image_path: imagePath,
      now,
    });

  const row = db.prepare('SELECT * FROM gifticons WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(serialize(row));
});

router.patch('/:id', upload.single('image'), (req, res) => {
  const existing = db.prepare('SELECT * FROM gifticons WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '기프티콘을 찾을 수 없습니다.' });

  const fields = ['name', 'category', 'brand', 'amount', 'owner', 'code', 'code_type', 'expires_at', 'memo', 'status', 'used_at'];
  const updates = {};
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }

  if (req.body.status === 'used' && existing.status !== 'used' && !updates.used_at) {
    updates.used_at = new Date().toISOString().slice(0, 10);
  }
  if (req.body.status === 'unused') {
    updates.used_at = null;
  }

  if (req.file) {
    updates.image_path = req.file.filename;
    if (existing.image_path) {
      fs.unlink(path.join(uploadDir, existing.image_path), () => {});
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.json(serialize(existing));
  }

  updates.updated_at = new Date().toISOString();
  const setClause = Object.keys(updates)
    .map((k) => `${k} = @${k}`)
    .join(', ');

  db.prepare(`UPDATE gifticons SET ${setClause} WHERE id = @id`).run({ ...updates, id: req.params.id });

  const row = db.prepare('SELECT * FROM gifticons WHERE id = ?').get(req.params.id);
  res.json(serialize(row));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM gifticons WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '기프티콘을 찾을 수 없습니다.' });

  db.prepare('DELETE FROM gifticons WHERE id = ?').run(req.params.id);
  if (existing.image_path) {
    fs.unlink(path.join(uploadDir, existing.image_path), () => {});
  }
  res.status(204).end();
});

module.exports = router;
