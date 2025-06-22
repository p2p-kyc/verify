// Variables globales
let currentUser = null;
let activeRequest = null;
let messagesListener = null;

// Elementos del DOM
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const messagesContainer = document.getElementById('messagesContainer');
const sendButton = document.getElementById('sendButton');
const headerActions = document.getElementById('headerActions');

// Función para crear el botón de cobro
async function createChargeButton(campaign) {
    try {
        console.log('Creando botón de cobro con campaña:', campaign);
        
        // Validar campaña
        if (!campaign || !campaign.id) {
            throw new Error('Campaña inválida');
        }

        // Obtener datos actualizados de la campaña
        const campaignDoc = await window.db.collection('campaigns').doc(campaign.id).get();
        if (!campaignDoc.exists) {
            throw new Error('La campaña no existe');
        }

        const campaignData = campaignDoc.data();
        if (!campaignData || typeof campaignData.accountCount !== 'number') {
            throw new Error('Datos de campaña inválidos');
        }

        // Limpiar botón anterior si existe
        if (headerActions) {
            headerActions.innerHTML = '';
        }

        // Obtener cuentas cobradas
        const cuentasCobradas = await getChargedAccounts(campaign.id);
        if (typeof cuentasCobradas !== 'number') {
            throw new Error('Error al obtener cuentas cobradas');
        }

        const cuentasDisponibles = campaignData.accountCount - cuentasCobradas;

        // Crear nuevo botón
        const button = document.createElement('button');
        button.className = 'action-button';

        // Verificar estado de la campaña y cuentas disponibles
        const isActive = campaignData.status === 'active';
        const hasCuentasDisponibles = cuentasDisponibles > 0;

        if (!isActive || !hasCuentasDisponibles) {
            button.disabled = true;
            button.title = !isActive ? 'La campaña no está activa' : 'No hay cuentas disponibles';
            button.style.opacity = '0.7';
            button.style.cursor = 'not-allowed';
            button.innerHTML = `
                <i class='bx bx-dollar'></i>
                <span>${!isActive ? 'Campaña ' + campaignData.status : 'Sin cuentas disponibles'}</span>
            `;
        } else {
            button.title = 'Solicitar cobro';
            button.innerHTML = `
                <i class='bx bx-dollar'></i>
                <span>Cobrar cuenta (${cuentasDisponibles} disponibles)</span>
            `;
            // Agregar evento click solo si está activo y hay cuentas
            button.addEventListener('click', requestPayment);
        }

        // Agregar al contenedor
        headerActions.appendChild(button);
        return button;
    } catch (error) {
        console.error('Error al crear botón de cobro:', error);
        // Mostrar mensaje de error al usuario
        if (headerActions) {
            headerActions.innerHTML = '';
            const errorMsg = document.createElement('div');
            errorMsg.className = 'alert alert-danger';
            errorMsg.textContent = 'Error: ' + error.message;
            headerActions.appendChild(errorMsg);
        }
        return null;
    }
}

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
            
            let lastMessageText = 'No hay mensajes';
            if (lastMessage) {
                if (lastMessage.type === 'image') {
                    lastMessageText = 'Imagen';
                } else if (lastMessage.type === 'payment_proof') {
                    lastMessageText = 'Comprobante de pago';
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
                            <h4>${buyerData.name || buyerData.email}</h4>
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

        // Obtener datos de la campaña
        console.log('Obteniendo campaña:', requestData.campaignId);
        const campaignDoc = await window.db.collection('campaigns').doc(requestData.campaignId).get();
        if (!campaignDoc.exists) {
            throw new Error('Campaña no encontrada');
        }

        const campaignData = campaignDoc.data();
        console.log('Datos de la campaña obtenidos:', campaignData);
        
        // Asegurarse de que el estado sea correcto
        if (!campaignData.status) {
            campaignData.status = 'active'; // Estado por defecto si no existe
        }

        // Guardar referencia a la solicitud activa y la campaña
        activeRequest = {
            id: requestId,
            data: requestData,
            campaign: {
                id: campaignDoc.id,
                data: campaignData
            }
        };
        
        // Obtener datos del usuario que hizo la solicitud
        const userData = await getUserData(requestData.userId);
        
        // Mostrar información del chat
        document.getElementById('chatTitle').textContent = userData.name || userData.email;
        // Obtener cuentas cobradas y actualizar información
        const cuentasCobradas = await getChargedAccounts(campaignDoc.id);
        const cuentasDisponibles = campaignData.accountCount - cuentasCobradas;

        // Verificar si la campaña debe estar completada
        if (cuentasCobradas >= campaignData.accountCount && campaignData.status !== 'completed') {
            await window.db.collection('campaigns').doc(campaignDoc.id).update({
                status: 'completed',
                completedAt: window.firebase.firestore.FieldValue.serverTimestamp()
            });
            campaignData.status = 'completed';
        }

        // Actualizar información de la campaña
        const campaignInfo = document.getElementById('campaignInfo');
        campaignInfo.innerHTML = `
            <div class="campaign-header">
                <span class="campaign-name">${campaignData.name}</span>
                <span class="campaign-status ${campaignData.status}">${formatStatus(campaignData.status)}</span>
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

        // Crear botón de cobro
        console.log('Datos de la campaña antes de crear botón:', campaignData);
        const campaign = {
            id: campaignDoc.id,
            ...campaignData
        };
        createChargeButton(campaign);

        // Limpiar mensajes anteriores
        messagesContainer.innerHTML = '';

        // Escuchar mensajes (existentes y nuevos)
        messagesListener = window.db.collection('requests')
            .doc(requestId)
            .collection('messages')
            .orderBy('createdAt', 'asc')
            .onSnapshot(snapshot => {
                if (snapshot.metadata.hasPendingWrites) return;
                
                // Limpiar mensajes anteriores
                messagesContainer.innerHTML = '';
                
                // Agregar todos los mensajes ordenados
                snapshot.docs.forEach(doc => {
                    appendMessage(doc.data());
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
async function appendMessage(message) {
    try {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.userId === currentUser.uid ? 'outgoing' : 'incoming'}`;
        messageDiv.dataset.timestamp = message.createdAt?.seconds || Date.now() / 1000;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        // Encontrar la posición correcta para insertar el mensaje
        const messages = Array.from(messagesContainer.children);
        const index = messages.findIndex(msg => {
            const timestamp = parseFloat(msg.dataset.timestamp);
            return timestamp > parseFloat(messageDiv.dataset.timestamp);
        });

        const textSpan = document.createElement('span');
        textSpan.className = 'message-text';

        // Aplicar estilo especial según el tipo de mensaje
        if (message.type === 'image') {
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

            if (index === -1) {
                messagesContainer.appendChild(messageDiv);
            } else {
                messagesContainer.insertBefore(messageDiv, messages[index]);
            }
        } else if (message.type === 'payment_rejected') {
            // Mostrar mensaje de rechazo con opciones para apelar
            messageDiv.classList.add('payment-rejected');
            messageDiv.innerHTML = `
                <div class="message-content payment-rejected-content">
                    <div class="payment-text">${message.text}</div>
                    <div class="payment-actions">
                        <button class="button primary" onclick="handlePaymentResponse('${message.paymentRequestId}', 'appeal')">
                            <i class='bx bx-message-square-dots'></i>
                            Apelar decisión
                        </button>
                        <button class="button secondary" onclick="handlePaymentResponse('${message.paymentRequestId}', 'accept_rejection')">
                            <i class='bx bx-check'></i>
                            Continuar sin pago
                        </button>
                    </div>
                </div>
                <div class="timestamp">${formatDate(message.createdAt)}</div>
            `;
            
            if (index === -1) {
                messagesContainer.appendChild(messageDiv);
            } else {
                messagesContainer.insertBefore(messageDiv, messages[index]);
            }
            return;
        } else if (message.type === 'payment_proof') {
            textSpan.classList.add('payment-proof-message');
            contentDiv.classList.add('payment-proof-content');

            // Agregar la imagen del comprobante
            const imageContainer = document.createElement('div');
            imageContainer.className = 'payment-proof-image';
            
            const image = document.createElement('img');
            image.src = message.imageData;
            image.alt = 'Comprobante de pago';
            image.style.maxWidth = '300px';
            image.style.borderRadius = '8px';
            image.style.marginBottom = '10px';
            
            imageContainer.appendChild(image);
            
            const timeSpan = document.createElement('span');
            timeSpan.className = 'timestamp';
            timeSpan.textContent = formatDate(message.createdAt);
            
            contentDiv.appendChild(imageContainer);
            contentDiv.appendChild(timeSpan);
            messageDiv.appendChild(contentDiv);

            // Encontrar la posición correcta para insertar el mensaje
            const messages = Array.from(messagesContainer.children);
            const index = messages.findIndex(msg => {
                const timestamp = parseFloat(msg.dataset.timestamp);
                return timestamp > parseFloat(messageDiv.dataset.timestamp);
            });

            if (index === -1) {
                messagesContainer.appendChild(messageDiv);
            } else {
                messagesContainer.insertBefore(messageDiv, messages[index]);
            }
            contentDiv.appendChild(imageContainer);

            // Agregar texto descriptivo
            textSpan.textContent = message.content;
        } else if (message.type === 'charge') {
            textSpan.classList.add('charge-message');
            contentDiv.classList.add('charge-content');

            // Agregar botones de acción si el mensaje es para el comprador
            if (activeRequest?.campaign?.data?.createdBy === currentUser.uid) {
                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'charge-actions';

                const approveButton = document.createElement('button');
                approveButton.className = 'action-button approve';
                approveButton.innerHTML = '<i class="bx bx-check"></i> Aprobar';
                approveButton.onclick = () => handlePaymentResponse(message.paymentRequestId, 'approved');

                const rejectButton = document.createElement('button');
                rejectButton.className = 'action-button reject';
                rejectButton.innerHTML = '<i class="bx bx-x"></i> Rechazar';
                rejectButton.onclick = () => handlePaymentResponse(message.paymentRequestId, 'rejected');

                actionsDiv.appendChild(approveButton);
                actionsDiv.appendChild(rejectButton);
                contentDiv.appendChild(actionsDiv);
            }
        }

        textSpan.textContent = message.text;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.textContent = formatDate(message.createdAt);

        contentDiv.appendChild(textSpan);
        contentDiv.appendChild(timeSpan);
        messageDiv.appendChild(contentDiv);

        messagesContainer.appendChild(messageDiv);
        scrollToBottom();
    } catch (error) {
        console.error('Error al agregar mensaje:', error);
    }
}

