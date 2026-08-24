package br.studify;

import com.google.gson.Gson;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.net.*;
import java.nio.charset.StandardCharsets;
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
    private static final Database db = new Database();

    private static final String AUTH_USER =
        System.getenv().getOrDefault("STUDIFY_USER", "robertof7b").trim();

    private static final String AUTH_PASSWORD =
        System.getenv().getOrDefault("STUDIFY_PASSWORD", "");

    private static final String SESSION_COOKIE = "studify_session";
    private static final long SESSION_TTL_MS = 30L * 24 * 60 * 60 * 1000;
    private static final SecureRandom secureRandom = new SecureRandom();
    private static final Map<String, Long> sessions = new ConcurrentHashMap<>();

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
        server.createContext("/", Main::serveStatic);

        server.start();

        System.out.println();
        System.out.println("Studify iniciado com acesso privado.");
        System.out.println("Porta: " + PORT);
        System.out.println("Banco: " + db.databasePath());
        System.out.println();
    }

    private static void validateConfiguration() {
        if (AUTH_USER.isBlank() || AUTH_PASSWORD.isBlank()) {
            throw new IllegalStateException(
                "Defina STUDIFY_USER e STUDIFY_PASSWORD antes de iniciar o Studify."
            );
        }

        if (AUTH_PASSWORD.length() < 10) {
            throw new IllegalStateException(
                "STUDIFY_PASSWORD deve ter pelo menos 10 caracteres."
            );
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
            db.studySummary();
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

            if (!constantTimeEquals(AUTH_USER, username)
                    || !constantTimeEquals(AUTH_PASSWORD, password)) {
                json(ex, 401, Map.of("error", "Usuário ou senha incorretos."));
                return;
            }

            String token = createSession();
            setSessionCookie(ex, token, false);
            json(ex, 200, Map.of("ok", true, "username", AUTH_USER));
        } catch (Exception e) {
            json(ex, 400, Map.of("error", "Não foi possível fazer login."));
        }
    }

    private static void handleAuthStatus(HttpExchange ex) throws IOException {
        if (!"GET".equalsIgnoreCase(ex.getRequestMethod())) {
            methodNotAllowed(ex);
            return;
        }

        boolean authenticated = isAuthenticated(ex);
        json(ex, 200, Map.of(
            "authenticated", authenticated,
            "username", authenticated ? AUTH_USER : ""
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

    private static String createSession() {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);

        String token = Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(bytes);

        sessions.put(token, System.currentTimeMillis() + SESSION_TTL_MS);
        return token;
    }

    private static boolean isAuthenticated(HttpExchange ex) {
        String token = sessionToken(ex);
        if (token == null) return false;

        Long expiresAt = sessions.get(token);
        if (expiresAt == null) return false;

        if (expiresAt < System.currentTimeMillis()) {
            sessions.remove(token);
            return false;
        }

        sessions.put(token, System.currentTimeMillis() + SESSION_TTL_MS);
        return true;
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
                json(ex, 200, db.subjects());
                return;
            }

            if ("POST".equals(method)) {
                SubjectRequest body = gson.fromJson(
                    readBody(ex),
                    SubjectRequest.class
                );

                db.addSubject(body.name());
                json(ex, 201, Map.of("ok", true));
                return;
            }

            if ("PUT".equals(method)) {
                SubjectUpdateRequest body = gson.fromJson(
                    readBody(ex),
                    SubjectUpdateRequest.class
                );

                if (body.name() != null) {
                    db.renameSubject(body.id(), body.name());
                }

                if (body.direction() != null) {
                    db.moveSubject(body.id(), body.direction());
                }

                json(ex, 200, Map.of("ok", true));
                return;
            }

            if ("DELETE".equals(method)) {
                int id = Integer.parseInt(
                    query(ex).getOrDefault("id", "-1")
                );

                db.deleteSubject(id);
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

                json(ex, 200, db.contents(subject));
                return;
            }

            if ("POST".equals(method)) {
                ContentRequest body = gson.fromJson(
                    readBody(ex),
                    ContentRequest.class
                );

                db.addContent(body.subject(), body.name());
                json(ex, 201, Map.of("ok", true));
                return;
            }

            if ("PUT".equals(method)) {
                ContentUpdateRequest body = gson.fromJson(
                    readBody(ex),
                    ContentUpdateRequest.class
                );

                if (body.status() != null) {
                    db.updateStatus(body.id(), body.status());
                }

                if (body.name() != null) {
                    db.renameContent(body.id(), body.name());
                }

                if (body.direction() != null) {
                    db.moveContent(body.id(), body.direction());
                }

                json(ex, 200, Map.of("ok", true));
                return;
            }

            if ("DELETE".equals(method)) {
                int id = Integer.parseInt(
                    query(ex).getOrDefault("id", "-1")
                );

                db.deleteContent(id);
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
                json(ex, 200, db.reviews());
                return;
            }

            if ("POST".equals(method)) {
                ReviewRequest body = gson.fromJson(
                    readBody(ex),
                    ReviewRequest.class
                );

                db.addReview(body.contentId(), body.date());
                json(ex, 201, Map.of("ok", true));
                return;
            }

            if ("PUT".equals(method)) {
                CompleteReviewRequest body = gson.fromJson(
                    readBody(ex),
                    CompleteReviewRequest.class
                );

                db.completeReview(body.id());
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

        json(ex, 200, db.progress());
    }

    private static void handleNotes(HttpExchange ex) throws IOException {
        try {
            String method = ex.getRequestMethod().toUpperCase();

            if ("GET".equals(method)) {
                json(ex, 200, db.notes());
                return;
            }

            if ("POST".equals(method)) {
                NoteRequest body = gson.fromJson(
                    readBody(ex),
                    NoteRequest.class
                );

                db.addNote(
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

                db.updateNote(
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

                db.deleteNote(id);
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
                json(ex, 200, db.studySessions());
                return;
            }

            if ("POST".equals(method)) {
                SessionRequest body = gson.fromJson(
                    readBody(ex),
                    SessionRequest.class
                );

                db.addStudySession(
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

        json(ex, 200, db.studySummary());
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

}
