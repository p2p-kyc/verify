// Variables globales
let currentUser = null;
let activeRequest = null;
let messagesListener = null;

// Elementos del DOM
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const messagesContainer = document.getElementById('messagesContainer');
const finishButton = document.getElementById('finishButton');

// Event listeners
messageForm.addEventListener('submit', handleMessageSubmit);
finishButton.addEventListener('click', handleFinishCampaign);

// Esperar a que Firebase esté inicializado
window.addEventListener('load', () => {
    // Escuchar cambios de autenticación
    window.auth.onAuthStateChanged(async user => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    currentUser = user;
    loadBuyerChats();

    // Si hay un requestId en la URL, abrir ese chat
    const urlParams = new URLSearchParams(window.location.search);
    const requestId = urlParams.get('requestId');
    if (requestId) {
        openChat(requestId);
    }
    });
});

// Cargar chats del comprador
async function loadBuyerChats() {
    try {
        const chatsList = document.getElementById('chatsList');
        console.log('Cargando chats del comprador:', currentUser.uid);

        // Buscar campañas creadas por el usuario
        const campaigns = await window.db.collection('campaigns')
            .where('createdBy', '==', currentUser.uid)
            .get();

        let allRequests = [];

        // Para cada campaña, buscar sus solicitudes
        for (const campaignDoc of campaigns.docs) {
            const campaignData = campaignDoc.data();
            const campaignId = campaignDoc.id;

            const requests = await window.db.collection('requests')
                .where('campaignId', '==', campaignId)
                .get();

            requests.forEach(doc => {
                allRequests.push({
                    id: doc.id,
                    requestData: doc.data(),
                    campaignData: {
                        id: campaignId,
                        ...campaignData
                    }
                });
            });
        }

        if (allRequests.length === 0) {
            chatsList.innerHTML = `
                <div class="no-chats">
                    <i class='bx bx-message-square-dots'></i>
                    <p>No hay chats disponibles</p>
                </div>
            `;
            return;
        }

        const chatsHtml = await Promise.all(allRequests.map(async request => {
            // Obtener datos del vendedor
            const sellerData = await getUserData(request.requestData.userId);
            const lastMessage = await getLastMessage(request.id);
            const statusClass = request.campaignData.status === 'active' ? 'active' : 'completed';
            
            return `
                <div class="chat-item ${statusClass}" onclick="openChat('${request.id}')" data-request-id="${request.id}">
                    <div class="chat-item-avatar">
                        <i class='bx bx-user'></i>
                    </div>
                    <div class="chat-item-content">
                        <div class="chat-item-header">
                            <h4>${sellerData.name || sellerData.email}</h4>
                            <span class="chat-time">${lastMessage ? formatDate(lastMessage.createdAt) : ''}</span>
                        </div>
                        <div class="chat-item-info">
                            <p class="campaign-name">${request.campaignData.name}</p>
                            <p class="last-message">${lastMessage ? lastMessage.text : 'No hay mensajes'}</p>
                        </div>
                    </div>
                </div>
            `;
        }));

        chatsList.innerHTML = chatsHtml.join('');

        // Si hay un chat activo, marcarlo como seleccionado
        if (activeRequest) {
            const activeChat = document.querySelector(`[data-request-id="${activeRequest.id}"]`);
            if (activeChat) {
                activeChat.classList.add('active');
            }
        }

    } catch (error) {
        console.error('Error loading buyer chats:', error);
        alert('Error al cargar los chats: ' + error.message);
    }
}

// Obtener último mensaje de un chat
async function getLastMessage(requestId) {
    try {
        const messages = await window.db.collection('requests')
            .doc(requestId)
            .collection('messages')
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();

        if (!messages.empty) {
            return {
                text: messages.docs[0].data().text,
                createdAt: messages.docs[0].data().createdAt
            };
        }
        return null;
    } catch (error) {
        console.error('Error getting last message:', error);
        return null;
    }
}

