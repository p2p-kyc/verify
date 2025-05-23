// Variables globales
let currentUser = null;
let currentRefundId = null;

// Cargar reembolsos
async function loadRefunds() {
    try {
        const snapshot = await db.collection('refund_requests')
            .orderBy('createdAt', 'desc')
            .get();

        const refundsContainer = document.getElementById('refundsList');
        refundsContainer.innerHTML = '';

        if (snapshot.empty) {
            refundsContainer.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center">
                        <div class="empty-state">
                            <i class='bx bx-info-circle'></i>
                            <p>No refund requests found</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        for (const doc of snapshot.docs) {
            const refund = doc.data();
            const row = createRefundRow(doc.id, refund);
            refundsContainer.appendChild(row);
        }
    } catch (error) {
        console.error('Error loading refunds:', error);
        alert('Error loading refunds: ' + error.message);
    }
}

// Crear fila de reembolso
function createRefundRow(id, refund) {
    const row = document.createElement('tr');
    
    // Formatear fecha
    const createdAt = refund.createdAt?.toDate ? 
        refund.createdAt.toDate().toLocaleDateString('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }) : 'N/A';

    row.innerHTML = `
        <td class="id-cell">${id.slice(-6)}</td>
        <td>${refund.campaignId || 'N/A'}</td>
        <td>${refund.buyerId || 'N/A'}</td>
        <td class="amount-cell">
            $${refund.amount?.toFixed(2) || '0.00'} ${refund.currency || 'USD'}
        </td>
        <td>
            <span class="status-badge status-${refund.status}">
                ${refund.status?.toUpperCase() || 'N/A'}
            </span>
        </td>
        <td>${createdAt}</td>
        <td>
            ${refund.status === 'pending' ? `
                <button onclick="approveRefund('${id}')" class="action-btn approve" title="Approve Refund">
                    <i class='bx bx-check'></i>
                </button>
                <button onclick="rejectRefund('${id}')" class="action-btn reject" title="Reject Refund">
                    <i class='bx bx-x'></i>
                </button>
            ` : refund.status === 'approved' ? `
                <button onclick="openRefundProofModal('${id}')" class="action-btn pay" title="Upload Refund Proof">
                    <i class='bx bx-upload'></i>
                </button>
            ` : ''}
        </td>
    `;
    return row;
}

// Aprobar reembolso
async function approveRefund(refundId) {
    try {
        if (!confirm('¿Estás seguro de que deseas aprobar este reembolso?')) {
            return;
        }

        // Obtener datos del reembolso
        const refundDoc = await db.collection('refund_requests').doc(refundId).get();
        if (!refundDoc.exists) {
            throw new Error('Reembolso no encontrado');
        }

        const refundData = refundDoc.data();
        if (refundData.status !== 'pending') {
            throw new Error('Este reembolso ya ha sido procesado');
        }

        // Actualizar estado del reembolso
        await db.collection('refund_requests').doc(refundId).update({
            status: 'approved',
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedBy: auth.currentUser.uid
        });

        // Recargar reembolsos
        await loadRefunds();

    } catch (error) {
        console.error('Error al aprobar reembolso:', error);
        alert('Error al aprobar reembolso: ' + error.message);
    }
}

// Rechazar reembolso
async function rejectRefund(refundId) {
    try {
        if (!confirm('¿Estás seguro de que deseas rechazar este reembolso?')) {
            return;
        }

        // Obtener datos del reembolso
        const refundDoc = await db.collection('refund_requests').doc(refundId).get();
        if (!refundDoc.exists) {
            throw new Error('Reembolso no encontrado');
        }

        const refundData = refundDoc.data();
        if (refundData.status !== 'pending') {
            throw new Error('Este reembolso ya ha sido procesado');
        }

        // Actualizar estado del reembolso
        await db.collection('refund_requests').doc(refundId).update({
            status: 'rejected',
            rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
            rejectedBy: auth.currentUser.uid
        });

        // Recargar reembolsos
        await loadRefunds();

    } catch (error) {
        console.error('Error al rechazar reembolso:', error);
        alert('Error al rechazar reembolso: ' + error.message);
    }
}

// Modal de comprobante de reembolso
function openRefundProofModal(refundId) {
    currentRefundId = refundId;
    const modal = document.getElementById('refundProofModal');
    modal.classList.add('active');
}

function closeRefundProofModal() {
    const modal = document.getElementById('refundProofModal');
    modal.classList.remove('active');
    document.getElementById('refundProofForm').reset();
    document.getElementById('imagePreview').style.display = 'none';
    currentRefundId = null;
}

// Preview de imagen
document.getElementById('refundProofFile').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('imagePreview');
            preview.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
});

