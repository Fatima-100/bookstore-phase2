// Runs the eight required demonstration cases (plus extra security checks) against the
// service layer with an in-memory store, so no MongoDB is needed: npm test
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createService } = require('../src/service');
const { createMemoryStore } = require('../src/store/memory');
const { hashPassword, newId } = require('../src/auth');

let store, service, saved, removed, admin, userA, userB;

const pdf = (name = 'book.pdf') => ({ originalname: name, buffer: Buffer.from('%PDF-1.4 sample') });
const bookInput = (extra = {}) => ({
  title: 'Book X', author: 'Author', category: 'Testing', description: 'A test book',
  bookType: 'PDF', fileUrl: 'https://example.com/book-x.pdf', ...extra,
});
const rejects = (promise, status) => assert.rejects(promise, (error) => error.status === status);

async function signUp(name) {
  const body = { name, email: name.toLowerCase().replace(' ', '') + '@example.com', password: 'password123', confirmPassword: 'password123' };
  await service.register(body);
  const { user } = await service.login(body);
  return user;
}

beforeEach(async () => {
  store = createMemoryStore();
  saved = [];
  removed = [];
  service = createService({ store, files: { save: async (_buffer, name) => saved.push(name), remove: async (name) => removed.push(name) } });
  const record = { id: newId(), name: 'Admin', email: 'admin@example.com', passwordHash: hashPassword('adminpass1'), role: 'admin', createdAt: new Date().toISOString() };
  await store.insertUser(record);
  admin = { id: record.id, name: 'Admin', role: 'admin' };
  userA = await signUp('User A');
  userB = await signUp('User B');
});

test('1. User A registers, logs in, and submits Book X -> pending in User A catalogue', async () => {
  const book = await service.createBook(userA, bookInput());
  assert.equal(book.status, 'pending');
  assert.equal(book.uploadedBy, userA.id);
  const mine = await service.listMine(userA);
  assert.deepEqual(mine.books.map((entry) => entry.id), [book.id]);
  assert.equal((await service.listMine(userB)).total, 0);
});

test('2. A guest browsing the public catalogue does not see Book X', async () => {
  await service.createBook(userA, bookInput());
  const result = await service.listPublic({});
  assert.equal(result.total, 0);
  assert.equal(result.books.length, 0);
});

test('3. User B cannot modify or delete User A\'s Book X (403/404)', async () => {
  const book = await service.createBook(userA, bookInput());
  await rejects(service.updateBook(userB, book.id, { title: 'Hacked' }), 404);
  await rejects(service.deleteBook(userB, book.id), 404);
  await service.approveBook(admin, book.id);
  await rejects(service.updateBook(userB, book.id, { title: 'Hacked' }), 403); // public book: 403
  await rejects(service.deleteBook(userB, book.id), 403);
  assert.equal((await store.findBookById(book.id)).title, 'Book X');
});

test('4. A normal user calling an admin endpoint is denied (403)', async () => {
  const book = await service.createBook(userA, bookInput());
  await rejects(service.approveBook(userA, book.id), 403);
  await rejects(service.rejectBook(userA, book.id, { reason: 'because' }), 403);
  await rejects(service.listPending(userA), 403);
  await rejects(service.listPending(null), 401);
});

test('5. Admin approves Book X -> publicly visible', async () => {
  const book = await service.createBook(userA, bookInput());
  const pending = await service.listPending(admin);
  assert.equal(pending[0].owner.email, 'usera@example.com');
  assert.equal((await service.approveBook(admin, book.id)).status, 'approved');
  const result = await service.listPublic({});
  assert.deepEqual(result.books.map((entry) => entry.id), [book.id]);
  assert.equal(result.books[0].uploadedBy, undefined); // owner id is not public
  assert.equal((await service.getBook(null, book.id)).title, 'Book X');
});