// Obtener datos de usuario
async function getUserData(userId) {
    try {
        const userDoc = await window.db.collection('users').doc(userId).get();
        return userDoc.exists ? userDoc.data() : { email: 'Unknown User' };
    } catch (error) {
        console.error('Error getting user data:', error);
        return { email: 'Error loading user' };
    }
}

// Solicitar pago
async function requestPayment() {
    try {
        if (!activeRequest?.campaign?.id) {
            alert('Please select a chat first');
            return;
        }

        // Check campaign status
        const campaignDoc = await window.db.collection('campaigns')
            .doc(activeRequest.campaign.id)
            .get();

        if (!campaignDoc.exists) {
            throw new Error('Campaign not found');
        }

        const campaignData = campaignDoc.data();
        console.log('Current campaign state:', {
            id: campaignDoc.id,
            status: campaignData.status,
            paymentStatus: campaignData.paymentStatus
        });

        // Check payment status
        if (campaignData.paymentStatus !== 'approved') {
            console.error('Payment status error:', campaignData.paymentStatus);
            throw new Error('The campaign payment is not approved');
        }

        // Check campaign status and available accounts
        const chargedAccounts = await getChargedAccounts(activeRequest.campaign.id);
        const availableAccounts = campaignData.accountCount - chargedAccounts;
        
        if (availableAccounts <= 0) {
            throw new Error('No more accounts available to charge in this campaign');
        }

        console.log('Account status:', {
            total: campaignData.accountCount,
            charged: chargedAccounts,
            available: availableAccounts
        });

        // Show the charge modal
        const modal = document.getElementById('chargeModal');
        const confirmBtn = document.getElementById('confirmCharge');
        const cancelBtn = document.getElementById('cancelCharge');
        const closeBtn = modal.querySelector('.close');

        const accountsToCharge = await new Promise((resolve, reject) => {
            openChargeModal(campaignData, availableAccounts);

            confirmBtn.onclick = () => {
                const numAccounts = parseInt(document.getElementById('accountsToCharge').value);
                if (numAccounts > 0 && numAccounts <= availableAccounts) {
                    resolve(numAccounts);
                    closeChargeModal();
                } else {
                    document.getElementById('accountValidation').textContent = 'Invalid number of accounts';
                }
            };
            cancelBtn.onclick = () => reject(new Error('Operation cancelled'));
            closeBtn.onclick = () => reject(new Error('Operation cancelled'));
        });

        // If we get here, the user has confirmed the number of accounts.
        const totalAmount = campaignData.pricePerAccount * accountsToCharge;
        const paymentRequest = {
            sellerId: currentUser.uid,
            buyerId: campaignData.createdBy, // Correct buyerId
            campaignId: activeRequest.campaign.id,
            requestId: activeRequest.id,
            amount: totalAmount,
            accountsRequested: accountsToCharge,
            pricePerAccount: campaignData.pricePerAccount,
            currency: 'USDT',
            status: 'pending',
            createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
        };

        const button = headerActions.querySelector('button');
        if (button) {
            button.textContent = 'Processing...';
            button.disabled = true;
        }

        const batch = window.db.batch();
        const paymentRequestRef = window.db.collection('payment_requests').doc();
        batch.set(paymentRequestRef, paymentRequest);

        const message = {
            text: `💰 The seller has requested payment of $${paymentRequest.amount} ${paymentRequest.currency} for ${paymentRequest.accountsRequested} account${paymentRequest.accountsRequested > 1 ? 's' : ''} ($${paymentRequest.pricePerAccount} ${paymentRequest.currency} each)`,
            userId: currentUser.uid,
            type: 'charge',
            amount: paymentRequest.amount,
            currency: paymentRequest.currency,
            paymentRequestId: paymentRequestRef.id,
            createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
        };

        const messageRef = window.db.collection('requests').doc(activeRequest.id).collection('messages').doc();
        batch.set(messageRef, message);
        
        await batch.commit();

    } catch (error) {
        if (error.message !== 'Operation cancelled') {
            console.error('Error processing payment:', error);
            alert('Error processing payment: ' + error.message);
        }
    } finally {
        // Restore button state regardless of outcome
        const button = headerActions.querySelector('button');
        if (button) {
            await createChargeButton(activeRequest.campaign);
        }
    }
}

