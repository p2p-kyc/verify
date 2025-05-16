// Función para formatear fechas
function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Create campaign
// Función para convertir imagen a Base64
function convertToBase64(file) {
    return new Promise((resolve, reject) => {
        if (file.size > 2 * 1024 * 1024) { // 2MB max
            reject(new Error('Image size must be less than 2MB'));
            return;
        }

        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

// Función para previsualizar imagen
function previewImage(file) {
    const preview = document.getElementById('paymentProofPreview');
    const reader = new FileReader();

    reader.onload = () => {
        preview.innerHTML = `
            <div class="preview-container">
                <img src="${reader.result}" alt="Payment proof preview">
                <span class="preview-filename">${file.name}</span>
            </div>
        `;
    };

    reader.readAsDataURL(file);
}

async function handleCreateCampaign(event) {
    event.preventDefault();
    
    try {
        const name = document.getElementById('campaignName').value;
        const description = document.getElementById('description').value;
        const countriesSelect = document.getElementById('countries');
        const countries = Array.from(countriesSelect.selectedOptions).map(option => option.value);
        const accountCount = parseInt(document.getElementById('accountCount').value);
        const pricePerAccount = parseFloat(document.getElementById('pricePerAccount').value);
        const totalPrice = parseFloat(document.getElementById('totalPrice').value);
        const paymentProofBase64 = document.getElementById('paymentProofBase64').value;

        if (!paymentProofBase64) {
            throw new Error('Please select a payment proof screenshot');
        }
        
        const campaignData = {
            name,
            description,
            countries,
            accountCount,
            pricePerAccount,
            totalPrice,
            verificationCount: 0,
            createdBy: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'pending',
            paymentProofBase64,
            paymentStatus: 'pending'
        };
        
        await db.collection('campaigns').add(campaignData);
        
        // Limpiar el formulario y cerrar el modal
        document.getElementById('createCampaignForm').reset();
        document.getElementById('paymentProofBase64').value = '';
        document.getElementById('paymentProofPreview').innerHTML = '';
        closeCreateCampaignModal();
        
        // Recargar las campañas
        await loadCampaigns();
        
        // Mostrar mensaje de éxito
        alert('Campaign created successfully! Please wait for admin approval of your payment proof.');
    } catch (error) {
        console.error('Error creating campaign:', error);
        alert('Error creating campaign: ' + error.message);
    }
    
    return false;
}

// Modal functions
function openCreateCampaignModal() {
    document.getElementById('createCampaignModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeCreateCampaignModal() {
    document.getElementById('createCampaignModal').style.display = 'none';
    document.body.style.overflow = 'auto';
    document.getElementById('createCampaignForm').reset();
}

// Calculate total price
function calculateTotal() {
    const accountCount = parseInt(document.getElementById('accountCount').value) || 0;
    const pricePerAccount = parseFloat(document.getElementById('pricePerAccount').value) || 0;
    const totalPrice = accountCount * pricePerAccount;
    document.getElementById('totalPrice').value = totalPrice.toFixed(2);
}

// Initialize event listeners
function initializeEventListeners() {
    try {
        // Add event listeners for modal
        const createCampaignButton = document.getElementById('createCampaignBtn');
        const closeModalButton = document.querySelector('.close-btn');
        const modal = document.getElementById('createCampaignModal');

        if (createCampaignButton) {
            createCampaignButton.addEventListener('click', openCreateCampaignModal);
        }

        if (closeModalButton) {
            closeModalButton.addEventListener('click', closeCreateCampaignModal);
        }

        // Close modal when clicking outside
        if (modal) {
            window.addEventListener('click', (event) => {
                if (event.target === modal) {
                    closeCreateCampaignModal();
                }
            });
        }

        // Add event listeners for calculation
        const accountCountInput = document.getElementById('accountCount');
        const pricePerAccountInput = document.getElementById('pricePerAccount');

        if (accountCountInput && pricePerAccountInput) {
            accountCountInput.addEventListener('input', calculateTotal);
            pricePerAccountInput.addEventListener('input', calculateTotal);
        }

        // Add event listener for payment proof upload
        const paymentProofInput = document.getElementById('paymentProof');
        if (paymentProofInput) {
            paymentProofInput.addEventListener('change', async (event) => {
                const file = event.target.files[0];
                if (file) {
                    try {
                        const base64 = await convertToBase64(file);
                        document.getElementById('paymentProofBase64').value = base64;
                        previewImage(file);
                    } catch (error) {
                        console.error('Error processing payment proof:', error);
                        alert(error.message);
                    }
                }
            });
        }

        // Add event listener for create campaign form
        const createCampaignForm = document.getElementById('createCampaignForm');
        if (createCampaignForm) {
            createCampaignForm.addEventListener('submit', handleCreateCampaign);
        }

        // Add event listener for file selection
        const uploadButton = document.getElementById('uploadButton');
        const fileInput = document.getElementById('paymentProof');

        if (uploadButton && fileInput) {
            uploadButton.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        const base64 = await convertToBase64(file);
                        document.getElementById('paymentProofBase64').value = base64;
                        previewImage(file);
                    } catch (error) {
                        alert(error.message);
                        fileInput.value = '';
                    }
                }
            });
        }

        // Add event listener for create campaign button
        const createBtn = document.getElementById('createCampaignBtn');
        if (createBtn) {
            createBtn.addEventListener('click', openCreateCampaignModal);
        }

        // Add event listener for close modal button
        const closeBtn = document.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeCreateCampaignModal);
        }

        // Add event listener for create campaign form
        const form = document.getElementById('createCampaignForm');
        if (form) {
            form.addEventListener('submit', handleCreateCampaign);
        }

        // Add event listener for upload button
        const uploadBtn = document.getElementById('uploadButton');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => {
                cloudinaryWidget.open();
            });
        }

        // Add event listener for logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', handleLogout);
        }

        console.log('Event listeners initialized successfully');
    } catch (error) {
        console.error('Error initializing event listeners:', error);
    }
}

