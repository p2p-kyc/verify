// Variables globales
let currentUser = null;
let activeRequest = null;
let messagesListener = null;

// Elementos del DOM
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const messagesContainer = document.getElementById('messagesContainer');

// Event listeners
messageForm.addEventListener('submit', handleMessageSubmit);

// Escuchar cambios de autenticación
auth.onAuthStateChanged(async user => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    currentUser = user;
    loadChats();

    // Si hay un requestId en la URL, abrir ese chat
    const urlParams = new URLSearchParams(window.location.search);
    const requestId = urlParams.get('requestId');
    if (requestId) {
        openChat(requestId);
    }
});

// Cargar lista de chats
async function loadChats() {
    try {
        const chatsList = document.getElementById('chatsList');

        // Buscar todas las solicitudes aceptadas donde el usuario está involucrado
        // Obtener todas las campañas del usuario (como comprador)
        const createdCampaigns = await db.collection('campaigns')
            .where('createdBy', '==', currentUser.uid)
            .get();

        // Obtener todas las solicitudes donde el usuario es vendedor
        const sellerRequests = await db.collection('requests')
            .where('sellerId', '==', currentUser.uid)
            .get();

        let allRequests = [];

        // Agregar solicitudes donde el usuario es vendedor
        allRequests = allRequests.concat(sellerRequests.docs);

        // Agregar solicitudes de las campañas creadas por el usuario
        if (!createdCampaigns.empty) {
            const campaignIds = createdCampaigns.docs.map(doc => doc.id);
            const buyerRequests = await db.collection('requests')
                .where('campaignId', 'in', campaignIds)
                .get();
            allRequests = allRequests.concat(buyerRequests.docs);
        }

        if (allRequests.length === 0) {
            chatsList.innerHTML = '<p class="no-data">No hay chats disponibles</p>';
            return;
        }

        const chatsHtml = await Promise.all(allRequests.map(async doc => {
            const requestData = doc.data();
            const campaignDoc = await db.collection('campaigns').doc(requestData.campaignId).get();
            const campaignData = { id: campaignDoc.id, ...campaignDoc.data() };
            
            // Obtener datos del otro usuario
            const otherUserId = requestData.userId === currentUser.uid ? 
                campaignData.createdBy : requestData.userId;
            const otherUserData = await getUserData(otherUserId);

            return createChatListItem(doc.id, campaignData, otherUserData);
        }));

        chatsList.innerHTML = chatsHtml.join('');

    } catch (error) {
        console.error('Error loading chats:', error);
        alert('Error al cargar los chats: ' + error.message);
    }
}

// Crear elemento de la lista de chats
function createChatListItem(requestId, campaignData, userData) {
    return `
        <div class="chat-item" onclick="openChat('${requestId}')">
            <div class="chat-info">
                <h4>${userData.name || userData.email}</h4>
                <p class="campaign-title">${campaignData.name}</p>
                <span class="chat-status ${campaignData.status}">
                    ${campaignData.status === 'pending' ? 'Pendiente' : 'Activo'}
                </span>
            </div>
        </div>
    `;
}

// Abrir chat por ID de campaña (cuando viene de la URL)
async function openChatByCampaignId(campaignId) {
    try {
        // Obtener la campaña
        const campaignDoc = await db.collection('campaigns').doc(campaignId).get();
        if (!campaignDoc.exists) {
            throw new Error('Campaña no encontrada');
        }

        const campaignData = campaignDoc.data();
        const isCreator = campaignData.createdBy === currentUser.uid;

        // Construir la consulta según si es creador o no
        const requestQuery = db.collection('requests')
            .where('campaignId', '==', campaignId)
            .where(isCreator ? 'status' : 'userId', '==', isCreator ? 'accepted' : currentUser.uid);

        const snapshot = await requestQuery.get();

        if (snapshot.empty) {
            throw new Error('No se encontraron chats para esta campaña');
        }

        // Abrir el primer chat encontrado
        openChat(snapshot.docs[0].id);

    } catch (error) {
        console.error('Error opening chat:', error);
        alert('Error al abrir el chat: ' + error.message);
    }
}

