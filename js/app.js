"use strict";

let supabaseClient = null;
let currentUser = null;
let selectedRating = 0;

document.addEventListener("DOMContentLoaded", async () => {

    if (
        !window.supabase ||
        !window.APP_CONFIG?.SUPABASE_URL ||
        !window.APP_CONFIG?.SUPABASE_ANON_KEY
    ) {
        console.error("Supabase configuration is missing.");
        showToast("Supabase configuration is missing.");
        return;
    }

    supabaseClient = window.supabase.createClient(
        window.APP_CONFIG.SUPABASE_URL,
        window.APP_CONFIG.SUPABASE_ANON_KEY
    );

    bindEvents();

    await restoreSession();

    await loadProducts();

    initializeVoiceflow();

    handlePaymentReturn();

});


function bindEvents() {

    document
        .getElementById("mobileMenuButton")
        ?.addEventListener("click", () => {

            document
                .getElementById("mainNavigation")
                .classList.toggle("open");

        });


    document
        .getElementById("loginButton")
        ?.addEventListener("click", openAuthModal);


    document
        .getElementById("logoutButton")
        ?.addEventListener("click", logout);


    document
        .getElementById("closeAuthModal")
        ?.addEventListener("click", closeAuthModal);


    document
        .getElementById("showRegister")
        ?.addEventListener("click", showRegisterForm);


    document
        .getElementById("showLogin")
        ?.addEventListener("click", showLoginForm);


    document
        .getElementById("loginForm")
        ?.addEventListener("submit", login);


    document
        .getElementById("registerForm")
        ?.addEventListener("submit", register);


    document
        .getElementById("sellNowButton")
        ?.addEventListener("click", () => {

            if (!currentUser) {

                openAuthModal();

                showToast("Please register or login first.");

                return;
            }

            document
                .getElementById("dashboard")
                .classList.remove("hidden");

            document
                .getElementById("dashboard")
                .scrollIntoView({
                    behavior: "smooth"
                });

        });


    document
        .getElementById("productForm")
        ?.addEventListener("submit", createProduct);


    document
        .getElementById("searchProducts")
        ?.addEventListener("input", loadProducts);


    document
        .getElementById("categoryFilter")
        ?.addEventListener("change", loadProducts);


    document
        .getElementById("closeReviewModal")
        ?.addEventListener("click", closeReviewModal);


    document
        .getElementById("reviewForm")
        ?.addEventListener("submit", submitReview);


    document
        .querySelectorAll("#starRating button")
        .forEach(button => {

            button.addEventListener("click", () => {

                selectedRating = Number(
                    button.dataset.rating
                );

                updateStars();

            });

        });

}


async function restoreSession() {

    const {
        data,
        error
    } = await supabaseClient.auth.getSession();

    if (error) {

        console.error(error);

        return;
    }

    currentUser = data.session?.user || null;

    updateAuthUI();

    if (currentUser) {

        await loadDashboard();

    }

    supabaseClient.auth.onAuthStateChange(
        async (_event, session) => {

            currentUser = session?.user || null;

            updateAuthUI();

            if (currentUser) {

                await loadDashboard();

            }

        }
    );

}


function updateAuthUI() {

    const loginButton =
        document.getElementById("loginButton");

    const logoutButton =
        document.getElementById("logoutButton");

    const dashboardLink =
        document.getElementById("dashboardLink");

    const dashboard =
        document.getElementById("dashboard");

    if (currentUser) {

        loginButton?.classList.add("hidden");

        logoutButton?.classList.remove("hidden");

        dashboardLink?.classList.remove("hidden");

        dashboard?.classList.remove("hidden");

    } else {

        loginButton?.classList.remove("hidden");

        logoutButton?.classList.add("hidden");

        dashboardLink?.classList.add("hidden");

        dashboard?.classList.add("hidden");

    }

}


function openAuthModal() {

    document
        .getElementById("authModal")
        .classList.remove("hidden");

}


function closeAuthModal() {

    document
        .getElementById("authModal")
        .classList.add("hidden");

}


function showRegisterForm() {

    document
        .getElementById("loginForm")
        .classList.add("hidden");

    document
        .getElementById("registerForm")
        .classList.remove("hidden");

}


function showLoginForm() {

    document
        .getElementById("registerForm")
        .classList.add("hidden");

    document
        .getElementById("loginForm")
        .classList.remove("hidden");

}


async function login(event) {

    event.preventDefault();

    const email =
        document.getElementById("loginEmail").value.trim();

    const password =
        document.getElementById("loginPassword").value;

    const {
        error
    } = await supabaseClient.auth.signInWithPassword({
        email,
        password
    });

    if (error) {

        showToast(error.message);

        return;
    }

    closeAuthModal();

    showToast("Login successful.");

}


