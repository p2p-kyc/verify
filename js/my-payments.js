// Wait for Firebase to be initialized
window.addEventListener('load', () => {
    window.auth.onAuthStateChanged(async user => {
        if (!user) {
            console.log('[MyPayments] User not authenticated, redirecting to index.html');
            window.location.href = 'index.html';
            return;
        }
        console.log('[MyPayments] Authenticated user:', user.uid, user.email);
        const paymentsList = document.getElementById('paymentsList');
        paymentsList.innerHTML = '<div class="loading">Loading payments...</div>';
        try {
            const snapshot = await window.db.collection('payment_requests')
                .where('userId', '==', user.uid)
                .orderBy('createdAt', 'desc')
                .get();
            console.log('[MyPayments] Payments found:', snapshot.size);
            if (snapshot.empty) {
                paymentsList.innerHTML = '<div class="no-data">No payments found.</div>';
                return;
            }
            paymentsList.innerHTML = Array.from(snapshot.docs).map(doc => {
                const data = doc.data();
                console.log('[MyPayments] Payment:', doc.id, data);
                return `<div class="payment-item">
                    <div><b>Campaign:</b> ${data.campaignName || data.campaignId}</div>
                    <div><b>Amount:</b> ${data.amount || data.total || 0} USDT</div>
                    <div><b>Status:</b> ${data.status || 'pending'}</div>
                    <div><b>Date:</b> ${data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toLocaleString() : ''}</div>
                </div>`;
            }).join('');
        } catch (error) {
            console.error('[MyPayments] Error loading payments:', error);
            paymentsList.innerHTML = '<div class="error">Error loading payments.</div>';
        }
    });
}); 