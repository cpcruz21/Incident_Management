'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, Eye, EyeOff, Loader2, Search } from 'lucide-react';
import type { Account } from '@/lib/auth';
import { accountFormErrors, accountPasswordErrors } from '@/lib/users/account-form';
import { MIN_PASSWORD_LENGTH, PASSWORD_REQUIREMENTS } from '@/lib/users/password-policy';
import { AccountActionDialog } from './AccountActionDialog';
import './user-management.css';
import './user-management-page.css';

export function UserManagement({ account, personalOnly = false }: { account: Account; personalOnly?: boolean }) {
  const isSuperAdmin = account.role === 'super-admin';
  return (
    <div className="users-workspace users-management">
      <header className="users-page-header">
        <div>
          <h1>{isSuperAdmin && !personalOnly ? 'User Management' : 'Account Settings'}</h1>
        </div>
      </header>
      {isSuperAdmin && !personalOnly && <AdminAccounts currentAccount={account} />}
      {(!isSuperAdmin || personalOnly) && <section className="users-own-account" aria-label="My account">
        <div className="users-own-content">
          <dl className="users-profile-details">
            <div><dt>Name</dt><dd>{account.name}</dd></div>
            <div><dt>Username</dt><dd>{account.username}</dd></div>
            <div><dt>Role</dt><dd>{isSuperAdmin ? 'Super administrator' : 'Administrator'}</dd></div>
          </dl>
          <PasswordForm />
        </div>
      </section>}
    </div>
  );
}

