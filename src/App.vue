<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";

const MOODS = ["日常", "记录", "碎碎念", "推荐"];
const TOKEN_KEY = "secr3tzl_d1_token";

const activeTab = ref("home");
const theme = ref("dark");
const clockText = ref("--:--:--");
const toastMsg = ref("");

// 账号状态
const userEmail = ref(null);
const showAuthModal = ref(false);
const authMode = ref("login");
const emailInput = ref("");
const passwordInput = ref("");
const authMsg = ref("");
const authBusy = ref(false);

// 数据状态
const posts = ref([]);
const notes = ref([]);
const loadingData = ref(true);

// 日常发布
const noteContent = ref("");
const mood = ref("日常");
const noteIsPublic = ref(true);
const publishingNote = ref(false);

// 独立上传博客弹窗
const showUploadBlogModal = ref(false);
const postTitle = ref("");
const postContent = ref("");
const postIsPublic = ref(true);
const publishingPost = ref(false);
const readingPost = ref(null);

// 计算分区列表
const publicPosts = computed(() => posts.value.filter((p) => p.is_public));
const privatePosts = computed(() =>
  posts.value.filter(
    (p) => !p.is_public && userEmail.value && p.author_email === userEmail.value
  )
);
const publicNotes = computed(() => notes.value.filter((n) => n.is_public));
const privateNotes = computed(() =>
  notes.value.filter(
    (n) => !n.is_public && userEmail.value && n.author_email === userEmail.value
  )
);

function showNotice(msg) {
  toastMsg.value = msg;
  window.setTimeout(() => {
    if (toastMsg.value === msg) toastMsg.value = "";
  }, 3000);
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function getDisplayName(email) {
  if (!email) return "站长";
  return email.includes("@") ? email.split("@")[0] : email;
}

function getInitials(email) {
  return getDisplayName(email).slice(0, 2).toUpperCase();
}

async function apiFetch(path, init = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = {
    "Content-Type": "application/json",
    ...(init.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data;
}

async function fetchAllData() {
  loadingData.value = true;
  try {
    const [postsData, notesData] = await Promise.all([
      apiFetch("/api/posts"),
      apiFetch("/api/notes"),
    ]);
    posts.value = postsData;
    notes.value = notesData;
  } catch (err) {
    showNotice(err?.message || "加载数据失败");
  } finally {
    loadingData.value = false;
  }
}

async function checkSession() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    userEmail.value = null;
    return;
  }
  try {
    const res = await apiFetch("/api/auth/me");
    userEmail.value = res.email;
    if (!res.email) localStorage.removeItem(TOKEN_KEY);
  } catch {
    userEmail.value = null;
    localStorage.removeItem(TOKEN_KEY);
  }
}

function toggleTheme() {
  theme.value = theme.value === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", theme.value);
  localStorage.setItem("secr3tzl_theme", theme.value);
}

function openUploadBlog(defaultPublic = true) {
  if (!userEmail.value) {
    authMsg.value = "请先登录后再上传博客";
    showAuthModal.value = true;
    return;
  }
  postIsPublic.value = defaultPublic;
  showUploadBlogModal.value = true;
}

async function handleAuthSubmit() {
  if (!emailInput.value.trim() || !passwordInput.value) {
    authMsg.value = "请输入邮箱和密码";
    return;
  }
  authBusy.value = true;
  authMsg.value = "";
  try {
    const endpoint =
      authMode.value === "login" ? "/api/auth/login" : "/api/auth/register";
    const res = await apiFetch(endpoint, {
      method: "POST",
      body: JSON.stringify({
        email: emailInput.value.trim(),
        password: passwordInput.value,
      }),
    });
    localStorage.setItem(TOKEN_KEY, res.token);
    userEmail.value = res.email;
    showAuthModal.value = false;
    passwordInput.value = "";
    showNotice(authMode.value === "login" ? "登录成功" : "注册并登录成功");
    await fetchAllData();
  } catch (err) {
    authMsg.value = err?.message || "操作失败";
  } finally {
    authBusy.value = false;
  }
}

async function handleLogout() {
  localStorage.removeItem(TOKEN_KEY);
  userEmail.value = null;
  if (activeTab.value === "private_space") activeTab.value = "home";
  showNotice("已退出登录");
  await fetchAllData();
}

async function handlePublishPost() {
  if (!postTitle.value.trim() || !postContent.value.trim()) return;
  publishingPost.value = true;
  try {
    const created = await apiFetch("/api/posts", {
      method: "POST",
      body: JSON.stringify({
        title: postTitle.value.trim(),
        content: postContent.value.trim(),
        is_public: postIsPublic.value,
      }),
    });
    posts.value.unshift(created);
    postTitle.value = "";
    postContent.value = "";
    showUploadBlogModal.value = false;
    activeTab.value = created.is_public ? "public_blog" : "private_space";
    showNotice(created.is_public ? "已发布到公共博客区" : "已保存到私密空间");
  } catch (err) {
    showNotice(err?.message || "上传失败");
  } finally {
    publishingPost.value = false;
  }
}

async function handleTogglePostVisibility(post) {
  const nextPublic = !post.is_public;
  try {
    await apiFetch(`/api/posts/${post.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_public: nextPublic }),
    });
    post.is_public = nextPublic;
    if (readingPost.value?.id === post.id) {
      readingPost.value = { ...post, is_public: nextPublic };
    }
    showNotice(nextPublic ? "博客已转为公开" : "博客已设为仅自己可见");
  } catch (err) {
    showNotice(err?.message || "切换失败");
  }
}

async function handleDeletePost(id) {
  try {
    await apiFetch(`/api/posts/${id}`, { method: "DELETE" });
    posts.value = posts.value.filter((p) => p.id !== id);
    if (readingPost.value?.id === id) readingPost.value = null;
    showNotice("已删除博客");
  } catch (err) {
    showNotice(err?.message || "删除失败");
  }
}

async function handlePublishNote() {
  if (!noteContent.value.trim()) return;
  publishingNote.value = true;
  try {
    const created = await apiFetch("/api/notes", {
      method: "POST",
      body: JSON.stringify({
        content: noteContent.value.trim(),
        mood: mood.value,
        is_public: noteIsPublic.value,
      }),
    });
    notes.value.unshift(created);
    noteContent.value = "";
    showNotice(created.is_public ? "已发布公开日常" : "已保存到私密空间");
  } catch (err) {
    showNotice(err?.message || "发布失败");
  } finally {
    publishingNote.value = false;
  }
}

async function handleToggleNoteVisibility(note) {
  const nextPublic = !note.is_public;
  try {
    await apiFetch(`/api/notes/${note.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_public: nextPublic }),
    });
    note.is_public = nextPublic;
    showNotice(nextPublic ? "日常已转为公开" : "日常已设为仅自己可见");
  } catch (err) {
    showNotice(err?.message || "切换失败");
  }
}

