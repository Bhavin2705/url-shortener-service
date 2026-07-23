document.addEventListener("DOMContentLoaded", () => {
    const shortenForm = document.getElementById("shortenForm");
    const originalUrlInput = document.getElementById("originalUrl");
    const customAliasInput = document.getElementById("customAlias");
    const expirationDaysInput = document.getElementById("expirationDays");
    const shortenBtn = document.getElementById("shortenBtn");
    const formAlert = document.getElementById("formAlert");
    
    const resultCard = document.getElementById("resultCard");
    const shortUrlOutput = document.getElementById("shortUrlOutput");
    const copyBtn = document.getElementById("copyBtn");
    const qrBtn = document.getElementById("qrBtn");

    const analyticsCodeInput = document.getElementById("analyticsCodeInput");
    const fetchAnalyticsBtn = document.getElementById("fetchAnalyticsBtn");
    const analyticsDashboard = document.getElementById("analyticsDashboard");
    
    const metricTotalClicks = document.getElementById("metricTotalClicks");
    const metricShortCode = document.getElementById("metricShortCode");
    const jsonOutput = document.getElementById("jsonOutput");

    // Shorten Form Submit Handler
    shortenForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        hideAlert();

        const original_url = originalUrlInput.value.trim();
        const custom_alias = customAliasInput.value.trim();
        const expiration_days = expirationDaysInput.value ? parseInt(expirationDaysInput.value) : null;

        if (!original_url) {
            showAlert("Please enter a valid original URL.", "danger");
            return;
        }

        shortenBtn.disabled = true;
        shortenBtn.innerText = "Processing...";

        try {
            const response = await fetch("/api/urls/shorten", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    original_url: original_url,
                    custom_alias: custom_alias || undefined,
                    expiration_days: expiration_days
                })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                const short_url = result.data.short_url;
                const short_code = result.data.short_code;

                shortUrlOutput.value = short_url;
                qrBtn.href = `/api/urls/${short_code}/qr`;
                resultCard.classList.remove("hidden");

                // Auto-fill analytics search input
                analyticsCodeInput.value = short_code;
                
                showAlert("Short link generated successfully.", "success");
            } else {
                showAlert(result.error || "Failed to shorten URL.", "danger");
            }
        } catch (error) {
            showAlert("Network error. Unable to reach server.", "danger");
        } finally {
            shortenBtn.disabled = false;
            shortenBtn.innerHTML = `
                <svg class="btn-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Generate Short Link
            `;
        }
    });

    // Copy to Clipboard
    copyBtn.addEventListener("click", () => {
        if (!shortUrlOutput.value) return;
        navigator.clipboard.writeText(shortUrlOutput.value).then(() => {
            const originalText = copyBtn.innerText;
            copyBtn.innerText = "Copied!";
            setTimeout(() => {
                copyBtn.innerText = originalText;
            }, 2000);
        });
    });

    // Analytics Search Handler
    fetchAnalyticsBtn.addEventListener("click", () => {
        const short_code = analyticsCodeInput.value.trim();
        if (!short_code) {
            alert("Please enter a short code.");
            return;
        }
        loadAnalytics(short_code);
    });

    async function loadAnalytics(short_code) {
        fetchAnalyticsBtn.disabled = true;
        fetchAnalyticsBtn.innerText = "Loading...";

        try {
            const response = await fetch(`/api/urls/${short_code}/analytics`);
            const result = await response.json();

            if (response.ok && result.success) {
                analyticsDashboard.classList.remove("hidden");

                metricTotalClicks.innerText = result.analytics.total_clicks;
                metricShortCode.innerText = result.summary.short_code;
                jsonOutput.innerText = JSON.stringify(result, null, 2);

                renderBrowserChart(result.analytics.browsers);
                renderTimelineChart(result.analytics.timeline);
            } else {
                alert(result.error || "Analytics not found for short code.");
                analyticsDashboard.classList.add("hidden");
            }
        } catch (error) {
            alert("Failed to load analytics.");
        } finally {
            fetchAnalyticsBtn.disabled = false;
            fetchAnalyticsBtn.innerHTML = `
                <svg class="btn-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                View Stats
            `;
        }
    }

    function renderBrowserChart(browserData) {
        const canvas = document.getElementById("browserChart");
        if (!canvas) return;

        // Single point of truth: Inspect canvas registry directly
        const existingChart = Chart.getChart(canvas);
        if (existingChart) {
            existingChart.destroy();
        }

        const labels = Object.keys(browserData);
        const data = Object.values(browserData);

        new Chart(canvas, {
            type: "doughnut",
            data: {
                labels: labels.length ? labels : ["No Clicks Yet"],
                datasets: [{
                    data: data.length ? data : [1],
                    backgroundColor: ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: "bottom",
                        labels: { color: "#94a3b8" }
                    }
                }
            }
        });
    }

    function renderTimelineChart(timelineData) {
        const canvas = document.getElementById("timelineChart");
        if (!canvas) return;

        // Single point of truth: Inspect canvas registry directly
        const existingChart = Chart.getChart(canvas);
        if (existingChart) {
            existingChart.destroy();
        }

        const labels = timelineData.map(item => item.date);
        const data = timelineData.map(item => item.clicks);

        new Chart(canvas, {
            type: "line",
            data: {
                labels: labels.length ? labels : ["Today"],
                datasets: [{
                    label: "Clicks",
                    data: data.length ? data : [0],
                    borderColor: "#6366f1",
                    backgroundColor: "rgba(99, 102, 241, 0.1)",
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: "#94a3b8" }, grid: { color: "#334155" } },
                    y: { ticks: { color: "#94a3b8" }, grid: { color: "#334155" }, beginAtZero: true }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    function showAlert(message, type) {
        formAlert.innerText = message;
        formAlert.className = `alert alert-${type}`;
        formAlert.classList.remove("hidden");
    }

    function hideAlert() {
        formAlert.classList.add("hidden");
    }
});
