// Variables globales
let currentUser = null;
let activeRequest = null;
let messagesListener = null;
let currentAppeal = null;

// Referencias a elementos del DOM
const chatsList = document.getElementById('chatsList');
const messagesContainer = document.getElementById('messagesContainer');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const chatTitle = document.getElementById('chatTitle');
const campaignInfo = document.getElementById('campaignInfo');
const appealInfo = document.getElementById('appealInfo');
const appealActions = document.getElementById('appealActions');

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
        const imageData = await getBase64(file);
        await sendImageMessage(imageData);
        event.target.value = ''; // Limpiar input
    } catch (error) {
        console.error('Error al procesar imagen:', error);
        alert('Error al procesar la imagen: ' + error.message);
    }
});

// Enviar mensaje con imagen
async function sendImageMessage(imageData) {
    try {
        if (!activeRequest) {
            throw new Error('No hay una conversación activa');
        }

        const message = {
            type: 'image',
            imageData,
            userId: currentUser.uid,
            createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
        };

        await window.db.collection('requests')
            .doc(activeRequest.id)
            .collection('messages')
            .add(message);

    } catch (error) {
        console.error('Error al enviar imagen:', error);
        alert('Error al enviar la imagen: ' + error.message);
    }
}

// Esperar a que Firebase esté inicializado
window.addEventListener('load', () => {
    // Escuchar cambios de autenticación
    window.auth.onAuthStateChanged(async user => {
        if (user) {
            currentUser = user;
            // Verificar si es admin
            const userDoc = await window.db.collection('users').doc(user.uid).get();
            if (!userDoc.exists || userDoc.data().role !== 'admin') {
                window.location.href = 'index.html';
                return;
            }
            // Cargar chats con apelaciones
            loadAppealsChats();
        } else {
            window.location.href = 'index.html';
        }
    });
});

// Cargar chats con apelaciones
async function loadAppealsChats() {
    try {
        // Mostrar estado de carga
        chatsList.innerHTML = `
            <div class="loading">
                <i class='bx bx-loader-alt bx-spin'></i>
                <p>Cargando apelaciones...</p>
            </div>
        `;

        // Obtener pagos apelados
        let appealsQuery;
        try {
            appealsQuery = await window.db.collection('payment_requests')
                .where('status', '==', 'appealed')
                .orderBy('appealedAt', 'desc')
                .get();
        } catch (indexError) {
            if (indexError.code === 'failed-precondition') {
                // Si falta el índice, intentar sin ordenamiento
                appealsQuery = await window.db.collection('payment_requests')
                    .where('status', '==', 'appealed')
                    .get();
                
                // Ordenar los resultados manualmente
                appealsQuery.docs.sort((a, b) => {
                    const timeA = a.data().appealedAt?.seconds || 0;
                    const timeB = b.data().appealedAt?.seconds || 0;
                    return timeB - timeA; // orden descendente
                });

                // Mostrar mensaje para crear el índice
                console.warn('Se recomienda crear el índice para mejor rendimiento:', indexError.message);
            } else {
                throw indexError;
            }
        }

        if (appealsQuery.empty) {
            chatsList.innerHTML = '<p class="no-chats">No hay apelaciones pendientes</p>';
            return;
        }

        chatsList.innerHTML = ''; // Limpiar loader

        // Procesar cada apelación
        for (const appealDoc of appealsQuery.docs) {
            const appealData = appealDoc.data();
            
            // Obtener datos del request
            const requestDoc = await window.db.collection('requests').doc(appealData.requestId).get();
            if (!requestDoc.exists) continue;
            
            const requestData = requestDoc.data();
            
            // Obtener último mensaje
            const lastMessage = await getLastMessage(appealData.requestId);
            
            // Crear elemento de chat
            const chatElement = document.createElement('div');
            chatElement.className = 'chat-item';
            if (activeRequest && activeRequest.id === requestDoc.id) {
                chatElement.classList.add('active');
            }
            chatElement.dataset.requestId = requestDoc.id;
            chatElement.onclick = () => openChat(requestDoc.id, appealDoc.id);
            
            // Obtener datos del vendedor
            const sellerDoc = await window.db.collection('users').doc(appealData.sellerId).get();
            const sellerData = sellerDoc.exists ? sellerDoc.data() : {};
            const sellerName = sellerData.displayName || sellerData.name || 'Usuario desconocido';
            
            chatElement.innerHTML = `
                <div class="chat-info">
                    <div class="chat-header">
                        <h4>Apelación de ${sellerName}</h4>
                        <span class="amount">$${appealData.amount} ${appealData.currency}</span>
                    </div>
                    <p class="last-message">${lastMessage || 'No hay mensajes'}</p>
                </div>
                <div class="chat-meta">
                    <span class="timestamp">${formatDate(appealData.appealedAt)}</span>
                </div>
            `;
            
            chatsList.appendChild(chatElement);
        }

    } catch (error) {
        console.error('Error al cargar apelaciones:', error);
        alert('Error al cargar las apelaciones: ' + error.message);
    }
}

