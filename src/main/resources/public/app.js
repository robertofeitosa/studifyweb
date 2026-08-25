const API_BASE = (() => {
    if (window.location.port === "5500" || window.location.port === "5501") {
        const host = window.location.hostname || "localhost";
        return `http://${host}:8080`;
    }

    return "";
})();

const state = {
    subjects: [],
    currentSubject: null,
    organizeSubject: null,
    notes: [],
    currentUser: null,
    isPrimary: false,
    roadmapProgress: {},
    tutorConfigured: false,
    timer: {
        seconds: 0,
        interval: null,
        running: false,
        startedAt: null
    }
};

const pages = document.querySelectorAll(".page");
const navButtons = document.querySelectorAll(".nav");

const subjectSelect = document.getElementById("subjectSelect");
const organizeSubjectSelect = document.getElementById("organizeSubjectSelect");
const timerSubjectSelect = document.getElementById("timerSubjectSelect");

const contentList = document.getElementById("contentList");
const javaRoadmap = document.getElementById("javaRoadmap");
const subjectManageList = document.getElementById("subjectManageList");
const contentManageList = document.getElementById("contentManageList");
const reviewList = document.getElementById("reviewList");
const notesList = document.getElementById("notesList");
const sessionList = document.getElementById("sessionList");
const progressList = document.getElementById("progressList");
const userWelcome = document.getElementById("userWelcome");
const homeUserExtras = document.getElementById("homeUserExtras");
const studyRoadmapList = document.getElementById("studyRoadmapList");
const studyPathPercentage = document.getElementById("studyPathPercentage");
const studyPathProgressLabel = document.getElementById("studyPathProgressLabel");
const studyPathProgressBar = document.getElementById("studyPathProgressBar");
const openTutorFromRoadmap = document.getElementById("openTutorFromRoadmap");
const tutorMessages = document.getElementById("tutorMessages");
const tutorForm = document.getElementById("tutorForm");
const tutorInput = document.getElementById("tutorInput");
const tutorSendBtn = document.getElementById("tutorSendBtn");
const clearTutorHistory = document.getElementById("clearTutorHistory");
const tutorConfigNotice = document.getElementById("tutorConfigNotice");

const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const modalCancel = document.getElementById("modalCancel");
const modalClose = document.getElementById("modalClose");
const modalConfirm = document.getElementById("modalConfirm");

const themeToggle = document.getElementById("themeToggle");
const logoutBtn = document.getElementById("logoutBtn");
const newContentBtn = document.getElementById("newContentBtn");

const timerDisplay = document.getElementById("timerDisplay");
const timerStatus = document.getElementById("timerStatus");
const timerStartBtn = document.getElementById("timerStartBtn");
const timerPauseBtn = document.getElementById("timerPauseBtn");
const timerResetBtn = document.getElementById("timerResetBtn");
const timerSaveBtn = document.getElementById("timerSaveBtn");

const toast = document.getElementById("toast");

let modalAction = null;
let toastTimeout = null;

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimeout);

    toastTimeout = setTimeout(() => {
        toast.classList.remove("show");
    }, 2200);
}

function openModal(title, html, action) {
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    modalAction = action;
    modal.classList.remove("hidden");

    setTimeout(() => {
        const firstInput = modalBody.querySelector(
            "input, textarea, select"
        );

        if (firstInput) firstInput.focus();
    }, 60);
}

function closeModal() {
    modal.classList.add("hidden");
    modalAction = null;
}

modalCancel.addEventListener("click", closeModal);
modalClose.addEventListener("click", closeModal);

modal.addEventListener("click", event => {
    if (event.target === modal) closeModal();
});

modalConfirm.addEventListener("click", async () => {
    if (modalAction) {
        await modalAction();
    }
});

async function api(url, options = {}) {
    let response;

    try {
        response = await fetch(`${API_BASE}${url}`, {
            ...options,
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {})
            }
        });
    } catch (error) {
        throw new Error(
            "Não foi possível conectar ao Studify."
        );
    }

    const data = await response.json();

    if (response.status === 401) {
        window.location.href = `${API_BASE}/login.html`;
        throw new Error("Sessão expirada.");
    }

    if (!response.ok) {
        throw new Error(
            data.error || "Erro na operação."
        );
    }

    return data;
}

function setActivePage(pageName) {
    navButtons.forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.page === pageName
        );
    });

    pages.forEach(page => {
        page.classList.toggle(
            "active",
            page.id === pageName
        );
    });

    
    themeToggle.style.display =
        pageName === "home" ? "block" : "none";
}


window.goToPage = async function(pageName) {
    setActivePage(pageName);

    if (pageName === "organize") {
        await loadOrganizer();
    }

    if (pageName === "reviews") {
        await loadReviews();
    }

    if (pageName === "notes") {
        await loadNotes();
    }

    if (pageName === "timer") {
        await loadSessions();
    }

    if (pageName === "progress") {
        await loadProgress();
    }

    if (pageName === "studyPath") {
        await loadStudyRoadmap();
    }

    if (pageName === "tutor") {
        await loadTutorHistory();
    }
};

navButtons.forEach(button => {
    button.addEventListener("click", async () => {
        await window.goToPage(button.dataset.page);
    });
});


