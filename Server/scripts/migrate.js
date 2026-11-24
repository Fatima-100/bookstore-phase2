// Migration for books that existed before user accounts. Safe to run more than once, deletes nothing.
//  1. Creates a "system" owner (an admin account nobody can log in to).
//  2. Imports the books from src/data/books.js that are not in MongoDB yet.
//  3. Gives every book without an owner/status: uploadedBy = system owner, status = approved.
//     (Those books were already public, so they stay public.)
const { connectDB, closeDB } = require('../src/db');
const { createMongoStore } = require('../src/store/mongo');
const { hashPassword, newId } = require('../src/auth');
const { randomBytes } = require('node:crypto');
const { books: legacyBooks } = require('../src/data/books');

const SYSTEM_EMAIL = 'system@bookstore.local';

async function main() {
  const db = await connectDB();
  const store = createMongoStore(db);
  await store.init();
  const booksCollection = db.collection('books');

  let system = await store.findUserByEmail(SYSTEM_EMAIL);
  if (!system) {
    system = await store.insertUser({
      id: newId(), name: 'BookStore (system)', email: SYSTEM_EMAIL, role: 'admin',
      passwordHash: hashPassword(randomBytes(32).toString('hex')), // random, so no one can log in
      createdAt: new Date().toISOString(),
    });
  }

  // Older books get slightly older timestamps so the newest books are listed first.
  const base = Date.now() - legacyBooks.length * 1000;
  let imported = 0;
  for (const [index, book] of legacyBooks.entries()) {
    if (await store.findBookById(book.id)) continue;
    await store.insertBook({ subtitle: '', description: '', ...book, createdAt: new Date(base + index * 1000).toISOString() });
    imported++;
  }

  const timestamp = new Date().toISOString();
  const fix = await booksCollection.updateMany(
    { $or: [{ status: { $exists: false } }, { uploadedBy: { $exists: false } }] },
    [{ $set: {
      status: { $ifNull: ['$status', 'approved'] },
      uploadedBy: { $ifNull: ['$uploadedBy', system.id] },
      rejectionReason: { $ifNull: ['$rejectionReason', null] },
      createdAt: { $ifNull: ['$createdAt', timestamp] },
      updatedAt: { $ifNull: ['$updatedAt', timestamp] },
    } }]
  );

  // Books whose file is stored on this server get a fileName, so the download rule can find them.
  let linked = 0;
  for (const book of await store.findBooks({})) {
    const match = !book.fileName && typeof book.fileUrl === 'string' && book.fileUrl.match(/\/uploads\/([a-f0-9-]+\.(?:pdf|txt|mp3|wav|ogg|m4a))$/);
    if (match) { await store.updateBook(book.id, { fileName: match[1] }); linked++; }
  }

  console.log(`Imported ${imported} books, upgraded ${fix.modifiedCount} existing books, linked ${linked} uploaded files.`);
}

main().catch((error) => { console.error('Migration failed:', error.message); process.exitCode = 1; }).finally(closeDB);
