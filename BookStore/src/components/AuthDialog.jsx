import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { api } from '../api';

export default function AuthDialog({ onClose, onLogin, intent }) {
  const dialogRef = useRef(null);
  const requestRef = useRef(null);
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const registering = mode === 'register';

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => {
      dialog.close();
      requestRef.current?.abort();
    };
  }, []);

  function changeMode(nextMode) {
    setMode(nextMode);
    setPassword('');
    setConfirmPassword('');
    setError('');
    setMessage('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;
    if (registering && password !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true);
    setError('');
    setMessage('');

    try {
      const body = registering ? { name, email, password, confirmPassword } : { email, password };
      const data = await api(`/api/auth/${mode}`, { method: 'POST', body, signal: controller.signal });
      if (registering) {
        setMode('login');
        setPassword('');
        setConfirmPassword('');
        setMessage('Account created! Log in to continue.');
      } else if (data.user?.id) {
        onLogin(data.user);
      } else {
        setError('The server returned an invalid login response. Please try again.');
      }
    } catch (caught) {
      if (caught.name !== 'AbortError') setError(caught.message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="auth-dialog" aria-labelledby="auth-title" aria-describedby="auth-description" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="auth-content">
        <button type="button" className="auth-close" onClick={onClose} aria-label="Close login form">×</button>
        <span className="auth-icon"><Icon name="audio" /></span>
        <p className="eyebrow">{intent === 'audio' ? 'A LITTLE LISTENING AWAITS' : 'YOUR OWN SHELF'}</p>
        <h2 id="auth-title">{registering ? 'Your next chapter starts here.' : 'Welcome back, reader.'}</h2>
        <p id="auth-description">Log in or create an account to listen to audiobooks and submit your own books.</p>
        <div className="auth-tabs" role="group" aria-label="Choose login or registration">
          <button type="button" aria-pressed={!registering} disabled={busy} onClick={() => changeMode('login')}>Login</button>
          <button type="button" aria-pressed={registering} disabled={busy} onClick={() => changeMode('register')}>Register</button>
        </div>
        <form onSubmit={handleSubmit} aria-busy={busy}>
          {registering && <label htmlFor="auth-name">Your name<input id="auth-name" name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={100} disabled={busy} /></label>}
          <label htmlFor="auth-email">Email address<input id="auth-email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={busy} autoFocus /></label>
          <label htmlFor="auth-password">Password{registering && ' (at least 8 characters)'}<input id="auth-password" name="password" type="password" autoComplete={registering ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={registering ? 8 : undefined} disabled={busy} /></label>
          {registering && <label htmlFor="auth-confirm">Confirm password<input id="auth-confirm" name="confirmPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required disabled={busy} /></label>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          {message && <p className="auth-success" role="status">{message}</p>}
          <button type="submit" className="primary-button auth-submit" disabled={busy}>{busy ? 'Please wait…' : registering ? 'Create account' : 'Login'}<Icon name="arrow" /></button>
        </form>
        <button type="button" className="auth-later" onClick={onClose}>Keep browsing books</button>
      </div>
    </dialog>
  );
}
