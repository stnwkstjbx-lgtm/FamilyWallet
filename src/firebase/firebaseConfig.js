import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyD4GhzLa4G16iPZRSeI5Zn_aJdk1_5NhYM",
  authDomain: "family-wallet-9dfb0.firebaseapp.com",
  projectId: "family-wallet-9dfb0",
  storageBucket: "family-wallet-9dfb0.firebasestorage.app",
  messagingSenderId: "1077460257278",
  appId: "1:1077460257278:web:65444c57218ec7ea5b58af"
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
const auth = getAuth(app);

export { db, auth };