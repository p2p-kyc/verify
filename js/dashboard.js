// Create campaign
async function handleCreateCampaign(event) {
    event.preventDefault();
    
    const name = document.getElementById('campaignName').value;
    const verificationLimit = parseInt(document.getElementById('verificationLimit').value);
    const price = parseFloat(document.getElementById('price').value);
    
    try {
        const campaign = {
            name,
            verificationLimit,
            price,
            createdBy: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'active',
            verificationCount: 0
        };
        
        await db.collection('campaigns').add(campaign);
        
        document.getElementById('createCampaignForm').reset();
        loadCampaigns();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// Load campaigns
async function loadCampaigns() {
    const campaignGrid = document.getElementById('campaignGrid');
    campaignGrid.innerHTML = '';
    
    try {
        const snapshot = await db.collection('campaigns')
            .where('status', '==', 'active')
            .where('verificationCount', '<', db.FieldPath.documentId('verificationLimit'))
            .orderBy('createdAt', 'desc')
            .get();
        
        snapshot.forEach(doc => {
            const campaign = doc.data();
            const card = createCampaignCard(doc.id, campaign);
            campaignGrid.appendChild(card);
        });
    } catch (error) {
        console.error('Error loading campaigns:', error);
    }
}

// Create campaign card
function createCampaignCard(id, campaign) {
    const div = document.createElement('div');
    div.className = 'campaign-card';
    
    const isOwner = campaign.createdBy === currentUser.uid;
    const progress = (campaign.verificationCount / campaign.verificationLimit) * 100;
    
    div.innerHTML = `
        <div class="campaign-header">
            <i class='bx bx-certification' style='color: var(--terminal-green);'></i>
            <h3>${campaign.name}</h3>
        </div>
        <div class="campaign-info">
            <div class="info-item">
                <i class='bx bx-dollar-circle'></i>
                <span>${campaign.price} USDT</span>
            </div>
            <div class="info-item">
                <i class='bx bx-check-circle'></i>
                <span>${campaign.verificationCount}/${campaign.verificationLimit} Verifications</span>
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
