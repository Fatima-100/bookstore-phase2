import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

export default function AdminReview() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState('');
  const [rejectingId, setRejectingId] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBooks(await api('/api/admin/books/pending'));
      setError('');
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function review(book, action, body) {
    setBusyId(book.id);
    setError('');
    setMessage('');
    try {
      const data = await api(`/api/admin/books/${encodeURIComponent(book.id)}/${action}`, { method: 'PATCH', body });
      setMessage(`“${book.title}”: ${data.message}`);
      setRejectingId('');
      setReason('');
      await load();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusyId('');
    }
  }

  return (
    <section className="panel" aria-labelledby="review-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION</p>
          <h2 id="review-title">Admin Review<span>.</span></h2>
          <p className="panel-note">Approve a book to make it public, or reject it with a reason the owner will see.</p>
        </div>
        <button type="button" className="ghost-button" onClick={load} disabled={loading}>Refresh</button>
      </div>

      {message && <p className="auth-success" role="status">{message}</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}

      {loading ? <p role="status">Loading pending submissions…</p> : books.length === 0 ? (
        <div className="empty-state"><h3>All caught up</h3><p>There are no submissions waiting for review.</p></div>
      ) : (
        <ul className="catalogue-list">
          {books.map((book) => (
            <li key={book.id} className="catalogue-item review-item">
              <div className="catalogue-main">
                <div className="catalogue-title"><strong dir="auto">{book.title}</strong>{book.kind === 'revision' && <span className="status-badge pending">Edit to a public book</span>}</div>
                <p className="catalogue-meta" dir="auto">{book.author} · {book.category} · {book.bookType}</p>
                {book.description && <p className="catalogue-description" dir="auto">{book.description}</p>}
                {book.kind === 'revision' && (
                  <div className="revision-diff">
                    <strong>Proposed changes (the current version stays public until you approve):</strong>
                    <ul>
                      {Object.entries(book.revision.changes).map(([field, value]) => (
                        <li key={field}><b>{field}</b>: <del dir="auto">{String(book[field] || '—')}</del> → <ins dir="auto">{String(value)}</ins></li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="catalogue-meta">Submitted by <strong>{book.owner?.name || 'unknown user'}</strong> {book.owner && `(${book.owner.email})`} on {new Date(book.waitingSince).toLocaleDateString()}</p>
                {rejectingId === book.id && (
                  <form className="reject-form" onSubmit={(event) => { event.preventDefault(); review(book, 'reject', { reason }); }}>
                    <label>Reason for rejection<textarea value={reason} onChange={(event) => setReason(event.target.value)} required minLength={3} maxLength={500} rows={2} autoFocus /></label>
                    <div className="form-actions">
                      <button type="submit" className="primary-button danger-fill" disabled={busyId === book.id}>Confirm rejection</button>
                      <button type="button" className="ghost-button" onClick={() => { setRejectingId(''); setReason(''); }}>Cancel</button>
                    </div>
                  </form>
                )}
              </div>
              <div className="catalogue-actions">
                <a href={book.fileUrl} target="_blank" rel="noopener noreferrer">Open file</a>
                <button type="button" disabled={busyId === book.id} onClick={() => review(book, 'approve')}>{book.kind === 'revision' ? 'Approve changes' : 'Approve'}</button>
                <button type="button" className="danger" disabled={busyId === book.id} onClick={() => { setRejectingId(book.id); setReason(''); }}>Reject</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
