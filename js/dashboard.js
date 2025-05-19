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
        const form = event.target;
        const isEditMode = form.dataset.mode === 'edit';
        const campaignId = form.dataset.campaignId;

        // Get form data
        const name = document.getElementById('campaignName').value;
        const description = document.getElementById('description').value;
        const countriesSelect = document.getElementById('countries');
        const countries = Array.from(countriesSelect.selectedOptions).map(option => option.value);
        const accountCount = parseInt(document.getElementById('accountCount').value);
        const pricePerAccount = parseFloat(document.getElementById('pricePerAccount').value);
        const totalPrice = parseFloat(document.getElementById('totalPrice').value);
        const paymentProofBase64 = document.getElementById('paymentProofBase64').value;

        // Validate form data
        if (!name || !description || countries.length === 0 || !accountCount || !pricePerAccount) {
            throw new Error('Please fill in all required fields');
        }

        if (!isEditMode && !paymentProofBase64) {
            throw new Error('Please select a payment proof screenshot');
        }
        
        const campaignData = {
            name,
            description,
            countries,
            accountCount,
            pricePerAccount,
            totalPrice,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (!isEditMode) {
            // Add additional fields for new campaign
            Object.assign(campaignData, {
                verificationCount: 0,
                createdBy: currentUser.uid,
                creatorName: currentUser.displayName || 'Unknown',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'pending',
                paymentProofBase64,
                paymentStatus: 'pending'
            });
        }
        
        if (isEditMode) {
            // Update existing campaign
            await db.collection('campaigns').doc(campaignId).update(campaignData);
            showToast('Campaign updated successfully');
        } else {
            // Create new campaign
            await db.collection('campaigns').add(campaignData);
            showToast('Campaign created successfully! Please wait for admin approval.');
        }
        
        // Reset form and close modal
        form.reset();
        form.removeAttribute('data-mode');
        form.removeAttribute('data-campaign-id');
        document.getElementById('paymentProofBase64').value = '';
        document.getElementById('paymentProofPreview').innerHTML = '';
        document.querySelector('.modal-title').textContent = 'Create Campaign';
        document.querySelector('.modal-submit-btn').textContent = 'Create';
        closeCreateCampaignModal();
        
        // Reload campaigns
        await loadCampaigns();
    } catch (error) {
        console.error('Error handling campaign:', error);
        showToast(error.message, 'error');
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
        // Search functionality
        const searchInput = document.getElementById('searchCampaigns');
        if (searchInput) {
            searchInput.addEventListener('input', debounce(handleSearch, 300));
        }

        // Filter buttons
        const filterButtons = document.querySelectorAll('.filter-btn');
        filterButtons.forEach(button => {
            button.addEventListener('click', () => handleFilter(button.dataset.status));
        });

        // Sidebar links
        const sidebarLinks = document.querySelectorAll('.sidebar-link');
        sidebarLinks.forEach(link => {
            link.addEventListener('click', () => handleSidebarFilter(link));
        });

        // Create campaign form and modal
        const createCampaignForm = document.getElementById('createCampaignForm');
        const createCampaignButton = document.getElementById('createCampaignBtn');
        const closeModalButton = document.querySelector('.close-btn');
        const modal = document.getElementById('createCampaignModal');

        if (createCampaignForm) {
            createCampaignForm.addEventListener('submit', handleCreateCampaign);
        }

        if (createCampaignButton) {
            createCampaignButton.addEventListener('click', openCreateCampaignModal);
        }

        if (closeModalButton && modal) {
            closeModalButton.addEventListener('click', () => {
                modal.style.display = 'none';
                document.body.style.overflow = 'auto';
            });

            // Close modal when clicking outside
            window.addEventListener('click', (event) => {
                if (event.target === modal) {
                    modal.style.display = 'none';
                    document.body.style.overflow = 'auto';
                }
            });
        }

        // Calculate total price when inputs change
        const accountCountInput = document.getElementById('accountCount');
        const pricePerAccountInput = document.getElementById('pricePerAccount');

        if (accountCountInput && pricePerAccountInput) {
            accountCountInput.addEventListener('input', calculateTotal);
            pricePerAccountInput.addEventListener('input', calculateTotal);
        }

        // Payment proof upload
        const paymentProofInput = document.getElementById('paymentProof');
        if (paymentProofInput) {
            paymentProofInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        const base64 = await convertToBase64(file);
                        document.getElementById('paymentProofBase64').value = base64;
                        previewImage(file);
                    } catch (error) {
                        alert(error.message);
                        paymentProofInput.value = '';
                    }
                }
            });
        }

        // Logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                auth.signOut().then(() => {
                    window.location.href = 'login.html';
                });
            });
        }

        console.log('Event listeners initialized successfully');
    } catch (error) {
        console.error('Error initializing event listeners:', error);
    }
}

