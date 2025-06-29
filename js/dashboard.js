// Function to format dates
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
// Function to convert image to Base64
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

// Function to preview image
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
            await window.db.collection('campaigns').doc(campaignId).update(campaignData);
            showToast('Campaign updated successfully');
        } else {
            // Create new campaign
            await window.db.collection('campaigns').add(campaignData);
            showToast('Campaign created successfully! Please wait for admin approval.');
        }
        
        // Reset form and close modal
        form.reset();
        form.removeAttribute('data-mode');
        form.removeAttribute('data-campaign-id');
        const proofBase64 = document.getElementById('paymentProofBase64');
        const proofPreview = document.getElementById('paymentProofPreview');
        const modalTitle = document.querySelector('.modal-title');
        const submitBtn = document.querySelector('.modal-submit-btn');

        if (proofBase64) proofBase64.value = '';
        if (proofPreview) proofPreview.innerHTML = '';
        if (modalTitle) modalTitle.textContent = 'Create Campaign';
        if (submitBtn) submitBtn.textContent = 'Create';
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
function calculateTotalPrice() {
    const accountCount = parseFloat(document.getElementById('accountCount').value) || 0;
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
            accountCountInput.addEventListener('input', calculateTotalPrice);
            pricePerAccountInput.addEventListener('input', calculateTotalPrice);
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
                    redirectTo('login.html');
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
        await updateCampaignsFeed(snapshot);
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
    await updateCampaignsFeed(snapshot);
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
    await updateCampaignsFeed(snapshot);
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
    // Actualizar contadores de campañas
    let activeCount = 0;
    let pendingCount = 0;
    let completedCount = 0;
    let cancelledCount = 0;
    snapshot.forEach(doc => {
        const campaign = doc.data();
        switch (campaign.status) {
            case 'active':
                activeCount++;
                break;
            case 'pending':
                pendingCount++;
                break;
            case 'completed':
                completedCount++;
                break;
            case 'cancelled':
                cancelledCount++;
                break;
        }
    });
    document.getElementById('activeCount').textContent = activeCount;
    document.getElementById('pendingCount').textContent = pendingCount;
    document.getElementById('completedCount').textContent = completedCount;

    // No limpiar aquí, solo al renderizar para evitar duplicados
    if (snapshot.empty) {
        const campaignsFeed = document.getElementById('availableCampaigns');
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

    // Calcular cuentas cobradas para cada campaña antes de renderizar
    Promise.all(campaigns.map(async c => {
        c.chargedAccounts = await getCuentasCobradas(c.id);
        console.log(`[updateCampaignsFeed] Campaña:`, c.id, c.name, `chargedAccounts:`, c.chargedAccounts, `accountCount:`, c.accountCount, c);
        return c;
    })).then(campaignsWithCharged => {
        const campaignsFeed = document.getElementById('availableCampaigns');
        campaignsFeed.innerHTML = '';
        campaignsWithCharged.forEach(campaign => {
            const card = createCampaignCard(campaign.id, campaign);
            if (card) {
                campaignsFeed.appendChild(card);
            }
        });
        console.log(`[updateCampaignsFeed] Rendered cards:`, campaignsWithCharged.length);
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

        // Calcular progreso real (cuentas cobradas)
        const charged = typeof campaign.chargedAccounts === 'number' ? campaign.chargedAccounts : (campaign.verificationCount || 0);
        const total = campaign.accountCount;

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
                        <span>${charged}/${total} paid</span>
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
    const existingMenu = document.querySelector('.campaign-menu');
    if (existingMenu) {
        existingMenu.remove();
        return;
    }

    const campaign = document.getElementById(`campaign-${id}`);
    if (!campaign) return;

    const menu = document.createElement('div');
    menu.className = 'campaign-menu';
    menu.innerHTML = `
        <button onclick="viewCampaign('${id}')">
            <i class='bx bx-show'></i>
            <span>View Details</span>
        </button>
        <button onclick="editCampaign('${id}')">
            <i class='bx bx-edit'></i>
            <span>Edit</span>
        </button>
        <button onclick="deleteCampaign('${id}')" class="delete-btn">
            <i class='bx bx-trash'></i>
            <span>Delete</span>
        </button>
    `;

    campaign.appendChild(menu);

    // Close menu when clicking outside
    document.addEventListener('click', function closeMenu(e) {
        if (!menu.contains(e.target) && !e.target.closest('.campaign-menu-btn')) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    });
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
        await loadCampaigns();
    } catch (error) {
        console.error('Error deleting campaign:', error);
        showToast('Error deleting campaign', 'error');
    }
}

// Join campaign
async function joinCampaign(id) {
    try {
        if (!window.currentUser) {
            showToast('Please log in to join campaigns', 'error');
            return;
        }
        const campaignRef = db.collection('campaigns').doc(id);
        const doc = await campaignRef.get();

        if (!doc.exists) {
            showToast('Campaign not found', 'error');
            return;
        }

        const campaign = doc.data();

        // Check if user is the campaign owner
        if (campaign.createdBy === window.currentUser?.uid) {
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
            .where('userId', '==', window.currentUser?.uid)
            .limit(1);

        const participantSnapshot = await participantRef.get();
        if (!participantSnapshot.empty) {
            showToast('You have already joined this campaign', 'error');
            return;
        }

        // Create participant document
        const participantData = {
            campaignId: id,
            userId: window.currentUser?.uid,
            userName: window.currentUser?.displayName || 'Unknown',
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

// View campaign
async function viewCampaign(id) {
    try {
        const campaignDoc = await window.db.collection('campaigns').doc(id).get();
        if (!campaignDoc.exists) {
            throw new Error('Campaign not found');
        }

        const campaign = { id: campaignDoc.id, ...campaignDoc.data() };
        const isCreator = campaign.createdBy === window.currentUser.uid;

        // Check if campaign is approved by admin
        if (campaign.status !== 'active') {
            showToast('This campaign is not approved by the administrator', 'error');
            return;
        }

        if (isCreator) {
            // Seller accesses chat if campaign is approved
            const requestsSnapshot = await window.db.collection('requests')
                .where('campaignId', '==', id)
                .where('status', '==', 'approved')
                .get();

            if (requestsSnapshot.empty) {
                showToast('No active sellers in this campaign', 'info');
                return;
            }

            // Take the first request
            const requestDoc = requestsSnapshot.docs[0];
            redirectTo(`chat-comprador.html?requestId=${requestDoc.id}`);
        } else {
            // Check if a request already exists for this user and campaign
            const existingRequest = await window.db.collection('requests')
                .where('campaignId', '==', id)
                .where('userId', '==', window.currentUser.uid)
                .get();

            let requestId;

            if (!existingRequest.empty) {
                // If a request already exists, use that one
                requestId = existingRequest.docs[0].id;
            } else {
                // Create a new request and chat
                const requestData = {
                    campaignId: id,
                    userId: window.currentUser.uid,
                    status: 'approved', // Automatically approved
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                // Create the request
                const requestRef = await window.db.collection('requests').add(requestData);
                requestId = requestRef.id;

                // Create the first chat message
                const messageData = {
                    text: 'Hello! I am interested in participating in this campaign.',
                    userId: window.currentUser.uid,
                    type: 'text',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                // Add the message to the request's messages collection
                await requestRef.collection('messages').add(messageData);
            }

            // Redirect to seller chat
            redirectTo(`chat-vendedor.html?requestId=${requestId}`);
        }

        // Get participants
        const participantsSnapshot = await window.db.collection('participants')
            .where('campaignId', '==', id)
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

// Get Firebase instance from window
let unsubscribeConnection = null;

// Initialize the dashboard
async function initializeDashboard() {
    try {
        // Initialize event listeners
        initializeEventListeners();

        // Listen for Firestore connection changes
        window.addEventListener('firestoreConnectionChange', (event) => {
            if (event.detail.isConnected) {
                // Remove offline message if it exists
                const existingMessage = document.querySelector('.offline-message');
                if (existingMessage) {
                    existingMessage.remove();
                }
            } else {
                showOfflineMessage();
            }
        });

        // Check if user is logged in
        const unsubscribeAuth = firebase.auth().onAuthStateChanged(async (user) => {
            window.currentUser = user;
            if (user) {
                // Set up campaigns listener with error handling and retry
                const setupCampaignsListener = async (retryCount = 0) => {
                    try {
                        if (window.unsubscribeCampaigns) {
                            window.unsubscribeCampaigns();
                        }

                        // Show all campaigns by default
                        window.unsubscribeCampaigns = window.db.collection('campaigns')
                            .orderBy('createdAt', 'desc')
                            .onSnapshot(
                                { includeMetadataChanges: true },
                                (snapshot) => {
                                    if (!snapshot.metadata.fromCache) {
                                        updateCampaignsFeed(snapshot);
                                    }
                                },
                                async (error) => {
                                    console.error('Error in campaigns listener:', error);
                                    if (error.code === 'unavailable' && retryCount < 3) {
                                        showOfflineMessage();
                                        // Exponential backoff for retries
                                        const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
                                        await new Promise(resolve => setTimeout(resolve, delay));
                                        setupCampaignsListener(retryCount + 1);
                                    }
                                }
                            );
                    } catch (error) {
                        console.error('Error setting up campaigns listener:', error);
                        showOfflineMessage();
                    }
                };

                await setupCampaignsListener();
            } else {
                // Clean up listeners
                if (window.unsubscribeCampaigns) {
                    window.unsubscribeCampaigns();
                    window.unsubscribeCampaigns = null;
                }
                redirectTo('login.html');
            }
        });

        // Clean up listeners on unmount
        window.addEventListener('beforeunload', () => {
            unsubscribeAuth();
            if (window.unsubscribeCampaigns) {
                window.unsubscribeCampaigns();
            }
        });
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showOfflineMessage();
    }
}

// Function to show offline message
function showOfflineMessage() {
    const offlineMessage = document.createElement('div');
    offlineMessage.className = 'offline-message';
    offlineMessage.innerHTML = `
        <i class='bx bx-wifi-off'></i>
        <p>You are currently offline. Some features may be limited.</p>
    `;
    document.body.appendChild(offlineMessage);

    // Remove the message after 5 seconds
    setTimeout(() => {
        offlineMessage.remove();
    }, 5000);
}

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', initializeDashboard);

// Clean up listeners when user leaves the page
window.addEventListener('beforeunload', () => {
    if (window.unsubscribeCampaigns) {
        window.unsubscribeCampaigns();
    }
});

function applyDashboardFilter(status) {
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.status === status);
    });
    let query = window.db.collection('campaigns').orderBy('createdAt', 'desc');
    if (status && status !== 'all') {
        query = query.where('status', '==', status);
    }
    query.get().then(snapshot => {
        updateCampaignsFeed(snapshot);
    });
}

async function getCuentasCobradas(campaignId) {
    try {
        if (!campaignId) return 0;
        const [approvedRequests, paidRequests] = await Promise.all([
            db.collection('payment_requests').where('campaignId', '==', campaignId).where('status', '==', 'approved').get(),
            db.collection('payment_requests').where('campaignId', '==', campaignId).where('status', '==', 'paid').get()
        ]);
        let total = 0;
        if (approvedRequests && !approvedRequests.empty) {
            approvedRequests.forEach(doc => {
                const data = doc.data();
                if (data && typeof data.accountsRequested === 'number') {
                    total += data.accountsRequested;
                    console.log(`[getCuentasCobradas][${campaignId}] Approved:`, data.accountsRequested, data);
                } else {
                    total += 1;
                    console.warn(`[getCuentasCobradas][${campaignId}] Approved request without accountsRequested:`, doc.id);
                }
            });
        }
        if (paidRequests && !paidRequests.empty) {
            paidRequests.forEach(doc => {
                const data = doc.data();
                if (data && typeof data.accountsRequested === 'number') {
                    total += data.accountsRequested;
                    console.log(`[getCuentasCobradas][${campaignId}] Paid:`, data.accountsRequested, data);
                } else {
                    total += 1;
                    console.warn(`[getCuentasCobradas][${campaignId}] Paid request without accountsRequested:`, doc.id);
                }
            });
        }
        console.log(`[getCuentasCobradas][${campaignId}] TOTAL CHARGED:`, total);
        return total;
    } catch (e) { console.error(`[getCuentasCobradas][${campaignId}] ERROR:`, e); return 0; }
}

// Mobile sidebar functions
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    if (sidebar.classList.contains('show')) {
        closeSidebar();
    } else {
        openSidebar();
    }
}

function openSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    sidebar.classList.add('show');
    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    sidebar.classList.remove('show');
    overlay.classList.remove('show');
    document.body.style.overflow = '';
}

// Close sidebar when clicking on a link (mobile)
document.addEventListener('DOMContentLoaded', () => {
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    sidebarLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                closeSidebar();
            }
        });
    });
});
