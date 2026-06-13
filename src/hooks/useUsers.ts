import { useEffect, useSyncExternalStore } from 'react';
import { apiJson, onApiCacheUpdate } from '../lib/api';

type UserRole = 'admin' | 'user';

type UserListItem = {
  uid: string;
  email?: string;
  displayname: string;
  photourl: string;
  role: UserRole;
};

type UserApiItem = {
  uid: string;
  displayname: string;
  photourl: string;
  role?: string;
};

type UsersSnapshot = {
  users: UserListItem[];
  loading: boolean;
};

const USERS_PATH = '/api/users';
const listeners = new Set<() => void>();
let snapshot: UsersSnapshot = { users: [], loading: true };
let usersRequest: Promise<void> | null = null;
let hasLoadedUsers = false;
let cacheSubscription: (() => void) | null = null;

function normalizeUsers(data: UserApiItem[]): UserListItem[] {
  return data.map((u) => ({
    uid: u.uid,
    displayname: u.displayname,
    photourl: u.photourl,
    role: u.role === 'admin' ? 'admin' : 'user',
  }));
}

function emitUsersChange() {
  listeners.forEach((listener) => listener());
}

function setSnapshot(next: UsersSnapshot) {
  snapshot = next;
  emitUsersChange();
}

function subscribeUsers(listener: () => void) {
  listeners.add(listener);
  ensureUsersLoaded();
  ensureCacheSubscription();
  return () => {
    listeners.delete(listener);
  };
}

function ensureCacheSubscription() {
  if (cacheSubscription || typeof window === 'undefined') return;
  cacheSubscription = onApiCacheUpdate<UserApiItem[]>(USERS_PATH, (data) => {
    setSnapshot({ users: normalizeUsers(data), loading: false });
  });
}

function ensureUsersLoaded() {
  if (hasLoadedUsers) return Promise.resolve();
  if (usersRequest) return usersRequest;

  usersRequest = (async () => {
    try {
      const data = await apiJson<UserApiItem[]>(USERS_PATH);
      hasLoadedUsers = true;
      setSnapshot({ users: normalizeUsers(data), loading: false });
    } finally {
      if (snapshot.loading) {
        setSnapshot({ ...snapshot, loading: false });
      }
      usersRequest = null;
    }
  })();

  return usersRequest;
}

export const useKnownUsers = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      ensureCacheSubscription();
      return () => {
        listeners.delete(listener);
      };
    },
    () => snapshot.users,
    () => snapshot.users
  );

export const useUsers = () => {
  const current = useSyncExternalStore(subscribeUsers, () => snapshot, () => snapshot);

  useEffect(() => {
    ensureUsersLoaded();
    ensureCacheSubscription();
  }, []);

  return current;
};
