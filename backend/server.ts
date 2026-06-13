import express from "express";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "studyflow-secret-key-123";

// --- BigInt Serialization Fix ---
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

app.use(express.json());

// Debug middleware
app.use((req, res, next) => {
  if (req.url.startsWith('/api')) {
    console.log(`[API Request] ${req.method} ${req.url}`);
  }
  next();
});

// --- Database Setup ---
const db = new Database(path.join(__dirname, "studyflow.db"), { timeout: 5000 });
db.pragma('foreign_keys = ON');

// Health check
app.get("/api/ping", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Initialize Schema
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT,
      exam_date TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER,
      name TEXT,
      difficulty INTEGER DEFAULT 3, -- 1-5
      base_required_minutes REAL DEFAULT 300,
      required_minutes REAL,
      studied_minutes REAL DEFAULT 0,
      remaining_minutes REAL,
      predicted_completion_date TEXT,
      dynamic_priority REAL DEFAULT 0,
      last_studied_at TEXT,
      is_completed BOOLEAN DEFAULT 0,
      mastery_score REAL DEFAULT 0, -- 0-100 (performance based)
      FOREIGN KEY(subject_id) REFERENCES subjects(id)
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      topic_id INTEGER,
      score REAL, -- 0-100
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(topic_id) REFERENCES topics(id)
    );

    CREATE TABLE IF NOT EXISTS study_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      topic_id INTEGER,
      duration_minutes REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(topic_id) REFERENCES topics(id)
    );

    CREATE TABLE IF NOT EXISTS availability (
      user_id INTEGER,
      day_of_week INTEGER, -- 0-6 (Sun-Sat)
      hours REAL,
      PRIMARY KEY(user_id, day_of_week),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);
} catch (e) {
  console.error("Database initialization failed:", e);
}

// Migrations
const migrations = [
  "ALTER TABLE topics ADD COLUMN base_required_minutes REAL DEFAULT 300",
  "ALTER TABLE topics ADD COLUMN required_minutes REAL",
  "ALTER TABLE topics ADD COLUMN studied_minutes REAL DEFAULT 0",
  "ALTER TABLE topics ADD COLUMN remaining_minutes REAL",
  "ALTER TABLE topics ADD COLUMN predicted_completion_date TEXT",
  "ALTER TABLE topics ADD COLUMN dynamic_priority REAL DEFAULT 0",
  "ALTER TABLE topics ADD COLUMN last_studied_at TEXT",
  "CREATE TABLE IF NOT EXISTS study_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, topic_id INTEGER, duration_minutes REAL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(topic_id) REFERENCES topics(id))",
  "ALTER TABLE topics ADD COLUMN mastery_score REAL DEFAULT 0",
  `CREATE TABLE IF NOT EXISTS quiz_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    topic_id INTEGER,
    score REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(topic_id) REFERENCES topics(id)
  )`
];

migrations.forEach(m => {
  try {
    db.prepare(m).run();
  } catch (e) {
    // Column already exists or table doesn't exist yet
  }
});

// Verify schema and apply surgical fixes
try {
  const info = db.prepare("PRAGMA table_info(subjects)").all() as any[];
  console.log("Subjects table info:", info);
  
  const hasExamDate = info.some(col => col.name === 'exam_date');
  if (!hasExamDate) {
    console.log("Adding missing exam_date column to subjects table...");
    db.prepare("ALTER TABLE subjects ADD COLUMN exam_date TEXT").run();
  }
} catch (e) {
  console.error("Failed to verify/fix subjects schema:", e);
}

// --- Auth Middleware ---
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.log("Auth failed: No token provided");
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) {
      console.log("Auth failed: JWT verify error", err.message);
      return res.sendStatus(403);
    }
    
    // Verify user still exists in DB
    try {
      const user = db.prepare("SELECT id, username FROM users WHERE id = ?").get(decoded.id);
      if (!user) {
        console.log(`Auth: Session for user ${decoded.id} is no longer valid.`);
        return res.status(401).json({ error: "Session invalid" });
      }
      req.user = user;
      next();
    } catch (e: any) {
      console.error("Auth failed: Database error during user verification", e.message);
      return res.sendStatus(401);
    }
  });
};

