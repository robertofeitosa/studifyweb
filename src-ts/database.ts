import BetterSqlite3 from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export interface Subject {
  id: number;
  name: string;
  position: number;
}

export interface Content {
  id: number;
  name: string;
  status: string;
  position: number;
}

export interface Review {
  id: number;
  subject: string;
  content: string;
  date: string;
  completed: boolean;
}

export interface Progress {
  subject: string;
  total: number;
  solidified: number;
}

export interface Note {
  id: number;
  title: string;
  body: string;
  subject: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StudySession {
  id: number;
  subject: string | null;
  durationSeconds: number;
  studiedAt: string;
}

export interface StudySummary {
  subjects: number;
  contents: number;
  totalSeconds: number;
  sessions: number;
}

export interface DocumentMeta {
  id: number;
  name: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface StoredDocument extends DocumentMeta {
  data: Buffer;
}

function isoLocalDateTime(): string {
  const d = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const millis = String(d.getMilliseconds()).padStart(3, "0");

  return [
    d.getFullYear(),
    "-",
    pad(d.getMonth() + 1),
    "-",
    pad(d.getDate()),
    "T",
    pad(d.getHours()),
    ":",
    pad(d.getMinutes()),
    ":",
    pad(d.getSeconds()),
    ".",
    millis
  ].join("");
}

export class StudifyDatabase {
  private readonly databasePathValue: string;
  private readonly db: BetterSqlite3.Database;

  constructor(
    fileName = "studify.db",
    seedFromTemplate = true
  ) {
    this.databasePathValue = this.resolveDatabasePath(fileName);
    this.initializeDatabaseFile(seedFromTemplate);

    this.db = new BetterSqlite3(this.databasePathValue);
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");

    this.createTables();
    this.normalizeOrders();
  }

  databasePath(): string {
    return this.databasePathValue;
  }

  private resolveDatabasePath(fileName: string): string {
    const explicitPath = process.env.DB_PATH?.trim();

    if (explicitPath) {
      const configured = path.resolve(explicitPath);

      if (fileName === "studify.db") {
        return configured;
      }

      return path.join(path.dirname(configured), fileName);
    }

    const railwayVolume = process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim();

    if (railwayVolume) {
      return path.join(railwayVolume, fileName);
    }

    return path.resolve(process.cwd(), fileName);
  }

