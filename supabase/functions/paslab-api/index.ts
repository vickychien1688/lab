// PAS English Lab — Supabase Edge Function 後端
// 與原 Google Apps Script 完全相同的 API 介面（action + JSON），前端幾乎不用改。
// 資料表皆為 public.paslab_*；音檔存 storage（paslab-audio 公開 / paslab-rec 私有）。
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// ---------- 小工具 ----------
const yn = (b: unknown) => (b === false || b === "no" ? "no" : "yes");
const toBool = (v: unknown) => !(String(v ?? "yes").toLowerCase() === "no");
const newId = (p: string) => p + Date.now() + Math.floor(Math.random() * 1000);
const safeName = (s: unknown) =>
  String(s || "unknown").replace(/[\\/:*?"<>|#%&{}\s]+/g, "_").slice(0, 80);
function b64bytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function tsFmt(ts: string): string {
  // 轉台灣時間 yyyy-MM-dd HH:mm:ss（與舊系統格式一致）
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  const t = new Date(d.getTime() + 8 * 3600 * 1000);
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`;
}
async function q<T>(r: Promise<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await r;
  if (error) throw new Error(error.message);
  return data;
}

// ---------- 列→舊API格式 ----------
const bookOut = (b: any) => ({
  classId: b.id, bookTitle: b.title, className: b.title,
  gradeId: b.id, gradeName: b.title, order: b.sort, active: yn(b.active),
});
const lessonOut = (l: any) => ({
  classId: l.book_id, lessonId: l.lesson_id, lessonLabel: l.label || l.lesson_id,
  text: l.body || "", audioUrl: l.audio_url || "", order: l.sort, active: yn(l.active),
  shadowMode: l.shadow_mode ? "yes" : "no", marks: l.marks || "",
  gapMultiplier: l.gap_multiplier || "", audioFileId: "",
});
const roomOut = (r: any) => ({ roomId: r.id, roomName: r.name, code: r.code, active: yn(r.active), order: r.sort });
const stuOut = (s: any) => ({ studentId: s.id, roomId: s.room_id, name: s.name, pin: s.pin || "", active: yn(s.active), order: s.sort });
const asnOut = (a: any) => ({
  assignId: a.id, roomId: a.room_id, classId: a.book_id, lessonId: a.lesson_id,
  dueDate: a.due_date || "", active: yn(a.active), order: a.sort, note: a.note || "",
});
const subOut = (s: any) => ({
  _row: s.id, timestamp: tsFmt(s.ts), classId: s.book_id, lessonId: s.lesson_id,
  studentName: s.student_name, fileId: String(s.id), fileName: s.file_name,
  durationSec: s.duration, score: s.score ?? "", comment: s.comment ?? "", status: s.status,
  roomId: s.room_id || "", studentId: s.student_id || "", assignId: s.assign_id || "",
});

// ---------- 驗證 ----------
async function adminPassword(): Promise<string> {
  const rows = await q(sb.from("paslab_config").select("value").eq("key", "adminPassword"));
  return rows?.[0]?.value ?? "1234";
}
async function authInfo(d: any) {
  const pw = String(d.password || "");
  const user = String(d.username || "").trim();
  if (!user) {
    if (pw && pw === (await adminPassword())) return { role: "admin", name: "主帳號", username: "" };
    return null;
  }
  const rows = await q(
    sb.from("paslab_teachers").select("*").ilike("username", user).eq("active", true),
  );
  const t = rows?.[0];
  if (t && String(t.password) === pw) return { role: t.role || "teacher", name: t.name || user, username: t.username };
  return null;
}

// ---------- 讀取 ----------
async function getBooks(activeOnly: boolean) {
  let s = sb.from("paslab_books").select("*").order("sort").order("id");
  if (activeOnly) s = s.eq("active", true);
  return (await q(s)).map(bookOut);
}
async function getLessons(bookId: string | undefined, activeOnly: boolean) {
  let s = sb.from("paslab_lessons").select("*").order("sort").order("lesson_id");
  if (bookId) s = s.eq("book_id", bookId);
  if (activeOnly) s = s.eq("active", true);
  return (await q(s)).map(lessonOut);
}

// ---------- 學生端 ----------
async function roomByCode(d: any) {
  const code = String(d.code || "").trim();
  if (!code) return { ok: false, error: "請輸入班級代碼" };
  const rooms = await q(sb.from("paslab_rooms").select("*").ilike("code", code).eq("active", true));
  if (!rooms?.length) return { ok: false, error: "找不到這個班級代碼" };
  const room = rooms[0];
  const studs = await q(
    sb.from("paslab_students").select("*").eq("room_id", room.id).eq("active", true).order("sort").order("name"),
  );
  return {
    ok: true,
    room: { roomId: room.id, roomName: room.name },
    students: studs.map((s: any) => ({ studentId: s.id, name: s.name, hasPin: !!String(s.pin || "").trim() })),
  };
}
async function studentLogin(d: any) {
  const rows = await q(sb.from("paslab_students").select("*").eq("id", String(d.studentId || "")));
  const s = rows?.[0];
  if (!s) return { ok: false, error: "找不到學生" };
  const pin = String(s.pin || "").trim();
  if (pin && String(d.pin || "").trim() !== pin) return { ok: false, error: "PIN 碼錯誤" };
  const rooms = await q(sb.from("paslab_rooms").select("*").eq("id", s.room_id));
  const room = rooms?.[0];
  return {
    ok: true,
    student: { studentId: s.id, name: s.name, roomId: s.room_id },
    room: room ? { roomId: room.id, roomName: room.name } : null,
  };
}
async function myAssignments(d: any) {
  if (!d.roomId) return { ok: false, error: "no room" };
  const [asns, books, lessons] = await Promise.all([
    q(sb.from("paslab_assignments").select("*").eq("room_id", d.roomId).eq("active", true).order("sort")),
    q(sb.from("paslab_books").select("*")),
    q(sb.from("paslab_lessons").select("book_id, lesson_id, label")),
  ]);
  const subs = d.studentId
    ? await q(sb.from("paslab_submissions").select("*").eq("student_id", d.studentId).order("ts", { ascending: false }))
    : [];
  const out = (asns as any[]).map((a) => {
    const book = (books as any[]).find((b) => b.id === a.book_id);
    const lesson = (lessons as any[]).find((l) => l.book_id === a.book_id && l.lesson_id === a.lesson_id);
    const last = (subs as any[]).find(
      (s) => (a.id && s.assign_id === a.id) || (s.book_id === a.book_id && s.lesson_id === a.lesson_id),
    );
    return {
      assignId: a.id, classId: a.book_id, lessonId: a.lesson_id,
      bookTitle: book?.title || a.book_id, gradeName: "", lessonLabel: lesson?.label || a.lesson_id,
      dueDate: a.due_date || "", note: a.note || "",
      done: !!last, status: last?.status || "", score: last?.score ?? "",
      comment: last?.comment ?? "", submittedAt: last ? tsFmt(last.ts) : "",
    };
  });
  return { ok: true, assignments: out };
}

// ---------- 繳交 / 音檔 ----------
async function submit(d: any) {
  if (!d.audio) return { ok: false, error: "沒有音檔資料" };
  const name = safeName(d.studentName);
  const ext = String(d.mime || "").includes("webm") ? "webm" : "m4a";
  const fileName = `${safeName(d.classId)}_${safeName(d.lessonId)}_${name}_${Date.now()}.${ext}`;
  const path = `rec/${fileName}`;
  const bytes = b64bytes(String(d.audio));
  const up = await sb.storage.from("paslab-rec").upload(path, bytes.buffer as ArrayBuffer, {
    contentType: String(d.mime || "audio/mp4"),
  });
  if (up.error) return { ok: false, error: up.error.message };
  await q(sb.from("paslab_submissions").insert({
    book_id: d.classId || "", lesson_id: d.lessonId || "", student_name: String(d.studentName || "unknown"),
    file_path: path, file_name: fileName, duration: Number(d.duration || 0),
    room_id: d.roomId || "", student_id: d.studentId || "", assign_id: d.assignId || "",
  }).select());
  return { ok: true };
}
async function uploadAudio(d: any) {
  if (!d.audio) return { ok: false, error: "沒有音檔資料" };
  const base = safeName(d.filename || "lesson_audio");
  const path = `lessons/${Date.now()}_${base}`;
  const bytes = b64bytes(String(d.audio));
  const up = await sb.storage.from("paslab-audio").upload(path, bytes.buffer as ArrayBuffer, {
    contentType: String(d.mime || "audio/mpeg"),
  });
  if (up.error) return { ok: false, error: up.error.message };
  const url = sb.storage.from("paslab-audio").getPublicUrl(path).data.publicUrl;
  return { ok: true, url, fileName: base, fileId: "" };
}
async function getAudio(d: any) {
  const rows = await q(sb.from("paslab_submissions").select("*").eq("id", Number(d.fileId)));
  const s = rows?.[0];
  if (!s?.file_path) return { ok: false, error: "not found" };
  const sig = await sb.storage.from("paslab-rec").createSignedUrl(s.file_path, 3600);
  if (sig.error) return { ok: false, error: sig.error.message };
  return { ok: true, url: sig.data.signedUrl, fileName: s.file_name };
}

// ---------- 後台 ----------
async function adminData(d: any) {
  const me = (await authInfo(d)) || { role: "admin", name: "主帳號", username: "" };
  const [books, lessons, subs, rooms, studs, asns] = await Promise.all([
    getBooks(false),
    getLessons(undefined, false),
    q(sb.from("paslab_submissions").select("*").order("ts", { ascending: false })),
    q(sb.from("paslab_rooms").select("*").order("sort")),
    q(sb.from("paslab_students").select("*").order("sort")),
    q(sb.from("paslab_assignments").select("*").order("sort")),
  ]);
  const stats: Record<string, any> = {};
  for (const s of subs as any[]) {
    const k = s.book_id + "|" + s.lesson_id;
    stats[k] ??= { classId: s.book_id, lessonId: s.lesson_id, count: 0, graded: 0, scoreSum: 0 };
    stats[k].count++;
    const n = Number(s.score);
    if (s.score !== "" && s.score != null && !isNaN(n)) { stats[k].graded++; stats[k].scoreSum += n; }
  }
  const statList = Object.values(stats).map((v: any) => ({ ...v, avg: v.graded ? Math.round((v.scoreSum / v.graded) * 10) / 10 : null }));
  const teachers = me.role === "admin"
    ? (await q(sb.from("paslab_teachers").select("*"))).map((t: any) => ({
        username: t.username, password: t.password, name: t.name, role: t.role, active: yn(t.active),
      }))
    : [];
  return {
    ok: true, classes: books, lessons, submissions: (subs as any[]).map(subOut), stats: statList,
    rooms: (rooms as any[]).map(roomOut), students: (studs as any[]).map(stuOut),
    assignments: (asns as any[]).map(asnOut), me, teachers,
  };
}

// ---------- 寫入（老師） ----------
const saveBook = (d: any) =>
  q(sb.from("paslab_books").upsert({ id: d.classId, title: d.bookTitle || d.classId, sort: Number(d.order || 99), active: toBool(d.active) }).select())
    .then(() => ({ ok: true }));
const deleteBook = (d: any) =>
  q(sb.from("paslab_books").delete().eq("id", d.classId).select()).then(() => ({ ok: true }));
const saveLesson = (d: any) =>
  q(sb.from("paslab_lessons").upsert({
    book_id: d.classId, lesson_id: d.lessonId, label: d.lessonLabel || d.lessonId,
    body: d.text || "", audio_url: d.audioUrl || "", sort: Number(d.order || 99), active: toBool(d.active),
    shadow_mode: String(d.shadowMode) === "yes", marks: d.marks || "", gap_multiplier: String(d.gapMultiplier || ""),
  }).select()).then(() => ({ ok: true }));
const deleteLesson = (d: any) =>
  q(sb.from("paslab_lessons").delete().eq("book_id", d.classId).eq("lesson_id", d.lessonId).select()).then(() => ({ ok: true }));
const saveRoom = (d: any) => {
  const id = d.roomId || newId("r");
  return q(sb.from("paslab_rooms").upsert({ id, name: d.roomName || id, code: String(d.code || "").trim(), active: toBool(d.active), sort: Number(d.order || 99) }).select())
    .then(() => ({ ok: true }));
};
const deleteRoom = (d: any) =>
  q(sb.from("paslab_rooms").delete().eq("id", d.roomId).select()).then(() => ({ ok: true }));
const saveStudent = (d: any) => {
  const id = d.studentId || newId("s");
  return q(sb.from("paslab_students").upsert({ id, room_id: d.roomId || "", name: d.name || "", pin: String(d.pin || "").trim(), active: toBool(d.active), sort: Number(d.order || 99) }).select())
    .then(() => ({ ok: true }));
};
const deleteStudent = (d: any) =>
  q(sb.from("paslab_students").delete().eq("id", d.studentId).select()).then(() => ({ ok: true }));
async function saveStudentsBulk(d: any) {
  const names = (d.names || []).map((n: unknown) => String(n).trim()).filter(Boolean);
  if (!names.length) return { ok: true, created: 0 };
  const rows = names.map((name: string, i: number) => ({ id: newId("s") + "_" + i, room_id: d.roomId || "", name, pin: "", active: true, sort: i + 1 }));
  await q(sb.from("paslab_students").insert(rows).select());
  return { ok: true, created: rows.length };
}
const saveAssignment = (d: any) => {
  const id = d.assignId || newId("a");
  return q(sb.from("paslab_assignments").upsert({ id, room_id: d.roomId || "", book_id: d.classId || "", lesson_id: d.lessonId || "", due_date: d.dueDate || "", active: toBool(d.active), sort: Number(d.order || 99), note: d.note || "" }).select())
    .then(() => ({ ok: true }));
};
const deleteAssignment = (d: any) =>
  q(sb.from("paslab_assignments").delete().eq("id", d.assignId).select()).then(() => ({ ok: true }));
async function grade(d: any) {
  const patch: any = { status: d.status || "reviewed" };
  if (d.score !== undefined) patch.score = String(d.score ?? "");
  if (d.comment !== undefined) patch.comment = String(d.comment ?? "");
  await q(sb.from("paslab_submissions").update(patch).eq("id", Number(d.row)).select());
  return { ok: true };
}
async function deleteSubmission(d: any) {
  const rows = await q(sb.from("paslab_submissions").select("*").eq("id", Number(d.row)));
  const s = rows?.[0];
  if (s?.file_path && d.deleteFile) await sb.storage.from("paslab-rec").remove([s.file_path]);
  await q(sb.from("paslab_submissions").delete().eq("id", Number(d.row)).select());
  return { ok: true };
}
async function setPassword(d: any) {
  const next = String(d.newPassword || "").trim();
  if (!next) return { ok: false, error: "密碼不可為空" };
  await q(sb.from("paslab_config").upsert({ key: "adminPassword", value: next }).select());
  return { ok: true };
}
const saveTeacher = (d: any) => {
  const u = String(d.username2 || "").trim();
  if (!u) return Promise.resolve({ ok: false, error: "請填帳號" });
  return q(sb.from("paslab_teachers").upsert({ username: u, password: String(d.password2 || ""), name: d.name || u, role: d.role || "teacher", active: toBool(d.active) }).select())
    .then(() => ({ ok: true }));
};
const deleteTeacher = (d: any) =>
  q(sb.from("paslab_teachers").delete().eq("username", String(d.username2 || "")).select()).then(() => ({ ok: true }));

// ---------- 路由 ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let d: any = {};
  try {
    if (req.method === "POST") d = JSON.parse(await req.text());
    else d = Object.fromEntries(new URL(req.url).searchParams);
  } catch { d = {}; }
  const action = d.action || "ping";
  const AUTH_ERR = { ok: false, error: "auth", message: "帳號或密碼錯誤" };
  const PERM_ERR = { ok: false, error: "perm", message: "只有主帳號可以管理老師帳號" };
  try {
    switch (action) {
      case "ping": return json({ ok: true, service: "PAS English Lab (supabase)" });
      case "classes": return json({ ok: true, classes: await getBooks(true) });
      case "lessons": return json({ ok: true, lessons: await getLessons(d.classId, true) });
      case "lessonAudio": return json({ ok: false, error: "legacy" });
      case "submit": return json(await submit(d));
      case "roomByCode": return json(await roomByCode(d));
      case "studentLogin": return json(await studentLogin(d));
      case "myAssignments": return json(await myAssignments(d));
      case "whoami": {
        const a = await authInfo(d);
        return json(a ? { ok: true, ...a } : { ok: false, error: "auth" });
      }
    }
    // 以下需要登入
    const me = await authInfo(d);
    if (!me) return json(AUTH_ERR);
    const isAdmin = me.role === "admin";
    switch (action) {
      case "adminData": return json(await adminData(d));
      case "uploadAudio": return json(await uploadAudio(d));
      case "getAudio": return json(await getAudio(d));
      case "saveClass": return json(await saveBook(d));
      case "deleteClass": return json(await deleteBook(d));
      case "saveLesson": return json(await saveLesson(d));
      case "deleteLesson": return json(await deleteLesson(d));
      case "saveRoom": return json(await saveRoom(d));
      case "deleteRoom": return json(await deleteRoom(d));
      case "saveStudent": return json(await saveStudent(d));
      case "saveStudentsBulk": return json(await saveStudentsBulk(d));
      case "deleteStudent": return json(await deleteStudent(d));
      case "saveAssignment": return json(await saveAssignment(d));
      case "deleteAssignment": return json(await deleteAssignment(d));
      case "grade": return json(await grade(d));
      case "deleteSubmission": return json(await deleteSubmission(d));
      case "setPassword": return json(isAdmin ? await setPassword(d) : PERM_ERR);
      case "saveTeacher": return json(isAdmin ? await saveTeacher(d) : PERM_ERR);
      case "deleteTeacher": return json(isAdmin ? await deleteTeacher(d) : PERM_ERR);
      default: return json({ ok: false, error: "unknown action: " + action });
    }
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) });
  }
});
