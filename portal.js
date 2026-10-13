import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cfg = window.AMI_CONFIG || {};
const $ = (id) => document.getElementById(id);
const configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
const sb = configured
  ? createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
  : null;
let mode = "signin",
  user = null,
  profile = null,
  children = [];
const say = (m, error = false) => {
  $("feedback").textContent = m;
  $("feedback").className = error ? "danger" : "";
};
const el = (tag, txt, cls) => {
  const e = document.createElement(tag);
  if (txt !== undefined) e.textContent = String(txt);
  if (cls) e.className = cls;
  return e;
};
const empty = (id, msg) => {
  $(id).replaceChildren(el("p", msg, "muted-text"));
};
function entry(id, title, details, extra) {
  const wrap = el("div", undefined, "entry");
  wrap.append(el("strong", title), el("small", details));
  if (extra) wrap.append(extra);
  $(id).append(wrap);
}
const fmtDate = (s) =>
  s
    ? new Date(s).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not set";
const money = (n) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(
    Number(n) / 100,
  );
function tab(next) {
  mode = next;
  document
    .querySelectorAll("[data-auth]")
    .forEach((b) => b.classList.toggle("active", b.dataset.auth === next));
  $("nameLabel").hidden = next !== "signup";
  $("fullname").required = next === "signup";
  $("authSubmit").textContent =
    next === "signup" ? "Register parent account" : "Sign in";
}
document
  .querySelectorAll("[data-auth]")
  .forEach((b) => b.addEventListener("click", () => tab(b.dataset.auth)));
