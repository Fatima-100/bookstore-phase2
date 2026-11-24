// All business rules live here: who may do what, and how a book moves between statuses.
// The Express routes only translate HTTP into calls to this file.
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { HttpError } = require('./errors');
const { hashPassword, verifyPassword, burnPasswordCheck, newSessionToken, hashToken, newId, publicUser } = require('./auth');
const { BOOK_TYPES, matchesFormat } = require('./fileChecks');
const { validateBookFields, validateFileUrl, validateBookType, cleanText } = require('./validation');

const SESSION_HOURS = 8;
const COLORS = { PDF: 'sand', UNICODE: 'sage', AUDIO: 'plum' };
const STORED_FILE = /^[a-f0-9-]+\.(?:pdf|txt|mp3|wav|ogg|m4a)$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATUSES = ['pending', 'approved', 'rejected'];

// What a guest may see: no owner, no review notes, no server file name.
function publicBook(book) {
  const { id, title, subtitle, author, category, description, bookType, color, fileUrl, createdAt } = book;
  return { id, title, subtitle, author, category, description, bookType, color, fileUrl, createdAt };
}

// What the owner or an admin may see.
function privateBook(book) {
  const { fileName, ...rest } = book; // eslint-disable-line no-unused-vars
  return rest;
}

function createService({ store, files, now = () => new Date() }) {
  const isAdmin = (user) => user?.role === 'admin';
  const canManage = (user, book) => isAdmin(user) || book.uploadedBy === user.id;

  // Audit entries and notifications are best-effort: a failure here must never break the real action.
  async function audit(actor, action, targetId = null, details = '') {
    try {
      await store.insertAudit({
        id: newId(), at: now().toISOString(), actorId: actor?.id || null, actorEmail: actor?.email || null,
        action, targetId, details: String(details).slice(0, 300),
      });
    } catch (error) {
      console.error('Audit log failed:', error.message);
    }
  }

  async function notify(reviewer, book, type, message) {
    if (book.uploadedBy === reviewer.id) return; // an admin reviewing their own book needs no notification
    try {
      await store.insertNotification({ id: newId(), userId: book.uploadedBy, type, bookId: book.id, message, createdAt: now().toISOString(), readAt: null });
    } catch (error) {
      console.error('Notification failed:', error.message);
    }
  }

  // Shared by the public list and My Catalogue.
  function readPaging({ page = '1', limit }, defaultLimit) {
    const pageText = page;
    const limitText = limit === undefined ? String(defaultLimit) : limit;
    const pageNumber = Number(pageText);
    const pageSize = Number(limitText);
    if (typeof pageText !== 'string' || typeof limitText !== 'string' ||
        !/^\d+$/.test(pageText) || !Number.isSafeInteger(pageNumber) || pageNumber < 1 ||
        !/^\d+$/.test(limitText) || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 ||
        !Number.isSafeInteger((pageNumber - 1) * pageSize)) {
      throw new HttpError(400, 'page must be a positive integer; limit must be from 1 to 100.');
    }
    return { pageNumber, pageSize, start: (pageNumber - 1) * pageSize };
  }

  const pageInfo = (total, pageNumber, pageSize, start) => ({
    page: pageNumber, limit: pageSize, total, totalPages: Math.ceil(total / pageSize), hasMore: start + pageSize < total,
  });
  const matchesSearch = (book, text) => !text || [book.title, book.subtitle, book.author, book.category].join(' ').toLocaleLowerCase().includes(text);

  function assertSignedIn(user) {
    if (!user) throw new HttpError(401, 'Please log in first.');
  }
  function assertAdmin(user) {
    assertSignedIn(user);
    if (!isAdmin(user)) throw new HttpError(403, 'Only an administrator can do this.');
  }

  // Others' pending/rejected books are reported as "not found" so their existence is not revealed.
  async function loadManageable(user, id) {
    assertSignedIn(user);
    const book = typeof id === 'string' ? await store.findBookById(id) : null;
    if (!book) throw new HttpError(404, 'Book not found.');
    if (!canManage(user, book)) {
      throw book.status === 'approved'
        ? new HttpError(403, 'You can only change your own books.')
        : new HttpError(404, 'Book not found.');
    }
    return book;
  }

  // ---------- Task A: accounts and sessions ----------

  async function register(body = {}) {
    const errors = {};
    const name = cleanText(body.name);
    const email = cleanText(body.email)?.toLowerCase();
    if (!name || name.length < 2 || name.length > 100) errors.name = 'Name must be 2 to 100 characters.';
    if (!email || email.length > 254 || !EMAIL.test(email)) errors.email = 'Enter a valid e-mail address.';
    if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) {
      errors.password = 'Password must be 8 to 128 characters.';
    } else if (body.password !== body.confirmPassword) {
      errors.confirmPassword = 'The two passwords do not match.';
    }
    if (Object.keys(errors).length) throw new HttpError(400, Object.values(errors)[0], { errors });

    // The role is always "user". A "role" sent by the browser is ignored.
    const user = { id: newId(), name, email, passwordHash: hashPassword(body.password), role: 'user', createdAt: now().toISOString() };
    try {
      await store.insertUser(user);
    } catch (error) {
      if (error.code === 'DUPLICATE_EMAIL') throw new HttpError(409, 'That e-mail is already registered.');
      throw error;
    }
    await audit(user, 'user.register', user.id);
    return publicUser(user);
  }

  async function login(body = {}) {
    const email = cleanText(body.email)?.toLowerCase();
    if (!email || typeof body.password !== 'string' || !body.password) {
      throw new HttpError(400, 'E-mail and password are required.');
    }
    const user = await store.findUserByEmail(email);
    if (!user) burnPasswordCheck(body.password);
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      await audit({ email }, 'auth.login_failed', user?.id || null, 'invalid credentials');
      throw new HttpError(401, 'Invalid e-mail or password.');
    }
    const token = newSessionToken();
    const expiresAt = new Date(now().getTime() + SESSION_HOURS * 3600 * 1000);
    await store.insertSession({ tokenHash: hashToken(token), userId: user.id, expiresAt });
    await audit(user, 'auth.login', user.id);
    return { user: publicUser(user), token, expiresAt };
  }

  async function logout(token) {
    if (token) await store.deleteSession(hashToken(token));
  }

  async function authenticate(token) {
    if (!token) return null;
    const hash = hashToken(token);
    const session = await store.findSession(hash);
    if (!session) return null;
    if (new Date(session.expiresAt) <= now()) {
      await store.deleteSession(hash);
      return null;
    }
    const user = await store.findUserById(session.userId);
    return user ? publicUser(user) : null;
  }

  // ---------- Public catalogue (approved books only) ----------

  async function listPublic(query = {}) {
    const { bookType = 'ALL', search = '', category = '' } = query;
    if (![bookType, search, category].every((value) => typeof value === 'string')) {
      throw new HttpError(400, 'Each query parameter must be a single text value.');
    }
    const type = bookType.trim().toUpperCase();
    if (!['ALL', ...BOOK_TYPES].includes(type)) {
      throw new HttpError(400, 'Invalid bookType. Use ALL, PDF, UNICODE, or AUDIO.');
    }
    const { pageNumber, pageSize, start } = readPaging(query, 10);

    // The filter { status: 'approved' } is the rule that keeps pending and rejected books private.
    const approved = await store.findBooks({ status: 'approved' });
    const text = search.trim().toLocaleLowerCase();
    const wantedCategory = category.trim().toLocaleLowerCase();
    const searched = approved.filter((book) =>
      [book.title, book.subtitle, book.author].join(' ').toLocaleLowerCase().includes(text) &&
      (!wantedCategory || String(book.category).toLocaleLowerCase() === wantedCategory));
    const filtered = type === 'ALL' ? searched : searched.filter((book) => book.bookType === type);
    const counts = { ALL: searched.length, PDF: 0, UNICODE: 0, AUDIO: 0 };
    searched.forEach((book) => { if (book.bookType in counts) counts[book.bookType]++; });

    return {
      books: filtered.slice(start, start + pageSize).map(publicBook),
      ...pageInfo(filtered.length, pageNumber, pageSize, start),
      counts,
    };
  }

  async function getBook(user, id) {
    const book = typeof id === 'string' ? await store.findBookById(id) : null;
    if (book?.status === 'approved' && !(user && canManage(user, book))) return publicBook(book);
    if (book && user && canManage(user, book)) return privateBook(book);
    throw new HttpError(404, 'Book not found.');
  }

  // Serves /uploads/<file>: approved books are public; otherwise only the owner or an admin.
  async function authorizeFile(user, filename) {
    const [book] = STORED_FILE.test(filename) ? await store.findBooks({ fileName: filename }) : [];
    if (book && (book.status === 'approved' || (user && canManage(user, book)))) return filename;
    throw new HttpError(404, 'File not found.');
  }

  // ---------- Task B: personal catalogue ----------

  // Users see their own books; admins see every book. 50 per page by default, with search and a status filter.
  async function listMine(user, query = {}) {
    assertSignedIn(user);
    const { status = '', search = '' } = query;
    if (typeof status !== 'string' || typeof search !== 'string') throw new HttpError(400, 'Each query parameter must be a single text value.');
    if (status && !STATUSES.includes(status)) throw new HttpError(400, 'status must be pending, approved, or rejected.');
    const { pageNumber, pageSize, start } = readPaging(query, 50);

    const text = search.trim().toLocaleLowerCase();
    const owned = await store.findBooks(isAdmin(user) ? {} : { uploadedBy: user.id });
    const searched = owned.filter((book) => matchesSearch(book, text));
    const counts = { all: searched.length, pending: 0, approved: 0, rejected: 0 };
    searched.forEach((book) => { counts[book.status] += 1; });
    const filtered = status ? searched.filter((book) => book.status === status) : searched;

    return {
      books: filtered.slice(start, start + pageSize).map(privateBook),
      ...pageInfo(filtered.length, pageNumber, pageSize, start),
      counts,
    };
  }

  async function createBook(user, body = {}, file = null) {
    assertSignedIn(user);
    const { values, errors } = validateBookFields(body);
    const bookType = validateBookType(body.bookType);
    if (!bookType) errors.bookType = 'Choose PDF, UNICODE, or AUDIO.';

    let fileUrl;
    let fileName;
    if (bookType) {
      const hasLink = body.fileUrl !== undefined && body.fileUrl !== '';
      if (file && hasLink) errors.file = 'Send either a file or a file link, not both.';
      else if (file) {
        if (!matchesFormat(file, bookType)) errors.file = `Choose a valid ${bookType} file.`;
      } else if (hasLink) {
        const result = validateFileUrl(body.fileUrl, bookType);
        if (result.error) errors.fileUrl = result.error;
        else fileUrl = result.value;
      } else errors.file = 'Upload a file or enter a file link.';
    }
    if (Object.keys(errors).length) throw new HttpError(400, Object.values(errors)[0], { errors });

    const id = randomUUID();
    if (file) {
      fileName = id + path.extname(file.originalname).toLowerCase();
      fileUrl = '/uploads/' + fileName;
      await files.save(file.buffer, fileName);
    }

    const timestamp = now().toISOString();
    const book = {
      subtitle: '', description: '', ...values,
      id, bookType, color: COLORS[bookType], fileUrl,
      ...(fileName ? { fileName } : {}),
      // The owner and status come from the server, never from the request body.
      uploadedBy: user.id,
      status: isAdmin(user) ? 'approved' : 'pending',
      rejectionReason: null,
      revision: null, // edits to a public book wait here until an admin approves them
      hasPendingRevision: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    try {
      await store.insertBook(book);
    } catch (error) {
      if (fileName) await files.remove(fileName);
      throw error;
    }
    await audit(user, 'book.create', book.id, `${book.title} (${book.status})`);
    return privateBook(book);
  }

  async function updateBook(user, id, body = {}) {
    const book = await loadManageable(user, id);
    const { values, errors } = validateBookFields(body, { partial: true });

    if (body.fileUrl !== undefined) {
      if (book.fileName) errors.fileUrl = 'The file of an uploaded book cannot be replaced. Delete the book and submit it again.';
      else {
        const result = validateFileUrl(body.fileUrl, book.bookType);
        if (result.error) errors.fileUrl = result.error;
        else values.fileUrl = result.value;
      }
    }
    if (Object.keys(errors).length) throw new HttpError(400, Object.values(errors)[0], { errors });

    // An owner's edit to a PUBLIC book is stored as a revision. The approved version stays visible until
    // an admin approves the revision (then it replaces the live fields) or rejects it (it is discarded).
    if (!isAdmin(user) && book.status === 'approved') {
      if (!Object.keys(values).length) throw new HttpError(400, 'Send at least one field to change.');
      const proposed = { ...(book.revision?.changes || {}), ...values };
      const changes = Object.fromEntries(Object.entries(proposed).filter(([field, value]) => book[field] !== value));
      const same = JSON.stringify(changes) === JSON.stringify(book.revision?.changes || {});
      if (same && (book.revision?.status === 'pending' || !Object.keys(changes).length)) return privateBook(book);
      const timestamp = now().toISOString();
      const revision = Object.keys(changes).length ? { changes, status: 'pending', rejectionReason: null, submittedAt: timestamp } : null;
      const saved = await store.updateBook(book.id, { revision, hasPendingRevision: Boolean(revision), updatedAt: timestamp });
      await audit(user, 'book.revise', book.id, Object.keys(changes).join(', ') || 'changes withdrawn');
      return privateBook(saved);
    }

    const changed = Object.fromEntries(Object.entries(values).filter(([field, value]) => book[field] !== value));
    if (!Object.keys(changed).length) {
      if (!Object.keys(values).length) throw new HttpError(400, 'Send at least one field to change.');
      return privateBook(book);
    }

    // A normal user's edit sends an approved or rejected book back to the admin for review.
    if (!isAdmin(user) && book.status !== 'pending') {
      changed.status = 'pending';
      changed.rejectionReason = null;
      changed.reviewedBy = null;
      changed.reviewedAt = null;
    }
    changed.updatedAt = now().toISOString();
    const saved = await store.updateBook(book.id, changed);
    await audit(user, 'book.update', book.id, Object.keys(changed).filter((field) => field !== 'updatedAt').join(', '));
    return privateBook(saved);
  }

  // Sends a rejected book (or a rejected revision of a public book) back for review without changing it.
  async function resubmitBook(user, id) {
    const book = await loadManageable(user, id);
    const timestamp = now().toISOString();
    let saved;
    if (book.status === 'rejected') {
      saved = await store.updateBook(book.id, { status: 'pending', rejectionReason: null, reviewedBy: null, reviewedAt: null, updatedAt: timestamp });
    } else if (book.revision?.status === 'rejected') {
      saved = await store.updateBook(book.id, { revision: { ...book.revision, status: 'pending', rejectionReason: null, submittedAt: timestamp }, hasPendingRevision: true, updatedAt: timestamp });
    } else {
      throw new HttpError(409, 'Only a rejected book or rejected changes can be resubmitted.');
    }
    await audit(user, 'book.resubmit', book.id);
    return privateBook(saved);
  }

  // Throws away the owner's edit; the approved version is untouched.
  async function discardRevision(user, id) {
    const book = await loadManageable(user, id);
    if (!book.revision) throw new HttpError(409, 'This book has no unapproved changes.');
    const saved = await store.updateBook(book.id, { revision: null, hasPendingRevision: false, updatedAt: now().toISOString() });
    await audit(user, 'book.revision_discard', book.id);
    return privateBook(saved);
  }

  async function deleteBook(user, id) {
    const book = await loadManageable(user, id);
    await store.deleteBook(book.id);
    if (book.fileName) await files.remove(book.fileName);
    await audit(user, 'book.delete', book.id, book.title);
  }

  // ---------- Task C: admin approval ----------

  // Both brand-new submissions and edits to public books wait here.
  async function listPending(user) {
    assertAdmin(user);
    const [fresh, revised] = await Promise.all([store.findBooks({ status: 'pending' }), store.findBooks({ hasPendingRevision: true })]);
    const entries = [
      ...fresh.map((book) => ({ ...privateBook(book), kind: 'new', waitingSince: book.createdAt })),
      ...revised.map((book) => ({ ...privateBook(book), kind: 'revision', waitingSince: book.revision.submittedAt })),
    ].sort((a, b) => String(a.waitingSince).localeCompare(String(b.waitingSince)));
    const owners = new Map();
    for (const entry of entries) {
      if (!owners.has(entry.uploadedBy)) {
        const owner = await store.findUserById(entry.uploadedBy);
        owners.set(entry.uploadedBy, owner ? { id: owner.id, name: owner.name, email: owner.email } : null);
      }
    }
    return entries.map((entry) => ({ ...entry, owner: owners.get(entry.uploadedBy) }));
  }

  async function loadForReview(user, id) {
    assertAdmin(user);
    const book = typeof id === 'string' ? await store.findBookById(id) : null;
    if (!book) throw new HttpError(404, 'Book not found.');
    return book;
  }

  async function approveBook(user, id) {
    const book = await loadForReview(user, id);
    const timestamp = now().toISOString();
    const review = { reviewedBy: user.id, reviewedAt: timestamp, updatedAt: timestamp };

    if (book.hasPendingRevision) {
      // The revision replaces the live version.
      const saved = await store.updateBook(book.id, { ...book.revision.changes, revision: null, hasPendingRevision: false, ...review });
      await audit(user, 'book.revision_approve', book.id, book.title);
      await notify(user, book, 'revision_approved', `Your changes to “${saved.title}” were approved and are now public.`);
      return privateBook(saved);
    }
    if (book.status === 'approved') throw new HttpError(409, 'This book is already approved.');
    const saved = await store.updateBook(book.id, { status: 'approved', rejectionReason: null, ...review });
    await audit(user, 'book.approve', book.id, book.title);
    await notify(user, book, 'approved', `“${book.title}” was approved and is now public.`);
    return privateBook(saved);
  }

  async function rejectBook(user, id, body = {}) {
    assertAdmin(user); // checked first, so a normal user gets 403 whatever they send
    const reason = cleanText(body.reason);
    if (!reason || reason.length < 3 || reason.length > 500) {
      throw new HttpError(400, 'A rejection reason of 3 to 500 characters is required.');
    }
    const book = await loadForReview(user, id);
    const timestamp = now().toISOString();
    const review = { reviewedBy: user.id, reviewedAt: timestamp, updatedAt: timestamp };

    if (book.hasPendingRevision) {
      // The approved version stays public; only the owner's edit is rejected.
      const saved = await store.updateBook(book.id, { revision: { ...book.revision, status: 'rejected', rejectionReason: reason }, hasPendingRevision: false, ...review });
      await audit(user, 'book.revision_reject', book.id, reason);
      await notify(user, book, 'revision_rejected', `Your changes to “${book.title}” were rejected: ${reason}. The previous version stays public.`);
      return privateBook(saved);
    }
    if (book.status === 'rejected') throw new HttpError(409, 'This book is already rejected.');
    const saved = await store.updateBook(book.id, { status: 'rejected', rejectionReason: reason, ...review });
    await audit(user, 'book.reject', book.id, reason);
    await notify(user, book, 'rejected', `“${book.title}” was rejected: ${reason}`);
    return privateBook(saved);
  }

  // ---------- Optional extensions: notifications and audit log ----------

  async function listNotifications(user) {
    assertSignedIn(user);
    const notifications = (await store.findNotifications(user.id)).slice(0, 50);
    return { notifications, unread: notifications.filter((entry) => !entry.readAt).length };
  }

  async function markNotificationsRead(user) {
    assertSignedIn(user);
    await store.markNotificationsRead(user.id, now().toISOString());
  }

  async function listAudit(user, query = {}) {
    assertAdmin(user);
    const { pageNumber, pageSize, start } = readPaging(query, 50);
    const [entries, total] = await Promise.all([store.findAudit(start, pageSize), store.countAudit()]);
    return { entries, ...pageInfo(total, pageNumber, pageSize, start) };
  }

  return {
    register, login, logout, authenticate,
    listPublic, getBook, authorizeFile,
    listMine, createBook, updateBook, resubmitBook, discardRevision, deleteBook,
    listPending, approveBook, rejectBook,
    listNotifications, markNotificationsRead, listAudit,
  };
}

module.exports = { createService };
