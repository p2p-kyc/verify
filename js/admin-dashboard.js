// Use Firebase instances from config.js
// These are already available as window.db and window.auth

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
window.auth.onAuthStateChanged(async (user) => {
    if (user) {
        // Check if user is admin
        const userDoc = await window.db.collection('users').doc(user.uid).get();
        if (!userDoc.exists || userDoc.data().role !== 'admin') {
            redirectTo('index.html');
            return;
        }
        initializeDashboard();
    } else {
        redirectTo('index.html');
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
        // Get current period stats
        const now = new Date();
        const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Get all campaigns
        const campaignsSnapshot = await window.db.collection('campaigns').get();
        const totalCampaigns = campaignsSnapshot.size;
        
        let totalRevenue = 0;
        let completedCampaigns = 0;
        let recentCompletedRevenue = 0;
        let previousCompletedRevenue = 0;

        // Process campaigns
        campaignsSnapshot.forEach(doc => {
            const campaign = doc.data();
            if (campaign.status === 'completed') {
                completedCampaigns++;
                totalRevenue += campaign.price || 0;

                // Check if completed in last week
                const completedAt = campaign.completedAt?.toDate();
                if (completedAt) {
                    if (completedAt > lastWeek) {
                        recentCompletedRevenue += campaign.price || 0;
                    } else if (completedAt > lastMonth) {
                        previousCompletedRevenue += campaign.price || 0;
                    }
                }
            }
        });

        // Get active users (users who have logged in in the last week)
        const [currentUsers, previousUsers] = await Promise.all([
            window.db.collection('users')
                .where('lastActive', '>', lastWeek)
                .get(),
            window.db.collection('users')
                .where('lastActive', '>', lastMonth)
                .where('lastActive', '<=', lastWeek)
                .get()
        ]);

        const activeUsers = currentUsers.size;
        const successRate = totalCampaigns > 0 ? (completedCampaigns / totalCampaigns) * 100 : 0;

        // Calculate changes
        const campaignsChange = calculateChange(
            campaignsSnapshot.docs.filter(doc => doc.data().createdAt?.toDate() > lastWeek).length,
            campaignsSnapshot.docs.filter(doc => {
                const createdAt = doc.data().createdAt?.toDate();
                return createdAt > lastMonth && createdAt <= lastWeek;
            }).length
        );

        const revenueChange = calculateChange(recentCompletedRevenue, previousCompletedRevenue);
        const usersChange = calculateChange(currentUsers.size, previousUsers.size);
        const previousSuccessRate = calculateSuccessRate(
            campaignsSnapshot.docs.filter(doc => {
                const completedAt = doc.data().completedAt?.toDate();
                return completedAt && completedAt <= lastWeek && completedAt > lastMonth;
            }).length,
            campaignsSnapshot.docs.filter(doc => {
                const createdAt = doc.data().createdAt?.toDate();
                return createdAt <= lastWeek && createdAt > lastMonth;
            }).length
        );
        const successChange = calculateChange(successRate, previousSuccessRate);

        // Update UI
        totalCampaignsEl.textContent = totalCampaigns;
        totalRevenueEl.textContent = `${totalRevenue.toFixed(2)} USDT`;
        activeUsersEl.textContent = activeUsers;
        successRateEl.textContent = `${successRate.toFixed(1)}%`;

        // Update change indicators
        updateChangeIndicator('campaignsChange', campaignsChange);
        updateChangeIndicator('revenueChange', revenueChange);
        updateChangeIndicator('usersChange', usersChange);
        updateChangeIndicator('successChange', successChange);

    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Load Recent Activity
async function loadRecentActivity() {
    try {
        // Get recent activities from multiple collections
        const [campaigns, payments, users] = await Promise.all([
            // Recent campaign changes
            window.db.collection('campaigns')
                .orderBy('updatedAt', 'desc')
                .limit(5)
                .get(),
            // Recent payment requests
            window.db.collection('payment_requests')
                .orderBy('createdAt', 'desc')
                .limit(5)
                .get(),
            // Recent user verifications
            window.db.collection('users')
                .where('verificationStatus', '==', 'pending')
                .orderBy('verificationRequestDate', 'desc')
                .limit(5)
                .get()
        ]);

        // Combine and sort activities
        const activities = [];

        // Process campaigns
        campaigns.forEach(doc => {
            const campaign = doc.data();
            activities.push({
                type: 'campaign',
                title: `Campaign ${campaign.status.toUpperCase()}`,
                description: `${campaign.name} - ${campaign.accounts} accounts for ${campaign.price} USDT`,
                timestamp: campaign.updatedAt,
                icon: getActivityIcon('campaign')
            });
        });

        // Process payments
        payments.forEach(doc => {
            const payment = doc.data();
            activities.push({
                type: 'payment',
                title: `Payment ${payment.status.toUpperCase()}`,
                description: `${payment.amount} USDT - From: ${payment.buyerId} To: ${payment.sellerId}`,
                timestamp: payment.createdAt,
                icon: getActivityIcon('payment')
            });
        });

        // Process user verifications
        users.forEach(doc => {
            const user = doc.data();
            if (user.verificationStatus === 'pending') {
                activities.push({
                    type: 'verification',
                    title: 'Verification Request',
                    description: `User ${user.email} requested verification`,
                    timestamp: user.verificationRequestDate,
                    icon: getActivityIcon('verification')
                });
            }
        });

        // Sort by timestamp
        activities.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());

        // Generate HTML
        const activityHTML = activities.slice(0, 10).map(activity => `
            <div class="activity-item">
                <div class="activity-icon">
                    <i class='bx ${activity.icon}'></i>
                </div>
                <div class="activity-content">
                    <h4>${activity.title}</h4>
                    <p>${activity.description}</p>
                </div>
                <span class="activity-time">${formatTimestamp(activity.timestamp.toDate())}</span>
            </div>
        `);

        recentActivityEl.innerHTML = activityHTML.join('');
    } catch (error) {
        console.error('Error loading activity:', error);
    }
}

// Initialize Charts
async function initializeCharts() {
    try {
        const dates = getLast7Days();
        const [revenueData, campaignStatusData] = await Promise.all([
            getRevenueData(dates),
            getCampaignStatusData()
        ]);

        initializeRevenueChart(dates, revenueData);
        initializeCampaignStatusChart(campaignStatusData);
    } catch (error) {
        console.error('Error initializing charts:', error);
    }
}

// Revenue Chart
function initializeRevenueChart(dates, revenueData) {
    if (revenueChart) {
        revenueChart.destroy();
    }

    const ctx = revenueChartEl.getContext('2d');
    revenueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates.map(date => date.toLocaleDateString('en-US', { weekday: 'short' })),
            datasets: [{
                label: 'Revenue (USDT)',
                data: revenueData,
                borderColor: '#2ecc71',
                backgroundColor: 'rgba(46, 204, 113, 0.1)',
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
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return `Revenue: ${context.parsed.y.toFixed(2)} USDT`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#e4e6eb',
                        callback: function(value) {
                            return value.toFixed(2) + ' USDT';
                        }
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#e4e6eb'
                    }
                }
            }
        }
    });
}

