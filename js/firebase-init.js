// Variable to track initialization status
let isInitialized = false;
let initializationPromise = null;

// Initialize Firestore with persistence
const initializeFirestore = async () => {
    // Return existing promise if initialization is in progress
    if (initializationPromise) {
        return initializationPromise;
    }

    // Return early if already initialized
    if (isInitialized) {
        return window.db;
    }

    // Start initialization
    initializationPromise = (async () => {
    try {
        // Enable offline persistence
        await firebase.firestore().enablePersistence({
            synchronizeTabs: true
        }).catch((err) => {
            if (err.code == 'failed-precondition') {
                console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
            } else if (err.code == 'unimplemented') {
                console.warn('The current browser does not support persistence');
            }
        });

        // Initialize Firestore
        const db = firebase.firestore();
        
        // Set up connection state listener
        const connectedRef = firebase.database().ref('.info/connected');
        connectedRef.on('value', (snap) => {
            if (snap.val() === true) {
                console.log('Connected to Firebase');
                if (typeof hideOfflineMessage === 'function') {
                    hideOfflineMessage();
                }
            } else {
                console.log('Not connected to Firebase');
                if (typeof showOfflineMessage === 'function') {
                    showOfflineMessage();
                }
            }
        });

        // Configure cache size (optional)
        db.settings({
            cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
        });

        window.db = db;
        console.log('Firestore initialized successfully with persistence');
        isInitialized = true;
        return db;
    } catch (error) {
        console.error('Error initializing Firestore:', error);
        throw error;
    } finally {
        initializationPromise = null;
    }
    })();

    return initializationPromise;
};

// Export for use in other files
window.initializeFirestore = initializeFirestore;
