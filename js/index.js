// Escuchar cambios de autenticación
auth.onAuthStateChanged(async user => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    try {
        // Obtener datos del usuario
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists) {
            console.error('User document not found');
            return;
        }

        const userData = userDoc.data();
        
        // Redirigir según el rol
        if (userData.role === 'seller') {
            window.location.href = 'campaigns-seller.html';
        } else if (userData.role === 'buyer') {
            window.location.href = 'campaigns-buyer.html';
        } else {
            console.error('Invalid user role:', userData.role);
        }
    } catch (error) {
        console.error('Error getting user data:', error);
    }
});
