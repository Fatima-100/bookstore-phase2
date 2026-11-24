import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

export default function AuditLog() {
  const [data, setData] = useState({ entries: [], page: 1, totalPages: 0, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api(`/api/admin/audit-logs?page=${page}&limit=50`));
      setError('');
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="panel" aria-labelledby="audit-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION</p>
          <h2 id="audit-title">Audit Log<span>.</span></h2>
          <p className="panel-note">Who did what, newest first. Passwords and session tokens are never recorded.</p>
        </div>
        <button type="button" className="ghost-button" onClick={load} disabled={loading}>Refresh</button>
      </div>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <div className="table-scroll">
        <table className="audit-table">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
          <tbody>
            {data.entries.map((entry) => (
              <tr key={entry.id}>
                <td>{new Date(entry.at).toLocaleString()}</td>
                <td>{entry.actorEmail || 'system'}</td>
                <td><code>{entry.action}</code></td>
                <td dir="auto">{entry.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && data.entries.length === 0 && <p className="panel-note">No activity recorded yet.</p>}
      {data.totalPages > 1 && (
        <nav className="pager" aria-label="Audit log pages">
          <button type="button" className="ghost-button" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {data.page} of {data.totalPages}</span>
          <button type="button" className="ghost-button" disabled={page >= data.totalPages || loading} onClick={() => setPage(page + 1)}>Next</button>
        </nav>
      )}
    </section>
  );
}
