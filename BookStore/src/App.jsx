import { useEffect, useState } from 'react';
import BookCard from './components/BookCard';
import Icon from './components/Icon';
import AuthDialog from './components/AuthDialog';
import MyCatalogue from './components/MyCatalogue';
import AdminReview from './components/AdminReview';
import AuditLog from './components/AuditLog';
import NotificationBell from './components/NotificationBell';
import { api } from './api';
import './App.css';

const formats = [
  { value: 'ALL', label: 'All books', icon: 'grid' },
  { value: 'PDF', label: 'PDF books', icon: 'file' },
  { value: 'UNICODE', label: 'Unicode books', icon: 'book' },
  { value: 'AUDIO', label: 'Audiobooks', icon: 'audio' },
];

export default function App() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [format, setFormat] = useState('ALL');
  const [search, setSearch] = useState('');
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authIntent, setAuthIntent] = useState('');
  const [view, setView] = useState('home'); // home | catalogue | review
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, hasMore: false, counts: { ALL: 0, PDF: 0, UNICODE: 0, AUDIO: 0 } });

  // If the browser still has a valid session cookie, show the user as logged in.
  useEffect(() => {
    api('/api/auth/me').then((data) => setUser(data.user)).catch(() => {});
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadBooks() {
      setLoading(true);
      setError('');
      if (page === 1) setBooks([]);
      try {
        const params = new URLSearchParams({ page: String(page), limit: '10', bookType: format, search });
        const response = await fetch('/api/books?' + params, { signal: controller.signal });
        if (!response.ok) throw new Error('Could not load books');
        const data = await response.json();
        if (!Array.isArray(data.books)) throw new Error('Invalid book list');
        if (!controller.signal.aborted) {
          setBooks((previous) => page === 1 ? data.books : [...new Map([...previous, ...data.books].map((book) => [book.id, book])).values()]);
          setPagination({ total: data.total, hasMore: data.hasMore, counts: data.counts });
        }
      } catch {
        if (!controller.signal.aborted) {
          setError('Cannot load books. Make sure your local server is running on port 5050.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadBooks();
    return () => controller.abort();
  }, [retry, page, format, search]);

  function resetFilters() {
    setPage(1);
    setFormat('ALL');
    setSearch('');
  }

  function selectFormat(nextFormat) {
    if (nextFormat === 'AUDIO' && !user) {
      openAuth('audio');
      return;
    }
    setPage(1);
    setFormat(nextFormat);
  }

  function openAuth(intent = '') {
    setAuthIntent(intent);
    setShowAuth(true);
  }

  function handleLogin(loggedInUser) {
    setUser(loggedInUser);
    setShowAuth(false);
    setSearch('');
    setPage(1);
    setFormat(authIntent === 'audio' ? 'AUDIO' : 'ALL');
  }

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* the cookie is cleared by the server when it is reachable */ }
    setUser(null);
    setView('home');
    resetFilters();
  }

  function showHome() {
    setView('home');
    setRetry((value) => value + 1); // reload the public list, e.g. after an approval
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <a href="#" className="brand" aria-label="KitabGhar home" onClick={() => { resetFilters(); setView('home'); }}>
          <span className="brand-icon"><Icon name="book" /></span>
          Kitab<span>Ghar</span><span className="brand-dot">.</span>
        </a>
        <div className="header-actions">
          <nav className="nav-tabs" aria-label="Main">
            <button type="button" className={view === 'home' ? 'nav-tab active' : 'nav-tab'} onClick={showHome}>Library</button>
            {user && <button type="button" className={view === 'catalogue' ? 'nav-tab active' : 'nav-tab'} onClick={() => setView('catalogue')}>My Catalogue</button>}
            {user?.role === 'admin' && <button type="button" className={view === 'review' ? 'nav-tab active' : 'nav-tab'} onClick={() => setView('review')}>Admin Review</button>}
            {user?.role === 'admin' && <button type="button" className={view === 'audit' ? 'nav-tab active' : 'nav-tab'} onClick={() => setView('audit')}>Audit Log</button>}
            {user && <NotificationBell key={user.id} />}
          </nav>
          {user ? (
            <div className="account-menu"><span title={user.email}>{user.name}</span><span className={`role-badge ${user.role}`}>{user.role}</span><button type="button" onClick={logout}>Log out</button></div>
          ) : (
            <div className="account-menu"><button type="button" onClick={() => openAuth()}>Log in / Register</button></div>
          )}
        </div>
      </header>
      <main>
        {view === 'catalogue' && user ? <MyCatalogue user={user} /> : view === 'review' && user?.role === 'admin' ? <AdminReview /> : view === 'audit' && user?.role === 'admin' ? <AuditLog /> : <>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow"><span /> A LITTLE CURIOSITY. A WORLD OF BOOKS.</p>
            <h1 id="hero-title">Good books.<br />In every <em>form.</em></h1>
            <p className="hero-description">Read a page. Listen to a chapter. Find a new perspective.<br className="desktop-break" /> Your next discovery is waiting on our shelves.</p>
            <a href="#library" className="primary-button">Explore the library <Icon name="arrow" /></a>
            <div className="hero-formats"><span><Icon name="file" /> PDF</span><span><Icon name="book" /> Unicode</span><span><Icon name="audio" /> Audio</span></div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-orbit" />
            <span className="art-star star-one">✳</span><span className="art-star star-two">✧</span>
            <div className="display-book book-back"><span>THE ART OF</span><strong>seeing<br />differently.</strong><small>A NEW PERSPECTIVE</small></div>
            <div className="display-book book-front"><span>THE READER’S COLLECTION</span><strong lang="ur" dir="rtl">علم کی<br />ایک نئی دنیا</strong><div className="cover-flower">✳</div><small>OPEN A BOOK. OPEN YOUR WORLD.</small></div>
            <div className="floating-note"><Icon name="audio" /><span>A story for<br /><strong>every moment.</strong></span></div>
          </div>
        </section>

        <section className="library" id="library" aria-labelledby="library-title">
          <div className="library-heading">
            <div><p className="eyebrow">YOUR NEXT CHAPTER</p><h2 id="library-title">On the shelves<span>.</span></h2></div>
            <label className="search-box"><Icon name="search" /><span className="sr-only">Search by title or author</span><input type="search" placeholder="Search books or authors…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
          </div>
          <div className="library-toolbar">
            <div className="filters" role="group" aria-label="Filter books by format">
              {formats.map((item) => (
                <button type="button" key={item.value} aria-pressed={format === item.value} className={format === item.value ? 'filter active' : 'filter'} onClick={() => selectFormat(item.value)}>
                  <Icon name={item.icon} />{item.label}<span>{pagination.counts[item.value]}</span>
                </button>
              ))}
            </div>
            <p className="result-count" role="status">{loading && page === 1 ? 'Loading your library…' : error && !books.length ? 'Library unavailable' : `Showing ${books.length} of ${pagination.total} books`}</p>
          </div>
          {loading && page === 1 ? (
            <div className="empty-state" role="status"><Icon name="book" /><h3>Opening the library…</h3><p>Loading books from your local server.</p></div>
          ) : error && !books.length ? (
            <div className="empty-state" role="alert"><Icon name="book" /><h3>The shelves are taking a moment</h3><p>{error}</p><button className="primary-button" onClick={() => setRetry((value) => value + 1)}>Try again <Icon name="arrow" /></button></div>
          ) : books.length ? (
            <div className="book-grid">{books.map((book) => <BookCard key={book.id} book={book} audioLocked={!user} onLoginRequired={() => openAuth('audio')} />)}</div>
          ) : (
            <div className="empty-state"><Icon name="search" /><h3>No books found</h3><p>Try a different title, author, or format.</p><button className="primary-button" onClick={resetFilters}>Show all books <Icon name="arrow" /></button></div>
          )}
          {books.length > 0 && !(loading && page === 1) && (
            <div className="load-more-area">
              {error && <p className="load-more-error" role="alert">{error}</p>}
              <p role="status">Showing {books.length} of {pagination.total} books</p>
              {(pagination.hasMore || error) ? (
                <button type="button" className="primary-button" disabled={loading} onClick={() => error ? setRetry((value) => value + 1) : setPage(page + 1)}>
                  {loading ? 'Loading…' : error ? 'Retry loading' : 'Load 10 more books'}<Icon name="arrow" />
                </button>
              ) : <span>You’ve reached the end of this collection.</span>}
            </div>
          )}
          <p className="shelf-note"><Icon name="book" /> A small collection. A world of ideas.</p>
        </section>
        </>}
      </main>
      <footer><a className="footer-brand" href="#" onClick={resetFilters}>KitabGhar.</a><p>For the love of a good book.</p><span>Read. Listen. Discover.</span></footer>
      {showAuth && <AuthDialog intent={authIntent} onClose={() => setShowAuth(false)} onLogin={handleLogin} />}
    </div>
  );
}
