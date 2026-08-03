let timelineChartInstance = null;
let referrerChartInstance = null;

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", () => {
    setupGlobalPasswordToggles();

    const path = window.location.pathname;
    if (path === "/login" || path === "/register") {
        setupStandaloneAuthPage(path);
    } else {
        checkUserSession();
        setupMainAppEventListeners();
    }
});

function setupGlobalPasswordToggles() {
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
}

function setupStandaloneAuthPage(path) {
    const loginTab = document.getElementById("authPageLoginTab");
    const regTab = document.getElementById("authPageRegisterTab");
    const loginForm = document.getElementById("standaloneLoginForm");
    const regForm = document.getElementById("standaloneRegisterForm");
    const title = document.getElementById("authPageTitle");
    const subtitle = document.getElementById("authPageSubtitle");

    if (!loginTab || !regTab) return;

    function showLogin() {
        loginTab.classList.add("active");
        regTab.classList.remove("active");
        loginForm.classList.remove("hidden");
        regForm.classList.add("hidden");
        if (title) title.innerText = "Welcome Back";
        if (subtitle) subtitle.innerText = "Sign in to manage your custom links & track analytics";
    }

    function showRegister() {
        regTab.classList.add("active");
        loginTab.classList.remove("active");
        regForm.classList.remove("hidden");
        loginForm.classList.add("hidden");
        if (title) title.innerText = "Create Your Account";
        if (subtitle) subtitle.innerText = "Join to generate custom aliases and view real-time metrics";
    }

    if (path === "/register") {
        showRegister();
    } else {
        showLogin();
    }

    loginTab.addEventListener("click", showLogin);
    regTab.addEventListener("click", showRegister);

    loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const username = document.getElementById("pageLoginUsername").value;
        const password = document.getElementById("pageLoginPassword").value;
        submitStandaloneAuth("/api/login", { username, password });
    });

    regForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const username = document.getElementById("pageRegUsername").value;
        const password = document.getElementById("pageRegPassword").value;
        submitStandaloneAuth("/api/register", { username, password });
    });
}

function submitStandaloneAuth(endpoint, payload) {
    const alertBox = document.getElementById("pageAuthAlert");
    alertBox.classList.add("hidden");

    fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            window.location.href = "/";
        } else {
            alertBox.innerText = data.error || "Authentication failed";
            alertBox.classList.remove("hidden");
        }
    })
    .catch(() => {
        alertBox.innerText = "Network error. Please try again.";
        alertBox.classList.remove("hidden");
    });
}

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
                    const adminDb = document.getElementById("adminDashboard");
                    if (adminDb) adminDb.classList.add("hidden");
                }
            } else {
                renderGuestHeader();
                const userDb = document.getElementById("userDashboard");
                const adminDb = document.getElementById("adminDashboard");
                if (userDb) userDb.classList.add("hidden");
                if (adminDb) adminDb.classList.add("hidden");
            }
        })
        .catch(() => {
            renderGuestHeader();
        });
}

function renderUserHeader(user) {
    const nav = document.getElementById("authNav");
    if (!nav) return;
    const adminTag = user.is_admin ? `<span class="badge-pill admin-pill" style="margin-left:6px;">ADMIN</span>` : "";
    nav.innerHTML = `
        <span class="user-welcome" style="color:#94a3b8;font-size:0.95rem;">Hello, <strong style="color:#818cf8;">${escapeHtml(user.username)}</strong>${adminTag}</span>
        <button id="logoutBtn" class="btn secondary-btn">Logout</button>
    `;
    document.getElementById("logoutBtn").addEventListener("click", handleLogout);
}

function renderGuestHeader() {
    const nav = document.getElementById("authNav");
    if (!nav) return;
    nav.innerHTML = `
        <a href="/login" class="btn secondary-btn">Sign In</a>
        <a href="/register" class="btn primary-btn">Get Started</a>
    `;
}

