import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import BookForm from './BookForm';
import StatusBadge from './StatusBadge';

const tabs = ['all', 'pending', 'approved', 'rejected'];
const PAGE_SIZE = 50;
const emptyData = { books: [], total: 0, page: 1, totalPages: 0, counts: { all: 0, pending: 0, approved: 0, rejected: 0 } };

export default function MyCatalogue({ user }) {
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState(''); // the search text after a short typing pause
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(null); // null = hidden, 'new' = submit form, or a book = edit form
  const [busyId, setBusyId] = useState('');
  const admin = user.role === 'admin';

  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (tab !== 'all') params.set('status', tab);
      if (query) params.set('search', query);
      const result = await api('/api/my/books?' + params);
      if (result.books.length === 0 && page > 1) setPage(page - 1); // the last book on a page was removed
      setData(result);
      setError('');
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  }, [tab, query, page]);

  useEffect(() => { load(); }, [load]);

  async function act(book, request) {
    setBusyId(book.id);
    setError('');
    setMessage('');
    try {
      const result = await request();
      setMessage(result?.message || 'Done.');
      await load();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusyId('');
    }
  }

  const url = (book, suffix = '') => `/api/books/${encodeURIComponent(book.id)}${suffix}`;
  const remove = (book) => window.confirm(`Delete “${book.title}”? This cannot be undone.`) && act(book, () => api(url(book), { method: 'DELETE' }));
  const resubmit = (book) => act(book, () => api(url(book, '/resubmit'), { method: 'POST' }));
  const discard = (book) => act(book, () => api(url(book, '/revision'), { method: 'DELETE' }));

  return (
    <section className="panel" aria-labelledby="catalogue-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{admin ? 'ALL SUBMISSIONS' : 'YOUR SUBMISSIONS'}</p>
          <h2 id="catalogue-title">My Catalogue<span>.</span></h2>
          <p className="panel-note">{admin ? 'As an administrator you can see and manage every book.' : 'Books you submit stay hidden from the public until an administrator approves them.'}</p>
        </div>
        {!form && <button type="button" className="primary-button" onClick={() => { setForm('new'); setMessage(''); }}>Submit a book</button>}
      </div>

      {form && (
        <BookForm
          book={form === 'new' ? undefined : form}
          onCancel={() => setForm(null)}
          onSaved={(savedMessage) => { setForm(null); setMessage(savedMessage); load(); }}
        />
      )}

      {message && <p className="auth-success" role="status">{message}</p>}
      {error && <p className="auth-error" role="alert">{error} <button type="button" className="link-button" onClick={load}>Try again</button></p>}

      <div className="catalogue-tools">
        <div className="filters" role="group" aria-label="Filter by status">
          {tabs.map((name) => (
            <button type="button" key={name} aria-pressed={tab === name} className={tab === name ? 'filter active' : 'filter'} onClick={() => { setTab(name); setPage(1); }}>
              {name[0].toUpperCase() + name.slice(1)}<span>{data.counts[name]}</span>
            </button>
          ))}
        </div>
        <input className="search-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, author or category" aria-label="Search your catalogue" />
      </div>

      {loading && data.books.length === 0 ? <p role="status">Loading your catalogue…</p> : data.books.length === 0 ? (
        <div className="empty-state"><h3>Nothing here</h3><p>{query ? 'No books match your search.' : tab === 'all' ? 'Submit your first book to get started.' : `You have no ${tab} books.`}</p></div>
      ) : (
        <ul className="catalogue-list" aria-busy={loading}>
          {data.books.map((book) => (
            <li key={book.id} className="catalogue-item">
              <div className="catalogue-main">
                <div className="catalogue-title">
                  <strong dir="auto">{book.title}</strong>
                  <StatusBadge status={book.status} />
                  {book.revision?.status === 'pending' && <span className="status-badge pending">Edit pending review</span>}
                  {book.revision?.status === 'rejected' && <span className="status-badge rejected">Edit rejected</span>}
                </div>
                <p className="catalogue-meta" dir="auto">{book.author} · {book.category} · {book.bookType}</p>
                {book.status === 'rejected' && <p className="reject-note"><strong>Rejected:</strong> {book.rejectionReason}</p>}
                {book.status === 'pending' && <p className="pending-note">Waiting for administrator review. Not visible to the public.</p>}
                {book.revision?.status === 'pending' && <p className="pending-note">Your edit ({Object.keys(book.revision.changes).join(', ')}) is waiting for review. The public still sees the approved version.</p>}
                {book.revision?.status === 'rejected' && <p className="reject-note"><strong>Your edit was rejected:</strong> {book.revision.rejectionReason}. The approved version stays public.</p>}
              </div>
              <div className="catalogue-actions">
                <a href={book.fileUrl} target="_blank" rel="noopener noreferrer">Open file</a>
                <button type="button" disabled={busyId === book.id} onClick={() => { setForm({ ...book, ...(book.revision?.changes || {}) }); setMessage(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button>
                {(book.status === 'rejected' || book.revision?.status === 'rejected') && <button type="button" disabled={busyId === book.id} onClick={() => resubmit(book)}>Resubmit</button>}
                {book.revision && <button type="button" disabled={busyId === book.id} onClick={() => discard(book)}>Discard edit</button>}
                <button type="button" className="danger" disabled={busyId === book.id} onClick={() => remove(book)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data.totalPages > 1 && (
        <nav className="pager" aria-label="Catalogue pages">
          <button type="button" className="ghost-button" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {data.page} of {data.totalPages} · {data.total} books</span>
          <button type="button" className="ghost-button" disabled={page >= data.totalPages || loading} onClick={() => setPage(page + 1)}>Next</button>
        </nav>
      )}
    </section>
  );
}
