import { Router } from "express";
import { db, expensesTable } from "@workspace/db";
import { desc, gte, sql } from "drizzle-orm";
import { CreateExpenseBody, DeleteExpenseParams, GetAiAdviceBody } from "@workspace/api-zod";


const router = Router();

// GET /expenses — list all, newest first
router.get("/expenses", async (req, res) => {
  try {
    const expenses = await db
      .select()
      .from(expensesTable)
      .orderBy(desc(expensesTable.createdAt));

    res.json(
      expenses.map((e) => ({
        id: e.id,
        amount: parseFloat(e.amount),
        category: e.category,
        date: e.date,
        note: e.note ?? null,
        createdAt: e.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Failed to fetch expenses");
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
});

// POST /expenses — create
router.post("/expenses", async (req, res) => {
  const parsed = CreateExpenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  const { amount, category, date, note } = parsed.data;

  try {
    const [expense] = await db
      .insert(expensesTable)
      .values({
        amount: String(amount),
        category,
        date,
        note: note ?? null,
      })
      .returning();

    res.status(201).json({
      id: expense.id,
      amount: parseFloat(expense.amount),
      category: expense.category,
      date: expense.date,
      note: expense.note ?? null,
      createdAt: expense.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create expense");
    res.status(500).json({ error: "Failed to create expense" });
  }
});

// GET /expenses/summary — weekly, monthly, by-category totals
router.get("/expenses/summary", async (req, res) => {
  try {
    const now = new Date();

    // Start of current week (Monday)
    const weekStart = new Date(now);
    const day = weekStart.getDay();
    const diffToMon = (day === 0 ? -6 : 1 - day);
    weekStart.setDate(weekStart.getDate() + diffToMon);
    weekStart.setHours(0, 0, 0, 0);

    // Start of current month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const weekStartStr = weekStart.toISOString().split("T")[0];
    const monthStartStr = monthStart.toISOString().split("T")[0];

    const [weekRows, monthRows, categoryRows] = await Promise.all([
      db
        .select({ total: sql<string>`COALESCE(SUM(${expensesTable.amount}), 0)` })
        .from(expensesTable)
        .where(gte(expensesTable.date, weekStartStr)),
      db
        .select({ total: sql<string>`COALESCE(SUM(${expensesTable.amount}), 0)` })
        .from(expensesTable)
        .where(gte(expensesTable.date, monthStartStr)),
      db
        .select({
          category: expensesTable.category,
          total: sql<string>`COALESCE(SUM(${expensesTable.amount}), 0)`,
        })
        .from(expensesTable)
        .groupBy(expensesTable.category)
        .orderBy(desc(sql`SUM(${expensesTable.amount})`)),
    ]);

    res.json({
      weekTotal: parseFloat(weekRows[0]?.total ?? "0"),
      monthTotal: parseFloat(monthRows[0]?.total ?? "0"),
      byCategory: categoryRows.map((r) => ({
        category: r.category,
        total: parseFloat(r.total),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch summary");
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

// POST /expenses/advice — AI saving advice via Gemini
router.post("/expenses/advice", async (req, res) => {
  const parsed = GetAiAdviceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { expenses } = parsed.data;

  if (expenses.length === 0) {
    res.json({ advice: "You have no expenses yet! Start tracking your spending and I'll give you personalised saving tips." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    req.log.error("GEMINI_API_KEY is not set");
    res.status(500).json({ error: "AI service not configured" });
    return;
  }

  try {
    // Summarise expenses for the prompt
    const byCategory: Record<string, number> = {};
    let total = 0;
    for (const e of expenses) {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount;
      total += e.amount;
    }

    const categoryBreakdown = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => `  - ${cat}: Rs. ${amt.toFixed(0)}`)
      .join("\n");

    const prompt = `You are a friendly financial advisor helping Pakistani university students manage their money better.

Here is the student's recent expense data:
Total spent: Rs. ${total.toFixed(0)}
Number of transactions: ${expenses.length}
Spending by category:
${categoryBreakdown}

Please analyze their spending patterns and give 3–5 personalised, practical, and friendly saving tips in simple English. 
- Point out which category they're overspending in (if any) and why it matters for a student on a budget.
- Give concrete, actionable suggestions relevant to a Pakistani student (e.g. mention local context like hostel food, rickshaw vs. bus, mobile packages, etc.).
- Keep the tone encouraging and supportive, not judgmental.
- Format your response as clear paragraphs or a short numbered list. Do not use markdown headers.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const geminiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      req.log.error({ status: geminiRes.status, body: errText }, "Gemini API error");
      res.status(500).json({ error: "AI service error" });
      return;
    }

    const geminiData = await geminiRes.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const advice = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "Sorry, I could not generate advice right now.";

    res.json({ advice });
  } catch (err) {
    req.log.error({ err }, "Failed to get AI advice");
    res.status(500).json({ error: "AI service error" });
  }
});

// DELETE /expenses/:id
router.delete("/expenses/:id", async (req, res) => {
  const parsed = DeleteExpenseParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  try {
    const deleted = await db
      .delete(expensesTable)
      .where(sql`${expensesTable.id} = ${parsed.data.id}`)
      .returning();

    if (deleted.length === 0) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete expense");
    res.status(500).json({ error: "Failed to delete expense" });
  }
});

export default router;
