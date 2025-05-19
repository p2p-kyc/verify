let campaignsTable;

// Initialize DataTable
function initializeDataTable() {
    campaignsTable = $('.data-table').DataTable({
        dom: 'Bfrtip',
        buttons: ['copy', 'csv', 'excel', 'pdf'],
        pageLength: 10,
        order: [[7, 'desc']], // Order by Created At column
        columns: [
            { data: 'select', orderable: false },
            { data: 'name' },
            { data: 'creator' },
            { data: 'accounts' },
            { data: 'price' },
            { data: 'status' },
            { data: 'proof', orderable: false },
            { data: 'createdAt' },
            { data: 'actions', orderable: false }
        ]
    });
}

// Load campaigns data
async function loadCampaigns() {
    try {
        const campaignsSnapshot = await window.db.collection('campaigns')
            .orderBy('createdAt', 'desc')
            .get();

        // Get all unique creator IDs
        const creatorIds = new Set();
        campaignsSnapshot.forEach(doc => {
            const campaign = doc.data();
            if (campaign.creatorId) creatorIds.add(campaign.creatorId);
        });

        // Fetch all creators' data in parallel
        const creatorsData = new Map();
        await Promise.all([...creatorIds].map(async (userId) => {
            const userDoc = await window.db.collection('users').doc(userId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                creatorsData.set(userId, {
                    name: userData.name || userData.email || 'Unknown',
                    email: userData.email || ''
                });
            }
        }));

        const campaigns = [];

        campaignsSnapshot.forEach(doc => {
            const campaign = doc.data();
            const creator = creatorsData.get(campaign.creatorId) || { name: 'Unknown', email: '' };
            
            campaigns.push({
                select: `<input type="checkbox" class="campaign-select" data-id="${doc.id}">`,
                name: campaign.name || 'Unnamed Campaign',
                creator: `<div class="creator-info">
                    <span class="creator-name">${creator.name}</span>
                    ${creator.email ? `<span class="creator-email">${creator.email}</span>` : ''}
                </div>`,
                accounts: campaign.accounts || 0,
                price: `${campaign.price?.toFixed(2) || '0.00'} USDT`,
                status: createStatusBadge(campaign.status || 'pending'),
                proof: campaign.paymentProof ? 
                    `<button class="view-proof-btn" onclick="viewPaymentProof('${campaign.paymentProof}')">View Proof</button>` : 
                    'No proof',
                createdAt: campaign.createdAt?.toDate().toLocaleString() || 'Unknown',
                actions: createActionButtons(doc.id, campaign.status || 'pending')
            });
        });

        // Clear and reload table data
        campaignsTable.clear();
        campaignsTable.rows.add(campaigns);
        campaignsTable.draw();

    } catch (error) {
        console.error('Error loading campaigns:', error);
        showNotification('Error loading campaigns', 'error');
    }
}

// Create status badge HTML
function createStatusBadge(status) {
    const statusColors = {
        pending: 'warning',
        active: 'success',
        completed: 'info',
        cancelled: 'danger'
    };
    return `<span class="status-badge ${statusColors[status] || 'default'}">${status}</span>`;
}

// Create action buttons HTML
function createActionButtons(campaignId, status) {
    if (status === 'pending') {
        return `
            <div class="action-buttons">
                <button onclick="approveCampaign('${campaignId}')" class="approve-btn">
                    <i class='bx bx-check'></i>
                </button>
                <button onclick="rejectCampaign('${campaignId}')" class="reject-btn">
                    <i class='bx bx-x'></i>
                </button>
            </div>
        `;
    }
    return `<span class="no-actions">No actions available</span>`;
}

// View payment proof in modal
async function viewPaymentProof(proofUrl) {
    try {
        const modal = document.getElementById('imageModal');
        const modalImg = document.getElementById('modalImage');
        const closeBtn = modal.querySelector('.close');

        // Get download URL from Firebase Storage
        const storageRef = firebase.storage().refFromURL(proofUrl);
        const url = await storageRef.getDownloadURL();

        modalImg.src = url;
        modal.style.display = 'block';

        // Close modal when clicking X
        closeBtn.onclick = () => modal.style.display = 'none';

        // Close modal when clicking outside
        window.onclick = (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        };
    } catch (error) {
        console.error('Error viewing payment proof:', error);
        alert('Error loading payment proof image');
    }
}