if (!configured) {
  $("setup").hidden = false;
  $("authSubmit").disabled = true;
  $("reset").disabled = true;
}
$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!sb) return;
  const email = $("email").value.trim(),
    password = $("password").value;
  try {
    if (mode === "signup") {
      const name = $("fullname").value.trim();
      const { error } = await sb.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name, requested_role: "parent" },
          emailRedirectTo: location.origin + "/portal.html",
        },
      });
      if (error) throw error;
      say(
        "Registration submitted. Check your email for a confirmation link, then sign in.",
      );
      tab("signin");
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await load();
    }
  } catch (err) {
    say(err.message, true);
  }
});
$("reset").addEventListener("click", async () => {
  if (!sb) return;
  const email = $("email").value.trim();
  if (!email) {
    say("Enter your email first.", true);
    return;
  }
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: location.origin + "/portal.html",
  });
  say(
    error
      ? error.message
      : "If this account exists, password reset instructions have been sent.",
    !!error,
  );
});
$("signout").addEventListener("click", async () => {
  await sb.auth.signOut();
  await load();
});
async function get(table, query) {
  let q = sb.from(table).select("*");
  if (query) q = query(q);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
async function load() {
  if (!sb) return;
  const {
    data: { user: u },
  } = await sb.auth.getUser();
  user = u;
  $("auth").hidden = !!u;
  $("workspace").hidden = !u;
  if (!u) return;
  try {
    const profiles = await get("profiles", (q) => q.eq("id", u.id));
    profile = profiles[0];
    if (!profile) throw Error("Account profile not ready. Contact support.");
    children =
      profile.role === "parent"
        ? await get("student_guardians", (q) => q.eq("guardian_id", u.id))
        : [];
    $("welcome").textContent = `Welcome, ${profile.full_name || "Learner"}`;
    $("roleLabel").textContent = `${profile.role.toUpperCase()} DASHBOARD`;
    const [lessons, assignments, attendance, reports, invoices] =
      await Promise.all(
        [
          "lessons",
          "assignments",
          "attendance",
          "progress_reports",
          "invoices",
        ].map((t) => get(t)),
      );
    $("summary").replaceChildren();
    [
      ["Lessons", lessons.length],
      ["Assignments", assignments.length],
      ["Attendance records", attendance.length],
      ["Invoices", invoices.length],
    ].forEach(([label, value]) => {
      const c = el("div", undefined, "metric");
      c.append(el("strong", value), el("span", label));
      $("summary").append(c);
    });
    for (const id of [
      "lessons",
      "assignments",
      "attendance",
      "reports",
      "invoices",
    ])
      $(id).replaceChildren();
    if (!lessons.length) empty("lessons", "No lessons scheduled yet.");
    lessons
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
      .forEach((x) => {
        const a =
          x.meeting_url && x.starts_at ? el("a", "Join live class ↗") : null;
        if (a) {
          a.href = x.meeting_url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
        }
        entry(
          "lessons",
          x.title,
          `${fmtDate(x.starts_at)} • ${x.duration_minutes} minutes • ${x.status}`,
          a,
        );
      });
    if (!assignments.length) empty("assignments", "No assignments available.");
    assignments.forEach((x) => {
      const btn = el("button", "View / submit", "mini-btn");
      btn.onclick = () => submitAssignment(x);
      entry(
        "assignments",
        x.title,
        `Due: ${fmtDate(x.due_at)} • ${x.instructions || ""}`,
        profile.role === "student" ? btn : null,
      );
    });
    if (!attendance.length) empty("attendance", "No attendance recorded.");
    attendance.forEach((x) =>
      entry(
        "attendance",
        x.status,
        `Lesson: ${x.lesson_id} • ${x.notes || "No notes"}`,
      ),
    );
    if (!reports.length) empty("reports", "No progress reports published.");
    reports.forEach((x) =>
      entry(
        "reports",
        x.subject || "Progress report",
        `${x.period_label || ""} • ${x.score == null ? "No score" : x.score + "%"} • ${x.comments || ""}`,
      ),
    );
    if (!invoices.length) empty("invoices", "No invoices available.");
    invoices.forEach((x) => {
      const btn = el("button", "Pay securely", "mini-btn");
      btn.disabled = x.status === "paid";
      btn.onclick = () => pay(x.id);
      entry(
        "invoices",
        `${money(x.amount_kobo)} — ${x.status}`,
        `Invoice ${x.id.slice(0, 8)} • ${x.description || ""}`,
        x.status === "paid" ? null : btn,
      );
    });
    await management();
  } catch (err) {
    say(err.message, true);
  }
}
async function submitAssignment(a) {
  const text = prompt(
    "Enter your submission text or a link to your work (do not include sensitive information):",
  );
  if (!text?.trim()) return;
  const { error } = await sb
    .from("submissions")
    .upsert(
      { assignment_id: a.id, student_id: user.id, content: text.trim() },
      { onConflict: "assignment_id,student_id" },
    );
  say(error ? error.message : "Assignment submitted.", !!error);
}
async function pay(id) {
  try {
    say("Preparing secure payment…");
    const {
      data: { session },
    } = await sb.auth.getSession();
    const r = await fetch("/api/payments/initialize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ invoice_id: id }),
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error || "Payment could not be started");
    location.assign(data.authorization_url);
  } catch (err) {
    say(err.message, true);
  }
}
function form(fields, button, handler) {
  const f = el("form", undefined, "form-stack");
  for (const [key, label, type, options] of fields) {
    const l = el("label", label),
      i = document.createElement(
        type === "select"
          ? "select"
          : type === "textarea"
            ? "textarea"
            : "input",
      );
    i.name = key;
    i.required = true;
    if (i.tagName === "INPUT") i.type = type;
    if (type === "select") {
      for (const [value, text] of options) {
        const o = el("option", text);
        o.value = value;
        i.append(o);
      }
    }
    l.append(i);
    f.append(l);
  }
  const b = el("button", button, "mini-btn");
  b.type = "submit";
  f.append(b);
  f.onsubmit = async (e) => {
    e.preventDefault();
    b.disabled = true;
    try {
      await handler(Object.fromEntries(new FormData(f)));
      f.reset();
      await load();
      say("Saved successfully.");
    } catch (err) {
      say(err.message, true);
    } finally {
      b.disabled = false;
    }
  };
  return f;
}
async function insert(table, data) {
  const { error } = await sb.from(table).insert(data);
  if (error) throw error;
}
async function management() {
  const root = $("manageBody");
  root.replaceChildren();
  const role = profile.role;
  if (role === "student") {
    root.append(
      el("p", "Contact your tutor or guardian for help with lessons."),
    );
    return;
  }
  if (role === "parent") {
    root.append(
      el(
        "p",
        `Linked learner accounts: ${children.length}. Contact administration to link a learner.`,
      ),
    );
    return;
  }
  if (!["tutor", "admin"].includes(role)) return;
  const admin = role === "admin";
  const profiles = admin ? await get("profiles") : [];
  const links = await get("tutor_students", (q) =>
    admin ? q : q.eq("tutor_id", user.id),
  );
  const students = admin
    ? profiles.filter((p) => p.role === "student")
    : links.map((l) => ({ id: l.student_id, full_name: l.student_id }));
  const tutors = admin
    ? profiles.filter((p) => p.role === "tutor")
    : [{ id: user.id, full_name: profile.full_name || "Your account" }];
  const parents = admin ? profiles.filter((p) => p.role === "parent") : [];
  const options = (a) =>
    a.map((x) => [x.id, `${x.full_name || "Unnamed"} (${x.id.slice(0, 8)})`]);
  const studentField = ["student_id", "Student", "select", options(students)];
  const tutorField = ["tutor_id", "Tutor", "select", options(tutors)];
  const appendForm = (heading, fields, label, handler) => {
    root.append(el("h3", heading));
    root.append(form(fields, label, handler));
  };
  if (admin) {
    appendForm(
      "Assign tutor to student",
      [studentField, tutorField],
      "Assign tutor",
      async (d) => {
        await insert("tutor_students", d);
      },
    );
    appendForm(
      "Link parent to student",
      [studentField, ["guardian_id", "Parent", "select", options(parents)]],
      "Link parent",
      async (d) => {
        await insert("student_guardians", d);
      },
    );
  }
  if (!students.length) {
    root.append(
      el(
        "p",
        admin
          ? "Create a student account and set its role in Supabase before scheduling."
          : "No students assigned to you. Ask an administrator to assign a student.",
        "hint",
      ),
    );
  }
  if (!tutors.length) {
    root.append(
      el(
        "p",
        "Create a tutor account in Supabase before scheduling lessons.",
        "hint",
      ),
    );
  }
  const teaching = [studentField, ...(admin ? [tutorField] : [])];
  appendForm(
    "Schedule a lesson",
    [
      ["title", "Lesson title", "text"],
      ...teaching,
      ["starts_at", "Start time", "datetime-local"],
      ["duration_minutes", "Duration (minutes)", "number"],
      ["meeting_url", "Google Meet / Zoom HTTPS link", "url"],
    ],
    "Create lesson",
    async (d) => {
      await insert("lessons", {
        title: d.title,
        student_id: d.student_id,
        tutor_id: admin ? d.tutor_id : user.id,
        starts_at: new Date(d.starts_at).toISOString(),
        duration_minutes: Number(d.duration_minutes),
        meeting_url: d.meeting_url,
      });
    },
  );
  appendForm(
    "Create assignment",
    [
      ["title", "Assignment title", "text"],
      ...teaching,
      ["instructions", "Instructions", "textarea"],
      ["due_at", "Due date", "datetime-local"],
    ],
    "Publish assignment",
    async (d) => {
      await insert("assignments", {
        title: d.title,
        student_id: d.student_id,
        tutor_id: admin ? d.tutor_id : user.id,
        instructions: d.instructions,
        due_at: new Date(d.due_at).toISOString(),
      });
    },
  );
  const lessons = await get("lessons");
  const lessonOpts = lessons
    .filter((l) => admin || l.tutor_id === user.id)
    .map((l) => [l.id, `${l.title} (${l.id.slice(0, 8)})`]);
  appendForm(
    "Record attendance",
    [
      ["lesson_id", "Lesson", "select", lessonOpts],
      [
        "status",
        "Status",
        "select",
        [
          ["present", "Present"],
          ["absent", "Absent"],
          ["late", "Late"],
          ["excused", "Excused"],
        ],
      ],
      ["notes", "Notes", "textarea"],
    ],
    "Save attendance",
    async (d) => {
      const l = lessons.find((x) => x.id === d.lesson_id);
      if (!l) throw Error("Select a valid lesson");
      await insert("attendance", {
        lesson_id: l.id,
        student_id: l.student_id,
        status: d.status,
        notes: d.notes,
        recorded_by: user.id,
      });
    },
  );
  appendForm(
    "Publish progress report",
    [
      ...teaching,
      ["subject", "Subject", "text"],
      ["period_label", "Reporting period", "text"],
      ["score", "Score (0–100)", "number"],
      ["comments", "Comments", "textarea"],
    ],
    "Publish report",
    async (d) => {
      await insert("progress_reports", {
        student_id: d.student_id,
        subject: d.subject,
        period_label: d.period_label,
        score: Number(d.score),
        comments: d.comments,
        tutor_id: admin ? d.tutor_id : user.id,
      });
    },
  );
  if (admin) {
    appendForm(
      "Create invoice",
      [
        studentField,
        ["description", "Description", "text"],
        ["amount", "Amount in NGN", "number"],
      ],
      "Create invoice",
      async (d) => {
        if (Number(d.amount) <= 0) throw Error("Amount must be positive");
        await insert("invoices", {
          student_id: d.student_id,
          description: d.description,
          amount_kobo: Math.round(Number(d.amount) * 100),
        });
      },
    );
    root.append(
      el(
        "p",
        "Create student and tutor accounts and assign their roles using Supabase Authentication and SQL Editor. The portal does not allow public role changes.",
        "hint",
      ),
    );
  }
}

if (sb) {
  sb.auth.onAuthStateChange((_event, session) => {
    if (session?.user?.id !== user?.id) setTimeout(load, 0);
  });
  load();
}
