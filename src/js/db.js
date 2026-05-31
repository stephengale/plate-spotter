import { initializeApp }                                from 'firebase/app';
import {
  getFirestore,
  collection, doc,
  addDoc, getDocs, updateDoc, deleteDoc,
  query, where, writeBatch,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { firebaseConfig } from '../firebase-config.js';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ── Access Tokens ──────────────────────────────────────────────────────────

export async function verifyToken(token) {
  if (!token) return false;
  const q = query(
    collection(db, 'accessTokens'),
    where('token',  '==', token),
    where('active', '==', true),
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

// ── Users ──────────────────────────────────────────────────────────────────

export async function getUsers() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? 0;
      return tb - ta;
    });
}

export async function getUsersByIds(ids) {
  if (!ids.length) return [];
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs
    .filter(d => ids.includes(d.id))
    .map(d => ({ id: d.id, ...d.data() }));
}

export async function createUser(name) {
  const ref = await addDoc(collection(db, 'users'), {
    name,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, name };
}

// ── Sessions ───────────────────────────────────────────────────────────────

export async function getSessions() {
  const snap = await getDocs(collection(db, 'sessions'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(s => s.status === 'active' || s.status === 'completed')
    .sort((a, b) => {
      const ta = a.startedAt?.toMillis?.() ?? 0;
      const tb = b.startedAt?.toMillis?.() ?? 0;
      return tb - ta;
    });
}

export async function createSession({ name, playerIds }) {
  const ref = await addDoc(collection(db, 'sessions'), {
    name,
    playerIds,
    status:     'active',
    startedAt:  serverTimestamp(),
    savedAt:    null,
    finishedAt: null,
  });
  return { id: ref.id, name, playerIds, status: 'active' };
}

export async function updateSession(sessionId, data) {
  await updateDoc(doc(db, 'sessions', sessionId), data);
}

export async function deleteSession(sessionId) {
  const spotsSnap = await getDocs(collection(db, 'sessions', sessionId, 'spots'));
  // Delete spots in batches of 500 (Firestore limit)
  const chunks = [];
  for (let i = 0; i < spotsSnap.docs.length; i += 500) {
    chunks.push(spotsSnap.docs.slice(i, i + 500));
  }
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    chunk.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteDoc(doc(db, 'sessions', sessionId));
}

// ── Spots ──────────────────────────────────────────────────────────────────

export async function addSpot(sessionId, { playerId, stateCode, variantId = null }) {
  await addDoc(collection(db, 'sessions', sessionId, 'spots'), {
    playerId,
    stateCode,
    variantId,
    timestamp: serverTimestamp(),
  });
  // Best-effort savedAt update — not awaited
  updateDoc(doc(db, 'sessions', sessionId), { savedAt: serverTimestamp() }).catch(() => {});
}

export async function getSessionSpots(sessionId) {
  const snap = await getDocs(collection(db, 'sessions', sessionId, 'spots'));
  return snap.docs.map(d => d.data());
}

export function subscribeToSpots(sessionId, callback) {
  return onSnapshot(
    collection(db, 'sessions', sessionId, 'spots'),
    snap => callback(snap.docs.map(d => d.data())),
  );
}
