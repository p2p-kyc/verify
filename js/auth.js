// Toggle between login and register forms
function toggleForms() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    if (loginForm.style.display === 'none') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    }
}

// Handle login
async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
        window.location.href = '/dashboard.html';
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// Handle register
async function handleRegister(event) {
    event.preventDefault();
    
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const username = document.getElementById('registerUsername') ? document.getElementById('registerUsername').value : '';
    const binanceId = document.getElementById('registerBinanceId') ? document.getElementById('registerBinanceId').value : '';
    
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        
        // Create user document in Firestore
        await db.collection('users').doc(userCredential.user.uid).set({
            email: email,
            username: username,
            binanceId: binanceId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            role: 'user'
        });
        
        window.location.href = '/dashboard.html';
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// Handle logout
function handleLogout() {
    auth.signOut()
        .then(() => {
            window.location.href = '/index.html';
        })
        .catch((error) => {
            alert('Error: ' + error.message);
        });
}

// Check if user is administrator
async function isAdmin(uid) {
    try {
        const userDoc = await window.db.collection('users').doc(uid).get();
        return userDoc.exists && userDoc.data().role === 'admin';
    } catch (error) {
        console.error('Error checking admin status:', error);
        return false;
    }
}

// Global variables
if (typeof window.userRole === 'undefined') {
    window.userRole = null;
}
if (typeof window.currentUser === 'undefined') {
    window.currentUser = null;
}

// Listen for authentication state changes
window.auth.onAuthStateChanged(async (user) => {
    if (user) {
        // Authenticated user
        window.currentUser = user;
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (userDoc.exists) {
            // Update last access and save role
            const userData = userDoc.data();
            window.userRole = userData.role;
            await window.db.collection('users').doc(user.uid).update({
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            // Create user document if it doesn't exist
            window.userRole = 'user'; // default role
            await window.db.collection('users').doc(user.uid).set({
                email: user.email,
                role: userRole,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        // Update UI
        document.querySelectorAll('.auth-required').forEach(el => el.style.display = 'block');
        document.querySelectorAll('.no-auth-required').forEach(el => el.style.display = 'none');
        
        // Show user email
        const userEmailElements = document.getElementsByClassName('user-email');
        Array.from(userEmailElements).forEach(element => {
            element.textContent = user.email;
        });

        // Redirect if not admin and on admin.html
        if (window.location.pathname.includes('admin.html') && userRole !== 'admin') {
            window.location.href = 'index.html';
        }

    } else {  
        // Unauthenticated user
        document.querySelectorAll('.auth-required').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.no-auth-required').forEach(el => el.style.display = 'block');
    }
})
