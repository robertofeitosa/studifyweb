package br.studify;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.sql.*;
import java.time.LocalDateTime;
import java.util.*;

public class Database {
    private final Path databasePath;
    private final String url;

    public Database() {
        this("studify.db", true);
    }

    public Database(String fileName, boolean seedFromTemplate) {
        this.databasePath = resolveDatabasePath(fileName);
        this.url = "jdbc:sqlite:" + databasePath.toAbsolutePath();
        initializeDatabaseFile(seedFromTemplate);
        createTables();
        normalizeOrders();
    }

    public String databasePath() {
        return databasePath.toAbsolutePath().toString();
    }

    private static Path resolveDatabasePath(String fileName) {
        String explicitPath = System.getenv("DB_PATH");
        if (explicitPath != null && !explicitPath.isBlank()) {
            Path configured = Path.of(explicitPath);
            if ("studify.db".equals(fileName)) {
                return configured;
            }

            Path parent = configured.toAbsolutePath().getParent();
            return parent == null ? Path.of(fileName) : parent.resolve(fileName);
        }

        String volumePath = System.getenv("RAILWAY_VOLUME_MOUNT_PATH");
        if (volumePath != null && !volumePath.isBlank()) {
            return Path.of(volumePath, fileName);
        }

        return Path.of(fileName);
    }