async function loadCampaigns() {
    try {
        const campaignsContainer = document.getElementById('availableCampaigns');
        
        campaignsContainer.innerHTML = `
            <div class="loading-state">
                <i class='bx bx-loader-alt bx-spin'></i>
                <p>Loading campaigns...</p>
            </div>
        `;

        const campaignsRef = db.collection('campaigns');
        const snapshot = await campaignsRef.orderBy('createdAt', 'desc').get();

        // Update campaign counts
        let activeCount = 0;
        let pendingCount = 0;
        let completedCount = 0;

        snapshot.forEach(doc => {
            const campaign = doc.data();
            switch(campaign.status) {
                case 'active':
                    activeCount++;
                    break;
                case 'pending':
                    pendingCount++;
                    break;
                case 'completed':
                    completedCount++;
                    break;
            }
        });

        // Update stats in sidebar
        document.getElementById('activeCount').textContent = activeCount;
        document.getElementById('pendingCount').textContent = pendingCount;
        document.getElementById('completedCount').textContent = completedCount;

        // Update campaigns feed
        updateCampaignsFeed(snapshot);
    } catch (error) {
        console.error('Error loading campaigns:', error);
        const campaignsContainer = document.getElementById('availableCampaigns');
        campaignsContainer.innerHTML = `
            <div class="error-state">
                <i class='bx bx-error-circle'></i>
                <p>Error loading campaigns. Please try again.</p>
                <button onclick="loadCampaigns()">Retry</button>
            </div>
        `;
    }
}

// Helper function for debouncing
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Handle search input
async function handleSearch(e) {
    const searchTerm = e.target.value.toLowerCase();
    const campaignsRef = db.collection('campaigns');
    let query = campaignsRef.orderBy('createdAt', 'desc');

    if (searchTerm) {
        query = query.where('name', '>=', searchTerm)
                     .where('name', '<=', searchTerm + '\uf8ff');
    }

    const snapshot = await query.get();
    updateCampaignsFeed(snapshot);
}

// Handle filter button clicks
async function handleFilter(status) {
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.status === status);
    });

    const campaignsRef = db.collection('campaigns');
    let query = campaignsRef.orderBy('createdAt', 'desc');

    if (status !== 'all') {
        query = query.where('status', '==', status);
    }

    const snapshot = await query.get();
    updateCampaignsFeed(snapshot);
}

// Handle sidebar filter clicks
async function handleSidebarFilter(link) {
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    sidebarLinks.forEach(l => l.classList.remove('active'));
    link.classList.add('active');

    const status = link.dataset.status;
    await handleFilter(status);
}

// Share campaign
async function shareCampaign(id) {
    const url = `${window.location.origin}/campaign.html?id=${id}`;
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Check out this campaign',
                text: 'Join this KYC P2P campaign',
                url: url
            });
        } catch (error) {
            console.error('Error sharing:', error);
            await copyToClipboard(url);
        }
    } else {
        await copyToClipboard(url);
    }
}

// Copy to clipboard helper
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Campaign link copied to clipboard!');
    } catch (error) {
        console.error('Error copying to clipboard:', error);
        showToast('Error copying link');
    }
}

// Show toast message
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class='bx ${type === 'success' ? 'bx-check' : 'bx-x'}'></i>
        <span>${message}</span>
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }, 100);
}

