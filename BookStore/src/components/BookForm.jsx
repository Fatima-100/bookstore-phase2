import { useState } from 'react';
import { api } from '../api';

const types = {
  PDF: { label: 'PDF', accept: '.pdf', hint: 'a PDF document (.pdf)' },
  UNICODE: { label: 'Unicode text', accept: '.txt', hint: 'a UTF-8 text file (.txt)' },
  AUDIO: { label: 'Audio', accept: '.mp3,.wav,.ogg,.m4a', hint: 'an audio file (.mp3, .wav, .ogg, .m4a)' },
};
const MAX_BYTES = 25 * 1024 * 1024;

// Used for both "submit a book" (no book prop) and "edit a book" (book prop).
export default function BookForm({ book, onSaved, onCancel }) {
  const editing = Boolean(book);
  const uploadedHere = editing && book.fileUrl?.startsWith('/uploads/');
  const [details, setDetails] = useState({
    title: book?.title || '', author: book?.author || '', category: book?.category || '',
    subtitle: book?.subtitle || '', description: book?.description || '',
  });
  const [bookType, setBookType] = useState(book?.bookType || 'PDF');
  const [source, setSource] = useState('link');
  const [fileUrl, setFileUrl] = useState(editing && !uploadedHere ? book.fileUrl : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const change = (event) => setDetails({ ...details, [event.target.name]: event.target.value });

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = form.elements.file?.files?.[0];
    setError('');
    if (!editing && source === 'file' && (!file || file.size === 0 || file.size > MAX_BYTES)) {
      setError('Choose a non-empty file of 25 MB or smaller.');
      return;
    }
    setBusy(true);
    try {
      let data;
      if (editing) {
        const body = { ...details };
        if (!uploadedHere) body.fileUrl = fileUrl;
        data = await api('/api/books/' + encodeURIComponent(book.id), { method: 'PATCH', body });
      } else {
        const body = new FormData();
        Object.entries({ ...details, bookType }).forEach(([key, value]) => body.append(key, value));
        if (source === 'file') body.append('file', file);
        else body.append('fileUrl', fileUrl);
        data = await api('/api/books', { method: 'POST', body });
      }
      onSaved(data.message);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="book-form" onSubmit={submit} aria-busy={busy}>
      <h3>{editing ? 'Edit book' : 'Submit a book'}</h3>
      {editing && book.status === 'approved' && <p className="form-note">This book is public. Your changes are sent for review; the current version stays visible until an administrator approves them.</p>}
      {editing && book.status === 'rejected' && <p className="form-note">Saving your changes resubmits this book for review.</p>}
      <fieldset disabled={busy}>
        {!editing && (
          <label>Format
            <select value={bookType} onChange={(event) => setBookType(event.target.value)}>
              {Object.entries(types).map(([value, type]) => <option key={value} value={value}>{type.label}</option>)}
            </select>
          </label>
        )}
        <label>Title<input name="title" value={details.title} onChange={change} required maxLength={200} /></label>
        <label>Author<input name="author" value={details.author} onChange={change} required maxLength={200} /></label>
        <label>Category<input name="category" value={details.category} onChange={change} required maxLength={100} placeholder="e.g. History, Technology" /></label>
        <label>Subtitle (optional)<input name="subtitle" value={details.subtitle} onChange={change} maxLength={300} /></label>
        <label>Description<textarea name="description" value={details.description} onChange={change} maxLength={2000} rows={3} /></label>

        {!editing && (
          <div className="source-choice" role="group" aria-label="How do you provide the file?">
            <label><input type="radio" checked={source === 'link'} onChange={() => setSource('link')} /> File link (URL)</label>
            <label><input type="radio" checked={source === 'file'} onChange={() => setSource('file')} /> Upload a file</label>
          </div>
        )}
        {uploadedHere ? (
          <p className="form-note">The uploaded file is kept. To use a different file, delete this book and submit it again.</p>
        ) : (editing || source === 'link') ? (
          <label>File link<input type="url" value={fileUrl} onChange={(event) => setFileUrl(event.target.value)} required placeholder="https://…/book.pdf" /><small>Only link to books you may legally share.</small></label>
        ) : (
          <label>File<input key={bookType} type="file" name="file" accept={types[bookType].accept} required /><small>{types[bookType].hint}, up to 25 MB. Only upload books you may legally share.</small></label>
        )}
      </fieldset>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Submit for review'}</button>
        <button type="button" className="ghost-button" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