// --- Mastery Logic Helper ---
const recalculateTopicMastery = (topicId: number, userId: number) => {
  const topic: any = db.prepare(`
    SELECT t.*, s.exam_date 
    FROM topics t 
    JOIN subjects s ON t.subject_id = s.id 
    WHERE t.id = ?
  `).get(topicId);

  if (!topic) return;

  const performanceMultiplier = 1.5 - ((topic.mastery_score || 0) / 100);
  const difficultyMultiplier = (topic.difficulty || 3) / 3;
  const requiredMinutes = (topic.base_required_minutes || 300) * difficultyMultiplier * performanceMultiplier;
  const remainingMinutes = Math.max(0, requiredMinutes - (topic.studied_minutes || 0));

  // Calculate Average Daily Effective Minutes (last 7 days)
  const last7DaysSessions: any[] = db.prepare(`
    SELECT duration_minutes, date(created_at) as session_date
    FROM study_sessions 
    WHERE user_id = ? AND created_at >= date('now', '-7 days')
  `).all(userId);

  const totalMinutesLast7Days = last7DaysSessions.reduce((sum, s) => sum + s.duration_minutes, 0);
  const activeStudyDays = new Set(last7DaysSessions.map(s => s.session_date)).size;
  const averageDailyEffectiveMinutes = activeStudyDays > 0 ? totalMinutesLast7Days / activeStudyDays : 0;

  // Predicted Completion Date
  let predictedCompletionDate = null;
  if (averageDailyEffectiveMinutes > 0) {
    const remainingDays = remainingMinutes / averageDailyEffectiveMinutes;
    const completionDate = new Date();
    completionDate.setDate(completionDate.getDate() + Math.ceil(remainingDays));
    predictedCompletionDate = completionDate.toISOString().split('T')[0];
  }

  // Dynamic Priority
  const now = new Date();
  const examDate = new Date(topic.exam_date);
  const diffTime = examDate.getTime() - now.getTime();
  const daysUntilExam = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

  let dynamicPriority = remainingMinutes / daysUntilExam;
  if (predictedCompletionDate) {
    const pDate = new Date(predictedCompletionDate);
    if (pDate > examDate) {
      dynamicPriority *= 2;
    }
  }

  db.prepare(`
    UPDATE topics 
    SET required_minutes = ?, 
        remaining_minutes = ?, 
        predicted_completion_date = ?, 
        dynamic_priority = ? 
    WHERE id = ?
  `).run(requiredMinutes, remainingMinutes, predictedCompletionDate, dynamicPriority, topicId);

  return {
    averageDailyEffectiveMinutes,
    predictedCompletionDate,
    remainingMinutes,
    requiredMinutes
  };
};

// --- Controllers / Routes ---

app.post("/api/quiz/submit", authenticateToken, async (req: any, res) => {
  const { topicId, score } = req.body; // score is 0-100
  try {
    // 1. Log attempt
    db.prepare("INSERT INTO quiz_attempts (user_id, topic_id, score) VALUES (?, ?, ?)")
      .run(req.user.id, topicId, score);

    // 2. Update topic mastery score using rolling average of last 3 attempts
    const recentAttempts: any[] = db.prepare(
      "SELECT score FROM quiz_attempts WHERE topic_id = ? ORDER BY created_at DESC LIMIT 3"
    ).all(topicId);
    const allScores = recentAttempts.map(a => a.score);
    const rollingAvg = allScores.reduce((sum, s) => sum + s, 0) / allScores.length;
    db.prepare("UPDATE topics SET mastery_score = ? WHERE id = ?").run(Math.round(rollingAvg), topicId);

    // 3. Recalculate
    recalculateTopicMastery(topicId, req.user.id);

    res.json({ success: true, newMasteryScore: score });
  } catch (error) {
    console.error("Quiz submission error:", error);
    res.status(500).json({ error: "Failed to submit quiz" });
  }
});

