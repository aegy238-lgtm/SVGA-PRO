import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyArDAeCOj-yAiiUljGaYA5FWbcKZIFmzWQ",
    authDomain: "svga1-757ac.firebaseapp.com",
    projectId: "svga1-757ac",
    storageBucket: "svga1-757ac.firebasestorage.app",
    messagingSenderId: "824207473831",
    appId: "1:824207473831:web:7246fb461328793effef82"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);