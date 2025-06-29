// Firebase configuration
window.firebaseConfig = {
    apiKey: "AIzaSyBSvOtPS-YnE_rmBgVGISTrC3qg5PXh3X4",
    authDomain: "kyc-p2p.firebaseapp.com",
    projectId: "kyc-p2p",
    storageBucket: "kyc-p2p.appspot.com",
    messagingSenderId: "23065739958",
    appId: "1:23065739958:web:a3fda008f7cdb7ee581c17",
    measurementId: "G-PX3PQZVDRS"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(window.firebaseConfig);
}

// Initialize and export services to window
window.auth = firebase.auth();
window.db = firebase.firestore();
window.currentUser = null;
window.userRole = null;

// Configure Firestore settings
window.db.settings({
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
    experimentalForceLongPolling: true,
    merge: true
});

// Enable offline persistence
window.db.enablePersistence({
    synchronizeTabs: true
}).catch((err) => {
    if (err.code === 'failed-precondition') {
        // Multiple tabs open, persistence can only be enabled in one tab
        // This is normal and doesn't affect main functionality
        console.info('Multiple tabs open, persistence enabled in another tab.');
    } else if (err.code === 'unimplemented') {
        console.warn('The current browser does not support persistence.');
    } else {
        console.error('Error enabling persistence:', err);
    }
});

// Clear IndexedDB cache if there are compatibility issues
if (window.indexedDB) {
    window.indexedDB.deleteDatabase('firestore/kyc-p2p/main')
        .onsuccess = () => {
            console.info('IndexedDB cache cleared successfully.');
        };
}

// Set up connection monitoring
const updateConnectionStatus = (online) => {
    console.log(online ? 'Connected to Firestore' : 'Disconnected from Firestore');
    window.dispatchEvent(new CustomEvent('firestoreConnectionChange', { 
        detail: { isConnected: online } 
    }));
};

// Monitor browser online status
window.addEventListener('online', () => updateConnectionStatus(true));
window.addEventListener('offline', () => updateConnectionStatus(false));

// Auth state observer
window.auth.onAuthStateChanged((user) => {
    window.currentUser = user;
    
    // Get current page
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    
    if (user) {
        // User is signed in
        if (currentPath === 'index.html') {
            redirectTo('dashboard.html');
        }
    } else {
        // User is signed out
        if (currentPath !== 'index.html') {
            redirectTo('index.html');
        }
    }
});

// Función helper para manejar rutas base en GitHub Pages
function getBasePath() {
    // Si estamos en GitHub Pages con la ruta /verify/, usar esa ruta base
    if (window.location.pathname.includes('/verify/')) {
        return '/verify/';
    }
    // En desarrollo local, usar ruta relativa
    return './';
}

// Función helper para redirecciones
function redirectTo(path) {
    window.location.href = getBasePath() + path;
}
