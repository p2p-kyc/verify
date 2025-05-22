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
function createChargeButton(campaign) {
    console.log('Creando botón de cobro con campaña:', campaign);
    // Limpiar botón anterior si existe
    headerActions.innerHTML = '';

    // Crear nuevo botón
    const button = document.createElement('button');
    button.className = 'action-button';
    button.title = 'Cobrar cuenta';
    button.innerHTML = `
        <i class='bx bx-dollar'></i>
        <span>Cobrar cuenta</span>
    `;

    // Configurar el estado del botón
    const isActive = campaign?.status === 'active';
    console.log('Estado de la campaña:', campaign?.status);
    console.log('Botón estará:', isActive ? 'activo' : 'inactivo');
    
    if (!isActive) {
        button.title = 'La campaña no está activa';
        button.style.opacity = '0.7';
        button.style.cursor = 'not-allowed';
    }

    // Agregar evento click
    button.addEventListener('click', requestPayment);

    // Agregar al contenedor
    headerActions.appendChild(button);
    return button;
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
        document.getElementById('campaignInfo').innerHTML = `
            <span class="campaign-title">${campaignData.name}</span>
            <span class="campaign-status ${campaignData.status}">${formatStatus(campaignData.status)}</span>
        `;

        // Crear botón de cobro
        console.log('Datos de la campaña antes de crear botón:', campaignData);
        createChargeButton(campaignData);

        // Limpiar mensajes anteriores
        messagesContainer.innerHTML = '';

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

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

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
            imageContainer.appendChild(image);
            contentDiv.appendChild(imageContainer);
            contentDiv.appendChild(timeSpan);
            messageDiv.appendChild(contentDiv);
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
        return userDoc.exists ? userDoc.data() : { email: 'Usuario desconocido' };
    } catch (error) {
        console.error('Error getting user data:', error);
        return { email: 'Error al cargar usuario' };
    }
}

