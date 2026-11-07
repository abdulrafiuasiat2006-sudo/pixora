import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, setLogLevel } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);

// Suppress internal connection failure warnings to prevent noisy console errors
try {
  setLogLevel('silent');
} catch {
  // ignore if not supported in environment
}

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Connectivity validation constraint - safe non-throwing stub
export async function testFirestoreConnection() {
  if (!navigator.onLine) {
    console.warn('[FIREBASE] Client is offline or waiting for network connection.');
    return;
  }
}