// Auth
app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body;
  console.log(`Register attempt for: ${username}`);
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = db.prepare("INSERT INTO users (username, password) VALUES (?, ?)").run(username, hashedPassword);
    const userId = Number(result.lastInsertRowid);
    const token = jwt.sign({ id: userId, username }, JWT_SECRET);
    console.log(`Register success for: ${username}, ID: ${userId}`);
    res.json({ token, user: { id: userId, username } });
  } catch (e: any) {
    console.error(`Register failed for: ${username}`, e.message);
    res.status(400).json({ error: "Username already exists or registration failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  console.log(`Login attempt for: ${username}`);
  try {
    const user: any = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    if (user && await bcrypt.compare(password, user.password)) {
      const userId = Number(user.id);
      const token = jwt.sign({ id: userId, username }, JWT_SECRET);
      console.log(`Login success for: ${username}, ID: ${userId}`);
      res.json({ token, user: { id: userId, username } });
    } else {
      console.log(`Login failed for: ${username} - Invalid credentials`);
      res.status(401).json({ error: "Invalid credentials" });
    }
  } catch (e: any) {
    console.error(`Login error for: ${username}`, e.message);
    res.status(500).json({ error: "Login failed" });
  }
});

// Subjects
app.get("/api/subjects", authenticateToken, (req: any, res) => {
  try {
    const subjects = db.prepare("SELECT * FROM subjects WHERE user_id = ?").all(req.user.id);
    res.json(subjects);
  } catch (e) {
    console.error("GET /api/subjects error:", e);
    res.status(500).json({ error: "Failed to fetch subjects" });
  }
});

app.post("/api/subjects", authenticateToken, (req: any, res) => {
  const { name, exam_date } = req.body;
  if (!name || !exam_date) return res.status(400).json({ error: "Missing fields" });
  
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "User ID not found in token" });

  try {
    const result = db.prepare("INSERT INTO subjects (user_id, name, exam_date) VALUES (?, ?, ?)").run(userId, name, exam_date);
    const subjectId = Number(result.lastInsertRowid);
    res.json({ id: subjectId, name, exam_date });
  } catch (e) {
    console.error("Subject creation error:", e);
    res.status(500).json({ error: `Failed to create subject: ${e instanceof Error ? e.message : 'Unknown error'}` });
  }
});

app.delete("/api/subjects/:id", authenticateToken, (req: any, res) => {
  const subjectId = req.params.id;
  const userId = req.user.id;
  
  console.log(`[Subject Delete] Request received for subject ${subjectId} by user ${userId}`);

  try {
    // 1. Verify ownership
    const subject = db.prepare("SELECT id FROM subjects WHERE id = ? AND user_id = ?").get(subjectId, userId);
    
    if (!subject) {
      console.warn(`[Subject Delete] Subject ${subjectId} not found or unauthorized for user ${userId}`);
      return res.status(404).json({ error: "Subject not found or unauthorized" });
    }

    // 2. Perform deletion in a transaction
    db.transaction(() => {
      // Delete quiz attempts
      db.prepare(`
        DELETE FROM quiz_attempts 
        WHERE topic_id IN (SELECT id FROM topics WHERE subject_id = ?)
      `).run(subjectId);

      // Delete study sessions
      const sessionsResult = db.prepare(`
        DELETE FROM study_sessions 
        WHERE topic_id IN (SELECT id FROM topics WHERE subject_id = ?)
      `).run(subjectId);
      console.log(`[Subject Delete] Deleted ${sessionsResult.changes} study sessions for subject ${subjectId}`);

      // Delete topics
      const topicsResult = db.prepare("DELETE FROM topics WHERE subject_id = ?").run(subjectId);
      console.log(`[Subject Delete] Deleted ${topicsResult.changes} topics for subject ${subjectId}`);

      // Delete subject
      const subjectResult = db.prepare("DELETE FROM subjects WHERE id = ? AND user_id = ?").run(subjectId, userId);
      console.log(`[Subject Delete] Deleted subject ${subjectId}, result: ${subjectResult.changes} rows affected`);
    })();

    console.log(`[Subject Delete] Successfully completed deletion for subject ${subjectId}`);
    res.sendStatus(204);
  } catch (e: any) {
    console.error(`[Subject Delete] CRITICAL ERROR deleting subject ${subjectId}:`, e.message);
    res.status(500).json({ error: "Delete failed: " + e.message });
  }
});

