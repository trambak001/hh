// Firebase Configuration for Virtual Holi Party
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js';
import { getDatabase, ref, set, push, onChildAdded, onValue, remove, update, get } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-database.js';

const firebaseConfig = {
    apiKey: "AIzaSyCarz1st48xxqhvbsJSc3Vp6rR_twqUfIk",
    authDomain: "virtual-holi-party.firebaseapp.com",
    databaseURL: "https://virtual-holi-party-default-rtdb.asia-southeast1.firebasedatabase.app/",
    projectId: "virtual-holi-party",
    storageBucket: "virtual-holi-party.firebasestorage.app",
    messagingSenderId: "461385865902",
    appId: "1:461385865902:web:406890c49a0806cb922b3f"
};


const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db, ref, set, push, onChildAdded, onValue, remove, update, get };
