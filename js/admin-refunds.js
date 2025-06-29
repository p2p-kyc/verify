// Global variables
let currentUser = null;
let currentRefundId = null;

// Load refunds
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

// Create refund row
function createRefundRow(id, refund) {
    const row = document.createElement('tr');
    
    // Format date
    const createdAt = refund.createdAt?.toDate ? 
        refund.createdAt.toDate().toLocaleDateString('en-US', {
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

// Approve refund
async function approveRefund(refundId) {
    try {
        if (!confirm('Are you sure you want to approve this refund?')) {
            return;
        }

        // Get refund data
        const refundDoc = await db.collection('refund_requests').doc(refundId).get();
        if (!refundDoc.exists) {
            throw new Error('Refund not found');
        }

        const refundData = refundDoc.data();
        if (refundData.status !== 'pending') {
            throw new Error('This refund has already been processed');
        }

        // Update refund status
        await db.collection('refund_requests').doc(refundId).update({
            status: 'approved',
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedBy: auth.currentUser.uid
        });

        // Reload refunds
        await loadRefunds();

    } catch (error) {
        console.error('Error approving refund:', error);
        alert('Error approving refund: ' + error.message);
    }
}

// Reject refund
async function rejectRefund(refundId) {
    try {
        if (!confirm('Are you sure you want to reject this refund?')) {
            return;
        }

        // Get refund data
        const refundDoc = await db.collection('refund_requests').doc(refundId).get();
        if (!refundDoc.exists) {
            throw new Error('Refund not found');
        }

        const refundData = refundDoc.data();
        if (refundData.status !== 'pending') {
            throw new Error('This refund has already been processed');
        }

        // Update refund status
        await db.collection('refund_requests').doc(refundId).update({
            status: 'rejected',
            rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
            rejectedBy: auth.currentUser.uid
        });

        // Reload refunds
        await loadRefunds();

    } catch (error) {
        console.error('Error rejecting refund:', error);
        alert('Error rejecting refund: ' + error.message);
    }
}

// Refund proof modal
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

// Image preview
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

// Convert image to base64
function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// Handle proof form
document.getElementById('refundProofForm').addEventListener('submit', async function(event) {
    event.preventDefault();
    
    try {
        const file = document.getElementById('refundProofFile').files[0];
        if (!file) {
            throw new Error('Please select an image');
        }

        // Convert image to base64
        const reader = new FileReader();
        const base64Promise = new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
        });
        reader.readAsDataURL(file);
        const imageUrl = await base64Promise;

        // Update refund with proof
        await completeRefundWithProof(currentRefundId, imageUrl);

        // Close modal and reload list
        closeRefundProofModal();
        await loadRefunds();

    } catch (error) {
        console.error('Error uploading refund proof:', error);
        alert('Error uploading refund proof: ' + error.message);
    }
});

// Complete refund with proof
async function completeRefundWithProof(refundId, imageUrl) {
    try {
        // Get refund data
        const refundDoc = await db.collection('refund_requests').doc(refundId).get();
        if (!refundDoc.exists) {
            throw new Error('Refund not found');
        }

        const refundData = refundDoc.data();
        
        // Update refund
        await db.collection('refund_requests').doc(refundId).update({
            status: 'completed',
            completedAt: firebase.firestore.FieldValue.serverTimestamp(),
            completedBy: auth.currentUser.uid,
            proofUrl: imageUrl
        });

        // Update campaign status
        if (refundData.campaignId) {
            const campaignDoc = await db.collection('campaigns').doc(refundData.campaignId).get();
            await db.collection('campaigns').doc(refundData.campaignId).update({
                status: 'cancelled',
                cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
                cancelledBy: auth.currentUser.uid
            });
        }

        // Create message in chat
        if (refundData.requestId) {
            const message = {
                type: 'refund_proof',
                text: 'Refund proof',
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
        // Wait for authentication to complete
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
        console.log('User doc:', userDoc.data());

        if (!userDoc.exists) {
            console.error('User document does not exist');
            redirectTo('index.html');
            return;
        }

        if (userDoc.data().role !== 'admin') {
            console.error('User is not admin');
            redirectTo('index.html');
            return;
        }

        console.log('Admin check passed');
    } catch (error) {
        console.error('Error checking admin status:', error);
        redirectTo('index.html');
    }
}

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
    checkAdmin();
    
    // Event listeners
    document.getElementById('refreshBtn').addEventListener('click', loadRefunds);
    document.getElementById('refundSearch').addEventListener('input', handleSearch);
    document.getElementById('dateFilter').addEventListener('change', handleFilters);
    document.getElementById('statusFilter').addEventListener('change', handleFilters);
    document.getElementById('sortOrder').addEventListener('change', handleFilters);
    
    // Load initial refunds
    loadRefunds();
});

// Search and filters
function handleSearch(event) {
    // Implement search
    console.log('Search:', event.target.value);
}

function handleFilters() {
    // Implement filters
    console.log('Filters changed');
}

// Logout
function handleLogout() {
    window.auth.signOut()
        .then(() => {
            redirectTo('index.html');
        })
        .catch((error) => {
            console.error('Error signing out:', error);
        });
}
