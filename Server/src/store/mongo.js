// MongoDB store. Collections: users, books, sessions.
const HIDE_ID = { projection: { _id: 0 } };

function createMongoStore(db) {
  const users = db.collection('users');
  const books = db.collection('books');
  const sessions = db.collection('sessions');
  const notifications = db.collection('notifications');
  const auditLogs = db.collection('auditLogs');

  return {
    // Safe to call on every start: creating an index that already exists does nothing.
    async init() {
      await users.createIndex({ email: 1 }, { unique: true });
      await users.createIndex({ id: 1 }, { unique: true });
      await books.createIndex({ id: 1 }, { unique: true });
      await books.createIndex({ status: 1 });
      await books.createIndex({ uploadedBy: 1 });
      await books.createIndex({ fileName: 1 }, { sparse: true });
      await sessions.createIndex({ tokenHash: 1 }, { unique: true });
      await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // expired sessions delete themselves
      await books.createIndex({ hasPendingRevision: 1 });
      await notifications.createIndex({ userId: 1, createdAt: -1 });
      await auditLogs.createIndex({ at: -1 });
    },

    async insertUser(user) {
      try {
        await users.insertOne({ ...user });
      } catch (error) {
        if (error.code === 11000) throw Object.assign(new Error('Duplicate e-mail'), { code: 'DUPLICATE_EMAIL' });
        throw error;
      }
      return user;
    },
    findUserByEmail: (email) => users.findOne({ email }, HIDE_ID),
    findUserById: (id) => users.findOne({ id }, HIDE_ID),

    findBooks: (filter = {}) => books.find(filter, HIDE_ID).sort({ createdAt: -1 }).toArray(),
    findBookById: (id) => books.findOne({ id }, HIDE_ID),
    async insertBook(book) {
      await books.insertOne({ ...book });
      return book;
    },
    updateBook: (id, changes) => books.findOneAndUpdate({ id }, { $set: changes }, { returnDocument: 'after', ...HIDE_ID }),
    async deleteBook(id) {
      return (await books.deleteOne({ id })).deletedCount > 0;
    },

    async insertSession(session) {
      await sessions.insertOne({ ...session });
    },
    findSession: (tokenHash) => sessions.findOne({ tokenHash }, HIDE_ID),
    async deleteSession(tokenHash) {
      await sessions.deleteOne({ tokenHash });
    },

    async insertNotification(notification) {
      await notifications.insertOne({ ...notification });
    },
    findNotifications: (userId) => notifications.find({ userId }, HIDE_ID).sort({ createdAt: -1 }).limit(100).toArray(),
    async markNotificationsRead(userId, readAt) {
      await notifications.updateMany({ userId, readAt: null }, { $set: { readAt } });
    },

    async insertAudit(entry) {
      await auditLogs.insertOne({ ...entry });
    },
    findAudit: (skip, limit) => auditLogs.find({}, HIDE_ID).sort({ at: -1 }).skip(skip).limit(limit).toArray(),
    countAudit: () => auditLogs.countDocuments({}),
  };
}

module.exports = { createMongoStore };