async function register(event) {

    event.preventDefault();

    const name =
        document.getElementById("registerName").value.trim();

    const email =
        document.getElementById("registerEmail").value.trim();

    const password =
        document.getElementById("registerPassword").value;

    const gcash =
        document.getElementById("registerGcash").value.trim();

    const wantsToSell =
        document.getElementById("registerSeller").checked;


    const {
        data,
        error
    } = await supabaseClient.auth.signUp({

        email,

        password,

        options: {
            data: {
                full_name: name,
                wants_to_sell: wantsToSell
            }
        }

    });


    if (error) {

        showToast(error.message);

        return;
    }


    if (!data.user) {

        showToast(
            "Registration failed. Please try again."
        );

        return;
    }


    const {
        error: profileError
    } = await supabaseClient
        .from("profiles")
        .upsert({
            id: data.user.id,
            full_name: name,
            gcash_number: gcash,
            is_seller: wantsToSell
        });


    if (profileError) {

        console.error(profileError);

        showToast(
            "Account created, but profile setup failed."
        );

        return;
    }


    closeAuthModal();

    showToast(
        "Account created. Check your email if confirmation is enabled."
    );

}


async function logout() {

    const {
        error
    } = await supabaseClient.auth.signOut();

    if (error) {

        showToast(error.message);

        return;
    }

    currentUser = null;

    updateAuthUI();

    showToast("You have been logged out.");

}


async function loadProducts() {

    const grid =
        document.getElementById("productsGrid");

    if (!grid) return;


    grid.innerHTML =
        `<div class="loading-card">Loading products...</div>`;


    const search =
        document
            .getElementById("searchProducts")
            ?.value
            .trim()
            .toLowerCase() || "";


    const category =
        document
            .getElementById("categoryFilter")
            ?.value || "";


    let query =
        supabaseClient
            .from("products")
            .select(`
                id,
                seller_id,
                title,
                description,
                category,
                price,
                file_url,
                created_at
            `)
            .eq("status", "published")
            .order("created_at", {
                ascending: false
            });


    if (category) {

        query = query.eq(
            "category",
            category
        );

    }


    const {
        data,
        error
    } = await query;


    if (error) {

        console.error(error);

        grid.innerHTML =
            `<div class="loading-card">
                Unable to load products.
            </div>`;

        return;
    }


    let products = data || [];


    if (search) {

        products = products.filter(product => {

            const text = (
                product.title +
                " " +
                product.description
            ).toLowerCase();

            return text.includes(search);

        });

    }


    if (!products.length) {

        grid.innerHTML =
            `<div class="loading-card">
                No science resources found.
            </div>`;

        return;
    }


    grid.innerHTML =
        products
            .map(renderProduct)
            .join("");

}


function renderProduct(product) {

    const categoryIcons = {

        astronomy: "🔭",

        seismology: "🌎",

        archaeology: "🏺",

        plate_tectonics: "🌋",

        general_science: "🧪"

    };


    return `
        <article class="product-card">

            <div class="product-image">
                ${categoryIcons[product.category] || "🔬"}
            </div>

            <div class="product-body">

                <span class="product-category">
                    ${escapeHtml(
                        formatCategory(product.category)
                    )}
                </span>

                <h3>
                    ${escapeHtml(product.title)}
                </h3>

                <p>
                    ${escapeHtml(
                        truncate(product.description, 150)
                    )}
                </p>

                <div class="product-footer">

                    <span class="product-price">
                        ₱${Number(product.price).toFixed(2)}
                    </span>

                    <button
                        class="buy-button"
                        onclick="buyProduct('${product.id}')"
                    >
                        Buy
                    </button>

                </div>

                <button
                    class="review-button"
                    onclick="openReviewModal('${product.id}')"
                >
                    ★ Review
                </button>

            </div>

        </article>
    `;

}


window.buyProduct = async function(productId) {

    if (!currentUser) {

        openAuthModal();

        showToast(
            "Login before purchasing."
        );

        return;
    }


    try {

        const response =
            await fetch("/api/checkout", {

                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    productId
                })

            });


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Unable to start checkout."
            );

        }


        window.location.href =
            result.checkoutUrl;


    } catch (error) {

        console.error(error);

        showToast(error.message);

    }

};


async function createProduct(event) {

    event.preventDefault();

    if (!currentUser) {

        showToast(
            "Please login first."
        );

        return;
    }


    const title =
        document.getElementById("productTitle").value.trim();

    const description =
        document.getElementById("productDescription").value.trim();

    const category =
        document.getElementById("productCategory").value;

    const price =
        Number(
            document.getElementById("productPrice").value
        );

    const fileUrl =
        document.getElementById("productFileUrl").value.trim();


    try {

        const response =
            await fetch("/api/create-product", {

                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "Authorization":
                        `Bearer ${
                            (await supabaseClient.auth.getSession())
                                .data.session?.access_token
                        }`
                },

                body: JSON.stringify({

                    title,
                    description,
                    category,
                    price,
                    fileUrl

                })

            });


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Unable to publish product."
            );

        }


        event.target.reset();

        showToast(
            "Product published successfully."
        );

        await loadProducts();

    } catch (error) {

        console.error(error);

        showToast(error.message);

    }

}


