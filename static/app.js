let timelineChartInstance = null;
let referrerChartInstance = null;

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", () => {
    checkUserSession();
    setupEventListeners();
});

function checkUserSession() {
    fetch("/api/me")
        .then(res => res.json())
        .then(data => {
            if (data.success && data.user) {
                renderUserHeader(data.user);
                renderUserDashboard(data.links || []);
                document.getElementById("analyticsSearchCard").classList.remove("hidden");
                if (data.user.is_admin) {
                    loadAdminDashboard();
                } else {
                    document.getElementById("adminDashboard").classList.add("hidden");
                }
            } else {
                renderLoggedOutNav();
                document.getElementById("userDashboard").classList.add("hidden");
                document.getElementById("adminDashboard").classList.add("hidden");
                document.getElementById("analyticsSearchCard").classList.add("hidden");
                document.getElementById("analyticsDashboard").classList.add("hidden");
            }
        })
        .catch(() => {
            renderLoggedOutNav();
            document.getElementById("userDashboard").classList.add("hidden");
            document.getElementById("adminDashboard").classList.add("hidden");
            document.getElementById("analyticsSearchCard").classList.add("hidden");
            document.getElementById("analyticsDashboard").classList.add("hidden");
        });
}


function renderUserHeader(user) {
    const nav = document.getElementById("authNav");
    const adminTag = user.is_admin ? `<span class="badge" style="background:#10b981;color:#000;padding:2px 8px;font-size:12px;margin-left:6px;font-weight:700;">ADMIN</span>` : "";
    nav.innerHTML = `
        <span class="user-welcome">Hello, <strong>${escapeHtml(user.username)}</strong>${adminTag}</span>
        <button id="logoutBtn" class="btn secondary-btn">Logout</button>
    `;
    document.getElementById("logoutBtn").addEventListener("click", handleLogout);
}


function renderLoggedOutNav() {
    const nav = document.getElementById("authNav");
    nav.innerHTML = `
        <a href="/login" class="btn primary-btn">Sign In / Register</a>
    `;
}

function renderUserDashboard(links) {
    const dashboard = document.getElementById("userDashboard");
    const tbody = document.getElementById("userLinksBody");
    tbody.innerHTML = "";

    if (links.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No links created yet.</td></tr>`;
    } else {
        links.forEach(link => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><a href="${escapeHtml(link.short_url)}" target="_blank">/r/${escapeHtml(link.short_code)}</a></td>
                <td class="truncate" title="${escapeHtml(link.original_url)}">${escapeHtml(link.original_url)}</td>
                <td>${new Date(link.created_at).toLocaleDateString()}</td>
                <td>
                    <button class="btn danger-btn table-btn" onclick="deleteLink('${escapeHtml(link.short_code)}')">Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    dashboard.classList.remove("hidden");
}


function setupEventListeners() {
    document.getElementById("shortenForm").addEventListener("submit", (e) => {

        e.preventDefault();
        shortenLink();
    });

    document.getElementById("copyBtn").addEventListener("click", () => {
        const input = document.getElementById("shortUrlOutput");
        input.select();
        navigator.clipboard.writeText(input.value);
        document.getElementById("copyBtn").innerText = "Copied!";
        setTimeout(() => {
            document.getElementById("copyBtn").innerText = "Copy";
        }, 2000);
    });

    document.getElementById("qrBtn").addEventListener("click", () => {
        const container = document.getElementById("qrContainer");
        const canvasDiv = document.getElementById("qrCanvas");
        const url = document.getElementById("shortUrlOutput").value;

        if (container.classList.contains("hidden")) {
            canvasDiv.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}" alt="QR Code" />`;
            container.classList.remove("hidden");
        } else {
            container.classList.add("hidden");
        }
    });

    document.getElementById("fetchAnalyticsBtn").addEventListener("click", () => {
        const code = document.getElementById("analyticsCodeInput").value.trim();
        if (code) {
            viewMetrics(code);
        }
    });
}

function authRequest(endpoint, payload) {
    const alertBox = document.getElementById("authAlert");
    alertBox.classList.add("hidden");

    fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            document.getElementById("authModal").classList.add("hidden");
            checkUserSession();
        } else {
            alertBox.innerText = data.error || "Authentication failed";
            alertBox.classList.remove("hidden");
        }
    })
    .catch(() => {
        alertBox.innerText = "Network error";
        alertBox.classList.remove("hidden");
    });
}

function handleLogout() {
    fetch("/api/logout", { method: "POST" })
        .then(() => checkUserSession());
}

function shortenLink() {
    const alertBox = document.getElementById("formAlert");
    alertBox.classList.add("hidden");

    const payload = {
        original_url: document.getElementById("originalUrl").value.trim(),
        custom_alias: document.getElementById("customAlias").value.trim(),
        expiration_days: document.getElementById("expirationDays").value
    };

    fetch("/api/shorten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            document.getElementById("resultCard").classList.remove("hidden");
            document.getElementById("shortUrlOutput").value = data.link.short_url;
            document.getElementById("qrContainer").classList.add("hidden");
            checkUserSession();
        } else {
            alertBox.innerText = data.error || "Failed to shorten URL";
            alertBox.classList.remove("hidden");
        }
    })
    .catch(() => {
        alertBox.innerText = "Error contacting server";
        alertBox.classList.remove("hidden");
    });
}

