// Global variables
let currentUser = null;
let activeRequest = null;
let messagesListener = null;

// DOM elements
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const messagesContainer = document.getElementById('messagesContainer');

// Event listeners
messageForm.addEventListener('submit', handleMessageSubmit);

// Listen for authentication changes
auth.onAuthStateChanged(async user => {
    if (!user) {
        redirectTo('index.html');
        return;
    }

    currentUser = user;
    loadChats();

    // If there's a requestId in the URL, open that chat
    const urlParams = new URLSearchParams(window.location.search);
    const requestId = urlParams.get('requestId');
    if (requestId) {
        openChat(requestId);
    }
});

// Load chat list
async function loadChats() {
    try {
        const chatsList = document.getElementById('chatsList');

        // Search for all accepted requests where the user is involved
        // Get all user campaigns (as buyer)
        const createdCampaigns = await db.collection('campaigns')
            .where('createdBy', '==', currentUser.uid)
            .get();

        // Get all requests where the user is seller
        const sellerRequests = await db.collection('requests')
            .where('sellerId', '==', currentUser.uid)
            .get();

        let allRequests = [];

        // Add requests where the user is seller
        allRequests = allRequests.concat(sellerRequests.docs);

        // Add requests from campaigns created by the user
        if (!createdCampaigns.empty) {
            const campaignIds = createdCampaigns.docs.map(doc => doc.id);
            const buyerRequests = await db.collection('requests')
                .where('campaignId', 'in', campaignIds)
                .get();
            allRequests = allRequests.concat(buyerRequests.docs);
        }

        if (allRequests.length === 0) {
            chatsList.innerHTML = '<p class="no-data">No chats available</p>';
            return;
        }

        const chatsHtml = await Promise.all(allRequests.map(async doc => {
            const requestData = doc.data();
            const campaignDoc = await db.collection('campaigns').doc(requestData.campaignId).get();
            const campaignData = { id: campaignDoc.id, ...campaignDoc.data() };
            
            // Get other user data
            const otherUserId = requestData.userId === currentUser.uid ? 
                campaignData.createdBy : requestData.userId;
            const otherUserData = await getUserData(otherUserId);

            return createChatListItem(doc.id, campaignData, otherUserData);
        }));

        chatsList.innerHTML = chatsHtml.join('');

    } catch (error) {
        console.error('Error loading chats:', error);
        alert('Error loading chats: ' + error.message);
    }
}

// Create chat list item
function createChatListItem(requestId, campaignData, userData) {
    return `
        <div class="chat-item" onclick="openChat('${requestId}')">
            <div class="chat-info">
                <h4>${userData.name || userData.email}</h4>
                <p class="campaign-title">${campaignData.name}</p>
                <span class="chat-status ${campaignData.status}">
                    ${campaignData.status === 'pending' ? 'Pending' : 'Active'}
                </span>
            </div>
        </div>
    `;
}

// Open chat by campaign ID (when coming from URL)
async function openChatByCampaignId(campaignId) {
    try {
        // Get the campaign
        const campaignDoc = await db.collection('campaigns').doc(campaignId).get();
        if (!campaignDoc.exists) {
            throw new Error('Campaign not found');
        }

        const campaignData = campaignDoc.data();
        const isCreator = campaignData.createdBy === currentUser.uid;

        // Build query based on whether it's creator or not
        const requestQuery = db.collection('requests')
            .where('campaignId', '==', campaignId)
            .where(isCreator ? 'status' : 'userId', '==', isCreator ? 'accepted' : currentUser.uid);

        const snapshot = await requestQuery.get();

        if (snapshot.empty) {
            throw new Error('No chats found for this campaign');
        }

        // Open the first chat found
        openChat(snapshot.docs[0].id);

    } catch (error) {
        console.error('Error opening chat:', error);
        alert('Error opening chat: ' + error.message);
    }
}

// Open chat
async function openChat(requestId) {
    try {
        // Get request data
        const requestDoc = await db.collection('requests').doc(requestId).get();
        if (!requestDoc.exists) {
            throw new Error('Chat not found');
        }

        const requestData = requestDoc.data();
        activeRequest = {
            id: requestDoc.id,
            ...requestData
        };

        // Get campaign data
        const campaignDoc = await db.collection('campaigns').doc(requestData.campaignId).get();
        if (!campaignDoc.exists) {
            throw new Error('Campaign not found');
        }

        const campaign = campaignDoc.data();
        // Get button references
        const chargeButton = document.getElementById('chargeButton');
        const finishButton = document.getElementById('finishButton');
        
        // Check if there's a pending charge
        const chargeQuery = await db.collection('charges')
            .where('requestId', '==', requestId)
            .where('status', '==', 'pending')
            .get();

        const buttonDisabled = !chargeQuery.empty;

        // Update information in modal
        const modalCampaignInfo = document.getElementById('modalCampaignInfo');
        if (modalCampaignInfo) {
            modalCampaignInfo.innerHTML = `
                <div class="campaign-info">
                    <h3>${campaign.name}</h3>
                    <div class="campaign-stats">
                        <span class="stat">
                            <i class="bx bx-user-check"></i>
                            ${campaign.verifiedAccounts || 0}/${campaign.totalAccounts} verifications
                        </span>
                        <span class="stat">
                            <i class="bx bx-dollar-circle"></i>
                            ${campaign.pricePerAccount} USDT per verification
                        </span>
                        <span class="stat">
                            <i class="bx bx-time"></i>
                            ${formatDate(campaign.endDate)}
                        </span>
                    </div>
                </div>
            `;

            // Update confirm button state
            const confirmChargeButton = document.getElementById('confirmChargeButton');
            if (confirmChargeButton) {
                confirmChargeButton.disabled = buttonDisabled;
                confirmChargeButton.innerHTML = buttonDisabled ? `
                    <i class='bx bx-x'></i>
                    <span>Pending charge</span>
                ` : `
                    <i class='bx bx-check'></i>
                    <span>Confirm charge</span>
                `;
            }
        }
        
        // Update charge button
        if (chargeButton) {
            chargeButton.innerHTML = `
                <i class='bx bx-dollar-circle'></i>
                <span>Request payment</span>
            `;
        }

        // Update chat title
        const otherUserId = requestData.userId === currentUser.uid ? 
            campaign.createdBy : requestData.userId;
        const otherUserData = await getUserData(otherUserId);
        document.getElementById('chatTitle').textContent = `Chat with ${otherUserData.name || otherUserData.email}`;

        // Clear messages container
        messagesContainer.innerHTML = '';

        // Load messages
        loadMessages(requestId);

    } catch (error) {
        console.error('Error opening chat:', error);
        alert('Error opening chat: ' + error.message);
    }
}

