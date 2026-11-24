
import { useEffect, useState } from 'react';

export default function Users() {
  
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

 
  // Fetch the server's users when this tab opens.
  useEffect(() => {
    fetch('http://localhost:5050/comsatsusers')
      .then((response) => {
        if (!response.ok) throw new Error('Could not load users.');
        return response.json();
      }).then((data) => {console.log('We are testing in comsats',data); setUsers(data);})

      .catch(() => setError('Could not load users. Make sure the server is running on port 5050.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-4 text-2xl font-bold">Users</h2>

      {loading && <p role="status">Loading users...</p>}
      {error && <p role="alert" className="text-red-600">{error}</p>}
      {!loading && !error && users.length === 0 && <p>No users registered yet.</p>}

      
      <ul className="space-y-3">
        
        {users.map((user) => (
          <li key={user.id} className="rounded-lg border border-slate-200 p-3">
            <p className="font-semibold">{user.name}</p>
            <p className="break-words text-slate-600">{user.email}</p>
          </li>
        ))}

      </ul>
    </section>
  );
}