// Load campaigns
async function loadCampaigns() {
    const campaignsContainer = document.getElementById('availableCampaigns');
    
    campaignsContainer.innerHTML = `
        <div class="loading-state">
            <i class='bx bx-loader-alt bx-spin'></i>
            <p>Loading campaigns...</p>
        </div>
    `;

    try {
        // Consulta única para todas las campañas que el usuario puede ver
        const query = db.collection('campaigns')
            .where('status', 'in', ['approved', 'pending'])
            .orderBy('createdAt', 'desc');

        // Escuchar cambios en tiempo real
        const unsubscribe = query.onSnapshot(snapshot => {
            updateCampaignsGrid(snapshot);
        }, error => {
            console.error('Error loading campaigns:', error);
            campaignsContainer.innerHTML = `
                <div class="error-state">
                    <i class='bx bx-error-circle'></i>
                    <p>Error loading campaigns. Please try again.</p>
                    <button onclick="loadCampaigns()">Retry</button>
                </div>
            `;
        });

        // Guardar la función de cancelación para limpiar el listener
        window.unsubscribeCampaigns = unsubscribe;
    } catch (error) {
        console.error('Error setting up campaigns listener:', error);
        campaignsContainer.innerHTML = `
            <div class="error-state">
                <i class='bx bx-error-circle'></i>
                <p>Error loading campaigns. Please try again.</p>
                <button onclick="loadCampaigns()">Retry</button>
            </div>
        `;
    }
}

// Función para actualizar el grid de campañas
function updateCampaignsGrid(snapshot) {
    const campaignsContainer = document.getElementById('availableCampaigns');
    let campaignsGrid = document.querySelector('.campaigns-grid');
    
    // Crear el grid si no existe
    if (!campaignsGrid) {
        campaignsGrid = document.createElement('div');
        campaignsGrid.className = 'campaigns-grid';
        campaignsContainer.innerHTML = '';
        campaignsContainer.appendChild(campaignsGrid);
    }

    // Limpiar el grid existente
    campaignsGrid.innerHTML = '';

    // Agregar las nuevas campañas
    snapshot.forEach(doc => {
        const campaign = {
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate() || new Date()
        };
        const campaignCard = createCampaignCard(doc.id, campaign);
        campaignCard.setAttribute('data-type', campaign.status);
        campaignsGrid.appendChild(campaignCard);
    });

    // Mostrar mensaje si no hay campañas
    if (campaignsGrid.children.length === 0) {
        campaignsContainer.innerHTML = `
            <div class="empty-state">
                <i class='bx bx-search-alt'></i>
                <p>No campaigns found</p>
            </div>
        `;
    }
}

