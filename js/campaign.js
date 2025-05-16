// Parse URL parameters
const urlParams = new URLSearchParams(window.location.search);
const campaignId = urlParams.get('id');
const action = urlParams.get('action');

// Initialize state
let campaign = null;
let verification = null;

// Redirect to dashboard if no campaign ID
if (!campaignId) {
    console.error('No campaign ID provided');
    window.location.href = 'dashboard.html';
}

// Wait for auth to be ready
function waitForAuth() {
    return new Promise((resolve, reject) => {
        console.log('Waiting for auth...');
        
        // Check if user is already authenticated
        const currentUser = auth.currentUser || window.currentUser;
        if (currentUser) {
            console.log('User already authenticated:', currentUser.uid);
            window.currentUser = currentUser;
            return resolve(currentUser);
        }

        let timeoutId;
        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user) {
                console.log('User authenticated:', user.uid);
                window.currentUser = user;
                clearTimeout(timeoutId);
                unsubscribe();
                resolve(user);
            } else {
                console.log('User not authenticated yet');
            }
        }, (error) => {
            console.error('Auth state change error:', error);
            clearTimeout(timeoutId);
            unsubscribe();
            reject(error);
        });

        // Timeout after 10 seconds
        timeoutId = setTimeout(() => {
            unsubscribe();
            reject(new Error('Auth timeout - Please try refreshing the page'));
        }, 10000);
    });
}

// Load campaign details
async function loadCampaignDetails() {
    try {
        console.log('Loading campaign details...');
        
        // Verify campaign ID
        if (!campaignId) {
            throw new Error('Campaign ID is missing');
        }
        console.log('Campaign ID:', campaignId);

        // Wait for authentication
        const user = await waitForAuth();
        if (!user) {
            throw new Error('User authentication failed');
        }
        console.log('User authenticated:', user.uid);
        console.log('Auth token:', await user.getIdToken());
        
        // Verify Firestore instance
        if (!db) {
            throw new Error('Firestore is not initialized');
        }
        console.log('Firestore instance:', db);
        
        // Get campaign document
        console.log('Fetching campaign document...');
        try {
            // Get campaign document
            const doc = await db.collection('campaigns').doc(campaignId).get();
            console.log('Campaign document:', doc);
            
            if (!doc.exists) {
                throw new Error('Campaign not found');
            }
            
            // Log campaign data
            const data = doc.data();
            console.log('Campaign data:', {
                id: doc.id,
                createdBy: data.createdBy,
                currentUser: user.uid,
                isOwner: data.createdBy === user.uid
            });
            
            // Update campaign state
            campaign = { id: doc.id, ...data };
            displayCampaignDetails();
            
            // Check if user has a verification for this campaign
            console.log('Checking user verification...');
            const verificationSnapshot = await db.collection('verifications')
                .where('campaignId', '==', campaignId)
                .where('userId', '==', user.uid)
                .limit(1)
                .get();
                
            if (!verificationSnapshot.empty) {
                verification = { id: verificationSnapshot.docs[0].id, ...verificationSnapshot.docs[0].data() };
                handleVerificationState();
            } else if (action === 'join' && campaign.createdBy !== user.uid) {
                document.getElementById('verificationSection').style.display = 'block';
            }
            
        } catch (error) {
            console.error('Firestore error details:', {
                code: error.code,
                message: error.message,
                userId: user.uid,
                campaignId: campaignId
            });
            throw error;
        }
        
    } catch (error) {
        console.error('Error loading campaign:', error);
        const campaignDetails = document.getElementById('campaignDetails');
        campaignDetails.innerHTML = `
            <div class="error-state">
                <i class='bx bx-error-circle'></i>
                <p>${error.message}</p>
                <button onclick="window.location.href='dashboard.html'" class="retry-btn">
                    <i class='bx bx-arrow-back'></i>
                    <span>Back to Dashboard</span>
                </button>
            </div>
        `;
    }
}

