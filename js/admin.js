// Check if user is admin
async function checkAdmin() {
    try {
        // Esperar a que la autenticación se complete
        await new Promise((resolve) => {
            const unsubscribe = auth.onAuthStateChanged((user) => {
                unsubscribe();
                resolve(user);
            });
        });

        if (!auth.currentUser) {
            console.error('No user logged in');
            redirectTo('index.html');
            return;
        }

        const userDoc = await db.collection('users').doc(auth.currentUser.uid).get();
        console.log('User doc:', userDoc.data()); // Para debug

        if (!userDoc.exists) {
            console.error('User document does not exist');
            redirectTo('dashboard.html');
            return;
        }

        if (userDoc.data().role !== 'admin') {
            console.error('User is not admin');
            redirectTo('dashboard.html');
            return;
        }

        console.log('Admin check passed');
    } catch (error) {
        console.error('Error checking admin status:', error);
        redirectTo('dashboard.html');
    }
}

// Load approved verifications
async function loadApprovedVerifications() {
    const verificationsList = document.getElementById('verificationsList');
    verificationsList.innerHTML = '';
    
    try {
        const snapshot = await db.collection('verifications')
            .where('status', '==', 'approved')
            .orderBy('approvedAt', 'desc')
            .get();
            
        for (const doc of snapshot.docs) {
            const verification = doc.data();
            const campaign = await db.collection('campaigns').doc(verification.campaignId).get();
            const user = await db.collection('users').doc(verification.userId).get();
            
            const div = document.createElement('div');
            div.className = 'campaign-card';
            div.innerHTML = `
                <h3>Verification #${doc.id}</h3>
                <p>Campaign: ${campaign.data().name}</p>
                <p>User: ${user.data().email}</p>
                <p>Amount: ${campaign.data().price} USDT</p>
                <button onclick="viewPaymentProof('${verification.paymentProofBase64}')" class="text-green">View Payment Proof</button>
                <button onclick="releasePayment('${doc.id}')" class="mt-2">Release Payment</button>
            `;
            
            verificationsList.appendChild(div);
        }
    } catch (error) {
        console.error('Error loading verifications:', error);
    }
}