test('6. User A edits approved Book X -> the approved version stays public; the edit waits for review', async () => {
  const book = await service.createBook(userA, bookInput());
  await service.approveBook(admin, book.id);
  const edited = await service.updateBook(userA, book.id, { title: 'Book X, 2nd edition' });
  assert.equal(edited.status, 'approved');
  assert.equal(edited.title, 'Book X'); // live version untouched
  assert.equal(edited.revision.status, 'pending');
  assert.equal(edited.revision.changes.title, 'Book X, 2nd edition');
  const publicList = await service.listPublic({});
  assert.equal(publicList.total, 1);
  assert.equal(publicList.books[0].title, 'Book X'); // the public still sees the approved version
  const pending = await service.listPending(admin);
  assert.deepEqual(pending.map((entry) => [entry.id, entry.kind]), [[book.id, 'revision']]);
});

test('7. Admin rejects a book -> owner sees the reason, revises, and it is pending again', async () => {
  const book = await service.createBook(userA, bookInput());
  await rejects(service.rejectBook(admin, book.id, {}), 400); // a reason is mandatory
  await service.rejectBook(admin, book.id, { reason: 'Cover page is missing' });
  const { books: [mine] } = await service.listMine(userA);
  assert.equal(mine.status, 'rejected');
  assert.equal(mine.rejectionReason, 'Cover page is missing');
  assert.equal((await service.listPublic({})).total, 0);
  const revised = await service.updateBook(userA, book.id, { description: 'Now with a cover page' });
  assert.equal(revised.status, 'pending');
  assert.equal(revised.rejectionReason, null);
  await service.rejectBook(admin, book.id, { reason: 'Still wrong' });
  assert.equal((await service.resubmitBook(userA, book.id)).status, 'pending');
});

test('8. User A deletes their own book -> permanently removed (and its uploaded file too)', async () => {
  const uploaded = await service.createBook(userA, { title: 'Upload', author: 'A', category: 'C', bookType: 'PDF' }, pdf());
  assert.equal(saved.length, 1);
  await service.deleteBook(userA, uploaded.id);
  assert.equal(await store.findBookById(uploaded.id), null);
  assert.deepEqual(removed, saved);
  assert.equal((await service.listMine(userA)).total, 0);
});

// ----- Security rules from section 8 of the assignment -----

test('client-sent owner, status, role, and approval fields are ignored', async () => {
  const book = await service.createBook(userA, bookInput({ uploadedBy: userB.id, status: 'approved', rejectionReason: 'x' }));
  assert.equal(book.uploadedBy, userA.id);
  assert.equal(book.status, 'pending');
  const user = await service.register({ name: 'Eve Hacker', email: 'eve@example.com', password: 'password123', confirmPassword: 'password123', role: 'admin' });
  assert.equal(user.role, 'user');
  const edited = await service.updateBook(userA, book.id, { title: 'New', status: 'approved', uploadedBy: userB.id });
  assert.equal(edited.status, 'pending');
  assert.equal(edited.uploadedBy, userA.id);
});

test('registration and login validation, hashing, and sessions', async () => {
  const ok = { name: 'Sara', email: 'sara@example.com', password: 'password123', confirmPassword: 'password123' };
  await rejects(service.register({ ...ok, confirmPassword: 'different1' }), 400);
  await rejects(service.register({ ...ok, password: 'short', confirmPassword: 'short' }), 400);
  await rejects(service.register({ ...ok, email: 'not-an-email' }), 400);
  await rejects(service.register({ ...ok, email: { $ne: '' } }), 400);
  await service.register(ok);
  await rejects(service.register({ ...ok, email: ' SARA@example.com ' }), 409); // duplicates ignore case
  const stored = await store.findUserByEmail('sara@example.com');
  assert.ok(stored.passwordHash.startsWith('scrypt$') && !stored.passwordHash.includes('password123'));
  await rejects(service.login({ email: 'sara@example.com', password: 'wrong-password' }), 401);
  await rejects(service.login({ email: 'nobody@example.com', password: 'password123' }), 401);
  const { token, user } = await service.login(ok);
  assert.equal(user.passwordHash, undefined);
  assert.equal((await service.authenticate(token)).email, 'sara@example.com');
  await service.logout(token);
  assert.equal(await service.authenticate(token), null);
});