const integratedStudyRoadmap = [
    {
        id: "stage-1",
        title: "1. Fundamentos",
        java: "Estrutura do programa, variáveis, tipos e condicionais",
        aed: "Noção de algoritmo e análise de complexidade (Big O)",
        book: "Capítulo 1 — Introdução a algoritmos",
        goal: "Entender como um algoritmo vira código Java e começar a comparar eficiência.",
        steps: [
            ["s1-java", "LP/Java: revisar classe, main, variáveis, tipos e if/else."],
            ["s1-aed", "AED: entender algoritmo, entrada, processamento, saída e Big O."],
            ["s1-book", "Livro: estudar o Cap. 1 até entender busca binária e Big O."],
            ["s1-practice", "Prática: escrever exemplos simples e comparar busca linear x busca binária no papel."]
        ]
    },
    {
        id: "stage-2",
        title: "2. Loops",
        java: "for, while e do-while",
        aed: "Busca sequencial e percursos",
        book: "Capítulo 1 — reforço",
        goal: "Usar repetição para percorrer dados e perceber o custo de examinar item por item.",
        steps: [
            ["s2-java", "LP/Java: dominar for e while; depois praticar do-while."],
            ["s2-aed", "AED: implementar mentalmente a busca sequencial e identificar o pior caso."],
            ["s2-book", "Livro: revisar o contraste entre busca simples e busca binária."],
            ["s2-practice", "Prática: percorrer valores e procurar um elemento usando loop."]
        ]
    },
    {
        id: "stage-3",
        title: "3. Arrays e Vetores",
        java: "Arrays, índices, leitura e alteração de posições",
        aed: "Busca binária em dados ordenados",
        book: "Capítulo 1",
        goal: "Entender a estrutura onde vários algoritmos básicos operam.",
        steps: [
            ["s3-java", "LP/Java: criar, preencher e percorrer arrays."],
            ["s3-aed", "AED: entender pré-condição de ordenação e lógica da busca binária."],
            ["s3-book", "Livro: refazer o exemplo de busca binária passo a passo."],
            ["s3-practice", "Prática: implementar busca sequencial e depois busca binária em Java."]
        ]
    },
    {
        id: "stage-4",
        title: "4. Métodos",
        java: "Parâmetros, retorno e decomposição de problemas",
        aed: "Modularização de algoritmos",
        book: "Capítulo 2 — Ordenação por seleção",
        goal: "Transformar partes do algoritmo em métodos pequenos e reutilizáveis.",
        steps: [
            ["s4-java", "LP/Java: criar métodos com parâmetros e retorno."],
            ["s4-aed", "AED: separar busca, comparação e troca em operações menores."],
            ["s4-book", "Livro: iniciar o Cap. 2 e entender o raciocínio da seleção."],
            ["s4-practice", "Prática: criar métodos para buscar menor valor, trocar posições e imprimir vetor."]
        ]
    },
    {
        id: "stage-5",
        title: "5. Ordenação",
        java: "Arrays + loops + métodos",
        aed: "Ordenação por seleção e custo O(n²)",
        book: "Capítulo 2",
        goal: "Conectar código de manipulação de vetor com um algoritmo clássico de ordenação.",
        steps: [
            ["s5-java", "LP/Java: combinar loops aninhados, arrays e métodos."],
            ["s5-aed", "AED: acompanhar cada seleção do menor elemento."],
            ["s5-book", "Livro: concluir o Cap. 2 e entender por que a seleção é O(n²)."],
            ["s5-practice", "Prática: implementar ordenação por seleção sem copiar a solução do livro."]
        ]
    },
    {
        id: "stage-6",
        title: "6. Recursão",
        java: "Métodos que chamam a si mesmos",
        aed: "Caso-base, pilha de chamadas e recursão",
        book: "Capítulo 3 — Recursão",
        goal: "Entender quando uma solução pode ser definida em termos de uma versão menor do problema.",
        steps: [
            ["s6-java", "LP/Java: entender chamada de método, retorno e caso-base."],
            ["s6-aed", "AED: visualizar a pilha de chamadas."],
            ["s6-book", "Livro: estudar o Cap. 3 inteiro."],
            ["s6-practice", "Prática: contagem regressiva, fatorial e soma recursiva simples."]
        ]
    },
    {
        id: "stage-7",
        title: "7. POO e Estruturas Lineares",
        java: "Classes, objetos, referências e encapsulamento",
        aed: "Listas encadeadas, pilhas e filas",
        book: "Capítulos 2 e 3 como apoio",
        goal: "Usar objetos para representar nós e entender estruturas que não dependem apenas de arrays.",
        steps: [
            ["s7-java", "LP/Java: dominar classes, objetos, atributos, métodos e encapsulamento."],
            ["s7-list", "AED: entender lista encadeada e a ideia de nó + referência para o próximo."],
            ["s7-stack", "AED: revisar pilha (LIFO) e relacionar com a pilha de chamadas do Cap. 3."],
            ["s7-queue", "AED: entender fila (FIFO) e suas operações básicas."],
            ["s7-practice", "Prática: criar uma classe Node e implementar uma estrutura linear simples em Java."]
        ]
    },
    {
        id: "stage-8",
        title: "8. Collections e Tabelas Hash",
        java: "ArrayList, Map e HashMap",
        aed: "Tabelas hash, chave/valor, colisões e busca",
        book: "Capítulo 5 — Tabelas hash",
        goal: "Entender estruturas dinâmicas e por que hashing permite buscas muito rápidas em média.",
        steps: [
            ["s8-java", "LP/Java: praticar ArrayList, Map e HashMap."],
            ["s8-aed", "AED: entender função hash, chave/valor, colisões e casos de uso."],
            ["s8-book", "Livro: estudar o Cap. 5."],
            ["s8-practice", "Prática: criar um cadastro com HashMap e comparar a ideia com busca em array."]
        ]
    },
    {
        id: "stage-9",
        title: "9. Árvores e Grafos",
        java: "Classes, referências, Queue e Collections",
        aed: "BST, busca em árvores, grafos, BFS e DFS",
        book: "Capítulo 6 para grafos/BFS + material de AED para árvores e DFS",
        goal: "Representar relações e estruturas hierárquicas usando objetos e coleções.",
        steps: [
            ["s9-tree", "AED: entender árvore de busca binária (BST) e suas propriedades."],
            ["s9-tree-search", "AED: praticar busca em árvore e comparar com busca em vetor."],
            ["s9-graph", "AED: entender vértices, arestas e formas de representar grafos."],
            ["s9-book", "Livro: estudar o Cap. 6 e entender BFS."],
            ["s9-searches", "AED/Java: implementar BFS com Queue e estudar DFS como complemento." ]
        ]
    },
    {
        id: "stage-10",
        title: "10. Caminhos, Estratégias e Projeto",
        java: "PriorityQueue, exceções, arquivos e projeto final",
        aed: "Dijkstra, NP-Complete, algoritmos gulosos e programação dinâmica",
        book: "Capítulos 7, 8 e 9",
        goal: "Fechar a conexão entre LP e AED implementando algoritmos maiores e um projeto integrado.",
        steps: [
            ["s10-dijkstra", "AED/Java: estudar Dijkstra e implementar com PriorityQueue quando estiver confortável."],
            ["s10-greedy", "Livro/AED: estudar algoritmos gulosos no Cap. 8."],
            ["s10-np", "AED: relacionar NP-Complete com os limites de soluções exatas e o Cap. 8."],
            ["s10-dp", "Livro/AED: estudar programação dinâmica no Cap. 9."],
            ["s10-java", "LP/Java: usar tratamento de exceções e arquivos para tornar o projeto mais completo."],
            ["s10-project", "Projeto final: montar uma aplicação Java que use pelo menos duas estruturas/algoritmos estudados."]
        ]
    }
];

function isPrimaryProfile() {
    return Boolean(state.isPrimary);
}

async function loadCurrentUser() {
    const auth = await api("/api/auth/status");
    state.currentUser = auth.username || null;
    state.isPrimary = Boolean(auth.primary);
    configureUserExperience();
}

