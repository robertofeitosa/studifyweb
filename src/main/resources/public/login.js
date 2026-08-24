const form = document.getElementById("loginForm");
const button = document.getElementById("loginButton");
const errorBox = document.getElementById("loginError");

async function redirectIfAuthenticated() {
    try {
        const response = await fetch("/api/auth/status", {
            credentials: "include",
            cache: "no-store"
        });

        const data = await response.json();
        if (data.authenticated) {
            window.location.replace("/");
        }
    } catch (_) {
        // A tela de login continua disponível mesmo se a checagem falhar.
    }
}

form.addEventListener("submit", async event => {
    event.preventDefault();
    errorBox.textContent = "";
    button.disabled = true;
    button.textContent = "Entrando...";

    try {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                username: form.username.value,
                password: form.password.value
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "Não foi possível entrar.");
        }

        window.location.replace("/");
    } catch (error) {
        errorBox.textContent = error.message || "Não foi possível entrar.";
    } finally {
        button.disabled = false;
        button.textContent = "Entrar no Studify";
    }
});

redirectIfAuthenticated();