// Release payment
async function releasePayment(verificationId) {
    if (!confirm('Are you sure you want to release the payment?')) return;
    
    try {
        await db.collection('verifications').doc(verificationId).update({
            status: 'completed',
            completedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        loadApprovedVerifications();
        
    } catch (error) {
        console.error('Error releasing payment:', error);
        alert('Error releasing payment');
    }
}

// Variables globales para paginación
let currentPage = 1;
let itemsPerPage = 10;
let totalPages = 1;
let allCampaigns = [];
let filteredCampaigns = [];

// Inicializar event listeners
function initializeEventListeners() {
    document.getElementById('campaignSearch').addEventListener('input', handleSearch);
    document.getElementById('dateFilter').addEventListener('change', handleFilters);
    document.getElementById('sortOrder').addEventListener('change', handleFilters);
    document.getElementById('selectAll').addEventListener('change', handleSelectAll);
    document.getElementById('approveAllBtn').addEventListener('click', handleApproveSelected);
    document.getElementById('refreshBtn').addEventListener('click', loadPendingCampaigns);
    document.getElementById('prevPage').addEventListener('click', () => changePage(-1));
    document.getElementById('nextPage').addEventListener('click', () => changePage(1));
}

// Cargar campañas pendientes
async function loadPendingCampaigns() {
    try {
        const tbody = document.getElementById('pendingCampaigns');
        tbody.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="loading-state">
                        <i class='bx bx-loader-alt bx-spin'></i>
                        <p>Loading campaigns...</p>
                    </div>
                </td>
            </tr>
        `;

        const snapshot = await db.collection('campaigns')
            .where('status', '==', 'pending')
            .orderBy('createdAt', 'desc')
            .get();

        allCampaigns = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate() || new Date()
        }));

        updateStats();
        filteredCampaigns = [...allCampaigns];
        renderCampaigns();

    } catch (error) {
        console.error('Error loading pending campaigns:', error);
        const tbody = document.getElementById('pendingCampaigns');
        
        if (error.message.includes('requires an index')) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7">
                        <div class="loading-state">
                            <i class='bx bx-loader-alt bx-spin'></i>
                            <p>Setting up database indexes...</p>
                            <small>This may take a few minutes</small>
                        </div>
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7">
                        <div class="error-state">
                            <i class='bx bx-error-circle'></i>
                            <p>Error loading campaigns</p>
                            <button onclick="loadPendingCampaigns()">Retry</button>
                        </div>
                    </td>
                </tr>
            `;
        }
    }
}

// Actualizar estadísticas
function updateStats() {
    const totalValue = allCampaigns.reduce((sum, campaign) => sum + campaign.totalPrice, 0);
    document.getElementById('pendingCount').textContent = allCampaigns.length;
    document.getElementById('totalValue').textContent = totalValue.toFixed(2);
}

// Renderizar campañas con paginación
function renderCampaigns() {
    const tbody = document.getElementById('pendingCampaigns');
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const paginatedCampaigns = filteredCampaigns.slice(start, end);

    if (paginatedCampaigns.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8">
                    <div class="empty-state">
                        <i class='bx bx-folder-open'></i>
                        <p>No campaigns found</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = paginatedCampaigns.map(campaign => `
        <tr>
            <td>
                <input type="checkbox" class="campaign-checkbox" value="${campaign.id}">
            </td>
            <td>${campaign.name}</td>
            <td>${campaign.createdBy}</td>
            <td>${campaign.accountCount}</td>
            <td>${campaign.totalPrice} USDT</td>
            <td>${campaign.status}</td>
            <td>
                ${campaign.paymentProofBase64 ? 
                    `<button onclick="viewPaymentProof('${campaign.paymentProofBase64}')" class="action-button">
                        <i class='bx bx-image'></i> View
                    </button>` : 
                    'No proof uploaded'
                }
            </td>
            <td>${campaign.paymentStatus}</td>
            <td>
                ${campaign.paymentStatus === 'pending' ? 
                    `<div class="action-buttons">
                        <button onclick="approvePayment('${campaign.id}')" class="action-button approve-btn">
                            <i class='bx bx-check'></i>
                        </button>
                        <button onclick="rejectPayment('${campaign.id}')" class="action-button reject-btn">
                            <i class='bx bx-x'></i>
                        </button>
                    </div>` : 
                    campaign.paymentStatus === 'approved' && campaign.status === 'pending' ?
                    `<button onclick="approveCampaign('${campaign.id}')" class="action-button">
                        <i class='bx bx-check-double'></i> Approve Campaign
                    </button>` :
                    ''
                }
            </td>
        </tr>
    `).join('');

    updatePagination();
}

// Actualizar paginación
function updatePagination() {
    totalPages = Math.ceil(filteredCampaigns.length / itemsPerPage);
    document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages}`;
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage === totalPages;
}

// Cambiar página
function changePage(delta) {
    currentPage = Math.max(1, Math.min(currentPage + delta, totalPages));
    renderCampaigns();
}

// Manejar búsqueda
function handleSearch(e) {
    const searchTerm = e.target.value.toLowerCase();
    filteredCampaigns = allCampaigns.filter(campaign =>
        campaign.name.toLowerCase().includes(searchTerm) ||
        campaign.createdBy.toLowerCase().includes(searchTerm)
    );
    currentPage = 1;
    renderCampaigns();
}

// Manejar filtros
function handleFilters() {
    const dateFilter = document.getElementById('dateFilter').value;
    const sortOrder = document.getElementById('sortOrder').value;

    // Aplicar filtro de fecha
    filteredCampaigns = allCampaigns.filter(campaign => {
        const date = campaign.createdAt;
        const now = new Date();
        switch (dateFilter) {
            case 'today':
                return date.toDateString() === now.toDateString();
            case 'week':
                const weekAgo = new Date(now.setDate(now.getDate() - 7));
                return date >= weekAgo;
            case 'month':
                const monthAgo = new Date(now.setMonth(now.getMonth() - 1));
                return date >= monthAgo;
            default:
                return true;
        }
    });

    // Aplicar ordenamiento
    filteredCampaigns.sort((a, b) => {
        switch (sortOrder) {
            case 'newest':
                return b.createdAt - a.createdAt;
            case 'oldest':
                return a.createdAt - b.createdAt;
            case 'accounts':
                return b.accountCount - a.accountCount;
            case 'price':
                return b.totalPrice - a.totalPrice;
            default:
                return 0;
        }
    });

    currentPage = 1;
    renderCampaigns();
}

// Manejar selección de todas las campañas
function handleSelectAll(e) {
    const checkboxes = document.getElementsByClassName('campaign-checkbox');
    Array.from(checkboxes).forEach(checkbox => checkbox.checked = e.target.checked);
}

// Manejar aprobación de campañas seleccionadas
async function handleApproveSelected() {
    const selectedIds = Array.from(document.getElementsByClassName('campaign-checkbox'))
        .filter(checkbox => checkbox.checked)
        .map(checkbox => checkbox.value);

    if (selectedIds.length === 0) {
        alert('Please select at least one campaign to approve');
        return;
    }

    const confirmed = confirm(`Are you sure you want to approve ${selectedIds.length} campaigns?`);
    if (!confirmed) return;

    try {
        await Promise.all(selectedIds.map(id => approveCampaign(id, false)));
        alert('Selected campaigns approved successfully!');
        loadPendingCampaigns();
    } catch (error) {
        console.error('Error approving campaigns:', error);
        alert('Error approving campaigns');
    }
}

// Ver comprobante de pago
function viewPaymentProof(base64Data) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const span = document.getElementsByClassName('close')[0];

    // Verificar si el string base64 ya incluye el prefijo data:image
    const imageUrl = base64Data.startsWith('data:image') ? 
        base64Data : 
        `data:image/jpeg;base64,${base64Data}`;

    modalImg.src = imageUrl;
    modal.style.display = 'block';

    span.onclick = function() {
        modal.style.display = 'none';
    }

    modal.onclick = function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    }

    // Manejar errores de carga de imagen
    modalImg.onerror = function() {
        console.error('Error loading image');
        alert('Error loading image. The image data might be corrupted.');
        modal.style.display = 'none';
    };
}

// Aprobar pago
async function approvePayment(campaignId) {
    try {
        if (!currentUser || userRole !== 'admin') {
            throw new Error('No tienes permisos de administrador');
        }

        await db.collection('campaigns').doc(campaignId).update({
            paymentStatus: 'approved',
            paymentApprovedAt: firebase.firestore.FieldValue.serverTimestamp(),
            paymentApprovedBy: currentUser.uid
        });

        alert('Payment approved successfully!');
        loadPendingCampaigns();
    } catch (error) {
        console.error('Error approving payment:', error);
        alert(`Error approving payment: ${error.message}`);
    }
}

// Rechazar pago
async function rejectPayment(campaignId) {
    try {
        if (!currentUser || userRole !== 'admin') {
            throw new Error('No tienes permisos de administrador');
        }

        const reason = prompt('Please enter the reason for rejection:');
        if (!reason) return; // Si el usuario cancela el prompt

        await db.collection('campaigns').doc(campaignId).update({
            paymentStatus: 'rejected',
            paymentRejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
            paymentRejectedBy: currentUser.uid,
            paymentRejectionReason: reason
        });

        alert('Payment rejected successfully!');
        loadPendingCampaigns();
    } catch (error) {
        console.error('Error rejecting payment:', error);
        alert(`Error rejecting payment: ${error.message}`);
    }
}

// Aprobar campaña individual
async function approveCampaign(campaignId, showAlert = true) {
    try {
        // Verificar si el usuario actual es administrador
        if (!currentUser) {
            throw new Error('No user authenticated');
        }
        
        if (userRole !== 'admin') {
            throw new Error('User does not have admin privileges');
        }

        // Obtener la campaña
        const campaign = await db.collection('campaigns').doc(campaignId).get();
        if (!campaign.exists) {
            throw new Error('Campaign not found');
        }

        // Primero aprobar el pago si no está aprobado
        if (campaign.data().paymentStatus !== 'approved') {
            await db.collection('campaigns').doc(campaignId).update({
                paymentStatus: 'approved',
                paymentApprovedAt: firebase.firestore.FieldValue.serverTimestamp(),
                paymentApprovedBy: currentUser.uid
            });
        }

        // Luego aprobar la campaña
        await db.collection('campaigns').doc(campaignId).update({
            status: 'approved',
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedBy: currentUser.uid
        });
        
        if (showAlert) {
            alert('Campaign approved successfully!');
            loadPendingCampaigns();
        }
    } catch (error) {
        console.error('Error approving campaign:', error);
        if (showAlert) {
            alert(`Error approving campaign: ${error.message}`);
        } else {
            throw error;
        }
    }
}

// Formatear fecha
function formatDate(date) {
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

// Cargar solicitudes de pago
async function loadPaymentRequests() {
    try {
        const paymentRequestsList = document.getElementById('paymentRequestsList');
        paymentRequestsList.innerHTML = ''; // Limpiar lista existente

        // Obtener todas las solicitudes de pago
        const snapshot = await db.collection('payment_requests')
            .orderBy('createdAt', 'desc')
            .get();

        for (const doc of snapshot.docs) {
            const request = doc.data();
            
            // Obtener datos adicionales
            const [campaign, seller, buyer] = await Promise.all([
                db.collection('campaigns').doc(request.campaignId).get(),
                db.collection('users').doc(request.sellerId).get(),
                db.collection('users').doc(request.buyerId).get()
            ]);

            // Crear fila de la tabla
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${doc.id}</td>
                <td>${campaign.exists ? campaign.data().name : 'N/A'}</td>
                <td>${seller.exists ? seller.data().email : 'N/A'}</td>
                <td>${buyer.exists ? buyer.data().email : 'N/A'}</td>
                <td>${request.accountsRequested}</td>
                <td>${request.amount} ${request.currency}</td>
                <td>
                    <span class="status-badge ${request.status}">
                        ${request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                    </span>
                </td>
                <td>${formatDate(request.createdAt.toDate())}</td>
                <td class="actions-cell">
                    ${request.status === 'pending' ? `
                        <button onclick="markPaymentAsPaid('${doc.id}')" class="action-button success">
                            <i class='bx bx-check'></i>
                            Mark as Paid
                        </button>
                    ` : ''}
                </td>
            `;

            paymentRequestsList.appendChild(tr);
        }
    } catch (error) {
        console.error('Error loading payment requests:', error);
        alert('Error loading payment requests: ' + error.message);
    }
}

