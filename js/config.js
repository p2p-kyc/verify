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

// Configure Firestore settings before initialization
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    firebase.firestore.setLogLevel('debug');
}

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const auth = firebase.auth();
const storage = firebase.storage();

// Initialize Firestore with settings
const db = firebase.firestore();
db.settings({
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
});

// Enable persistence after initialization
db.enablePersistence({
    synchronizeTabs: true
}).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.log('Multiple tabs open, persistence can only be enabled in one tab at a time.');
    } else if (err.code == 'unimplemented') {
        console.log('The current browser does not support persistence.');
    }
});

// Export services
window.auth = auth;
window.db = db;
window.storage = storage;
window.currentUser = null;

// Auth state observer
auth.onAuthStateChanged((user) => {
    window.currentUser = user;
    
    // Get current page
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    
    if (user) {
        // User is signed in
        if (currentPath === 'index.html') {
            window.location.href = 'dashboard.html';
        }
    } else {
        // User is signed out
        if (currentPath !== 'index.html') {
            window.location.href = 'index.html';
        }
    }
});
