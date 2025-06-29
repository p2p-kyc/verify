// Payment management functions
async function loadPayments() {
    try {
        const paymentsSnapshot = await window.db.collection('payment_requests')
            .orderBy('createdAt', 'desc')
            .get();

        // Get user and campaign data for all payments
        const payments = await Promise.all(paymentsSnapshot.docs.map(async (doc) => {
            const payment = doc.data();
            const [sellerData, buyerData, campaignData] = await Promise.all([
                getUserData(payment.sellerId),
                getUserData(payment.buyerId),
                getCampaignData(payment.campaignId)
            ]);
            return {
            id: doc.id,
                ...payment,
                sellerEmail: sellerData?.email || 'N/A',
                sellerBinanceId: sellerData?.binanceId || 'N/A',
                buyerEmail: buyerData?.email || 'N/A',
                campaignName: campaignData?.name || 'N/A'
            };
        }));

        currentPayments = payments;
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
    
    // Format date
    const createdAt = payment.createdAt?.toDate ? 
        payment.createdAt.toDate().toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }) : 'N/A';

    row.innerHTML = `
        <td class="id-cell">${id.slice(-6)}</td>
        <td>${payment.campaignName || 'N/A'}</td>
        <td>${payment.sellerEmail}</td>
        <td>${payment.sellerBinanceId}</td>
        <td>${payment.buyerEmail}</td>
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
            ${payment.status === 'approved' ? `
                <button onclick="openPaymentProofModal('${id}')" class="action-btn pay" title="Upload Payment Proof">
                    <i class='bx bx-upload'></i>
                </button>
            ` : payment.status === 'pending' ? `
                <button onclick="approvePayment('${id}')" class="action-btn approve" title="Approve Payment">
                    <i class='bx bx-check'></i>
                </button>
                <button onclick="rejectPayment('${id}')" class="action-btn reject" title="Reject Payment">
                    <i class='bx bx-x'></i>
                </button>
            ` : payment.status === 'appealed' ? `
                <button onclick="handleAppeal('${id}', true)" class="action-btn approve" title="Approve Appeal">
                    <i class='bx bx-check'></i>
                </button>
                <button onclick="handleAppeal('${id}', false)" class="action-btn reject" title="Reject Appeal">
                    <i class='bx bx-x'></i>
                </button>
                <button onclick="openChat('${payment.requestId}')" class="action-btn chat" title="Open Chat">
                    <i class='bx bx-chat'></i>
                </button>
            ` : ''}
        </td>
    `;
    return row;
}

// Variables globales
let currentPaymentId = null;

// Funciones del modal
function openPaymentProofModal(paymentId) {
    currentPaymentId = paymentId;
    const modal = document.getElementById('paymentProofModal');
    modal.classList.add('active');
}

function closePaymentProofModal() {
    const modal = document.getElementById('paymentProofModal');
    modal.classList.remove('active');
    document.getElementById('paymentProofForm').reset();
    document.getElementById('imagePreview').style.display = 'none';
    currentPaymentId = null;
}