// Marcar pago como realizado
async function markPaymentAsPaid(paymentRequestId) {
    try {
        // Obtener la solicitud de pago
        const paymentRequestDoc = await db.collection('payment_requests').doc(paymentRequestId).get();
        if (!paymentRequestDoc.exists) {
            throw new Error('Payment request not found');
        }

        const paymentRequest = paymentRequestDoc.data();

        // Confirmar acción
        if (!confirm(`Are you sure you want to mark this payment as paid? This will confirm the payment of ${paymentRequest.accountsRequested} accounts for ${paymentRequest.amount} ${paymentRequest.currency}`)) {
            return;
        }

        // Actualizar estado de la solicitud
        await db.collection('payment_requests').doc(paymentRequestId).update({
            status: 'paid',
            paidAt: firebase.firestore.FieldValue.serverTimestamp(),
            paidBy: auth.currentUser.uid
        });

        // Actualizar estado de la campaña
        await db.collection('campaigns').doc(paymentRequest.campaignId).update({
            status: 'payment_completed',
            lastPaymentAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Crear mensaje en el chat
        const message = {
            text: '💰 El administrador ha confirmado el pago',
            type: 'system',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('requests')
            .doc(paymentRequest.requestId)
            .collection('messages')
            .add(message);

        alert('Payment marked as paid successfully!');
        loadPaymentRequests(); // Recargar lista
    } catch (error) {
        console.error('Error marking payment as paid:', error);
        alert('Error marking payment as paid: ' + error.message);
    }
}

// Initialize admin page
document.addEventListener('DOMContentLoaded', () => {
    checkAdmin();
    initializeEventListeners();
    loadPendingCampaigns();
    loadApprovedVerifications();
    loadPaymentRequests();

    // Agregar event listener para el botón de refresh de solicitudes de pago
    document.getElementById('refreshPaymentRequestsBtn').addEventListener('click', loadPaymentRequests);
});