  private initializeDatabaseFile(seedFromTemplate: boolean): void {
    const parent = path.dirname(this.databasePathValue);
    fs.mkdirSync(parent, { recursive: true });

    if (fs.existsSync(this.databasePathValue) || !seedFromTemplate) {
      return;
    }

    const seedPath = path.resolve(
      process.cwd(),
      "src/main/resources/seed/studify.db"
    );

    if (fs.existsSync(seedPath)) {
      fs.copyFileSync(seedPath, this.databasePathValue);
    }
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subjects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        position INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS contents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Não iniciado',
        position INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_id INTEGER NOT NULL,
        review_date TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(content_id) REFERENCES contents(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_id INTEGER,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS study_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_id INTEGER,
        duration_seconds INTEGER NOT NULL,
        studied_at TEXT NOT NULL,
        FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS roadmap_progress (
        item_key TEXT PRIMARY KEY,
        completed INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        uploaded_at TEXT NOT NULL,
        data BLOB NOT NULL
      );
    `);
  }

  private normalizeOrders(): void {
    const subjects = this.db
      .prepare("SELECT id FROM subjects ORDER BY position, id")
      .all() as Array<{ id: number }>;

    const normalize = this.db.transaction(() => {
      const updateSubject = this.db.prepare(
        "UPDATE subjects SET position=? WHERE id=?"
      );

      const contentIds = this.db.prepare(
        "SELECT id FROM contents WHERE subject_id=? ORDER BY position, id"
      );

      const updateContent = this.db.prepare(
        "UPDATE contents SET position=? WHERE id=?"
      );

      subjects.forEach((subject, index) => {
        updateSubject.run(index, subject.id);

        const contents = contentIds.all(subject.id) as Array<{ id: number }>;
        contents.forEach((content, contentIndex) => {
          updateContent.run(contentIndex, content.id);
        });
      });
    });

    normalize();
  }

  subjects(): Subject[] {
    return this.db
      .prepare(
        "SELECT id, name, position FROM subjects ORDER BY position, id"
      )
      .all() as Subject[];
  }

  subjectId(name: string): number {
    const row = this.db
      .prepare("SELECT id FROM subjects WHERE name=?")
      .get(name) as { id: number } | undefined;

    return row?.id ?? -1;
  }

  addSubject(name: string): void {
    this.db
      .prepare(`
        INSERT INTO subjects(name, position)
        VALUES(?, (SELECT COALESCE(MAX(position), -1) + 1 FROM subjects))
      `)
      .run(name.trim());
  }

  renameSubject(id: number, name: string): void {
    this.db
      .prepare("UPDATE subjects SET name=? WHERE id=?")
      .run(name.trim(), id);
  }

  deleteSubject(id: number): void {
    this.db.prepare("DELETE FROM subjects WHERE id=?").run(id);
    this.normalizeOrders();
  }

  moveSubject(id: number, direction: string): void {
    const list = this.subjects();
    const index = list.findIndex((subject) => subject.id === id);

    if (index < 0) return;

    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= list.length) return;

    const current = list[index];
    const other = list[target];

    const swap = this.db.transaction(() => {
      this.db
        .prepare("UPDATE subjects SET position=? WHERE id=?")
        .run(other.position, current.id);

      this.db
        .prepare("UPDATE subjects SET position=? WHERE id=?")
        .run(current.position, other.id);
    });

    swap();
  }

  contents(subject: string): Content[] {
    return this.db
      .prepare(`
        SELECT c.id, c.name, c.status, c.position
        FROM contents c
        JOIN subjects s ON s.id=c.subject_id
        WHERE s.name=?
        ORDER BY c.position, c.id
      `)
      .all(subject) as Content[];
  }

  addContent(subject: string, name: string): void {
    const subjectId = this.subjectId(subject);

    if (subjectId === -1) {
      throw new Error("Matéria não encontrada.");
    }

    this.db
      .prepare(`
        INSERT INTO contents(subject_id, name, status, position)
        VALUES(
          ?, ?, 'Não iniciado',
          (SELECT COALESCE(MAX(position), -1) + 1
           FROM contents
           WHERE subject_id=?)
        )
      `)
      .run(subjectId, name.trim(), subjectId);
  }

  renameContent(id: number, name: string): void {
    this.db
      .prepare("UPDATE contents SET name=? WHERE id=?")
      .run(name.trim(), id);
  }

  updateStatus(id: number, status: string): void {
    this.db
      .prepare("UPDATE contents SET status=? WHERE id=?")
      .run(status, id);
  }

  deleteContent(id: number): void {
    this.db.prepare("DELETE FROM contents WHERE id=?").run(id);
    this.normalizeOrders();
  }

  moveContent(id: number, direction: string): void {
    const subjectRow = this.db
      .prepare("SELECT subject_id FROM contents WHERE id=?")
      .get(id) as { subject_id: number } | undefined;

    if (!subjectRow) return;

    const list = this.db
      .prepare(
        "SELECT id, position FROM contents WHERE subject_id=? ORDER BY position, id"
      )
      .all(subjectRow.subject_id) as Array<{ id: number; position: number }>;

    const index = list.findIndex((item) => item.id === id);
    if (index < 0) return;

    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= list.length) return;

    const current = list[index];
    const other = list[target];

    const swap = this.db.transaction(() => {
      this.db
        .prepare("UPDATE contents SET position=? WHERE id=?")
        .run(other.position, current.id);

      this.db
        .prepare("UPDATE contents SET position=? WHERE id=?")
        .run(current.position, other.id);
    });

    swap();
  }

  addReview(contentId: number, date: string): void {
    this.db
      .prepare(
        "INSERT INTO reviews(content_id, review_date) VALUES(?, ?)"
      )
      .run(contentId, date);
  }

  reviews(): Review[] {
    const rows = this.db
      .prepare(`
        SELECT
          r.id,
          s.name AS subject,
          c.name AS content,
          r.review_date AS date,
          r.completed
        FROM reviews r
        JOIN contents c ON c.id=r.content_id
        JOIN subjects s ON s.id=c.subject_id
        ORDER BY r.completed, r.review_date
      `)
      .all() as Array<{
        id: number;
        subject: string;
        content: string;
        date: string;
        completed: number;
      }>;

    return rows.map((row) => ({
      ...row,
      completed: row.completed === 1
    }));
  }

  completeReview(id: number): void {
    this.db
      .prepare("UPDATE reviews SET completed=1 WHERE id=?")
      .run(id);
  }

  progress(): Progress[] {
    const rows = this.db
      .prepare(`
        SELECT
          s.name AS subject,
          COUNT(c.id) AS total,
          SUM(CASE WHEN c.status='Solidificado' THEN 1 ELSE 0 END) AS solidified,
          s.position
        FROM subjects s
        LEFT JOIN contents c ON c.subject_id=s.id
        GROUP BY s.id, s.name, s.position
        ORDER BY s.position, s.id
      `)
      .all() as Array<{
        subject: string;
        total: number;
        solidified: number | null;
      }>;

    return rows.map((row) => ({
      subject: row.subject,
      total: Number(row.total),
      solidified: Number(row.solidified ?? 0)
    }));
  }

  notes(): Note[] {
    const rows = this.db
      .prepare(`
        SELECT
          n.id,
          n.title,
          n.body,
          n.created_at,
          n.updated_at,
          s.name AS subject
        FROM notes n
        LEFT JOIN subjects s ON s.id=n.subject_id
        ORDER BY n.updated_at DESC, n.id DESC
      `)
      .all() as Array<{
        id: number;
        title: string;
        body: string;
        subject: string | null;
        created_at: string;
        updated_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      subject: row.subject,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  addNote(
    subjectId: number | null | undefined,
    title: string,
    body: string
  ): void {
    this.db
      .prepare(`
        INSERT INTO notes(subject_id, title, body, created_at, updated_at)
        VALUES(?, ?, ?, ?, ?)
      `)
      .run(
        subjectId && subjectId > 0 ? subjectId : null,
        title.trim(),
        body,
        isoLocalDateTime(),
        isoLocalDateTime()
      );
  }

  updateNote(
    id: number,
    subjectId: number | null | undefined,
    title: string,
    body: string
  ): void {
    this.db
      .prepare(`
        UPDATE notes
        SET subject_id=?, title=?, body=?, updated_at=?
        WHERE id=?
      `)
      .run(
        subjectId && subjectId > 0 ? subjectId : null,
        title.trim(),
        body,
        isoLocalDateTime(),
        id
      );
  }

  deleteNote(id: number): void {
    this.db.prepare("DELETE FROM notes WHERE id=?").run(id);
  }

  addStudySession(
    subjectId: number | null | undefined,
    durationSeconds: number
  ): void {
    if (durationSeconds <= 0) {
      throw new Error("O tempo precisa ser maior que zero.");
    }

    this.db
      .prepare(`
        INSERT INTO study_sessions(subject_id, duration_seconds, studied_at)
        VALUES(?, ?, ?)
      `)
      .run(
        subjectId && subjectId > 0 ? subjectId : null,
        durationSeconds,
        isoLocalDateTime()
      );
  }

  studySessions(): StudySession[] {
    const rows = this.db
      .prepare(`
        SELECT
          ss.id,
          ss.duration_seconds,
          ss.studied_at,
          s.name AS subject
        FROM study_sessions ss
        LEFT JOIN subjects s ON s.id=ss.subject_id
        ORDER BY ss.studied_at DESC, ss.id DESC
        LIMIT 30
      `)
      .all() as Array<{
        id: number;
        subject: string | null;
        duration_seconds: number;
        studied_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      durationSeconds: row.duration_seconds,
      studiedAt: row.studied_at
    }));
  }

  studySummary(): StudySummary {
    const row = this.db
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM subjects) AS subjects,
          (SELECT COUNT(*) FROM contents) AS contents,
          COALESCE(SUM(duration_seconds), 0) AS total_seconds,
          COUNT(*) AS sessions
        FROM study_sessions
      `)
      .get() as {
        subjects: number;
        contents: number;
        total_seconds: number;
        sessions: number;
      };

    return {
      subjects: Number(row.subjects),
      contents: Number(row.contents),
      totalSeconds: Number(row.total_seconds),
      sessions: Number(row.sessions)
    };
  }