function AdminAccounts({ currentAccount }: { currentAccount: Account }) {
  const formId = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const usernameInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const confirmationInput = useRef<HTMLInputElement>(null);
  const submissionLock = useRef(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; username?: string; password?: string; confirmation?: string }>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [creationMessage, setCreationMessage] = useState('');
  const [selected, setSelected] = useState<{ account: Account; action: 'password' | 'delete' } | null>(null);
  const [accountMessage, setAccountMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    fetch('/api/admin/users', { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Could not load accounts. Please try again.');
        const result = await response.json();
        if (!controller.signal.aborted) setAccounts(result.accounts);
      })
      .catch(() => { if (!controller.signal.aborted) setLoadError('Could not load accounts. Please try again.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loadAttempt]);

  async function addAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionLock.current) return;
    const errors = { ...accountFormErrors(name, username, accounts.map(item => item.username)), ...accountPasswordErrors(password, confirmation) };
    setFieldErrors(errors);
    setError('');
    setCreationMessage('');
    if (errors.name || errors.username || errors.password || errors.confirmation) {
      (errors.name ? nameInput : errors.username ? usernameInput : errors.password ? passwordInput : confirmationInput).current?.focus();
      return;
    }
    submissionLock.current = true;
    setBusy(true);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), username: username.trim().toLowerCase(), password }),
      });
      const result = await response.json();
      if (response.status === 409) {
        setFieldErrors({ username: 'This username is already in use. Choose another.' });
        requestAnimationFrame(() => usernameInput.current?.focus());
        return;
      }
      if (!response.ok) throw new Error(result.error || 'Could not create the account. Please try again.');
      setAccounts(previous => [...previous, result.account]);
      setCreationMessage(`Account created for ${result.account.name}.`);
      setName(''); setUsername(''); setShowPassword(false); setPassword(''); setConfirmation('');
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not create the account. Please try again.');
    } finally {
      submissionLock.current = false;
      setBusy(false);
    }
  }

  const query = search.trim().toLowerCase();
  const filtered = accounts.filter(item => `${item.name} ${item.username}`.toLowerCase().includes(query));

  return (
    <><div className="users-account-layout">
      <section className="users-panel users-directory" aria-labelledby={`${formId}-accounts-heading`}>
        <header className="users-panel-header"><h2 id={`${formId}-accounts-heading`}>Accounts</h2>{!loading && !loadError && <span className="users-account-total">{accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}</span>}</header>
        <label className="users-search"><Search size={18} aria-hidden="true" /><span className="users-sr-only">Search accounts by name or username</span><input type="search" placeholder="Search name or username" value={search} onChange={event => setSearch(event.target.value)} disabled={loading || !!loadError} /></label>
        {loading ? <div className="users-empty" role="status"><Loader2 size={22} className="users-spinner" aria-hidden="true" /><p>Loading accounts…</p></div> : loadError ? <div className="users-empty"><p className="admin-error" role="alert">{loadError}</p><button type="button" className="admin-secondary" onClick={() => setLoadAttempt(value => value + 1)}>Try again</button></div> : <>
          {query && <p className="users-directory-caption" role="status">{filtered.length} of {accounts.length} accounts</p>}
          {filtered.length > 0 && <div className="users-table-scroll" role="region" aria-label="Accounts table" tabIndex={0}><table className="users-table"><thead><tr><th scope="col">Name</th><th scope="col">Username</th><th scope="col">Role</th><th scope="col">Actions</th></tr></thead><tbody>{filtered.map(item => <tr key={item.id}>
            <td>{item.name}{item.id === currentAccount.id && <span className="users-current"> (you)</span>}</td>
            <td>{item.username}</td>
            <td>{item.role === 'super-admin' ? 'Super admin' : 'Admin'}</td>
            <td>{item.role === 'admin' ? <div className="users-table-actions"><button type="button" className="admin-text-button" aria-label={`Reset password for ${item.name}`} onClick={() => { setAccountMessage(''); setSelected({ account: item, action: 'password' }); }}>Reset password</button><button type="button" className="admin-text-button users-delete-action" aria-label={`Delete account for ${item.name}`} onClick={() => { setAccountMessage(''); setSelected({ account: item, action: 'delete' }); }}>Delete</button></div> : <span className="users-no-action">—</span>}</td>
          </tr>)}</tbody></table></div>}
          {!filtered.length && <div className="users-empty"><p>{query ? 'No accounts match your search.' : 'No accounts to display.'}</p>{query && <button type="button" className="admin-text-button" onClick={() => setSearch('')}>Clear search</button>}</div>}
        </>}
        {accountMessage && <p className="users-account-message" role="status">{accountMessage}</p>}
      </section>

      <section className="users-panel users-create-panel" aria-labelledby={`${formId}-create-heading`}>
        <header className="users-panel-header"><h2 id={`${formId}-create-heading`}>New account</h2></header>
          <form className="admin-form users-create-form" onSubmit={addAdmin} noValidate aria-busy={busy}>
            <fieldset disabled={busy}>
              <legend className="users-sr-only">New administrator details</legend>
              <label htmlFor={`${formId}-name`}>Full name</label>
              <input ref={nameInput} id={`${formId}-name`} name="name" value={name} placeholder="e.g. Jamie Santos" autoComplete="off" maxLength={100} required aria-invalid={!!fieldErrors.name} aria-describedby={fieldErrors.name ? `${formId}-name-error` : undefined} onChange={event => { setName(event.target.value); setFieldErrors(previous => ({ ...previous, name: undefined })); setError(''); setCreationMessage(''); }} />
              {fieldErrors.name && <p id={`${formId}-name-error`} className="admin-error" role="alert">{fieldErrors.name}</p>}
              <label htmlFor={`${formId}-username`}>Username</label>
              <input ref={usernameInput} id={`${formId}-username`} name="username" value={username} placeholder="e.g. jamie.santos" autoComplete="off" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={64} required aria-invalid={!!fieldErrors.username} aria-describedby={`${formId}-username-help${fieldErrors.username ? ` ${formId}-username-error` : ''}`} onChange={event => { setUsername(event.target.value.toLowerCase()); setFieldErrors(previous => ({ ...previous, username: undefined })); setError(''); setCreationMessage(''); }} />
              <p id={`${formId}-username-help`} className="users-field-help">3–64 characters. Use letters, numbers, periods, underscores, or hyphens.</p>
              {fieldErrors.username && <p id={`${formId}-username-error`} className="admin-error" role="alert">{fieldErrors.username}</p>}
              <label htmlFor={`${formId}-password`}>Password</label>
              <div className="users-secret-field"><input ref={passwordInput} id={`${formId}-password`} name="password" type={showPassword ? 'text' : 'password'} value={password} minLength={MIN_PASSWORD_LENGTH} maxLength={256} required autoComplete="new-password" aria-invalid={!!fieldErrors.password} aria-describedby={`${formId}-password-help${fieldErrors.password ? ` ${formId}-password-error` : ''}`} onChange={event => { setPassword(event.target.value); setFieldErrors(previous => ({ ...previous, password: undefined, confirmation: undefined })); setError(''); setCreationMessage(''); }} /><button type="button" className="admin-icon-button" aria-label={showPassword ? 'Hide passwords' : 'Show passwords'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
              <p id={`${formId}-password-help`} className="users-field-help">{PASSWORD_REQUIREMENTS}</p>
              {fieldErrors.password && <p id={`${formId}-password-error`} className="admin-error" role="alert">{fieldErrors.password}</p>}
              <label htmlFor={`${formId}-confirmation`}>Confirm password</label>
              <input ref={confirmationInput} id={`${formId}-confirmation`} name="confirmation" type={showPassword ? 'text' : 'password'} value={confirmation} minLength={MIN_PASSWORD_LENGTH} maxLength={256} required autoComplete="new-password" aria-invalid={!!fieldErrors.confirmation} aria-describedby={fieldErrors.confirmation ? `${formId}-confirmation-error` : undefined} onChange={event => { setConfirmation(event.target.value); setFieldErrors(previous => ({ ...previous, confirmation: undefined })); setCreationMessage(''); }} />
              {fieldErrors.confirmation && <p id={`${formId}-confirmation-error`} className="admin-error" role="alert">{fieldErrors.confirmation}</p>}
              <p className="users-form-note">New accounts have administrator access.</p>
              {error && <p className="admin-error" role="alert">{error}</p>}
              <div className="users-form-actions"><button type="submit" className="admin-primary" disabled={busy || loading}>{busy && <Loader2 size={16} className="users-spinner" aria-hidden="true" />}{busy ? 'Creating…' : 'Create account'}</button></div>
              {creationMessage && <p className="users-saved" role="status">{creationMessage}</p>}
            </fieldset>
          </form>
      </section>

    </div>{selected && <AccountActionDialog account={selected.account} action={selected.action} onClose={() => setSelected(null)} onUpdated={deleted => {
      if (deleted) setAccounts(previous => previous.filter(item => item.id !== selected.account.id));
      setAccountMessage(deleted ? `Account for ${selected.account.name} deleted.` : `Password updated for ${selected.account.name}.`);
    }} />}</>
  );
}

function PasswordForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setError(''); setSaved(false);
    const errors = accountPasswordErrors(String(fields.get('password') || ''), String(fields.get('confirmPassword') || ''));
    if (errors.password || errors.confirmation) { setError(errors.password || errors.confirmation || 'Check your new password.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/auth/session', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: fields.get('currentPassword'), password: fields.get('password') }) });
      if (!response.ok) { const result = await response.json().catch(() => null); throw new Error(result?.error || 'Could not update the password.'); }
      form.reset(); setSaved(true);
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Could not update the password.'); }
    finally { setBusy(false); }
  }

  return <form className="admin-form users-password-form" onSubmit={submit}>
    <h2>Change password</h2><p className="users-field-help">{PASSWORD_REQUIREMENTS}</p>
    <fieldset disabled={busy}><legend className="users-sr-only">Change your password</legend>
      <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" maxLength={256} required /></label>
      <label>New password<input name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} maxLength={256} required /></label>
      <label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} maxLength={256} required /></label>
      {error && <p className="admin-error" role="alert">{error}</p>}{saved && <p className="users-saved" role="status"><CheckCircle2 size={17} />Password updated.</p>}
      <button className="admin-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
    </fieldset>
  </form>;
}