// Preview de imagen
document.getElementById('paymentProofFile').addEventListener('change', function(event) {
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

// Manejo del formulario
document.getElementById('paymentProofForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    const file = document.getElementById('paymentProofFile').files[0];
    if (!file || !currentPaymentId) return;

    try {
        // Convertir imagen a base64
        const base64Image = await getBase64(file);

        // Actualizar pago y enviar mensaje
        await completePaymentWithProof(currentPaymentId, base64Image);

        // Cerrar modal y recargar
        closePaymentProofModal();
        loadPayments();
    } catch (error) {
        console.error('Error processing payment proof:', error);
        alert('Error processing payment proof. Please try again.');
    }
});

async function completePaymentWithProof(paymentId, imageUrl) {
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

        // Obtener la solicitud asociada al pago
        const requestsSnapshot = await window.db.collection('requests')
            .where('campaignId', '==', payment.campaignId)
            .where('userId', '==', payment.sellerId)
            .get();

        if (requestsSnapshot.empty) {
            throw new Error('Request not found');
        }

        const requestDoc = requestsSnapshot.docs[0];
        const chatRequestRef = requestDoc.ref;

        // Start a batch
        const batch = window.db.batch();

        // Update payment status
        batch.update(paymentRef, {
            status: 'paid',
            completedAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedBy: window.currentUser.uid,
            paymentProofData: imageUrl // base64 image data
        });

        // Create chat message with payment proof
        const paymentProofMessage = chatRequestRef.collection('messages').doc();
        batch.set(paymentProofMessage, {
            type: 'payment_proof',
            content: 'Payment proof uploaded by admin',
            imageData: imageUrl, // base64 image data
            senderId: window.currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            visibleTo: ['admin', payment.sellerId], // Solo visible para admin y vendedor
            metadata: {
                paymentId: paymentId,
                amount: payment.amount,
                currency: payment.currency
            }
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
            text: '✅ The administrator has approved the payment',
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

// Manejar apelaciones
async function handleAppeal(paymentId, approve) {
    try {
        const paymentRef = window.db.collection('payment_requests').doc(paymentId);
        const paymentDoc = await paymentRef.get();
        const payment = paymentDoc.data();

        if (!payment || payment.status !== 'appealed') {
            throw new Error('Invalid payment or status');
        }

        const batch = window.db.batch();

        // Actualizar estado del pago
        batch.update(paymentRef, {
            status: approve ? 'approved' : 'rejected',
            appealRespondedAt: firebase.firestore.FieldValue.serverTimestamp(),
            appealResponse: approve ? 'approved' : 'rejected'
        });

        // Agregar mensaje al chat
        const messageRef = window.db.collection('requests')
            .doc(payment.requestId)
            .collection('messages')
            .doc();

        batch.set(messageRef, {
            text: approve 
                ? '👍 The administrator has approved the appeal for the payment' 
                : '❌ The administrator has rejected the appeal for the payment',
            type: 'appeal_response',
            userId: window.auth.currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            paymentRequestId: paymentId,
            response: approve ? 'approved' : 'rejected'
        });

        // Registrar actividad
        const activityRef = window.db.collection('activity').doc();
        batch.set(activityRef, {
            type: 'payment_appeal',
            title: approve ? 'Appeal Approved' : 'Appeal Rejected',
            description: `Appeal for payment of ${payment.amount} USDT has been ${approve ? 'approved' : 'rejected'}`,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();
        loadPayments();

    } catch (error) {
        console.error('Error handling appeal:', error);
        alert('Error processing appeal: ' + error.message);
    }
}

// Open chat
function openChat(requestId) {
    window.open(`chat-admin.html?requestId=${requestId}`, '_blank');
}

// Initialize payments page
window.auth.onAuthStateChanged(async (user) => {
    if (user) {
        // Check if user is admin
        const userDoc = await window.db.collection('users').doc(user.uid).get();
        if (!userDoc.exists || userDoc.data().role !== 'admin') {
            redirectTo('index.html');
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
        redirectTo('login.html');
    }
});

// Pagination and filtering variables
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

    // Apply search
    if (searchTerm) {
        filtered = filtered.filter(payment => 
            payment.id.toLowerCase().includes(searchTerm) ||
            payment.campaignName?.toLowerCase().includes(searchTerm) ||
            payment.buyerEmail?.toLowerCase().includes(searchTerm) ||
            payment.sellerEmail?.toLowerCase().includes(searchTerm)
        );
    }

    // Apply date filter
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

    // Apply status filter
    if (statusFilter !== 'all') {
        filtered = filtered.filter(payment => payment.status === statusFilter);
    }

    // Apply sorting
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

    // Update pagination controls
    updatePaginationControls(filtered.length);

    // Apply pagination
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pagedItems = filtered.slice(startIndex, endIndex);

    // Show results
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

// Function to get campaign data
async function getCampaignData(campaignId) {
    if (!campaignId) return null;
    try {
        const campaignDoc = await window.db.collection('campaigns').doc(campaignId).get();
        if (campaignDoc.exists) {
            return campaignDoc.data();
        }
        return null;
    } catch (error) {
        console.error(`Error getting campaign data for ${campaignId}:`, error);
        return null;
    }
}

// Function to get user data
async function getUserData(userId) {
    try {
        const userDoc = await window.db.collection('users').doc(userId).get();
        return userDoc.exists ? userDoc.data() : { email: 'N/A', binanceId: 'N/A' };
    } catch (error) {
        console.error('Error getting user data:', error);
        return { email: 'N/A', binanceId: 'N/A' };
    }
}

// Approve payment
async function approvePayment(paymentId) {
    try {
        if (!confirm('Are you sure you want to approve this payment?')) {
            return;
        }

        // Get payment data
        const paymentDoc = await window.db.collection('payment_requests').doc(paymentId).get();
        if (!paymentDoc.exists) {
            throw new Error('Payment not found');
        }

        const paymentData = paymentDoc.data();
        if (paymentData.status !== 'pending') {
            throw new Error('This payment has already been processed');
        }

        // Update payment status
        await window.db.collection('payment_requests').doc(paymentId).update({
            status: 'approved',
            approvedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
            approvedBy: window.auth.currentUser.uid
        });

        // Reload payments
        await loadPayments();

    } catch (error) {
        console.error('Error approving payment:', error);
        alert('Error approving payment: ' + error.message);
    }
}

// Refresh handler
document.getElementById('refreshBtn')?.addEventListener('click', loadPayments);

// Mobile sidebar functions for admin
function toggleAdminSidebar() {
    const sidebar = document.querySelector('.admin-sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    if (sidebar.classList.contains('show')) {
        closeAdminSidebar();
    } else {
        openAdminSidebar();
    }
}

function openAdminSidebar() {
    const sidebar = document.querySelector('.admin-sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    sidebar.classList.add('show');
    if (overlay) {
        overlay.classList.add('show');
    }
    document.body.style.overflow = 'hidden';
}

function closeAdminSidebar() {
    const sidebar = document.querySelector('.admin-sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    sidebar.classList.remove('show');
    if (overlay) {
        overlay.classList.remove('show');
    }
    document.body.style.overflow = '';
}

// Close sidebar when clicking on a link (mobile)
document.addEventListener('DOMContentLoaded', () => {
    const sidebarLinks = document.querySelectorAll('.admin-sidebar .sidebar-menu a');
    sidebarLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                closeAdminSidebar();
            }
        });
    });
});
