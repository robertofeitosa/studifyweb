(() => {
    const WELCOME_API_BASE = (() => {
        if (window.location.port === "5500" || window.location.port === "5501") {
            const host = window.location.hostname || "localhost";
            return `http://${host}:8080`;
        }
        return "";
    })();

    const JULIA_DRIVE_URL = "https://drive.google.com/drive/folders/1BWLSbVYAEcY1YW4-bP8C-IBBWzzX4bDu?usp=sharing";

    const profiles = {
        robertof7b: {
            className: "welcome-owner",
            title: "Bem-Vindo José Roberto",
            subtitle: "Seu espaço, sua evolução — transforme foco em progresso."
        },
        julia: {
            className: "welcome-julia",
            title: "Bem-Vinda Júlia",
            subtitle: "Seu espaço de estudos está pronto para você brilhar."
        },
        teste: {
            className: "welcome-test",
            title: "Bem-Vindo Usuário Teste",
            subtitle: "Explore, organize e experimente o Studify do seu jeito."
        }
    };

    const style = document.createElement("style");
    style.textContent = `
        .studify-welcome {
            --welcome-a: #00e5ff;
            --welcome-b: #7c3aed;
            --welcome-c: #ff2bd6;
            width: min(100%, 940px);
            margin: 0 auto 26px;
            padding: 1px;
            border-radius: 26px;
            position: relative;
            overflow: hidden;
            isolation: isolate;
            background: linear-gradient(120deg, var(--welcome-a), var(--welcome-b), var(--welcome-c), var(--welcome-a));
            background-size: 280% 280%;
            box-shadow: 0 16px 42px rgba(80, 70, 255, .22), 0 0 28px rgba(0, 229, 255, .12);
            animation: studifyWelcomeGradient 8s ease infinite, studifyWelcomeFloat 5s ease-in-out infinite;
        }

        .studify-welcome::before {
            content: "";
            position: absolute;
            inset: -70%;
            z-index: -2;
            background: conic-gradient(from 0deg, transparent 0 18%, rgba(255,255,255,.62) 24%, transparent 31% 64%, rgba(255,255,255,.28) 72%, transparent 80% 100%);
            animation: studifyWelcomeSpin 10s linear infinite;
        }

        .studify-welcome::after {
            content: "";
            position: absolute;
            inset: 0;
            z-index: -1;
            background: radial-gradient(circle at 18% 12%, rgba(255,255,255,.28), transparent 24%), radial-gradient(circle at 82% 84%, rgba(255,255,255,.14), transparent 30%);
            pointer-events: none;
        }

        .welcome-owner { --welcome-a: #00e5ff; --welcome-b: #6d3cff; --welcome-c: #ff2bd6; }
        .welcome-julia { --welcome-a: #ff4ecd; --welcome-b: #8b5cf6; --welcome-c: #ff8a00; }
        .welcome-test { --welcome-a: #00f5a0; --welcome-b: #00d9f5; --welcome-c: #8b5cf6; }

        .studify-welcome-panel {
            min-height: 108px;
            padding: 22px 30px;
            border-radius: 25px;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            position: relative;
            overflow: hidden;
            background: linear-gradient(135deg, rgba(8, 13, 30, .86), rgba(18, 20, 45, .78));
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            border: 1px solid rgba(255,255,255,.16);
        }

        .studify-welcome-copy {
            position: relative;
            z-index: 2;
            display: grid;
            justify-items: center;
            gap: 4px;
        }

        .studify-welcome-eyebrow {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            margin-bottom: 2px;
            font: 800 10px/1.2 "Segoe UI Variable", "Segoe UI", sans-serif;
            letter-spacing: .24em;
            text-transform: uppercase;
            color: rgba(255,255,255,.72);
        }

        .studify-welcome-eyebrow::before,
        .studify-welcome-eyebrow::after {
            content: "✦";
            color: var(--welcome-a);
            text-shadow: 0 0 12px var(--welcome-a);
            animation: studifyWelcomeTwinkle 1.9s ease-in-out infinite;
        }

        .studify-welcome-title {
            margin: 0;
            font-family: "Segoe UI Variable Display", "Aptos Display", "Segoe UI", sans-serif;
            font-size: clamp(1.45rem, 3vw, 2.15rem);
            line-height: 1.08;
            font-weight: 850;
            letter-spacing: -.035em;
            color: #fff;
            text-shadow: 0 0 22px rgba(255,255,255,.12), 0 8px 30px rgba(0,0,0,.28);
        }

        .studify-welcome-subtitle {
            margin: 4px 0 0;
            max-width: 660px;
            font: 600 clamp(.82rem, 1.6vw, .98rem)/1.45 "Segoe UI Variable", "Segoe UI", sans-serif;
            color: rgba(255,255,255,.74);
        }

        .studify-welcome-orb {
            position: absolute;
            width: 88px;
            height: 88px;
            border-radius: 50%;
            filter: blur(6px);
            opacity: .2;
            background: var(--welcome-a);
            animation: studifyWelcomeOrb 6s ease-in-out infinite alternate;
            pointer-events: none;
        }

        .studify-welcome-orb.one { left: -24px; top: -28px; }
        .studify-welcome-orb.two { right: -26px; bottom: -32px; background: var(--welcome-c); animation-delay: -2.2s; }

        .julia-drive-card {
            display: flex;
            align-items: center;
            gap: 16px;
            margin: 0 0 24px;
            padding: 18px 20px;
            border-radius: 22px;
            text-decoration: none;
            color: inherit;
            position: relative;
            overflow: hidden;
            border: 1px solid rgba(139, 92, 246, .28);
            background: linear-gradient(135deg, rgba(255, 78, 205, .10), rgba(139, 92, 246, .11), rgba(255, 138, 0, .08));
            box-shadow: 0 12px 32px rgba(107, 70, 193, .10);
            transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease;
        }

        .julia-drive-card::after {
            content: "";
            position: absolute;
            width: 170px;
            height: 170px;
            border-radius: 50%;
            right: -70px;
            top: -95px;
            background: radial-gradient(circle, rgba(255, 78, 205, .22), transparent 68%);
            pointer-events: none;
        }

        .julia-drive-card:hover {
            transform: translateY(-3px) scale(1.006);
            box-shadow: 0 18px 42px rgba(107, 70, 193, .20);
            border-color: rgba(255, 78, 205, .5);
        }

        .julia-drive-icon {
            width: 54px;
            height: 54px;
            flex: 0 0 54px;
            border-radius: 17px;
            display: grid;
            place-items: center;
            color: white;
            font-size: 25px;
            background: linear-gradient(135deg, #22c55e, #3b82f6 58%, #fbbf24);
            box-shadow: 0 10px 26px rgba(59, 130, 246, .23);
            transform: rotate(-2deg);
        }

        .julia-drive-copy {
            min-width: 0;
            display: grid;
            gap: 3px;
        }

        .julia-drive-copy small {
            font: 800 10px/1.2 "Segoe UI Variable", "Segoe UI", sans-serif;
            letter-spacing: .16em;
            text-transform: uppercase;
            color: #8b5cf6;
        }

        .julia-drive-copy strong {
            font: 800 1.02rem/1.25 "Segoe UI Variable", "Segoe UI", sans-serif;
        }

        .julia-drive-copy span {
            font-size: .88rem;
            opacity: .72;
        }

        .julia-drive-arrow {
            margin-left: auto;
            width: 40px;
            height: 40px;
            flex: 0 0 40px;
            display: grid;
            place-items: center;
            border-radius: 14px;
            font-size: 1.2rem;
            color: #fff;
            background: linear-gradient(135deg, #8b5cf6, #ff4ecd);
            box-shadow: 0 8px 20px rgba(139, 92, 246, .24);
            transition: transform .22s ease;
        }

        .julia-drive-card:hover .julia-drive-arrow { transform: translate(2px, -2px); }

        @keyframes studifyWelcomeGradient { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
        @keyframes studifyWelcomeFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        @keyframes studifyWelcomeSpin { to { transform: rotate(360deg); } }
        @keyframes studifyWelcomeTwinkle { 0%,100% { opacity: .45; transform: scale(.9); } 50% { opacity: 1; transform: scale(1.16); } }
        @keyframes studifyWelcomeOrb { from { transform: translate3d(0,0,0) scale(.9); } to { transform: translate3d(18px,12px,0) scale(1.2); } }

        @media (max-width: 700px) {
            .studify-welcome { margin-bottom: 20px; border-radius: 22px; }
            .studify-welcome-panel { min-height: 94px; padding: 18px 16px; border-radius: 21px; }
            .studify-welcome-subtitle { max-width: 92%; }
            .julia-drive-card { padding: 15px; gap: 12px; }
            .julia-drive-icon { width: 48px; height: 48px; flex-basis: 48px; }
            .julia-drive-copy span { font-size: .8rem; }
        }

        @media (prefers-reduced-motion: reduce) {
            .studify-welcome,
            .studify-welcome::before,
            .studify-welcome-eyebrow::before,
            .studify-welcome-eyebrow::after,
            .studify-welcome-orb { animation: none !important; }
        }
    `;
    document.head.appendChild(style);

    function renderWelcome(username) {
        const key = String(username || "").toLowerCase();
        const profile = profiles[key] || {
            className: "welcome-test",
            title: "Bem-Vindo ao Studify",
            subtitle: "Seu painel de estudos está pronto."
        };

        const main = document.querySelector(".main");
        if (!main || document.querySelector(".studify-welcome")) return;

        const welcome = document.createElement("div");
        welcome.className = `studify-welcome ${profile.className}`;
        welcome.setAttribute("role", "banner");
        welcome.setAttribute("aria-label", profile.title);
        welcome.innerHTML = `
            <div class="studify-welcome-panel">
                <span class="studify-welcome-orb one" aria-hidden="true"></span>
                <span class="studify-welcome-orb two" aria-hidden="true"></span>
                <div class="studify-welcome-copy">
                    <span class="studify-welcome-eyebrow">Studify</span>
                    <h2 class="studify-welcome-title">${profile.title}</h2>
                    <p class="studify-welcome-subtitle">${profile.subtitle}</p>
                </div>
            </div>
        `;
        main.prepend(welcome);
    }

    function renderJuliaDrive(username) {
        if (String(username || "").toLowerCase() !== "julia") return;
        if (document.querySelector(".julia-drive-card")) return;

        const home = document.getElementById("home");
        const header = home?.querySelector(".page-header");
        if (!home || !header) return;

        const card = document.createElement("a");
        card.className = "julia-drive-card reveal";
        card.href = JULIA_DRIVE_URL;
        card.target = "_blank";
        card.rel = "noopener noreferrer";
        card.setAttribute("aria-label", "Abrir Google Drive da Júlia em uma nova aba");
        card.innerHTML = `
            <div class="julia-drive-icon" aria-hidden="true">◈</div>
            <div class="julia-drive-copy">
                <small>Google Drive</small>
                <strong>Arquivos de estudo da Júlia</strong>
                <span>Acesse seus materiais e documentos em uma nova aba.</span>
            </div>
            <div class="julia-drive-arrow" aria-hidden="true">↗</div>
        `;

        header.insertAdjacentElement("afterend", card);
    }

    async function initWelcome() {
        try {
            const response = await fetch(`${WELCOME_API_BASE}/api/auth/status`, {
                method: "GET",
                credentials: "include",
                headers: { "Accept": "application/json" }
            });

            if (!response.ok) return;

            const data = await response.json();
            if (!data.authenticated) return;

            renderWelcome(data.username);
            renderJuliaDrive(data.username);
        } catch (error) {
            console.debug("Boas-vindas indisponíveis.", error);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initWelcome, { once: true });
    } else {
        initWelcome();
    }
})();