test('expired sessions are rejected', async () => {
  let clock = new Date('2026-01-01T00:00:00Z');
  const timed = createService({ store, files: {}, now: () => clock });
  const { token } = await timed.login({ email: 'usera@example.com', password: 'password123' });
  assert.ok(await timed.authenticate(token));
  clock = new Date('2026-01-02T00:00:00Z');
  assert.equal(await timed.authenticate(token), null);
});

test('uploaded files are only downloadable after approval (owner and admin can always fetch)', async () => {
  const book = await service.createBook(userA, { title: 'Upload', author: 'A', category: 'C', bookType: 'PDF' }, pdf());
  const name = saved[0];
  await rejects(service.authorizeFile(null, name), 404);
  await rejects(service.authorizeFile(userB, name), 404);
  assert.equal(await service.authorizeFile(userA, name), name);
  assert.equal(await service.authorizeFile(admin, name), name);
  await service.approveBook(admin, book.id);
  assert.equal(await service.authorizeFile(null, name), name);
  await rejects(service.authorizeFile(null, '../../etc/passwd'), 404);
});

test('file and link validation', async () => {
  await rejects(service.createBook(userA, { title: 'Bad', author: 'A', category: 'C', bookType: 'PDF' }, { originalname: 'fake.pdf', buffer: Buffer.from('not a pdf') }), 400);
  await rejects(service.createBook(userA, bookInput({ fileUrl: 'javascript:alert(1)' })), 400);
  await rejects(service.createBook(userA, bookInput({ fileUrl: 'https://example.com/book.exe' })), 400);
  await rejects(service.createBook(userA, bookInput({ title: '' })), 400);
  await rejects(service.createBook(userA, bookInput({ title: { $gt: '' } })), 400);
  await rejects(service.createBook(userA, bookInput({ bookType: 'VIDEO' })), 400);
  await rejects(service.createBook(null, bookInput()), 401);
  await rejects(service.createBook(userA, { title: 'T', author: 'A', category: 'C', bookType: 'PDF' }), 400); // no file or link
});

test('admin sees and manages every book; admin uploads need no review', async () => {
  const book = await service.createBook(userA, bookInput());
  assert.equal((await service.listMine(admin)).total, 1);
  assert.equal((await service.updateBook(admin, book.id, { title: 'Fixed typo' })).status, 'pending');
  const adminBook = await service.createBook(admin, bookInput({ title: 'Admin pick' }));
  assert.equal(adminBook.status, 'approved');
  await service.deleteBook(admin, book.id);
  assert.equal(await store.findBookById(book.id), null);
});

// ----- Optional extensions -----

test('revision history: approving applies the edit, rejecting or discarding keeps the live version', async () => {
  const book = await service.createBook(userA, bookInput());
  await service.approveBook(admin, book.id);

  await service.updateBook(userA, book.id, { title: 'Second title' });
  const approved = await service.approveBook(admin, book.id);
  assert.equal(approved.title, 'Second title');
  assert.equal(approved.revision, null);
  assert.equal((await service.listPending(admin)).length, 0);

  await service.updateBook(userA, book.id, { title: 'Third title' });
  await service.updateBook(userA, book.id, { description: 'New description' }); // merged into the same revision
  const rejected = await service.rejectBook(admin, book.id, { reason: 'Not accurate' });
  assert.equal(rejected.status, 'approved');
  assert.equal(rejected.title, 'Second title');
  assert.equal(rejected.revision.status, 'rejected');
  assert.equal(rejected.revision.rejectionReason, 'Not accurate');
  assert.equal((await service.listPublic({})).books[0].title, 'Second title');
  assert.equal((await service.listPending(admin)).length, 0);

  const resubmitted = await service.resubmitBook(userA, book.id);
  assert.equal(resubmitted.revision.status, 'pending');
  assert.equal((await service.listPending(admin)).length, 1);

  const discarded = await service.discardRevision(userA, book.id);
  assert.equal(discarded.revision, null);
  assert.equal((await service.listPending(admin)).length, 0);
  await rejects(service.discardRevision(userA, book.id), 409);
  await rejects(service.discardRevision(userB, book.id), 403);

  // Changing a value back to the live one withdraws the revision.
  await service.updateBook(userA, book.id, { title: 'Temporary' });
  assert.equal((await service.updateBook(userA, book.id, { title: 'Second title' })).revision, null);
});

