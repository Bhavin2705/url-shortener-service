document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    const regForm = document.getElementById("registerForm");
    const showLoginBtn = document.getElementById("showLoginBtn");
    const showRegBtn = document.getElementById("showRegBtn");
    const authTitle = document.getElementById("authTitle");
    const alertBox = document.getElementById("authAlert");

    // Toggle view
    showLoginBtn.addEventListener("click", () => {
        showLoginBtn.classList.add("active");
        showRegBtn.classList.remove("active");
        loginForm.classList.remove("hidden");
        regForm.classList.add("hidden");
        authTitle.textContent = "Sign In";
        hideAlert();
    });

    showRegBtn.addEventListener("click", () => {
        showRegBtn.classList.add("active");
        showLoginBtn.classList.remove("active");
        regForm.classList.remove("hidden");
        loginForm.classList.add("hidden");
        authTitle.textContent = "Create Account";
        hideAlert();
    });

    // Password visibility toggle
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

    // Login Submission
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = document.getElementById("loginUsername").value.trim();
        const password = document.getElementById("loginPassword").value.trim();
        const submitBtn = loginForm.querySelector("button[type='submit']");
        await handleAuth("/api/login", { username, password }, submitBtn, "Signing In...");
    });

    // Register Submission
    regForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("regEmail").value.trim();
        const username = document.getElementById("regUsername").value.trim();
        const password = document.getElementById("regPassword").value.trim();
        const submitBtn = regForm.querySelector("button[type='submit']");
        await handleAuth("/api/register", { email, username, password }, submitBtn, "Creating Account...");
    });


    async function handleAuth(endpoint, bodyData, submitBtn, loadingText) {
        hideAlert();
        const originalText = submitBtn.innerText;
        submitBtn.disabled = true;
        submitBtn.style.opacity = "0.7";
        submitBtn.style.cursor = "not-allowed";
        submitBtn.innerText = loadingText;

        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyData)
            });
            const data = await res.json();
            if (data.success) {
                window.location.href = "/";
            } else {
                showAlert(data.error || "Authentication failed");
            }
        } catch (err) {
            showAlert("Server error. Please try again.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.style.opacity = "1";
            submitBtn.style.cursor = "pointer";
            submitBtn.innerText = originalText;
        }
    }


    function showAlert(msg) {
        alertBox.textContent = msg;
        alertBox.classList.remove("hidden");
    }

    function hideAlert() {
        alertBox.textContent = "";
        alertBox.classList.add("hidden");
    }
});
