// Your web app's Firebase configuration
if (!window.firebaseConfig) {
    window.firebaseConfig = {
    apiKey: "AIzaSyBSvOtPS-YnE_rmBgVGISTrC3qg5PXh3X4",
    authDomain: "kyc-p2p.firebaseapp.com",
    projectId: "kyc-p2p",
    storageBucket: "kyc-p2p.appspot.com",
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

// Initialize Firestore with optimized settings for offline support
const db = firebase.firestore();
db.settings({
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
    experimentalForceLongPolling: true,
    merge: true
});

// Enable offline persistence with retry mechanism
const enablePersistenceWithRetry = async (retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            await db.enablePersistence({
                synchronizeTabs: true
            });
            console.log('Persistence enabled successfully');
            return;
        } catch (err) {
            if (err.code === 'failed-precondition') {
                console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
                break; // No need to retry for this error
            } else if (err.code === 'unimplemented') {
                console.warn('The current browser does not support persistence.');
                break; // No need to retry for this error
            } else {
                console.warn(`Attempt ${i + 1}/${retries} to enable persistence failed:`, err);
                if (i === retries - 1) throw err;
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
            }
        }
    }
};

// Initialize offline persistence
enablePersistenceWithRetry().catch(console.error);

// Set up connection state monitoring
let isConnected = false;
const connectionMonitor = () => {
    const updateConnectionStatus = (online) => {
        if (online !== isConnected) {
            isConnected = online;
            console.log(online ? 'Connected to Firestore' : 'Disconnected from Firestore');
            // Trigger any necessary UI updates
            window.dispatchEvent(new CustomEvent('firestoreConnectionChange', { 
                detail: { isConnected: online } 
            }));
        }
    };

    // Monitor browser online status
    window.addEventListener('online', () => updateConnectionStatus(true));
    window.addEventListener('offline', () => updateConnectionStatus(false));

    // Monitor Firestore connection status
    db.collection('_connection_test_').doc('status')
        .onSnapshot(() => {
            updateConnectionStatus(true);
        }, (error) => {
            console.warn('Firestore connection error:', error);
            updateConnectionStatus(false);
        });
};

// Start connection monitoring
connectionMonitor();

// Export services
window.auth = auth;
window.db = db;
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
}
