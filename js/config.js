// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBSvOtPS-YnE_rmBgVGISTrC3qg5PXh3X4",
    authDomain: "kyc-p2p.firebaseapp.com",
    databaseURL: "https://kyc-p2p-default-rtdb.firebaseio.com",
    projectId: "kyc-p2p",
    storageBucket: "kyc-p2p.firebasestorage.app",
    messagingSenderId: "23065739958",
    appId: "1:23065739958:web:a3fda008f7cdb7ee581c17",
    measurementId: "G-PX3PQZVDRS"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Global state
let currentUser = null;

// Auth state observer
auth.onAuthStateChanged((user) => {
    currentUser = user;
    if (user) {
        // User is signed in
        if (window.location.pathname === '/index.html' || window.location.pathname === '/') {
            window.location.href = '/dashboard.html';
        }
    } else {
        // User is signed out
        if (window.location.pathname !== '/index.html' && window.location.pathname !== '/') {
            window.location.href = '/index.html';
        }
    }
});