  roadmapProgress(): Record<string, boolean> {
    const rows = this.db
      .prepare(
        "SELECT item_key, completed FROM roadmap_progress ORDER BY item_key"
      )
      .all() as Array<{ item_key: string; completed: number }>;

    return Object.fromEntries(
      rows.map((row) => [row.item_key, row.completed === 1])
    );
  }

  setRoadmapProgress(itemKey: string, completed: boolean): void {
    if (!itemKey || itemKey.trim().length === 0 || itemKey.length > 120) {
      throw new Error("Item de roadmap inválido.");
    }

    this.db
      .prepare(`
        INSERT INTO roadmap_progress(item_key, completed, updated_at)
        VALUES(?, ?, ?)
        ON CONFLICT(item_key) DO UPDATE SET
          completed=excluded.completed,
          updated_at=excluded.updated_at
      `)
      .run(itemKey.trim(), completed ? 1 : 0, isoLocalDateTime());
  }

  documents(): DocumentMeta[] {
    const rows = this.db
      .prepare(`
        SELECT id, name, size_bytes, uploaded_at
        FROM documents
        ORDER BY id DESC
      `)
      .all() as Array<{
        id: number;
        name: string;
        size_bytes: number;
        uploaded_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      sizeBytes: Number(row.size_bytes),
      uploadedAt: row.uploaded_at
    }));
  }

  addDocument(name: string | undefined, data: Buffer): number {
    let safeName = (name ?? "material.pdf").trim();

    if (!safeName) safeName = "material.pdf";

    if (!safeName.toLowerCase().endsWith(".pdf")) {
      safeName += ".pdf";
    }

    if (safeName.length > 180) {
      safeName = safeName.slice(0, 176) + ".pdf";
    }

    if (!data || data.length === 0) {
      throw new Error("O PDF está vazio.");
    }

    const result = this.db
      .prepare(`
        INSERT INTO documents(name, size_bytes, uploaded_at, data)
        VALUES(?, ?, ?, ?)
      `)
      .run(safeName, data.length, isoLocalDateTime(), data);

    return Number(result.lastInsertRowid);
  }

  document(id: number): StoredDocument | null {
    const row = this.db
      .prepare(`
        SELECT id, name, size_bytes, uploaded_at, data
        FROM documents
        WHERE id=?
      `)
      .get(id) as
      | {
          id: number;
          name: string;
          size_bytes: number;
          uploaded_at: string;
          data: Buffer;
        }
      | undefined;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      sizeBytes: Number(row.size_bytes),
      uploadedAt: row.uploaded_at,
      data: row.data
    };
  }

  deleteDocument(id: number): void {
    this.db.prepare("DELETE FROM documents WHERE id=?").run(id);
  }
}