function configureUserExperience() {
    const username = String(state.currentUser || "").toLowerCase();
    const primary = Boolean(state.isPrimary);

    document.querySelectorAll(".primary-only").forEach(element => {
        element.classList.toggle("hidden", !primary);
    });

    if (userWelcome) {
        if (primary) {
            userWelcome.innerHTML = `
                <span class="welcome-spark">✦</span>
                <strong>Bem-Vindo José Roberto</strong>
                <span class="welcome-spark">✦</span>
            `;
        } else if (username === "julia") {
            userWelcome.innerHTML = `
                <span class="welcome-spark">✦</span>
                <strong>Bem-Vinda Júlia</strong>
                <span class="welcome-spark">✦</span>
            `;
        } else {
            userWelcome.innerHTML = `
                <span class="welcome-spark">✦</span>
                <strong>Bem-vindo ao Studify</strong>
                <span class="welcome-spark">✦</span>
            `;
        }
    }

    if (homeUserExtras) {
        if (username === "julia") {
            homeUserExtras.innerHTML = `
                <article class="card user-extra-card julia-drive-card reveal">
                    <div>
                        <span class="roadmap-kicker">ACESSO DA JÚLIA</span>
                        <h3>Materiais no Google Drive</h3>
                        <p>Abra sua pasta de estudos diretamente pelo Studify.</p>
                    </div>
                    <a class="primary link-button" href="https://drive.google.com/drive/folders/1BWLSbVYAEcY1YW4-bP8C-IBBWzzX4bDu?usp=sharing" target="_blank" rel="noopener noreferrer">Abrir Google Drive ↗</a>
                </article>
            `;
        } else if (primary) {
            homeUserExtras.innerHTML = `
                <article class="card user-extra-card roberto-study-card reveal">
                    <div>
                        <span class="roadmap-kicker">NOVA ÁREA DE ESTUDO</span>
                        <h3>LP + AED + Entendendo Algoritmos</h3>
                        <p>Siga a trilha integrada e converse com o Tutor IA quando surgir uma dúvida.</p>
                    </div>
                    <div class="user-extra-actions">
                        <button class="primary" type="button" onclick="goToPage('studyPath')">Abrir trilha</button>
                        <button class="secondary" type="button" onclick="goToPage('tutor')">Tutor IA</button>
                    </div>
                </article>
            `;
        } else {
            homeUserExtras.innerHTML = "";
        }
    }
}

async function loadStudyRoadmap() {
    if (!isPrimaryProfile()) return;
    const data = await api("/api/study-roadmap");
    state.roadmapProgress = data.progress || {};
    renderStudyRoadmap();
}

function renderStudyRoadmap() {
    if (!studyRoadmapList) return;

    const allSteps = integratedStudyRoadmap.flatMap(stage => stage.steps);
    const completed = allSteps.filter(([key]) => state.roadmapProgress[key]).length;
    const percentage = allSteps.length ? Math.round((completed / allSteps.length) * 100) : 0;

    studyPathPercentage.textContent = `${percentage}%`;
    studyPathProgressLabel.textContent = `${completed} de ${allSteps.length} passos concluídos`;
    studyPathProgressBar.style.width = `${percentage}%`;

    studyRoadmapList.innerHTML = integratedStudyRoadmap.map((stage, index) => {
        const stageDone = stage.steps.filter(([key]) => state.roadmapProgress[key]).length;
        const stageComplete = stageDone === stage.steps.length;

        return `
            <article class="card integrated-stage ${stageComplete ? "complete" : ""}">
                <div class="integrated-stage-number">${index + 1}</div>
                <div class="integrated-stage-main">
                    <div class="integrated-stage-head">
                        <div>
                            <h3>${escapeHtml(stage.title)}</h3>
                            <p>${escapeHtml(stage.goal)}</p>
                        </div>
                        <span class="stage-counter">${stageDone}/${stage.steps.length}</span>
                    </div>

                    <div class="study-bridge-grid">
                        <div><span>LP / Java</span><strong>${escapeHtml(stage.java)}</strong></div>
                        <div><span>AED</span><strong>${escapeHtml(stage.aed)}</strong></div>
                        <div><span>Livro</span><strong>${escapeHtml(stage.book)}</strong></div>
                    </div>

                    <div class="stage-steps">
                        ${stage.steps.map(([key, label]) => `
                            <label class="stage-step ${state.roadmapProgress[key] ? "done" : ""}">
                                <input type="checkbox" data-roadmap-key="${escapeHtml(key)}" ${state.roadmapProgress[key] ? "checked" : ""}>
                                <span>${escapeHtml(label)}</span>
                            </label>
                        `).join("")}
                    </div>

                    <button
                        class="stage-tutor-button"
                        type="button"
                        data-stage-tutor="${index}"
                    >
                        ✦ Conversar com o Tutor sobre esta etapa
                    </button>
                </div>
            </article>
        `;
    }).join("");
}

if (studyRoadmapList) {
    studyRoadmapList.addEventListener("change", async event => {
        const checkbox = event.target.closest("[data-roadmap-key]");
        if (!checkbox) return;

        const key = checkbox.dataset.roadmapKey;
        state.roadmapProgress[key] = checkbox.checked;

        try {
            await api("/api/study-roadmap", {
                method: "PUT",
                body: JSON.stringify({ itemKey: key, completed: checkbox.checked })
            });
            renderStudyRoadmap();
        } catch (error) {
            state.roadmapProgress[key] = !checkbox.checked;
            renderStudyRoadmap();
            showToast(error.message);
        }
    });

    studyRoadmapList.addEventListener("click", async event => {
        const button = event.target.closest("[data-stage-tutor]");
        if (!button) return;

        const stage = integratedStudyRoadmap[Number(button.dataset.stageTutor)];
        if (!stage) return;

        await window.goToPage("tutor");
        tutorInput.value = `Estou na etapa "${stage.title}". Me explique como conectar LP/Java (${stage.java}) com AED (${stage.aed}) e com ${stage.book}, e me diga o próximo passo prático.`;
        tutorInput.focus();
    });
}

if (openTutorFromRoadmap) {
    openTutorFromRoadmap.addEventListener("click", () => window.goToPage("tutor"));
}

function renderTutorMessages(messages) {
    if (!tutorMessages) return;

    if (!messages.length) {
        tutorMessages.innerHTML = `
            <div class="tutor-empty">
                <span>✦</span>
                <strong>Seu tutor está pronto.</strong>
                <p>Pergunte sobre Java, AED ou uma etapa da trilha.</p>
            </div>
        `;
        return;
    }

    tutorMessages.innerHTML = "";

    messages.forEach(message => {
        const wrapper = document.createElement("div");
        wrapper.className = `tutor-message ${message.role === "user" ? "user" : "assistant"}`;

        const label = document.createElement("small");
        label.textContent = message.role === "user" ? "Você" : "Tutor IA";

        const content = document.createElement("div");
        content.className = "tutor-message-content";
        content.textContent = message.content;

        wrapper.append(label, content);
        tutorMessages.appendChild(wrapper);
    });

    tutorMessages.scrollTop = tutorMessages.scrollHeight;
}

