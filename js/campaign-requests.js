// Variables globales
let currentUser = null;
let currentCampaign = null;

// Escuchar cambios de autenticación
auth.onAuthStateChanged(async user => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    currentUser = user;
    await loadCampaignAndRequests();
});

// Cargar campaña y solicitudes
async function loadCampaignAndRequests() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const campaignId = urlParams.get('campaignId');

        if (!campaignId) {
            throw new Error('No campaign ID provided');
        }

        // Obtener datos de la campaña
        const campaignDoc = await db.collection('campaigns').doc(campaignId).get();
        if (!campaignDoc.exists) {
            throw new Error('Campaign not found');
        }

        currentCampaign = { id: campaignDoc.id, ...campaignDoc.data() };

        // Verificar que el usuario actual es el creador de la campaña
        if (currentCampaign.createdBy !== currentUser.uid) {
            throw new Error('You do not have permission to view these requests');
        }

        // Mostrar información de la campaña
        displayCampaignInfo(currentCampaign);

        // Escuchar cambios en las solicitudes
        db.collection('requests')
            .where('campaignId', '==', campaignId)
            .onSnapshot(async snapshot => {
                const requestsList = document.getElementById('requestsList');
                
                if (snapshot.empty) {
                    requestsList.innerHTML = '<p class="no-data">No requests yet</p>';
                    return;
                }

                // Ordenar las solicitudes por fecha de creación (más recientes primero)
                const sortedDocs = snapshot.docs.sort((a, b) => {
                    const dateA = a.data().createdAt?.seconds || 0;
                    const dateB = b.data().createdAt?.seconds || 0;
                    return dateB - dateA;
                });

                const requestsHtml = await Promise.all(sortedDocs.map(async doc => {
                    const request = { id: doc.id, ...doc.data() };
                    const userData = await getUserData(request.userId);
                    return createRequestItem(request, userData);
                }));

                requestsList.innerHTML = requestsHtml.join('');
            });

    } catch (error) {
        console.error('Error:', error);
        alert(error.message);
    }
}

// Mostrar información de la campaña
function displayCampaignInfo(campaign) {
    const campaignInfo = document.getElementById('campaignInfo');
    campaignInfo.innerHTML = `
        <div class="campaign-header">
            <h2>${campaign.name}</h2>
            <div class="campaign-stats">
                <span class="stat">
                    <i class='bx bx-user-check'></i>
                    ${campaign.verificationCount}/${campaign.accountCount} verificaciones
                </span>
                <span class="stat">
                    <i class='bx bx-dollar-circle'></i>
                    ${campaign.pricePerAccount} USDT por verificación
                </span>
                <span class="stat">
                    <i class='bx bx-time'></i>
                    Creada el ${formatDate(campaign.createdAt)}
                </span>
            </div>
            <p class="campaign-description">${campaign.description}</p>
        </div>
    `;
}

// Crear elemento de solicitud
function createRequestItem(request, userData) {
    const statusClass = request.status === 'pending' ? 'pending' : 
                       request.status === 'accepted' ? 'accepted' : 'rejected';

    return `
        <div class="request-item ${statusClass}">
            <div class="request-header">
                <div class="user-info">
                    <h4>${userData.name || userData.email}</h4>
                    <span class="status ${statusClass}">${request.status}</span>
                </div>
                <span class="date">${formatDate(request.createdAt)}</span>
            </div>
            ${request.status === 'pending' ? `
                <div class="request-actions">
                    <button onclick="handleAcceptRequest('${request.id}')" class="accept-btn">
                        <i class='bx bx-check'></i> Accept
                    </button>
                    <button onclick="handleRejectRequest('${request.id}')" class="reject-btn">
                        <i class='bx bx-x'></i> Reject
                    </button>
                </div>
            ` : ''}
            ${request.status === 'accepted' ? `
                <button onclick="openChatWithSeller('${request.id}')" class="chat-btn">
                    <i class='bx bx-message-square-dots'></i> Abrir Chat
                </button>
            ` : ''}
        </div>
    `;
}

// Manejar aceptación de solicitud
async function handleAcceptRequest(requestId) {
    try {
        await db.collection('requests').doc(requestId).update({
            status: 'accepted',
            acceptedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Error accepting request:', error);
        alert('Error accepting request: ' + error.message);
    }
}

// Manejar rechazo de solicitud
async function handleRejectRequest(requestId) {
    try {
        await db.collection('requests').doc(requestId).update({
            status: 'rejected',
            rejectedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Error rejecting request:', error);
        alert('Error rejecting request: ' + error.message);
    }
}

// Abrir chat según el rol del usuario
async function openChatWithSeller(requestId) {
    try {
        // Obtener datos de la solicitud
        const requestDoc = await db.collection('requests').doc(requestId).get();
        if (!requestDoc.exists) {
            throw new Error('Solicitud no encontrada');
        }

        const requestData = requestDoc.data();
        const campaignDoc = await db.collection('campaigns').doc(requestData.campaignId).get();
        
        if (!campaignDoc.exists) {
            throw new Error('Campaña no encontrada');
        }

        const campaignData = campaignDoc.data();
        const currentUserId = auth.currentUser.uid;

        // Determinar si el usuario es vendedor o comprador
        if (currentUserId === requestData.userId) {
            // Es vendedor
            window.location.href = `chat-vendedor.html?requestId=${requestId}`;
        } else if (currentUserId === campaignData.createdBy) {
            // Es comprador (creador de la campaña)
            window.location.href = `chat-comprador.html?requestId=${requestId}`;
        } else {
            throw new Error('No tienes permiso para acceder a este chat');
        }
    } catch (error) {
        console.error('Error al abrir chat:', error);
        alert('Error: ' + error.message);
    }
}

// Obtener datos de usuario
async function getUserData(userId) {
    const userDoc = await db.collection('users').doc(userId).get();
    return {
        id: userId,
        ...userDoc.data()
    };
}

// Ya no necesitamos esta función porque llamamos directamente a openChatWithSeller

// Utilidades
function formatDate(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp.seconds * 1000).toLocaleString();
}