async function handleDeleteNote(id) {
  try {
    await apiFetch(`/api/notes/${id}`, { method: "DELETE" });
    notes.value = notes.value.filter((n) => n.id !== id);
    showNotice("已删除日常");
  } catch (err) {
    showNotice(err?.message || "删除失败");
  }
}

let timer = null;
onMounted(async () => {
  const saved = localStorage.getItem("secr3tzl_theme");
  theme.value = saved === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", theme.value);

  const updateClock = () => {
    clockText.value = new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };
  updateClock();
  timer = window.setInterval(updateClock, 1000);

  await checkSession();
  await fetchAllData();
});

onUnmounted(() => {
  if (timer) window.clearInterval(timer);
});
</script>

<template>
  <div class="site-wrapper">
    <!-- 顶部悬浮毛玻璃导航 -->
    <div class="nav-wrap">
      <header class="glass-nav">
        <button type="button" class="brand-btn" @click="activeTab = 'home'">
          <span class="brand-avatar">ZL</span>
          <span>Secr3tZL's base</span>
        </button>

        <nav class="nav-links" aria-label="主导航">
          <button
            type="button"
            class="nav-pill"
            :class="{ active: activeTab === 'home' }"
            @click="activeTab = 'home'"
          >
            首页
          </button>
          <button
            type="button"
            class="nav-pill"
            :class="{ active: activeTab === 'public_blog' }"
            @click="activeTab = 'public_blog'"
          >
            公共博客区
          </button>
          <button
            type="button"
            class="nav-pill"
            :class="{ active: activeTab === 'moments' }"
            @click="activeTab = 'moments'"
          >
            日常动态
          </button>
          <button
            type="button"
            class="nav-pill"
            :class="{ active: activeTab === 'private_space' }"
            @click="activeTab = 'private_space'"
          >
            🔒 私密空间
          </button>
        </nav>

        <div class="nav-actions">
          <button
            type="button"
            class="upload-blog-btn"
            @click="openUploadBlog(true)"
          >
            ＋ 上传博客
          </button>

          <button
            type="button"
            class="icon-btn"
            title="切换深浅色主题"
            @click="toggleTheme"
          >
            {{ theme === "dark" ? "☀️" : "🌙" }}
          </button>

          <button
            v-if="userEmail"
            type="button"
            class="icon-btn"
            :title="`当前登录：${userEmail}，点击退出`"
            @click="handleLogout"
          >
            退出 ({{ getDisplayName(userEmail) }})
          </button>
          <button
            v-else
            type="button"
            class="icon-btn"
            @click="authMsg = ''; showAuthModal = true"
          >
            登录
          </button>
        </div>
      </header>
    </div>

    <!-- 主内容 -->
    <main class="main-container">
      <div v-if="toastMsg" class="notice-bar">
        <span>{{ toastMsg }}</span>
      </div>

      <!-- 1. 首页 -->
      <template v-if="activeTab === 'home'">
        <section class="hero-grid">
          <div class="glass-card hero-main">
            <div class="hero-profile">
              <div class="hero-avatar">ZL</div>
              <div>
                <h1 class="hero-title">Secr3tZL's base</h1>
                <p class="hero-subtitle">
                  记录日常碎碎念、公共博客朋友圈与私密笔记的个人基地
                </p>
              </div>
            </div>
            <div class="tag-row">
              <span class="tag-chip"><span class="status-dot" />站点运行中</span>
              <span class="tag-chip">secr3tzl123.top</span>
              <span class="tag-chip">Vue 3 · JS · Cloudflare D1</span>
            </div>
          </div>

          <div class="glass-card bento-side">
            <div class="clock-box">
              <div class="clock-label">当前本地时间</div>
              <div class="clock-time">{{ clockText }}</div>
            </div>
            <div class="stats-row">
              <div class="stat-card">
                <div class="stat-num">{{ publicPosts.length }}</div>
                <div class="stat-label">公共博客</div>
              </div>
              <div class="stat-card">
                <div class="stat-num">{{ publicNotes.length }}</div>
                <div class="stat-label">公开日常</div>
              </div>
            </div>
          </div>
        </section>

        <section class="glass-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">公共博客区 · 最新动态</h2>
              <p class="section-sub">仿朋友圈信息流，支持公开与私密自由切换</p>
            </div>
            <button
              type="button"
              class="link-btn"
              @click="activeTab = 'public_blog'"
            >
              进入公共博客区 →
            </button>
          </div>

          <div v-if="loadingData" class="empty-state">加载中...</div>
          <div v-else-if="publicPosts.length === 0" class="empty-state">
            公共博客区还没有文章，点右上角「＋ 上传博客」发布第一篇吧~
          </div>
          <div v-else class="blog-grid">
            <article
              v-for="post in publicPosts.slice(0, 4)"
              :key="post.id"
              class="blog-card"
              @click="readingPost = post"
            >
              <div>
                <div class="card-meta" style="margin-bottom: 8px">
                  <span class="vis-badge public">🌐 公开</span>
                  <span>{{ getDisplayName(post.author_email) }}</span>
                </div>
                <h3 class="blog-title">{{ post.title }}</h3>
                <p class="blog-excerpt">{{ post.content }}</p>
              </div>
              <div class="card-meta">
                <span>{{ formatTime(post.created_at) }}</span>
                <span style="color: var(--accent)">阅读全文</span>
              </div>
            </article>
          </div>
        </section>

        <section class="glass-card">
          <div class="section-header">
            <h2 class="section-title">最新日常 · Moments</h2>
            <button type="button" class="link-btn" @click="activeTab = 'moments'">
              查看全部 / 发布 →
            </button>
          </div>

          <div v-if="loadingData" class="empty-state">加载中...</div>
          <div v-else-if="publicNotes.length === 0" class="empty-state">
            还没有公开日常~
          </div>
          <div v-else class="feed-list">
            <div v-for="note in publicNotes.slice(0, 3)" :key="note.id" class="moment-card">
              <div class="card-meta">
                <span class="mood-badge">{{ note.mood || "日常" }}</span>
                <span>{{ formatTime(note.created_at) }}</span>
              </div>
              <p class="card-text">{{ note.content }}</p>
            </div>
          </div>
        </section>
      </template>

      <!-- 2. 公共博客区（朋友圈排版） -->
      <section v-if="activeTab === 'public_blog'" class="glass-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">公共博客区 · 博客朋友圈</h2>
            <p class="section-sub">
              所有设为「公开」的博客都会展示在这里，共 {{ publicPosts.length }} 篇
            </p>
          </div>
          <button type="button" class="btn-primary" @click="openUploadBlog(true)">
            ＋ 上传博客
          </button>
        </div>

        <div v-if="loadingData" class="empty-state">加载中...</div>
        <div v-else-if="publicPosts.length === 0" class="empty-state">
          公共博客区暂时空空的，点击上方「＋ 上传博客」发第一篇吧~
        </div>
        <div v-else class="pyq-feed">
          <article v-for="post in publicPosts" :key="post.id" class="pyq-item">
            <div class="pyq-avatar">{{ getInitials(post.author_email) }}</div>
            <div class="pyq-body">
              <div class="pyq-top">
                <span class="pyq-author">{{ getDisplayName(post.author_email) }}</span>
                <span class="vis-badge public">🌐 公开</span>
              </div>

              <h3 class="pyq-title" @click="readingPost = post">{{ post.title }}</h3>
              <p class="pyq-content clamped">{{ post.content }}</p>

              <div class="pyq-footer">
                <span>{{ formatTime(post.created_at) }}</span>
                <div class="pyq-actions">
                  <button type="button" class="btn-mini" @click="readingPost = post">
                    展开全文
                  </button>
                  <template v-if="userEmail && userEmail === post.author_email">
                    <button
                      type="button"
                      class="btn-mini"
                      @click="handleTogglePostVisibility(post)"
                    >
                      设为私密
                    </button>
                    <button
                      type="button"
                      class="btn-danger-sm"
                      @click="handleDeletePost(post.id)"
                    >
                      删除
                    </button>
                  </template>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      <!-- 3. 日常动态区 -->
      <section v-if="activeTab === 'moments'" class="glass-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">日常动态 · Moments</h2>
            <p class="section-sub">分享短动态，发布时可自由选择公开或仅自己可见</p>
          </div>
          <span style="font-size: 13px; color: var(--text-subtle)">
            共 {{ publicNotes.length }} 条公开动态
          </span>
        </div>

        <form v-if="userEmail" class="composer-form" @submit.prevent="handlePublishNote">
          <textarea
            v-model="noteContent"
            class="field-textarea"
            placeholder="此刻在想什么？记录一条今天的日常..."
          />
          <div class="mood-bar">
            <div class="mood-pills">
              <button
                v-for="m in MOODS"
                :key="m"
                type="button"
                class="mood-pill"
                :class="{ active: mood === m }"
                @click="mood = m"
              >
                {{ m }}
              </button>
            </div>
            <div class="row-gap">
              <button
                type="button"
                class="btn-mini"
                @click="noteIsPublic = !noteIsPublic"
              >
                {{ noteIsPublic ? "🌐 公开可见" : "🔒 仅自己可见" }}
              </button>
              <button
                type="submit"
                class="btn-primary"
                :disabled="publishingNote || !noteContent.trim()"
              >
                {{ publishingNote ? "发布中..." : "发布动态" }}
              </button>
            </div>
          </div>
        </form>

        <div v-else class="notice-bar" style="margin-bottom: 20px">
          <span>登录后即可发布新的日常动态</span>
          <button type="button" class="btn-primary" @click="showAuthModal = true">
            立即登录
          </button>
        </div>

        <div v-if="publicNotes.length === 0" class="empty-state">暂无公开动态</div>
        <div v-else class="feed-list">
          <div v-for="note in publicNotes" :key="note.id" class="moment-card">
            <div class="card-meta">
              <div class="row-gap">
                <span class="mood-badge">{{ note.mood || "日常" }}</span>
                <span>{{ getDisplayName(note.author_email) }}</span>
              </div>
              <div class="row-gap">
                <span>{{ formatTime(note.created_at) }}</span>
                <template v-if="userEmail && userEmail === note.author_email">
                  <button
                    type="button"
                    class="btn-mini"
                    @click="handleToggleNoteVisibility(note)"
                  >
                    设为私密
                  </button>
                  <button
                    type="button"
                    class="btn-danger-sm"
                    @click="handleDeleteNote(note.id)"
                  >
                    删除
                  </button>
                </template>
              </div>
            </div>
            <p class="card-text">{{ note.content }}</p>
          </div>
        </div>
      </section>

      <!-- 4. 私密空间 -->
      <section v-if="activeTab === 'private_space'" class="glass-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">🔒 我的私密空间</h2>
            <p class="section-sub">仅你自己登录后可见，随时可一键转为公开</p>
          </div>
          <button
            v-if="userEmail"
            type="button"
            class="btn-primary"
            @click="openUploadBlog(false)"
          >
            ＋ 写一篇私密博客
          </button>
        </div>

        <div v-if="!userEmail" class="notice-bar">
          <span>请先登录你的账号以查看和管理私密博客与私密日常</span>
          <button type="button" class="btn-primary" @click="showAuthModal = true">
            立即登录
          </button>
        </div>

        <div v-else class="col-gap" style="gap: 24px">
          <div>
            <h3 class="sub-heading">私密博客（{{ privatePosts.length }} 篇）</h3>
            <div v-if="privatePosts.length === 0" class="empty-state">
              还没有私密博客，点「＋ 上传博客」并选择「仅自己可见」即可保存
            </div>
            <div v-else class="pyq-feed">
              <article v-for="post in privatePosts" :key="post.id" class="pyq-item">
                <div class="pyq-avatar private-av">🔒</div>
                <div class="pyq-body">
                  <div class="pyq-top">
                    <span class="pyq-author">{{ getDisplayName(post.author_email) }}</span>
                    <span class="vis-badge private">🔒 仅自己可见</span>
                  </div>
                  <h3 class="pyq-title" @click="readingPost = post">{{ post.title }}</h3>
                  <p class="pyq-content clamped">{{ post.content }}</p>
                  <div class="pyq-footer">
                    <span>{{ formatTime(post.created_at) }}</span>
                    <div class="pyq-actions">
                      <button type="button" class="btn-mini" @click="readingPost = post">
                        展开全文
                      </button>
                      <button
                        type="button"
                        class="btn-mini"
                        @click="handleTogglePostVisibility(post)"
                      >
                        转为公开
                      </button>
                      <button
                        type="button"
                        class="btn-danger-sm"
                        @click="handleDeletePost(post.id)"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </div>

          <div>
            <h3 class="sub-heading">私密日常（{{ privateNotes.length }} 条）</h3>
            <div v-if="privateNotes.length === 0" class="empty-state">暂无私密日常</div>
            <div v-else class="feed-list">
              <div v-for="note in privateNotes" :key="note.id" class="moment-card">
                <div class="card-meta">
                  <div class="row-gap">
                    <span class="vis-badge private">🔒 私密</span>
                    <span class="mood-badge">{{ note.mood || "日常" }}</span>
                  </div>
                  <div class="row-gap">
                    <span>{{ formatTime(note.created_at) }}</span>
                    <button
                      type="button"
                      class="btn-mini"
                      @click="handleToggleNoteVisibility(note)"
                    >
                      转为公开
                    </button>
                    <button
                      type="button"
                      class="btn-danger-sm"
                      @click="handleDeleteNote(note.id)"
                    >
                      删除
                    </button>
                  </div>
                </div>
                <p class="card-text">{{ note.content }}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <footer class="site-footer">
      <p>© 2026 Secr3tZL's base · Vue 3 + Cloudflare Pages &amp; D1 驱动</p>
    </footer>

    <!-- 独立上传博客弹窗 -->
    <div
      v-if="showUploadBlogModal"
      class="modal-backdrop"
      @click="showUploadBlogModal = false"
    >
      <div class="modal-box modal-wide" @click.stop>
        <div class="section-header" style="margin-bottom: 0">
          <h3 class="section-title">上传新博客</h3>
          <button type="button" class="btn-ghost" @click="showUploadBlogModal = false">
            关闭
          </button>
        </div>

        <form class="col-gap" @submit.prevent="handlePublishPost">
          <input
            v-model="postTitle"
            type="text"
            class="field-input"
            placeholder="输入博客标题..."
          />
          <textarea
            v-model="postContent"
            class="field-textarea"
            style="min-height: 200px"
            placeholder="写下你的博客正文内容..."
          />

          <div>
            <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px">
              谁可以看
            </div>
            <div class="vis-selector">
              <button
                type="button"
                class="vis-option"
                :class="{ 'active-public': postIsPublic }"
                @click="postIsPublic = true"
              >
                <span class="vis-option-title">🌐 公开</span>
                <span class="vis-option-desc">展示在「公共博客区」，所有访客可见</span>
              </button>
              <button
                type="button"
                class="vis-option"
                :class="{ 'active-private': !postIsPublic }"
                @click="postIsPublic = false"
              >
                <span class="vis-option-title">🔒 私密</span>
                <span class="vis-option-desc">仅存入「私密空间」，只有你自己能看</span>
              </button>
            </div>
          </div>

          <div class="flex-end">
            <button type="button" class="btn-ghost" @click="showUploadBlogModal = false">
              取消
            </button>
            <button
              type="submit"
              class="btn-primary"
              :disabled="publishingPost || !postTitle.trim() || !postContent.trim()"
            >
              {{
                publishingPost
                  ? "上传中..."
                  : postIsPublic
                  ? "发布到公共博客区"
                  : "保存为私密博客"
              }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- 登录 / 注册弹窗 -->
    <div v-if="showAuthModal" class="modal-backdrop" @click="showAuthModal = false">
      <div class="modal-box" @click.stop>
        <div class="section-header" style="margin-bottom: 0">
          <h3 class="section-title">账号中心</h3>
          <button type="button" class="btn-ghost" @click="showAuthModal = false">
            关闭
          </button>
        </div>

        <div class="modal-tabs">
          <button
            type="button"
            class="modal-tab"
            :class="{ active: authMode === 'login' }"
            @click="authMode = 'login'; authMsg = ''"
          >
            立即登录
          </button>
          <button
            type="button"
            class="modal-tab"
            :class="{ active: authMode === 'register' }"
            @click="authMode = 'register'; authMsg = ''"
          >
            注册账号
          </button>
        </div>

        <form class="col-gap" @submit.prevent="handleAuthSubmit">
          <input
            v-model="emailInput"
            type="email"
            class="field-input"
            placeholder="邮箱地址"
          />
          <input
            v-model="passwordInput"
            type="password"
            class="field-input"
            placeholder="密码（至少 6 位）"
          />
          <p v-if="authMsg" class="auth-msg">{{ authMsg }}</p>
          <button type="submit" class="btn-primary" :disabled="authBusy">
            {{
              authBusy ? "处理中..." : authMode === "login" ? "立即登录" : "创建并登录"
            }}
          </button>
        </form>
      </div>
    </div>

    <!-- 阅读博客全文弹窗 -->
    <div v-if="readingPost" class="modal-backdrop" @click="readingPost = null">
      <div class="modal-box modal-wide" @click.stop>
        <div class="section-header" style="margin-bottom: 0">
          <h2 class="section-title" style="font-size: 22px">{{ readingPost.title }}</h2>
          <button type="button" class="btn-ghost" @click="readingPost = null">
            关闭
          </button>
        </div>
        <div class="card-meta">
          <div class="row-gap">
            <span
              class="vis-badge"
              :class="readingPost.is_public ? 'public' : 'private'"
            >
              {{ readingPost.is_public ? "🌐 公开" : "🔒 仅自己可见" }}
            </span>
            <span>作者：{{ getDisplayName(readingPost.author_email) }}</span>
          </div>
          <span>发布于 {{ formatTime(readingPost.created_at) }}</span>
        </div>
        <div class="card-text read-body">{{ readingPost.content }}</div>
      </div>
    </div>
  </div>
</template>