function renderUserDashboard(links) {
    const dashboard = document.getElementById("userDashboard");
    const tbody = document.getElementById("userLinksBody");
    if (!dashboard || !tbody) return;
    tbody.innerHTML = "";

    if (links.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#64748b;">No links created yet.</td></tr>`;
    } else {
        links.forEach(link => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><a href="${escapeHtml(link.short_url)}" target="_blank">/r/${escapeHtml(link.short_code)}</a></td>
                <td class="truncate" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(link.original_url)}</td>
                <td>${link.created_at ? link.created_at.split("T")[0] : "-"}</td>
                <td>
                    <button class="btn secondary-btn" style="padding:0.35rem 0.75rem;font-size:0.8rem;" onclick="viewMetrics('${escapeHtml(link.short_code)}')">Stats</button>
                    <button class="btn danger-btn" style="padding:0.35rem 0.75rem;font-size:0.8rem;margin-left:4px;" onclick="deleteLink('${escapeHtml(link.short_code)}')">Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    dashboard.classList.remove("hidden");
}

function setupMainAppEventListeners() {
    const shortenForm = document.getElementById("shortenForm");
    if (shortenForm) {
        shortenForm.addEventListener("submit", (e) => {
            e.preventDefault();
            shortenLink();
        });
    }

    const copyBtn = document.getElementById("copyBtn");
    if (copyBtn) {
        copyBtn.addEventListener("click", () => {
            const input = document.getElementById("shortUrlOutput");
            input.select();
            navigator.clipboard.writeText(input.value);
            copyBtn.innerText = "Copied!";
            setTimeout(() => {
                copyBtn.innerText = "Copy Link";
            }, 2000);
        });
    }

    const qrBtn = document.getElementById("qrBtn");
    if (qrBtn) {
        qrBtn.addEventListener("click", toggleQRCode);
    }

    const analyticsBtn = document.getElementById("fetchAnalyticsBtn");
    if (analyticsBtn) {
        analyticsBtn.addEventListener("click", () => {
            const code = document.getElementById("analyticsCodeInput").value.trim();
            if (code) viewMetrics(code);
        });
    }
}

function handleLogout() {
    fetch("/api/logout", { method: "POST" })
        .then(() => {
            window.location.reload();
        });
}

function shortenLink() {
    const original_url = document.getElementById("originalUrl").value.trim();
    const custom_alias = document.getElementById("customAlias").value.trim();
    const expiration_days = document.getElementById("expirationDays").value;
    const alertBox = document.getElementById("formAlert");

    alertBox.classList.add("hidden");

    fetch("/api/shorten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ original_url, custom_alias, expiration_days })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            document.getElementById("shortUrlOutput").value = data.link.short_url;
            document.getElementById("resultCard").classList.remove("hidden");
            checkUserSession();
        } else {
            alertBox.innerText = data.error || "Failed to create short link";
            alertBox.classList.remove("hidden");
        }
    })
    .catch(() => {
        alertBox.innerText = "Network error. Failed to create short link.";
        alertBox.classList.remove("hidden");
    });
}

function toggleQRCode() {
    const container = document.getElementById("qrContainer");
    const canvasDiv = document.getElementById("qrCanvas");
    const shortUrl = document.getElementById("shortUrlOutput").value;

    if (container.classList.contains("hidden")) {
        canvasDiv.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(shortUrl)}" alt="QR Code">`;
        container.classList.remove("hidden");
    } else {
        container.classList.add("hidden");
    }
}

function viewMetrics(shortCode) {
    fetch(`/api/links/${encodeURIComponent(shortCode)}/analytics`)
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                renderAnalytics(data.analytics, data.summary);
            } else {
                alert(data.error || "Analytics unavailable");
            }
        });
}

function renderAnalytics(analytics, summary) {
    document.getElementById("metricTotalClicks").innerText = analytics.total_clicks || 0;
    document.getElementById("metricShortCode").innerText = summary.short_code;
    
    const statusEl = document.getElementById("metricStatus");
    if (summary.is_active) {
        statusEl.innerText = "Active";
        statusEl.className = "metric-value text-success";
    } else {
        statusEl.innerText = "Expired / Deactivated";
        statusEl.className = "metric-value text-muted";
    }

    renderCharts(analytics);
    document.getElementById("analyticsDashboard").classList.remove("hidden");
    document.getElementById("analyticsDashboard").scrollIntoView({ behavior: "smooth" });
}