    private void initializeDatabaseFile(boolean seedFromTemplate) {
        try {
            Path parent = databasePath.toAbsolutePath().getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }

            if (Files.exists(databasePath)) {
                return;
            }

            if (!seedFromTemplate) {
                return;
            }

            try (InputStream seed = Database.class.getResourceAsStream("/seed/studify.db")) {
                if (seed != null) {
                    Files.copy(seed, databasePath, StandardCopyOption.REPLACE_EXISTING);
                }
            }
        } catch (Exception e) {
            throw new RuntimeException("Erro ao preparar banco: " + e.getMessage(), e);
        }
    }

    private Connection connect() throws SQLException {
        Connection c = DriverManager.getConnection(url);
        try (Statement s = c.createStatement()) {
            s.execute("PRAGMA foreign_keys = ON");
            s.execute("PRAGMA busy_timeout = 5000");
        }
        return c;
    }

    private void createTables() {
        try (Connection c = connect(); Statement s = c.createStatement()) {
            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS subjects (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    position INTEGER NOT NULL DEFAULT 0
                )
            """);

            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS contents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    subject_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'Não iniciado',
                    position INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE
                )
            """);

            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS reviews (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    content_id INTEGER NOT NULL,
                    review_date TEXT NOT NULL,
                    completed INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY(content_id) REFERENCES contents(id) ON DELETE CASCADE
                )
            """);

            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS notes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    subject_id INTEGER,
                    title TEXT NOT NULL,
                    body TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE SET NULL
                )
            """);

            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS study_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    subject_id INTEGER,
                    duration_seconds INTEGER NOT NULL,
                    studied_at TEXT NOT NULL,
                    FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE SET NULL
                )
            """);

            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS roadmap_progress (
                    item_key TEXT PRIMARY KEY,
                    completed INTEGER NOT NULL DEFAULT 0,
                    updated_at TEXT NOT NULL
                )
            """);

            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
            """);
        } catch (SQLException e) {
            throw new RuntimeException("Erro ao criar banco: " + e.getMessage(), e);
        }
    }

    private void normalizeOrders() {
        try (Connection c = connect()) {
            List<Integer> subjectIds = new ArrayList<>();
            try (PreparedStatement p = c.prepareStatement("SELECT id FROM subjects ORDER BY position, id");
                 ResultSet r = p.executeQuery()) {
                while (r.next()) subjectIds.add(r.getInt("id"));
            }

            for (int i = 0; i < subjectIds.size(); i++) {
                try (PreparedStatement p = c.prepareStatement("UPDATE subjects SET position=? WHERE id=?")) {
                    p.setInt(1, i);
                    p.setInt(2, subjectIds.get(i));
                    p.executeUpdate();
                }
            }

            for (int subjectId : subjectIds) {
                List<Integer> ids = new ArrayList<>();
                try (PreparedStatement p = c.prepareStatement(
                        "SELECT id FROM contents WHERE subject_id=? ORDER BY position, id")) {
                    p.setInt(1, subjectId);
                    try (ResultSet r = p.executeQuery()) {
                        while (r.next()) ids.add(r.getInt("id"));
                    }
                }

                for (int i = 0; i < ids.size(); i++) {
                    try (PreparedStatement p = c.prepareStatement("UPDATE contents SET position=? WHERE id=?")) {
                        p.setInt(1, i);
                        p.setInt(2, ids.get(i));
                        p.executeUpdate();
                    }
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public List<Subject> subjects() {
        List<Subject> list = new ArrayList<>();
        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement(
                     "SELECT id, name, position FROM subjects ORDER BY position, id");
             ResultSet r = p.executeQuery()) {

            while (r.next()) {
                list.add(new Subject(
                    r.getInt("id"),
                    r.getString("name"),
                    r.getInt("position")
                ));
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
        return list;
    }

    public int subjectId(String name) {
        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement("SELECT id FROM subjects WHERE name=?")) {
            p.setString(1, name);

            try (ResultSet r = p.executeQuery()) {
                return r.next() ? r.getInt("id") : -1;
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public void addSubject(String name) {
        String sql = """
            INSERT INTO subjects(name, position)
            VALUES(?, (SELECT COALESCE(MAX(position), -1) + 1 FROM subjects))
        """;

        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement(sql)) {
            p.setString(1, name.trim());
            p.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException(e.getMessage());
        }
    }

    public void renameSubject(int id, String name) {
        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement(
                     "UPDATE subjects SET name=? WHERE id=?")) {
            p.setString(1, name.trim());
            p.setInt(2, id);
            p.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException(e.getMessage());
        }
    }

    public void deleteSubject(int id) {
        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement(
                     "DELETE FROM subjects WHERE id=?")) {
            p.setInt(1, id);
            p.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
        normalizeOrders();
    }

    public void moveSubject(int id, String direction) {
        List<Subject> list = subjects();

        int index = -1;
        for (int i = 0; i < list.size(); i++) {
            if (list.get(i).id() == id) {
                index = i;
                break;
            }
        }

        if (index < 0) return;

        int target = "up".equals(direction) ? index - 1 : index + 1;
        if (target < 0 || target >= list.size()) return;

        Subject a = list.get(index);
        Subject b = list.get(target);

        try (Connection c = connect()) {
            c.setAutoCommit(false);

            try (PreparedStatement p1 = c.prepareStatement(
                        "UPDATE subjects SET position=? WHERE id=?");
                 PreparedStatement p2 = c.prepareStatement(
                        "UPDATE subjects SET position=? WHERE id=?")) {

                p1.setInt(1, b.position());
                p1.setInt(2, a.id());
                p1.executeUpdate();

                p2.setInt(1, a.position());
                p2.setInt(2, b.id());
                p2.executeUpdate();

                c.commit();
            } catch (Exception e) {
                c.rollback();
                throw e;
            }
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    public List<Content> contents(String subject) {
        List<Content> list = new ArrayList<>();

        String sql = """
            SELECT c.id, c.name, c.status, c.position
            FROM contents c
            JOIN subjects s ON s.id=c.subject_id
            WHERE s.name=?
            ORDER BY c.position, c.id
        """;

        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement(sql)) {
            p.setString(1, subject);

            try (ResultSet r = p.executeQuery()) {
                while (r.next()) {
                    list.add(new Content(
                        r.getInt("id"),
                        r.getString("name"),
                        r.getString("status"),
                        r.getInt("position")
                    ));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }

        return list;
    }

    public void addContent(String subject, String name) {
        int subjectId = subjectId(subject);
        if (subjectId == -1) throw new RuntimeException("Matéria não encontrada.");

        String sql = """
            INSERT INTO contents(subject_id, name, status, position)
            VALUES(
                ?, ?, 'Não iniciado',
                (SELECT COALESCE(MAX(position), -1) + 1 FROM contents WHERE subject_id=?)
            )
        """;

        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement(sql)) {

            p.setInt(1, subjectId);
            p.setString(2, name.trim());
            p.setInt(3, subjectId);
            p.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public void renameContent(int id, String name) {
        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement(
                     "UPDATE contents SET name=? WHERE id=?")) {
            p.setString(1, name.trim());
            p.setInt(2, id);
            p.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public void updateStatus(int id, String status) {
        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement(
                     "UPDATE contents SET status=? WHERE id=?")) {
            p.setString(1, status);
            p.setInt(2, id);
            p.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public void deleteContent(int id) {
        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement(
                     "DELETE FROM contents WHERE id=?")) {
            p.setInt(1, id);
            p.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
        normalizeOrders();
    }

    public void moveContent(int id, String direction) {
        try (Connection c = connect()) {
            int subjectId;

            try (PreparedStatement p = c.prepareStatement(
                    "SELECT subject_id FROM contents WHERE id=?")) {
                p.setInt(1, id);

                try (ResultSet r = p.executeQuery()) {
                    if (!r.next()) return;
                    subjectId = r.getInt(1);
                }
            }

            List<ContentRow> list = new ArrayList<>();

            try (PreparedStatement p = c.prepareStatement(
                    "SELECT id, position FROM contents WHERE subject_id=? ORDER BY position, id")) {
                p.setInt(1, subjectId);

                try (ResultSet r = p.executeQuery()) {
                    while (r.next()) {
                        list.add(new ContentRow(
                            r.getInt("id"),
                            r.getInt("position")
                        ));
                    }
                }
            }

            int index = -1;

            for (int i = 0; i < list.size(); i++) {
                if (list.get(i).id() == id) {
                    index = i;
                    break;
                }
            }

            if (index < 0) return;

            int target = "up".equals(direction) ? index - 1 : index + 1;
            if (target < 0 || target >= list.size()) return;

            ContentRow a = list.get(index);
            ContentRow b = list.get(target);

            c.setAutoCommit(false);

            try (PreparedStatement p1 = c.prepareStatement(
                        "UPDATE contents SET position=? WHERE id=?");
                 PreparedStatement p2 = c.prepareStatement(
                        "UPDATE contents SET position=? WHERE id=?")) {

                p1.setInt(1, b.position());
                p1.setInt(2, a.id());
                p1.executeUpdate();

                p2.setInt(1, a.position());
                p2.setInt(2, b.id());
                p2.executeUpdate();

                c.commit();
            } catch (Exception e) {
                c.rollback();
                throw e;
            }

        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    public void addReview(int contentId, String date) {
        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement(
                     "INSERT INTO reviews(content_id, review_date) VALUES(?, ?)")) {
            p.setInt(1, contentId);
            p.setString(2, date);
            p.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public List<Review> reviews() {
        List<Review> list = new ArrayList<>();

        String sql = """
            SELECT r.id, s.name AS subject, c.name AS content,
                   r.review_date, r.completed
            FROM reviews r
            JOIN contents c ON c.id=r.content_id
            JOIN subjects s ON s.id=c.subject_id
            ORDER BY r.completed, r.review_date
        """;

        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement(sql);
             ResultSet r = p.executeQuery()) {

            while (r.next()) {
                list.add(new Review(
                    r.getInt("id"),
                    r.getString("subject"),
                    r.getString("content"),
                    r.getString("review_date"),
                    r.getInt("completed") == 1
                ));
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }

        return list;
    }

    public void completeReview(int id) {
        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement(
                     "UPDATE reviews SET completed=1 WHERE id=?")) {
            p.setInt(1, id);
            p.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public List<Progress> progress() {
        List<Progress> list = new ArrayList<>();

        String sql = """
            SELECT s.name,
                   COUNT(c.id) AS total,
                   SUM(CASE WHEN c.status='Solidificado' THEN 1 ELSE 0 END) AS solidified,
                   s.position
            FROM subjects s
            LEFT JOIN contents c ON c.subject_id=s.id
            GROUP BY s.id, s.name, s.position
            ORDER BY s.position, s.id
        """;

        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement(sql);
             ResultSet r = p.executeQuery()) {

            while (r.next()) {
                list.add(new Progress(
                    r.getString("name"),
                    r.getInt("total"),
                    r.getInt("solidified")
                ));
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }

        return list;
    }

    public List<Note> notes() {
        List<Note> list = new ArrayList<>();

        String sql = """
            SELECT n.id, n.title, n.body, n.created_at, n.updated_at,
                   s.name AS subject
            FROM notes n
            LEFT JOIN subjects s ON s.id=n.subject_id
            ORDER BY n.updated_at DESC, n.id DESC
        """;

        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement(sql);
             ResultSet r = p.executeQuery()) {

            while (r.next()) {
                list.add(new Note(
                    r.getInt("id"),
                    r.getString("title"),
                    r.getString("body"),
                    r.getString("subject"),
                    r.getString("created_at"),
                    r.getString("updated_at")
                ));
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }

        return list;
    }

    public void addNote(Integer subjectId, String title, String body) {
        String now = LocalDateTime.now().toString();

        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement("""
                 INSERT INTO notes(subject_id, title, body, created_at, updated_at)
                 VALUES(?, ?, ?, ?, ?)
             """)) {

            if (subjectId == null || subjectId <= 0) {
                p.setNull(1, Types.INTEGER);
            } else {
                p.setInt(1, subjectId);
            }

            p.setString(2, title.trim());
            p.setString(3, body);
            p.setString(4, now);
            p.setString(5, now);
            p.executeUpdate();

        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public void updateNote(int id, Integer subjectId, String title, String body) {
        String now = LocalDateTime.now().toString();

        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement("""
                 UPDATE notes
                 SET subject_id=?, title=?, body=?, updated_at=?
                 WHERE id=?
             """)) {

            if (subjectId == null || subjectId <= 0) {
                p.setNull(1, Types.INTEGER);
            } else {
                p.setInt(1, subjectId);
            }

            p.setString(2, title.trim());
            p.setString(3, body);
            p.setString(4, now);
            p.setInt(5, id);
            p.executeUpdate();

        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public void deleteNote(int id) {
        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement(
                     "DELETE FROM notes WHERE id=?")) {
            p.setInt(1, id);
            p.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public void addStudySession(Integer subjectId, int durationSeconds) {
        if (durationSeconds <= 0) {
            throw new RuntimeException("O tempo precisa ser maior que zero.");
        }

        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement("""
                 INSERT INTO study_sessions(subject_id, duration_seconds, studied_at)
                 VALUES(?, ?, ?)
             """)) {

            if (subjectId == null || subjectId <= 0) {
                p.setNull(1, Types.INTEGER);
            } else {
                p.setInt(1, subjectId);
            }

            p.setInt(2, durationSeconds);
            p.setString(3, LocalDateTime.now().toString());
            p.executeUpdate();

        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public List<StudySession> studySessions() {
        List<StudySession> list = new ArrayList<>();

        String sql = """
            SELECT ss.id, ss.duration_seconds, ss.studied_at,
                   s.name AS subject
            FROM study_sessions ss
            LEFT JOIN subjects s ON s.id=ss.subject_id
            ORDER BY ss.studied_at DESC, ss.id DESC
            LIMIT 30
        """;

        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement(sql);
             ResultSet r = p.executeQuery()) {

            while (r.next()) {
                list.add(new StudySession(
                    r.getInt("id"),
                    r.getString("subject"),
                    r.getInt("duration_seconds"),
                    r.getString("studied_at")
                ));
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }

        return list;
    }

    public StudySummary studySummary() {
        int totalSeconds = 0;
        int sessions = 0;
        int subjects = 0;
        int contents = 0;

        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement("""
                 SELECT
                     (SELECT COUNT(*) FROM subjects) AS subjects,
                     (SELECT COUNT(*) FROM contents) AS contents,
                     COALESCE(SUM(duration_seconds), 0) AS total_seconds,
                     COUNT(*) AS sessions
                 FROM study_sessions
             """);
             ResultSet r = p.executeQuery()) {

            if (r.next()) {
                subjects = r.getInt("subjects");
                contents = r.getInt("contents");
                totalSeconds = r.getInt("total_seconds");
                sessions = r.getInt("sessions");
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }

        return new StudySummary(subjects, contents, totalSeconds, sessions);
    }

    public Map<String, Boolean> roadmapProgress() {
        Map<String, Boolean> progress = new LinkedHashMap<>();

        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement(
                 "SELECT item_key, completed FROM roadmap_progress ORDER BY item_key");
             ResultSet r = p.executeQuery()) {

            while (r.next()) {
                progress.put(r.getString("item_key"), r.getInt("completed") == 1);
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }

        return progress;
    }

    public void setRoadmapProgress(String itemKey, boolean completed) {
        if (itemKey == null || itemKey.isBlank() || itemKey.length() > 120) {
            throw new RuntimeException("Item de roadmap inválido.");
        }

        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement("""
                 INSERT INTO roadmap_progress(item_key, completed, updated_at)
                 VALUES(?, ?, ?)
                 ON CONFLICT(item_key) DO UPDATE SET
                     completed=excluded.completed,
                     updated_at=excluded.updated_at
             """)) {
            p.setString(1, itemKey.trim());
            p.setInt(2, completed ? 1 : 0);
            p.setString(3, LocalDateTime.now().toString());
            p.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public List<ChatMessage> chatHistory(int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 100));
        List<ChatMessage> reversed = new ArrayList<>();

        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement("""
                 SELECT id, role, content, created_at
                 FROM chat_messages
                 ORDER BY id DESC
                 LIMIT ?
             """)) {
            p.setInt(1, safeLimit);

            try (ResultSet r = p.executeQuery()) {
                while (r.next()) {
                    reversed.add(new ChatMessage(
                        r.getInt("id"),
                        r.getString("role"),
                        r.getString("content"),
                        r.getString("created_at")
                    ));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }

        Collections.reverse(reversed);
        return reversed;
    }

    public void addChatMessage(String role, String content) {
        if (!("user".equals(role) || "assistant".equals(role))) {
            throw new RuntimeException("Papel de mensagem inválido.");
        }

        String text = content == null ? "" : content.trim();
        if (text.isBlank()) return;

        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement("""
                 INSERT INTO chat_messages(role, content, created_at)
                 VALUES(?, ?, ?)
             """)) {
            p.setString(1, role);
            p.setString(2, text);
            p.setString(3, LocalDateTime.now().toString());
            p.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    public void clearChatHistory() {
        try (Connection c = connect();
             PreparedStatement p = c.prepareStatement("DELETE FROM chat_messages")) {
            p.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }

    private record ContentRow(int id, int position) {}

    public record Subject(int id, String name, int position) {}
    public record Content(int id, String name, String status, int position) {}
    public record Review(int id, String subject, String content, String date, boolean completed) {}
    public record Progress(String subject, int total, int solidified) {}
    public record Note(int id, String title, String body, String subject, String createdAt, String updatedAt) {}
    public record StudySession(int id, String subject, int durationSeconds, String studiedAt) {}
    public record StudySummary(int subjects, int contents, int totalSeconds, int sessions) {}
    public record ChatMessage(int id, String role, String content, String createdAt) {}
}
