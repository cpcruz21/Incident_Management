export type AccountRole = 'super-admin' | 'admin';

export interface Account {
  id: string;
  name: string;
  role: AccountRole;
  username: string;
}

export function isAdmin(account: Account | null): boolean {
  return account?.role === 'admin' || account?.role === 'super-admin';
}
