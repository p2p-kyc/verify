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
        const cuentasCobradas = await getCuentasCobradas(campaign.id);
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
        // Obtener cuentas cobradas y actualizar información
        const cuentasCobradas = await getCuentasCobradas(campaignDoc.id);
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

        // Verificar estado de la campaña y cuentas disponibles
        const cuentasCobradas = await getCuentasCobradas(activeRequest.campaign.id);
        const cuentasDisponibles = campaignData.accountCount - cuentasCobradas;
        
        if (cuentasDisponibles <= 0) {
            throw new Error('No hay más cuentas disponibles para cobrar en esta campaña');
        }

        console.log('Estado de cuentas:', {
            total: campaignData.accountCount,
            cobradas: cuentasCobradas,
            disponibles: cuentasDisponibles
        });

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
                const availableAccounts = cuentasDisponibles;

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
        
        // Obtener el buyerId del request
        const requestDoc = await window.db.collection('requests').doc(activeRequest.id).get();
        if (!requestDoc.exists) {
            throw new Error('Request no encontrado');
        }
        const requestData = requestDoc.data();
        
        // Agregar datos adicionales al payment request
        paymentRequest.campaignId = activeRequest.campaign.id;
        paymentRequest.requestId = activeRequest.id;
        paymentRequest.buyerId = requestData.userId; // Usar el userId del request
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
            lastPaymentRequestAt: window.firebase.firestore.FieldValue.serverTimestamp(),
            lastPaymentRequestId: paymentRequestRef.id
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

        // Si el pago fue aprobado, actualizar el contador y verificar si la campaña debe finalizar
        if (response === 'approved') {
            const cuentasCobradas = await getCuentasCobradas(paymentRequestData.campaignId);
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

// Obtener el número de cuentas cobradas para una campaña
async function getCuentasCobradas(campaignId) {
    try {
        if (!campaignId) {
            console.error('Error: campaignId es undefined en getCuentasCobradas');
            return 0;
        }

        // Obtener todas las solicitudes de pago aprobadas
        const paymentRequests = await window.db.collection('payment_requests')
            .where('campaignId', '==', campaignId)
            .where('status', '==', 'approved')
            .get()
            .catch(error => {
                console.error('Error al obtener payment requests:', error);
                return { empty: true };
            });

        if (!paymentRequests || paymentRequests.empty) return 0;

        let totalCuentasCobradas = 0;
        paymentRequests.forEach(doc => {
            const data = doc.data();
            // Sumar el número de cuentas de cada solicitud aprobada
            if (data && typeof data.accountCount === 'number') {
                totalCuentasCobradas += data.accountCount;
            } else {
                // Si no hay accountCount, asumir 1 cuenta
                totalCuentasCobradas += 1;
            }
        });

        return totalCuentasCobradas;
    } catch (error) {
        console.error('Error al obtener cuentas cobradas:', error);
        return 0;
    }
}
