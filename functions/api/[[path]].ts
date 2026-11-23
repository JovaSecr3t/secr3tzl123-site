interface Env {
  DB?: D1Database;
  JWT_SECRET?: string;
}

type UserRole = "admin" | "user";
type UserStatus = "active" | "disabled" | "banned";
type FriendRelation =
  | "none"
  | "self"
  | "friends"
  | "outgoing_pending"
  | "incoming_pending";

interface UserRow {
  id: string;
  uid: number;
  personal_id: string;
  personal_id_changed: number;
  username: string;
  email: string | null;
  role: string;
  status: string;
  password_hash?: string;
  salt?: string;
  created_at?: string;
}

interface AuthUser {
  id: string;
  uid: number;
  personal_id: string;
  personal_id_changed: boolean;
  username: string;
  email: string | null;
  role: UserRole;
  status: UserStatus;
}

interface PostRow {
  id: string;
  title: string;
  content: string;
  is_public: number;
  author_id: string;
  author_uid: number | null;
  author_name: string;
  created_at: string;
  like_count: number;
  comment_count: number;
  liked_by_me: number;
}

interface CommentRow {
  id: string;
  post_id: string;
  parent_id: string | null;
  reply_to_name: string | null;
  user_id: string;
  content: string;
  created_at: string;
  author_uid: number | null;
  author_name: string;
  like_count: number;
  liked_by_me: number;
}

interface NoteRow {
  id: string;
  content: string;
  mood: string;
  is_public: number;
  author_id: string;
  author_uid: number | null;
  author_name: string;
  created_at: string;
}

interface FriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface JwtPayload {
  sub?: string;
  exp?: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function jsonRes(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): Uint8Array<ArrayBuffer> {
  const padded =
    str.replace(/-/g, "+").replace(/_/g, "/") +
    "==".slice(0, (4 - (str.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.json().catch(() => ({}));
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function normalizeRole(role?: string | null): UserRole {
  return role === "admin" ? "admin" : "user";
}

function normalizeStatus(status?: string | null): UserStatus {
  if (status === "disabled" || status === "banned") return status;
  return "active";
}

function validateUsername(username: string): string | null {
  if (!username || username.length < 2 || username.length > 20) {
    return "用户名长度需为 2~20 个字符";
  }
  if (/\s/.test(username)) return "用户名不能包含空格";
  return null;
}

function validatePassword(password: string): string | null {
  if (!password || password.length < 8) return "密码长度至少需要 8 位";
  if (!/[A-Z]/.test(password)) return "密码必须包含至少 1 个大写字母";
  if (!/\d/.test(password)) return "密码必须包含至少 1 个数字";
  return null;
}

async function hashPassword(password: string, saltHex: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password) as BufferSource,
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBytes(saltHex) as BufferSource, iterations: 60000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

async function signToken(userId: string, secret: string): Promise<string> {
  const header = toBase64Url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = toBase64Url(
    encoder.encode(
      JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 })
    )
  );
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data) as BufferSource);
  return `${data}.${toBase64Url(new Uint8Array(sig))}`;
}

async function verifyToken(token: string, secret: string): Promise<string | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const data = `${parts[0]}.${parts[1]}`;
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret) as BufferSource,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(parts[2]) as BufferSource,
      encoder.encode(data) as BufferSource
    );
    if (!valid) return null;
    const payload = JSON.parse(decoder.decode(fromBase64Url(parts[1]))) as JwtPayload;
    if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload.sub;
  } catch {
    return null;
  }
}

async function getCurrentUser(
  db: D1Database,
  request: Request,
  secret: string
): Promise<AuthUser | null> {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const userId = await verifyToken(auth.slice(7).trim(), secret);
  if (!userId) return null;

  const user = await db
    .prepare(
      "SELECT id, uid, personal_id, personal_id_changed, username, email, role, status FROM users WHERE id = ?"
    )
    .bind(userId)
    .first<UserRow>();
  if (!user) return null;

  return {
    id: user.id,
    uid: user.uid,
    personal_id: user.personal_id || user.id,
    personal_id_changed: Boolean(user.personal_id_changed),
    username: user.username,
    email: user.email || null,
    role: normalizeRole(user.role),
    status: normalizeStatus(user.status),
  };
}

function checkPermission(user: AuthUser | null, allowDisabled = false): Response | null {
  if (!user) return jsonRes({ error: "请先登录" }, 401);
  if (user.status === "banned") {
    return jsonRes({ error: "该账号已被封号，已强制退出登录", banned: true }, 403);
  }
  if (!allowDisabled && user.status === "disabled") {
    return jsonRes({ error: "您的账号已被管理员禁用，暂无法执行此操作" }, 403);
  }
  return null;
}

async function generateNextUserUid(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT MAX(uid) AS max_uid FROM users WHERE uid >= 10001")
    .first<{ max_uid: number | null }>();
  return Number(row?.max_uid || 10000) + 1;
}

