// Variables globales
let currentUser = null;
let activeRequest = null;
let messagesListener = null;

// Elementos del DOM
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const messagesContainer = document.getElementById('messagesContainer');
const sendButton = document.getElementById('sendButton');

// Event listeners
messageForm.addEventListener('submit', handleMessageSubmit);

// Esperar a que Firebase esté inicializado
window.addEventListener('load', () => {
    // Escuchar cambios de autenticación
    window.auth.onAuthStateChanged(async user => {
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
});

// Cargar chats del vendedor
async function loadSellerChats() {
    try {
        const chatsList = document.getElementById('chatsList');
        console.log('Cargando chats del vendedor:', currentUser.uid);

        // Buscar solicitudes hechas por el usuario
        const requests = await window.db.collection('requests')
            .where('userId', '==', currentUser.uid)
            .get();

        let allRequests = [];

        // Para cada solicitud, obtener datos de la campaña
        for (const requestDoc of requests.docs) {
            const requestData = requestDoc.data();
            const campaignDoc = await window.db.collection('campaigns')
                .doc(requestData.campaignId)
                .get();

            if (campaignDoc.exists) {
                allRequests.push({
                    id: requestDoc.id,
                    requestData: requestData,
                    campaignData: {
                        id: campaignDoc.id,
                        ...campaignDoc.data()
                    }
                });
            }
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
            // Obtener datos del comprador
            const buyerData = await getUserData(request.campaignData.createdBy);
            const lastMessage = await getLastMessage(request.id);
            const statusClass = request.campaignData.status === 'active' ? 'active' : 'completed';
            
            return `
                <div class="chat-item ${statusClass}" onclick="openChat('${request.id}')" data-request-id="${request.id}">
                    <div class="chat-item-avatar">
                        <i class='bx bx-user'></i>
                    </div>
                    <div class="chat-item-content">
                        <div class="chat-item-header">
                            <h4>${buyerData.name || buyerData.email}</h4>
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

    } catch (error) {
        console.error('Error loading seller chats:', error);
        chatsList.innerHTML = `
            <div class="no-chats">
                <i class='bx bx-error-circle'></i>
                <p>Error al cargar los chats</p>
            </div>
        `;
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
            return messages.docs[0].data();
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
        
        // Verificar que el usuario actual es el vendedor
        if (requestData.userId !== currentUser.uid) {
            throw new Error('No tienes permiso para ver este chat');
        }

        activeRequest = {
            id: requestDoc.id,
            ...requestData
        };

        // Obtener datos de la campaña
        const campaignDoc = await window.db.collection('campaigns').doc(requestData.campaignId).get();
        if (!campaignDoc.exists) {
            throw new Error('Campaña no encontrada');
        }

        const campaign = campaignDoc.data();
        
        // Obtener datos del comprador
        const buyerData = await getUserData(campaign.createdBy);
        
        // Mostrar información del chat
        document.getElementById('chatTitle').textContent = buyerData.name || buyerData.email;
        document.getElementById('campaignInfo').innerHTML = `
            <p>${campaign.name} - ${campaign.status}</p>
        `;

        // Limpiar mensajes anteriores
        messagesContainer.innerHTML = '';

        // Cargar mensajes existentes
        const messages = await window.db.collection('requests')
            .doc(requestId)
            .collection('messages')
            .orderBy('createdAt', 'asc')
            .get();

        messages.forEach(doc => {
            appendMessage(doc.data());
        });

        // Escuchar nuevos mensajes
        messagesListener = window.db.collection('requests')
            .doc(requestId)
            .collection('messages')
            .orderBy('createdAt', 'asc')
            .onSnapshot(snapshot => {
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

    const text = messageInput.value.trim();
    if (!text || !activeRequest) return;

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
        messageInput.focus();

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

    // Scroll al último mensaje si es un mensaje nuevo
    if (!message.createdAt || message.createdAt?.seconds >= Date.now() / 1000 - 1) {
        scrollToBottom();
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
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
        return new Intl.DateTimeFormat('es', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        }).format(date);
    } else if (days === 1) {
        return 'Ayer';
    } else if (days < 7) {
        return new Intl.DateTimeFormat('es', {
            weekday: 'long'
        }).format(date);
    } else {
        return new Intl.DateTimeFormat('es', {
            day: '2-digit',
            month: 'short'
        }).format(date);
    }
}

// Scroll al último mensaje
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
