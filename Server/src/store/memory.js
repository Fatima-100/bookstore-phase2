// In-memory store with the same methods as the MongoDB store. Used by the automated tests.
function matches(document, filter) {
  return Object.entries(filter).every(([key, value]) => document[key] === value);
}

const copy = (value) => (value ? structuredClone(value) : null);
const newestFirst = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));

function createMemoryStore() {
  const users = [];
  const books = [];
  const sessions = [];
  const notifications = [];
  const auditLogs = [];

  return {
    async init() {},

    async insertUser(user) {
      if (users.some((entry) => entry.email === user.email)) {
        throw Object.assign(new Error('Duplicate e-mail'), { code: 'DUPLICATE_EMAIL' });
      }
      users.push(copy(user));
      return user;
    },
    async findUserByEmail(email) { return copy(users.find((user) => user.email === email)); },
    async findUserById(id) { return copy(users.find((user) => user.id === id)); },

    async findBooks(filter = {}) { return books.filter((book) => matches(book, filter)).map(copy).sort(newestFirst); },
    async findBookById(id) { return copy(books.find((book) => book.id === id)); },
    async insertBook(book) { books.push(copy(book)); return book; },
    async updateBook(id, changes) {
      const book = books.find((entry) => entry.id === id);
      if (!book) return null;
      Object.assign(book, structuredClone(changes));
      return copy(book);
    },
    async deleteBook(id) {
      const index = books.findIndex((book) => book.id === id);
      if (index >= 0) books.splice(index, 1);
      return index >= 0;
    },

    async insertSession(session) { sessions.push(copy(session)); },
    async findSession(tokenHash) { return copy(sessions.find((session) => session.tokenHash === tokenHash)); },
    async deleteSession(tokenHash) {
      const index = sessions.findIndex((session) => session.tokenHash === tokenHash);
      if (index >= 0) sessions.splice(index, 1);
    },

    async insertNotification(notification) { notifications.push(copy(notification)); },
    async findNotifications(userId) { return notifications.filter((entry) => entry.userId === userId).map(copy).sort(newestFirst); },
    async markNotificationsRead(userId, readAt) {
      notifications.forEach((entry) => { if (entry.userId === userId && !entry.readAt) entry.readAt = readAt; });
    },

    async insertAudit(entry) { auditLogs.push(copy(entry)); },
    async findAudit(skip, limit) { return auditLogs.map(copy).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(skip, skip + limit); },
    async countAudit() { return auditLogs.length; },
  };
}

module.exports = { createMemoryStore };
