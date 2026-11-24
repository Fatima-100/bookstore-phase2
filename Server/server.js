const path = require('node:path');
const fs = require('node:fs/promises');
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./src/db'); // also loads Server/.env
const { createMongoStore } = require('./src/store/mongo');
const { createService } = require('./src/service');
const { upload, handleUploadError } = require('./src/bookUpload');
const { HttpError } = require('./src/errors');

const COOKIE_NAME = 'bs_session';

function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name) cookies[name] = decodeURIComponent(rest.join('='));
  }
  return cookies;
}

// Uploaded files live in one folder; the service decides who may download them.
function createDiskFiles(uploadsPath) {
  return {
    async save(buffer, filename) {
      await fs.mkdir(uploadsPath, { recursive: true });
      await fs.writeFile(path.join(uploadsPath, filename), buffer, { flag: 'wx' });
    },
    async remove(filename) {
      await fs.unlink(path.join(uploadsPath, filename)).catch(() => {});
    },
  };
}

// Allows 10 failed log-ins per e-mail and address every 15 minutes.
function createLoginLimiter({ max = 10, windowMs = 15 * 60 * 1000 } = {}) {
  const failures = new Map();
  const recent = (key) => (failures.get(key) || []).filter((time) => Date.now() - time < windowMs);
  return {
    isBlocked: (key) => recent(key).length >= max,
    fail: (key) => failures.set(key, [...recent(key), Date.now()]),
    reset: (key) => failures.delete(key),
  };
}

function createApp({ store, uploadsPath = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads') } = {}) {
  const app = express();
  const service = createService({ store, files: createDiskFiles(uploadsPath) });
  const limiter = createLoginLimiter();
  const secureCookies = process.env.COOKIE_SECURE === 'true';
  const allowedOrigins = (process.env.FRONTEND_ORIGINS || 'http://localhost:5173,http://localhost:5174')
    .split(',').map((origin) => origin.trim()).filter(Boolean);

  app.disable('x-powered-by');
  app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)), credentials: true }));
  app.use(express.json({ limit: '50kb' }));

  // Identify the user on every request from the session cookie (never from the request body).
  app.use(async (req, res, next) => {
    req.sessionToken = parseCookies(req.headers.cookie)[COOKIE_NAME];
    req.user = await service.authenticate(req.sessionToken);
    next();
  });

  const requireLogin = (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Please log in first.' });
    next();
  };
  const requireAdmin = (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Please log in first.' });
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Only an administrator can do this.' });
    next();
  };

  // ----- Authentication -----
  app.post('/api/auth/register', async (req, res) => {
    const user = await service.register(req.body || {});
    res.status(201).json({ message: 'Registration successful. You can now log in.', user });
  });

  app.post('/api/auth/login', async (req, res) => {
    const key = `${req.ip}|${String(req.body?.email || '').toLowerCase()}`;
    if (limiter.isBlocked(key)) return res.status(429).json({ message: 'Too many failed attempts. Try again in 15 minutes.' });
    try {
      const { user, token, expiresAt } = await service.login(req.body || {});
      limiter.reset(key);
      res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: 'lax', secure: secureCookies, path: '/', expires: expiresAt });
      res.json({ message: 'Login successful.', user });
    } catch (error) {
      if (error.status === 401) limiter.fail(key);
      throw error;
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    await service.logout(req.sessionToken);
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ message: 'Logged out.' });
  });

  app.get('/api/auth/me', requireLogin, (req, res) => res.json({ user: req.user }));

  // ----- Public catalogue: approved books only -----
  app.get('/api/books', async (req, res) => res.json(await service.listPublic(req.query)));

  // ----- Personal catalogue (users see their own books; admins see all) -----
  app.get('/api/my/books', requireLogin, async (req, res) => res.json(await service.listMine(req.user, req.query)));

  app.get('/api/books/:id', async (req, res) => res.json(await service.getBook(req.user, req.params.id)));

  app.post('/api/books', requireLogin, upload.single('file'), async (req, res) => {
    const book = await service.createBook(req.user, req.body || {}, req.file || null);
    res.status(201).json({
      message: book.status === 'approved' ? 'Book added to the library.' : 'Book submitted. It will appear publicly after an administrator approves it.',
      book,
    });
  });

  app.patch('/api/books/:id', requireLogin, async (req, res) => {
    const book = await service.updateBook(req.user, req.params.id, req.body || {});
    const waiting = req.user.role !== 'admin' && (book.status === 'pending' || book.revision?.status === 'pending');
    res.json({
      message: book.revision?.status === 'pending' ? 'Changes sent for review. The approved version stays public until then.'
        : waiting ? 'Book updated and sent for review.' : 'Book updated.',
      book,
    });
  });

  app.post('/api/books/:id/resubmit', requireLogin, async (req, res) => {
    res.json({ message: 'Book sent for review again.', book: await service.resubmitBook(req.user, req.params.id) });
  });

  // Throws away the owner's unapproved edit of a public book.
  app.delete('/api/books/:id/revision', requireLogin, async (req, res) => {
    res.json({ message: 'Your unapproved changes were discarded.', book: await service.discardRevision(req.user, req.params.id) });
  });

  app.delete('/api/books/:id', requireLogin, async (req, res) => {
    await service.deleteBook(req.user, req.params.id);
    res.json({ message: 'Book deleted.' });
  });

  // ----- Notifications (approval / rejection results for the book's owner) -----
  app.get('/api/notifications', requireLogin, async (req, res) => res.json(await service.listNotifications(req.user)));

  app.post('/api/notifications/read', requireLogin, async (req, res) => {
    await service.markNotificationsRead(req.user);
    res.json({ message: 'All notifications marked as read.' });
  });

  // ----- Admin review -----
  app.get('/api/admin/books/pending', requireAdmin, async (req, res) => res.json(await service.listPending(req.user)));

  app.patch('/api/admin/books/:id/approve', requireAdmin, async (req, res) => {
    res.json({ message: 'Book approved. It is now public.', book: await service.approveBook(req.user, req.params.id) });
  });

  app.patch('/api/admin/books/:id/reject', requireAdmin, async (req, res) => {
    res.json({ message: 'Book rejected.', book: await service.rejectBook(req.user, req.params.id, req.body || {}) });
  });

  app.get('/api/admin/audit-logs', requireAdmin, async (req, res) => res.json(await service.listAudit(req.user, req.query)));

  // ----- Uploaded files: public only when the book is approved -----
  app.get('/uploads/:filename', async (req, res) => {
    const filename = await service.authorizeFile(req.user, req.params.filename);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'private, no-store');
    res.sendFile(filename, { root: uploadsPath, dotfiles: 'deny' }, (error) => {
      if (error && !res.headersSent) res.status(404).json({ message: 'File not found.' });
    });
  });

  app.use(handleUploadError);

  app.use((req, res) => res.status(404).json({ message: 'Route not found.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    if (error instanceof HttpError) return res.status(error.status).json({ message: error.message, ...error.details });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'The request body is not valid JSON.' });
    console.error(error);
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  });

  return app;
}

async function main() {
  const store = createMongoStore(await connectDB());
  await store.init();
  const port = process.env.PORT || 5050;
  createApp({ store }).listen(port, () => console.log(`BookStore server is running at http://localhost:${port}`));
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Could not start the server. Is MongoDB running? Check Server/.env.\n', error.message);
    process.exitCode = 1;
  });
}

module.exports = { createApp };
