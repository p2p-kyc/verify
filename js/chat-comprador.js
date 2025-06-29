// Variables globales
let currentUser = null;
let activeRequest = null;
let messagesListener = null;
let isInitialLoad = true;

// Elementos del DOM
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const messagesContainer = document.getElementById('messagesContainer');

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
        console.error('Error processing image:', error);
        alert('Error processing the image. Please try again.');
    }
});

// Enviar mensaje con imagen
async function sendImageMessage(imageData) {
    if (!activeRequest) {
        alert('Please select a chat first');
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
        console.error('Error sending image:', error);
        alert('Error sending the image. Please try again.');
    }
};

// Esperar a que Firebase esté inicializado
window.addEventListener('load', () => {
    // Escuchar cambios de autenticación
    window.auth.onAuthStateChanged(async user => {
        if (!user) {
            redirectTo('index.html');
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
        console.log('Loading buyer chats:', currentUser.uid);

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
                    <p>No chats available</p>
                </div>
            `;
            return;
        }

        const chatsHtml = await Promise.all(allRequests.map(async request => {
            // Obtener datos del vendedor
            const sellerData = await getUserData(request.requestData.userId);
            const lastMessage = await getLastMessage(request.id);
            const statusClass = request.campaignData.status === 'active' ? 'active' : 'completed';

            let lastMessageText = 'No messages';
            if (lastMessage) {
                if (lastMessage.type === 'image') {
                    lastMessageText = 'Image';
                } else if (lastMessage.type === 'payment_proof') {
                    lastMessageText = 'Payment proof';
                } else if (lastMessage.text) {
                    lastMessageText = lastMessage.text;
                }
            }
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
                            <p class="last-message">${lastMessageText}</p>
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
        alert('Error loading chats: ' + error.message);
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
            throw new Error('Chat not found');
        }

        const requestData = requestDoc.data();

        // Obtener datos de la campaña
        const campaignDoc = await window.db.collection('campaigns').doc(requestData.campaignId).get();
        if (!campaignDoc.exists) {
            throw new Error('Campaign not found');
        }

        const campaign = campaignDoc.data();

        // Verificar que el usuario actual es el creador de la campaña
        if (campaign.createdBy !== currentUser.uid) {
            throw new Error('You do not have permission to view this chat');
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

        // Limpiar mensajes anteriores
        messagesContainer.innerHTML = '';
        isInitialLoad = true;

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
                try {
                    // En la carga inicial, limpiar y cargar todos los mensajes
                    if (isInitialLoad) {
                        messagesContainer.innerHTML = '';
                        snapshot.docs.forEach(doc => {
                            appendMessage(doc.data());
                        });
                        isInitialLoad = false;
                        scrollToBottom();
                    } else {
                        // Para mensajes nuevos, solo agregar los que son realmente nuevos
                        snapshot.docChanges().forEach(change => {
                            if (change.type === 'added') {
                                appendMessage(change.doc.data());
                                scrollToBottom();
                            }
                        });
                    }
                } catch (error) {
                    console.error('Error in messages listener:', error);
                }
            }, error => {
                console.error('Error setting up messages listener:', error);
            });

        // Mostrar u ocultar botón de cancelar campaña
        const cancelBtn = document.getElementById('cancelCampaignBtn');
        if (cancelBtn) {
            // Verificar pagos pendientes
            const pendingPayments = await window.db.collection('payment_requests')
                .where('campaignId', '==', campaignDoc.id)
                .where('status', 'in', ['pending', 'approved'])
                .get();
            if (campaign.status === 'active' && pendingPayments.empty) {
                cancelBtn.style.display = 'inline-block';
            } else {
                cancelBtn.style.display = 'none';
            }
        }

    } catch (error) {
        console.error('Error opening chat:', error);
        alert('Error opening chat: ' + error.message);
    }
}

// Manejar envío de mensajes
async function handleMessageSubmit(event) {
    event.preventDefault();
    const text = messageInput.value.trim();
    messageInput.value = '';

    if (text === '' || !activeRequest) return;

    try {
        await window.db.collection('requests')
            .doc(activeRequest.id)
            .collection('messages')
            .add({
                text,
                userId: currentUser.uid,
                type: 'text',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

        // El scroll se manejará automáticamente por el listener
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Error sending message: ' + error.message);
    }
}

// Manejar cancelación de campaña
async function handleCancelCampaign() {
    if (!activeRequest) return;

    // Validar pagos pendientes antes de cancelar
    const campaignId = activeRequest.campaign.id;
    const pendingPayments = await window.db.collection('payment_requests')
        .where('campaignId', '==', campaignId)
        .where('status', 'in', ['pending', 'approved'])
        .get();
    if (!pendingPayments.empty) {
        alert('You cannot cancel the campaign while there are pending or approved payments.');
        return;
    }

    const confirmation = confirm('Are you sure you want to cancel this campaign? This action is irreversible.');
    if (!confirmation) return;

    try {
        // Iniciar un batch para operaciones atómicas
        const batch = window.db.batch();

        // 1. Marcar la campaña como 'cancelled'
        const campaignRef = window.db.collection('campaigns').doc(campaignId);
        batch.update(campaignRef, {
            status: 'cancelled',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 2. Optional: Notify the seller (if necessary)
        // You could add a message in the chat informing about the cancellation.
        const messageRef = window.db.collection('requests').doc(activeRequest.id).collection('messages').doc();
        batch.set(messageRef, {
            type: 'system',
            text: 'The campaign has been cancelled by the buyer.',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Ejecutar el batch
        await batch.commit();

        // Update UI
        alert('Campaign successfully cancelled.');
        // Reload the chat list and the current chat to reflect the changes
        loadBuyerChats();
        openChat(activeRequest.id);

    } catch (error) {
        console.error('Error cancelling campaign:', error);
        alert('Error cancelling campaign: ' + error.message);
    }
}

// Agregar mensaje al contenedor
function appendMessage(message) {
    if (message.type === 'payment_proof') {
        // Do not show payment proof messages to the buyer
        return;
    }

    // Verificar si el mensaje ya existe para evitar duplicados
    const messageId = message.createdAt?.seconds || Date.now() / 1000;
    const existingMessage = document.querySelector(`[data-timestamp="${messageId}"]`);
    if (existingMessage) {
        return; // El mensaje ya existe, no agregar duplicado
    }

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    messageDiv.classList.add(message.userId === currentUser.uid ? 'outgoing' : 'incoming');
    messageDiv.dataset.timestamp = messageId;
    
    if (message.type === 'image') {
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        const imageContainer = document.createElement('div');
        const image = document.createElement('img');
        image.src = message.imageData;
        image.alt = 'Image';
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
                        Pay accounts
                    </button>
                    <button class="button secondary" onclick="handlePayment('${message.paymentRequestId}', 'rejected')">
                        <i class='bx bx-x'></i>
                        Reject
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
            throw new Error('Payment request not found');
        }

        const paymentRequestData = paymentRequestDoc.data();

        // Verificar que la solicitud esté pendiente
        if (paymentRequestData.status !== 'pending') {
            throw new Error('This payment request has already been processed');
        }

        // Confirmar la acción con el usuario
        const action = response === 'approved' ? 'approve' : 'reject';
        if (!confirm(`Are you sure you want to ${action} the payment of ${paymentRequestData.accountsRequested} account${paymentRequestData.accountsRequested > 1 ? 's' : ''} for $${paymentRequestData.amount} ${paymentRequestData.currency}?`)) {
            return;
        }

        // Actualizar estado de la solicitud a rejected o approved
        await window.db.collection('payment_requests').doc(paymentRequestId).update({
            status: response === 'approved' ? 'approved' : 'rejected',
            respondedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
            reviewedBy: currentUser.uid
        });

        // Crear mensaje de respuesta
        const message = {
            text: response === 'approved' 
                ? `👍 You have approved the payment request for ${paymentRequestData.accountsRequested} account${paymentRequestData.accountsRequested > 1 ? 's' : ''} for $${paymentRequestData.amount} ${paymentRequestData.currency}`
                : `❌ You have rejected the payment request for ${paymentRequestData.accountsRequested} account${paymentRequestData.accountsRequested > 1 ? 's' : ''} for $${paymentRequestData.amount} ${paymentRequestData.currency}`,
            userId: currentUser.uid,
            type: response === 'approved' ? 'payment_response' : 'payment_rejected',
            paymentRequestId,
            response,
            amount: paymentRequestData.amount,
            currency: paymentRequestData.currency,
            accountsRequested: paymentRequestData.accountsRequested,
            createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
        };

        // Guardar mensaje en la conversación
        await window.db.collection('requests')
            .doc(paymentRequestData.requestId)
            .collection('messages')
            .add(message);

        alert(`Payment ${response}.`);
    } catch (error) {
        console.error(`Error processing payment ${response}:`, error);
        alert(`Error processing payment: ${error.message}`);
    }
}

// Obtener datos de usuario
async function getUserData(userId) {
    try {
        const userDoc = await window.db.collection('users').doc(userId).get();
        return userDoc.exists ? userDoc.data() : { email: 'Unknown user' };
    } catch (error) {
        console.error('Error getting user data:', error);
        return { email: 'Error loading user' };
    }
}

// Formatear estado de la campaña
function formatStatus(status) {
    const statusMap = {
        active: 'Active',
        pending_payment: 'Pending Payment',
        completed: 'Completed',
        cancelled: 'Cancelled'
    };
    return statusMap[status] || status;
}

// Formatear fecha
function formatDate(timestamp) {
    if (!timestamp) return '';

    const date = timestamp.toDate();
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Scroll al último mensaje
function scrollToBottom() {
    setTimeout(() => {
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }, 100);
}

// Obtener el número de cuentas cobradas para una campaña
async function getCuentasCobradas(campaignId) {
    try {
        if (!campaignId) {
            console.error('Error: campaignId is undefined in getCuentasCobradas');
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
                    console.log('Approved accounts:', data.accountsRequested);
                } else {
                    console.warn('Request without accountsRequested:', doc.id);
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
                    console.log('Paid accounts:', data.accountsRequested);
                } else {
                    console.warn('Request without accountsRequested:', doc.id);
                    totalCuentasCobradas += 1;
                }
            });
        }

        console.log(`Total paid accounts for campaign ${campaignId}:`, totalCuentasCobradas);
        return totalCuentasCobradas;
    } catch (error) {
        console.error('Error getting paid accounts:', error);
        return 0;
    }
}

// Al cargar la página, asignar el event listener al botón de cancelar campaña
window.addEventListener('DOMContentLoaded', () => {
    const cancelBtn = document.getElementById('cancelCampaignBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', handleCancelCampaign);
    }
});
