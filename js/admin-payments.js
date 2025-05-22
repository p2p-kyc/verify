// Payment management functions
async function loadPayments() {
    try {
        const paymentsSnapshot = await window.db.collection('payment_requests')
            .orderBy('createdAt', 'desc')
            .get();

        // Almacenar pagos en currentPayments
        currentPayments = paymentsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Aplicar filtros actuales
        filterAndDisplayPayments();
    } catch (error) {
        console.error('Error loading payments:', error);
        const paymentsContainer = document.getElementById('paymentsList');
        paymentsContainer.innerHTML = '';
        const errorRow = document.createElement('tr');
        errorRow.innerHTML = `
            <td colspan="9" class="text-center text-error">
                <div class="error-state">
                    <i class='bx bx-error-circle'></i>
                    <p>Error loading payments</p>
                </div>
            </td>
        `;
        paymentsContainer.appendChild(errorRow);
    }
}

function createPaymentRow(id, payment) {
    const row = document.createElement('tr');
    
    // Formatear fecha
    const createdAt = payment.createdAt?.toDate ? 
        payment.createdAt.toDate().toLocaleDateString('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }) : 'N/A';

    row.innerHTML = `
        <td class="id-cell">${id.slice(-6)}</td>
        <td>${payment.campaignId || 'N/A'}</td>
        <td>${payment.sellerId || 'N/A'}</td>
        <td>${payment.buyerId || 'N/A'}</td>
        <td>${payment.accountsRequested || 0}</td>
        <td class="amount-cell">
            $${payment.amount?.toFixed(2) || '0.00'} ${payment.currency || 'USD'}
        </td>
        <td>
            <span class="status-badge status-${payment.status}">
                ${payment.status?.toUpperCase() || 'N/A'}
            </span>
        </td>
        <td>${createdAt}</td>
        <td>
            ${payment.status === 'pending' ? `
                <button onclick="approvePayment('${id}')" class="action-btn approve" title="Approve Payment">
                    <i class='bx bx-check'></i>
                </button>
                <button onclick="rejectPayment('${id}')" class="action-btn reject" title="Reject Payment">
                    <i class='bx bx-x'></i>
                </button>
            ` : ''}
        </td>
    `;
    return row;
}

async function approvePayment(paymentId) {
    try {
        const paymentRef = window.db.collection('payment_requests').doc(paymentId);
        const paymentDoc = await paymentRef.get();
        const payment = paymentDoc.data();

        // Obtener la campaña asociada
        const campaignRef = window.db.collection('campaigns').doc(payment.campaignId);
        const campaignDoc = await campaignRef.get();
        
        if (!campaignDoc.exists) {
            throw new Error('Campaign not found');
        }

        // Start a batch
        const batch = window.db.batch();

        // Update payment status
        batch.update(paymentRef, {
            status: 'completed',
            completedAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedBy: window.currentUser.uid
        });

        // Update campaign status
        batch.update(campaignRef, {
            status: 'active',
            paymentStatus: 'completed',
            paymentCompletedAt: firebase.firestore.FieldValue.serverTimestamp(),
            paymentCompletedBy: window.currentUser.uid
        });

        // Add to transaction history
        const transactionRef = window.db.collection('transactions').doc();
        batch.set(transactionRef, {
            type: 'payment',
            amount: payment.amount,
            buyerId: payment.buyerId,
            sellerId: payment.sellerId,
            campaignId: payment.campaignId,
            paymentId: paymentId,
            status: 'completed',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Add activity log
        const activityRef = window.db.collection('activity').doc();
        batch.set(activityRef, {
            type: 'payment',
            title: 'Payment Approved',
            description: `Payment of ${payment.amount} USDT has been approved for campaign ${payment.campaignId}`,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Agregar mensaje al chat
        const requestRef = window.db.collection('requests').doc(payment.requestId);
        const messageRef = requestRef.collection('messages').doc();
        batch.set(messageRef, {
            type: 'system',
            text: '✅ El administrador ha aprobado el pago',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Commit the batch
        await batch.commit();

        loadPayments(); // Refresh the list
    } catch (error) {
        console.error('Error approving payment:', error);
    }
}

async function rejectPayment(paymentId) {
    try {
        const paymentRef = window.db.collection('payment_requests').doc(paymentId);
        const paymentDoc = await paymentRef.get();
        const payment = paymentDoc.data();

        // Start a batch
        const batch = window.db.batch();

        // Update payment status
        batch.update(paymentRef, {
            status: 'rejected',
            rejectedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Add activity log
        const activityRef = window.db.collection('activity').doc();
        batch.set(activityRef, {
            type: 'payment',
            title: 'Payment Rejected',
            description: `Payment of ${payment.amount} USDT has been rejected`,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Commit the batch
        await batch.commit();

        loadPayments(); // Refresh the list
    } catch (error) {
        console.error('Error rejecting payment:', error);
    }
}

// Initialize payments page
window.auth.onAuthStateChanged(async (user) => {
    if (user) {
        // Check if user is admin
        const userDoc = await window.db.collection('users').doc(user.uid).get();
        if (!userDoc.exists || userDoc.data().role !== 'admin') {
            window.location.href = 'index.html';
            return;
        }

        // Load initial data
        loadPayments();

        // Add event listeners
        document.getElementById('refreshBtn').addEventListener('click', loadPayments);
        document.getElementById('paymentSearch').addEventListener('input', handleSearch);
        document.getElementById('dateFilter').addEventListener('change', handleFilters);
        document.getElementById('statusFilter').addEventListener('change', handleFilters);
        document.getElementById('sortOrder').addEventListener('change', handleFilters);
    } else {
        window.location.href = 'login.html';
    }
});

// Variables de paginación y filtrado
let currentPayments = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 10;

function handleSearch(event) {
    currentPage = 1;
    filterAndDisplayPayments();
}

function handleFilters() {
    currentPage = 1;
    filterAndDisplayPayments();
}

function updatePaginationControls(totalItems) {
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');

    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;

    prevBtn.onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            filterAndDisplayPayments();
        }
    };

    nextBtn.onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            filterAndDisplayPayments();
        }
    };
}

function filterAndDisplayPayments() {
    const searchTerm = document.getElementById('paymentSearch').value.toLowerCase();
    const dateFilter = document.getElementById('dateFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    const sortOrder = document.getElementById('sortOrder').value;

    let filtered = currentPayments;

    // Aplicar búsqueda
    if (searchTerm) {
        filtered = filtered.filter(payment => 
            payment.id.toLowerCase().includes(searchTerm) ||
            payment.buyerId?.toLowerCase().includes(searchTerm) ||
            payment.sellerId?.toLowerCase().includes(searchTerm)
        );
    }

    // Aplicar filtro de fecha
    if (dateFilter !== 'all') {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        filtered = filtered.filter(payment => {
            const paymentDate = payment.createdAt?.toDate();
            if (!paymentDate) return false;
            
            switch(dateFilter) {
                case 'today':
                    return paymentDate >= today;
                case 'week':
                    const weekAgo = new Date(today);
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    return paymentDate >= weekAgo;
                case 'month':
                    const monthAgo = new Date(today);
                    monthAgo.setMonth(monthAgo.getMonth() - 1);
                    return paymentDate >= monthAgo;
                default:
                    return true;
            }
        });
    }

    // Aplicar filtro de estado
    if (statusFilter !== 'all') {
        filtered = filtered.filter(payment => payment.status === statusFilter);
    }

    // Aplicar ordenamiento
    filtered.sort((a, b) => {
        switch(sortOrder) {
            case 'newest':
                return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
            case 'oldest':
                return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
            default:
                return 0;
        }
    });

    // Actualizar controles de paginación
    updatePaginationControls(filtered.length);

    // Aplicar paginación
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pagedItems = filtered.slice(startIndex, endIndex);

    // Mostrar resultados
    const paymentsContainer = document.getElementById('paymentsList');
    paymentsContainer.innerHTML = '';

    if (filtered.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `
            <td colspan="9" class="text-center">
                <div class="empty-state">
                    <i class='bx bx-search-alt'></i>
                    <p>No payments match your search criteria</p>
                </div>
            </td>
        `;
        paymentsContainer.appendChild(emptyRow);
        return;
    }

    pagedItems.forEach(payment => {
        const paymentRow = createPaymentRow(payment.id, payment);
        paymentsContainer.appendChild(paymentRow);
    });
}

// Refresh handler
document.getElementById('refreshBtn')?.addEventListener('click', loadPayments);
