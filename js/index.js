// Escuchar cambios de autenticación
auth.onAuthStateChanged(async user => {
    if (!user) {
        redirectTo('login.html');
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
            redirectTo('campaigns-seller.html');
        } else if (userData.role === 'buyer') {
            redirectTo('campaigns-buyer.html');
        } else {
            console.error('Invalid user role:', userData.role);
        }
    } catch (error) {
        console.error('Error getting user data:', error);
    }
});
