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

// Manejar selección de imagen
document.getElementById('imageButton').addEventListener('click', () => {
    document.getElementById('imageInput').click();
});

// Convertir imagen a base64
function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// Manejar cambio en input de imagen
document.getElementById('imageInput').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const base64Image = await getBase64(file);
        await sendImageMessage(base64Image);
        event.target.value = ''; // Limpiar input
    } catch (error) {
        console.error('Error al procesar la imagen:', error);
        alert('Error al procesar la imagen. Por favor, intenta de nuevo.');
    }
});

// Enviar mensaje con imagen
async function sendImageMessage(imageData) {
    if (!activeRequest) {
        alert('Por favor selecciona un chat primero');
        return;
    }

    try {
        const messageRef = window.db.collection('requests')
            .doc(activeRequest.id)
            .collection('messages')
            .doc();

        await messageRef.set({
            type: 'image',
            imageData: imageData,
            userId: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        scrollToBottom();
    } catch (error) {
        console.error('Error al enviar imagen:', error);
        alert('Error al enviar la imagen. Por favor, intenta de nuevo.');
    }
};
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
        
        // Obtener cuentas cobradas
        const cuentasCobradas = await getCuentasCobradas(campaignDoc.id);
        const cuentasDisponibles = campaign.accountCount - cuentasCobradas;

        // Mostrar información del chat
        document.getElementById('chatTitle').textContent = sellerData.name || sellerData.email;
        document.getElementById('campaignInfo').innerHTML = `
            <div class="campaign-header">
                <span class="campaign-name">${campaign.name}</span>
                <span class="campaign-status ${campaign.status}">${formatStatus(campaign.status)}</span>
            </div>
            <div class="campaign-stats">
                <span class="stat-item">
                    <i class='bx bx-check-circle'></i>
                    <span class="approved-accounts">${cuentasCobradas}</span>
                </span>
                <span class="separator">·</span>
                <span class="stat-item">
                    <i class='bx bx-wallet'></i>
                    <span class="available-accounts">${cuentasDisponibles}</span>
                </span>
            </div>
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
    if (message.type === 'payment_proof') {
        // No mostrar mensajes de comprobante de pago al comprador
        return;
    }

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    messageDiv.classList.add(message.userId === currentUser.uid ? 'outgoing' : 'incoming');
    messageDiv.dataset.timestamp = message.createdAt?.seconds || Date.now() / 1000;
    
    if (message.type === 'image') {
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        const imageContainer = document.createElement('div');
        const image = document.createElement('img');
        image.src = message.imageData;
        image.alt = 'Imagen';
        image.style.maxWidth = '300px';
        image.style.borderRadius = '8px';

        const timeSpan = document.createElement('span');
        timeSpan.className = 'timestamp';
        timeSpan.textContent = formatDate(message.createdAt);

        imageContainer.appendChild(image);
        contentDiv.appendChild(imageContainer);
        contentDiv.appendChild(timeSpan);
        messageDiv.appendChild(contentDiv);
    } else if (message.type === 'charge') {
        messageDiv.classList.add('charge-message');
        messageDiv.innerHTML = `
            <div class="message-content charge-content">
                <div class="charge-text">${message.text}</div>
                <div class="charge-actions">
                    <button class="button primary" onclick="handlePayment('${message.paymentRequestId}', 'approved')">
                        <i class='bx bx-check'></i>
                        Pagar cuentas
                    </button>
                    <button class="button secondary" onclick="handlePayment('${message.paymentRequestId}', 'rejected')">
                        <i class='bx bx-x'></i>
                        Rechazar
                    </button>
                </div>
            </div>
            <div class="timestamp">${formatDate(message.createdAt)}</div>
        `;
    } else {
        messageDiv.innerHTML = `
            <div class="message-content">${message.text}</div>
            <div class="timestamp">${formatDate(message.createdAt)}</div>
        `;
    }

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

// Manejar el pago
async function handlePayment(paymentRequestId, response) {
    try {
        // Obtener la solicitud de pago
        const paymentRequestDoc = await window.db.collection('payment_requests').doc(paymentRequestId).get();
        if (!paymentRequestDoc.exists) {
            throw new Error('Solicitud de pago no encontrada');
        }

        const paymentRequestData = paymentRequestDoc.data();

        // Verificar que la solicitud esté pendiente
        if (paymentRequestData.status !== 'pending') {
            throw new Error('Esta solicitud de pago ya fue procesada');
        }

        // Confirmar la acción con el usuario
        const action = response === 'approved' ? 'aprobar' : 'rechazar';
        if (!confirm(`¿Estás seguro de que deseas ${action} el pago de ${paymentRequestData.accountsRequested} cuenta${paymentRequestData.accountsRequested > 1 ? 's' : ''} por $${paymentRequestData.amount} ${paymentRequestData.currency}?`)) {
            return;
        }

        // Actualizar estado de la solicitud
        await window.db.collection('payment_requests').doc(paymentRequestId).update({
            status: response,
            respondedAt: window.firebase.firestore.FieldValue.serverTimestamp()
        });


        // Crear mensaje de respuesta
        const message = {
            text: response === 'approved' 
                ? '👍 Has aprobado la solicitud de pago'
                : '❌ Has rechazado la solicitud de pago',
            userId: currentUser.uid,
            type: 'payment_response',
            paymentRequestId,
            response,
            createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
        };

        // Guardar mensaje en la conversación
        await window.db.collection('requests')
            .doc(paymentRequestData.requestId)
            .collection('messages')
            .add(message);

    } catch (error) {
        console.error('Error al procesar respuesta de pago:', error);
        alert('Error al procesar la respuesta: ' + error.message);
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

// Formatear estado de la campaña
function formatStatus(status) {
    const statusMap = {
        'active': 'Activa',
        'completed': 'Completada',
        'cancelled': 'Cancelada'
    };
    return statusMap[status] || status;
}

// Formatear fecha
function formatDate(timestamp) {
    if (!timestamp) return '';

    const date = timestamp.toDate();
    return date.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Scroll al último mensaje
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Obtener el número de cuentas cobradas para una campaña
async function getCuentasCobradas(campaignId) {
    try {
        if (!campaignId) {
            console.error('Error: campaignId es undefined en getCuentasCobradas');
            return 0;
        }

        // Obtener todas las solicitudes de pago aprobadas y pagadas
        const [approvedRequests, paidRequests] = await Promise.all([
            window.db.collection('payment_requests')
                .where('campaignId', '==', campaignId)
                .where('status', '==', 'approved')
                .get(),
            window.db.collection('payment_requests')
                .where('campaignId', '==', campaignId)
                .where('status', '==', 'paid')
                .get()
        ]);

        let totalCuentasCobradas = 0;

        // Procesar solicitudes aprobadas
        if (approvedRequests && !approvedRequests.empty) {
            approvedRequests.forEach(doc => {
                const data = doc.data();
                if (data && typeof data.accountsRequested === 'number') {
                    totalCuentasCobradas += data.accountsRequested;
                    console.log('Cuentas aprobadas:', data.accountsRequested);
                } else {
                    console.warn('Solicitud sin accountsRequested:', doc.id);
                    totalCuentasCobradas += 1;
                }
            });
        }

        // Procesar solicitudes pagadas
        if (paidRequests && !paidRequests.empty) {
            paidRequests.forEach(doc => {
                const data = doc.data();
                if (data && typeof data.accountsRequested === 'number') {
                    totalCuentasCobradas += data.accountsRequested;
                    console.log('Cuentas pagadas:', data.accountsRequested);
                } else {
                    console.warn('Solicitud sin accountsRequested:', doc.id);
                    totalCuentasCobradas += 1;
                }
            });
        }

        console.log(`Total cuentas cobradas para campaña ${campaignId}:`, totalCuentasCobradas);
        return totalCuentasCobradas;
    } catch (error) {
        console.error('Error al obtener cuentas cobradas:', error);
        return 0;
    }
}