// Abrir chat
async function openChat(requestId) {
    try {
        // Desmarcar chat activo anterior
        const previousActive = document.querySelector('.chat-item.active');
        if (previousActive) {
            previousActive.classList.remove('active');
        }

        // Marcar nuevo chat como activo
        const newActive = document.querySelector(`[data-request-id="${requestId}"]`);
        if (newActive) {
            newActive.classList.add('active');
        }

        // Obtener datos de la solicitud
        const requestDoc = await window.db.collection('requests').doc(requestId).get();
        if (!requestDoc.exists) {
            throw new Error('Chat no encontrado');
        }

        const requestData = requestDoc.data();
        
        // Obtener datos de la campaña
        const campaignDoc = await window.db.collection('campaigns').doc(requestData.campaignId).get();
        if (!campaignDoc.exists) {
            throw new Error('Campaña no encontrada');
        }

        const campaign = campaignDoc.data();
        
        // Verificar que el usuario actual es el creador de la campaña
        if (campaign.createdBy !== currentUser.uid) {
            throw new Error('No tienes permiso para ver este chat');
        }

        activeRequest = {
            id: requestDoc.id,
            ...requestData,
            campaign: {
                id: campaignDoc.id,
                ...campaign
            }
        };

        // Obtener datos del vendedor
        const sellerData = await getUserData(requestData.userId);
        
        // Mostrar información del chat
        document.getElementById('chatTitle').textContent = sellerData.name || sellerData.email;
        document.getElementById('campaignInfo').innerHTML = `
            <p>${campaign.name} - ${campaign.status}</p>
        `;

        // Configurar botón de terminar campaña
        finishButton.style.display = campaign.status === 'active' ? 'flex' : 'none';

        // Limpiar mensajes anteriores
        messagesContainer.innerHTML = '';

        // Detener listener anterior si existe
        if (messagesListener) {
            messagesListener();
        }

        // Escuchar mensajes (existentes y nuevos)
        messagesListener = window.db.collection('requests')
            .doc(requestId)
            .collection('messages')
            .orderBy('createdAt', 'asc')
            .onSnapshot(snapshot => {
                if (snapshot.metadata.hasPendingWrites) return;
                
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        appendMessage(change.doc.data());
                        scrollToBottom();
                    }
                });
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
        const message = {
            text,
            userId: currentUser.uid,
            createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
        };
        await window.db.collection('requests')
            .doc(activeRequest.id)
            .collection('messages')
            .add(message);

        messageInput.value = '';

    } catch (error) {
        console.error('Error sending message:', error);
        alert('Error al enviar el mensaje: ' + error.message);
    }
}

// Manejar terminar campaña
async function handleFinishCampaign() {
    if (!activeRequest || !activeRequest.campaign) {
        alert('Por favor selecciona un chat primero');
        return;
    }

    if (!confirm('¿Estás seguro de que deseas terminar la campaña?')) {
        return;
    }

    try {
        // Actualizar estado de la campaña
        await window.db.collection('campaigns').doc(activeRequest.campaign.id).update({
            status: 'completed',
            completedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Ocultar botón de terminar
        finishButton.style.display = 'none';

        // Recargar chats
        loadBuyerChats();

    } catch (error) {
        console.error('Error finishing campaign:', error);
        alert('Error al terminar la campaña: ' + error.message);
    }
}

// Agregar mensaje al contenedor
function appendMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    messageDiv.classList.add(message.userId === currentUser.uid ? 'outgoing' : 'incoming');
    messageDiv.dataset.timestamp = message.createdAt?.seconds || Date.now() / 1000;
    
    messageDiv.innerHTML = `
        <div class="message-content">${message.text}</div>
        <div class="timestamp">${formatDate(message.createdAt)}</div>
    `;

    // Encontrar la posición correcta para insertar el mensaje
    const messages = Array.from(messagesContainer.children);
    const position = messages.findIndex(existing => {
        const existingTime = parseFloat(existing.dataset.timestamp);
        const newTime = parseFloat(messageDiv.dataset.timestamp);
        return newTime < existingTime;
    });

    if (position === -1) {
        // Si no se encuentra una posición, agregar al final
        messagesContainer.appendChild(messageDiv);
    } else {
        // Insertar en la posición correcta
        messagesContainer.insertBefore(messageDiv, messages[position]);
    }
}

// Obtener datos de usuario
async function getUserData(userId) {
    try {
        const userDoc = await window.db.collection('users').doc(userId).get();
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