function generatePersonalId(): string {
  return `u_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

async function getRelationBetween(
  db: D1Database,
  meId: string | null,
  targetId: string
): Promise<{ relation: FriendRelation; friendship_id: string | null }> {
  if (!meId) return { relation: "none", friendship_id: null };
  if (meId === targetId) return { relation: "self", friendship_id: null };

  const row = await db
    .prepare(
      "SELECT id, requester_id, addressee_id, status FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?) LIMIT 1"
    )
    .bind(meId, targetId, targetId, meId)
    .first<FriendshipRow>();

  if (!row) return { relation: "none", friendship_id: null };
  if (row.status === "accepted") {
    return { relation: "friends", friendship_id: row.id };
  }
  if (row.requester_id === meId) {
    return { relation: "outgoing_pending", friendship_id: row.id };
  }
  return { relation: "incoming_pending", friendship_id: row.id };
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const method = request.method.toUpperCase();
  const rawPath = params.path;
  const segments = Array.isArray(rawPath) ? rawPath : rawPath ? [rawPath] : [];
  const secret = env.JWT_SECRET || "secr3tzl-fallback-secret-change-in-cf";

  if (!env.DB) {
    return jsonRes({ error: "未在 Cloudflare Pages 中绑定 D1 数据库 (DB)" }, 500);
  }

  try {
    // 1. 账号认证：/api/auth/*
    if (segments[0] === "auth") {
      if (segments[1] === "me" && method === "GET") {
        const user = await getCurrentUser(env.DB, request, secret);
        if (user && user.status === "banned") {
          return jsonRes({ error: "您的账号已被管理员封号，已自动退出", banned: true }, 403);
        }
        return jsonRes(
          user || {
            id: null,
            uid: null,
            personal_id: null,
            personal_id_changed: false,
            username: null,
            email: null,
            role: "user",
            status: "active",
          }
        );
      }

      if (segments[1] === "register" && method === "POST") {
        const body = await readJsonBody(request);
        const username = String(body.username || "").trim();
        const email = String(body.email || "").trim().toLowerCase() || null;
        const password = String(body.password || "");

        const nameErr = validateUsername(username);
        if (nameErr) return jsonRes({ error: nameErr }, 400);
        if (username.toLowerCase() === "admin") {
          return jsonRes({ error: "admin 为系统后台保留账号，普通用户请使用其他用户名" }, 403);
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return jsonRes({ error: "邮箱格式不正确" }, 400);
        }
        const pwdErr = validatePassword(password);
        if (pwdErr) return jsonRes({ error: pwdErr }, 400);

        const existingName = await env.DB.prepare(
          "SELECT id FROM users WHERE LOWER(username) = LOWER(?)"
        )
          .bind(username)
          .first<{ id: string }>();
        if (existingName) return jsonRes({ error: "该用户名已被占用，请换一个" }, 409);

        if (email) {
          const existingEmail = await env.DB.prepare(
            "SELECT id FROM users WHERE LOWER(email) = LOWER(?)"
          )
            .bind(email)
            .first<{ id: string }>();
          if (existingEmail) return jsonRes({ error: "该邮箱已被注册" }, 409);
        }

        const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
        const passwordHash = await hashPassword(password, salt);
        const id = generatePersonalId();
        const uid = await generateNextUserUid(env.DB);
        const createdAt = new Date().toISOString();

        await env.DB.prepare(
          "INSERT INTO users (id, uid, personal_id, personal_id_changed, username, email, role, status, password_hash, salt, created_at) VALUES (?, ?, ?, 0, ?, ?, 'user', 'active', ?, ?, ?)"
        )
          .bind(id, uid, id, username, email, passwordHash, salt, createdAt)
          .run();

        const token = await signToken(id, secret);
        return jsonRes({
          id,
          uid,
          personal_id: id,
          personal_id_changed: false,
          username,
          email,
          role: "user",
          status: "active",
          token,
        });
      }

      if (segments[1] === "login" && method === "POST") {
        const body = await readJsonBody(request);
        const account = String(body.account || body.username || body.email || "").trim();
        const password = String(body.password || "");
        if (!account || !password) {
          return jsonRes({ error: "请输入 UID、个人 ID、用户名或邮箱，以及密码" }, 400);
        }

        const numericUid = /^\d+$/.test(account) ? Number(account) : -1;
        const user = await env.DB.prepare(
          "SELECT id, uid, personal_id, personal_id_changed, username, email, role, status, password_hash, salt FROM users WHERE uid = ? OR LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?) OR LOWER(personal_id) = LOWER(?)"
        )
          .bind(numericUid, account, account, account)
          .first<UserRow>();

        if (!user || !user.salt || !user.password_hash) {
          return jsonRes({ error: "账号不存在或密码错误" }, 401);
        }

        const computed = await hashPassword(password, user.salt);
        if (computed !== user.password_hash) {
          return jsonRes({ error: "账号不存在或密码错误" }, 401);
        }

        const status = normalizeStatus(user.status);
        if (status === "banned") {
          return jsonRes({ error: "该账号已被封号，无法登录，请联系管理员解禁" }, 403);
        }

        const token = await signToken(user.id, secret);
        return jsonRes({
          id: user.id,
          uid: user.uid,
          personal_id: user.personal_id || user.id,
          personal_id_changed: Boolean(user.personal_id_changed),
          username: user.username,
          email: user.email || null,
          role: normalizeRole(user.role),
          status,
          token,
        });
      }
    }

    // 2. 个人资料修改：/api/user/*
    if (segments[0] === "user") {
      const currentUser = await getCurrentUser(env.DB, request, secret);
      const errRes = checkPermission(currentUser);
      if (errRes || !currentUser) return errRes ?? jsonRes({ error: "请先登录" }, 401);

      if (segments[1] === "profile" && method === "PATCH") {
        if (currentUser.id === "admin_root" || currentUser.username.toLowerCase() === "admin") {
          return jsonRes({ error: "默认管理员 admin 用户名不可修改" }, 403);
        }
        const body = await readJsonBody(request);
        const username = String(body.username || "").trim();
        const nameErr = validateUsername(username);
        if (nameErr) return jsonRes({ error: nameErr }, 400);
        if (username.toLowerCase() === "admin") {
          return jsonRes({ error: "admin 为系统保留用户名" }, 403);
        }

        const conflict = await env.DB.prepare(
          "SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?"
        )
          .bind(username, currentUser.id)
          .first<{ id: string }>();
        if (conflict) return jsonRes({ error: "该用户名已被其他用户占用" }, 409);

        await env.DB.prepare("UPDATE users SET username = ? WHERE id = ?")
          .bind(username, currentUser.id)
          .run();
        return jsonRes({ ok: true, username });
      }

      if (segments[1] === "personal-id" && method === "PATCH") {
        if (currentUser.personal_id_changed) {
          return jsonRes({ error: "个人 ID 只能修改一次，您已使用过修改机会" }, 403);
        }
        const body = await readJsonBody(request);
        const nextId = String(body.personal_id || "").trim();
        if (!/^[a-zA-Z0-9_-]{3,24}$/.test(nextId)) {
          return jsonRes({ error: "个人 ID 需为 3~24 位字母、数字、下划线或短横线" }, 400);
        }

        const conflict = await env.DB.prepare(
          "SELECT id FROM users WHERE (LOWER(personal_id) = LOWER(?) OR LOWER(id) = LOWER(?)) AND id != ?"
        )
          .bind(nextId, nextId, currentUser.id)
          .first<{ id: string }>();
        if (conflict) return jsonRes({ error: "该个人 ID 已被占用，请更换" }, 409);

        await env.DB.prepare(
          "UPDATE users SET personal_id = ?, personal_id_changed = 1 WHERE id = ?"
        )
          .bind(nextId, currentUser.id)
          .run();
        return jsonRes({ ok: true, personal_id: nextId, personal_id_changed: true });
      }
    }

    // 3. 搜索用户与查看他人公开主页：/api/users/*
    if (segments[0] === "users") {
      const rawUser = await getCurrentUser(env.DB, request, secret);
      const currentUser = rawUser && rawUser.status !== "banned" ? rawUser : null;

      // 3.1 搜索用户（按 UID / 个人 ID / 用户名）
      if (segments[1] === "search" && method === "GET") {
        const url = new URL(request.url);
        const q = (url.searchParams.get("q") || "").trim();
        if (!q) return jsonRes([]);

        const cleanUid = q.replace(/^#/, "");
        const numericUid = /^\d+$/.test(cleanUid) ? Number(cleanUid) : -1;
        const likePattern = `%${q}%`;

        const { results } = await env.DB.prepare(
          "SELECT id, uid, personal_id, username, role, status, created_at FROM users WHERE status != 'banned' AND (uid = ? OR LOWER(personal_id) = LOWER(?) OR LOWER(username) LIKE LOWER(?)) ORDER BY uid ASC LIMIT 20"
        )
          .bind(numericUid, q, likePattern)
          .all<UserRow>();

        const enriched = await Promise.all(
          results.map(async (u) => {
            const rel = await getRelationBetween(env.DB!, currentUser?.id ?? null, u.id);
            return {
              id: u.id,
              uid: u.uid,
              personal_id: u.personal_id || u.id,
              username: u.username,
              role: normalizeRole(u.role),
              status: normalizeStatus(u.status),
              created_at: u.created_at || "",
              relation: rel.relation,
              friendship_id: rel.friendship_id,
            };
          })
        );
        return jsonRes(enriched);
      }

      // 3.2 查看他人个人主页（公开资料 + 公开帖子 + 公开日常 + 好友关系）
      if (segments[1] && !segments[2] && method === "GET") {
        const targetKey = decodeURIComponent(segments[1]).trim();
        const numericUid = /^\d+$/.test(targetKey) ? Number(targetKey) : -1;

        const targetUser = await env.DB.prepare(
          "SELECT id, uid, personal_id, username, role, status, created_at FROM users WHERE id = ? OR uid = ? OR LOWER(personal_id) = LOWER(?) LIMIT 1"
        )
          .bind(targetKey, numericUid, targetKey)
          .first<UserRow>();

        if (!targetUser) {
          return jsonRes({ error: "该用户不存在或已注销" }, 404);
        }

        const rel = await getRelationBetween(env.DB, currentUser?.id ?? null, targetUser.id);
        const viewerId = currentUser ? currentUser.id : "__guest__";

        const [postsRes, notesRes, friendCountRow] = await Promise.all([
          env.DB.prepare(
            "SELECT p.id, p.title, p.content, p.is_public, p.author_id, u.uid AS author_uid, COALESCE(u.username, '已注销用户') AS author_name, p.created_at, (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count, (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) AS comment_count, (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = ?) AS liked_by_me FROM posts p LEFT JOIN users u ON p.author_id = u.id WHERE p.author_id = ? AND p.is_public = 1 ORDER BY p.created_at DESC"
          )
            .bind(viewerId, targetUser.id)
            .all<PostRow>(),
          env.DB.prepare(
            "SELECT n.id, n.content, n.mood, n.is_public, n.author_id, u.uid AS author_uid, COALESCE(u.username, '已注销用户') AS author_name, n.created_at FROM daily_notes n LEFT JOIN users u ON n.author_id = u.id WHERE n.author_id = ? AND n.is_public = 1 ORDER BY n.created_at DESC"
          )
            .bind(targetUser.id)
            .all<NoteRow>(),
          env.DB.prepare(
            "SELECT COUNT(*) AS c FROM friendships WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)"
          )
            .bind(targetUser.id, targetUser.id)
            .first<{ c: number }>(),
        ]);

        return jsonRes({
          user: {
            id: targetUser.id,
            uid: targetUser.uid,
            personal_id: targetUser.personal_id || targetUser.id,
            username: targetUser.username,
            role: normalizeRole(targetUser.role),
            status: normalizeStatus(targetUser.status),
            created_at: targetUser.created_at || "",
            friend_count: Number(friendCountRow?.c || 0),
          },
          relation: rel.relation,
          friendship_id: rel.friendship_id,
          posts: postsRes.results.map((r) => ({
            ...r,
            is_public: true,
            like_count: Number(r.like_count || 0),
            comment_count: Number(r.comment_count || 0),
            liked_by_me: Boolean(r.liked_by_me),
            is_mine: Boolean(currentUser && r.author_id === currentUser.id),
          })),
          notes: notesRes.results.map((r) => ({
            ...r,
            is_public: true,
            is_mine: Boolean(currentUser && r.author_id === currentUser.id),
          })),
        });
      }
    }

    // 4. 好友系统：/api/friends/*
    if (segments[0] === "friends") {
      const currentUser = await getCurrentUser(env.DB, request, secret);
      const errRes = checkPermission(currentUser, method === "GET");
      if (errRes || !currentUser) return errRes ?? jsonRes({ error: "请先登录" }, 401);

      // 4.1 获取好友列表、收到的申请、发出的申请
      if (!segments[1] && method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT f.id AS friendship_id, f.requester_id, f.addressee_id, f.status, f.created_at AS req_time, u.id AS user_id, u.uid, u.personal_id, u.username, u.role, u.status AS user_status FROM friendships f JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END WHERE f.requester_id = ? OR f.addressee_id = ? ORDER BY f.updated_at DESC"
        )
          .bind(currentUser.id, currentUser.id, currentUser.id)
          .all<{
            friendship_id: string;
            requester_id: string;
            addressee_id: string;
            status: string;
            req_time: string;
            user_id: string;
            uid: number;
            personal_id: string;
            username: string;
            role: string;
            user_status: string;
          }>();

        const friends = [];
        const incoming = [];
        const outgoing = [];

        for (const r of results) {
          const item = {
            friendship_id: r.friendship_id,
            id: r.user_id,
            uid: r.uid,
            personal_id: r.personal_id || r.user_id,
            username: r.username,
            role: normalizeRole(r.role),
            status: normalizeStatus(r.user_status),
            created_at: r.req_time,
          };
          if (r.status === "accepted") {
            friends.push(item);
          } else if (r.addressee_id === currentUser.id) {
            incoming.push(item);
          } else {
            outgoing.push(item);
          }
        }

        return jsonRes({ friends, incoming, outgoing });
      }

      // 4.2 发送好友申请（支持 target_user_id 或 account）
      if (segments[1] === "request" && method === "POST") {
        const body = await readJsonBody(request);
        const rawTarget = String(body.target_user_id || body.account || "").trim();
        if (!rawTarget) return jsonRes({ error: "请输入对方 UID、个人 ID 或用户名" }, 400);

        const cleanUid = rawTarget.replace(/^#/, "");
        const numericUid = /^\d+$/.test(cleanUid) ? Number(cleanUid) : -1;

        const targetUser = await env.DB.prepare(
          "SELECT id, uid, personal_id, username, status FROM users WHERE id = ? OR uid = ? OR LOWER(personal_id) = LOWER(?) OR LOWER(username) = LOWER(?) LIMIT 1"
        )
          .bind(rawTarget, numericUid, rawTarget, rawTarget)
          .first<UserRow>();

        if (!targetUser) return jsonRes({ error: "未找到该用户" }, 404);
        if (targetUser.id === currentUser.id) {
          return jsonRes({ error: "不能添加自己为好友" }, 400);
        }
        if (normalizeStatus(targetUser.status) === "banned") {
          return jsonRes({ error: "对方账号已被封号，无法添加" }, 403);
        }

        const existing = await env.DB.prepare(
          "SELECT id, requester_id, addressee_id, status FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?) LIMIT 1"
        )
          .bind(currentUser.id, targetUser.id, targetUser.id, currentUser.id)
          .first<FriendshipRow>();

        const now = new Date().toISOString();

        if (existing) {
          if (existing.status === "accepted") {
            return jsonRes({ error: "你们已经是好友了" }, 409);
          }
          if (existing.requester_id === currentUser.id) {
            return jsonRes({ error: "已发送过好友申请，请等待对方确认" }, 409);
          }
          // 如果对方正好之前向我发过申请，直接互相同意成为好友
          await env.DB.prepare(
            "UPDATE friendships SET status = 'accepted', updated_at = ? WHERE id = ?"
          )
            .bind(now, existing.id)
            .run();
          return jsonRes({
            ok: true,
            relation: "friends",
            friendship_id: existing.id,
            message: `对方之前已向你发出申请，已自动成为好友`,
          });
        }

        const id = crypto.randomUUID();
        await env.DB.prepare(
          "INSERT INTO friendships (id, requester_id, addressee_id, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)"
        )
          .bind(id, currentUser.id, targetUser.id, now, now)
          .run();

        return jsonRes({
          ok: true,
          relation: "outgoing_pending",
          friendship_id: id,
          message: `已向 ${targetUser.username} (#${targetUser.uid}) 发送好友申请`,
        });
      }

      // 4.3 同意好友申请
      if (segments[1] && segments[2] === "accept" && method === "POST") {
        const friendshipId = segments[1];
        const row = await env.DB.prepare(
          "SELECT id, addressee_id, status FROM friendships WHERE id = ?"
        )
          .bind(friendshipId)
          .first<FriendshipRow>();
        if (!row) return jsonRes({ error: "好友申请不存在或已被取消" }, 404);
        if (row.addressee_id !== currentUser.id) {
          return jsonRes({ error: "无权处理该好友申请" }, 403);
        }
        await env.DB.prepare(
          "UPDATE friendships SET status = 'accepted', updated_at = ? WHERE id = ?"
        )
          .bind(new Date().toISOString(), friendshipId)
          .run();
        return jsonRes({ ok: true, relation: "friends" });
      }

      // 4.4 拒绝 / 取消申请 / 删除好友
      if (segments[1] && !segments[2] && method === "DELETE") {
        const friendshipId = segments[1];
        const row = await env.DB.prepare(
          "SELECT id, requester_id, addressee_id FROM friendships WHERE id = ?"
        )
          .bind(friendshipId)
          .first<FriendshipRow>();
        if (!row) return jsonRes({ error: "记录不存在" }, 404);
        if (row.requester_id !== currentUser.id && row.addressee_id !== currentUser.id) {
          return jsonRes({ error: "无权操作该好友关系" }, 403);
        }
        await env.DB.prepare("DELETE FROM friendships WHERE id = ?").bind(friendshipId).run();
        return jsonRes({ ok: true, relation: "none" });
      }
    }

    // 5. 管理员后台：/api/admin/*
    if (segments[0] === "admin") {
      if (segments[1] === "status" && method === "GET") {
        const existingAdmin = await env.DB.prepare(
          "SELECT id FROM users WHERE id = 'admin_root' OR LOWER(username) = 'admin' LIMIT 1"
        ).first<{ id: string }>();
        return jsonRes({ hasAdmin: Boolean(existingAdmin) });
      }

      if (segments[1] === "register" && method === "POST") {
        const existingAdmin = await env.DB.prepare(
          "SELECT id FROM users WHERE id = 'admin_root' OR LOWER(username) = 'admin' LIMIT 1"
        ).first<{ id: string }>();
        if (existingAdmin) {
          return jsonRes({ error: "管理员账号 admin 已存在，请直接登录" }, 409);
        }

        const body = await readJsonBody(request);
        const email = String(body.email || "").trim().toLowerCase() || null;
        const password = String(body.password || "");
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return jsonRes({ error: "邮箱格式不正确" }, 400);
        }
        const pwdErr = validatePassword(password);
        if (pwdErr) return jsonRes({ error: pwdErr }, 400);

        if (email) {
          const existingEmail = await env.DB.prepare(
            "SELECT id FROM users WHERE LOWER(email) = LOWER(?)"
          )
            .bind(email)
            .first<{ id: string }>();
          if (existingEmail) return jsonRes({ error: "该邮箱已被其他用户绑定" }, 409);
        }

        const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
        const passwordHash = await hashPassword(password, salt);
        const id = "admin_root";
        const uid = 10000;
        const createdAt = new Date().toISOString();

        await env.DB.prepare(
          "INSERT INTO users (id, uid, personal_id, personal_id_changed, username, email, role, status, password_hash, salt, created_at) VALUES (?, ?, ?, 0, 'admin', ?, 'admin', 'active', ?, ?, ?)"
        )
          .bind(id, uid, id, email, passwordHash, salt, createdAt)
          .run();

        const token = await signToken(id, secret);
        return jsonRes({
          id,
          uid,
          personal_id: id,
          personal_id_changed: false,
          username: "admin",
          email,
          role: "admin",
          status: "active",
          token,
        });
      }

      const currentUser = await getCurrentUser(env.DB, request, secret);
      const errRes = checkPermission(currentUser);
      if (errRes || !currentUser) return errRes ?? jsonRes({ error: "请先登录" }, 401);
      if (currentUser.role !== "admin") return jsonRes({ error: "无管理员权限" }, 403);

      if (segments[1] === "users" && !segments[2] && method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT id, uid, personal_id, username, email, role, status, created_at FROM users ORDER BY uid ASC"
        ).all<UserRow>();
        return jsonRes({
          total: results.length,
          users: results.map((u) => ({
            id: u.id,
            uid: u.uid,
            personal_id: u.personal_id || u.id,
            username: u.username,
            email: u.email || null,
            role: normalizeRole(u.role),
            status: normalizeStatus(u.status),
            created_at: u.created_at || "",
          })),
        });
      }

      if (segments[1] === "users" && segments[2] && segments[3] === "role" && method === "PATCH") {
        const targetId = segments[2];
        const body = await readJsonBody(request);
        const nextRole: UserRole = body.role === "admin" ? "admin" : "user";
        if (targetId === currentUser.id && nextRole !== "admin") {
          return jsonRes({ error: "不能取消自己的管理员权限" }, 400);
        }
        if (targetId === "admin_root" && nextRole !== "admin") {
          return jsonRes({ error: "系统默认管理员 admin 权限不可取消" }, 403);
        }
        await env.DB.prepare("UPDATE users SET role = ? WHERE id = ?")
          .bind(nextRole, targetId)
          .run();
        return jsonRes({ ok: true, role: nextRole });
      }

      if (
        segments[1] === "users" &&
        segments[2] &&
        segments[3] === "status" &&
        method === "PATCH"
      ) {
        const targetId = segments[2];
        const body = await readJsonBody(request);
        const rawStatus = String(body.status || "");
        if (rawStatus !== "active" && rawStatus !== "disabled" && rawStatus !== "banned") {
          return jsonRes({ error: "无效的账号状态" }, 400);
        }
        if (targetId === "admin_root") {
          return jsonRes({ error: "系统默认管理员 admin 受保护，无法禁用或封号" }, 403);
        }
        if (targetId === currentUser.id) {
          return jsonRes({ error: "不能对自己执行禁用或封号操作" }, 400);
        }
        await env.DB.prepare("UPDATE users SET status = ? WHERE id = ?")
          .bind(rawStatus, targetId)
          .run();
        return jsonRes({ ok: true, status: rawStatus });
      }
    }

    // 6. 社区帖子、点赞、楼中楼评论与评论点赞：/api/posts/*
    if (segments[0] === "posts") {
      const rawUser = await getCurrentUser(env.DB, request, secret);
      const currentUser = rawUser && rawUser.status !== "banned" ? rawUser : null;

      if (segments[1] && segments[2] === "like" && method === "POST") {
        const errRes = checkPermission(rawUser);
        if (errRes || !rawUser) return errRes ?? jsonRes({ error: "请先登录" }, 401);

        const postId = segments[1];
        const post = await env.DB.prepare(
          "SELECT id, is_public, author_id FROM posts WHERE id = ?"
        )
          .bind(postId)
          .first<{ id: string; is_public: number; author_id: string }>();
        if (!post) return jsonRes({ error: "帖子不存在" }, 404);
        if (!post.is_public && post.author_id !== rawUser.id) {
          return jsonRes({ error: "无权操作该帖子" }, 403);
        }

        const existed = await env.DB.prepare(
          "SELECT 1 AS ok FROM post_likes WHERE post_id = ? AND user_id = ?"
        )
          .bind(postId, rawUser.id)
          .first<{ ok: number }>();

        let liked = false;
        if (existed) {
          await env.DB.prepare("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?")
            .bind(postId, rawUser.id)
            .run();
        } else {
          await env.DB.prepare(
            "INSERT INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, ?)"
          )
            .bind(postId, rawUser.id, new Date().toISOString())
            .run();
          liked = true;
        }

        const cnt = await env.DB.prepare(
          "SELECT COUNT(*) AS c FROM post_likes WHERE post_id = ?"
        )
          .bind(postId)
          .first<{ c: number }>();
        return jsonRes({ liked, like_count: Number(cnt?.c || 0) });
      }

      if (
        segments[1] &&
        segments[2] === "comments" &&
        segments[3] &&
        segments[4] === "like" &&
        method === "POST"
      ) {
        const errRes = checkPermission(rawUser);
        if (errRes || !rawUser) return errRes ?? jsonRes({ error: "请先登录" }, 401);

        const postId = segments[1];
        const commentId = segments[3];
        const comment = await env.DB.prepare(
          "SELECT id FROM post_comments WHERE id = ? AND post_id = ?"
        )
          .bind(commentId, postId)
          .first<{ id: string }>();
        if (!comment) return jsonRes({ error: "评论不存在" }, 404);

        const existed = await env.DB.prepare(
          "SELECT 1 AS ok FROM comment_likes WHERE comment_id = ? AND user_id = ?"
        )
          .bind(commentId, rawUser.id)
          .first<{ ok: number }>();

        let liked = false;
        if (existed) {
          await env.DB.prepare("DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?")
            .bind(commentId, rawUser.id)
            .run();
        } else {
          await env.DB.prepare(
            "INSERT INTO comment_likes (comment_id, user_id, created_at) VALUES (?, ?, ?)"
          )
            .bind(commentId, rawUser.id, new Date().toISOString())
            .run();
          liked = true;
        }

        const cnt = await env.DB.prepare(
          "SELECT COUNT(*) AS c FROM comment_likes WHERE comment_id = ?"
        )
          .bind(commentId)
          .first<{ c: number }>();
        return jsonRes({ liked, like_count: Number(cnt?.c || 0) });
      }

      if (segments[1] && segments[2] === "comments" && !segments[3] && method === "GET") {
        const post = await env.DB.prepare(
          "SELECT id, is_public, author_id FROM posts WHERE id = ?"
        )
          .bind(segments[1])
          .first<{ id: string; is_public: number; author_id: string }>();
        if (!post) return jsonRes({ error: "帖子不存在" }, 404);
        if (!post.is_public && (!currentUser || post.author_id !== currentUser.id)) {
          return jsonRes({ error: "无权查看该帖子的评论" }, 403);
        }

        const viewerId = currentUser ? currentUser.id : "__guest__";
        const { results } = await env.DB.prepare(
          "SELECT c.id, c.post_id, c.parent_id, c.reply_to_name, c.user_id, c.content, c.created_at, u.uid AS author_uid, COALESCE(u.username, '已注销用户') AS author_name, (SELECT COUNT(*) FROM comment_likes cl WHERE cl.comment_id = c.id) AS like_count, (SELECT COUNT(*) FROM comment_likes cl WHERE cl.comment_id = c.id AND cl.user_id = ?) AS liked_by_me FROM post_comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.post_id = ? ORDER BY c.created_at ASC"
        )
          .bind(viewerId, segments[1])
          .all<CommentRow>();

        return jsonRes(
          results.map((r) => ({
            ...r,
            parent_id: r.parent_id || null,
            reply_to_name: r.reply_to_name || null,
            like_count: Number(r.like_count || 0),
            liked_by_me: Boolean(r.liked_by_me),
            is_mine: Boolean(currentUser && r.user_id === currentUser.id),
          }))
        );
      }

      if (segments[1] && segments[2] === "comments" && !segments[3] && method === "POST") {
        const errRes = checkPermission(rawUser);
        if (errRes || !rawUser) return errRes ?? jsonRes({ error: "请先登录" }, 401);

        const post = await env.DB.prepare(
          "SELECT id, is_public, author_id FROM posts WHERE id = ?"
        )
          .bind(segments[1])
          .first<{ id: string; is_public: number; author_id: string }>();
        if (!post) return jsonRes({ error: "帖子不存在" }, 404);
        if (!post.is_public && post.author_id !== rawUser.id) {
          return jsonRes({ error: "无权评论该帖子" }, 403);
        }

        const body = await readJsonBody(request);
        const content = String(body.content || "").trim();
        if (!content || content.length > 500) {
          return jsonRes({ error: "评论内容需为 1~500 字" }, 400);
        }

        let effectiveParentId: string | null = null;
        let replyToName: string | null = null;
        if (body.parent_id) {
          const parentRow = await env.DB.prepare(
            "SELECT id, parent_id FROM post_comments WHERE id = ? AND post_id = ?"
          )
            .bind(String(body.parent_id), segments[1])
            .first<{ id: string; parent_id: string | null }>();
          if (!parentRow) return jsonRes({ error: "要回复的评论不存在或已被删除" }, 404);
          effectiveParentId = parentRow.parent_id || parentRow.id;
          replyToName = String(body.reply_to_name || "").trim() || null;
        }

        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        await env.DB.prepare(
          "INSERT INTO post_comments (id, post_id, parent_id, reply_to_name, user_id, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
          .bind(id, segments[1], effectiveParentId, replyToName, rawUser.id, content, createdAt)
          .run();

        return jsonRes({
          id,
          post_id: segments[1],
          parent_id: effectiveParentId,
          reply_to_name: replyToName,
          user_id: rawUser.id,
          content,
          created_at: createdAt,
          author_uid: rawUser.uid,
          author_name: rawUser.username,
          like_count: 0,
          liked_by_me: false,
          is_mine: true,
        });
      }

      if (
        segments[1] &&
        segments[2] === "comments" &&
        segments[3] &&
        !segments[4] &&
        method === "DELETE"
      ) {
        const errRes = checkPermission(rawUser, true);
        if (errRes || !rawUser) return errRes ?? jsonRes({ error: "请先登录" }, 401);

        const postId = segments[1];
        const commentId = segments[3];
        const post = await env.DB.prepare("SELECT is_public FROM posts WHERE id = ?")
          .bind(postId)
          .first<{ is_public: number }>();
        const canAdminDelete =
          rawUser.role === "admin" && rawUser.status === "active" && Boolean(post?.is_public);

        const target = await env.DB.prepare(
          "SELECT id, user_id FROM post_comments WHERE id = ? AND post_id = ?"
        )
          .bind(commentId, postId)
          .first<{ id: string; user_id: string }>();
        if (!target) return jsonRes({ error: "评论不存在" }, 404);
        if (target.user_id !== rawUser.id && !canAdminDelete) {
          return jsonRes({ error: "无权删除该评论" }, 403);
        }

        await env.DB.prepare(
          "DELETE FROM comment_likes WHERE comment_id = ? OR comment_id IN (SELECT id FROM post_comments WHERE parent_id = ?)"
        )
          .bind(commentId, commentId)
          .run();
        await env.DB.prepare("DELETE FROM post_comments WHERE id = ? OR parent_id = ?")
          .bind(commentId, commentId)
          .run();

        const cnt = await env.DB.prepare(
          "SELECT COUNT(*) AS c FROM post_comments WHERE post_id = ?"
        )
          .bind(postId)
          .first<{ c: number }>();
        return jsonRes({ ok: true, comment_count: Number(cnt?.c || 0) });
      }

      if (!segments[1] && method === "GET") {
        const viewerId = currentUser ? currentUser.id : "__guest__";
        const stmt = currentUser
          ? env.DB.prepare(
              "SELECT p.id, p.title, p.content, p.is_public, p.author_id, u.uid AS author_uid, COALESCE(u.username, '已注销用户') AS author_name, p.created_at, (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count, (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) AS comment_count, (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = ?) AS liked_by_me FROM posts p LEFT JOIN users u ON p.author_id = u.id WHERE p.is_public = 1 OR p.author_id = ? ORDER BY p.created_at DESC"
            ).bind(viewerId, currentUser.id)
          : env.DB.prepare(
              "SELECT p.id, p.title, p.content, p.is_public, p.author_id, u.uid AS author_uid, COALESCE(u.username, '已注销用户') AS author_name, p.created_at, (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count, (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) AS comment_count, 0 AS liked_by_me FROM posts p LEFT JOIN users u ON p.author_id = u.id WHERE p.is_public = 1 ORDER BY p.created_at DESC"
            );

        const { results } = await stmt.all<PostRow>();
        return jsonRes(
          results.map((r) => ({
            ...r,
            is_public: Boolean(r.is_public),
            like_count: Number(r.like_count || 0),
            comment_count: Number(r.comment_count || 0),
            liked_by_me: Boolean(r.liked_by_me),
            is_mine: Boolean(currentUser && r.author_id === currentUser.id),
          }))
        );
      }

      if (!segments[1] && method === "POST") {
        const errRes = checkPermission(rawUser);
        if (errRes || !rawUser) return errRes ?? jsonRes({ error: "请先登录" }, 401);

        const body = await readJsonBody(request);
        const title = String(body.title || "").trim();
        const content = String(body.content || "").trim();
        if (!title || !content) return jsonRes({ error: "标题和正文不能为空" }, 400);

        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        const isPublicInt = body.is_public === false ? 0 : 1;

        await env.DB.prepare(
          "INSERT INTO posts (id, title, content, is_public, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
          .bind(id, title, content, isPublicInt, rawUser.id, createdAt)
          .run();

        return jsonRes({
          id,
          title,
          content,
          is_public: Boolean(isPublicInt),
          author_id: rawUser.id,
          author_uid: rawUser.uid,
          author_name: rawUser.username,
          like_count: 0,
          comment_count: 0,
          liked_by_me: false,
          is_mine: true,
          created_at: createdAt,
        });
      }

      if (segments[1] && !segments[2] && method === "PATCH") {
        const errRes = checkPermission(rawUser);
        if (errRes || !rawUser) return errRes ?? jsonRes({ error: "请先登录" }, 401);

        const body = await readJsonBody(request);
        const isPublicInt = body.is_public ? 1 : 0;
        await env.DB.prepare("UPDATE posts SET is_public = ? WHERE id = ? AND author_id = ?")
          .bind(isPublicInt, segments[1], rawUser.id)
          .run();
        return jsonRes({ ok: true, is_public: Boolean(isPublicInt) });
      }

      if (segments[1] && !segments[2] && method === "DELETE") {
        const errRes = checkPermission(rawUser, true);
        if (errRes || !rawUser) return errRes ?? jsonRes({ error: "请先登录" }, 401);

        const isActiveAdmin = rawUser.role === "admin" && rawUser.status === "active";
        const result = isActiveAdmin
          ? await env.DB.prepare(
              "DELETE FROM posts WHERE id = ? AND (is_public = 1 OR author_id = ?)"
            )
              .bind(segments[1], rawUser.id)
              .run()
          : await env.DB.prepare("DELETE FROM posts WHERE id = ? AND author_id = ?")
              .bind(segments[1], rawUser.id)
              .run();

        if (result.meta?.changes === 0) {
          return jsonRes({ error: "无权删除该内容或内容不存在" }, 403);
        }

        await env.DB.prepare(
          "DELETE FROM comment_likes WHERE comment_id IN (SELECT id FROM post_comments WHERE post_id = ?)"
        )
          .bind(segments[1])
          .run();
        await env.DB.prepare("DELETE FROM post_likes WHERE post_id = ?").bind(segments[1]).run();
        await env.DB.prepare("DELETE FROM post_comments WHERE post_id = ?").bind(segments[1]).run();
        return jsonRes({ ok: true });
      }
    }

    // 7. 日常动态：/api/notes/*
    if (segments[0] === "notes") {
      const rawUser = await getCurrentUser(env.DB, request, secret);
      const currentUser = rawUser && rawUser.status !== "banned" ? rawUser : null;

      if (!segments[1] && method === "GET") {
        const stmt = currentUser
          ? env.DB.prepare(
              "SELECT n.id, n.content, n.mood, n.is_public, n.author_id, u.uid AS author_uid, COALESCE(u.username, '已注销用户') AS author_name, n.created_at FROM daily_notes n LEFT JOIN users u ON n.author_id = u.id WHERE n.is_public = 1 OR n.author_id = ? ORDER BY n.created_at DESC"
            ).bind(currentUser.id)
          : env.DB.prepare(
              "SELECT n.id, n.content, n.mood, n.is_public, n.author_id, u.uid AS author_uid, COALESCE(u.username, '已注销用户') AS author_name, n.created_at FROM daily_notes n LEFT JOIN users u ON n.author_id = u.id WHERE n.is_public = 1 ORDER BY n.created_at DESC"
            );

        const { results } = await stmt.all<NoteRow>();
        return jsonRes(
          results.map((r) => ({
            ...r,
            is_public: Boolean(r.is_public),
            is_mine: Boolean(currentUser && r.author_id === currentUser.id),
          }))
        );
      }

      if (!segments[1] && method === "POST") {
        const errRes = checkPermission(rawUser);
        if (errRes || !rawUser) return errRes ?? jsonRes({ error: "请先登录" }, 401);

        const body = await readJsonBody(request);
        const content = String(body.content || "").trim();
        if (!content) return jsonRes({ error: "动态内容不能为空" }, 400);

        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        const mood = String(body.mood || "日常");
        const isPublicInt = body.is_public === false ? 0 : 1;

        await env.DB.prepare(
          "INSERT INTO daily_notes (id, content, mood, is_public, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
          .bind(id, content, mood, isPublicInt, rawUser.id, createdAt)
          .run();

        return jsonRes({
          id,
          content,
          mood,
          is_public: Boolean(isPublicInt),
          author_id: rawUser.id,
          author_uid: rawUser.uid,
          author_name: rawUser.username,
          is_mine: true,
          created_at: createdAt,
        });
      }

      if (segments[1] && method === "PATCH") {
        const errRes = checkPermission(rawUser);
        if (errRes || !rawUser) return errRes ?? jsonRes({ error: "请先登录" }, 401);

        const body = await readJsonBody(request);
        const isPublicInt = body.is_public ? 1 : 0;
        await env.DB.prepare("UPDATE daily_notes SET is_public = ? WHERE id = ? AND author_id = ?")
          .bind(isPublicInt, segments[1], rawUser.id)
          .run();
        return jsonRes({ ok: true, is_public: Boolean(isPublicInt) });
      }

      if (segments[1] && method === "DELETE") {
        const errRes = checkPermission(rawUser, true);
        if (errRes || !rawUser) return errRes ?? jsonRes({ error: "请先登录" }, 401);

        const isActiveAdmin = rawUser.role === "admin" && rawUser.status === "active";
        const result = isActiveAdmin
          ? await env.DB.prepare(
              "DELETE FROM daily_notes WHERE id = ? AND (is_public = 1 OR author_id = ?)"
            )
              .bind(segments[1], rawUser.id)
              .run()
          : await env.DB.prepare("DELETE FROM daily_notes WHERE id = ? AND author_id = ?")
              .bind(segments[1], rawUser.id)
              .run();

        if (result.meta?.changes === 0) {
          return jsonRes({ error: "无权删除该动态或动态不存在" }, 403);
        }
        return jsonRes({ ok: true });
      }
    }

    return jsonRes({ error: "API 路由不存在" }, 404);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "服务器内部错误";
    return jsonRes({ error: message }, 500);
  }
};