async function loadTutorHistory() {
    if (!isPrimaryProfile() || !tutorMessages) return;

    const data = await api("/api/tutor/history");
    state.tutorConfigured = Boolean(data.configured);
    renderTutorMessages(data.messages || []);

    if (tutorConfigNotice) {
        if (state.tutorConfigured) {
            tutorConfigNotice.classList.add("hidden");
            tutorConfigNotice.textContent = "";
        } else {
            tutorConfigNotice.classList.remove("hidden");
            tutorConfigNotice.innerHTML = `
                <strong>Falta configurar a OpenAI API.</strong>
                <span>Adicione a variável <code>OPENAI_API_KEY</code> no ambiente do Studify. O passo a passo está no arquivo GUIA_PASSO_A_PASSO.md.</span>
            `;
        }
    }

    if (tutorSendBtn) tutorSendBtn.disabled = !state.tutorConfigured;
}

async function sendTutorMessage(message) {
    if (!message.trim() || !state.tutorConfigured) return;

    const historyData = await api("/api/tutor/history");
    const optimistic = [
        ...(historyData.messages || []),
        { role: "user", content: message },
        { role: "assistant", content: "Pensando…" }
    ];
    renderTutorMessages(optimistic);

    tutorSendBtn.disabled = true;
    tutorInput.disabled = true;

    try {
        await api("/api/tutor/chat", {
            method: "POST",
            body: JSON.stringify({ message })
        });
        tutorInput.value = "";
        await loadTutorHistory();
    } catch (error) {
        showToast(error.message || "Não foi possível falar com o Tutor IA.");
        await loadTutorHistory();
    } finally {
        tutorInput.disabled = false;
        tutorSendBtn.disabled = !state.tutorConfigured;
        tutorInput.focus();
    }
}

if (tutorForm) {
    tutorForm.addEventListener("submit", async event => {
        event.preventDefault();
        await sendTutorMessage(tutorInput.value);
    });
}

document.querySelectorAll("[data-tutor-prompt]").forEach(button => {
    button.addEventListener("click", () => {
        if (!tutorInput) return;
        tutorInput.value = button.dataset.tutorPrompt;
        tutorInput.focus();
    });
});

if (clearTutorHistory) {
    clearTutorHistory.addEventListener("click", async () => {
        if (!confirm("Limpar todo o histórico do Tutor IA?")) return;
        await api("/api/tutor/history", { method: "DELETE" });
        await loadTutorHistory();
        showToast("Conversa apagada.");
    });
}

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;

    if (theme === "dark") {
        themeToggle.textContent = "☀ Tema claro";
    } else {
        themeToggle.textContent = "☾ Tema escuro";
    }

    localStorage.setItem("studify-theme", theme);
}


if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
        try {
            await fetch(`${API_BASE}/api/auth/logout`, {
                method: "POST",
                credentials: "include"
            });
        } finally {
            window.location.href = `${API_BASE}/login.html`;
        }
    });
}

themeToggle.addEventListener("click", () => {
    const current =
        document.documentElement.dataset.theme || "light";

    applyTheme(
        current === "dark" ? "light" : "dark"
    );
});

function initTheme() {
    const saved = localStorage.getItem("studify-theme");

    if (saved) {
        applyTheme(saved);
        return;
    }

    const prefersDark = window.matchMedia &&
        window.matchMedia(
            "(prefers-color-scheme: dark)"
        ).matches;

    applyTheme(prefersDark ? "dark" : "light");
}

async function loadSubjects() {
    state.subjects = await api("/api/subjects");

    const hasSubjects = state.subjects.length > 0;

    const options = state.subjects
        .map(subject => `
            <option value="${escapeHtml(subject.name)}">
                ${escapeHtml(subject.name)}
            </option>
        `)
        .join("");

    const emptyOption = `
        <option value="">Nenhuma matéria cadastrada</option>
    `;

    subjectSelect.innerHTML = hasSubjects ? options : emptyOption;
    organizeSubjectSelect.innerHTML = hasSubjects ? options : emptyOption;

    subjectSelect.disabled = !hasSubjects;
    organizeSubjectSelect.disabled = !hasSubjects;
    newContentBtn.disabled = !hasSubjects;

    timerSubjectSelect.innerHTML = `
        <option value="">Estudo geral</option>
        ${state.subjects.map(subject => `
            <option value="${subject.id}">
                ${escapeHtml(subject.name)}
            </option>
        `).join("")}
    `;

    if (!hasSubjects) {
        state.currentSubject = null;
        state.organizeSubject = null;
    } else {
        const subjectNames = state.subjects.map(subject => subject.name);

        if (!subjectNames.includes(state.currentSubject)) {
            state.currentSubject = state.subjects[0].name;
        }

        if (!subjectNames.includes(state.organizeSubject)) {
            state.organizeSubject = state.subjects[0].name;
        }
    }

    if (state.currentSubject) {
        subjectSelect.value =
            state.currentSubject;
    }

    if (state.organizeSubject) {
        organizeSubjectSelect.value =
            state.organizeSubject;
    }

    await loadContents();
}

subjectSelect.addEventListener(
    "change",
    async () => {
        state.currentSubject =
            subjectSelect.value;

        await loadContents();
    }
);

organizeSubjectSelect.addEventListener(
    "change",
    async () => {
        state.organizeSubject =
            organizeSubjectSelect.value;

        await loadContentManager();
    }
);