// Obtener último mensaje de un chat
async function getLastMessage(requestId) {
    try {
        const messagesQuery = await window.db.collection('requests')
            .doc(requestId)
            .collection('messages')
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();

        if (messagesQuery.empty) return null;

        const message = messagesQuery.docs[0].data();
        if (message.type === 'image') return '🖼️ Imagen';
        if (message.type === 'payment_appeal') return '⚠️ Apelación iniciada';
        return message.text;

    } catch (error) {
        console.error('Error al obtener último mensaje:', error);
        return null;
    }
}

// Abrir chat
async function openChat(requestId, appealId) {
    try {
        // Limpiar chat anterior
        if (messagesListener) {
            messagesListener();
            messagesListener = null;
        }
        messagesContainer.innerHTML = '';
        
        // Obtener datos de la apelación
        const appealDoc = await window.db.collection('payment_requests').doc(appealId).get();
        if (!appealDoc.exists) throw new Error('Apelación no encontrada');
        
        const appealData = appealDoc.data();
        currentAppeal = { id: appealId, ...appealData };
        
        // Obtener datos del request
        const requestDoc = await window.db.collection('requests').doc(requestId).get();
        if (!requestDoc.exists) throw new Error('Conversación no encontrada');
        
        const requestData = requestDoc.data();
        activeRequest = { id: requestId, ...requestData };

        // Limpiar mensajes anteriores
        messagesContainer.innerHTML = '';
        messagesContainer.scrollTop = 0;

        // Actualizar título e información
        await updateChatInfo();
        
        // Activar el chat en la lista
        const previousActive = chatsList.querySelector('.chat-item.active');
        if (previousActive) {
            previousActive.classList.remove('active');
        }
        const currentChat = chatsList.querySelector(`[data-request-id="${requestId}"]`);
        if (currentChat) {
            currentChat.classList.add('active');
            currentChat.scrollIntoView({ behavior: 'smooth' });
        }
        
        // Escuchar nuevos mensajes
        messagesListener = window.db.collection('requests')
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

        return;

    } catch (error) {
        console.error('Error al abrir chat:', error);
        alert('Error al abrir la conversación: ' + error.message);
    }
}

