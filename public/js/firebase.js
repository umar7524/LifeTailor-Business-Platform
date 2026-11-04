import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

const app = initializeApp(firebaseConfig);

// Offline cache that works across several tabs/windows (browser tab + installed app) at once,
// so saved customers/orders can be shown straight from the device while the network catches up.
// Auto-detect long polling stops slow mobile networks/proxies from stalling the live connection.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  experimentalAutoDetectLongPolling: true
});
export const auth = getAuth(app);

export const authReady = new Promise((resolve, reject) => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    unsubscribe();
    if (user) { resolve(user); return; }
    signInAnonymously(auth).then((cred) => resolve(cred.user)).catch(reject);
  }, reject);
});