// Topics
app.get("/api/subjects/:id/topics", authenticateToken, (req: any, res) => {
  try {
    const topics = db.prepare("SELECT * FROM topics WHERE subject_id = ?").all(req.params.id);
    res.json(topics);
  } catch (e) {
    console.error("GET topics error:", e);
    res.status(500).json({ error: "Failed to fetch topics" });
  }
});

app.post("/api/subjects/:id/topics", authenticateToken, (req: any, res) => {
  const { name, difficulty, base_required_minutes } = req.body;
  try {
    const result = db.prepare("INSERT INTO topics (subject_id, name, difficulty, base_required_minutes) VALUES (?, ?, ?, ?)")
      .run(req.params.id, name, difficulty || 3, base_required_minutes || 300);
    const topicId = Number(result.lastInsertRowid);
    
    recalculateTopicMastery(topicId, req.user.id);
    const updatedTopic = db.prepare("SELECT * FROM topics WHERE id = ?").get(topicId);
    
    res.json(updatedTopic);
  } catch (e) {
    console.error("Topic creation error:", e);
    res.status(500).json({ error: `Failed to create topic: ${e instanceof Error ? e.message : 'Unknown error'}` });
  }
});

app.post("/api/study-sessions", authenticateToken, (req: any, res) => {
  const { topic_id, duration_minutes } = req.body;
  if (!topic_id || !duration_minutes) return res.status(400).json({ error: "Missing fields" });

  try {
    // Get old state for insight calculation
    const topicBefore: any = db.prepare("SELECT * FROM topics WHERE id = ?").get(topic_id);
    
    // Calculate old average for insight
    const last7DaysSessionsBefore: any[] = db.prepare(`
      SELECT duration_minutes, date(created_at) as session_date
      FROM study_sessions 
      WHERE user_id = ? AND created_at >= date('now', '-7 days')
    `).all(req.user.id);
    const totalMinutesBefore = last7DaysSessionsBefore.reduce((sum, s) => sum + s.duration_minutes, 0);
    const activeDaysBefore = new Set(last7DaysSessionsBefore.map(s => s.session_date)).size;
    const avgBefore = activeDaysBefore > 0 ? totalMinutesBefore / activeDaysBefore : 0;

    // Log session
    db.prepare("INSERT INTO study_sessions (user_id, topic_id, duration_minutes) VALUES (?, ?, ?)")
      .run(req.user.id, topic_id, duration_minutes);
    
    // Update topic studied minutes
    db.prepare("UPDATE topics SET studied_minutes = studied_minutes + ?, last_studied_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(duration_minutes, topic_id);

    // Recalculate
    const stats = recalculateTopicMastery(topic_id, req.user.id);
    
    // Insight logic
    let insight = null;
    if (avgBefore > 0 && stats && stats.averageDailyEffectiveMinutes > avgBefore) {
      const oldRemainingDays = topicBefore.remaining_minutes / avgBefore;
      const newRemainingDays = stats.remainingMinutes / stats.averageDailyEffectiveMinutes;
      const delta = Math.round(oldRemainingDays - newRemainingDays);
      if (delta > 0) {
        insight = `You increased your daily study output. At this rate, you will finish this topic ${delta} days earlier.`;
      }
    }

    res.json({ success: true, stats, insight });
  } catch (e) {
    console.error("Study session error:", e);
    res.status(500).json({ error: "Failed to log study session" });
  }
});

app.patch("/api/topics/:id", authenticateToken, (req: any, res) => {
  const { is_completed, difficulty, base_required_minutes } = req.body;
  try {
    if (is_completed !== undefined) {
      db.prepare("UPDATE topics SET is_completed = ? WHERE id = ?").run(is_completed ? 1 : 0, req.params.id);
    }
    if (difficulty !== undefined) {
      db.prepare("UPDATE topics SET difficulty = ? WHERE id = ?").run(difficulty, req.params.id);
    }
    if (base_required_minutes !== undefined) {
      db.prepare("UPDATE topics SET base_required_minutes = ? WHERE id = ?").run(base_required_minutes, req.params.id);
    }
    
    recalculateTopicMastery(Number(req.params.id), req.user.id);
    const updatedTopic = db.prepare("SELECT * FROM topics WHERE id = ?").get(req.params.id);
    res.json(updatedTopic);
  } catch (e) {
    res.status(500).json({ error: "Update failed" });
  }
});

app.delete("/api/topics/:id", authenticateToken, (req: any, res) => {
  const topicId = req.params.id;
  const userId = req.user.id;
  
  console.log(`[Topic Delete] Request received for topic ${topicId} by user ${userId}`);

  try {
    // Verify ownership (topic belongs to a subject owned by the user)
    const topic = db.prepare(`
      SELECT t.id 
      FROM topics t 
      JOIN subjects s ON t.subject_id = s.id 
      WHERE t.id = ? AND s.user_id = ?
    `).get(topicId, userId);

    if (!topic) {
      console.warn(`[Topic Delete] Topic ${topicId} not found or unauthorized for user ${userId}`);
      return res.status(404).json({ error: "Topic not found or unauthorized" });
    }

    db.transaction(() => {
      // 1. Delete quiz attempts for this topic
      db.prepare("DELETE FROM quiz_attempts WHERE topic_id = ?").run(topicId);

      // 2. Delete study sessions for this topic
      const sessionsResult = db.prepare("DELETE FROM study_sessions WHERE topic_id = ?").run(topicId);
      console.log(`[Topic Delete] Deleted ${sessionsResult.changes} study sessions for topic ${topicId}`);

      // 2. Delete the topic
      const topicResult = db.prepare("DELETE FROM topics WHERE id = ?").run(topicId);
      console.log(`[Topic Delete] Deleted topic ${topicId}, result: ${topicResult.changes} rows affected`);
    })();

    console.log(`[Topic Delete] Successfully completed deletion for topic ${topicId}`);
    res.sendStatus(204);
  } catch (e: any) {
    console.error(`[Topic Delete] CRITICAL ERROR deleting topic ${topicId}:`, e.message);
    res.status(500).json({ error: "Delete failed: " + e.message });
  }
});

// Availability
app.get("/api/availability", authenticateToken, (req: any, res) => {
  try {
    const availability = db.prepare("SELECT * FROM availability WHERE user_id = ?").all(req.user.id);
    res.json(availability);
  } catch (e) {
    console.error("GET /api/availability error:", e);
    res.status(500).json({ error: "Failed to fetch availability" });
  }
});

app.post("/api/availability", authenticateToken, (req: any, res) => {
  const { day_of_week, hours } = req.body;
  try {
    db.prepare("INSERT OR REPLACE INTO availability (user_id, day_of_week, hours) VALUES (?, ?, ?)").run(req.user.id, day_of_week, hours);
    res.sendStatus(204);
  } catch (e) {
    res.status(500).json({ error: "Save failed" });
  }
});

// Optimizer
app.get("/api/optimizer/plan", authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const subjects: any[] = db.prepare("SELECT * FROM subjects WHERE user_id = ?").all(userId);
    const availability: any[] = db.prepare("SELECT * FROM availability WHERE user_id = ?").all(userId);
    
    if (subjects.length === 0) return res.json({ todayPlan: [], risks: [], scoredTopics: [] });

    const allTopics: any[] = [];
    subjects.forEach(s => {
      const topics = db.prepare(`
        SELECT t.*, s.name as subject_name, s.exam_date 
        FROM topics t 
        JOIN subjects s ON t.subject_id = s.id 
        WHERE t.subject_id = ? AND t.is_completed = 0
      `).all(s.id);
      allTopics.push(...topics);
    });

    // Sort by dynamic_priority descending
    const scoredTopics = allTopics.sort((a, b) => (b.dynamic_priority || 0) - (a.dynamic_priority || 0));

    const now = new Date();
    const risks = subjects.map(s => {
      const topics = db.prepare("SELECT * FROM topics WHERE subject_id = ? AND is_completed = 0").all(s.id) as any[];
      const totalRequiredMinutes = topics.reduce((sum, t) => sum + (t.remaining_minutes || 0), 0);
      const examDate = new Date(s.exam_date);
      const diffTime = examDate.getTime() - now.getTime();
      const daysLeft = isNaN(diffTime) ? 30 : Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      
      let totalAvailableMinutes = 0;
      for (let i = 0; i < daysLeft; i++) {
        const dayDate = new Date(now);
        dayDate.setDate(now.getDate() + i);
        const dayOfWeek = dayDate.getDay();
        const availHours = availability.find(a => a.day_of_week === dayOfWeek)?.hours || 0;
        totalAvailableMinutes += (availHours * 60);
      }

      let riskLevel = "LOW";
      if (totalRequiredMinutes > totalAvailableMinutes) riskLevel = "HIGH";
      else if (totalRequiredMinutes > totalAvailableMinutes * 0.8) riskLevel = "MEDIUM";

      return {
        subjectId: s.id,
        subjectName: s.name,
        totalRequired: totalRequiredMinutes / 60,
        totalAvailable: totalAvailableMinutes / 60,
        riskLevel,
        daysLeft,
        riskPercent: Math.min(100, Math.round((totalRequiredMinutes / (totalAvailableMinutes || 1)) * 100))
      };
    });

    // Generate AI Explanation for the highest risk subject
    const highRiskSubject = risks.find((r: any) => r.riskLevel === 'HIGH') || risks.find((r: any) => r.riskLevel === 'MEDIUM');
    
    if (highRiskSubject) {
      const weakTopics = db.prepare("SELECT name FROM topics WHERE subject_id = ? AND is_completed = 0 AND difficulty >= 4 LIMIT 3").all(highRiskSubject.subjectId) as any[];
      (highRiskSubject as any).weakTopics = weakTopics.map(t => t.name).join(', ');
    }

    const todayOfWeek = now.getDay();
    const todayAvailMinutes = (availability.find(a => a.day_of_week === todayOfWeek)?.hours || 0) * 60;
    let remainingMinutes = todayAvailMinutes;
    const todayPlan = [];
    
    for (const topic of scoredTopics) {
      if (remainingMinutes <= 0) break;
      const remTopicMinutes = topic.remaining_minutes || 0;
      const studyTime = Math.min(remainingMinutes, remTopicMinutes, 120); // Max 2 hours per topic per day
      if (studyTime > 15) {
        todayPlan.push({ topicId: topic.id, topicName: topic.name, subjectName: topic.subject_name, hours: studyTime / 60 });
        remainingMinutes -= studyTime;
      }
    }

    res.json({ todayPlan, risks, scoredTopics, subjects });
  } catch (error) {
    console.error("Optimizer error:", error);
    res.status(500).json({ error: "Failed to generate plan" });
  }
});

// --- Server Startup ---
async function startServer() {
  // Catch-all for missing API routes to prevent HTML fallback
  app.all("/api/*", (req, res) => {
    console.log(`[API 404] ${req.method} ${req.url}`);
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
  });

  if (process.env.NODE_ENV !== "production") {
    // Local dev: dynamically import Vite and use as middleware
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("Vite dev server middleware attached.");
    } catch (e) {
      console.warn("Vite not available, running as API-only server.");
    }
  } else {
    // Production: serve static frontend if dist exists
    const distPath = path.join(__dirname, "../dist");
    try {
      const fs = await import("fs");
      if (fs.existsSync(distPath)) {
        app.use(express.static(distPath));
        app.get("*", (req, res) => {
          res.sendFile(path.join(distPath, "index.html"));
        });
        console.log("Serving static frontend from", distPath);
      } else {
        console.log("No dist/ found — running as API-only server.");
      }
    } catch {
      console.log("Running as API-only server.");
    }
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
