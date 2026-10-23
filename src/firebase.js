
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCqx-rgzL8E0YVCDCCwfd1r9XQnq6z-P8Y",
  authDomain: "flood-monitor-971fe.firebaseapp.com",
  projectId: "flood-monitor-971fe",
  storageBucket: "flood-monitor-971fe.firebasestorage.app",
  messagingSenderId: "229214431017",
  appId: "1:229214431017:web:4853608987e42fb406b938",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
