package br.studify;

import com.google.gson.*;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;

public class Main {
    private static final int PORT = Integer.parseInt(
        System.getenv().getOrDefault("PORT", "8080")
    );

    private static final Gson gson = new Gson();

    private static final String AUTH_USER =
        System.getenv().getOrDefault("STUDIFY_USER", "robertof7b").trim();

    private static final String AUTH_PASSWORD =
        System.getenv().getOrDefault("STUDIFY_PASSWORD", "");

    private static final String SECOND_USER =
        System.getenv().getOrDefault("STUDIFY_SECOND_USER", "julia").trim();

    private static final String SECOND_PASSWORD =
        System.getenv().getOrDefault("STUDIFY_SECOND_PASSWORD", "");

    private static final String OPENAI_API_KEY =
        System.getenv().getOrDefault("OPENAI_API_KEY", "").trim();

    private static final String OPENAI_MODEL =
        System.getenv().getOrDefault("OPENAI_MODEL", "gpt-5-mini").trim();

    private static final Database primaryDb = new Database();
    private static final Database secondDb = new Database("studify-julia.db", false);

    private static final HttpClient httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(15))
        .build();

    private static final String TUTOR_INSTRUCTIONS = """
        Você é o Tutor IA do Studify, usado por José Roberto para estudar
        Laboratório de Programação (Java) e Algoritmos e Estruturas de Dados (AED).
        Responda em português do Brasil, de forma curta, direta, simples e didática.
        Priorize raciocínio e compreensão antes de entregar código completo.

        A trilha integrada do aluno é:
        1. Fundamentos Java -> noção de algoritmo e Big O -> Entendendo Algoritmos cap. 1.
        2. Loops -> busca sequencial -> cap. 1.
        3. Arrays/Vetores -> listas estáticas e busca binária -> cap. 1.
        4. Métodos -> ordenação por seleção -> cap. 2.
        5. Recursão -> pilha de chamadas -> cap. 3.
        6. Divisão e conquista -> quicksort -> cap. 4.
        7. POO/encapsulamento -> listas encadeadas, pilhas e filas -> caps. 2 e 3 como apoio.
        8. Collections/HashMap -> tabelas hash -> cap. 5.
        9. Classes/Queue -> árvores BST, grafos, BFS e DFS -> cap. 6 para grafos/BFS e material de AED para árvores/DFS.
        10. PriorityQueue, exceções, arquivos e projeto -> Dijkstra, NP-Complete, gulosos e programação dinâmica -> caps. 7, 8 e 9.

        Quando possível, conecte três pontos: o recurso de Java/LP, o conceito de AED
        e a parte correspondente do livro Entendendo Algoritmos, de Aditya Y. Bhargava.
        Se o aluno pedir exercício, dê um de cada vez e não entregue a solução imediatamente.
        """;

    private static final String SESSION_COOKIE = "studify_session";
    private static final long SESSION_TTL_MS = 30L * 24 * 60 * 60 * 1000;
    private static final SecureRandom secureRandom = new SecureRandom();
    private static final Map<String, SessionData> sessions = new ConcurrentHashMap<>();

    public static void main(String[] args) throws Exception {
        validateConfiguration();

        HttpServer server = HttpServer.create(
            new InetSocketAddress("0.0.0.0", PORT),
            0
        );

        server.setExecutor(Executors.newCachedThreadPool());

        server.createContext("/health", Main::handleHealth);
        server.createContext("/api/auth/login", withCors(Main::handleLogin));
        server.createContext("/api/auth/status", withCors(Main::handleAuthStatus));
        server.createContext("/api/auth/logout", secured(Main::handleLogout));

        server.createContext("/api/subjects", secured(Main::handleSubjects));
        server.createContext("/api/contents", secured(Main::handleContents));
        server.createContext("/api/reviews", secured(Main::handleReviews));
        server.createContext("/api/progress", secured(Main::handleProgress));
        server.createContext("/api/notes", secured(Main::handleNotes));
        server.createContext("/api/sessions", secured(Main::handleSessions));
        server.createContext("/api/summary", secured(Main::handleSummary));
        server.createContext("/api/study-roadmap", secured(Main::handleStudyRoadmap));
        server.createContext("/api/tutor/history", secured(Main::handleTutorHistory));
        server.createContext("/api/tutor/chat", secured(Main::handleTutorChat));
        server.createContext("/", Main::serveStatic);

        server.start();

        System.out.println();
        System.out.println("Studify iniciado com acesso privado.");
        System.out.println("Porta: " + PORT);
        System.out.println("Banco principal: " + primaryDb.databasePath());
        System.out.println("Banco de " + SECOND_USER + ": " + secondDb.databasePath());
        System.out.println("Tutor IA: " + (OPENAI_API_KEY.isBlank() ? "sem chave configurada" : "configurado"));
        System.out.println();
    }

    private static void validateConfiguration() {
        if (AUTH_USER.isBlank() || AUTH_PASSWORD.isBlank()) {
            throw new IllegalStateException(
                "Defina STUDIFY_USER e STUDIFY_PASSWORD antes de iniciar o Studify."
            );
        }

        if (AUTH_PASSWORD.length() < 8) {
            throw new IllegalStateException(
                "STUDIFY_PASSWORD deve ter pelo menos 8 caracteres."
            );
        }

        if (SECOND_USER.isBlank() || SECOND_PASSWORD.isBlank()) {
            throw new IllegalStateException(
                "Defina STUDIFY_SECOND_USER e STUDIFY_SECOND_PASSWORD antes de iniciar o Studify."
            );
        }

        if (SECOND_PASSWORD.length() < 8) {
            throw new IllegalStateException(
                "STUDIFY_SECOND_PASSWORD deve ter pelo menos 8 caracteres."
            );
        }

        Set<String> usernames = new HashSet<>();
        usernames.add(AUTH_USER.toLowerCase(Locale.ROOT));
        usernames.add(SECOND_USER.toLowerCase(Locale.ROOT));

        if (usernames.size() != 2) {
            throw new IllegalStateException("Os usuários do Studify precisam ter nomes diferentes.");
        }
    }

    private static HttpHandler secured(HttpHandler handler) {
        return withCors(requireAuth(handler));
    }

    private static HttpHandler requireAuth(HttpHandler handler) {
        return ex -> {
            if (!isAuthenticated(ex)) {
                json(ex, 401, Map.of(
                    "error", "Sessão expirada. Entre novamente.",
                    "authenticated", false
                ));
                return;
            }

            handler.handle(ex);
        };
    }

    private static HttpHandler withCors(HttpHandler handler) {
        return ex -> {
            applySecurityHeaders(ex);

            String origin = ex.getRequestHeaders().getFirst("Origin");
            if (origin != null && isAllowedDevOrigin(origin)) {
                ex.getResponseHeaders().set("Access-Control-Allow-Origin", origin);
                ex.getResponseHeaders().set("Vary", "Origin");
                ex.getResponseHeaders().set("Access-Control-Allow-Credentials", "true");
                ex.getResponseHeaders().set(
                    "Access-Control-Allow-Methods",
                    "GET, POST, PUT, DELETE, OPTIONS"
                );
                ex.getResponseHeaders().set(
                    "Access-Control-Allow-Headers",
                    "Content-Type"
                );
            }

            if ("OPTIONS".equalsIgnoreCase(ex.getRequestMethod())) {
                ex.sendResponseHeaders(204, -1);
                ex.close();
                return;
            }

            handler.handle(ex);
        };
    }

    private static boolean isAllowedDevOrigin(String origin) {
        return origin.matches(
            "^http://(localhost|127\\.0\\.0\\.1):(5500|5501)$"
        );
    }

    private static void handleHealth(HttpExchange ex) throws IOException {
        applySecurityHeaders(ex);

        if (!"GET".equalsIgnoreCase(ex.getRequestMethod())) {
            methodNotAllowed(ex);
            return;
        }

        try {
            primaryDb.studySummary();
            secondDb.studySummary();
            byte[] data = "ok".getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().set("Content-Type", "text/plain; charset=UTF-8");
            ex.sendResponseHeaders(200, data.length);
            ex.getResponseBody().write(data);
            ex.close();
        } catch (Exception e) {
            byte[] data = "unavailable".getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().set("Content-Type", "text/plain; charset=UTF-8");
            ex.sendResponseHeaders(503, data.length);
            ex.getResponseBody().write(data);
            ex.close();
        }
    }

    private static void handleLogin(HttpExchange ex) throws IOException {
        if (!"POST".equalsIgnoreCase(ex.getRequestMethod())) {
            methodNotAllowed(ex);
            return;
        }

        try {
            LoginRequest body = gson.fromJson(readBody(ex), LoginRequest.class);

            String username = body == null || body.username() == null
                ? ""
                : body.username().trim();

            String password = body == null || body.password() == null
                ? ""
                : body.password();

            String authenticatedUser = authenticate(username, password);
            if (authenticatedUser == null) {
                json(ex, 401, Map.of("error", "Usuário ou senha incorretos."));
                return;
            }

            String token = createSession(authenticatedUser);
            setSessionCookie(ex, token, false);
            json(ex, 200, Map.of("ok", true, "username", authenticatedUser));
        } catch (Exception e) {
            json(ex, 400, Map.of("error", "Não foi possível fazer login."));
        }
    }

    private static void handleAuthStatus(HttpExchange ex) throws IOException {
        if (!"GET".equalsIgnoreCase(ex.getRequestMethod())) {
            methodNotAllowed(ex);
            return;
        }

        SessionData session = authenticatedSession(ex);
        boolean authenticated = session != null;
        json(ex, 200, Map.of(
            "authenticated", authenticated,
            "username", authenticated ? session.username() : "",
            "primary", authenticated && session.username().equalsIgnoreCase(AUTH_USER)
        ));
    }

    private static void handleLogout(HttpExchange ex) throws IOException {
        if (!"POST".equalsIgnoreCase(ex.getRequestMethod())) {
            methodNotAllowed(ex);
            return;
        }

        String token = sessionToken(ex);
        if (token != null) sessions.remove(token);

        setSessionCookie(ex, "", true);
        json(ex, 200, Map.of("ok", true));
    }

    private static String authenticate(String username, String password) {
        if (constantTimeEquals(AUTH_USER, username)
                && constantTimeEquals(AUTH_PASSWORD, password)) {
            return AUTH_USER;
        }

        if (constantTimeEquals(SECOND_USER, username)
                && constantTimeEquals(SECOND_PASSWORD, password)) {
            return SECOND_USER;
        }

        return null;
    }

    private static String createSession(String username) {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);

        String token = Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(bytes);

        sessions.put(
            token,
            new SessionData(username, System.currentTimeMillis() + SESSION_TTL_MS)
        );
        return token;
    }

    private static boolean isAuthenticated(HttpExchange ex) {
        return authenticatedSession(ex) != null;
    }

    private static SessionData authenticatedSession(HttpExchange ex) {
        String token = sessionToken(ex);
        if (token == null) return null;

        SessionData session = sessions.get(token);
        if (session == null) return null;

        if (session.expiresAt() < System.currentTimeMillis()) {
            sessions.remove(token);
            return null;
        }

        SessionData renewed = new SessionData(
            session.username(),
            System.currentTimeMillis() + SESSION_TTL_MS
        );
        sessions.put(token, renewed);
        return renewed;
    }

    private static Database databaseFor(HttpExchange ex) {
        SessionData session = authenticatedSession(ex);
        if (session == null) {
            throw new IllegalStateException("Sessão inválida.");
        }

        if (session.username().equalsIgnoreCase(SECOND_USER)) {
            return secondDb;
        }

        return primaryDb;
    }

    private static String sessionToken(HttpExchange ex) {
        String cookieHeader = ex.getRequestHeaders().getFirst("Cookie");
        if (cookieHeader == null || cookieHeader.isBlank()) return null;

        for (String cookie : cookieHeader.split(";")) {
            String[] parts = cookie.trim().split("=", 2);
            if (parts.length == 2 && SESSION_COOKIE.equals(parts[0])) {
                return parts[1];
            }
        }

        return null;
    }

    private static void setSessionCookie(
        HttpExchange ex,
        String token,
        boolean clear
    ) {
        StringBuilder cookie = new StringBuilder()
            .append(SESSION_COOKIE)
            .append("=")
            .append(token)
            .append("; Path=/; HttpOnly; SameSite=Strict");

        if (clear) {
            cookie.append("; Max-Age=0");
        } else {
            cookie.append("; Max-Age=").append(SESSION_TTL_MS / 1000);
        }

        String forwardedProto = ex.getRequestHeaders().getFirst("X-Forwarded-Proto");
        if ("https".equalsIgnoreCase(forwardedProto)) {
            cookie.append("; Secure");
        }

        ex.getResponseHeaders().add("Set-Cookie", cookie.toString());
    }

    private static boolean constantTimeEquals(String expected, String actual) {
        return MessageDigest.isEqual(
            expected.getBytes(StandardCharsets.UTF_8),
            actual.getBytes(StandardCharsets.UTF_8)
        );
    }

    private static void handleSubjects(HttpExchange ex) throws IOException {
        try {
            String method = ex.getRequestMethod().toUpperCase();

            if ("GET".equals(method)) {
                json(ex, 200, databaseFor(ex).subjects());
                return;
            }

            if ("POST".equals(method)) {
                SubjectRequest body = gson.fromJson(
                    readBody(ex),
                    SubjectRequest.class
                );

                databaseFor(ex).addSubject(body.name());
                json(ex, 201, Map.of("ok", true));
                return;
            }

            if ("PUT".equals(method)) {
                SubjectUpdateRequest body = gson.fromJson(
                    readBody(ex),
                    SubjectUpdateRequest.class
                );

                if (body.name() != null) {
                    databaseFor(ex).renameSubject(body.id(), body.name());
                }

                if (body.direction() != null) {
                    databaseFor(ex).moveSubject(body.id(), body.direction());
                }

                json(ex, 200, Map.of("ok", true));
                return;
            }

            if ("DELETE".equals(method)) {
                int id = Integer.parseInt(
                    query(ex).getOrDefault("id", "-1")
                );

                databaseFor(ex).deleteSubject(id);
                json(ex, 200, Map.of("ok", true));
                return;
            }

            methodNotAllowed(ex);

        } catch (Exception e) {
            json(ex, 400, Map.of("error", safeMessage(e)));
        }
    }

    private static void handleContents(HttpExchange ex) throws IOException {
        try {
            String method = ex.getRequestMethod().toUpperCase();

            if ("GET".equals(method)) {
                String subject = query(ex).get("subject");

                if (subject == null || subject.isBlank()) {
                    json(ex, 400, Map.of("error", "Informe a matéria."));
                    return;
                }

                json(ex, 200, databaseFor(ex).contents(subject));
                return;
            }

            if ("POST".equals(method)) {
                ContentRequest body = gson.fromJson(
                    readBody(ex),
                    ContentRequest.class
                );

                databaseFor(ex).addContent(body.subject(), body.name());
                json(ex, 201, Map.of("ok", true));
                return;
            }

            if ("PUT".equals(method)) {
                ContentUpdateRequest body = gson.fromJson(
                    readBody(ex),
                    ContentUpdateRequest.class
                );

                if (body.status() != null) {
                    databaseFor(ex).updateStatus(body.id(), body.status());
                }

                if (body.name() != null) {
                    databaseFor(ex).renameContent(body.id(), body.name());
                }

                if (body.direction() != null) {
                    databaseFor(ex).moveContent(body.id(), body.direction());
                }

                json(ex, 200, Map.of("ok", true));
                return;
            }

            if ("DELETE".equals(method)) {
                int id = Integer.parseInt(
                    query(ex).getOrDefault("id", "-1")
                );

                databaseFor(ex).deleteContent(id);
                json(ex, 200, Map.of("ok", true));
                return;
            }

            methodNotAllowed(ex);

        } catch (Exception e) {
            json(ex, 400, Map.of("error", safeMessage(e)));
        }
    }

    private static void handleReviews(HttpExchange ex) throws IOException {
        try {
            String method = ex.getRequestMethod().toUpperCase();

            if ("GET".equals(method)) {
                json(ex, 200, databaseFor(ex).reviews());
                return;
            }

            if ("POST".equals(method)) {
                ReviewRequest body = gson.fromJson(
                    readBody(ex),
                    ReviewRequest.class
                );

                databaseFor(ex).addReview(body.contentId(), body.date());
                json(ex, 201, Map.of("ok", true));
                return;
            }

            if ("PUT".equals(method)) {
                CompleteReviewRequest body = gson.fromJson(
                    readBody(ex),
                    CompleteReviewRequest.class
                );

                databaseFor(ex).completeReview(body.id());
                json(ex, 200, Map.of("ok", true));
                return;
            }

            methodNotAllowed(ex);

        } catch (Exception e) {
            json(ex, 400, Map.of("error", safeMessage(e)));
        }
    }

    private static void handleProgress(HttpExchange ex) throws IOException {
        if (!"GET".equalsIgnoreCase(ex.getRequestMethod())) {
            methodNotAllowed(ex);
            return;
        }

        json(ex, 200, databaseFor(ex).progress());
    }

    private static void handleNotes(HttpExchange ex) throws IOException {
        try {
            String method = ex.getRequestMethod().toUpperCase();

            if ("GET".equals(method)) {
                json(ex, 200, databaseFor(ex).notes());
                return;
            }

            if ("POST".equals(method)) {
                NoteRequest body = gson.fromJson(
                    readBody(ex),
                    NoteRequest.class
                );

                databaseFor(ex).addNote(
                    body.subjectId(),
                    body.title(),
                    body.body()
                );

                json(ex, 201, Map.of("ok", true));
                return;
            }

            if ("PUT".equals(method)) {
                NoteUpdateRequest body = gson.fromJson(
                    readBody(ex),
                    NoteUpdateRequest.class
                );

                databaseFor(ex).updateNote(
                    body.id(),
                    body.subjectId(),
                    body.title(),
                    body.body()
                );

                json(ex, 200, Map.of("ok", true));
                return;
            }

            if ("DELETE".equals(method)) {
                int id = Integer.parseInt(
                    query(ex).getOrDefault("id", "-1")
                );

                databaseFor(ex).deleteNote(id);
                json(ex, 200, Map.of("ok", true));
                return;
            }

            methodNotAllowed(ex);

        } catch (Exception e) {
            json(ex, 400, Map.of("error", safeMessage(e)));
        }
    }

    private static void handleSessions(HttpExchange ex) throws IOException {
        try {
            String method = ex.getRequestMethod().toUpperCase();

            if ("GET".equals(method)) {
                json(ex, 200, databaseFor(ex).studySessions());
                return;
            }

            if ("POST".equals(method)) {
                SessionRequest body = gson.fromJson(
                    readBody(ex),
                    SessionRequest.class
                );

                databaseFor(ex).addStudySession(
                    body.subjectId(),
                    body.durationSeconds()
                );

                json(ex, 201, Map.of("ok", true));
                return;
            }

            methodNotAllowed(ex);

        } catch (Exception e) {
            json(ex, 400, Map.of("error", safeMessage(e)));
        }
    }

    private static void handleSummary(HttpExchange ex) throws IOException {
        if (!"GET".equalsIgnoreCase(ex.getRequestMethod())) {
            methodNotAllowed(ex);
            return;
        }

        json(ex, 200, databaseFor(ex).studySummary());
    }


    private static boolean ensurePrimaryUser(HttpExchange ex) throws IOException {
        SessionData session = authenticatedSession(ex);
        if (session == null || !session.username().equalsIgnoreCase(AUTH_USER)) {
            json(ex, 403, Map.of(
                "error", "Este recurso está disponível apenas no perfil robertof7b."
            ));
            return false;
        }
        return true;
    }

    private static void handleStudyRoadmap(HttpExchange ex) throws IOException {
        if (!ensurePrimaryUser(ex)) return;

        try {
            String method = ex.getRequestMethod().toUpperCase(Locale.ROOT);

            if ("GET".equals(method)) {
                json(ex, 200, Map.of("progress", primaryDb.roadmapProgress()));
                return;
            }

            if ("PUT".equals(method)) {
                RoadmapProgressRequest body = gson.fromJson(
                    readBody(ex),
                    RoadmapProgressRequest.class
                );

                if (body == null || body.itemKey() == null) {
                    json(ex, 400, Map.of("error", "Item de roadmap inválido."));
                    return;
                }

                primaryDb.setRoadmapProgress(body.itemKey(), body.completed());
                json(ex, 200, Map.of("ok", true));
                return;
            }

            methodNotAllowed(ex);
        } catch (Exception e) {
            json(ex, 400, Map.of("error", safeMessage(e)));
        }
    }

    private static void handleTutorHistory(HttpExchange ex) throws IOException {
        if (!ensurePrimaryUser(ex)) return;

        try {
            String method = ex.getRequestMethod().toUpperCase(Locale.ROOT);

            if ("GET".equals(method)) {
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("configured", !OPENAI_API_KEY.isBlank());
                result.put("model", OPENAI_MODEL);
                result.put("messages", primaryDb.chatHistory(60));
                json(ex, 200, result);
                return;
            }

            if ("DELETE".equals(method)) {
                primaryDb.clearChatHistory();
                json(ex, 200, Map.of("ok", true));
                return;
            }

            methodNotAllowed(ex);
        } catch (Exception e) {
            json(ex, 400, Map.of("error", safeMessage(e)));
        }
    }

    private static void handleTutorChat(HttpExchange ex) throws IOException {
        if (!ensurePrimaryUser(ex)) return;

        if (!"POST".equalsIgnoreCase(ex.getRequestMethod())) {
            methodNotAllowed(ex);
            return;
        }

        if (OPENAI_API_KEY.isBlank()) {
            json(ex, 503, Map.of(
                "error",
                "Tutor IA ainda não configurado. Adicione OPENAI_API_KEY nas variáveis de ambiente do Studify."
            ));
            return;
        }

        try {
            TutorChatRequest body = gson.fromJson(readBody(ex), TutorChatRequest.class);
            String message = body == null || body.message() == null
                ? ""
                : body.message().trim();

            if (message.isBlank()) {
                json(ex, 400, Map.of("error", "Digite uma mensagem para o tutor."));
                return;
            }

            if (message.length() > 6000) {
                json(ex, 400, Map.of("error", "A mensagem está muito longa."));
                return;
            }

            List<Database.ChatMessage> history = primaryDb.chatHistory(14);
            String reply = callOpenAI(history, message);

            primaryDb.addChatMessage("user", message);
            primaryDb.addChatMessage("assistant", reply);

            json(ex, 200, Map.of(
                "reply", reply,
                "model", OPENAI_MODEL
            ));
        } catch (Exception e) {
            json(ex, 502, Map.of("error", safeOpenAIMessage(e)));
        }
    }

    private static String callOpenAI(
        List<Database.ChatMessage> history,
        String message
    ) throws Exception {
        JsonObject requestBody = new JsonObject();
        requestBody.addProperty("model", OPENAI_MODEL);
        requestBody.addProperty("instructions", TUTOR_INSTRUCTIONS);
        requestBody.addProperty("max_output_tokens", 1200);
        requestBody.addProperty("store", false);

        JsonArray input = new JsonArray();

        for (Database.ChatMessage previous : history) {
            JsonObject item = new JsonObject();
            item.addProperty("role", previous.role());
            item.addProperty("content", previous.content());
            input.add(item);
        }

        JsonObject current = new JsonObject();
        current.addProperty("role", "user");
        current.addProperty("content", message);
        input.add(current);

        requestBody.add("input", input);

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("https://api.openai.com/v1/responses"))
            .timeout(Duration.ofSeconds(75))
            .header("Authorization", "Bearer " + OPENAI_API_KEY)
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(
                gson.toJson(requestBody),
                StandardCharsets.UTF_8
            ))
            .build();

        HttpResponse<String> response;
        try {
            response = httpClient.send(
                request,
                HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
            );
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("A chamada ao Tutor IA foi interrompida.");
        }

        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new RuntimeException(extractOpenAIError(response.body()));
        }

        String text = extractOpenAIText(response.body());
        if (text.isBlank()) {
            throw new RuntimeException("A OpenAI não retornou uma resposta de texto.");
        }

        return text.trim();
    }

    private static String extractOpenAIText(String responseBody) {
        JsonObject root = JsonParser.parseString(responseBody).getAsJsonObject();
        StringBuilder text = new StringBuilder();

        JsonArray output = root.has("output") && root.get("output").isJsonArray()
            ? root.getAsJsonArray("output")
            : new JsonArray();

        for (JsonElement outputElement : output) {
            if (!outputElement.isJsonObject()) continue;
            JsonObject outputItem = outputElement.getAsJsonObject();
            if (!outputItem.has("content") || !outputItem.get("content").isJsonArray()) continue;

            for (JsonElement contentElement : outputItem.getAsJsonArray("content")) {
                if (!contentElement.isJsonObject()) continue;
                JsonObject content = contentElement.getAsJsonObject();
                String type = content.has("type") ? content.get("type").getAsString() : "";

                if ("output_text".equals(type) && content.has("text")) {
                    if (!text.isEmpty()) text.append("\n");
                    text.append(content.get("text").getAsString());
                } else if ("refusal".equals(type) && content.has("refusal")) {
                    if (!text.isEmpty()) text.append("\n");
                    text.append(content.get("refusal").getAsString());
                }
            }
        }

        return text.toString();
    }

    private static String extractOpenAIError(String responseBody) {
        try {
            JsonObject root = JsonParser.parseString(responseBody).getAsJsonObject();
            if (root.has("error") && root.get("error").isJsonObject()) {
                JsonObject error = root.getAsJsonObject("error");
                if (error.has("message")) {
                    return "OpenAI: " + error.get("message").getAsString();
                }
            }
        } catch (Exception ignored) {
        }

        return "Não foi possível obter resposta do Tutor IA.";
    }

    private static String safeOpenAIMessage(Exception e) {
        String message = safeMessage(e);
        if (message.contains("401") || message.toLowerCase(Locale.ROOT).contains("api key")) {
            return "A chave OPENAI_API_KEY não foi aceita. Verifique a variável no ambiente.";
        }
        return message;
    }


    private static void serveStatic(HttpExchange ex) throws IOException {
        applySecurityHeaders(ex);

        if (!"GET".equalsIgnoreCase(ex.getRequestMethod())) {
            methodNotAllowed(ex);
            return;
        }

        String path = ex.getRequestURI().getPath();
        if ("/".equals(path)) path = "/index.html";

        boolean publicAsset = isPublicAsset(path);
        boolean authenticated = isAuthenticated(ex);

        if ("/login.html".equals(path) && authenticated) {
            redirect(ex, "/");
            return;
        }

        if (!publicAsset && !authenticated) {
            redirect(ex, "/login.html");
            return;
        }

        try (InputStream in = Main.class.getResourceAsStream("/public" + path)) {
            if (in == null) {
                byte[] data = "404".getBytes(StandardCharsets.UTF_8);
                ex.sendResponseHeaders(404, data.length);
                ex.getResponseBody().write(data);
                ex.close();
                return;
            }

            byte[] data = in.readAllBytes();
            ex.getResponseHeaders().set("Content-Type", contentType(path));
            ex.getResponseHeaders().set(
                "Cache-Control",
                path.endsWith(".ico") || path.endsWith(".png")
                    ? "public, max-age=86400"
                    : "no-store, no-cache, must-revalidate, max-age=0"
            );

            ex.sendResponseHeaders(200, data.length);
            ex.getResponseBody().write(data);
            ex.close();
        }
    }

    private static boolean isPublicAsset(String path) {
        return Set.of(
            "/login.html",
            "/login.css",
            "/login.js",
            "/robots.txt",
            "/studify.ico",
            "/studify-icon.png"
        ).contains(path);
    }

    private static void redirect(HttpExchange ex, String location) throws IOException {
        applySecurityHeaders(ex);
        ex.getResponseHeaders().set("Location", location);
        ex.sendResponseHeaders(302, -1);
        ex.close();
    }

    private static void applySecurityHeaders(HttpExchange ex) {
        ex.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        ex.getResponseHeaders().set("X-Frame-Options", "DENY");
        ex.getResponseHeaders().set("Referrer-Policy", "no-referrer");
        ex.getResponseHeaders().set("X-Robots-Tag", "noindex, nofollow, noarchive");
        ex.getResponseHeaders().set(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=()"
        );
    }

    private static String readBody(HttpExchange ex) throws IOException {
        return new String(
            ex.getRequestBody().readAllBytes(),
            StandardCharsets.UTF_8
        );
    }

    private static Map<String, String> query(HttpExchange ex) {
        Map<String, String> map = new HashMap<>();
        String raw = ex.getRequestURI().getRawQuery();

        if (raw == null || raw.isBlank()) return map;

        for (String part : raw.split("&")) {
            String[] pieces = part.split("=", 2);
            String key = URLDecoder.decode(pieces[0], StandardCharsets.UTF_8);
            String value = pieces.length > 1
                ? URLDecoder.decode(pieces[1], StandardCharsets.UTF_8)
                : "";
            map.put(key, value);
        }

        return map;
    }

    private static void json(HttpExchange ex, int status, Object body) throws IOException {
        applySecurityHeaders(ex);

        byte[] data = gson.toJson(body).getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
        ex.getResponseHeaders().set("Cache-Control", "no-store");
        ex.sendResponseHeaders(status, data.length);
        ex.getResponseBody().write(data);
        ex.close();
    }

    private static void methodNotAllowed(HttpExchange ex) throws IOException {
        json(ex, 405, Map.of("error", "Método não permitido."));
    }

    private static String safeMessage(Exception e) {
        return e.getMessage() == null ? "Erro inesperado." : e.getMessage();
    }

    private static String contentType(String path) {
        if (path.endsWith(".html")) return "text/html; charset=UTF-8";
        if (path.endsWith(".css")) return "text/css; charset=UTF-8";
        if (path.endsWith(".js")) return "application/javascript; charset=UTF-8";
        if (path.endsWith(".ico")) return "image/x-icon";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".txt")) return "text/plain; charset=UTF-8";
        return "application/octet-stream";
    }

    private record SessionData(String username, long expiresAt) {}

    public record LoginRequest(String username, String password) {}

    public record SubjectRequest(String name) {}

    public record SubjectUpdateRequest(
        int id,
        String name,
        String direction
    ) {}

    public record ContentRequest(
        String subject,
        String name
    ) {}

    public record ContentUpdateRequest(
        int id,
        String name,
        String status,
        String direction
    ) {}

    public record ReviewRequest(
        int contentId,
        String date
    ) {}

    public record CompleteReviewRequest(
        int id
    ) {}

    public record NoteRequest(
        Integer subjectId,
        String title,
        String body
    ) {}

    public record NoteUpdateRequest(
        int id,
        Integer subjectId,
        String title,
        String body
    ) {}

    public record SessionRequest(
        Integer subjectId,
        int durationSeconds
    ) {}

    public record RoadmapProgressRequest(
        String itemKey,
        boolean completed
    ) {}

    public record TutorChatRequest(String message) {}

}
