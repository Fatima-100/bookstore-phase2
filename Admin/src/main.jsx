import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const formats = {
  PDF: { label: 'PDF', accept: '.pdf', hint: 'A PDF document (.pdf)' },
  UNICODE: { label: 'Unicode', accept: '.txt', hint: 'A Unicode text book saved as UTF-8 (.txt)' },
  AUDIO: { label: 'Audio', accept: '.mp3,.wav,.ogg,.m4a', hint: 'An audio book (.mp3, .wav, .ogg, .m4a)' },
};
const emptyDetails = { title: '', author: '', category: '', subtitle: '' };

function App() {
  const [token, setToken] = useState(''); // holds the admin's user id while signed in; the real session is an HttpOnly cookie
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bookType, setBookType] = useState('PDF');
  const [books, setBooks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [listError, setListError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [details, setDetails] = useState(emptyDetails);
  const editorRef = useRef(null);

  // READ: GET the saved list from the local server.
  async function loadBooks() {
    try {
      const response = await fetch('/api/my/books?limit=100', {
        method: 'GET',
      });
      if (response.status === 401) {
        setToken('');
        setError('Please sign in as admin again.');
        return;
      }
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!Array.isArray(data.books)) throw new Error();
      setBooks(data.books);
      setListError('');
    } catch {
      setListError('Could not load the catalogue. Check the server and refresh the list.');
    }
  }

  useEffect(() => {
    if (token) loadBooks();
  }, [token]);

  // Resume an existing admin session after a page refresh.
  useEffect(() => {
    fetch('/api/auth/me').then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data?.user?.role === 'admin') setToken(data.user.id); })
      .catch(() => {});
  }, []);

  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message);
        return;
      }
      if (data.user?.role !== 'admin') {
        await fetch('/api/auth/logout', { method: 'POST' });
        setError('This account is not an administrator.');
        return;
      }
      setToken(data.user.id);
      setPassword('');
    } catch {
      setError('Cannot reach the server. Start Server with yarn dev.');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Clear the local login even if the server is unavailable.
    } finally {
      setToken('');
      setPassword('');
      setMessage('');
      setError('');
      setBusy(false);
      resetEditor();
    }
  }

  function resetEditor() {
    setEditingId(null);
    setDetails(emptyDetails);
    setBookType('PDF');
  }

  function changeDetails(event) {
    setDetails({ ...details, [event.target.name]: event.target.value });
  }

  function editBook(book) {
    setEditingId(book.id);
    setDetails({ title: book.title, author: book.author, category: book.category, subtitle: book.subtitle || '' });
    setBookType(book.bookType);
    setError('');
    setMessage('');
    editorRef.current.querySelector('input[name="title"]').focus();
    editorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // DELETE: the selected book ID goes in the URL.
  async function deleteBook(book) {
    if (!window.confirm(`Delete “${book.title}” from the library?`)) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/books/' + encodeURIComponent(book.id), {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) setToken('');
        setError(data.message || 'Could not delete the book.');
        return;
      }
      if (editingId === book.id) resetEditor();
      setMessage(data.message);
      await loadBooks();
    } catch {
      setError('Cannot delete the book. Check that the server is running.');
    } finally {
      setBusy(false);
    }
  }

  // CREATE uses POST + FormData. UPDATE uses PUT + JSON.
  async function saveBook(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = editingId ? JSON.stringify(details) : new FormData(form);
    const file = editingId ? null : body.get('file');
    setMessage('');
    setError('');
    if (!editingId && (!file?.size || file.size > 25 * 1024 * 1024)) {
      setError('Choose a non-empty file of 25 MB or smaller.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const url = editingId ? '/api/books/' + encodeURIComponent(editingId) : '/api/books';
      const response = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: editingId ? { 'Content-Type': 'application/json' } : {},
        body,
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) setToken('');
        setError(data.message || 'Could not save the book.');
        return;
      }
      setMessage(data.message);
      form.reset();
      resetEditor();
      await loadBooks();
    } catch {
      setError('Cannot save the book. Check that the server is running.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header className="site-header">
        <div><a className="brand" href="/">KitabGhar<span>.</span></a><span className="admin-label">ADMIN</span></div>
        {token && <button className="secondary-button" disabled={busy} onClick={logout}>Sign out</button>}
      </header>

      {!token ? (
        <section className="login-panel">
          <span className="eyebrow">YOUR LIBRARY, THOUGHTFULLY CURATED</span>
          <h1>Welcome, admin.</h1>
          <p>Sign in to add the next book to your shelves.</p>
          <form onSubmit={login}>
            <label>E-mail<input name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required disabled={busy} /></label>
            <label>Password<input name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required disabled={busy} /></label>
            {error && <p className="notice error" role="alert">{error}</p>}
            <button className="primary-button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in →'}</button>
          </form>
          <small>Admin accounts are created on the server with <code>npm run create-admin</code>. Approving user submissions is done in the BookStore app (Admin Review).</small>
        </section>
      ) : (
        <>
          <div className="page-heading"><span className="eyebrow">MAKE ROOM FOR A NEW STORY</span><h1>Your library studio.</h1><p>Add, browse, edit, and delete books in your local collection.</p></div>
          <div className="dashboard">
            <section ref={editorRef}>
              <h2>{editingId ? 'Edit book details' : 'Add a book'}</h2>
              <p className="section-description">Books you add here are published immediately. Books from other users are reviewed in the BookStore app.</p>
              <form onSubmit={saveBook} aria-busy={busy}>
                <fieldset disabled={busy}>
                  <legend>{editingId ? 'Book format' : '1. Choose a format'}</legend>
                  {editingId ? <p className="edit-note">{formats[bookType].label} · The existing book file is kept while editing its details.</p> : <div className="format-options">
                    {Object.entries(formats).map(([value, format]) => (
                      <label className={bookType === value ? 'format-option selected' : 'format-option'} key={value}>
                        <input type="radio" name="bookType" value={value} checked={bookType === value} onChange={() => { setBookType(value); setError(''); }} />{format.label}
                      </label>
                    ))}
                  </div>}
                  <div className="form-fields">
                    <label>Book title<input name="title" value={details.title} onChange={changeDetails} required maxLength="200" placeholder="Enter the book title" /></label>
                    <label>Author<input name="author" value={details.author} onChange={changeDetails} required maxLength="200" placeholder="Author’s name" /></label>
                    <label>Category<input name="category" value={details.category} onChange={changeDetails} required maxLength="100" placeholder="e.g. Literature, History, Technology" /></label>
                    <label>Subtitle <span className="optional">(optional)</span><input name="subtitle" value={details.subtitle} onChange={changeDetails} maxLength="300" placeholder="A short description" /></label>
                  </div>
                  {!editingId && <label className="file-label">2. Upload your file<input key={bookType} type="file" name="file" accept={formats[bookType].accept} required /><small>{formats[bookType].hint}. Maximum 25 MB.</small></label>}
                </fieldset>
                {error && <p className="notice error" role="alert">{error}</p>}
                {message && <p className="notice success" role="status">{message}</p>}
                <button className="primary-button" disabled={busy}>{busy ? 'Saving…' : editingId ? 'Save changes →' : 'Upload & add to library →'}</button>
                {editingId && <button type="button" className="cancel-edit" disabled={busy} onClick={resetEditor}>Cancel editing</button>}
              </form>
            </section>
            <aside>
              <div className="catalogue-heading"><h2>On the shelves <span>{books.length}</span></h2><button className="text-button" disabled={busy} onClick={loadBooks}>Refresh</button></div>
              {listError && <p className="notice error" role="alert">{listError}</p>}
              <ul className="catalogue-list">
                {books.map((book) => (
                  <li key={book.id} className={editingId === book.id ? 'editing-row' : ''}>
                    <span className={'format-mark ' + book.bookType.toLowerCase()}>{formats[book.bookType]?.label || book.bookType}</span>
                    <div className="book-row-details">
                      <strong dir="auto">{book.title}</strong><small>{book.author} · {book.status}</small>
                      <div className="row-actions">
                        <button type="button" disabled={busy} onClick={() => editBook(book)} aria-label={'Edit ' + book.title}>Edit</button>
                        <button type="button" className="delete-button" disabled={busy} onClick={() => deleteBook(book)} aria-label={'Delete ' + book.title}>Delete</button>
                        <a href={book.fileUrl} target="_blank" rel="noopener noreferrer" aria-label={'Open ' + book.title + ' in a new tab'}>Open file ↗</a>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {!books.length && !listError && <p className="section-description">Your collection will appear here.</p>}
              <p className="catalogue-note">New books appear in BookStore after refreshing the page.</p>
            </aside>
          </div>
        </>
      )}
      <footer>KitabGhar · A small collection. A world of ideas.</footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