// Save campaign
async function saveCampaign(id) {
    try {
        const userRef = db.collection('users').doc(currentUser.uid);
        const userDoc = await userRef.get();
        
        if (!userDoc.exists) {
            await userRef.set({
                savedCampaigns: [id],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            const savedCampaigns = userDoc.data().savedCampaigns || [];
            if (savedCampaigns.includes(id)) {
                await userRef.update({
                    savedCampaigns: firebase.firestore.FieldValue.arrayRemove(id)
                });
                showToast('Campaign removed from saved');
            } else {
                await userRef.update({
                    savedCampaigns: firebase.firestore.FieldValue.arrayUnion(id)
                });
                showToast('Campaign saved successfully!');
            }
        }

        // Update UI to reflect changes
        const saveBtn = document.querySelector(`[data-campaign-id="${id}"] .save-btn`);
        if (saveBtn) {
            const isSaved = saveBtn.classList.contains('saved');
            saveBtn.classList.toggle('saved');
            saveBtn.querySelector('i').className = `bx ${isSaved ? 'bx-bookmark' : 'bx-bookmark-heart'}`;
        }
    } catch (error) {
        console.error('Error saving campaign:', error);
        showToast('Error saving campaign', 'error');
    }
}

// Check if user is owner of campaign
function isOwner(campaign) {
    return window.currentUser && campaign.createdBy === window.currentUser.uid;
}

// Update campaigns feed
async function updateCampaignsFeed(snapshot) {
    const campaignsFeed = document.getElementById('availableCampaigns');
    campaignsFeed.innerHTML = '';

    if (snapshot.empty) {
        campaignsFeed.innerHTML = `
            <div class="empty-state">
                <i class='bx bx-search'></i>
                <p>No campaigns found</p>
            </div>
        `;
        return;
    }

    // Sort campaigns by createdAt in descending order
    const campaigns = [];
    snapshot.forEach(doc => campaigns.push({ id: doc.id, ...doc.data() }));
    campaigns.sort((a, b) => {
        const dateA = a.createdAt?.toMillis() || 0;
        const dateB = b.createdAt?.toMillis() || 0;
        return dateB - dateA;
    });

    campaigns.forEach(campaign => {
        const card = createCampaignCard(campaign.id, campaign);
        if (card) {
            campaignsFeed.appendChild(card);
        }
    });
}

function createCampaignCard(id, campaign) {
    if (!id || !campaign) {
        console.error('Invalid campaign data');
        return null;
    }

    try {
        const card = document.createElement('div');
        card.className = 'campaign-card';

        // Sanitize data to prevent XSS
        const sanitize = (str) => {
            if (!str && str !== 0) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        // Check campaign ownership
        const ownerStatus = window.currentUser && campaign.createdBy === window.currentUser.uid;
        const isActive = campaign.status === 'active';
        const isSaved = campaign.saved || false;

        // Build card HTML
        card.innerHTML = `
            <div class="campaign-header">
                <div class="campaign-title">
                    <h3>${sanitize(campaign.name)}</h3>
                    <span class="status ${sanitize(campaign.status)}">${sanitize(campaign.status)}</span>
                </div>
                ${ownerStatus ? `
                    <div class="campaign-menu">
                        <button class="menu-btn" onclick="toggleCampaignMenu('${sanitize(id)}')">
                            <i class='bx bx-dots-vertical-rounded'></i>
                        </button>
                        <div class="menu-dropdown" id="menu-${sanitize(id)}">
                            <button onclick="editCampaign('${sanitize(id)}')">
                                <i class='bx bx-edit'></i>
                                <span>Edit</span>
                            </button>
                            <button onclick="deleteCampaign('${sanitize(id)}')">
                                <i class='bx bx-trash'></i>
                                <span>Delete</span>
                            </button>
                        </div>
                    </div>
                ` : ''}
            </div>
            <div class="campaign-body">
                <p class="description">${sanitize(campaign.description)}</p>
                <div class="campaign-stats">
                    <div class="stat">
                        <i class='bx bx-map'></i>
                        <span>${sanitize(campaign.countries?.join(', ') || 'All Countries')}</span>
                    </div>
                    <div class="stat">
                        <i class='bx bx-user'></i>
                        <span>${sanitize(campaign.accountCount)} accounts</span>
                    </div>
                    <div class="stat">
                        <i class='bx bx-dollar'></i>
                        <span>${sanitize(campaign.pricePerAccount)} USDT/account</span>
                    </div>
                    <div class="stat">
                        <i class='bx bx-check-circle'></i>
                        <span>${sanitize(campaign.verificationCount || 0)}/${sanitize(campaign.accountCount)} verified</span>
                    </div>
                </div>
            </div>
            <div class="campaign-footer">
                <div class="campaign-meta">
                    <div class="creator">
                        <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${sanitize(campaign.createdBy)}" alt="Creator" class="avatar">
                        <span>${sanitize(campaign.creatorName || 'Unknown')}</span>
                    </div>
                    <span class="date">${formatDate(campaign.createdAt)}</span>
                </div>
                <div class="campaign-actions">
                    <button class="share-btn" onclick="shareCampaign('${sanitize(id)}')">
                        <i class='bx bx-share'></i>
                        <span>Share</span>
                    </button>
                    <button class="save-btn ${isSaved ? 'saved' : ''}" onclick="saveCampaign('${sanitize(id)}')">
                        <i class='bx ${isSaved ? 'bx-bookmark-heart' : 'bx-bookmark'}'></i>
                        <span>${isSaved ? 'Saved' : 'Save'}</span>
                    </button>
                    ${!ownerStatus && isActive ? `
                        <button class="join-btn" onclick="joinCampaign('${sanitize(id)}')">
                            <i class='bx bx-right-arrow-alt'></i>
                            <span>Join</span>
                        </button>
                    ` : ''}
                    <button class="view-btn" onclick="viewCampaign('${sanitize(id)}')">
                        <i class='bx bx-show'></i>
                        <span>View</span>
                    </button>
                </div>
            </div>
        `;

        return card;
    } catch (error) {
        console.error('Error creating campaign card:', error);
        return null;
    }
}
// Toggle campaign menu
function toggleCampaignMenu(id) {
    const menu = document.getElementById(`menu-${id}`);
    const isVisible = menu.style.display === 'block';
    menu.style.display = isVisible ? 'none' : 'block';
}

// Edit campaign
async function editCampaign(id) {
    try {
        const doc = await db.collection('campaigns').doc(id).get();
        if (!doc.exists) {
            showToast('Campaign not found', 'error');
            return;
        }

        const campaign = doc.data();
        if (campaign.createdBy !== currentUser.uid) {
            showToast('You do not have permission to edit this campaign', 'error');
            return;
        }

        // Populate modal with campaign data
        document.getElementById('campaignName').value = campaign.name;
        document.getElementById('description').value = campaign.description;
        document.getElementById('accountCount').value = campaign.accountCount;
        document.getElementById('pricePerAccount').value = campaign.pricePerAccount;
        document.getElementById('totalPrice').value = campaign.totalPrice;

        // Set selected countries
        const countriesSelect = document.getElementById('countries');
        Array.from(countriesSelect.options).forEach(option => {
            option.selected = campaign.countries.includes(option.value);
        });

        // Show payment proof preview if exists
        if (campaign.paymentProofBase64) {
            document.getElementById('paymentProofBase64').value = campaign.paymentProofBase64;
            document.getElementById('paymentProofPreview').innerHTML = `
                <div class="preview-container">
                    <img src="${campaign.paymentProofBase64}" alt="Payment proof preview">
                </div>
            `;
        }

        // Update form for edit mode
        const form = document.getElementById('createCampaignForm');
        form.dataset.mode = 'edit';
        form.dataset.campaignId = id;

        // Update modal title and button
        document.querySelector('.modal-title').textContent = 'Edit Campaign';
        document.querySelector('.modal-submit-btn').textContent = 'Save Changes';

        // Show modal
        openCreateCampaignModal();
    } catch (error) {
        console.error('Error editing campaign:', error);
        showToast('Error editing campaign', 'error');
    }
}

// Delete campaign
async function deleteCampaign(id) {
    if (!confirm('Are you sure you want to delete this campaign? This action cannot be undone.')) {
        return;
    }

    try {
        const doc = await db.collection('campaigns').doc(id).get();
        if (!doc.exists) {
            showToast('Campaign not found', 'error');
            return;
        }

        const campaign = doc.data();
        if (campaign.createdBy !== currentUser.uid) {
            showToast('You do not have permission to delete this campaign', 'error');
            return;
        }

        await db.collection('campaigns').doc(id).delete();

        // Remove campaign card from UI
        const card = document.querySelector(`[data-campaign-id="${id}"]`);
        if (card) {
            card.remove();
        }

        showToast('Campaign deleted successfully');

        // Refresh campaigns to update counts
        loadCampaigns();
    } catch (error) {
        console.error('Error deleting campaign:', error);
        showToast('Error deleting campaign', 'error');
    }
}

// Join campaign
async function joinCampaign(id) {
    try {
        const campaignRef = db.collection('campaigns').doc(id);
        const doc = await campaignRef.get();

        if (!doc.exists) {
            showToast('Campaign not found', 'error');
            return;
        }

        const campaign = doc.data();

        // Check if user is the campaign owner
        if (campaign.createdBy === currentUser.uid) {
            showToast('You cannot join your own campaign', 'error');
            return;
        }

        // Check if campaign is active
        if (campaign.status !== 'active') {
            showToast('This campaign is not active', 'error');
            return;
        }

        // Check if campaign is full
        if (campaign.verificationCount >= campaign.accountCount) {
            showToast('This campaign is already full', 'error');
            return;
        }

        // Check if user has already joined
        const participantRef = db.collection('participants')
            .where('campaignId', '==', id)
            .where('userId', '==', currentUser.uid)
            .limit(1);

        const participantSnapshot = await participantRef.get();
        if (!participantSnapshot.empty) {
            showToast('You have already joined this campaign', 'error');
            return;
        }

        // Create participant document
        const participantData = {
            campaignId: id,
            userId: currentUser.uid,
            userName: currentUser.displayName || 'Unknown',
            status: 'pending',
            joinedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        // Add participant and increment verification count
        await db.runTransaction(async (transaction) => {
            const campaignDoc = await transaction.get(campaignRef);
            if (!campaignDoc.exists) {
                throw new Error('Campaign no longer exists');
            }

            const updatedCount = campaignDoc.data().verificationCount + 1;
            if (updatedCount > campaignDoc.data().accountCount) {
                throw new Error('Campaign is already full');
            }

            // Create new participant
            const newParticipantRef = db.collection('participants').doc();
            transaction.set(newParticipantRef, participantData);

            // Update campaign verification count
            transaction.update(campaignRef, {
                verificationCount: updatedCount
            });

            // Add activity record
            const activityRef = db.collection('activity').doc();
            transaction.set(activityRef, {
                type: 'join',
                userId: currentUser.uid,
                userName: currentUser.displayName || 'Unknown',
                campaignId: id,
                campaignName: campaign.name,
                message: `You joined the campaign "${campaign.name}"`,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        });

        showToast('Successfully joined campaign');

        // Reload campaigns to update UI
        await loadCampaigns();
    } catch (error) {
        console.error('Error joining campaign:', error);
        showToast(error.message, 'error');
    }
}

// View campaign details
async function viewCampaign(id) {
    try {
        const doc = await db.collection('campaigns').doc(id).get();
        if (!doc.exists) {
            showToast('Campaign not found', 'error');
            return;
        }

        const campaign = doc.data();
        
        // Get participants
        const participantsSnapshot = await db.collection('participants')
            .where('campaignId', '==', id)
            .orderBy('joinedAt', 'desc')
            .get();

        const participants = [];
        participantsSnapshot.forEach(doc => {
            participants.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Create modal content
        const modalContent = `
            <div class="campaign-details-modal">
                <div class="modal-header">
                    <h2>${campaign.name}</h2>
                    <button class="close-btn">
                        <i class='bx bx-x'></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="campaign-info">
                        <div class="info-section">
                            <h3>Description</h3>
                            <p>${campaign.description}</p>
                        </div>
                        <div class="info-section">
                            <h3>Details</h3>
                            <div class="details-grid">
                                <div class="detail-item">
                                    <i class='bx bx-user'></i>
                                    <span>Accounts</span>
                                    <strong>${campaign.verificationCount}/${campaign.accountCount}</strong>
                                </div>
                                <div class="detail-item">
                                    <i class='bx bx-dollar'></i>
                                    <span>Price per Account</span>
                                    <strong>${campaign.pricePerAccount} USDT</strong>
                                </div>
                                <div class="detail-item">
                                    <i class='bx bx-money'></i>
                                    <span>Total Price</span>
                                    <strong>${campaign.totalPrice} USDT</strong>
                                </div>
                                <div class="detail-item">
                                    <i class='bx bx-globe'></i>
                                    <span>Countries</span>
                                    <strong>${campaign.countries.join(', ')}</strong>
                                </div>
                            </div>
                        </div>
                        ${participants.length > 0 ? `
                            <div class="info-section">
                                <h3>Participants (${participants.length})</h3>
                                <div class="participants-list">
                                    ${participants.map(p => `
                                        <div class="participant-item">
                                            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${p.userName}" alt="${p.userName}" class="avatar">
                                            <div class="participant-info">
                                                <span class="name">${p.userName}</span>
                                                <span class="joined-at">Joined ${formatDate(p.joinedAt)}</span>
                                            </div>
                                            <span class="status ${p.status}">${p.status}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                        ${campaign.paymentProofBase64 ? `
                            <div class="info-section">
                                <h3>Payment Proof</h3>
                                <div class="payment-proof">
                                    <img src="${campaign.paymentProofBase64}" alt="Payment proof">
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="close-btn secondary">Close</button>
                    ${!isOwner && campaign.status === 'active' ? `
                        <button class="join-btn primary" onclick="joinCampaign('${id}')">
                            <i class='bx bx-right-arrow-alt'></i>
                            Join Campaign
                        </button>
                    ` : ''}
                </div>
            </div>
        `;

        // Create modal container
        const modalContainer = document.createElement('div');
        modalContainer.className = 'modal-container';
        modalContainer.innerHTML = modalContent;
        document.body.appendChild(modalContainer);

        // Add event listeners
        const closeButtons = modalContainer.querySelectorAll('.close-btn');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                modalContainer.remove();
            });
        });

        // Close on outside click
        modalContainer.addEventListener('click', (e) => {
            if (e.target === modalContainer) {
                modalContainer.remove();
            }
        });

        // Show modal with animation
        setTimeout(() => modalContainer.classList.add('show'), 10);
    } catch (error) {
        console.error('Error viewing campaign:', error);
        showToast('Error loading campaign details', 'error');
    }
}

// Format date helper function
function formatDate(timestamp) {
    if (!timestamp) return 'Unknown';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000); // Difference in seconds

    if (diff < 60) {
        return 'Just now';
    } else if (diff < 3600) {
        const minutes = Math.floor(diff / 60);
        return `${minutes}m ago`;
    } else if (diff < 86400) {
        const hours = Math.floor(diff / 3600);
        return `${hours}h ago`;
    } else if (diff < 604800) {
        const days = Math.floor(diff / 86400);
        return `${days}d ago`;
    } else {
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }
}

// Show toast notification
function showToast(message, type = 'success') {
    // Remove existing toast if any
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <i class='bx ${type === 'success' ? 'bx-check' : 'bx-x'}'></i>
            <span>${message}</span>
        </div>
        <div class="toast-progress"></div>
    `;

    // Add toast to document
    document.body.appendChild(toast);

    // Show toast with animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto hide after 3 seconds
    const hideTimeout = setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);

    // Allow manual close
    toast.addEventListener('click', () => {
        clearTimeout(hideTimeout);
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
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

                // Listen for connection changes
                const unsubscribeConnection = db.collection('campaigns').onSnapshot(() => {
                    // Connection established
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
