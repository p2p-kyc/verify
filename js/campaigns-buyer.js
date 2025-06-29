// Esperar a que Firebase esté inicializado
window.addEventListener('load', () => {
    window.auth.onAuthStateChanged(async user => {
        if (!user) {
            console.log('[MyCampaigns] Usuario no autenticado, redirigiendo a index.html');
            redirectTo('index.html');
            return;
        }
        console.log('[MyCampaigns] Usuario autenticado:', user.uid, user.email);
        const campaignsDiv = document.getElementById('myCampaigns');
        campaignsDiv.innerHTML = '<div class="loading">Loading campaigns...</div>';
        try {
            const snapshot = await window.db.collection('campaigns')
                .where('createdBy', '==', user.uid)
                .orderBy('createdAt', 'desc')
                .get();
            console.log('[MyCampaigns] Campañas encontradas:', snapshot.size);
            if (snapshot.empty) {
                campaignsDiv.innerHTML = '<div class="no-data">You have not created any campaigns.</div>';
                return;
            }
            let active = 0, pending = 0, completed = 0;
            campaignsDiv.innerHTML = Array.from(snapshot.docs).map(doc => {
                const data = doc.data();
                console.log('[MyCampaigns] Campaña:', doc.id, data);
                if (data.status === 'active') active++;
                if (data.status === 'pending') pending++;
                if (data.status === 'completed') completed++;
                return `<div class="campaign-card ${data.status}">
                    <div class="campaign-header">
                        <div class="campaign-title">
                            <h3>${data.name || data.title}</h3>
                            <span class="status ${data.status}">${data.status}</span>
                        </div>
                    </div>
                    <div class="campaign-body">
                        <p class="description">${data.description || ''}</p>
                        <div class="campaign-stats">
                            <div class="stat"><i class='bx bx-map'></i> <span>${(data.countries && data.countries.join) ? data.countries.join(', ') : 'All Countries'}</span></div>
                            <div class="stat"><i class='bx bx-user'></i> <span>${data.accountCount || data.maxVerifiers} accounts</span></div>
                            <div class="stat"><i class='bx bx-dollar'></i> <span>${data.pricePerAccount || data.price || 0} USDT/account</span></div>
                            <div class="stat"><i class='bx bx-check-circle'></i> <span>${data.verificationCount || 0}/${data.accountCount || data.maxVerifiers} verified</span></div>
                        </div>
                    </div>
                </div>`;
            }).join('');
            document.getElementById('activeCount').textContent = active;
            document.getElementById('pendingCount').textContent = pending;
            document.getElementById('completedCount').textContent = completed;
        } catch (error) {
            console.error('[MyCampaigns] Error loading campaigns:', error);
            campaignsDiv.innerHTML = '<div class="error">Error loading campaigns.</div>';
        }
    });
});

// Escuchar cambios de autenticación
auth.onAuthStateChanged(user => {
    currentUser = user;
    if (!user) {
        redirectTo('index.html');
        return;
    }
    loadMyCampaigns();
});

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