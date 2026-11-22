const encoder = new TextEncoder();
const decoder = new TextDecoder();

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function toBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str) {
  const padded =
    str.replace(/-/g, "+").replace(/_/g, "/") +
    "==".slice(0, (4 - (str.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function validateUsername(username) {
  if (!username || username.length < 2 || username.length > 20) {
    return "用户名长度需为 2~20 个字符";
  }
  if (/\s/.test(username)) {
    return "用户名不能包含空格";
  }
  return null;
}

function validatePassword(password) {
  if (!password || password.length < 8) {
    return "密码长度至少需要 8 位";
  }
  if (!/[A-Z]/.test(password)) {
    return "密码必须包含至少 1 个大写字母";
  }
  if (!/\d/.test(password)) {
    return "密码必须包含至少 1 个数字";
  }
  return null;
}

async function hashPassword(password, saltHex) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: hexToBytes(saltHex),
      iterations: 60000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

async function signToken(userId, secret) {
  const header = toBase64Url(
    encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  );
  const payload = toBase64Url(
    encoder.encode(
      JSON.stringify({
        uid: userId,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
      })
    )
  );
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return `${data}.${toBase64Url(new Uint8Array(sig))}`;
}

async function verifyToken(token, secret) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const data = `${parts[0]}.${parts[1]}`;
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(parts[2]),
      encoder.encode(data)
    );
    if (!valid) return null;
    const payload = JSON.parse(decoder.decode(fromBase64Url(parts[1])));
    const subject = payload.uid || payload.email;
    if (!subject || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return subject;
  } catch {
    return null;
  }
}

async function getCurrentUser(db, request, secret) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const subject = await verifyToken(auth.slice(7).trim(), secret);
  if (!subject) return null;
  const user = await db
    .prepare("SELECT id, username, email, role FROM users WHERE id = ? OR email = ?")
    .bind(subject, subject)
    .first();
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    email: user.email || null,
    role: user.role || "user",
  };
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const method = request.method.toUpperCase();
  const segments = Array.isArray(params.path)
    ? params.path
    : params.path
    ? [params.path]
    : [];
  const secret = env.JWT_SECRET || "secr3tzl-fallback-secret-change-in-cf";

  if (!env.DB) {
    return jsonRes({ error: "未在 Cloudflare Pages 中绑定 D1 数据库 (DB)" }, 500);
  }

  try {
    // 1. 账号接口：/api/auth/*
    if (segments[0] === "auth") {
      if (segments[1] === "me" && method === "GET") {
        const currentUser = await getCurrentUser(env.DB, request, secret);
        return jsonRes(
          currentUser || { id: null, username: null, email: null, role: "user" }
        );
      }

      if (segments[1] === "register" && method === "POST") {
        const body = await request.json().catch(() => ({}));
        const username = String(body.username || "").trim();
        const emailRaw = String(body.email || "").trim().toLowerCase();
        const email = emailRaw || null;
        const password = String(body.password || "");

        const nameErr = validateUsername(username);
        if (nameErr) return jsonRes({ error: nameErr }, 400);

        if (username.toLowerCase() === "admin") {
          const hasAdmin = await env.DB.prepare(
            "SELECT id FROM users WHERE LOWER(username) = 'admin'"
          ).first();
          return jsonRes(
            {
              error: hasAdmin
                ? "该用户名已被占用"
                : "请前往 /admin 后台页面初始化注册管理员账号 admin",
            },
            hasAdmin ? 409 : 403
          );
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
          .first();
        if (existingName) {
          return jsonRes({ error: "该用户名已被占用，请更换其他用户名" }, 409);
        }

        if (email) {
          const existingEmail = await env.DB.prepare(
            "SELECT id FROM users WHERE LOWER(email) = LOWER(?)"
          )
            .bind(email)
            .first();
          if (existingEmail) {
            return jsonRes({ error: "该邮箱已被注册" }, 409);
          }
        }

        const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
        const passwordHash = await hashPassword(password, salt);
        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();

        await env.DB.prepare(
          "INSERT INTO users (id, username, email, role, password_hash, salt, created_at) VALUES (?, ?, ?, 'user', ?, ?, ?)"
        )
          .bind(id, username, email, passwordHash, salt, createdAt)
          .run();

        const token = await signToken(id, secret);
        return jsonRes({ id, username, email, role: "user", token });
      }

      if (segments[1] === "login" && method === "POST") {
        const body = await request.json().catch(() => ({}));
        const account = String(
          body.account || body.username || body.email || ""
        ).trim();
        const password = String(body.password || "");

        if (!account || !password) {
          return jsonRes({ error: "请输入用户名（或邮箱）和密码" }, 400);
        }

        const user = await env.DB.prepare(
          "SELECT id, username, email, role, password_hash, salt FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)"
        )
          .bind(account, account)
          .first();

        if (!user) return jsonRes({ error: "用户名/邮箱或密码错误" }, 401);

        const computed = await hashPassword(password, user.salt);
        if (computed !== user.password_hash) {
          return jsonRes({ error: "用户名/邮箱或密码错误" }, 401);
        }

        const token = await signToken(user.id, secret);
        return jsonRes({
          id: user.id,
          username: user.username,
          email: user.email || null,
          role: user.role || "user",
          token,
        });
      }
    }

    // 2. 用户资料接口：修改用户名（防重名 + 保护 admin）
    if (segments[0] === "user" && segments[1] === "profile" && method === "PATCH") {
      const currentUser = await getCurrentUser(env.DB, request, secret);
      if (!currentUser) return jsonRes({ error: "请先登录" }, 401);
      if (currentUser.id === "root-admin" || currentUser.username.toLowerCase() === "admin") {
        return jsonRes({ error: "默认管理员 admin 的用户名不可修改" }, 403);
      }

      const body = await request.json().catch(() => ({}));
      const username = String(body.username || "").trim();
      const nameErr = validateUsername(username);
      if (nameErr) return jsonRes({ error: nameErr }, 400);

      if (username.toLowerCase() === "admin") {
        return jsonRes({ error: "admin 为系统保留管理员用户名" }, 403);
      }

      const conflict = await env.DB.prepare(
        "SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?"
      )
        .bind(username, currentUser.id)
        .first();
      if (conflict) {
        return jsonRes({ error: "该用户名已被其他用户占用" }, 409);
      }

      await env.DB.prepare("UPDATE users SET username = ? WHERE id = ?")
        .bind(username, currentUser.id)
        .run();
      return jsonRes({ ok: true, username });
    }

    // 3. 管理员后台接口：/api/admin/*
    if (segments[0] === "admin") {
      // 3.1 检查是否已注册过 admin（供 /admin 页面判断是否显示注册表单）
      if (segments[1] === "status" && method === "GET") {
        const existingAdmin = await env.DB.prepare(
          "SELECT id FROM users WHERE LOWER(username) = 'admin' LIMIT 1"
        ).first();
        return jsonRes({ hasAdmin: Boolean(existingAdmin) });
      }

      // 3.2 在 /admin 后台注册默认管理员 admin（仅当 admin 不存在时允许注册一次）
      if (segments[1] === "register" && method === "POST") {
        const existingAdmin = await env.DB.prepare(
          "SELECT id FROM users WHERE LOWER(username) = 'admin' LIMIT 1"
        ).first();
        if (existingAdmin) {
          return jsonRes({ error: "管理员账号 admin 已注册，请直接登录" }, 409);
        }

        const body = await request.json().catch(() => ({}));
        const emailRaw = String(body.email || "").trim().toLowerCase();
        const email = emailRaw || null;
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
            .first();
          if (existingEmail) {
            return jsonRes({ error: "该邮箱已被注册" }, 409);
          }
        }

        const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
        const passwordHash = await hashPassword(password, salt);
        const id = "root-admin";
        const createdAt = new Date().toISOString();

        await env.DB.prepare(
          "INSERT INTO users (id, username, email, role, password_hash, salt, created_at) VALUES (?, 'admin', ?, 'admin', ?, ?, ?)"
        )
          .bind(id, email, passwordHash, salt, createdAt)
          .run();

        const token = await signToken(id, secret);
        return jsonRes({ id, username: "admin", email, role: "admin", token });
      }

      // 以下管理接口必须校验管理员身份
      const currentUser = await getCurrentUser(env.DB, request, secret);
      if (!currentUser || currentUser.role !== "admin") {
        return jsonRes({ error: "无管理员权限" }, 403);
      }

      if (segments[1] === "users" && !segments[2] && method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC"
        ).all();
        return jsonRes({
          total: results.length,
          users: results.map((u) => ({
            ...u,
            username: u.username || (u.email ? u.email.split("@")[0] : "未命名"),
            role: u.role || "user",
          })),
        });
      }

      if (
        segments[1] === "users" &&
        segments[2] &&
        segments[3] === "role" &&
        method === "PATCH"
      ) {
        const targetId = segments[2];
        const body = await request.json().catch(() => ({}));
        const nextRole = body.role === "admin" ? "admin" : "user";
        if (targetId === currentUser.id && nextRole !== "admin") {
          return jsonRes({ error: "不能取消自己的管理员权限" }, 400);
        }
        if (targetId === "root-admin" && nextRole !== "admin") {
          return jsonRes({ error: "默认管理员 admin 权限不可取消" }, 403);
        }
        await env.DB.prepare("UPDATE users SET role = ? WHERE id = ?")
          .bind(nextRole, targetId)
          .run();
        return jsonRes({ ok: true, role: nextRole });
      }
    }

    // 4. 博客接口：/api/posts & /api/posts/:id
    if (segments[0] === "posts") {
      const currentUser = await getCurrentUser(env.DB, request, secret);

      if (!segments[1] && method === "GET") {
        const stmt = currentUser
          ? env.DB.prepare(
              "SELECT p.id, p.title, p.content, p.is_public, p.author_email, COALESCE(u.username, p.author_email) AS author_name, p.created_at FROM posts p LEFT JOIN users u ON (p.author_email = u.id OR p.author_email = u.email) WHERE p.is_public = 1 OR p.author_email = ? OR p.author_email = ? ORDER BY p.created_at DESC"
            ).bind(currentUser.id, currentUser.email || "__no_email__")
          : env.DB.prepare(
              "SELECT p.id, p.title, p.content, p.is_public, p.author_email, COALESCE(u.username, p.author_email) AS author_name, p.created_at FROM posts p LEFT JOIN users u ON (p.author_email = u.id OR p.author_email = u.email) WHERE p.is_public = 1 ORDER BY p.created_at DESC"
            );
        const { results } = await stmt.all();
        return jsonRes(
          results.map((r) => ({
            ...r,
            is_public: Boolean(r.is_public),
            is_mine: Boolean(
              currentUser &&
                (r.author_email === currentUser.id ||
                  (currentUser.email && r.author_email === currentUser.email))
            ),
          }))
        );
      }

      if (!segments[1] && method === "POST") {
        if (!currentUser) return jsonRes({ error: "请先登录" }, 401);
        const body = await request.json().catch(() => ({}));
        const title = String(body.title || "").trim();
        const content = String(body.content || "").trim();
        if (!title || !content) {
          return jsonRes({ error: "标题和正文不能为空" }, 400);
        }

        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        const isPublicInt = body.is_public === false ? 0 : 1;

        await env.DB.prepare(
          "INSERT INTO posts (id, title, content, is_public, author_email, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
          .bind(id, title, content, isPublicInt, currentUser.id, createdAt)
          .run();

        return jsonRes({
          id,
          title,
          content,
          is_public: Boolean(isPublicInt),
          author_email: currentUser.id,
          author_name: currentUser.username,
          is_mine: true,
          created_at: createdAt,
        });
      }

      if (segments[1] && method === "PATCH") {
        if (!currentUser) return jsonRes({ error: "请先登录" }, 401);
        const body = await request.json().catch(() => ({}));
        const isPublicInt = body.is_public ? 1 : 0;
        await env.DB.prepare(
          "UPDATE posts SET is_public = ? WHERE id = ? AND (author_email = ? OR author_email = ?)"
        )
          .bind(
            isPublicInt,
            segments[1],
            currentUser.id,
            currentUser.email || "__no_email__"
          )
          .run();
        return jsonRes({ ok: true, is_public: Boolean(isPublicInt) });
      }

      if (segments[1] && method === "DELETE") {
        if (!currentUser) return jsonRes({ error: "请先登录" }, 401);
        if (currentUser.role === "admin") {
          await env.DB.prepare("DELETE FROM posts WHERE id = ?")
            .bind(segments[1])
            .run();
        } else {
          await env.DB.prepare(
            "DELETE FROM posts WHERE id = ? AND (author_email = ? OR author_email = ?)"
          )
            .bind(segments[1], currentUser.id, currentUser.email || "__no_email__")
            .run();
        }
        return jsonRes({ ok: true });
      }
    }

    // 5. 日常动态接口：/api/notes & /api/notes/:id
    if (segments[0] === "notes") {
      const currentUser = await getCurrentUser(env.DB, request, secret);

      if (!segments[1] && method === "GET") {
        const stmt = currentUser
          ? env.DB.prepare(
              "SELECT n.id, n.content, n.mood, n.is_public, n.author_email, COALESCE(u.username, n.author_email) AS author_name, n.created_at FROM daily_notes n LEFT JOIN users u ON (n.author_email = u.id OR n.author_email = u.email) WHERE n.is_public = 1 OR n.author_email = ? OR n.author_email = ? ORDER BY n.created_at DESC"
            ).bind(currentUser.id, currentUser.email || "__no_email__")
          : env.DB.prepare(
              "SELECT n.id, n.content, n.mood, n.is_public, n.author_email, COALESCE(u.username, n.author_email) AS author_name, n.created_at FROM daily_notes n LEFT JOIN users u ON (n.author_email = u.id OR n.author_email = u.email) WHERE n.is_public = 1 ORDER BY n.created_at DESC"
            );
        const { results } = await stmt.all();
        return jsonRes(
          results.map((r) => ({
            ...r,
            is_public: Boolean(r.is_public),
            is_mine: Boolean(
              currentUser &&
                (r.author_email === currentUser.id ||
                  (currentUser.email && r.author_email === currentUser.email))
            ),
          }))
        );
      }

      if (!segments[1] && method === "POST") {
        if (!currentUser) return jsonRes({ error: "请先登录" }, 401);
        const body = await request.json().catch(() => ({}));
        const content = String(body.content || "").trim();
        if (!content) return jsonRes({ error: "动态内容不能为空" }, 400);

        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        const mood = String(body.mood || "日常");
        const isPublicInt = body.is_public === false ? 0 : 1;

        await env.DB.prepare(
          "INSERT INTO daily_notes (id, content, mood, is_public, author_email, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
          .bind(id, content, mood, isPublicInt, currentUser.id, createdAt)
          .run();

        return jsonRes({
          id,
          content,
          mood,
          is_public: Boolean(isPublicInt),
          author_email: currentUser.id,
          author_name: currentUser.username,
          is_mine: true,
          created_at: createdAt,
        });
      }

      if (segments[1] && method === "PATCH") {
        if (!currentUser) return jsonRes({ error: "请先登录" }, 401);
        const body = await request.json().catch(() => ({}));
        const isPublicInt = body.is_public ? 1 : 0;
        await env.DB.prepare(
          "UPDATE daily_notes SET is_public = ? WHERE id = ? AND (author_email = ? OR author_email = ?)"
        )
          .bind(
            isPublicInt,
            segments[1],
            currentUser.id,
            currentUser.email || "__no_email__"
          )
          .run();
        return jsonRes({ ok: true, is_public: Boolean(isPublicInt) });
      }

      if (segments[1] && method === "DELETE") {
        if (!currentUser) return jsonRes({ error: "请先登录" }, 401);
        if (currentUser.role === "admin") {
          await env.DB.prepare("DELETE FROM daily_notes WHERE id = ?")
            .bind(segments[1])
            .run();
        } else {
          await env.DB.prepare(
            "DELETE FROM daily_notes WHERE id = ? AND (author_email = ? OR author_email = ?)"
          )
            .bind(segments[1], currentUser.id, currentUser.email || "__no_email__")
            .run();
        }
        return jsonRes({ ok: true });
      }
    }

    return jsonRes({ error: "API 路由不存在" }, 404);
  } catch (err) {
    return jsonRes({ error: err?.message || "服务器内部错误" }, 500);
  }
}