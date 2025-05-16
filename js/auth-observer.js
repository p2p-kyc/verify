// Auth state observer
auth.onAuthStateChanged((user) => {
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    
    if (user) {
        // User is signed in
        window.currentUser = user;
        
        if (currentPath === 'index.html') {
            window.location.href = 'dashboard.html';
        }
    } else {
        // User is signed out
        window.currentUser = null;
        
        if (currentPath !== 'index.html') {
            window.location.href = 'index.html';
        }
    }
});
