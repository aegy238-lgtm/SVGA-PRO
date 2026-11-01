import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use the database ID from the config if provided, otherwise use the default
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");

export const storage = getStorage(app);
