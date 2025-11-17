import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDWt8V6sbl6bkbLtDds1lImsXdHAJn5n6E",
  authDomain: "smart-blood-donation-2911.firebaseapp.com",
  projectId: "smart-blood-donation-2911",
  storageBucket: "smart-blood-donation-2911.appspot.com",
  messagingSenderId: "731740765779",
  appId: "1:731740765779:web:492bd74153d963926150a6",
  measurementId: "G-YTWZHTEXED"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);