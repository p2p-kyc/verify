// Variables globales
let currentUser = null;

// Escuchar cambios de autenticación
auth.onAuthStateChanged(user => {
    currentUser = user;
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    loadAvailableCampaigns();
    loadMyApplications();
});

// Cargar campañas disponibles
async function loadAvailableCampaigns() {
    try {
        const campaignsRef = db.collection('campaigns')
            .where('status', '==', 'active')
            .where('acceptedVerifiers', '<', db.FieldPath.documentId('maxVerifiers'));

        const snapshot = await campaignsRef.get();
        const campaignsDiv = document.getElementById('availableCampaigns');

        if (snapshot.empty) {
            campaignsDiv.innerHTML = '<p class="no-data">No hay campañas disponibles</p>';
            return;
        }

        campaignsDiv.innerHTML = snapshot.docs.map(doc => {
            const data = doc.data();
            const availableSlots = data.maxVerifiers - data.acceptedVerifiers;
            return `
                <div class="campaign-card">
                    <h3>${data.title}</h3>
                    <p>${data.description}</p>
                    <div class="campaign-stats">
                        <span class="stat">
                            <i class='bx bx-user-check'></i>
                            ${data.acceptedVerifiers}/${data.maxVerifiers} verificadores
                        </span>
                    </div>
                    <button onclick="applyToCampaign('${doc.id}')" 
                            class="btn-primary"
                            ${availableSlots <= 0 ? 'disabled' : ''}>
                        ${availableSlots <= 0 ? 'Cupo lleno' : 'Aplicar como verificador'}
                    </button>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading campaigns:', error);
        alert('Error al cargar las campañas: ' + error.message);
    }
}

// Cargar mis solicitudes
async function loadMyApplications() {
    try {
        const applicationsRef = db.collectionGroup('requests')
            .where('sellerId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc');

        const snapshot = await applicationsRef.get();
        const applicationsDiv = document.getElementById('applicationsList');

        if (snapshot.empty) {
            applicationsDiv.innerHTML = '<p class="no-data">No has aplicado a ninguna campaña</p>';
            return;
        }

        // Obtener detalles de las campañas
        const applications = await Promise.all(snapshot.docs.map(async doc => {
            const data = doc.data();
            const campaignDoc = await db.collection('campaigns').doc(data.campaignId).get();
            const campaignData = campaignDoc.data();
            return {
                id: doc.id,
                ...data,
                campaignTitle: campaignData?.title || 'Campaña no disponible'
            };
        }));

        applicationsDiv.innerHTML = applications.map(app => `
            <div class="application-card ${app.status}">
                <div class="application-info">
                    <h4>${app.campaignTitle}</h4>
                    <span class="application-date">
                        ${app.createdAt ? new Date(app.createdAt.seconds * 1000).toLocaleString() : 'Fecha desconocida'}
                    </span>
                    <span class="status-badge ${app.status}">
                        ${getStatusText(app.status)}
                    </span>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading applications:', error);
        alert('Error al cargar tus solicitudes: ' + error.message);
    }
}

// Aplicar a una campaña
async function applyToCampaign(campaignId) {
    try {
        // Verificar que la campaña exista y esté activa
        const campaignRef = db.collection('campaigns').doc(campaignId);
        const campaignDoc = await campaignRef.get();

        if (!campaignDoc.exists) {
            throw new Error('La campaña no existe');
        }

        const campaignData = campaignDoc.data();
        
        if (campaignData.status !== 'active') {
            throw new Error('La campaña no está activa');
        }

        if (campaignData.acceptedVerifiers >= campaignData.maxVerifiers) {
            throw new Error('No hay cupos disponibles');
        }

        // Verificar si ya existe una solicitud
        const existingRequests = await campaignRef.collection('requests')
            .where('sellerId', '==', currentUser.uid)
            .get();

        if (!existingRequests.empty) {
            const existingRequest = existingRequests.docs[0].data();
            if (existingRequest.status === 'rejected') {
                throw new Error('Tu solicitud fue rechazada anteriormente');
            } else if (existingRequest.status === 'pending') {
                throw new Error('Ya tienes una solicitud pendiente');
            } else if (existingRequest.status === 'accepted') {
                throw new Error('Ya fuiste aceptado en esta campaña');
            }
        }

        // Crear nueva solicitud
        await campaignRef.collection('requests').add({
            sellerId: currentUser.uid,
            campaignId: campaignId,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert('Solicitud enviada correctamente');
        loadMyApplications();

    } catch (error) {
        console.error('Error applying to campaign:', error);
        alert(error.message);
    }
}

// Utilidades
function getStatusText(status) {
    switch (status) {
        case 'pending': return 'Pendiente';
        case 'accepted': return 'Aceptada';
        case 'rejected': return 'Rechazada';
        default: return status;
    }
}
