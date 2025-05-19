// Payment management functions
async function loadPayments() {
    try {
        const paymentsSnapshot = await window.db.collection('payment_requests')
            .orderBy('createdAt', 'desc')
            .get();

        const paymentsContainer = document.getElementById('paymentsList');
        paymentsContainer.innerHTML = '';

        paymentsSnapshot.forEach(doc => {
            const payment = doc.data();
            const paymentCard = createPaymentCard(doc.id, payment);
            paymentsContainer.appendChild(paymentCard);
        });
    } catch (error) {
        console.error('Error loading payments:', error);
    }
}

function createPaymentCard(id, payment) {
    const card = document.createElement('div');
    card.className = 'payment-card';
    card.innerHTML = `
        <div class="payment-header">
            <h3>Payment Request #${id.slice(-6)}</h3>
            <span class="status ${payment.status}">${payment.status}</span>
        </div>
        <div class="payment-details">
            <p><strong>Amount:</strong> ${payment.amount} USDT</p>
            <p><strong>From:</strong> ${payment.buyerId}</p>
            <p><strong>To:</strong> ${payment.sellerId}</p>
            <p><strong>Created:</strong> ${payment.createdAt.toDate().toLocaleDateString()}</p>
            ${payment.status === 'pending' ? `
                <div class="payment-actions">
                    <button onclick="approvePayment('${id}')" class="approve-btn">
                        <i class='bx bx-check'></i> Approve
                    </button>
                    <button onclick="rejectPayment('${id}')" class="reject-btn">
                        <i class='bx bx-x'></i> Reject
                    </button>
                </div>
            ` : ''}
        </div>
    `;
    return card;
}

async function approvePayment(paymentId) {
    try {
        const paymentRef = window.db.collection('payment_requests').doc(paymentId);
        const paymentDoc = await paymentRef.get();
        const payment = paymentDoc.data();

        // Start a batch
        const batch = window.db.batch();

        // Update payment status
        batch.update(paymentRef, {
            status: 'completed',
            completedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Add to transaction history
        const transactionRef = window.db.collection('transactions').doc();
        batch.set(transactionRef, {
            type: 'payment',
            amount: payment.amount,
            buyerId: payment.buyerId,
            sellerId: payment.sellerId,
            paymentId: paymentId,
            status: 'completed',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Add activity log
        const activityRef = window.db.collection('activity').doc();
        batch.set(activityRef, {
            type: 'payment',
            title: 'Payment Approved',
            description: `Payment of ${payment.amount} USDT has been approved`,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
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
        loadPayments();
    } else {
        window.location.href = 'index.html';
    }
});

// Refresh handler
document.getElementById('refreshBtn')?.addEventListener('click', loadPayments);
