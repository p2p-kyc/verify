// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// DOM Elements
const totalCampaignsEl = document.getElementById('totalCampaigns');
const totalRevenueEl = document.getElementById('totalRevenue');
const activeUsersEl = document.getElementById('activeUsers');
const successRateEl = document.getElementById('successRate');
const recentActivityEl = document.getElementById('recentActivity');
const revenueChartEl = document.getElementById('revenueChart');
const campaignStatusChartEl = document.getElementById('campaignStatusChart');

// Charts
let revenueChart;
let campaignStatusChart;

// Authentication State Observer
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // Check if user is admin
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists || userDoc.data().role !== 'admin') {
            window.location.href = 'index.html';
            return;
        }
        initializeDashboard();
    } else {
        window.location.href = 'index.html';
    }
});

// Initialize Dashboard
async function initializeDashboard() {
    await Promise.all([
        loadStats(),
        loadRecentActivity(),
        initializeCharts()
    ]);
}

// Load Statistics
async function loadStats() {
    try {
        // Get campaigns stats
        const campaignsSnapshot = await db.collection('campaigns').get();
        const totalCampaigns = campaignsSnapshot.size;
        let totalRevenue = 0;
        let successfulCampaigns = 0;

        campaignsSnapshot.forEach(doc => {
            const campaign = doc.data();
            if (campaign.status === 'completed') {
                totalRevenue += campaign.price || 0;
                successfulCampaigns++;
            }
        });

        // Get active users count
        const usersSnapshot = await db.collection('users')
            .where('lastActive', '>', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
            .get();
        const activeUsers = usersSnapshot.size;

        // Update UI
        totalCampaignsEl.textContent = totalCampaigns;
        totalRevenueEl.textContent = `${totalRevenue.toFixed(2)} USDT`;
        activeUsersEl.textContent = activeUsers;
        successRateEl.textContent = totalCampaigns > 0 
            ? `${((successfulCampaigns / totalCampaigns) * 100).toFixed(1)}%` 
            : '0%';

        // Update change indicators (mock data for now)
        document.getElementById('campaignsChange').textContent = '+12%';
        document.getElementById('revenueChange').textContent = '+8.5%';
        document.getElementById('usersChange').textContent = '+15%';
        document.getElementById('successChange').textContent = '+5%';

    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Load Recent Activity
async function loadRecentActivity() {
    try {
        const activitySnapshot = await db.collection('activity')
            .orderBy('timestamp', 'desc')
            .limit(10)
            .get();

        const activityHTML = [];
        
        activitySnapshot.forEach(doc => {
            const activity = doc.data();
            const timestamp = activity.timestamp.toDate();
            
            activityHTML.push(`
                <div class="activity-item">
                    <div class="activity-icon">
                        <i class='bx ${getActivityIcon(activity.type)}'></i>
                    </div>
                    <div class="activity-content">
                        <h4>${activity.title}</h4>
                        <p>${activity.description}</p>
                    </div>
                    <span class="activity-time">${formatTimestamp(timestamp)}</span>
                </div>
            `);
        });

        recentActivityEl.innerHTML = activityHTML.join('');
    } catch (error) {
        console.error('Error loading activity:', error);
    }
}

// Initialize Charts
async function initializeCharts() {
    await Promise.all([
        initializeRevenueChart(),
        initializeCampaignStatusChart()
    ]);
}

// Revenue Chart
async function initializeRevenueChart() {
    try {
        // Get last 7 days of revenue data
        const dates = getLast7Days();
        const revenueData = await getRevenueData(dates);

        const ctx = revenueChartEl.getContext('2d');
        revenueChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates.map(date => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
                datasets: [{
                    label: 'Revenue (USDT)',
                    data: revenueData,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#e4e6eb'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#e4e6eb'
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error initializing revenue chart:', error);
    }
}

// Campaign Status Chart
async function initializeCampaignStatusChart() {
    try {
        const campaignsSnapshot = await db.collection('campaigns').get();
        const statusCounts = {
            pending: 0,
            active: 0,
            completed: 0,
            cancelled: 0
        };

        campaignsSnapshot.forEach(doc => {
            const status = doc.data().status;
            if (status in statusCounts) {
                statusCounts[status]++;
            }
        });

        const ctx = campaignStatusChartEl.getContext('2d');
        campaignStatusChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Pending', 'Active', 'Completed', 'Cancelled'],
                datasets: [{
                    data: Object.values(statusCounts),
                    backgroundColor: [
                        '#f1c40f',
                        '#3498db',
                        '#2ecc71',
                        '#e74c3c'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#e4e6eb'
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error initializing campaign status chart:', error);
    }
}

// Helper Functions
function getActivityIcon(type) {
    const icons = {
        campaign: 'bx-list-plus',
        payment: 'bx-dollar',
        user: 'bx-user',
        verification: 'bx-check-circle'
    };
    return icons[type] || 'bx-bell';
}

function formatTimestamp(timestamp) {
    const now = new Date();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) {
        return `${minutes}m ago`;
    } else if (hours < 24) {
        return `${hours}h ago`;
    } else if (days < 7) {
        return `${days}d ago`;
    } else {
        return timestamp.toLocaleDateString();
    }
}

function getLast7Days() {
    const dates = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        dates.push(date);
    }
    return dates;
}

async function getRevenueData(dates) {
    const revenueData = new Array(7).fill(0);
    
    try {
        const campaignsSnapshot = await db.collection('campaigns')
            .where('status', '==', 'completed')
            .get();

        campaignsSnapshot.forEach(doc => {
            const campaign = doc.data();
            const completedDate = campaign.completedAt?.toDate();
            if (completedDate) {
                const index = dates.findIndex(date => 
                    completedDate >= date && 
                    completedDate < new Date(date.getTime() + 24 * 60 * 60 * 1000)
                );
                if (index !== -1) {
                    revenueData[index] += campaign.price || 0;
                }
            }
        });
    } catch (error) {
        console.error('Error getting revenue data:', error);
    }

    return revenueData;
}

// Generate Report
function generateReport() {
    // TODO: Implement report generation
    alert('Report generation feature coming soon!');
}

// Logout Handler
function handleLogout() {
    auth.signOut()
        .then(() => {
            window.location.href = 'index.html';
        })
        .catch(error => {
            console.error('Error signing out:', error);
        });
}

// Refresh Handler
document.getElementById('refreshBtn').addEventListener('click', () => {
    initializeDashboard();
});