function viewMetrics(code) {
    fetch(`/api/links/${code}/analytics`)
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                alert(data.error || "Could not fetch metrics");
                return;
            }

            const dashboard = document.getElementById("analyticsDashboard");
            dashboard.classList.remove("hidden");

            document.getElementById("metricTotalClicks").innerText = data.analytics.total_clicks;
            document.getElementById("metricShortCode").innerText = data.summary.short_code;
            document.getElementById("metricStatus").innerText = data.summary.is_active ? "Active" : "Expired";

            renderTimelineChart(data.analytics.timeline);
            renderReferrerChart(data.analytics.referrers);

            dashboard.scrollIntoView({ behavior: "smooth" });
        })
        .catch(() => {
            alert("Error fetching analytics data");
        });
}

function deleteLink(code) {
    if (!confirm(`Are you sure you want to delete /r/${code}?`)) return;

    fetch(`/api/links/${code}`, { method: "DELETE" })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                checkUserSession();
                document.getElementById("analyticsDashboard").classList.add("hidden");
            } else {
                alert(data.error || "Failed to delete link");
            }
        });
}

function renderTimelineChart(timeline) {
    const ctx = document.getElementById("timelineChart").getContext("2d");
    if (timelineChartInstance) timelineChartInstance.destroy();

    const labels = timeline.map(t => t.date);
    const clicks = timeline.map(t => t.clicks);

    timelineChartInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: "Clicks",
                data: clicks,
                borderColor: "#6366f1",
                backgroundColor: "rgba(99, 102, 241, 0.1)",
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function renderReferrerChart(referrers) {
    const ctx = document.getElementById("referrerChart").getContext("2d");
    if (referrerChartInstance) referrerChartInstance.destroy();

    const labels = Object.keys(referrers);
    const data = Object.values(referrers);

    referrerChartInstance = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

window.viewMetrics = viewMetrics;
window.deleteLink = deleteLink;

function loadAdminDashboard() {
    fetch("/api/admin/stats").then(res => res.json()).then(data => {
        if (data.success) {
            document.getElementById("adminTotalUsers").innerText = data.stats.total_users;
            document.getElementById("adminActiveLinks").innerText = data.stats.active_links;
            document.getElementById("adminTotalClicks").innerText = data.stats.total_clicks;
        }
    });

    fetch("/api/admin/users").then(res => res.json()).then(data => {
        if (data.success) {
            const ubody = document.getElementById("adminUsersBody");
            ubody.innerHTML = "";
            data.users.forEach(u => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>${u.id}</td>
                    <td><strong>${escapeHtml(u.username)}</strong></td>
                    <td>${u.is_admin ? "Admin" : "User"}</td>
                    <td>${u.link_count}</td>
                    <td>${u.is_admin ? "-" : `<button class="btn table-btn danger-btn" onclick="adminDeleteUser(${u.id})">Delete User</button>`}</td>
                `;
                ubody.appendChild(tr);
            });
        }
    });

    fetch("/api/admin/links").then(res => res.json()).then(data => {
        if (data.success) {
            const lbody = document.getElementById("adminLinksBody");
            lbody.innerHTML = "";
            data.links.forEach(l => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>/r/${escapeHtml(l.short_code)}</td>
                    <td class="truncate">${escapeHtml(l.original_url)}</td>
                    <td>${l.user_id || "Anon"}</td>
                    <td>${l.is_active ? "Active" : "Inactive"}</td>
                    <td>${l.is_active ? `<button class="btn table-btn danger-btn" onclick="adminDeleteLink('${escapeHtml(l.short_code)}')">Delete Link</button>` : "-"}</td>
                `;
                lbody.appendChild(tr);
            });
        }
    });

    document.getElementById("adminDashboard").classList.remove("hidden");
}

function adminDeleteUser(userId) {
    if (!confirm("Are you sure you want to delete this user and all their links?")) return;
    fetch(`/api/admin/users/${userId}`, { method: "DELETE" }).then(res => res.json()).then(data => {
        if (data.success) loadAdminDashboard();
        else alert(data.error || "Failed to delete user");
    });
}

function adminDeleteLink(code) {
    if (!confirm(`Are you sure you want to force-delete link /r/${code}?`)) return;
    fetch(`/api/admin/links/${code}`, { method: "DELETE" }).then(res => res.json()).then(data => {
        if (data.success) loadAdminDashboard();
        else alert(data.error || "Failed to delete link");
    });
}

window.adminDeleteUser = adminDeleteUser;
window.adminDeleteLink = adminDeleteLink;

