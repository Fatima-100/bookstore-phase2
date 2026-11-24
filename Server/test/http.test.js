// Runs the real Express app (with an in-memory store) and checks cookies, 401/403 and file access
// over HTTP. Needs the dependencies installed: yarn install / npm install, then npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createApp } = require('../server');
const { createMemoryStore } = require('../src/store/memory');
const { hashPassword, newId } = require('../src/auth');

test('authentication, authorization, and approval over HTTP', async (t) => {
  const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'bookstore-'));
  const store = createMemoryStore();
  await store.insertUser({ id: newId(), name: 'Admin', email: 'admin@example.com', passwordHash: hashPassword('adminpass1'), role: 'admin', createdAt: new Date().toISOString() });
  const server = createApp({ store, uploadsPath: uploads }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); fs.rmSync(uploads, { recursive: true, force: true }); });

  function session() {
    let cookie = '';
    return async (method, route, body) => {
      const isForm = body instanceof FormData;
      const response = await fetch(base + route, {
        method,
        headers: { ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
        body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
      });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      const text = await response.text();
      let data = {};
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      return { status: response.status, data, response };
    };
  }
  const [guest, a, b, admin] = [session(), session(), session(), session()];

  assert.equal((await guest('GET', '/api/my/books')).status, 401);
  assert.equal((await guest('POST', '/api/books', { title: 'x' })).status, 401);

  const ada = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'password123', confirmPassword: 'password123', role: 'admin' };
  const registered = await a('POST', '/api/auth/register', ada);
  assert.equal(registered.status, 201);
  assert.equal(registered.data.user.role, 'user');
  assert.equal(registered.data.user.passwordHash, undefined);
  await b('POST', '/api/auth/register', { ...ada, name: 'Bob Builder', email: 'bob@example.com' });
  const login = await a('POST', '/api/auth/login', ada);
  assert.equal(login.status, 200);
  assert.match(login.response.headers.get('set-cookie'), /HttpOnly/i);
  assert.equal((await a('GET', '/api/auth/me')).data.user.email, 'ada@example.com');
  await b('POST', '/api/auth/login', { ...ada, email: 'bob@example.com' });
  assert.equal((await admin('POST', '/api/auth/login', { email: 'admin@example.com', password: 'adminpass1' })).status, 200);

  // Upload a real PDF through multipart.
  const form = new FormData();
  Object.entries({ title: 'Book X', author: 'Ada', category: 'Demo', bookType: 'PDF', status: 'approved' }).forEach(([k, v]) => form.append(k, v));
  form.append('file', new Blob(['%PDF-1.4 demo']), 'book.pdf');
  const created = await a('POST', '/api/books', form);
  assert.equal(created.status, 201);
  assert.equal(created.data.book.status, 'pending'); // the client-sent "approved" is ignored
  const { id, fileUrl } = created.data.book;

  assert.equal((await guest('GET', '/api/books')).data.total, 0);
  assert.equal((await guest('GET', fileUrl)).status, 404);   // unapproved file is not public
  assert.equal((await b('GET', fileUrl)).status, 404);
  assert.equal((await a('GET', fileUrl)).status, 200);       // the owner can read it
  assert.ok([403, 404].includes((await b('PATCH', '/api/books/' + id, { title: 'x' })).status));
  assert.equal((await a('PATCH', `/api/admin/books/${id}/approve`)).status, 403);
  assert.equal((await guest('GET', '/api/admin/books/pending')).status, 401);

  assert.equal((await admin('GET', '/api/admin/books/pending')).data.length, 1);
  assert.equal((await admin('PATCH', `/api/admin/books/${id}/approve`)).status, 200);
  assert.equal((await guest('GET', '/api/books')).data.total, 1);
  assert.equal((await guest('GET', fileUrl)).status, 200);
  // Editing a public book creates a revision; the approved version stays public meanwhile.
  const revised = await a('PATCH', '/api/books/' + id, { title: 'Book X v2' });
  assert.equal(revised.data.book.revision.status, 'pending');
  assert.equal((await guest('GET', '/api/books')).data.books[0].title, 'Book X');
  assert.equal((await guest('GET', fileUrl)).status, 200);
  assert.equal((await admin('GET', '/api/admin/books/pending')).data[0].kind, 'revision');
  assert.equal((await admin('PATCH', `/api/admin/books/${id}/reject`, { reason: 'Keep the old title' })).status, 200);
  assert.equal((await guest('GET', '/api/books')).data.books[0].title, 'Book X');

  // Notifications and audit log.
  const notes = await a('GET', '/api/notifications');
  assert.equal(notes.data.unread, 2);
  assert.equal((await a('POST', '/api/notifications/read')).status, 200);
  assert.equal((await a('GET', '/api/notifications')).data.unread, 0);
  assert.equal((await a('GET', '/api/admin/audit-logs')).status, 403);
  assert.ok((await admin('GET', '/api/admin/audit-logs')).data.entries.length > 0);
  assert.equal((await a('GET', '/api/my/books?status=approved&search=book')).data.total, 1);

  assert.equal((await a('POST', '/api/auth/logout')).status, 200);
  assert.equal((await a('GET', '/api/my/books')).status, 401);
  assert.equal((await b('DELETE', '/api/books/' + id)).status, 404);
});
