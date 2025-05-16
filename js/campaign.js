// Get campaign ID from URL
const urlParams = new URLSearchParams(window.location.search);
const campaignId = urlParams.get('id');
const action = urlParams.get('action');

let campaign = null;
let verification = null;

// Load campaign details
async function loadCampaignDetails() {
    try {
        const doc = await db.collection('campaigns').doc(campaignId).get();
        if (!doc.exists) {
            alert('Campaign not found');
            window.location.href = '/dashboard.html';
            return;
        }

        campaign = { id: doc.id, ...doc.data() };
        displayCampaignDetails();
        
        // Check if user has a verification for this campaign
        const verificationSnapshot = await db.collection('verifications')
            .where('campaignId', '==', campaignId)
            .where('userId', '==', currentUser.uid)
            .limit(1)
            .get();
            
        if (!verificationSnapshot.empty) {
            verification = { id: verificationSnapshot.docs[0].id, ...verificationSnapshot.docs[0].data() };
            handleVerificationState();
        } else if (action === 'join' && campaign.createdBy !== currentUser.uid) {
            document.getElementById('verificationSection').style.display = 'block';
        }
        
    } catch (error) {
        console.error('Error loading campaign:', error);
        alert('Error loading campaign details');
    }
}

// Display campaign details
function displayCampaignDetails() {
    const detailsDiv = document.getElementById('campaignDetails');
    detailsDiv.innerHTML = `
        <h2>${campaign.name}</h2>
        <p>Price: ${campaign.price} USDT</p>
        <p>Verifications: ${campaign.verificationCount}/${campaign.verificationLimit}</p>
        <p>Status: ${campaign.status}</p>
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
