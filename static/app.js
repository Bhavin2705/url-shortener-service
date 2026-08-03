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
                if (data.user.is_admin) {
                    loadAdminDashboard();
                } else {
                    document.getElementById("adminDashboard").classList.add("hidden");
                }
            } else {
                renderGuestHeader();
                document.getElementById("userDashboard").classList.add("hidden");
                document.getElementById("adminDashboard").classList.add("hidden");
            }
        })
        .catch(() => {
            renderGuestHeader();
        });
}

function renderUserHeader(user) {
    const nav = document.getElementById("authNav");
    const adminTag = user.is_admin ? `<span class="badge" style="background:#6366f1;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;margin-left:6px;">ADMIN</span>` : "";
    nav.innerHTML = `
        <span class="user-welcome">Hello, <strong>${escapeHtml(user.username)}</strong>${adminTag}</span>
        <button id="logoutBtn" class="btn secondary-btn">Logout</button>
    `;
    document.getElementById("logoutBtn").addEventListener("click", handleLogout);
}


function renderGuestHeader() {
    const nav = document.getElementById("authNav");
    nav.innerHTML = `
        <button id="openAuthBtn" class="btn secondary-btn">Sign In / Register</button>
    `;
    document.getElementById("openAuthBtn").addEventListener("click", () => {
        document.getElementById("authModal").classList.remove("hidden");
    });
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
                <td class="truncate">${escapeHtml(link.original_url)}</td>
                <td>${link.created_at ? link.created_at.split("T")[0] : "-"}</td>
                <td>
                    <button class="btn table-btn" onclick="viewMetrics('${escapeHtml(link.short_code)}')">Stats</button>
                    <button class="btn table-btn danger-btn" onclick="deleteLink('${escapeHtml(link.short_code)}')">Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    dashboard.classList.remove("hidden");
}

function setupEventListeners() {
    const modal = document.getElementById("authModal");
    const closeBtn = document.getElementById("closeAuthModal");
    const loginTab = document.getElementById("loginTabBtn");
    const regTab = document.getElementById("registerTabBtn");
    const loginForm = document.getElementById("loginForm");
    const regForm = document.getElementById("registerForm");

    if (closeBtn) {
        closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
    }

    document.querySelectorAll(".toggle-password-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const targetId = btn.getAttribute("data-target");
            const input = document.getElementById(targetId);
            if (input) {
                const isPassword = input.type === "password";
                input.type = isPassword ? "text" : "password";
                btn.innerHTML = isPassword
                    ? `<svg class="eye-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`
                    : `<svg class="eye-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
            }
        });
    });

    loginTab.addEventListener("click", () => {
        loginTab.classList.add("active");
        regTab.classList.remove("active");
        loginForm.classList.remove("hidden");
        regForm.classList.add("hidden");
    });


    regTab.addEventListener("click", () => {
        regTab.classList.add("active");
        loginTab.classList.remove("active");
        regForm.classList.remove("hidden");
        loginForm.classList.add("hidden");
    });

    loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const username = document.getElementById("loginUsername").value;
        const password = document.getElementById("loginPassword").value;
        authRequest("/api/login", { username, password });
    });

    regForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const username = document.getElementById("regUsername").value;
        const password = document.getElementById("regPassword").value;
        authRequest("/api/register", { username, password });
    });

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