function createCampaignCard(id, campaign) {
    const isOwner = campaign.createdBy === currentUser.uid;
    const progress = (campaign.verificationCount / campaign.accountCount) * 100;
    const countries = campaign.countries.join(', ');

    // Configurar el estado
    const statusConfig = {
        'pending': {
            class: 'status-pending',
            icon: 'bx-time-five',
            text: 'Pending'
        },
        'approved': {
            class: 'status-approved',
            icon: 'bx-check-circle',
            text: 'Approved'
        },
        'paused': {
            class: 'status-paused',
            icon: 'bx-pause-circle',
            text: 'Paused'
        },
        'completed': {
            class: 'status-completed',
            icon: 'bx-badge-check',
            text: 'Completed'
        },
        'rejected': {
            class: 'status-rejected',
            icon: 'bx-x-circle',
            text: 'Rejected'
        }
    };

    const statusInfo = statusConfig[campaign.status] || statusConfig.pending;

    const div = document.createElement('div');
    div.className = 'campaign-card';
    div.id = `campaign-${id}`;

    // Definir clases y textos para los diferentes estados

    div.innerHTML = `
        <div class="campaign-header">
            <h3>${campaign.name}</h3>
            <div class="campaign-status ${statusInfo.class}">
                <i class='bx ${statusInfo.icon}'></i>
                <span>${statusInfo.text}</span>
            </div>
            <p class="campaign-date">${formatDate(campaign.createdAt)}</p>
        </div>
        <div class="campaign-description">
            <p>${campaign.description}</p>
        </div>
        <div class="campaign-info">
            <div class="info-item">
                <i class='bx bx-globe'></i>
                <span>${countries}</span>
            </div>
            <div class="info-item">
                <i class='bx bx-user'></i>
                <span>${campaign.verificationCount}/${campaign.accountCount} Accounts</span>
            </div>
            <div class="info-item">
                <i class='bx bx-dollar-circle'></i>
                <span>${campaign.pricePerAccount} USDT per account</span>
            </div>
            <div class="info-item">
                <i class='bx bx-money'></i>
                <span>${campaign.totalPrice} USDT total</span>
            </div>
        </div>
        <div class="progress-bar">
            <div class="progress" style="width: ${progress}%"></div>
        </div>
        ${isOwner ? 
            `<button onclick="viewCampaign('${id}')" class="mt-2">
                <span>View Details</span>
                <i class='bx bx-right-arrow-alt'></i>
             </button>` :
            `<button onclick="joinCampaign('${id}')" class="mt-2">
                <span>Join Campaign</span>
                <i class='bx bx-right-arrow-alt'></i>
             </button>`
        }
    `;
    
    return div;
}

// View campaign details
function viewCampaign(id) {
    window.location.href = `campaign.html?id=${id}`;
}

// Join campaign
function joinCampaign(id) {
    window.location.href = `campaign.html?id=${id}&action=join`;
}

// Wait for auth to be ready
function waitForAuth() {
    return new Promise((resolve) => {
        if (window.currentUser) {
            resolve(window.currentUser);
        } else {
            auth.onAuthStateChanged((user) => {
                if (user) {
                    resolve(user);
                }
            });
        }
    });
}

// Initialize the dashboard
async function initializeDashboard() {
    try {
        // Initialize event listeners
        initializeEventListeners();

        // Check if user is logged in
        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                currentUser = user;
                loadCampaigns();

                // Escuchar cambios en el estado de conexión
                const unsubscribeConnection = db.collection('campaigns').onSnapshot(() => {
                    // Conexión establecida
                }, (error) => {
                    if (error.code === 'unavailable') {
                        showOfflineMessage();
                    }
                });

                // Guardar función para limpiar el listener
                window.unsubscribeCampaigns = unsubscribeConnection;
            } else {
                window.location.href = 'login.html';
            }
        });
    } catch (error) {
        console.error('Error initializing dashboard:', error);
    }
}

// Función para mostrar mensaje de offline
function showOfflineMessage() {
    const offlineMessage = document.createElement('div');
    offlineMessage.className = 'offline-message';
    offlineMessage.innerHTML = `
        <i class='bx bx-wifi-off'></i>
        <p>You are currently offline. Some features may be limited.</p>
    `;
    document.body.appendChild(offlineMessage);

    // Remover el mensaje después de 5 segundos
    setTimeout(() => {
        offlineMessage.remove();
    }, 5000);
}

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', initializeDashboard);

// Limpiar listeners cuando el usuario salga de la página
window.addEventListener('beforeunload', () => {
    if (window.unsubscribeCampaigns) {
        window.unsubscribeCampaigns();
    }
});
