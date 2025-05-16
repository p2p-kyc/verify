// Check if user is admin
async function checkAdmin() {
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (!userDoc.exists || userDoc.data().role !== 'admin') {
            window.location.href = '/dashboard.html';
        }
    } catch (error) {
        console.error('Error checking admin status:', error);
        window.location.href = '/dashboard.html';
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
                <a href="${verification.proofUrl}" target="_blank" class="text-green">View Payment Proof</a>
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

// Initialize admin page
document.addEventListener('DOMContentLoaded', () => {
    checkAdmin();
    loadApprovedVerifications();
});
