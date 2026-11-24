// Creates (or promotes) the administrator account. Admins are never created through the public API.
//   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' ADMIN_NAME='Site Admin' npm run create-admin
const { connectDB, closeDB } = require('../src/db');
const { createMongoStore } = require('../src/store/mongo');
const { hashPassword, newId } = require('../src/auth');

async function main() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  const name = (process.env.ADMIN_NAME || 'Administrator').trim();
  if (!email || password.length < 8) {
    throw new Error('Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 8 characters.');
  }

  const db = await connectDB();
  const store = createMongoStore(db);
  await store.init();

  if (await store.findUserByEmail(email)) {
    await db.collection('users').updateOne({ email }, { $set: { role: 'admin' } });
    console.log(`${email} already existed and is now an admin. Its password was not changed.`);
    return;
  }
  await store.insertUser({ id: newId(), name, email, passwordHash: hashPassword(password), role: 'admin', createdAt: new Date().toISOString() });
  console.log(`Admin account created for ${email}.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(closeDB);