// Actualizar información del chat y apelación
async function updateChatInfo() {
    try {
        // Obtener datos del vendedor para el título
        const sellerDoc = await window.db.collection('users').doc(currentAppeal.sellerId).get();
        const sellerData = sellerDoc.exists ? sellerDoc.data() : {};
        const sellerName = sellerData.displayName || sellerData.name || 'Usuario desconocido';

        // Actualizar título del chat
        chatTitle.textContent = `Apelación de ${sellerName}`;

        // Actualizar información de la campaña
        const campaignDoc = await window.db.collection('campaigns').doc(currentAppeal.campaignId).get();
        const campaignData = campaignDoc.exists ? campaignDoc.data() : null;

        if (campaignData) {
            campaignInfo.innerHTML = `
                <p><strong>Campaña:</strong> ${campaignData.name}</p>
                <p><strong>Estado:</strong> ${formatStatus(campaignData.status)}</p>
            `;
        } else {
            campaignInfo.innerHTML = '';
        }

        // Obtener datos del usuario que apeló
        const appealedByDoc = await window.db.collection('users').doc(currentAppeal.sellerId).get();
        const appealedByData = appealedByDoc.exists ? appealedByDoc.data() : {};
        const appealedByName = appealedByData.displayName || appealedByData.name || 'desconocido';
        
        // Actualizar panel de información
        appealInfo.innerHTML = `
            <h4>Detalles del pago</h4>
            <ul>
                <li><strong>Monto total:</strong> ${currentAppeal.amount} ${currentAppeal.currency}</li>
                <li><strong>Cuentas solicitadas:</strong> ${currentAppeal.accounts || 1}</li>
                <li><strong>Precio por cuenta:</strong> ${currentAppeal.pricePerAccount || currentAppeal.amount} ${currentAppeal.currency}</li>
                <li><strong>Apelado el:</strong> ${formatDate(currentAppeal.appealedAt)}</li>
                <li><strong>Apelado por:</strong> ${appealedByName}</li>
                <p><strong>Estado actual:</strong> ${formatStatus(currentAppeal.status)}</p>
            </div>
            <div class="appeal-details">
                <h4>Documentos adjuntos</h4>
                <div id="documentsList"></div>
            </div>
        `;

        // Cargar documentos de la conversación
        const documentsQuery = await window.db.collection('requests')
            .doc(activeRequest.id)
            .collection('messages')
            .where('type', 'in', ['image', 'payment_proof'])
            .orderBy('createdAt', 'desc')
            .get();

        const documentsList = document.getElementById('documentsList');
        if (documentsQuery.empty) {
            documentsList.innerHTML = '<p>No hay documentos adjuntos</p>';
        } else {
            documentsList.innerHTML = '';
            documentsQuery.docs.forEach(doc => {
                const data = doc.data();
                const docElement = document.createElement('div');
                docElement.className = 'document-item';
                const imageUrl = data.imageData || data.proofImage;
                docElement.innerHTML = `
                    <img src="${imageUrl}" alt="Documento" onclick="window.open('${imageUrl}', '_blank')">
                    <span class="document-date">${formatDate(data.createdAt)}</span>
                `;
                documentsList.appendChild(docElement);
            });
        }

        // Mostrar botones de acción solo si la apelación está pendiente
        if (currentAppeal.status === 'appealed') {
            const appealId = currentAppeal.id;
            const buttonsHtml = `
                <button class="button primary" onclick="handleAppeal('${appealId}', true)">
                    <i class='bx bx-check'></i>
                    Aprobar apelación
                </button>
                <button class="button secondary" onclick="handleAppeal('${appealId}', false)">
                    <i class='bx bx-x'></i>
                    Rechazar apelación
                </button>
            `;
            appealActions.innerHTML = buttonsHtml;
        } else {
            appealActions.innerHTML = '';
        }

        return;

    } catch (error) {
        console.error('Error al actualizar información:', error);
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
            type: 'text',
            createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
        };

        await window.db.collection('requests')
            .doc(activeRequest.id)
            .collection('messages')
            .add(message);

        messageInput.value = '';

    } catch (error) {
        console.error('Error al enviar mensaje:', error);
        alert('Error al enviar el mensaje: ' + error.message);
    }
}

// Manejar apelación
async function handleAppeal(appealId, approved) {
    try {
        if (!confirm(`¿Estás seguro de que deseas ${approved ? 'aprobar' : 'rechazar'} esta apelación?`)) {
            return;
        }

        const newStatus = approved ? 'approved' : 'rejected';
        
        // Actualizar estado de la solicitud de pago
        await window.db.collection('payment_requests').doc(appealId).update({
            status: newStatus,
            appealResolvedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
            appealResolvedBy: currentUser.uid,
            appealResult: newStatus
        });

        // Crear mensaje de respuesta
        const message = {
            text: approved 
                ? '✅ El administrador ha aprobado la apelación. El pago será procesado.'
                : '❌ El administrador ha rechazado la apelación. El pago no será procesado.',
            userId: currentUser.uid,
            type: 'appeal_response',
            appealId,
            response: newStatus,
            createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
        };

        // Guardar mensaje en la conversación
        await window.db.collection('requests')
            .doc(activeRequest.id)
            .collection('messages')
            .add(message);

        // Registrar actividad
        await window.db.collection('activity').add({
            type: 'appeal_resolution',
            appealId,
            paymentRequestId: appealId,
            requestId: activeRequest.id,
            adminId: currentUser.uid,
            result: newStatus,
            createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
        });

        // Recargar lista de apelaciones
        loadAppealsChats();

    } catch (error) {
        console.error('Error al procesar apelación:', error);
        alert('Error al procesar la apelación: ' + error.message);
    }
}