test('notifications: the owner is told about approvals and rejections (and only the owner)', async () => {
  const one = await service.createBook(userA, bookInput({ title: 'First' }));
  const two = await service.createBook(userA, bookInput({ title: 'Second' }));
  await service.approveBook(admin, one.id);
  await service.rejectBook(admin, two.id, { reason: 'Bad scan' });
  const { notifications, unread } = await service.listNotifications(userA);
  assert.equal(unread, 2);
  assert.deepEqual(notifications.map((entry) => entry.type).sort(), ['approved', 'rejected']);
  assert.ok(notifications.find((entry) => entry.type === 'rejected').message.includes('Bad scan'));
  assert.equal((await service.listNotifications(userB)).notifications.length, 0);
  await service.markNotificationsRead(userA);
  assert.equal((await service.listNotifications(userA)).unread, 0);
  await rejects(service.listNotifications(null), 401);

  await service.updateBook(userA, one.id, { title: 'First, revised' });
  await service.approveBook(admin, one.id);
  assert.equal((await service.listNotifications(userA)).notifications[0].type, 'revision_approved');
});

test('audit log: records actions, is admin-only, and is paginated', async () => {
  const book = await service.createBook(userA, bookInput());
  await service.approveBook(admin, book.id);
  await service.deleteBook(userA, book.id);
  await rejects(service.login({ email: 'usera@example.com', password: 'wrong-password' }), 401);
  const log = await service.listAudit(admin, {});
  const actions = log.entries.map((entry) => entry.action);
  for (const action of ['user.register', 'auth.login', 'auth.login_failed', 'book.create', 'book.approve', 'book.delete']) {
    assert.ok(actions.includes(action), action);
  }
  assert.ok(!JSON.stringify(log).includes('password123')); // no secrets in the log
  assert.equal((await service.listAudit(admin, { limit: '2' })).entries.length, 2);
  await rejects(service.listAudit(userA, {}), 403);
  await rejects(service.listAudit(null, {}), 401);
});

test('My Catalogue: 50 per page by default, status filter, search, and counts', async () => {
  for (let index = 1; index <= 55; index++) await service.createBook(userA, bookInput({ title: `Title ${index}`, author: index === 7 ? 'Zed Writer' : 'Author' }));
  const first = await service.listMine(userA, {});
  assert.equal(first.books.length, 50);
  assert.equal(first.limit, 50);
  assert.equal(first.total, 55);
  assert.equal(first.hasMore, true);
  assert.equal((await service.listMine(userA, { page: '2' })).books.length, 5);

  const [target] = (await service.listMine(userA, { search: 'zed' })).books;
  assert.equal(target.author, 'Zed Writer');
  await service.approveBook(admin, target.id);
  const approved = await service.listMine(userA, { status: 'approved' });
  assert.deepEqual(approved.books.map((entry) => entry.id), [target.id]);
  assert.deepEqual(approved.counts, { all: 55, pending: 54, approved: 1, rejected: 0 });
  assert.equal((await service.listMine(userA, { status: 'pending', search: 'title 5' })).total, 7); // 5, 50-55 minus none approved
  assert.equal((await service.listMine(userB, {})).total, 0);
  await rejects(service.listMine(userA, { status: 'bogus' }), 400);
  await rejects(service.listMine(userA, { limit: '101' }), 400);
  await rejects(service.listMine(userA, { search: { $ne: '' } }), 400);
});