function createCampaignCard(id, campaign) {
    const card = document.createElement('div');
    card.className = 'campaign-card';
    card.innerHTML = `
        <div class="campaign-header">
            <h3>${campaign.name}</h3>
            <span class="status ${campaign.status}">${campaign.status}</span>
        </div>
        <div class="campaign-details">
            <p><strong>Accounts:</strong> ${campaign.accounts}</p>
            <p><strong>Price:</strong> ${campaign.price} USDT</p>
            <p><strong>Created:</strong> ${campaign.createdAt.toDate().toLocaleDateString()}</p>
            ${campaign.status === 'pending' ? `
                <div class="campaign-actions">
                    <button onclick="approveCampaign('${id}')" class="approve-btn">
                        <i class='bx bx-check'></i> Approve
                    </button>
                    <button onclick="rejectCampaign('${id}')" class="reject-btn">
                        <i class='bx bx-x'></i> Reject
                    </button>
                </div>
            ` : ''}
        </div>
    `;
    return card;
}

async function approveCampaign(campaignId) {
    try {
        await window.db.collection('campaigns').doc(campaignId).update({
            status: 'active',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Add activity log
        await window.db.collection('activity').add({
            type: 'campaign',
            title: 'Campaign Approved',
            description: `Campaign ${campaignId} has been approved`,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        loadCampaigns(); // Refresh the list
    } catch (error) {
        console.error('Error approving campaign:', error);
    }
}

async function rejectCampaign(campaignId) {
    try {
        await window.db.collection('campaigns').doc(campaignId).update({
            status: 'cancelled',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Add activity log
        await window.db.collection('activity').add({
            type: 'campaign',
            title: 'Campaign Rejected',
            description: `Campaign ${campaignId} has been rejected`,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        loadCampaigns(); // Refresh the list
    } catch (error) {
        console.error('Error rejecting campaign:', error);
    }
}

// Initialize campaigns page
window.auth.onAuthStateChanged(async (user) => {
    if (user) {
        // Check if user is admin
        const userDoc = await window.db.collection('users').doc(user.uid).get();
        if (!userDoc.exists || userDoc.data().role !== 'admin') {
            window.location.href = 'index.html';
            return;
        }

        // Initialize DataTable
        initializeDataTable();
        // Load initial data
        loadCampaigns();

        // Setup event listeners
        document.getElementById('refreshBtn')?.addEventListener('click', loadCampaigns);
        document.getElementById('selectAll')?.addEventListener('change', function() {
            const checkboxes = document.getElementsByClassName('campaign-select');
            Array.from(checkboxes).forEach(checkbox => {
                checkbox.checked = this.checked;
            });
        });

        // Setup filter handlers
        setupFilters();
    } else {
        window.location.href = 'index.html';
    }
});

// Setup filter handlers
function setupFilters() {
    const dateFilter = document.getElementById('dateFilter');
    const statusFilter = document.getElementById('statusFilter');
    const sortOrder = document.getElementById('sortOrder');

    dateFilter?.addEventListener('change', applyFilters);
    statusFilter?.addEventListener('change', applyFilters);
    sortOrder?.addEventListener('change', applyFilters);
}

// Apply filters to DataTable
function applyFilters() {
    const dateValue = document.getElementById('dateFilter').value;
    const statusValue = document.getElementById('statusFilter').value;
    const sortValue = document.getElementById('sortOrder').value;

    // Clear existing filters
    campaignsTable.search('');
    campaignsTable.columns().search('');

    // Apply date filter
    if (dateValue !== 'all') {
        const now = new Date();
        let filterDate = new Date();

        switch(dateValue) {
            case 'today':
                filterDate.setHours(0, 0, 0, 0);
                break;
            case 'week':
                filterDate.setDate(filterDate.getDate() - 7);
                break;
            case 'month':
                filterDate.setMonth(filterDate.getMonth() - 1);
                break;
        }

        campaignsTable.column(7).search(function(val) {
            const date = new Date(val);
            return date >= filterDate && date <= now;
        }, true, false);
    }

    // Apply status filter
    if (statusValue !== 'all') {
        campaignsTable.column(5).search(statusValue);
    }

    // Apply sorting
    switch(sortValue) {
        case 'newest':
            campaignsTable.order([7, 'desc']);
            break;
        case 'oldest':
            campaignsTable.order([7, 'asc']);
            break;
        case 'accounts':
            campaignsTable.order([3, 'desc']);
            break;
        case 'price':
            campaignsTable.order([4, 'desc']);
            break;
    }

    // Redraw table
    campaignsTable.draw();
}
