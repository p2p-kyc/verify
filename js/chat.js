// Variables globales
let currentUser = null;
let activeRequest = null;
let messagesListener = null;

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
        const [createdCampaigns, sellerRequests] = await Promise.all([
            // Campañas creadas por el usuario
            db.collection('campaigns')
                .where('createdBy', '==', currentUser.uid)
                .get(),
            // Solicitudes donde el usuario es vendedor
            db.collection('requests')
                .where('userId', '==', currentUser.uid)
                .where('status', '==', 'accepted')
                .get()
        ]);

        let allRequests = [];

        // Agregar solicitudes donde el usuario es vendedor
        allRequests = allRequests.concat(sellerRequests.docs);

        // Agregar solicitudes de las campañas creadas por el usuario
        if (!createdCampaigns.empty) {
            const campaignIds = createdCampaigns.docs.map(doc => doc.id);
            const buyerRequests = await db.collection('requests')
                .where('campaignId', 'in', campaignIds)
                .where('status', '==', 'accepted')
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

        // Cargar datos de la campaña
        const campaignDoc = await db.collection('campaigns').doc(requestData.campaignId).get();
        const campaignData = campaignDoc.data();

        // Obtener datos del otro usuario
        const otherUserId = userRole === 'seller' ? campaignData.createdBy : requestData.userId;
        const otherUserData = await getUserData(otherUserId);

        // Mostrar información en el header
        document.getElementById('chatTitle').textContent = `Chat con ${otherUserData.name || otherUserData.email}`;
        document.getElementById('campaignInfo').innerHTML = `
            <div class="campaign-info">
                <h3>${campaignData.name}</h3>
                <div class="campaign-stats">
                    <span class="stat">
                        <i class='bx bx-user-check'></i>
                        ${campaignData.verificationCount}/${campaignData.accountCount} verificaciones
                    </span>
                    <span class="stat">
                        <i class='bx bx-dollar-circle'></i>
                        ${campaignData.pricePerAccount} USDT por verificación
                    </span>
                    <span class="stat">
                        <i class='bx bx-time'></i>
                        ${formatDate(campaignData.createdAt)}
                    </span>
                </div>
            </div>
        `;

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
                    }
                });
                
                // Scroll al último mensaje
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
    const messageClass = message.userId === currentUser.uid ? 'message-sent' : 'message-received';

    messagesContainer.innerHTML += `
        <div class="message ${messageClass}">
            <div class="message-content">
                <p>${message.text}</p>
                <span class="message-time">
                    ${formatDate(message.createdAt)}
                </span>
            </div>
        </div>
    `;
}

// Enviar mensaje
async function handleMessageSubmit(event) {
    event.preventDefault();

    if (!activeRequest) {
        alert('Por favor selecciona un chat');
        return;
    }

    const messageInput = document.getElementById('messageInput');
    const text = messageInput.value.trim();

    if (!text) return;

    try {
        await db.collection('requests')
            .doc(activeRequest.id)
            .collection('messages')
            .add({
                text: text,
                userId: currentUser.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

        messageInput.value = '';

    } catch (error) {
        console.error('Error sending message:', error);
        alert('Error al enviar el mensaje: ' + error.message);
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
