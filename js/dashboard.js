// Create campaign
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
            status: 'active'
        };
        
        await db.collection('campaigns').add(campaignData);
        
        // Limpiar el formulario y cerrar el modal
        document.getElementById('createCampaignForm').reset();
        closeCreateCampaignModal();
        
        // Recargar las campañas
        await loadCampaigns();
        
        // Mostrar mensaje de éxito
        alert('Campaign created successfully!');
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

// Add event listeners for calculation
document.getElementById('accountCount').addEventListener('input', calculateTotal);
document.getElementById('pricePerAccount').addEventListener('input', calculateTotal);

// Load campaigns
async function loadCampaigns() {
    const campaignsContainer = document.getElementById('availableCampaigns');
    campaignsContainer.innerHTML = '<div class="loading"><i class="bx bx-loader-alt bx-spin"></i></div>';
    
    try {
        const querySnapshot = await db.collection('campaigns')
            .orderBy('createdAt', 'desc')
            .get();
        
        campaignsContainer.innerHTML = '';
        
        if (querySnapshot.empty) {
            campaignsContainer.innerHTML = `
                <div class="empty-state">
                    <i class='bx bx-search-alt'></i>
                    <p>No campaigns available.</p>
                </div>
            `;
            return;
        }
        
        const campaignsGrid = document.createElement('div');
        campaignsGrid.className = 'campaigns-grid';
        
        querySnapshot.forEach((doc) => {
            const campaign = {
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate() || new Date()
            };
            const campaignCard = createCampaignCard(doc.id, campaign);
            campaignsGrid.appendChild(campaignCard);
        });
        
        campaignsContainer.appendChild(campaignsGrid);
    } catch (error) {
        console.error('Error loading campaigns:', error);
        campaignsContainer.innerHTML = `
            <div class="error-state">
                <i class='bx bx-error-circle'></i>
                <p>Error loading campaigns. Please try again.</p>
                <button onclick="loadCampaigns()">Retry</button>
            </div>
        `;
    }
}

// Create campaign card
function createCampaignCard(id, campaign) {
    const div = document.createElement('div');
    div.className = 'campaign-card';
    
    const isOwner = campaign.createdBy === currentUser.uid;
    const progress = (campaign.verificationCount / campaign.accountCount) * 100;
    const countries = campaign.countries.includes('all') ? 'All Countries' : campaign.countries.join(', ');
    
    div.innerHTML = `
        <div class="campaign-header">
            <i class='bx bx-certification' style='color: var(--terminal-green);'></i>
            <h3>${campaign.name}</h3>
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
    window.location.href = `/campaign.html?id=${id}`;
}

// Join campaign
function joinCampaign(id) {
    window.location.href = `/campaign.html?id=${id}&action=join`;
}

// Load campaigns when page loads
document.addEventListener('DOMContentLoaded', loadCampaigns);