// Add message to container
function appendMessage(message) {
    const messagesContainer = document.getElementById('messagesContainer');
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    
    // Determine if message is outgoing or incoming
    const isOutgoing = message.userId === currentUser.uid;
    messageDiv.classList.add(isOutgoing ? 'outgoing' : 'incoming');

    // Get user role for this message
    const userRole = isOutgoing ? 
        (activeRequest.userId === currentUser.uid ? 'Seller' : 'Buyer') : 
        (activeRequest.userId === message.userId ? 'Seller' : 'Buyer');

    messageDiv.innerHTML = `
        <div class="user-role">${userRole}</div>
        <div class="message-content">${message.text}</div>
        <div class="timestamp">${formatDate(message.createdAt)}</div>
    `;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Show charge modal
function showChargeModal() {
    const modal = document.getElementById('chargeModal');
    modal.classList.add('show');
}

// Close charge modal
function closeChargeModal() {
    const modal = document.getElementById('chargeModal');
    modal.classList.remove('show');
}

// Handle account charge
async function handleCharge() {
    try {
        const confirmButton = document.getElementById('confirmChargeButton');
        confirmButton.disabled = true;
        confirmButton.innerHTML = `
            <i class='bx bx-loader-alt bx-spin'></i>
            <span>Processing...</span>
        `;

        // Verify it's the seller
        if (!activeRequest || !currentUser) {
            throw new Error('No active request');
        }

        // Check if there's already a pending charge
        const existingCharges = await db.collection('charges')
            .where('requestId', '==', activeRequest.id)
            .where('status', '==', 'pending')
            .get();

        if (!existingCharges.empty) {
            alert('There is already a pending charge request for this account.');
            return;
        }

        // Create charge request
        const chargeRequest = {
            campaignId: activeRequest.campaignId,
            requestId: activeRequest.id,
            sellerId: currentUser.uid,
            buyerId: activeRequest.buyerId,
            amount: activeRequest.pricePerAccount,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        // Save charge request
        await db.collection('charges').add(chargeRequest);

        // Send message to chat
        await db.collection('requests')
            .doc(activeRequest.id)
            .collection('messages')
            .add({
                text: '💰 A charge request has been sent',
                userId: currentUser.uid,
                type: 'system',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

        // Close modal and notify
        closeChargeModal();
        alert('Charge request sent. Waiting for buyer approval.');

    } catch (error) {
        console.error('Error sending charge:', error);
        alert('Error: ' + error.message);
    } finally {
        // Update button states
        const chargeButton = document.getElementById('chargeButton');
        const confirmButton = document.getElementById('confirmChargeButton');
        
        chargeButton.disabled = true;
        chargeButton.innerHTML = `
            <i class='bx bx-x'></i>
            <span>Pending charge</span>
        `;
        
        confirmButton.disabled = true;
        confirmButton.innerHTML = `
            <i class='bx bx-check'></i>
            <span>Confirm charge</span>
        `;
    }
}

// Send message
async function handleMessageSubmit(event) {
    event.preventDefault();

    if (!activeRequest) {
        alert('Please select a chat');
        return;
    }

    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const text = messageInput.value.trim();

    if (!text) return;

    try {
        // Disable input and button while sending
        messageInput.disabled = true;
        sendButton.disabled = true;
        sendButton.classList.add('sending');

        await db.collection('requests')
            .doc(activeRequest.id)
            .collection('messages')
            .add({
                text: text,
                userId: currentUser.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                userRole: activeRequest.sellerId === currentUser.uid ? 'seller' : 'buyer'
            });

        messageInput.value = '';
        messageInput.focus();

    } catch (error) {
        console.error('Error sending message:', error);
        alert('Error sending message: ' + error.message);
    } finally {
        // Re-enable input and button
        messageInput.disabled = false;
        sendButton.disabled = false;
        sendButton.classList.remove('sending');
    }
}

// Get user data
async function getUserData(userId) {
    const userDoc = await db.collection('users').doc(userId).get();
    return {
        id: userId,
        ...userDoc.data()
    };
}

// Utilities
function formatDate(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp.seconds * 1000).toLocaleString();
}
