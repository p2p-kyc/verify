// Variables globales
let currentUser = null;
let selectedCampaignId = null;

// Escuchar cambios de autenticación
auth.onAuthStateChanged(user => {
    currentUser = user;
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    loadMyCampaigns();
    setupEventListeners();
});

// Configurar event listeners
function setupEventListeners() {
    // Modal de campaña
    const campaignModal = document.getElementById('campaignModal');
    const createCampaignBtn = document.getElementById('createCampaignBtn');
    const closeBtns = document.querySelectorAll('.close-btn');

    createCampaignBtn.addEventListener('click', () => {
        campaignModal.style.display = 'block';
    });

    closeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            campaignModal.style.display = 'none';
            document.getElementById('requestsModal').style.display = 'none';
        });
    });

    // Formulario de campaña
    const campaignForm = document.getElementById('campaignForm');
    campaignForm.addEventListener('submit', handleCampaignSubmit);
}

// Cargar campañas del comprador
async function loadMyCampaigns() {
    try {
        const campaignsRef = db.collection('campaigns')
            .where('createdBy', '==', currentUser.uid)
            .orderBy('createdAt', 'desc');

        const snapshot = await campaignsRef.get();
        const campaignsDiv = document.getElementById('myCampaigns');

        if (snapshot.empty) {
            campaignsDiv.innerHTML = '<p class="no-data">No has creado ninguna campaña</p>';
            return;
        }

        campaignsDiv.innerHTML = snapshot.docs.map(doc => {
            const data = doc.data();
            return `
                <div class="campaign-card ${data.status}">
                    <h3>${data.title}</h3>
                    <p>${data.description}</p>
                    <div class="campaign-stats">
                        <span class="stat">
                            <i class='bx bx-user-check'></i>
                            ${data.acceptedVerifiers}/${data.maxVerifiers} verificadores
                        </span>
                        <span class="stat">
                            <i class='bx bx-time'></i>
                            ${formatDate(data.createdAt)}
                        </span>
                    </div>
                    <div class="campaign-actions">
                        <button onclick="viewRequests('${doc.id}')" class="btn-secondary">
                            <i class='bx bx-list-ul'></i> Ver Solicitudes
                        </button>
                        ${data.status === 'active' ? `
                            <button onclick="toggleCampaignStatus('${doc.id}', false)" class="btn-danger">
                                <i class='bx bx-stop-circle'></i> Pausar
                            </button>
                        ` : `
                            <button onclick="toggleCampaignStatus('${doc.id}', true)" class="btn-success">
                                <i class='bx bx-play-circle'></i> Activar
                            </button>
                        `}
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading campaigns:', error);
        alert('Error al cargar las campañas: ' + error.message);
    }
}

// Crear nueva campaña
async function handleCampaignSubmit(event) {
    event.preventDefault();
    
    try {
        const formData = new FormData(event.target);
        const campaignData = {
            title: formData.get('title'),
            description: formData.get('description'),
            maxVerifiers: parseInt(formData.get('maxVerifiers')),
            acceptedVerifiers: 0,
            status: 'active',
            createdBy: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('campaigns').add(campaignData);

        alert('Campaña creada correctamente');
        event.target.reset();
        document.getElementById('campaignModal').style.display = 'none';
        loadMyCampaigns();

    } catch (error) {
        console.error('Error creating campaign:', error);
        alert('Error al crear la campaña: ' + error.message);
    }
}

// Ver solicitudes de una campaña
async function viewRequests(campaignId) {
    try {
        selectedCampaignId = campaignId;
        const requestsRef = db.collection('campaigns').doc(campaignId)
            .collection('requests')
            .orderBy('createdAt', 'desc');

        const snapshot = await requestsRef.get();
        const requestsDiv = document.getElementById('requestsList');
        const modal = document.getElementById('requestsModal');

        if (snapshot.empty) {
            requestsDiv.innerHTML = '<p class="no-data">No hay solicitudes para esta campaña</p>';
        } else {
            const requests = await Promise.all(snapshot.docs.map(async doc => {
                const data = doc.data();
                const userDoc = await db.collection('users').doc(data.sellerId).get();
                const userData = userDoc.data() || {};
                return {
                    id: doc.id,
                    ...data,
                    sellerName: userData.name || userData.email || 'Usuario ' + data.sellerId.substring(0, 4)
                };
            }));

            requestsDiv.innerHTML = requests.map(request => `
                <div class="request-card ${request.status}">
                    <div class="request-info">
                        <h4>${request.sellerName}</h4>
                        <span class="request-date">${formatDate(request.createdAt)}</span>
                        <span class="status-badge ${request.status}">
                            ${getStatusText(request.status)}
                        </span>
                    </div>
                    ${request.status === 'pending' ? `
                        <div class="request-actions">
                            <button onclick="handleRequest('${request.id}', true)" class="btn-success">
                                <i class='bx bx-check'></i> Aceptar
                            </button>
                            <button onclick="handleRequest('${request.id}', false)" class="btn-danger">
                                <i class='bx bx-x'></i> Rechazar
                            </button>
                        </div>
                    ` : ''}
                </div>
            `).join('');
        }

        modal.style.display = 'block';

    } catch (error) {
        console.error('Error loading requests:', error);
        alert('Error al cargar las solicitudes: ' + error.message);
    }
}

// Manejar solicitud (aceptar/rechazar)
async function handleRequest(requestId, accept) {
    if (!selectedCampaignId) return;

    try {
        const campaignRef = db.collection('campaigns').doc(selectedCampaignId);
        const requestRef = campaignRef.collection('requests').doc(requestId);

        // Verificar estado actual
        const [campaignDoc, requestDoc] = await Promise.all([
            campaignRef.get(),
            requestRef.get()
        ]);

        if (!campaignDoc.exists || !requestDoc.exists) {
            throw new Error('Datos no encontrados');
        }

        const campaignData = campaignDoc.data();
        const requestData = requestDoc.data();

        if (requestData.status !== 'pending') {
            throw new Error('Esta solicitud ya fue procesada');
        }

        if (accept && campaignData.acceptedVerifiers >= campaignData.maxVerifiers) {
            throw new Error('No hay cupos disponibles');
        }

        // Actualizar solicitud
        await requestRef.update({
            status: accept ? 'accepted' : 'rejected',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Si fue aceptada, incrementar contador
        if (accept) {
            await campaignRef.update({
                acceptedVerifiers: firebase.firestore.FieldValue.increment(1)
            });

            // Si se llenó el cupo, marcar como inactiva
            if (campaignData.acceptedVerifiers + 1 >= campaignData.maxVerifiers) {
                await campaignRef.update({ status: 'inactive' });
            }
        }

        alert(`Solicitud ${accept ? 'aceptada' : 'rechazada'} correctamente`);
        viewRequests(selectedCampaignId);
        loadMyCampaigns();

    } catch (error) {
        console.error('Error handling request:', error);
        alert(error.message);
    }
}

// Cambiar estado de la campaña
async function toggleCampaignStatus(campaignId, activate) {
    try {
        await db.collection('campaigns').doc(campaignId).update({
            status: activate ? 'active' : 'inactive'
        });

        alert(`Campaña ${activate ? 'activada' : 'pausada'} correctamente`);
        loadMyCampaigns();

    } catch (error) {
        console.error('Error toggling campaign status:', error);
        alert('Error al cambiar el estado de la campaña: ' + error.message);
    }
}

// Utilidades
function formatDate(timestamp) {
    if (!timestamp) return 'Fecha desconocida';
    return new Date(timestamp.seconds * 1000).toLocaleString();
}

function getStatusText(status) {
    switch (status) {
        case 'pending': return 'Pendiente';
        case 'accepted': return 'Aceptada';
        case 'rejected': return 'Rechazada';
        default: return status;
    }
}