function isJavaLabSubject(subjectName) {
    const normalized = String(subjectName || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

    return normalized === "lp" ||
        (normalized.includes("laboratorio") && normalized.includes("programacao"));
}

function renderJavaRoadmap(contents) {
    if (!isJavaLabSubject(state.currentSubject)) {
        javaRoadmap.classList.add("hidden");
        javaRoadmap.innerHTML = "";
        return;
    }

    const stages = [
        {
            title: "1. Fundamentos",
            subtitle: "Comece pela base da linguagem.",
            from: 0,
            to: 4
        },
        {
            title: "2. Controle de fluxo",
            subtitle: "Aprenda a controlar decisões e repetições.",
            from: 4,
            to: 6
        },
        {
            title: "3. Métodos e estruturas",
            subtitle: "Organize lógica, dados e texto.",
            from: 6,
            to: 9
        },
        {
            title: "4. Orientação a Objetos",
            subtitle: "Entre no núcleo da programação em Java.",
            from: 9,
            to: 14
        },
        {
            title: "5. Java aplicado",
            subtitle: "Trabalhe com erros, coleções e arquivos.",
            from: 14,
            to: 17
        },
        {
            title: "6. Projeto final",
            subtitle: "Junte os conceitos em uma aplicação.",
            from: 17,
            to: 18
        }
    ];

    const learned = contents.filter(content =>
        content.status === "Aprendido" ||
        content.status === "Solidificado"
    ).length;

    const percentage = contents.length
        ? Math.round((learned / contents.length) * 100)
        : 0;

    javaRoadmap.innerHTML = `
        <div class="roadmap-head">
            <div>
                <span class="roadmap-kicker">TRILHA DE APRENDIZADO</span>
                <h3>Roadmap Java</h3>
                <p>
                    Siga a sequência como guia para Laboratório de Programação.
                </p>
            </div>

            <div class="roadmap-progress-box">
                <strong>${percentage}%</strong>
                <span>${learned} de ${contents.length} tópicos aprendidos</span>
            </div>
        </div>

        <div class="roadmap-progress-track" aria-label="Progresso da roadmap Java">
            <div style="width: ${percentage}%"></div>
        </div>

        <div class="roadmap-stages">
            ${stages.map(stage => {
                const items = contents.slice(stage.from, stage.to);
                if (!items.length) return "";

                return `
                    <section class="roadmap-stage">
                        <div class="roadmap-stage-head">
                            <h4>${stage.title}</h4>
                            <p>${stage.subtitle}</p>
                        </div>

                        <div class="roadmap-line">
                            ${items.map((content, itemIndex) => `
                                <div class="roadmap-topic roadmap-${statusClass(content.status)}">
                                    <div class="roadmap-node" aria-hidden="true">
                                        ${stage.from + itemIndex + 1}
                                    </div>

                                    <div class="roadmap-topic-body">
                                        <strong>${escapeHtml(content.name)}</strong>
                                        <span class="status ${statusClass(content.status)}">
                                            ${escapeHtml(content.status)}
                                        </span>
                                    </div>
                                </div>
                            `).join("")}
                        </div>
                    </section>
                `;
            }).join("")}
        </div>

        <div class="roadmap-list-label">
            <span>Conteúdos de LP</span>
            <small>Use os botões abaixo para editar, mudar status ou criar revisões.</small>
        </div>
    `;

    javaRoadmap.classList.remove("hidden");
}

async function loadContents() {
    if (!state.currentSubject) {
        javaRoadmap.classList.add("hidden");
        javaRoadmap.innerHTML = "";

        contentList.innerHTML = `
            <div class="empty">
                Cadastre uma matéria.
            </div>
        `;
        return;
    }

    const contents = await api(
        `/api/contents?subject=${
            encodeURIComponent(
                state.currentSubject
            )
        }`
    );

    renderJavaRoadmap(contents);

    if (!contents.length) {
        contentList.innerHTML = `
            <div class="empty">
                Nenhum conteúdo cadastrado.
            </div>
        `;
        return;
    }

    contentList.innerHTML = contents
        .map(content => `
            <div class="content-row">
                <div>
                    <div class="content-title">
                        ${escapeHtml(content.name)}
                    </div>

                    <div class="content-meta">
                        Status atual
                    </div>
                </div>

                <div class="row-actions">
                    <span class="
                        status
                        ${statusClass(content.status)}
                    ">
                        ${escapeHtml(content.status)}
                    </span>

                    <button
                        class="secondary"
                        onclick="
                            editContent(
                                ${content.id},
                                '${escapeJs(content.name)}'
                            )
                        "
                    >
                        Editar
                    </button>

                    <button
                        class="secondary"
                        onclick="
                            changeStatus(
                                ${content.id},
                                '${escapeJs(content.status)}'
                            )
                        "
                    >
                        Status
                    </button>

                    <button
                        class="secondary"
                        onclick="
                            createReview(
                                ${content.id},
                                '${escapeJs(content.name)}'
                            )
                        "
                    >
                        Revisar
                    </button>

                    <button
                        class="danger"
                        onclick="
                            deleteContent(${content.id})
                        "
                    >
                        Excluir
                    </button>
                </div>
            </div>
        `)
        .join("");
}

document
    .getElementById("newSubjectBtn")
    .addEventListener("click", () => {
        openModal(
            "Nova matéria",
            `
            <div class="form-stack">
                <div class="field">
                    <label>Nome da matéria</label>
                    <input
                        id="modalInput"
                        placeholder="Ex.: Cálculo II"
                    >
                </div>
            </div>
            `,
            async () => {
                const name =
                    document
                        .getElementById("modalInput")
                        .value
                        .trim();

                if (!name) return;

                await api("/api/subjects", {
                    method: "POST",
                    body: JSON.stringify({ name })
                });

                closeModal();

                state.currentSubject = name;
                state.organizeSubject = name;

                await loadSubjects();
                await loadOrganizer();
                await loadStudySummary();

                showToast("Matéria criada.");
            }
        );
    });

document
    .getElementById("newContentBtn")
    .addEventListener("click", () => {
        if (!state.currentSubject) return;

        openModal(
            "Adicionar conteúdo",
            `
            <div class="form-stack">
                <div class="field">
                    <label>Conteúdo</label>
                    <input
                        id="modalInput"
                        placeholder="Ex.: Busca Binária"
                    >
                </div>
            </div>
            `,
            async () => {
                const name =
                    document
                        .getElementById("modalInput")
                        .value
                        .trim();

                if (!name) return;

                await api("/api/contents", {
                    method: "POST",
                    body: JSON.stringify({
                        subject:
                            state.currentSubject,
                        name
                    })
                });

                closeModal();
                await loadContents();
                await loadStudySummary();

                showToast("Conteúdo adicionado.");
            }
        );
    });

window.editContent = function(
    id,
    currentName
) {
    openModal(
        "Editar conteúdo",
        `
        <div class="form-stack">
            <div class="field">
                <label>Novo nome</label>
                <input
                    id="modalInput"
                    value="${escapeHtml(currentName)}"
                >
            </div>
        </div>
        `,
        async () => {
            const name =
                document
                    .getElementById("modalInput")
                    .value
                    .trim();

            if (!name) return;

            await api("/api/contents", {
                method: "PUT",
                body: JSON.stringify({
                    id,
                    name
                })
            });

            closeModal();

            await loadContents();
            await loadOrganizer();

            showToast("Conteúdo atualizado.");
        }
    );
};

window.changeStatus = function(
    id,
    current
) {
    const statuses = [
        "Não iniciado",
        "Estudando",
        "Aprendido",
        "Solidificado"
    ];

    openModal(
        "Alterar status",
        `
        <div class="form-stack">
            <div class="field">
                <label>Novo status</label>

                <select id="statusSelect">
                    ${statuses
                        .map(status => `
                            <option
                                ${
                                    status === current
                                    ? "selected"
                                    : ""
                                }
                            >
                                ${status}
                            </option>
                        `)
                        .join("")}
                </select>
            </div>
        </div>
        `,
        async () => {
            const status =
                document
                    .getElementById("statusSelect")
                    .value;

            await api("/api/contents", {
                method: "PUT",
                body: JSON.stringify({
                    id,
                    status
                })
            });

            closeModal();

            await loadContents();
            await loadProgress();

            showToast("Status atualizado.");
        }
    );
};

window.createReview = function(
    contentId,
    name
) {
    const suggested = new Date();
    suggested.setDate(
        suggested.getDate() + 7
    );

    const date =
        suggested
            .toISOString()
            .slice(0, 10);

    openModal(
        `Revisão: ${name}`,
        `
        <div class="form-stack">
            <div class="field">
                <label>Data da revisão</label>

                <input
                    id="reviewDate"
                    type="date"
                    value="${date}"
                >
            </div>
        </div>
        `,
        async () => {
            const reviewDate =
                document
                    .getElementById("reviewDate")
                    .value;

            if (!reviewDate) return;

            await api("/api/reviews", {
                method: "POST",
                body: JSON.stringify({
                    contentId,
                    date: reviewDate
                })
            });

            closeModal();

            await loadReviews();

            showToast("Revisão criada.");
        }
    );
};

window.deleteContent = async function(id) {
    if (
        !confirm(
            "Excluir este conteúdo?"
        )
    ) {
        return;
    }

    await api(
        `/api/contents?id=${id}`,
        {
            method: "DELETE"
        }
    );

    await loadContents();
    await loadOrganizer();
    await loadStudySummary();

    showToast("Conteúdo excluído.");
};

async function loadOrganizer() {
    await loadSubjects();
    renderSubjectManager();
    await loadContentManager();
}

function renderSubjectManager() {
    if (!state.subjects.length) {
        subjectManageList.innerHTML = `
            <div class="empty">
                Nenhuma matéria.
            </div>
        `;
        return;
    }

    subjectManageList.innerHTML =
        state.subjects
            .map((subject, index) => `
                <div class="manage-row">
                    <div class="manage-title">
                        ${escapeHtml(subject.name)}
                    </div>

                    <div class="row-actions">
                        <button
                            class="icon-btn"
                            ${
                                index === 0
                                ? "disabled"
                                : ""
                            }
                            onclick="
                                moveSubject(
                                    ${subject.id},
                                    'up'
                                )
                            "
                        >
                            ↑
                        </button>

                        <button
                            class="icon-btn"
                            ${
                                index ===
                                state.subjects.length - 1
                                ? "disabled"
                                : ""
                            }
                            onclick="
                                moveSubject(
                                    ${subject.id},
                                    'down'
                                )
                            "
                        >
                            ↓
                        </button>

                        <button
                            class="secondary"
                            onclick="
                                editSubject(
                                    ${subject.id},
                                    '${escapeJs(subject.name)}'
                                )
                            "
                        >
                            Editar
                        </button>

                        <button
                            class="danger"
                            onclick="
                                deleteSubject(
                                    ${subject.id},
                                    '${escapeJs(subject.name)}'
                                )
                            "
                        >
                            Excluir
                        </button>
                    </div>
                </div>
            `)
            .join("");
}

async function loadContentManager() {
    const subject =
        organizeSubjectSelect.value ||
        state.organizeSubject;

    state.organizeSubject = subject;

    if (!subject) {
        contentManageList.innerHTML = `
            <div class="empty">
                Nenhuma matéria.
            </div>
        `;
        return;
    }

    const contents = await api(
        `/api/contents?subject=${
            encodeURIComponent(subject)
        }`
    );

    if (!contents.length) {
        contentManageList.innerHTML = `
            <div class="empty">
                Nenhum conteúdo.
            </div>
        `;
        return;
    }

    contentManageList.innerHTML =
        contents
            .map((content, index) => `
                <div class="manage-row">
                    <div class="manage-title">
                        ${escapeHtml(content.name)}
                    </div>

                    <div class="row-actions">
                        <button
                            class="icon-btn"
                            ${
                                index === 0
                                ? "disabled"
                                : ""
                            }
                            onclick="
                                moveContent(
                                    ${content.id},
                                    'up'
                                )
                            "
                        >
                            ↑
                        </button>

                        <button
                            class="icon-btn"
                            ${
                                index ===
                                contents.length - 1
                                ? "disabled"
                                : ""
                            }
                            onclick="
                                moveContent(
                                    ${content.id},
                                    'down'
                                )
                            "
                        >
                            ↓
                        </button>

                        <button
                            class="secondary"
                            onclick="
                                editContent(
                                    ${content.id},
                                    '${escapeJs(content.name)}'
                                )
                            "
                        >
                            Editar
                        </button>

                        <button
                            class="danger"
                            onclick="
                                deleteContent(${content.id})
                            "
                        >
                            Excluir
                        </button>
                    </div>
                </div>
            `)
            .join("");
}

window.moveSubject = async function(
    id,
    direction
) {
    await api("/api/subjects", {
        method: "PUT",
        body: JSON.stringify({
            id,
            direction
        })
    });

    await loadSubjects();
    renderSubjectManager();
};

window.editSubject = function(
    id,
    currentName
) {
    openModal(
        "Editar matéria",
        `
        <div class="form-stack">
            <div class="field">
                <label>Novo nome</label>
                <input
                    id="modalInput"
                    value="${escapeHtml(currentName)}"
                >
            </div>
        </div>
        `,
        async () => {
            const name =
                document
                    .getElementById("modalInput")
                    .value
                    .trim();

            if (!name) return;

            const wasCurrent =
                state.currentSubject ===
                currentName;

            const wasOrganize =
                state.organizeSubject ===
                currentName;

            await api("/api/subjects", {
                method: "PUT",
                body: JSON.stringify({
                    id,
                    name
                })
            });

            if (wasCurrent) {
                state.currentSubject = name;
            }

            if (wasOrganize) {
                state.organizeSubject = name;
            }

            closeModal();

            await loadSubjects();
            renderSubjectManager();
            await loadContentManager();

            showToast("Matéria atualizada.");
        }
    );
};

window.deleteSubject = async function(
    id,
    name
) {
    if (
        !confirm(
            `Excluir a matéria "${name}" e todos os conteúdos dela?`
        )
    ) {
        return;
    }

    await api(
        `/api/subjects?id=${id}`,
        {
            method: "DELETE"
        }
    );

    state.currentSubject = null;
    state.organizeSubject = null;

    await loadOrganizer();
    await loadStudySummary();

    showToast("Matéria excluída.");
};

window.moveContent = async function(
    id,
    direction
) {
    await api("/api/contents", {
        method: "PUT",
        body: JSON.stringify({
            id,
            direction
        })
    });

    await loadContentManager();

    if (
        state.currentSubject ===
        state.organizeSubject
    ) {
        await loadContents();
    }
};

async function loadReviews() {
    const reviews = await api("/api/reviews");

    if (!reviews.length) {
        reviewList.innerHTML = `
            <div class="empty">
                Nenhuma revisão cadastrada.
            </div>
        `;
        return;
    }

    reviewList.innerHTML =
        reviews
            .map(review => `
                <div class="review-row">
                    <div>
                        <div class="review-title">
                            ${escapeHtml(review.content)}
                        </div>

                        <div class="review-meta">
                            ${escapeHtml(review.subject)}
                            ·
                            ${formatDate(review.date)}
                        </div>
                    </div>

                    <div class="row-actions">
                        <span class="
                            status
                            ${
                                review.completed
                                ? "learned"
                                : "studying"
                            }
                        ">
                            ${
                                review.completed
                                ? "Concluída"
                                : "Pendente"
                            }
                        </span>

                        ${
                            review.completed
                            ? ""
                            : `
                                <button
                                    class="primary"
                                    onclick="
                                        completeReview(
                                            ${review.id}
                                        )
                                    "
                                >
                                    Concluir
                                </button>
                            `
                        }
                    </div>
                </div>
            `)
            .join("");
}

window.completeReview = async function(id) {
    await api("/api/reviews", {
        method: "PUT",
        body: JSON.stringify({ id })
    });

    await loadReviews();

    showToast("Revisão concluída.");
};

async function loadProgress() {
    const progress = await api("/api/progress");

    progressList.innerHTML =
        progress
            .map(item => {
                const percent =
                    item.total === 0
                    ? 0
                    : Math.round(
                        (
                            item.solidified /
                            item.total
                        ) * 100
                    );

                return `
                    <div class="progress-card">
                        <div class="progress-head">
                            <strong>
                                ${escapeHtml(item.subject)}
                            </strong>

                            <span>
                                ${item.solidified}/
                                ${item.total}
                                solidificados
                                ·
                                ${percent}%
                            </span>
                        </div>

                        <div class="bar">
                            <div
                                style="width:${percent}%"
                            ></div>
                        </div>
                    </div>
                `;
            })
            .join("") ||
        `
            <div class="empty">
                Sem matérias.
            </div>
        `;
}

document
    .getElementById("newNoteBtn")
    .addEventListener("click", () => {
        openNoteEditor();
    });

function noteSubjectOptions(
    selectedName = null
) {
    return `
        <option value="">
            Nota geral
        </option>

        ${state.subjects
            .map(subject => `
                <option
                    value="${subject.id}"
                    ${
                        selectedName ===
                        subject.name
                        ? "selected"
                        : ""
                    }
                >
                    ${escapeHtml(subject.name)}
                </option>
            `)
            .join("")}
    `;
}

function openNoteEditor(note = null) {
    const title =
        note ? note.title : "";

    const body =
        note ? note.body : "";

    openModal(
        note ? "Editar nota" : "Nova nota",
        `
        <div class="form-stack">
            <div class="field">
                <label>Matéria</label>

                <select id="noteSubject">
                    ${noteSubjectOptions(
                        note?.subject || null
                    )}
                </select>
            </div>

            <div class="field">
                <label>Título</label>

                <input
                    id="noteTitle"
                    placeholder="Ex.: Dúvida sobre Big-O"
                    value="${escapeHtml(title)}"
                >
            </div>

            <div class="field">
                <label>Observação</label>

                <textarea
                    id="noteBody"
                    placeholder="Escreva sua observação..."
                >${escapeHtml(body)}</textarea>
            </div>
        </div>
        `,
        async () => {
            const subjectValue =
                document
                    .getElementById("noteSubject")
                    .value;

            const titleValue =
                document
                    .getElementById("noteTitle")
                    .value
                    .trim();

            const bodyValue =
                document
                    .getElementById("noteBody")
                    .value;

            if (!titleValue) {
                showToast(
                    "Dê um título para a nota."
                );
                return;
            }

            const payload = {
                subjectId:
                    subjectValue
                    ? Number(subjectValue)
                    : null,

                title: titleValue,
                body: bodyValue
            };

            if (note) {
                payload.id = note.id;

                await api("/api/notes", {
                    method: "PUT",
                    body: JSON.stringify(payload)
                });
            } else {
                await api("/api/notes", {
                    method: "POST",
                    body: JSON.stringify(payload)
                });
            }

            closeModal();
            await loadNotes();

            showToast(
                note
                ? "Nota atualizada."
                : "Nota criada."
            );
        }
    );
}

async function loadNotes() {
    state.notes = await api("/api/notes");

    if (!state.notes.length) {
        notesList.innerHTML = `
            <div class="empty card">
                Nenhuma nota ainda.
                Crie a primeira observação.
            </div>
        `;
        return;
    }

    notesList.innerHTML =
        state.notes
            .map(note => `
                <article class="note-card">
                    <span class="note-tag">
                        ${
                            note.subject
                            ? escapeHtml(note.subject)
                            : "Geral"
                        }
                    </span>

                    <h3>
                        ${escapeHtml(note.title)}
                    </h3>

                    <div class="note-body">
                        ${escapeHtml(
                            note.body || ""
                        )}
                    </div>

                    <div class="note-footer">
                        <span class="note-date">
                            Atualizada em
                            ${formatDateTime(
                                note.updatedAt
                            )}
                        </span>

                        <div class="row-actions">
                            <button
                                class="secondary"
                                onclick="
                                    editNote(${note.id})
                                "
                            >
                                Editar
                            </button>

                            <button
                                class="danger"
                                onclick="
                                    deleteNote(${note.id})
                                "
                            >
                                Excluir
                            </button>
                        </div>
                    </div>
                </article>
            `)
            .join("");
}

window.editNote = function(id) {
    const note =
        state.notes.find(
            item => item.id === id
        );

    if (note) {
        openNoteEditor(note);
    }
};

window.deleteNote = async function(id) {
    if (
        !confirm(
            "Excluir esta nota?"
        )
    ) {
        return;
    }

    await api(
        `/api/notes?id=${id}`,
        {
            method: "DELETE"
        }
    );

    await loadNotes();

    showToast("Nota excluída.");
};

function renderTimer() {
    timerDisplay.textContent =
        formatDuration(state.timer.seconds);

    timerSaveBtn.disabled =
        state.timer.seconds <= 0 ||
        state.timer.running;

    timerPauseBtn.disabled =
        !state.timer.running;

    timerStartBtn.disabled =
        state.timer.running;

    const timerCard =
        document.querySelector(".timer-card");

    timerCard.classList.toggle(
        "running",
        state.timer.running
    );

    if (state.timer.running) {
        timerStatus.textContent =
            "Estudando agora...";
    } else if (state.timer.seconds > 0) {
        timerStatus.textContent =
            "Sessão pausada";
    } else {
        timerStatus.textContent =
            "Pronto para começar";
    }
}

timerStartBtn.addEventListener(
    "click",
    () => {
        if (state.timer.running) return;

        state.timer.running = true;

        state.timer.interval =
            setInterval(() => {
                state.timer.seconds++;
                renderTimer();
                persistTimerLocally();
            }, 1000);

        renderTimer();
    }
);

timerPauseBtn.addEventListener(
    "click",
    () => {
        pauseTimer();
    }
);

function pauseTimer() {
    if (state.timer.interval) {
        clearInterval(
            state.timer.interval
        );
    }

    state.timer.interval = null;
    state.timer.running = false;

    renderTimer();
    persistTimerLocally();
}

timerResetBtn.addEventListener(
    "click",
    () => {
        if (
            state.timer.seconds > 0 &&
            !confirm(
                "Zerar o timer atual?"
            )
        ) {
            return;
        }

        pauseTimer();

        state.timer.seconds = 0;
        persistTimerLocally();
        renderTimer();
    }
);

timerSaveBtn.addEventListener(
    "click",
    async () => {
        if (
            state.timer.seconds <= 0 ||
            state.timer.running
        ) {
            return;
        }

        const subjectValue =
            timerSubjectSelect.value;

        await api("/api/sessions", {
            method: "POST",
            body: JSON.stringify({
                subjectId:
                    subjectValue
                    ? Number(subjectValue)
                    : null,

                durationSeconds:
                    state.timer.seconds
            })
        });

        state.timer.seconds = 0;
        persistTimerLocally();
        renderTimer();

        await loadSessions();
        await loadStudySummary();

        showToast("Sessão de estudo salva.");
    }
);

function persistTimerLocally() {
    localStorage.setItem(
        "studify-timer-seconds",
        String(state.timer.seconds)
    );
}

function restoreTimerLocally() {
    const saved =
        Number(
            localStorage.getItem(
                "studify-timer-seconds"
            ) || 0
        );

    if (
        Number.isFinite(saved) &&
        saved > 0
    ) {
        state.timer.seconds = saved;
    }

    renderTimer();
}

async function loadSessions() {
    const sessions =
        await api("/api/sessions");

    if (!sessions.length) {
        sessionList.innerHTML = `
            <div class="empty">
                Nenhuma sessão salva.
            </div>
        `;
        return;
    }

    sessionList.innerHTML =
        sessions
            .map(session => `
                <div class="session-row">
                    <div>
                        <div class="review-title">
                            ${
                                session.subject
                                ? escapeHtml(
                                    session.subject
                                )
                                : "Estudo geral"
                            }
                        </div>

                        <div class="session-meta">
                            ${formatDateTime(
                                session.studiedAt
                            )}
                        </div>
                    </div>

                    <div class="session-duration">
                        ${formatShortDuration(
                            session.durationSeconds
                        )}
                    </div>
                </div>
            `)
            .join("");
}

async function loadStudySummary() {
    const summary =
        await api("/api/summary");

    document
        .getElementById("homeSubjectCount")
        .textContent = summary.subjects;

    document
        .getElementById("homeSubjectLabel")
        .textContent =
            summary.subjects === 1
            ? "1 matéria cadastrada"
            : summary.subjects > 1
            ? `${summary.subjects} matérias cadastradas`
            : "Nenhuma matéria cadastrada";

    document
        .getElementById("homeContentCount")
        .textContent = summary.contents;

    document
        .getElementById("homeContentLabel")
        .textContent =
            summary.contents === 1
            ? "1 conteúdo cadastrado"
            : summary.contents > 1
            ? `${summary.contents} conteúdos cadastrados`
            : "Nenhum conteúdo cadastrado";

    document
        .getElementById("homeStudyTime")
        .textContent =
            summary.totalSeconds > 0
            ? formatShortDuration(summary.totalSeconds)
            : "00h 00m";

    document
        .getElementById("homeSessionCount")
        .textContent =
            `${summary.sessions} ${
                summary.sessions === 1
                ? "sessão salva"
                : "sessões salvas"
            }`;
}

function statusClass(status) {
    if (status === "Estudando") {
        return "studying";
    }

    if (status === "Aprendido") {
        return "learned";
    }

    if (status === "Solidificado") {
        return "solid";
    }

    return "not-started";
}

function formatDate(value) {
    const [year, month, day] =
        value.split("-");

    return `${day}/${month}/${year}`;
}

function formatDateTime(value) {
    if (!value) return "";

    const normalized =
        value.replace("T", " ");

    const [datePart, timePart = ""] =
        normalized.split(" ");

    const [year, month, day] =
        datePart.split("-");

    const time =
        timePart.slice(0, 5);

    return `${day}/${month}/${year} ${time}`;
}

function formatDuration(seconds) {
    const hours =
        Math.floor(seconds / 3600);

    const minutes =
        Math.floor(
            (seconds % 3600) / 60
        );

    const secs =
        seconds % 60;

    return [
        hours,
        minutes,
        secs
    ]
        .map(value =>
            String(value).padStart(2, "0")
        )
        .join(":");
}

function formatShortDuration(seconds) {
    const hours =
        Math.floor(seconds / 3600);

    const minutes =
        Math.floor(
            (seconds % 3600) / 60
        );

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }

    if (minutes > 0) {
        return `${minutes}m`;
    }

    return `${seconds}s`;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function escapeJs(value) {
    return String(value ?? "")
        .replaceAll("\\", "\\\\")
        .replaceAll("'", "\\'");
}

document.addEventListener(
    "keydown",
    event => {
        if (
            event.key === "Escape" &&
            !modal.classList.contains("hidden")
        ) {
            closeModal();
        }

        if (
            event.ctrlKey &&
            event.key.toLowerCase() === "n"
        ) {
            event.preventDefault();
            window.goToPage("notes");
            setTimeout(
                () => openNoteEditor(),
                80
            );
        }
    }
);

async function initApp() {
    initTheme();
    restoreTimerLocally();

    try {
        await loadCurrentUser();
        await loadSubjects();
        await loadStudySummary();
    } catch (error) {
        console.error(error);
        showToast(error.message || "Não foi possível conectar ao backend.");
    }
}

initApp();

window.addEventListener(
    "beforeunload",
    persistTimerLocally
);