// Abrir chat
async function openChat(requestId) {
    try {
        // Obtener datos de la solicitud
        const requestDoc = await db.collection('requests').doc(requestId).get();
        if (!requestDoc.exists) {
            throw new Error('Chat no encontrado');
        }

        const requestData = requestDoc.data();
        activeRequest = {
            id: requestDoc.id,
            ...requestData
        };

        // Obtener datos de la campaña
        const campaignDoc = await db.collection('campaigns').doc(requestData.campaignId).get();
        if (!campaignDoc.exists) {
            throw new Error('Campaña no encontrada');
        }

        const campaign = campaignDoc.data();
        const campaignInfo = document.getElementById('campaignInfo');

        // Verificar si hay cobro pendiente si es vendedor
        let buttonHtml = '';
        if (currentUser.uid === requestData.sellerId) {
            const chargeQuery = await db.collection('charges')
                .where('requestId', '==', requestId)
                .where('status', '==', 'pending')
                .get();

            const buttonDisabled = !chargeQuery.empty;
            buttonHtml = `
                <div class="payment-action">
                    <button id="chargeButton" class="btn-charge" onclick="handleCharge()" ${buttonDisabled ? 'disabled' : ''}>
                        <i class='bx bx-dollar'></i>
                        <span>${buttonDisabled ? 'Cobro pendiente' : 'Cobrar cuenta'}</span>
                    </button>
                </div>
            `;
        }

        // Mostrar info de campaña y botón de cobro
        campaignInfo.innerHTML = `
            <div class="campaign-info">
                <h3>${campaign.name}</h3>
                <div class="campaign-stats">
                    <span class="stat">
                        <i class="bx bx-user-check"></i>
                        ${campaign.verifiedAccounts || 0}/${campaign.totalAccounts} verificaciones
                    </span>
                    <span class="stat">
                        <i class="bx bx-dollar-circle"></i>
                        ${campaign.pricePerAccount} USDT por verificación
                    </span>
                    <span class="stat">
                        <i class="bx bx-time"></i>
                        ${formatDate(campaign.endDate)}
                    </span>
                </div>
            </div>
            ${buttonHtml}
        `;

        // Obtener datos del otro usuario
        const otherUserId = requestData.sellerId === currentUser.uid ? requestData.buyerId : requestData.sellerId;
        const otherUserData = await getUserData(otherUserId);

        // Mostrar información en el header
        document.getElementById('chatTitle').textContent = `Chat con ${otherUserData.name || otherUserData.email}`;

        // Limpiar mensajes anteriores
        const messagesContainer = document.getElementById('messagesContainer');
        messagesContainer.innerHTML = '';

        // Detener listener anterior si existe
        if (messagesListener) {
            messagesListener();
        }

        // Escuchar nuevos mensajes
        messagesListener = db.collection('requests')
            .doc(requestId)
            .collection('messages')
            .orderBy('createdAt')
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const message = change.doc.data();
                        appendMessage(message);
                        // Scroll al último mensaje solo si estamos cerca del final
                        const isNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
                        if (isNearBottom) {
                            messagesContainer.scrollTop = messagesContainer.scrollHeight;
                        }
                    }
                });
            });

        // Mostrar formulario de mensajes
        document.getElementById('messageForm').style.display = 'flex';

    } catch (error) {
        console.error('Error opening chat:', error);
        alert('Error al abrir el chat: ' + error.message);
    }
}

// Agregar mensaje al contenedor
function appendMessage(message) {
    const messagesContainer = document.getElementById('messagesContainer');
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    
    // Determinar si el mensaje es saliente o entrante
    const isOutgoing = message.userId === currentUser.uid;
    messageDiv.classList.add(isOutgoing ? 'outgoing' : 'incoming');

    // Obtener el rol del usuario para este mensaje
    const userRole = isOutgoing ? 
        (activeRequest.userId === currentUser.uid ? 'Vendedor' : 'Comprador') : 
        (activeRequest.userId === message.userId ? 'Vendedor' : 'Comprador');

    messageDiv.innerHTML = `
        <div class="user-role">${userRole}</div>
        <div class="message-content">${message.text}</div>
        <div class="timestamp">${formatDate(message.createdAt)}</div>
    `;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Manejar el cobro de la cuenta
async function handleCharge() {
    try {
        const chargeButton = document.getElementById('chargeButton');
        chargeButton.disabled = true;

        // Verificar que sea el vendedor
        if (!activeRequest || !currentUser) {
            throw new Error('No hay una solicitud activa');
        }

        // Crear solicitud de cobro
        const chargeRequest = {
            campaignId: activeRequest.campaignId,
            requestId: activeRequest.id,
            sellerId: currentUser.uid,
            buyerId: activeRequest.buyerId,
            amount: activeRequest.pricePerAccount,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        // Guardar la solicitud de cobro
        await db.collection('charges').add(chargeRequest);

        // Enviar mensaje al chat
        await db.collection('requests')
            .doc(activeRequest.id)
            .collection('messages')
            .add({
                text: '💰 Se ha enviado una solicitud de cobro',
                userId: currentUser.uid,
                type: 'system',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

        // Notificar al comprador
        alert('Solicitud de cobro enviada. Esperando aprobación del comprador.');

    } catch (error) {
        console.error('Error al enviar cobro:', error);
        alert('Error: ' + error.message);
    } finally {
        chargeButton.disabled = false;
    }
}

// Enviar mensaje
async function handleMessageSubmit(event) {
    event.preventDefault();

    if (!activeRequest) {
        alert('Por favor selecciona un chat');
        return;
    }

    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const text = messageInput.value.trim();

    if (!text) return;

    try {
        // Deshabilitar input y botón mientras se envía
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
        alert('Error al enviar el mensaje: ' + error.message);
    } finally {
        // Re-habilitar input y botón
        messageInput.disabled = false;
        sendButton.disabled = false;
        sendButton.classList.remove('sending');
    }
}

// Obtener datos de usuario
async function getUserData(userId) {
    const userDoc = await db.collection('users').doc(userId).get();
    return {
        id: userId,
        ...userDoc.data()
    };
}

// Utilidades
function formatDate(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp.seconds * 1000).toLocaleString();
}