async function loadDashboard() {

    if (!currentUser) return;


    try {

        const session =
            await supabaseClient.auth.getSession();

        const token =
            session.data.session?.access_token;


        if (!token) return;


        const response =
            await fetch("/api/dashboard", {

                headers: {
                    "Authorization":
                        `Bearer ${token}`
                }

            });


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Unable to load dashboard."
            );

        }


        const sales =
            result.sales || [];

        const purchases =
            result.purchases || [];


        document.getElementById(
            "salesCount"
        ).textContent = sales.length;


        document.getElementById(
            "purchaseCount"
        ).textContent = purchases.length;


        const revenue =
            sales.reduce(
                (total, item) =>
                    total + Number(item.seller_amount || 0),
                0
            );


        document.getElementById(
            "revenueAmount"
        ).textContent =
            `₱${revenue.toFixed(2)}`;


        document.getElementById(
            "salesHistory"
        ).innerHTML =
            renderHistory(sales, true);


        document.getElementById(
            "purchaseHistory"
        ).innerHTML =
            renderHistory(purchases, false);


    } catch (error) {

        console.error(error);

    }

}


function renderHistory(items, seller) {

    if (!items.length) {

        return `
            <p>
                No ${seller ? "sales" : "purchases"} yet.
            </p>
        `;

    }


    return items
        .map(item => {

            return `
                <div class="history-item">

                    <strong>
                        ${escapeHtml(
                            item.product_title || "Science Product"
                        )}
                    </strong>

                    <p>
                        ₱${Number(item.amount || 0).toFixed(2)}
                    </p>

                    <small>
                        ${escapeHtml(
                            item.status || "pending"
                        )}
                    </small>

                </div>
            `;

        })
        .join("");

}


window.openReviewModal = function(productId) {

    if (!currentUser) {

        openAuthModal();

        showToast(
            "Login before submitting a review."
        );

        return;
    }


    selectedRating = 0;

    updateStars();


    document
        .getElementById("reviewProductId")
        .value = productId;


    document
        .getElementById("reviewText")
        .value = "";


    document
        .getElementById("reviewModal")
        .classList.remove("hidden");

};


function closeReviewModal() {

    document
        .getElementById("reviewModal")
        .classList.add("hidden");

}


function updateStars() {

    document
        .querySelectorAll("#starRating button")
        .forEach(button => {

            const rating =
                Number(button.dataset.rating);

            button.classList.toggle(
                "active",
                rating <= selectedRating
            );

        });

}


async function submitReview(event) {

    event.preventDefault();


    if (!currentUser) {

        showToast(
            "Login required."
        );

        return;
    }


    if (
        selectedRating < 1 ||
        selectedRating > 5
    ) {

        showToast(
            "Please select a rating."
        );

        return;
    }


    const productId =
        document
            .getElementById("reviewProductId")
            .value;


    const reviewText =
        document
            .getElementById("reviewText")
            .value
            .trim();


    try {

        const session =
            await supabaseClient.auth.getSession();


        const token =
            session.data.session?.access_token;


        const response =
            await fetch("/api/reviews", {

                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "Authorization":
                        `Bearer ${token}`
                },

                body: JSON.stringify({

                    productId,
                    rating: selectedRating,
                    reviewText

                })

            });


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Unable to submit review."
            );

        }


        closeReviewModal();

        showToast(
            "Review submitted."
        );

    } catch (error) {

        console.error(error);

        showToast(error.message);

    }

}


function initializeVoiceflow() {

    const projectId =
        window.APP_CONFIG?.VOICEFLOW_PROJECT_ID;


    if (
        !projectId ||
        projectId === "YOUR_VOICEFLOW_PROJECT_ID"
    ) {

        return;
    }


    const script =
        document.createElement("script");


    script.type = "text/javascript";


    script.src =
        "https://cdn.voiceflow.com/widget-next/bundle.mjs";


    script.onload = () => {

        if (
            window.voiceflow &&
            typeof window.voiceflow.chat === "function"
        ) {

            window.voiceflow.chat.load({

                verify: {
                    projectID: projectId
                },

                url:
                    "https://general-runtime.voiceflow.com",

                versionID:
                    "production"

            });

        }

    };


    document.body.appendChild(script);

}


function handlePaymentReturn() {

    const params =
        new URLSearchParams(
            window.location.search
        );


    if (
        params.get("payment") === "success"
    ) {

        showToast(
            "Payment submitted. Your purchase will appear after PayMongo confirms payment."
        );

        window.history.replaceState(
            {},
            document.title,
            window.location.pathname
        );

    }


    if (
        params.get("payment") === "cancelled"
    ) {

        showToast(
            "Payment was cancelled."
        );

        window.history.replaceState(
            {},
            document.title,
            window.location.pathname
        );

    }

}


function formatCategory(value) {

    return String(value || "")
        .replaceAll("_", " ")
        .replace(/\b\w/g, char =>
            char.toUpperCase()
        );

}


function truncate(text, length) {

    if (!text) return "";

    return text.length > length
        ? text.substring(0, length) + "..."
        : text;

}


function escapeHtml(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


function showToast(message) {

    const toast =
        document.getElementById("toast");

    if (!toast) return;


    toast.textContent = message;

    toast.classList.add("show");


    clearTimeout(
        window.__toastTimer
    );


    window.__toastTimer =
        setTimeout(() => {

            toast.classList.remove("show");

        }, 4000);

}