// Solicitar pago
async function requestPayment() {
    try {
        if (!activeRequest?.campaign?.id) {
            alert('Por favor selecciona un chat primero');
            return;
        }

        // Verificar estado de la campaña
        const campaignDoc = await window.db.collection('campaigns')
            .doc(activeRequest.campaign.id)
            .get();

        if (!campaignDoc.exists) {
            throw new Error('Campaña no encontrada');
        }

        const campaignData = campaignDoc.data();
        console.log('Estado actual de la campaña:', {
            id: campaignDoc.id,
            status: campaignData.status,
            paymentStatus: campaignData.paymentStatus
        });

        // Verificar el estado de pago
        if (campaignData.paymentStatus !== 'approved') {
            console.error('Error de estado de pago:', campaignData.paymentStatus);
            throw new Error('El pago de la campaña no está aprobado');
        }

        // Verificar estado de la campaña
        if (campaignData.status !== 'active' && campaignData.status !== 'approved') {
            console.error('Error de estado de campaña:', campaignData.status);
            throw new Error('La campaña no está activa o aprobada');
        }

        // Mostrar el modal de cobro
        const modal = document.getElementById('chargeModal');
        const confirmBtn = document.getElementById('confirmCharge');
        const cancelBtn = document.getElementById('cancelCharge');
        const closeBtn = modal.querySelector('.close');

        // Esperar la confirmación del usuario usando Promise
        const paymentRequest = await new Promise((resolve, reject) => {
            // Mostrar el modal y configurar datos
            openChargeModal(campaignData);

            // Manejar confirmación
            confirmBtn.onclick = async () => {
                const accountsToCharge = parseInt(document.getElementById('accountsToCharge').value);
                const availableAccounts = campaignData.accountCount - (campaignData.verificationCount || 0);

                if (accountsToCharge < 1 || accountsToCharge > availableAccounts) {
                    document.getElementById('accountValidation').textContent = 'Cantidad de cuentas inválida';
                    return;
                }

                // Calcular el monto
                const amountPerAccount = campaignData.pricePerAccount;
                const totalAmount = amountPerAccount * accountsToCharge;

                // Crear solicitud de pago
                const request = {
                    sellerId: currentUser.uid,
                    buyerId: campaignData.createdBy,
                    campaignId: activeRequest.campaign.id,
                    requestId: activeRequest.id,
                    amount: totalAmount,
                    accountsRequested: accountsToCharge,
                    pricePerAccount: amountPerAccount,
                    currency: 'USDT',
                    status: 'pending',
                    createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
                };

                closeChargeModal();
                resolve(request);
            };

            // Manejar cancelación
            const handleCancel = () => {
                closeChargeModal();
                reject(new Error('Operación cancelada'));
            };

            cancelBtn.onclick = handleCancel;
            closeBtn.onclick = handleCancel;
            window.onclick = (event) => {
                if (event.target === modal) handleCancel();
            };
        });

        // Actualizar estado del botón
        const button = headerActions.querySelector('button');
        if (button) {
            button.textContent = 'Procesando...';
            button.disabled = true;
            button.style.opacity = '0.7';
            button.style.cursor = 'wait';
        }

        // Iniciar transacción de Firestore
        const batch = window.db.batch();

        // Crear referencia para la solicitud de pago
        const paymentRequestRef = window.db.collection('payment_requests').doc();
        
        // Agregar datos adicionales al payment request
        paymentRequest.campaignId = activeRequest.campaign.id;
        paymentRequest.requestId = activeRequest.id;
        paymentRequest.buyerId = activeRequest.userId;
        paymentRequest.sellerId = currentUser.uid;
        paymentRequest.status = 'pending';
        paymentRequest.createdAt = window.firebase.firestore.FieldValue.serverTimestamp();
        
        batch.set(paymentRequestRef, paymentRequest);

        // Crear mensaje de cobro
        const message = {
            text: `💰 El vendedor ha solicitado el pago de $${paymentRequest.amount} ${paymentRequest.currency} por ${paymentRequest.accountsRequested} cuenta${paymentRequest.accountsRequested > 1 ? 's' : ''} ($${paymentRequest.pricePerAccount} ${paymentRequest.currency} c/u)`,
            userId: currentUser.uid,
            type: 'charge',
            amount: paymentRequest.amount,
            currency: paymentRequest.currency,
            paymentRequestId: paymentRequestRef.id,
            createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
        };

        // Agregar mensaje al batch
        const messageRef = window.db.collection('requests')
            .doc(activeRequest.id)
            .collection('messages')
            .doc();
        batch.set(messageRef, message);

        // Actualizar estado de la campaña en el batch
        const campaignRef = window.db.collection('campaigns')
            .doc(activeRequest.campaign.id);
        batch.update(campaignRef, {
            status: 'pending_payment',
            chargeRequestedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
            currentPaymentRequest: paymentRequestRef.id
        });

        // Ejecutar todas las operaciones en una transacción
        await batch.commit();

        // Restaurar estado del botón
        if (button) {
            button.textContent = 'Cobrar cuenta';
            button.disabled = false;
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
        }

    } catch (error) {
        console.error('Error al procesar el pago:', error);
        
        // No mostrar alerta si fue cancelación voluntaria
        if (error.message !== 'Operación cancelada') {
            alert('Error al procesar el pago: ' + error.message);
        }
        
        // Restaurar estado del botón
        const button = headerActions.querySelector('button');
        if (button) {
            button.textContent = 'Cobrar cuenta';
            button.disabled = false;
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
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

        // Verificar que la solicitud esté pendiente
        if (paymentRequestData.status !== 'pending') {
            throw new Error('Esta solicitud de pago ya fue procesada');
        }

        // Actualizar estado de la solicitud
        await window.db.collection('payment_requests').doc(paymentRequestId).update({
            status: response,
            respondedAt: window.firebase.firestore.FieldValue.serverTimestamp()
        });

        // Actualizar estado de la campaña
        await window.db.collection('campaigns').doc(paymentRequestData.campaignId).update({
            status: response === 'approved' ? 'processing_payment' : 'active'
        });

        // Crear mensaje de respuesta
        const message = {
            text: response === 'approved' 
                ? '👍 El comprador ha aprobado la solicitud de pago'
                : '❌ El comprador ha rechazado la solicitud de pago',
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

// Formatear estado de la campaña
function formatStatus(status) {
    const statusMap = {
        'active': 'Activa',
        'pending_payment': 'Pago pendiente',
        'processing_payment': 'Procesando pago',
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
function openChargeModal(campaignData) {
    const modal = document.getElementById('chargeModal');
    const accountsInput = document.getElementById('accountsToCharge');
    const availableAccounts = campaignData.accountCount - (campaignData.verificationCount || 0);
    
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
            document.getElementById('accountValidation').textContent = 'Cantidad de cuentas inválida';
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
