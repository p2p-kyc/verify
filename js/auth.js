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
    
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        
        // Create user document in Firestore
        await db.collection('users').doc(userCredential.user.uid).set({
            email: email,
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

// Verificar si el usuario es administrador
async function isAdmin(uid) {
    try {
        const userDoc = await window.db.collection('users').doc(uid).get();
        return userDoc.exists && userDoc.data().role === 'admin';
    } catch (error) {
        console.error('Error checking admin status:', error);
        return false;
    }
}

// Variable global para almacenar el rol del usuario
if (typeof window.userRole === 'undefined') {
    window.userRole = null;
}

// Escuchar cambios en el estado de autenticación
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // Usuario autenticado
        currentUser = user;
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (userDoc.exists) {
            // Actualizar último acceso y guardar rol
            userRole = userDoc.data().role;
            await db.collection('users').doc(user.uid).update({
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            // Crear documento de usuario si no existe
            userRole = 'user'; // rol por defecto
            await db.collection('users').doc(user.uid).set({
                email: user.email,
                role: userRole,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        // Actualizar UI
        document.querySelectorAll('.auth-required').forEach(el => el.style.display = 'block');
        document.querySelectorAll('.no-auth-required').forEach(el => el.style.display = 'none');
        
        // Mostrar email del usuario
        const userEmailElements = document.getElementsByClassName('user-email');
        Array.from(userEmailElements).forEach(element => {
            element.textContent = user.email;
        });

        // Redirigir si no es admin y está en admin.html
        if (window.location.pathname.includes('admin.html') && userRole !== 'admin') {
            window.location.href = 'index.html';
        }

    } else {  
        // Usuario no autenticado
        document.querySelectorAll('.auth-required').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.no-auth-required').forEach(el => el.style.display = 'block');
    }
})