function renderCharts(analytics) {
    const timelineCtx = document.getElementById("timelineChart").getContext("2d");
    const referrerCtx = document.getElementById("referrerChart").getContext("2d");

    if (timelineChartInstance) timelineChartInstance.destroy();
    if (referrerChartInstance) referrerChartInstance.destroy();

    const timelineData = analytics.timeline || [];
    timelineChartInstance = new Chart(timelineCtx, {
        type: 'line',
        data: {
            labels: timelineData.map(d => d.date),
            datasets: [{
                label: 'Clicks',
                data: timelineData.map(d => d.clicks),
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                fill: true,
                tension: 0.35
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    const referrerData = analytics.referrers || [];
    referrerChartInstance = new Chart(referrerCtx, {
        type: 'doughnut',
        data: {
            labels: referrerData.map(d => d.referrer),
            datasets: [{
                data: referrerData.map(d => d.count),
                backgroundColor: ['#6366f1', '#a855f7', '#10b981', '#f59e0b', '#ef4444']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function deleteLink(shortCode) {
    if (!confirm(`Are you sure you want to delete /r/${shortCode}?`)) return;
    fetch(`/api/links/${encodeURIComponent(shortCode)}`, { method: "DELETE" })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                checkUserSession();
            } else {
                alert(data.error || "Failed to delete link");
            }
        });
}

function loadAdminDashboard() {
    fetch("/api/admin/stats")
        .then(res => res.json())
        .then(data => {
            if (data.success && data.stats) {
                document.getElementById("adminTotalUsers").innerText = data.stats.total_users;
                document.getElementById("adminActiveLinks").innerText = data.stats.active_links;
                document.getElementById("adminTotalClicks").innerText = data.stats.total_clicks;
            }
        });

    fetch("/api/admin/users")
        .then(res => res.json())
        .then(data => {
            if (data.success && data.users) {
                const tbody = document.getElementById("adminUsersBody");
                tbody.innerHTML = "";
                data.users.forEach(u => {
                    const tr = document.createElement("tr");
                    const roleBadge = u.is_admin ? '<span class="badge-pill admin-pill">Admin</span>' : '<span class="badge-pill">User</span>';
                    tr.innerHTML = `
                        <td>#${u.id}</td>
                        <td><strong>${escapeHtml(u.username)}</strong></td>
                        <td>${roleBadge}</td>
                        <td>${u.link_count}</td>
                        <td>
                            ${u.is_admin ? '<span style="color:#64748b;font-size:0.8rem;">Protected</span>' : `<button class="btn danger-btn" style="padding:0.3rem 0.6rem;font-size:0.8rem;" onclick="adminDeleteUser(${u.id})">Ban Account</button>`}
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        });

    fetch("/api/admin/links")
        .then(res => res.json())
        .then(data => {
            if (data.success && data.links) {
                const tbody = document.getElementById("adminLinksBody");
                tbody.innerHTML = "";
                data.links.forEach(l => {
                    const tr = document.createElement("tr");
                    const statusText = l.is_active ? '<span class="text-success">Active</span>' : '<span class="text-muted">Inactive</span>';
                    tr.innerHTML = `
                        <td><a href="${escapeHtml(l.short_url)}" target="_blank">/r/${escapeHtml(l.short_code)}</a></td>
                        <td class="truncate" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(l.original_url)}</td>
                        <td>${l.user_id ? `#${l.user_id}` : 'Guest'}</td>
                        <td>${statusText}</td>
                        <td>
                            ${l.is_active ? `<button class="btn danger-btn" style="padding:0.3rem 0.6rem;font-size:0.8rem;" onclick="adminDeleteLink('${escapeHtml(l.short_code)}')">Force Remove</button>` : '<span style="color:#64748b;font-size:0.8rem;">Removed</span>'}
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        });

    document.getElementById("adminDashboard").classList.remove("hidden");
}

function adminDeleteUser(userId) {
    if (!confirm(`Ban and delete user #${userId}?`)) return;
    fetch(`/api/admin/users/${userId}`, { method: "DELETE" })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                loadAdminDashboard();
            } else {
                alert(data.error || "Failed to delete user");
            }
        });
}

function adminDeleteLink(shortCode) {
    if (!confirm(`Force-delete link /r/${shortCode}?`)) return;
    fetch(`/api/admin/links/${encodeURIComponent(shortCode)}`, { method: "DELETE" })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                loadAdminDashboard();
            } else {
                alert(data.error || "Failed to remove link");
            }
        });
}