// Agregar mensaje al contenedor
async function appendMessage(message) {
    try {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.userId === currentUser.uid ? 'outgoing' : 'incoming'}`;
        messageDiv.dataset.timestamp = (message.createdAt && message.createdAt.seconds) || Math.floor(Date.now() / 1000);

        // Encontrar la posición correcta para insertar el mensaje
        const messages = Array.from(messagesContainer.children);
        const index = messages.findIndex(msg => {
            const timestamp = parseFloat(msg.dataset.timestamp);
            return timestamp > parseFloat(messageDiv.dataset.timestamp);
        });

        // Aplicar estilo según el tipo de mensaje
        if (message.type === 'image') {
            const imageHtml = `
                <div class="message-content">
                    <div class="image-container">
                        <img src="${message.imageData}" alt="Imagen" style="max-width: 300px; border-radius: 8px;">
                    </div>
                </div>
                <div class="message-info">
                    <span class="time">${formatDate(message.createdAt)}</span>
                </div>`;
            messageDiv.innerHTML = imageHtml;
        } else if (message.type === 'payment_appeal') {
            messageDiv.classList.add('appeal-message');
            const appealHtml = `
                <div class="message-content appeal-content">
                    <div class="appeal-text">${message.text}</div>
                    <span class="time">${formatDate(message.createdAt)}</span>
                </div>`;
            messageDiv.innerHTML = appealHtml;
        } else if (message.type === 'appeal_response') {
            messageDiv.classList.add('appeal-response');
            messageDiv.classList.add(message.response);
            const responseHtml = `
                <div class="message-content response-content">
                    <div class="response-text">
                        <i class='bx bx-${message.approved ? 'check success' : 'x danger'}'></i>
                        ${message.text}
                    </div>
                    <span class="time">${formatDate(message.createdAt)}</span>
                </div>`;
            messageDiv.innerHTML = responseHtml;
        } else {
            const textHtml = `
                <div class="message-content">
                    <span class="message-text">${message.text}</span>
                    <span class="timestamp">${formatDate(message.createdAt)}</span>
                </div>`;
            messageDiv.innerHTML = textHtml;
        }

        // Insertar mensaje en la posición correcta
        if (index === -1) {
            messagesContainer.appendChild(messageDiv);
        } else {
            messagesContainer.insertBefore(messageDiv, messages[index]);
        }

        // Obtener datos del usuario si es necesario
        if (!message.userId) return;
        
        const userData = await getUserData(message.userId);
        if (userData) {
            const nameSpan = document.createElement('span');
            nameSpan.className = 'user-name';
            nameSpan.textContent = userData.name;
            messageDiv.querySelector('.message-content').prepend(nameSpan);
        }

    } catch (error) {
        console.error('Error al agregar mensaje:', error);
    }
}

// Obtener datos de usuario
async function getUserData(userId) {
    try {
        const userDoc = await window.db.collection('users').doc(userId).get();
        return userDoc.exists ? userDoc.data() : null;
    } catch (error) {
        console.error('Error al obtener datos de usuario:', error);
        return null;
    }
}

// Formatear estado
function formatStatus(status) {
    const statusMap = {
        'active': 'Activa',
        'completed': 'Completada',
        'cancelled': 'Cancelada',
        'pending': 'Pendiente'
    };
    return statusMap[status] || status;
}

// Formatear fecha
function formatDate(timestamp) {
    if (!timestamp) return '';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    
    // Si es hoy, mostrar solo la hora
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
        return date.toLocaleTimeString('es-ES', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }
    
    // Si es este año, mostrar día y mes
    if (date.getFullYear() === today.getFullYear()) {
        return date.toLocaleDateString('es-ES', { 
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    // Si es otro año, mostrar fecha completa
    return date.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Scroll al último mensaje
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Event listeners
messageForm.addEventListener('submit', handleMessageSubmit);
