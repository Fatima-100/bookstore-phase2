import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

// Shows approval / rejection results for the logged-in user's books. Refreshes once a minute.
export default function NotificationBell() {
  const [data, setData] = useState({ notifications: [], unread: 0 });
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try { setData(await api('/api/notifications')); } catch { /* keep showing the last list */ }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [load]);

  async function markRead() {
    try { await api('/api/notifications/read', { method: 'POST' }); await load(); } catch { /* try again later */ }
  }

  return (
    <div className="bell">
      <button type="button" className="nav-tab" aria-expanded={open} onClick={() => { setOpen(!open); if (!open) load(); }}>
        Notifications{data.unread > 0 && <span className="bell-count" aria-label={`${data.unread} unread`}>{data.unread}</span>}
      </button>
      {open && (
        <div className="notif-panel" role="region" aria-label="Notifications">
          <div className="notif-head">
            <strong>Notifications</strong>
            {data.unread > 0 && <button type="button" className="link-button" onClick={markRead}>Mark all as read</button>}
          </div>
          {data.notifications.length === 0 ? <p className="notif-empty">Nothing yet. You will be told here when a book is approved or rejected.</p> : (
            <ul>
              {data.notifications.map((note) => (
                <li key={note.id} className={note.readAt ? '' : 'unread'}>
                  <span dir="auto">{note.message}</span>
                  <small>{new Date(note.createdAt).toLocaleString()}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
