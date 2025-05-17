// Variables globales
let currentUser = null;
let currentCampaign = null;
let existingRequest = null;

// Escuchar cambios de autenticación
auth.onAuthStateChanged(async user => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    currentUser = user;
    loadCampaignAndRequest();
});

// Cargar campaña y verificar solicitud existente
async function loadCampaignAndRequest() {
    try {
        // Obtener ID de la campaña de la URL
        const urlParams = new URLSearchParams(window.location.search);
        const campaignId = urlParams.get('id');
        
        if (!campaignId) {
            throw new Error('ID de campaña no especificado');
        }

        // Cargar datos de la campaña
        const campaignRef = db.collection('campaigns').doc(campaignId);
        const campaignDoc = await campaignRef.get();

        if (!campaignDoc.exists) {
            throw new Error('Campaña no encontrada');
        }

        currentCampaign = {
            id: campaignDoc.id,
            ...campaignDoc.data()
        };

        // Verificar si la campaña está disponible
        if (currentCampaign.verificationCount >= currentCampaign.accountCount) {
            throw new Error('Esta campaña ya tiene todas las verificaciones completadas');
        }

        // Mostrar información de la campaña
        displayCampaignInfo(currentCampaign);

        // Verificar si ya existe una solicitud
        const requestsSnapshot = await db.collection('requests')
            .where('campaignId', '==', campaignId)
            .where('userId', '==', currentUser.uid)
            .get();

        if (!requestsSnapshot.empty) {
            existingRequest = {
                id: requestsSnapshot.docs[0].id,
                ...requestsSnapshot.docs[0].data()
            };
            displayRequestStatus(existingRequest);
        }

    } catch (error) {
        console.error('Error loading campaign:', error);
        const campaignInfo = document.getElementById('campaignInfo');
        campaignInfo.innerHTML = `
            <div class="error-state">
                <i class='bx bx-error-circle'></i>
                <h3>Error</h3>
                <p>${error.message}</p>
                <a href="campaigns.html" class="btn-secondary">
                    <i class='bx bx-arrow-back'></i>
                    Volver a Campañas
                </a>
            </div>
        `;
        document.getElementById('requestForm').style.display = 'none';
    }
}

// Mostrar información de la campaña
function displayCampaignInfo(campaign) {
    const campaignInfo = document.getElementById('campaignInfo');
    campaignInfo.innerHTML = `
        <div class="campaign-card">
            <h2>${campaign.name}</h2>
            <p>${campaign.description}</p>
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
        </div>
    `;
}

// Mostrar estado de la solicitud
function displayRequestStatus(request) {
    const requestForm = document.getElementById('requestForm');
    const requestStatus = document.getElementById('requestStatus');
    
    requestForm.style.display = 'none';
    requestStatus.style.display = 'block';

    let statusHtml = '';
    switch (request.status) {
        case 'pending':
            statusHtml = `
                <div class="status-card pending">
                    <i class='bx bx-time-five'></i>
                    <h3>Solicitud Pendiente</h3>
                    <p>Tu solicitud está siendo revisada por el creador de la campaña.</p>
                    <p class="message-preview">
                        <i class='bx bx-message-detail'></i>
                        Tu mensaje: "${request.message}"
                    </p>
                </div>
            `;
            break;
        case 'accepted':
            statusHtml = `
                <div class="status-card accepted">
                    <i class='bx bx-check-circle'></i>
                    <h3>Solicitud Aceptada</h3>
                    <p>¡Felicidades! Has sido aceptado en esta campaña.</p>
                    <a href="chat.html?requestId=${request.id}" class="btn-primary">
                        <i class='bx bx-message-square-dots'></i>
                        Ir al Chat
                    </a>
                </div>
            `;
            break;
        case 'rejected':
            statusHtml = `
                <div class="status-card rejected">
                    <i class='bx bx-x-circle'></i>
                    <h3>Solicitud Rechazada</h3>
                    <p>Lo sentimos, tu solicitud no fue aceptada.</p>
                    <a href="campaigns.html" class="btn-secondary">
                        <i class='bx bx-search-alt'></i>
                        Buscar otras campañas
                    </a>
                </div>
            `;
            break;
    }

    requestStatus.innerHTML = statusHtml;
}

// Manejar envío de solicitud
async function handleRequestSubmit(event) {
    event.preventDefault();

    try {
        if (existingRequest) {
            throw new Error('Ya has enviado una solicitud para esta campaña');
        }

        const message = document.getElementById('message').value.trim();

        if (!message) {
            throw new Error('Por favor escribe un mensaje explicando por qué quieres unirte');
        }

        // Verificar estado actual de la campaña
        const campaignDoc = await db.collection('campaigns').doc(currentCampaign.id).get();
        const campaignData = campaignDoc.data();

        if (campaignData.verificationCount >= campaignData.accountCount) {
            throw new Error('Esta campaña ya tiene todas las verificaciones completadas');
        }

        // Crear nueva solicitud
        const requestData = {
            userId: currentUser.uid,
            campaignId: currentCampaign.id,
            message: message,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        const requestRef = await db.collection('requests').add(requestData);

        existingRequest = {
            id: requestRef.id,
            ...requestData
        };

        alert('Solicitud enviada correctamente');
        displayRequestStatus(existingRequest);

    } catch (error) {
        console.error('Error sending request:', error);
        alert(error.message);
    }
}

// Utilidades
function formatDate(timestamp) {
    if (!timestamp) return 'Fecha desconocida';
    return new Date(timestamp.seconds * 1000).toLocaleString();
}