// Display campaign details
async function displayCampaignDetails() {
    const detailsDiv = document.getElementById('campaignDetails');
    
    // Get creator info
    let creatorName = 'Unknown';
    try {
        const creatorDoc = await db.collection('users').doc(campaign.createdBy).get();
        if (creatorDoc.exists) {
            creatorName = creatorDoc.data().name || creatorDoc.data().email;
        }
    } catch (error) {
        console.error('Error fetching creator info:', error);
    }

    // Format dates
    const createdAt = campaign.createdAt ? new Date(campaign.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';

    // Format status with color and icon
    const statusConfig = {
        active: { color: 'var(--terminal-green)', icon: 'bx-check-circle' },
        completed: { color: '#6c757d', icon: 'bx-check-double' },
        cancelled: { color: '#dc3545', icon: 'bx-x-circle' }
    };
    const status = statusConfig[campaign.status] || { color: '#6c757d', icon: 'bx-help-circle' };

    detailsDiv.innerHTML = `
        <div class="campaign-grid">
            <!-- Columna izquierda: Información principal -->
            <div class="main-info">
                <div class="campaign-header">
                    <h2>${campaign.name}</h2>
                    <span class="campaign-status" style="color: ${status.color}">
                        <i class='bx ${status.icon}'></i>
                        ${campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                    </span>
                </div>

                <div class="campaign-meta">
                    <div class="meta-item">
                        <i class='bx bx-user'></i>
                        <span>Created by: ${creatorName}</span>
                    </div>
                    <div class="meta-item">
                        <i class='bx bx-calendar'></i>
                        <span>Created on: ${createdAt}</span>
                    </div>
                </div>

                <div class="info-group description">
                    <h3><i class='bx bx-info-circle'></i> Description</h3>
                    <p>${campaign.description || 'No description provided'}</p>
                </div>
            </div>

            <!-- Columna derecha: Detalles y progreso -->
            <div class="campaign-details-sidebar">
                <div class="info-group price-summary">
                    <h3><i class='bx bx-dollar-circle'></i> Price Summary</h3>
                    <div class="price-details">
                        <div class="price-item">
                            <span class="label">Per Account:</span>
                            <span class="value">${campaign.pricePerAccount.toFixed(2)} USDT</span>
                        </div>
                        <div class="back-btn total">
                            <span class="label">Total:</span>
                            <span class="value">${campaign.totalPrice.toFixed(2)} USDT</span>
                        </div>
                    </div>
                </div>

                <div class="info-group verification-summary">
                    <h3><i class='bx bx-check-shield'></i> Verification Status</h3>
                    <div class="verification-progress">
                        <div class="progress-stats">
                            <span class="stat-label">Progress:</span>
                            <span class="stat-value">${campaign.verificationCount} of ${campaign.accountCount}</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress" style="width: ${(campaign.verificationCount / campaign.accountCount) * 100}%"></div>
                        </div>
                        <div class="progress-percentage">
                            ${Math.round((campaign.verificationCount / campaign.accountCount) * 100)}% Complete
                        </div>
                    </div>
                </div>

                <div class="info-group countries">
                    <h3><i class='bx bx-globe'></i> Available Countries</h3>
                    <div class="countries-list">
                        ${campaign.countries.map(country => `
                            <span class="country-tag">
                                <i class='bx bx-map'></i>
                                ${country.toUpperCase()}
                            </span>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Handle file selection
document.getElementById('paymentProof').addEventListener('change', function(event) {
    const file = event.target.files[0];
    const fileNameSpan = document.querySelector('.file-name');
    if (file) {
        fileNameSpan.textContent = file.name;
        fileNameSpan.style.display = 'block';
    } else {
        fileNameSpan.textContent = '';
        fileNameSpan.style.display = 'none';
    }
});

// Handle verification submission
async function handleSubmitVerification(event) {
    event.preventDefault();
    
    const fileInput = document.getElementById('paymentProof');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Please select a file');
        return;
    }
    
    try {
        // Upload file to Firebase Storage
        const storageRef = storage.ref();
        const fileRef = storageRef.child(`proofs/${campaignId}/${currentUser.uid}/${file.name}`);
        await fileRef.put(file);
        const downloadUrl = await fileRef.getDownloadURL();
        
        // Create verification document
        const verificationData = {
            campaignId,
            userId: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'pending',
            proofUrl: downloadUrl
        };
        
        const verificationRef = await db.collection('verifications').add(verificationData);
        verification = { id: verificationRef.id, ...verificationData };
        
        // Update campaign verification count
        await db.collection('campaigns').doc(campaignId).update({
            verificationCount: firebase.firestore.FieldValue.increment(1)
        });
        
        document.getElementById('verificationSection').style.display = 'none';
        handleVerificationState();
        
    } catch (error) {
        console.error('Error submitting verification:', error);
        alert('Error submitting verification');
    }
}

// Handle verification state
function handleVerificationState() {
    if (!verification) return;
    
    const chatSection = document.getElementById('chatSection');
    const approvalSection = document.getElementById('approvalSection');
    
    if (verification.status === 'approved') {
        chatSection.style.display = 'block';
        loadMessages();
    }
    
    if (campaign.createdBy === currentUser.uid && verification.status === 'pending') {
        approvalSection.style.display = 'block';
    }
}

// Handle verification approval
async function handleApproveVerification() {
    try {
        await db.collection('verifications').doc(verification.id).update({
            status: 'approved',
            approvedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        verification.status = 'approved';
        handleVerificationState();
        
    } catch (error) {
        console.error('Error approving verification:', error);
        alert('Error approving verification');
    }
}

// Load chat messages
async function loadMessages() {
    const messagesDiv = document.getElementById('chatMessages');
    
    // Real-time messages listener
    db.collection('messages')
        .where('verificationId', '==', verification.id)
        .orderBy('createdAt')
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const message = change.doc.data();
                    const messageEl = createMessageElement(message);
                    messagesDiv.appendChild(messageEl);
                    messagesDiv.scrollTop = messagesDiv.scrollHeight;
                }
            });
        });
}

// Create message element
function createMessageElement(message) {
    const div = document.createElement('div');
    div.className = `message ${message.userId === currentUser.uid ? 'sent' : 'received'}`;
    div.textContent = message.content;
    return div;
}

// Send message
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    
    if (!content) return;
    
    try {
        await db.collection('messages').add({
            verificationId: verification.id,
            userId: currentUser.uid,
            content,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        input.value = '';
        
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Error sending message');
    }
}

// Load campaign details when page loads
document.addEventListener('DOMContentLoaded', loadCampaignDetails);