// Convertir imagen a base64
function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// Manejo del formulario de comprobante
document.getElementById('refundProofForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    
    try {
        const file = document.getElementById('refundProofFile').files[0];
        if (!file) {
            throw new Error('Por favor selecciona una imagen');
        }

        // Convertir imagen a base64
        const reader = new FileReader();
        const base64Promise = new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
        });
        reader.readAsDataURL(file);
        const imageUrl = await base64Promise;

        // Actualizar reembolso con el comprobante
        await completeRefundWithProof(currentRefundId, imageUrl);

        // Cerrar modal y recargar lista
        closeRefundProofModal();
        await loadRefunds();

    } catch (error) {
        console.error('Error uploading refund proof:', error);
        alert('Error uploading refund proof: ' + error.message);
    }
});

// Completar reembolso con comprobante
async function completeRefundWithProof(refundId, imageUrl) {
    try {
        // Obtener datos del reembolso
        const refundDoc = await db.collection('refund_requests').doc(refundId).get();
        if (!refundDoc.exists) {
            throw new Error('Reembolso no encontrado');
        }

        const refundData = refundDoc.data();
        
        // Actualizar reembolso
        await db.collection('refund_requests').doc(refundId).update({
            status: 'completed',
            completedAt: firebase.firestore.FieldValue.serverTimestamp(),
            completedBy: auth.currentUser.uid,
            proofUrl: imageUrl
        });

        // Actualizar estado de la campaña
        if (refundData.campaignId) {
            const campaignDoc = await db.collection('campaigns').doc(refundData.campaignId).get();
            await db.collection('campaigns').doc(refundData.campaignId).update({
                status: 'cancelled',
                cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
                cancelledBy: auth.currentUser.uid
            });
        }

        // Crear mensaje en el chat
        if (refundData.requestId) {
            const message = {
                type: 'refund_proof',
                text: 'Comprobante de reembolso',
                imageUrl: imageUrl,
                userId: window.auth.currentUser.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await db.collection('requests')
                .doc(refundData.requestId)
                .collection('messages')
                .add(message);
        }

    } catch (error) {
        console.error('Error completing refund:', error);
        throw error;
    }
}

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
            window.location.href = 'index.html';
            return;
        }

        const userDoc = await db.collection('users').doc(auth.currentUser.uid).get();
        console.log('User doc:', userDoc.data());

        if (!userDoc.exists) {
            console.error('User document does not exist');
            window.location.href = 'index.html';
            return;
        }

        if (userDoc.data().role !== 'admin') {
            console.error('User is not admin');
            window.location.href = 'index.html';
            return;
        }

        console.log('Admin check passed');
    } catch (error) {
        console.error('Error checking admin status:', error);
        window.location.href = 'index.html';
    }
}

// Inicializar página
document.addEventListener('DOMContentLoaded', () => {
    checkAdmin();
    
    // Event listeners
    document.getElementById('refreshBtn').addEventListener('click', loadRefunds);
    document.getElementById('refundSearch').addEventListener('input', handleSearch);
    document.getElementById('dateFilter').addEventListener('change', handleFilters);
    document.getElementById('statusFilter').addEventListener('change', handleFilters);
    document.getElementById('sortOrder').addEventListener('change', handleFilters);
    
    // Cargar reembolsos iniciales
    loadRefunds();
});

// Búsqueda y filtros
function handleSearch(event) {
    // Implementar búsqueda
    console.log('Search:', event.target.value);
}

function handleFilters() {
    // Implementar filtros
    console.log('Filters changed');
}

// Logout
function handleLogout() {
    window.auth.signOut()
        .then(() => {
            window.location.href = 'index.html';
        })
        .catch((error) => {
            console.error('Error signing out:', error);
        });
}
