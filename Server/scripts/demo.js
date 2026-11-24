// Live demonstration of the eight required test cases against a RUNNING server (npm run dev).
//   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='...' npm run demo
// It creates two throw-away users, runs the cases, prints PASS/FAIL, and cleans up the demo books.
const BASE = process.env.BASE_URL || 'http://localhost:5050';
const adminLogin = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };

function client() {
  let cookie = '';
  return async (method, path, body) => {
    const response = await fetch(BASE + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = response.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: response.status, data: await response.json().catch(() => ({})) };
  };
}

let failures = 0;
function check(label, condition, detail) {
  if (!condition) failures++;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? '  -> ' + detail : ''}`);
}

async function main() {
  if (!adminLogin.email || !adminLogin.password) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (see README).');
  const run = Date.now();
  const [guest, a, b, admin] = [client(), client(), client(), client()];
  const creds = (name) => ({ name, email: `${name}.${run}@demo.test`.toLowerCase(), password: 'demo-pass-123', confirmPassword: 'demo-pass-123' });
  const [userA, userB] = [creds('UserA'), creds('UserB')];

  for (const [session, user] of [[a, userA], [b, userB]]) {
    await session('POST', '/api/auth/register', user);
    const login = await session('POST', '/api/auth/login', user);
    if (login.status !== 200) throw new Error('Login failed: ' + JSON.stringify(login.data));
  }
  const adminResult = await admin('POST', '/api/auth/login', adminLogin);
  if (adminResult.status !== 200) throw new Error(`Admin login failed (HTTP ${adminResult.status}): ${adminResult.data.message || 'no message'}`);

  const title = `Book X ${run}`;
  const created = await a('POST', '/api/books', { title, author: 'Demo Author', category: 'Demo', description: 'Demo book', bookType: 'PDF', fileUrl: 'https://example.com/demo.pdf' });
  const id = created.data.book?.id;
  const mine = await a('GET', '/api/my/books');
  check('1. User A submits Book X -> pending in My Catalogue', created.status === 201 && mine.data.books.some((book) => book.id === id && book.status === 'pending'));

  const publicSearch = () => guest('GET', '/api/books?search=' + encodeURIComponent(title));
  check('2. Guest does not see Book X', (await publicSearch()).data.total === 0);

  const hack = await b('PATCH', '/api/books/' + id, { title: 'Hacked by B' });
  check('3. User B cannot modify User A\'s Book X', [403, 404].includes(hack.status), 'HTTP ' + hack.status + ' ' + hack.data.message);

  const denied = await a('PATCH', `/api/admin/books/${id}/approve`);
  check('4. Normal user calling an admin endpoint is denied', denied.status === 403, 'HTTP ' + denied.status + ' ' + denied.data.message);

  const approved = await admin('PATCH', `/api/admin/books/${id}/approve`);
  check('5. Admin approves Book X -> publicly visible', approved.status === 200 && (await publicSearch()).data.total === 1);

  const edited = await a('PATCH', '/api/books/' + id, { title: title + ' (2nd edition)' });
  const stillPublic = (await publicSearch()).data.books?.[0];
  check('6. Editing an approved book sends the edit for review; the approved version stays public',
    edited.data.book?.revision?.status === 'pending' && stillPublic?.title === title, 'public title: ' + stillPublic?.title);

  const second = await a('POST', '/api/books', { title: title + ' Y', author: 'Demo Author', category: 'Demo', bookType: 'PDF', fileUrl: 'https://example.com/demo-y.pdf' });
  const secondId = second.data.book?.id;
  await admin('PATCH', `/api/admin/books/${secondId}/reject`, { reason: 'Demo: please add a longer description' });
  const rejected = (await a('GET', '/api/my/books?status=rejected')).data.books.find((book) => book.id === secondId);
  const revised = await a('PATCH', '/api/books/' + secondId, { description: 'A much longer description' });
  check('7. Rejection shows the reason; owner revises and it is pending again', rejected?.status === 'rejected' && !!rejected.rejectionReason && revised.data.book?.status === 'pending', rejected?.rejectionReason);
  const notes = await a('GET', '/api/notifications');
  check('   Bonus: owner received a rejection notification', notes.data.notifications?.some((note) => note.type === 'rejected'));
  const audit = await admin('GET', '/api/admin/audit-logs?limit=5');
  check('   Bonus: admin can read the audit log; a normal user cannot', audit.status === 200 && (await a('GET', '/api/admin/audit-logs')).status === 403);

  const removed = await a('DELETE', '/api/books/' + id);
  await a('DELETE', '/api/books/' + secondId);
  check('8. User A deletes their own book', removed.status === 200 && !(await a('GET', '/api/my/books')).data.books.some((book) => book.id === id));

  console.log(failures ? `\n${failures} check(s) FAILED.` : '\nAll 8 test cases passed.');
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