// Manejar respuesta de pago
async function handlePaymentResponse(paymentRequestId, response) {
    try {
        // Obtener la solicitud de pago
        const paymentRequestDoc = await window.db.collection('payment_requests').doc(paymentRequestId).get();
        if (!paymentRequestDoc.exists) {
            throw new Error('Solicitud de pago no encontrada');
        }

        const paymentRequestData = paymentRequestDoc.data();

        // Verificar estado según la acción
        if (response === 'appeal') {
            // Para apelación, verificar que el pago esté rechazado
            if (paymentRequestData.status !== 'rejected') {
                throw new Error('Solo se pueden apelar pagos rechazados');
            }
        } else if (response === 'accept_rejection') {
            // Para aceptar rechazo, verificar que el pago esté rechazado
            if (paymentRequestData.status !== 'rejected') {
                throw new Error('Solo se puede aceptar el rechazo de pagos rechazados');
            }
        } else {
            // Para otras acciones, verificar que esté pendiente
            if (paymentRequestData.status !== 'pending') {
                throw new Error('Esta solicitud de pago ya fue procesada');
            }
        }

        // Actualizar estado según la acción
        if (response === 'appeal') {
            await window.db.collection('payment_requests').doc(paymentRequestId).update({
                status: 'appealed',
                appealedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
                appealedBy: currentUser.uid
            });

            // Notificar al administrador
            await window.db.collection('admin_notifications').add({
                type: 'payment_appeal',
                paymentRequestId,
                sellerId: currentUser.uid,
                requestId: paymentRequestData.requestId,
                campaignId: paymentRequestData.campaignId,
                amount: paymentRequestData.amount,
                currency: paymentRequestData.currency,
                createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
                status: 'pending'
            });
        } else if (response === 'accept_rejection') {
            await window.db.collection('payment_requests').doc(paymentRequestId).update({
                status: 'rejected_accepted',
                rejectionAcceptedAt: window.firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            await window.db.collection('payment_requests').doc(paymentRequestId).update({
                status: response,
                respondedAt: window.firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        // Si el pago fue aprobado, actualizar el contador y verificar si la campaña debe finalizar
        if (response === 'approved') {
            const cuentasCobradas = await getChargedAccounts(paymentRequestData.campaignId);
            const campaignDoc = await window.db.collection('campaigns').doc(paymentRequestData.campaignId).get();
            const campaignData = campaignDoc.data();
            const cuentasDisponibles = campaignData.accountCount - cuentasCobradas;

            // Actualizar UI
            const campaignInfo = document.getElementById('campaignInfo');
            if (campaignInfo) {
                campaignInfo.innerHTML = `
                    <div class="campaign-header">
                        <span class="campaign-name">${campaignData.name}</span>
                        <span class="campaign-status ${campaignData.status}">${formatStatus(campaignData.status)}</span>
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
            }

            // Si se alcanzó el número de cuentas, finalizar la campaña
            if (cuentasCobradas >= campaignData.accountCount) {
                await window.db.collection('campaigns').doc(paymentRequestData.campaignId).update({
                    status: 'completed',
                    completedAt: window.firebase.firestore.FieldValue.serverTimestamp()
                });

                // Notificar al usuario
                alert('¡La campaña ha sido completada! Se han cobrado todas las cuentas.');
            }
        }

        // No actualizamos el estado de la campaña para mantenerla aprobada

        // Crear mensaje según la acción
        let message;
        if (response === 'appeal') {
            message = {
                text: '⚠️ Has solicitado una apelación. El administrador revisará tu caso y la documentación.',
                userId: currentUser.uid,
                type: 'payment_appeal',
                paymentRequestId,
                amount: paymentRequestData.amount,
                currency: paymentRequestData.currency,
                accountsRequested: paymentRequestData.accountsRequested,
                createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
            };
        } else if (response === 'accept_rejection') {
            message = {
                text: '✅ Has aceptado continuar sin el pago',
                userId: currentUser.uid,
                type: 'payment_response',
                paymentRequestId,
                response: 'rejected_accepted',
                createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
            };
        } else {
            message = {
                text: response === 'approved' 
                    ? `👍 El comprador ha aprobado la solicitud de pago de ${paymentRequestData.accountsRequested} cuenta${paymentRequestData.accountsRequested > 1 ? 's' : ''} por $${paymentRequestData.amount} ${paymentRequestData.currency}`
                    : `❌ El comprador ha rechazado la solicitud de pago de ${paymentRequestData.accountsRequested} cuenta${paymentRequestData.accountsRequested > 1 ? 's' : ''} por $${paymentRequestData.amount} ${paymentRequestData.currency}`,
                userId: currentUser.uid,
                type: 'payment_response',
                paymentRequestId,
                response,
                amount: paymentRequestData.amount,
                currency: paymentRequestData.currency,
                accountsRequested: paymentRequestData.accountsRequested,
                createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
            };
        }

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

// Formatear estado de la campaña
function formatStatus(status) {
    const statusMap = {
        'active': 'Activa',
        'approved': 'Aprobada',
        'completed': 'Completada',
        'cancelled': 'Cancelada'
    };
    return statusMap[status] || status;
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

// Abrir modal de cobro
function openChargeModal(campaignData, availableAccounts) {
    const modal = document.getElementById('chargeModal');
    const accountsInput = document.getElementById('accountsToCharge');
    
    // Actualizar información en el modal
    document.getElementById('availableAccounts').textContent = availableAccounts;
    document.getElementById('pricePerAccount').textContent = `$${campaignData.pricePerAccount}`;
    document.getElementById('accountValidation').textContent = '';
    document.getElementById('totalAmount').textContent = '0';
    
    // Resetear y configurar el input
    accountsInput.value = '';
    accountsInput.max = availableAccounts;
    accountsInput.min = 1;
    
    // Agregar evento para actualizar el monto total
    accountsInput.oninput = () => {
        const accounts = parseInt(accountsInput.value) || 0;
        const total = accounts * campaignData.pricePerAccount;
        document.getElementById('totalAmount').textContent = `$${total}`;
        
        // Validar el número de cuentas
        if (accounts < 1 || accounts > availableAccounts) {
            document.getElementById('accountValidation').textContent = 'Invalid number of accounts';
        } else {
            document.getElementById('accountValidation').textContent = '';
        }
    };
    
    // Mostrar el modal
    modal.style.display = 'block';
}

// Cerrar modal de cobro
function closeChargeModal() {
    const modal = document.getElementById('chargeModal');
    modal.style.display = 'none';
}

// Scroll al último mensaje
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Obtener el número de cuentas cobradas para una campaña
async function getChargedAccounts(campaignId) {
    try {
        if (!campaignId) {
            console.error('Error: campaignId es undefined en getChargedAccounts');
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
