// Variables globales
let currentUser = null;
let activeRequest = null;
let messagesListener = null;

// Elementos del DOM
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const messagesContainer = document.getElementById('messagesContainer');
const chargeButton = document.getElementById('chargeButton');

// Event listeners
messageForm.addEventListener('submit', handleMessageSubmit);
chargeButton.addEventListener('click', handleCharge);

// Escuchar cambios de autenticación
auth.onAuthStateChanged(async user => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    currentUser = user;
    loadSellerChats();

    // Si hay un requestId en la URL, abrir ese chat
    const urlParams = new URLSearchParams(window.location.search);
    const requestId = urlParams.get('requestId');
    if (requestId) {
        openChat(requestId);
    }
});

// Cargar chats del vendedor
async function loadSellerChats() {
    try {
        const chatsList = document.getElementById('chatsList');
        console.log('Cargando chats del vendedor:', currentUser.uid);

        // Buscar solicitudes donde el usuario es vendedor
        const sellerRequests = await db.collection('requests')
            .where('sellerId', '==', currentUser.uid)
            .get();

        if (sellerRequests.empty) {
            chatsList.innerHTML = '<p class="no-data">No hay chats disponibles</p>';
            return;
        }

        const chatsHtml = await Promise.all(sellerRequests.docs.map(async doc => {
            const requestData = doc.data();
            
            // Obtener datos de la campaña
            const campaignDoc = await db.collection('campaigns').doc(requestData.campaignId).get();
            if (!campaignDoc.exists) return '';
            
            const campaignData = campaignDoc.data();
            
            // Obtener datos del comprador
            const buyerData = await getUserData(campaignData.createdBy);
            
            return `
                <div class="chat-item" onclick="openChat('${doc.id}')">
                    <div class="chat-info">
                        <h3>${campaignData.name}</h3>
                        <p class="chat-user">Chat con: ${buyerData.name || buyerData.email}</p>
                        <p class="chat-status">${campaignData.status}</p>
                    </div>
                </div>
            `;
        }));

        chatsList.innerHTML = chatsHtml.join('');

    } catch (error) {
        console.error('Error loading seller chats:', error);
        alert('Error al cargar los chats: ' + error.message);
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
        
        // Verificar que el usuario actual es el vendedor
        if (requestData.userId !== currentUser.uid) {
            throw new Error('No tienes permiso para ver este chat');
        }

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
        
        // Obtener datos del comprador
        const buyerData = await getUserData(campaign.createdBy);
        
        // Mostrar información del chat
        document.getElementById('chatTitle').textContent = `Chat con ${buyerData.name || buyerData.email}`;
        document.getElementById('campaignInfo').innerHTML = `
            <div class="campaign-info">
                <h4>${campaign.name}</h4>
                <p>${campaign.status}</p>
            </div>
        `;

        // Verificar si hay cobro pendiente
        const chargeQuery = await db.collection('charges')
            .where('requestId', '==', requestId)
            .where('status', '==', 'pending')
            .get();

        // Actualizar estado del botón de cobro
        chargeButton.disabled = !chargeQuery.empty;
        chargeButton.innerHTML = `
            <i class='bx bx-dollar'></i>
            <span>${!chargeQuery.empty ? 'Cobro pendiente' : 'Cobrar cuenta'}</span>
        `;

        // Limpiar mensajes anteriores
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
                        appendMessage(change.doc.data());
                    }
                });
                scrollToBottom();
            });

    } catch (error) {
        console.error('Error opening chat:', error);
        alert('Error al abrir el chat: ' + error.message);
    }
}

// Manejar envío de mensajes
async function handleMessageSubmit(event) {
    event.preventDefault();

    if (!activeRequest) {
        alert('Por favor selecciona un chat primero');
        return;
    }

    const text = messageInput.value.trim();
    if (!text) return;

    try {
        await db.collection('requests')
            .doc(activeRequest.id)
            .collection('messages')
            .add({
                text,
                userId: currentUser.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

        messageInput.value = '';

    } catch (error) {
        console.error('Error sending message:', error);
        alert('Error al enviar el mensaje: ' + error.message);
    }
}

// Manejar cobro
async function handleCharge() {
    if (!activeRequest) {
        alert('Por favor selecciona un chat primero');
        return;
    }

    try {
        // Crear solicitud de cobro
        await db.collection('charges').add({
            requestId: activeRequest.id,
            campaignId: activeRequest.campaignId,
            sellerId: currentUser.uid,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Actualizar botón
        chargeButton.disabled = true;
        chargeButton.innerHTML = `
            <i class='bx bx-dollar'></i>
            <span>Cobro pendiente</span>
        `;

    } catch (error) {
        console.error('Error creating charge:', error);
        alert('Error al crear el cobro: ' + error.message);
    }
}

// Agregar mensaje al contenedor
function appendMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    messageDiv.classList.add(message.userId === currentUser.uid ? 'outgoing' : 'incoming');
    
    messageDiv.innerHTML = `
        <div class="message-content">${message.text}</div>
        <div class="timestamp">${formatDate(message.createdAt)}</div>
    `;

    messagesContainer.appendChild(messageDiv);
}

// Obtener datos de usuario
async function getUserData(userId) {
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        return userDoc.exists ? userDoc.data() : { email: 'Usuario desconocido' };
    } catch (error) {
        console.error('Error getting user data:', error);
        return { email: 'Error al cargar usuario' };
    }
}

// Formatear fecha
function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    return date.toLocaleString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

// Scroll al último mensaje
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
