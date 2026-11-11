'use client';

import { Eye, EyeOff, LockKeyhole, LogIn, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { Account } from '@/lib/auth';

export function AdminLogin({ onLogin }: { onLogin: (account: Account) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
      });
      const result = await response.json();
      if (!response.ok || !result.account) {
        setError(result.error || 'Sign-in failed.');
        return;
      }
      onLogin(result.account);
    } catch {
      setError('Could not reach the sign-in service. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-login">
      <form className="admin-login-form admin-form" aria-labelledby="sign-in-title" onSubmit={submit}>
        <div className="admin-login-top">
          <span className="equicom-logo"><img className="equicom-logo-art" src="/images/EQUI.png" width="64" height="56" alt="Equicom" /></span>
          <div>
            <p className="admin-kicker">Incident Management</p>
            <p className="admin-login-brand">SMAC Reporting</p>
          </div>
        </div>
        <header className="admin-login-heading">
          <h1 id="sign-in-title">Sign in</h1>
          <p>Use your account to access the reporting workspace.</p>
        </header>
        <div className="admin-login-field">
          <label htmlFor="sign-in-username">Username</label>
          <div className="admin-login-input">
            <UserRound size={18} aria-hidden="true" />
            <input id="sign-in-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={64} required />
          </div>
        </div>
        <div className="admin-login-field">
          <label htmlFor="sign-in-password">Password</label>
          <div className="admin-login-input admin-login-password">
            <LockKeyhole size={18} aria-hidden="true" />
            <input id="sign-in-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" autoCapitalize="none" spellCheck={false} maxLength={256} required />
            <button
              className="admin-login-visibility"
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-controls="sign-in-password"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
        </div>
        {error && <p className="admin-error" role="alert">{error}</p>}
        <button className="admin-primary" type="submit" disabled={busy}>
          <LogIn size={18} aria-hidden="true" /> {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
