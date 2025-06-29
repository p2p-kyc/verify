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
if (finishButton) {
    finishButton.addEventListener('click', handleFinishCampaign);
}

// Escuchar cambios de autenticación
auth.onAuthStateChanged(async user => {
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

// Cargar chats del comprador
async function loadBuyerChats() {
    try {
        const chatsList = document.getElementById('chatsList');
        console.log('Cargando chats del comprador:', currentUser.uid);

        // Buscar campañas creadas por el usuario
        const campaigns = await db.collection('campaigns')
            .where('createdBy', '==', currentUser.uid)
            .get();

        let allRequests = [];

        // Para cada campaña, buscar sus solicitudes
        for (const campaign of campaigns.docs) {
            const campaignData = campaign.data();
            const campaignRequests = await db.collection('requests')
                .where('campaignId', '==', campaign.id)
                .get();

            // Agregar solicitudes
            campaignRequests.forEach(doc => {
                allRequests.push({
                    id: doc.id,
                    campaignData: {
                        id: campaign.id,
                        ...campaignData
                    },
                    requestData: doc.data()
                });
            });
        }

        if (allRequests.length === 0) {
            chatsList.innerHTML = '<p class="no-data">No hay chats disponibles</p>';
            return;
        }

        const chatsHtml = await Promise.all(allRequests.map(async request => {
            // Obtener datos del vendedor
            const sellerData = await getUserData(request.requestData.sellerId);
            
            return `
                <div class="chat-item" onclick="openChat('${request.id}')">
                    <div class="chat-info">
                        <h3>${request.campaignData.name}</h3>
                        <p class="chat-role">Comprador</p>
                        <p class="chat-user">Chat con: ${sellerData.name || sellerData.email}</p>
                    </div>
                </div>
            `;
        }));

        chatsList.innerHTML = chatsHtml.join('');

    } catch (error) {
        console.error('Error loading buyer chats:', error);
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
        
        // Obtener datos de la campaña
        const campaignDoc = await db.collection('campaigns').doc(requestData.campaignId).get();
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
        const sellerData = await getUserData(requestData.sellerId);

        // Mostrar información en el header
        document.getElementById('chatTitle').textContent = `Chat con ${sellerData.name || sellerData.email}`;

        // Configurar botón de terminar
        if (finishButton) {
            finishButton.style.display = campaign.status === 'active' ? 'flex' : 'none';
        }

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
                        const message = change.doc.data();
                        appendMessage(message);
                    }
                });
            });

        // Mostrar formulario de mensajes
        messageForm.style.display = 'flex';

    } catch (error) {
        console.error('Error opening chat:', error);
        alert('Error al abrir el chat: ' + error.message);
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
    scrollToBottom();
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
        scrollToBottom();

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
        await db.collection('campaigns').doc(activeRequest.campaign.id).update({
            status: 'completed',
            completedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Ocultar botón de terminar
        if (finishButton) {
            finishButton.style.display = 'none';
        }

        // Recargar chats
        loadBuyerChats();

    } catch (error) {
        console.error('Error finishing campaign:', error);
        alert('Error al terminar la campaña: ' + error.message);
    }
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
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

// Mobile chat view functions
function toggleChatView() {
    const chatsList = document.querySelector('.chats-list');
    const chatArea = document.querySelector('.chat-area');
    
    if (window.innerWidth <= 768) {
        if (chatsList.style.display === 'none' || chatsList.style.display === '') {
            showChatsList();
        } else {
            showChatArea();
        }
    }
}

function showChatsList() {
    const chatsList = document.querySelector('.chats-list');
    const chatArea = document.querySelector('.chat-area');
    
    if (chatsList && chatArea) {
        chatsList.style.display = 'block';
        chatArea.style.display = 'none';
    }
}

function showChatArea() {
    const chatsList = document.querySelector('.chats-list');
    const chatArea = document.querySelector('.chat-area');
    
    if (chatsList && chatArea) {
        chatsList.style.display = 'none';
        chatArea.style.display = 'block';
        
        // Add back button to header actions on mobile
        if (window.innerWidth <= 768) {
            const headerActions = document.getElementById('headerActions');
            if (headerActions) {
                headerActions.innerHTML = `
                    <button class="btn-action" onclick="showChatsList()" title="Back to chats">
                        <i class='bx bx-arrow-back'></i>
                    </button>
                `;
            }
        }
    }
}

// Initialize mobile chat view
document.addEventListener('DOMContentLoaded', () => {
    // Show chats list by default on mobile
    if (window.innerWidth <= 768) {
        showChatsList();
    }
    
    // Handle window resize
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            const chatsList = document.querySelector('.chats-list');
            const chatArea = document.querySelector('.chat-area');
            if (chatsList && chatArea) {
                chatsList.style.display = 'block';
                chatArea.style.display = 'block';
            }
        }
    });
    
    // Add click handler to chat items for mobile
    document.addEventListener('click', (e) => {
        if (e.target.closest('.chat-item') && window.innerWidth <= 768) {
            // Small delay to ensure the chat is loaded before switching view
            setTimeout(() => {
                showChatArea();
            }, 100);
        }
    });
});
