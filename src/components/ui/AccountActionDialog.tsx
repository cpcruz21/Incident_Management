'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Check, Copy, Eye, EyeOff, Loader2, RefreshCw, X } from 'lucide-react';
import type { Account } from '@/lib/auth';
import { accountPasswordErrors } from '@/lib/users/account-form';
import { MIN_PASSWORD_LENGTH, PASSWORD_REQUIREMENTS } from '@/lib/users/password-policy';

export function AccountActionDialog({ account, action, onClose, onUpdated }: {
  account: Account;
  action: 'password' | 'delete';
  onClose: () => void;
  onUpdated: (deleted: boolean) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const id = useId();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const deleting = action === 'delete';

  useEffect(() => { const dialog = dialogRef.current; dialog?.showModal(); return () => dialog?.close(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || complete) return;
    setError('');
    if (!deleting) {
      const errors = accountPasswordErrors(password, confirmation);
      if (errors.password || errors.confirmation) { setError(errors.password || errors.confirmation || 'Check the new password.'); return; }
    }
    lock.current = true; setBusy(true);
    try {
      const response = await fetch('/api/admin/users', {
        method: deleting ? 'DELETE' : 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deleting ? { id: account.id } : { id: account.id, password }),
      });
      if (!response.ok) { const result = await response.json().catch(() => null); throw new Error(result?.error || 'Could not update the account. Please try again.'); }
      onUpdated(deleting);
      if (deleting) onClose();
      else { setComplete(true); setShow(false); setConfirmation(''); }
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Could not update the account. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(`Username: ${account.username}\nPassword: ${password}`); setCopied(true); setCopyMessage('Sign-in details copied. Share them privately with the account owner.'); }
    catch { setShow(true); setCopied(false); setCopyMessage('Copy is unavailable. Select and copy the password manually.'); }
  }

  return <dialog ref={dialogRef} className="users-action-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={event => { if (busy) event.preventDefault(); else onClose(); }}>
    <header><h2 id={`${id}-title`}>{deleting ? 'Delete account?' : complete ? 'Password updated' : 'Reset password'}</h2><button type="button" className="admin-icon-button" aria-label="Close account dialog" disabled={busy} onClick={onClose}><X size={19} /></button></header>
    <p id={`${id}-description`}>{deleting ? 'This removes sign-in access immediately. Existing reports and audit history will remain.' : complete ? 'Existing sessions have been signed out. Save the new password before you close this window.' : 'Choose a new password for this administrator. Their existing sessions will be signed out.'}</p>
    <div className="users-dialog-person"><strong>{account.name}</strong><span>@{account.username}</span></div>
    {complete ? <div className="users-created users-reset-complete"><label htmlFor={`${id}-saved-password`}>New password</label><div className="users-secret-field"><input id={`${id}-saved-password`} type={show ? 'text' : 'password'} value={password} readOnly onFocus={event => event.currentTarget.select()} autoComplete="off" /><button type="button" className="admin-icon-button" aria-label={show ? 'Hide new password' : 'Show new password'} aria-pressed={show} onClick={() => setShow(value => !value)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div><div className="users-created-actions"><button type="button" className="admin-primary" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied' : 'Copy sign-in details'}</button><button type="button" className="admin-secondary" onClick={onClose} autoFocus>Done</button></div><p className="users-copy-message" role="status">{copyMessage}</p></div> : <form className="admin-form" onSubmit={submit} aria-busy={busy}><fieldset disabled={busy}>
      {!deleting && <>
        <label htmlFor={`${id}-password`}>New password</label><div className="users-secret-field"><input id={`${id}-password`} name="password" type={show ? 'text' : 'password'} value={password} minLength={MIN_PASSWORD_LENGTH} maxLength={256} required autoComplete="new-password" autoFocus onChange={event => { setPassword(event.target.value); setError(''); }} /><button type="button" className="admin-icon-button" aria-label={show ? 'Hide new password' : 'Show new password'} aria-pressed={show} onClick={() => setShow(value => !value)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
        <p className="users-field-help">{PASSWORD_REQUIREMENTS}</p><button type="button" className="admin-text-button users-generate-password" onClick={() => { const bytes = crypto.getRandomValues(new Uint8Array(24)); const generated = 'Aa!' + Array.from(bytes, value => value.toString(16).padStart(2, '0')).join(''); setPassword(generated); setConfirmation(generated); setShow(true); setError(''); }}><RefreshCw size={14} />Generate password</button>
        <label htmlFor={`${id}-confirm`}>Confirm new password</label><input id={`${id}-confirm`} name="confirmation" type={show ? 'text' : 'password'} value={confirmation} minLength={MIN_PASSWORD_LENGTH} maxLength={256} required autoComplete="new-password" onChange={event => { setConfirmation(event.target.value); setError(''); }} />
      </>}
      {error && <p className="admin-error" role="alert">{error}</p>}
      <div className="users-dialog-actions"><button type="button" className="admin-secondary" onClick={onClose} autoFocus={deleting}>Cancel</button><button type="submit" className={deleting ? 'admin-primary users-danger-button' : 'admin-primary'} disabled={busy}>{busy && <Loader2 size={16} className="users-spinner" />}{busy ? (deleting ? 'Deleting…' : 'Updating…') : deleting ? 'Delete account' : 'Update password'}</button></div>
    </fieldset></form>}
  </dialog>;
}
