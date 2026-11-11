export function accountFormErrors(name: string, username: string, existing: string[]) {
  const errors: { name?: string; username?: string } = {};
  if (!name.trim()) errors.name = 'Enter the person’s full name.';
  else if (name.trim().length > 100) errors.name = 'Use 100 characters or fewer.';
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,64}$/.test(normalized)) {
    errors.username = 'Use 3–64 letters, numbers, periods, underscores, or hyphens.';
  } else if (normalized === 'super-admin' || existing.some(value => value.toLowerCase() === normalized)) {
    errors.username = 'This username is already in use. Choose another.';
  }
  return errors;
}

export function accountPasswordErrors(password: string, confirmation: string) {
  const errors: { password?: string; confirmation?: string } = {};
  if (!isValidPassword(password)) errors.password = PASSWORD_REQUIREMENTS;
  if (password !== confirmation) errors.confirmation = 'The passwords do not match.';
  return errors;
}
import { isValidPassword, PASSWORD_REQUIREMENTS } from './password-policy';