// Campaign Status Chart
function initializeCampaignStatusChart(statusCounts) {
    if (campaignStatusChart) {
        campaignStatusChart.destroy();
    }

    const ctx = campaignStatusChartEl.getContext('2d');
    campaignStatusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Pending', 'Active', 'Completed', 'Cancelled'],
            datasets: [{
                data: Object.values(statusCounts),
                backgroundColor: [
                    '#f1c40f',  // Pending - Yellow
                    '#3498db',  // Active - Blue
                    '#2ecc71',  // Completed - Green
                    '#e74c3c'   // Cancelled - Red
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
                        color: '#e4e6eb',
                        padding: 20,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Helper Functions

// Calculate statistics from campaign snapshot
function calculateStats(snapshot) {
    let stats = {
        total: snapshot.size,
        revenue: 0,
        completed: 0,
        active: 0,
        pending: 0,
        cancelled: 0
    };

    snapshot.forEach(doc => {
        const campaign = doc.data();
        if (campaign.status === 'completed') {
            stats.completed++;
            stats.revenue += campaign.price || 0;
        } else if (campaign.status === 'active') {
            stats.active++;
        } else if (campaign.status === 'pending') {
            stats.pending++;
        } else if (campaign.status === 'cancelled') {
            stats.cancelled++;
        }
    });

    return stats;
}

// Calculate percentage change between two values
function calculateChange(current, previous) {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
}

// Calculate success rate
function calculateSuccessRate(completed, total) {
    if (total === 0) return 0;
    return (completed / total) * 100;
}

// Update change indicator UI
function updateChangeIndicator(elementId, changePercentage) {
    const element = document.getElementById(elementId);
    const isPositive = changePercentage >= 0;
    const parentDiv = element.parentElement;

    // Update text
    element.textContent = `${isPositive ? '+' : ''}${changePercentage.toFixed(1)}%`;

    // Update icon and color
    parentDiv.classList.remove('positive', 'negative');
    parentDiv.classList.add(isPositive ? 'positive' : 'negative');

    const icon = parentDiv.querySelector('i');
    icon.classList.remove('bx-up-arrow-alt', 'bx-down-arrow-alt');
    icon.classList.add(isPositive ? 'bx-up-arrow-alt' : 'bx-down-arrow-alt');
}

// Activity icon mapping
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
        const campaignsSnapshot = await window.db.collection('campaigns')
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

// Get campaign status data
async function getCampaignStatusData() {
    const statusCounts = {
        pending: 0,
        active: 0,
        completed: 0,
        cancelled: 0
    };

    try {
        const campaignsSnapshot = await window.db.collection('campaigns').get();
        campaignsSnapshot.forEach(doc => {
            const status = doc.data().status;
            if (status in statusCounts) {
                statusCounts[status]++;
            }
        });
    } catch (error) {
        console.error('Error getting campaign status data:', error);
    }

    return statusCounts;
}

// Generate Report
function generateReport() {
    // TODO: Implement report generation
    alert('Report generation feature coming soon!');
}

// Logout Handler
function handleLogout() {
    window.auth.signOut()
        .then(() => {
            redirectTo('index.html');
        })
        .catch(error => {
            console.error('Error signing out:', error);
        });
}

// Refresh Handler
document.getElementById('refreshBtn').addEventListener('click', () => {
    initializeDashboard();
});
