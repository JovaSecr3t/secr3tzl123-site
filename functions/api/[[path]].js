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

async function signToken(email, secret) {
  const header = toBase64Url(
    encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  );
  const payload = toBase64Url(
    encoder.encode(
      JSON.stringify({
        email,
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
    if (!payload.email || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload.email;
  } catch {
    return null;
  }
}

async function getAuthEmail(request, secret) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  return verifyToken(auth.slice(7).trim(), secret);
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
        const email = await getAuthEmail(request, secret);
        return jsonRes({ email });
      }

      if (segments[1] === "register" && method === "POST") {
        const body = await request.json().catch(() => ({}));
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");
        if (!email || !email.includes("@")) {
          return jsonRes({ error: "请输入有效的邮箱地址" }, 400);
        }
        if (password.length < 6) {
          return jsonRes({ error: "密码长度至少需要 6 位" }, 400);
        }

        const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
          .bind(email)
          .first();
        if (existing) {
          return jsonRes({ error: "该邮箱已注册，请直接登录" }, 409);
        }

        const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
        const passwordHash = await hashPassword(password, salt);
        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();

        await env.DB.prepare(
          "INSERT INTO users (id, email, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)"
        )
          .bind(id, email, passwordHash, salt, createdAt)
          .run();

        const token = await signToken(email, secret);
        return jsonRes({ email, token });
      }

      if (segments[1] === "login" && method === "POST") {
        const body = await request.json().catch(() => ({}));
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");

        const user = await env.DB.prepare(
          "SELECT email, password_hash, salt FROM users WHERE email = ?"
        )
          .bind(email)
          .first();

        if (!user) return jsonRes({ error: "邮箱或密码错误" }, 401);

        const computed = await hashPassword(password, user.salt);
        if (computed !== user.password_hash) {
          return jsonRes({ error: "邮箱或密码错误" }, 401);
        }

        const token = await signToken(user.email, secret);
        return jsonRes({ email: user.email, token });
      }
    }

    // 2. 博客接口：/api/posts & /api/posts/:id
    if (segments[0] === "posts") {
      const userEmail = await getAuthEmail(request, secret);

      if (!segments[1] && method === "GET") {
        const stmt = userEmail
          ? env.DB.prepare(
              "SELECT id, title, content, is_public, author_email, created_at FROM posts WHERE is_public = 1 OR author_email = ? ORDER BY created_at DESC"
            ).bind(userEmail)
          : env.DB.prepare(
              "SELECT id, title, content, is_public, author_email, created_at FROM posts WHERE is_public = 1 ORDER BY created_at DESC"
            );
        const { results } = await stmt.all();
        return jsonRes(results.map((r) => ({ ...r, is_public: Boolean(r.is_public) })));
      }

      if (!segments[1] && method === "POST") {
        if (!userEmail) return jsonRes({ error: "请先登录" }, 401);
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
          .bind(id, title, content, isPublicInt, userEmail, createdAt)
          .run();

        return jsonRes({
          id,
          title,
          content,
          is_public: Boolean(isPublicInt),
          author_email: userEmail,
          created_at: createdAt,
        });
      }

      if (segments[1] && method === "PATCH") {
        if (!userEmail) return jsonRes({ error: "请先登录" }, 401);
        const body = await request.json().catch(() => ({}));
        const isPublicInt = body.is_public ? 1 : 0;
        await env.DB.prepare(
          "UPDATE posts SET is_public = ? WHERE id = ? AND author_email = ?"
        )
          .bind(isPublicInt, segments[1], userEmail)
          .run();
        return jsonRes({ ok: true, is_public: Boolean(isPublicInt) });
      }

      if (segments[1] && method === "DELETE") {
        if (!userEmail) return jsonRes({ error: "请先登录" }, 401);
        await env.DB.prepare("DELETE FROM posts WHERE id = ? AND author_email = ?")
          .bind(segments[1], userEmail)
          .run();
        return jsonRes({ ok: true });
      }
    }

    // 3. 日常动态接口：/api/notes & /api/notes/:id
    if (segments[0] === "notes") {
      const userEmail = await getAuthEmail(request, secret);

      if (!segments[1] && method === "GET") {
        const stmt = userEmail
          ? env.DB.prepare(
              "SELECT id, content, mood, is_public, author_email, created_at FROM daily_notes WHERE is_public = 1 OR author_email = ? ORDER BY created_at DESC"
            ).bind(userEmail)
          : env.DB.prepare(
              "SELECT id, content, mood, is_public, author_email, created_at FROM daily_notes WHERE is_public = 1 ORDER BY created_at DESC"
            );
        const { results } = await stmt.all();
        return jsonRes(results.map((r) => ({ ...r, is_public: Boolean(r.is_public) })));
      }

      if (!segments[1] && method === "POST") {
        if (!userEmail) return jsonRes({ error: "请先登录" }, 401);
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
          .bind(id, content, mood, isPublicInt, userEmail, createdAt)
          .run();

        return jsonRes({
          id,
          content,
          mood,
          is_public: Boolean(isPublicInt),
          author_email: userEmail,
          created_at: createdAt,
        });
      }

      if (segments[1] && method === "PATCH") {
        if (!userEmail) return jsonRes({ error: "请先登录" }, 401);
        const body = await request.json().catch(() => ({}));
        const isPublicInt = body.is_public ? 1 : 0;
        await env.DB.prepare(
          "UPDATE daily_notes SET is_public = ? WHERE id = ? AND author_email = ?"
        )
          .bind(isPublicInt, segments[1], userEmail)
          .run();
        return jsonRes({ ok: true, is_public: Boolean(isPublicInt) });
      }

      if (segments[1] && method === "DELETE") {
        if (!userEmail) return jsonRes({ error: "请先登录" }, 401);
        await env.DB.prepare(
          "DELETE FROM daily_notes WHERE id = ? AND author_email = ?"
        )
          .bind(segments[1], userEmail)
          .run();
        return jsonRes({ ok: true });
      }
    }

    return jsonRes({ error: "API 路由不存在" }, 404);
  } catch (err) {
    return jsonRes({ error: err?.message || "服务器内部错误" }, 500);
  }
}