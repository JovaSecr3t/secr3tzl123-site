<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";

const MOODS = ["日常", "记录", "碎碎念", "推荐"];
const TOKEN_KEY = "secr3tzl_d1_token";

const activeTab = ref("home");
const isAdminRoute = ref(
  window.location.pathname.replace(/\/+$/, "") === "/admin"
);
const theme = ref("dark");
const clockText = ref("--:--:--");
const toastMsg = ref("");

// 账号状态
const userId = ref(null);
const userEmail = ref(null);
const userName = ref("");
const userRole = ref("user");
const showAuthModal = ref(false);
const authMode = ref("login");
const accountInput = ref("");
const usernameInput = ref("");
const emailInput = ref("");
const passwordInput = ref("");
const confirmPasswordInput = ref("");
const authMsg = ref("");
const authBusy = ref(false);

// 管理员后台与用户中心状态
const hasAdminAccount = ref(true);
const checkingAdminStatus = ref(false);
const adminEmailInput = ref("");
const adminPasswordInput = ref("");
const adminConfirmPasswordInput = ref("");
const profileNameInput = ref("");
const savingProfile = ref(false);
const adminUsers = ref([]);
const adminTotalUsers = ref(0);
const loadingAdmin = ref(false);

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

const isLoggedIn = computed(() => Boolean(userId.value));
const isAdmin = computed(() => userRole.value === "admin");
const displayCurrentUser = computed(() => {
  if (!isLoggedIn.value) return "访客";
  return userName.value || getDisplayName(userEmail.value);
});

const publicPosts = computed(() => posts.value.filter((p) => p.is_public));
const privatePosts = computed(() =>
  posts.value.filter((p) => !p.is_public && p.is_mine)
);
const publicNotes = computed(() => notes.value.filter((n) => n.is_public));
const privateNotes = computed(() =>
  notes.value.filter((n) => !n.is_public && n.is_mine)
);

// 实时密码规则校验（前台注册 & /admin 注册共用）
function getPasswordChecks(pwd) {
  return {
    len: pwd.length >= 8,
    upper: /[A-Z]/.test(pwd),
    digit: /\d/.test(pwd),
  };
}

function validatePasswordClient(pwd, confirmPwd) {
  const c = getPasswordChecks(pwd);
  if (!c.len) return "密码长度至少需要 8 位";
  if (!c.upper) return "密码必须包含至少 1 个大写字母";
  if (!c.digit) return "密码必须包含至少 1 个数字";
  if (pwd !== confirmPwd) return "两次输入的密码不一致";
  return "";
}

const regPwdChecks = computed(() => getPasswordChecks(passwordInput.value));
const adminPwdChecks = computed(() => getPasswordChecks(adminPasswordInput.value));

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

function getDisplayName(nameOrEmail) {
  if (!nameOrEmail) return "用户";
  return nameOrEmail.includes("@") ? nameOrEmail.split("@")[0] : nameOrEmail;
}

function getInitials(nameOrEmail) {
  return getDisplayName(nameOrEmail).slice(0, 2).toUpperCase();
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

async function fetchAdminStatus() {
  checkingAdminStatus.value = true;
  try {
    const res = await apiFetch("/api/admin/status");
    hasAdminAccount.value = Boolean(res.hasAdmin);
  } catch {
    hasAdminAccount.value = true;
  } finally {
    checkingAdminStatus.value = false;
  }
}

function syncRoute() {
  isAdminRoute.value =
    window.location.pathname.replace(/\/+$/, "") === "/admin";
  authMsg.value = "";
  if (isAdminRoute.value) {
    fetchAdminStatus();
    if (isAdmin.value) fetchAdminUsers();
  }
}

function goToPath(path) {
  if (window.location.pathname !== path) {
    window.history.pushState({}, "", path);
  }
  syncRoute();
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
    userId.value = null;
    userEmail.value = null;
    userName.value = "";
    userRole.value = "user";
    return;
  }
  try {
    const res = await apiFetch("/api/auth/me");
    userId.value = res.id || null;
    userEmail.value = res.email || null;
    userName.value = res.username || "";
    userRole.value = res.role || "user";
    profileNameInput.value = userName.value;
    if (!res.id) localStorage.removeItem(TOKEN_KEY);
  } catch {
    userId.value = null;
    userEmail.value = null;
    userName.value = "";
    userRole.value = "user";
    localStorage.removeItem(TOKEN_KEY);
  }
}

function toggleTheme() {
  theme.value = theme.value === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", theme.value);
  localStorage.setItem("secr3tzl_theme", theme.value);
}

function openUploadBlog(defaultPublic = true) {
  if (!isLoggedIn.value) {
    authMsg.value = "请先登录后再上传博客";
    showAuthModal.value = true;
    return;
  }
  postIsPublic.value = defaultPublic;
  showUploadBlogModal.value = true;
}

async function handleAuthSubmit() {
  if (authMode.value === "login") {
    if (!accountInput.value.trim() || !passwordInput.value) {
      authMsg.value = "请输入用户名（或邮箱）和密码";
      return;
    }
  } else {
    const name = usernameInput.value.trim();
    if (!name || name.length < 2 || name.length > 20 || /\s/.test(name)) {
      authMsg.value = "用户名需为 2~20 位非空格字符";
      return;
    }
    const pwdErr = validatePasswordClient(
      passwordInput.value,
      confirmPasswordInput.value
    );
    if (pwdErr) {
      authMsg.value = pwdErr;
      return;
    }
  }

  authBusy.value = true;
  authMsg.value = "";
  try {
    const endpoint =
      authMode.value === "login" ? "/api/auth/login" : "/api/auth/register";
    const payload =
      authMode.value === "login"
        ? {
            account: accountInput.value.trim(),
            password: passwordInput.value,
          }
        : {
            username: usernameInput.value.trim(),
            email: emailInput.value.trim() || undefined,
            password: passwordInput.value,
          };

    const res = await apiFetch(endpoint, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    localStorage.setItem(TOKEN_KEY, res.token);
    userId.value = res.id;
    userName.value = res.username;
    userEmail.value = res.email || null;
    userRole.value = res.role || "user";
    profileNameInput.value = userName.value;
    showAuthModal.value = false;
    passwordInput.value = "";
    confirmPasswordInput.value = "";
    showNotice(authMode.value === "login" ? "登录成功" : "注册并登录成功");
    await fetchAllData();
    if (isAdminRoute.value && isAdmin.value) {
      await fetchAdminUsers();
    }
  } catch (err) {
    authMsg.value = err?.message || "操作失败";
  } finally {
    authBusy.value = false;
  }
}

async function handleAdminLogin() {
  authMode.value = "login";
  await handleAuthSubmit();
}

async function handleAdminRegister() {
  const pwdErr = validatePasswordClient(
    adminPasswordInput.value,
    adminConfirmPasswordInput.value
  );
  if (pwdErr) {
    authMsg.value = pwdErr;
    return;
  }

  authBusy.value = true;
  authMsg.value = "";
  try {
    const res = await apiFetch("/api/admin/register", {
      method: "POST",
      body: JSON.stringify({
        email: adminEmailInput.value.trim() || undefined,
        password: adminPasswordInput.value,
      }),
    });
    localStorage.setItem(TOKEN_KEY, res.token);
    userId.value = res.id;
    userName.value = res.username;
    userEmail.value = res.email || null;
    userRole.value = res.role || "admin";
    profileNameInput.value = userName.value;
    hasAdminAccount.value = true;
    adminPasswordInput.value = "";
    adminConfirmPasswordInput.value = "";
    showNotice("管理员 admin 初始化注册成功");
    await Promise.all([fetchAllData(), fetchAdminUsers()]);
  } catch (err) {
    authMsg.value = err?.message || "注册管理员失败";
  } finally {
    authBusy.value = false;
  }
}

async function handleLogout() {
  localStorage.removeItem(TOKEN_KEY);
  userId.value = null;
  userEmail.value = null;
  userName.value = "";
  userRole.value = "user";
  profileNameInput.value = "";
  if (["private_space", "profile"].includes(activeTab.value)) {
    activeTab.value = "home";
  }
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

async function handleUpdateUsername() {
  const nextName = profileNameInput.value.trim();
  if (!nextName || nextName.length < 2 || nextName.length > 20 || /\s/.test(nextName)) {
    showNotice("用户名需为 2~20 位非空格字符");
    return;
  }
  savingProfile.value = true;
  try {
    const res = await apiFetch("/api/user/profile", {
      method: "PATCH",
      body: JSON.stringify({ username: nextName }),
    });
    userName.value = res.username;
    showNotice("用户名已更新");
    await fetchAllData();
  } catch (err) {
    showNotice(err?.message || "更新用户名失败");
  } finally {
    savingProfile.value = false;
  }
}

async function fetchAdminUsers() {
  if (!isAdmin.value) return;
  loadingAdmin.value = true;
  try {
    const res = await apiFetch("/api/admin/users");
    adminTotalUsers.value = res.total || 0;
    adminUsers.value = res.users || [];
  } catch (err) {
    showNotice(err?.message || "获取用户列表失败");
  } finally {
    loadingAdmin.value = false;
  }
}

async function handleToggleUserRole(targetUser) {
  const nextRole = targetUser.role === "admin" ? "user" : "admin";
  try {
    await apiFetch(`/api/admin/users/${targetUser.id}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role: nextRole }),
    });
    targetUser.role = nextRole;
    showNotice(
      nextRole === "admin"
        ? `已将 ${targetUser.username} 设为管理员`
        : `已取消 ${targetUser.username} 的管理员权限`
    );
  } catch (err) {
    showNotice(err?.message || "权限修改失败");
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

  window.addEventListener("popstate", syncRoute);
  await checkSession();
  await fetchAllData();
  if (isAdminRoute.value) {
    await fetchAdminStatus();
    if (isAdmin.value) await fetchAdminUsers();
  }
});

onUnmounted(() => {
  if (timer) window.clearInterval(timer);
  window.removeEventListener("popstate", syncRoute);
});
</script>

<template>
  <!-- 独立路径 /admin 管理员后台 -->
  <div v-if="isAdminRoute" class="admin-page-wrap">
    <header class="glass-card admin-topbar">
      <div class="row-gap">
        <span class="brand-avatar">🛡️</span>
        <div>
          <h1 style="font-size: 18px; font-weight: 700">后台管理系统</h1>
          <p class="card-meta">独立管理入口 · /admin</p>
        </div>
      </div>

      <div class="row-gap">
        <button type="button" class="icon-btn" @click="toggleTheme">
          {{ theme === "dark" ? "☀️" : "🌙" }}
        </button>
        <button type="button" class="icon-btn" @click="goToPath('/')">
          返回前台首页
        </button>
        <button
          v-if="isLoggedIn"
          type="button"
          class="btn-danger-sm"
          @click="handleLogout"
        >
          退出 ({{ displayCurrentUser }})
        </button>
      </div>
    </header>

    <div v-if="toastMsg" class="notice-bar">
      <span>{{ toastMsg }}</span>
    </div>

    <!-- 情况 1：未登录 -->
    <section v-if="!isLoggedIn" class="glass-card admin-login-card">
      <div v-if="checkingAdminStatus" class="empty-state">检查后台初始化状态...</div>

      <!-- 1A：尚未注册过 admin -> 显示初始化注册 admin 表单 -->
      <template v-else-if="!hasAdminAccount">
        <h2 class="section-title">初始化注册管理员</h2>
        <p class="section-sub" style="margin: 4px 0 16px">
          检测到系统尚未创建默认管理员，请先完成 <strong>admin</strong> 账号注册
        </p>

        <form class="col-gap" @submit.prevent="handleAdminRegister">
          <input
            type="text"
            class="field-input"
            value="admin"
            disabled
          />
          <input
            v-model="adminEmailInput"
            type="email"
            class="field-input"
            placeholder="管理员邮箱（选填，可作为备用登录方式）"
          />
          <input
            v-model="adminPasswordInput"
            type="password"
            class="field-input"
            placeholder="设置管理员密码（至少 8 位，含大写字母和数字）"
          />
          <input
            v-model="adminConfirmPasswordInput"
            type="password"
            class="field-input"
            placeholder="再次输入密码确认"
          />

          <div class="pwd-rules">
            <span :class="{ ok: adminPwdChecks.len }">
              {{ adminPwdChecks.len ? "✓" : "○" }} 至少 8 位字符
            </span>
            <span :class="{ ok: adminPwdChecks.upper }">
              {{ adminPwdChecks.upper ? "✓" : "○" }} 至少 1 个大写字母 (A-Z)
            </span>
            <span :class="{ ok: adminPwdChecks.digit }">
              {{ adminPwdChecks.digit ? "✓" : "○" }} 至少 1 个数字 (0-9)
            </span>
          </div>

          <p v-if="authMsg" class="auth-msg">{{ authMsg }}</p>
          <button type="submit" class="btn-primary" :disabled="authBusy">
            {{ authBusy ? "注册中..." : "注册 admin 并进入后台" }}
          </button>
        </form>
      </template>

      <!-- 1B：已注册 admin -> 显示管理员登录表单 -->
      <template v-else>
        <h2 class="section-title">管理员登录</h2>
        <p class="section-sub" style="margin: 4px 0 16px">
          请使用 admin 或已被授权的管理员账号登录后台
        </p>

        <form class="col-gap" @submit.prevent="handleAdminLogin">
          <input
            v-model="accountInput"
            type="text"
            class="field-input"
            placeholder="管理员用户名或邮箱（如：admin）"
          />
          <input
            v-model="passwordInput"
            type="password"
            class="field-input"
            placeholder="密码"
          />
          <p v-if="authMsg" class="auth-msg">{{ authMsg }}</p>
          <button type="submit" class="btn-primary" :disabled="authBusy">
            {{ authBusy ? "登录中..." : "登录后台" }}
          </button>
        </form>
      </template>
    </section>

    <!-- 情况 2：已登录但不是管理员 -->
    <section v-else-if="!isAdmin" class="glass-card admin-login-card">
      <h2 class="section-title">无访问权限</h2>
      <p class="section-sub" style="margin: 8px 0 18px">
        当前登录账号（{{ displayCurrentUser }}）不是管理员，无法进入后台。
      </p>
      <div class="row-gap">
        <button type="button" class="btn-primary" @click="handleLogout">
          切换管理员账号
        </button>
        <button type="button" class="btn-ghost" @click="goToPath('/')">
          返回前台首页
        </button>
      </div>
    </section>

    <!-- 情况 3：管理员已登录 -> 后台管理面板 -->
    <template v-else>
      <section class="glass-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">用户与权限管理</h2>
            <p class="section-sub">统计用户总数，并给指定用户授予或取消管理员权限</p>
          </div>
          <button type="button" class="btn-mini" @click="fetchAdminUsers">
            刷新用户数据
          </button>
        </div>

        <div class="admin-summary">
          <div class="stat-card">
            <div class="stat-num">{{ adminTotalUsers }}</div>
            <div class="stat-label">当前用户总数</div>
          </div>
          <div class="stat-card">
            <div class="stat-num">
              {{ adminUsers.filter((u) => u.role === "admin").length }}
            </div>
            <div class="stat-label">管理员人数</div>
          </div>
          <div class="stat-card">
            <div class="stat-num">{{ publicPosts.length }}</div>
            <div class="stat-label">公共博客数</div>
          </div>
        </div>

        <div v-if="loadingAdmin" class="empty-state">加载用户列表中...</div>
        <div v-else class="feed-list">
          <div v-for="u in adminUsers" :key="u.id" class="admin-user-row">
            <div>
              <div class="row-gap">
                <strong>{{ u.username }}</strong>
                <span
                  class="vis-badge"
                  :class="u.role === 'admin' ? 'public' : 'private'"
                >
                  {{ u.role === "admin" ? "管理员" : "普通用户" }}
                </span>
              </div>
              <div class="card-meta" style="margin-top: 4px">
                <span>{{ u.email || "未绑定邮箱" }}</span>
                <span>注册于 {{ formatTime(u.created_at) }}</span>
              </div>
            </div>

            <button
              v-if="u.id !== userId && u.id !== 'root-admin'"
              type="button"
              :class="u.role === 'admin' ? 'btn-danger-sm' : 'btn-primary'"
              @click="handleToggleUserRole(u)"
            >
              {{ u.role === "admin" ? "取消管理员" : "设为管理员" }}
            </button>
            <span v-else class="card-meta">
              {{ u.id === "root-admin" ? "默认管理员" : "当前账号" }}
            </span>
          </div>
        </div>
      </section>

      <section class="glass-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">公共博客审核管理</h2>
            <p class="section-sub">可直接在此查看或删除公共博客区中的违规文章</p>
          </div>
          <button type="button" class="btn-mini" @click="fetchAllData">
            刷新文章
          </button>
        </div>

        <div v-if="publicPosts.length === 0" class="empty-state">暂无公共博客</div>
        <div v-else class="feed-list">
          <div v-for="post in publicPosts" :key="post.id" class="admin-user-row">
            <div style="flex: 1; min-width: 220px">
              <strong>{{ post.title }}</strong>
              <div class="card-meta" style="margin-top: 4px">
                <span>作者：{{ post.author_name || getDisplayName(post.author_email) }}</span>
                <span>{{ formatTime(post.created_at) }}</span>
              </div>
            </div>
            <div class="row-gap">
              <button type="button" class="btn-mini" @click="readingPost = post">
                查看
              </button>
              <button
                type="button"
                class="btn-danger-sm"
                @click="handleDeletePost(post.id)"
              >
                删除违规
              </button>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>

  <!-- 前台主站点 -->
  <div v-else class="site-wrapper">
    <div class="nav-wrap">
      <header class="glass-nav">
        <button type="button" class="brand-btn" @click="activeTab = 'home'">
          <span class="brand-avatar">{{ getInitials(displayCurrentUser) }}</span>
          <span>欢迎您，{{ displayCurrentUser }}</span>
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
          <button
            v-if="isLoggedIn"
            type="button"
            class="nav-pill"
            :class="{ active: activeTab === 'profile' }"
            @click="profileNameInput = displayCurrentUser; activeTab = 'profile'"
          >
            用户中心
          </button>
          <button
            v-if="isAdmin"
            type="button"
            class="nav-pill"
            @click="goToPath('/admin')"
          >
            🛡️ 管理员后台
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
            v-if="isLoggedIn"
            type="button"
            class="icon-btn"
            :title="`当前用户：${displayCurrentUser}，点击退出`"
            @click="handleLogout"
          >
            退出 ({{ displayCurrentUser }})
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

    <main class="main-container">
      <div v-if="toastMsg" class="notice-bar">
        <span>{{ toastMsg }}</span>
      </div>

      <!-- 1. 首页 -->
      <template v-if="activeTab === 'home'">
        <section class="hero-grid">
          <div class="glass-card hero-main">
            <div class="hero-profile">
              <div class="hero-avatar">{{ getInitials(displayCurrentUser) }}</div>
              <div>
                <h1 class="hero-title">欢迎您，{{ displayCurrentUser }}</h1>
                <p class="hero-subtitle">
                  记录日常碎碎念、公共博客朋友圈与私密笔记的个人空间
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
                  <span>{{ post.author_name || getDisplayName(post.author_email) }}</span>
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

      <!-- 2. 公共博客区 -->
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
            <div class="pyq-avatar">
              {{ getInitials(post.author_name || post.author_email) }}
            </div>
            <div class="pyq-body">
              <div class="pyq-top">
                <span class="pyq-author">
                  {{ post.author_name || getDisplayName(post.author_email) }}
                </span>
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
                  <button
                    v-if="post.is_mine"
                    type="button"
                    class="btn-mini"
                    @click="handleTogglePostVisibility(post)"
                  >
                    设为私密
                  </button>
                  <button
                    v-if="post.is_mine || isAdmin"
                    type="button"
                    class="btn-danger-sm"
                    @click="handleDeletePost(post.id)"
                  >
                    {{ post.is_mine ? "删除" : "删除违规" }}
                  </button>
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

        <form v-if="isLoggedIn" class="composer-form" @submit.prevent="handlePublishNote">
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
                <span>{{ note.author_name || getDisplayName(note.author_email) }}</span>
              </div>
              <div class="row-gap">
                <span>{{ formatTime(note.created_at) }}</span>
                <button
                  v-if="note.is_mine"
                  type="button"
                  class="btn-mini"
                  @click="handleToggleNoteVisibility(note)"
                >
                  设为私密
                </button>
                <button
                  v-if="note.is_mine || isAdmin"
                  type="button"
                  class="btn-danger-sm"
                  @click="handleDeleteNote(note.id)"
                >
                  {{ note.is_mine ? "删除" : "删除违规" }}
                </button>
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
            v-if="isLoggedIn"
            type="button"
            class="btn-primary"
            @click="openUploadBlog(false)"
          >
            ＋ 写一篇私密博客
          </button>
        </div>

        <div v-if="!isLoggedIn" class="notice-bar">
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
                    <span class="pyq-author">
                      {{ post.author_name || getDisplayName(post.author_email) }}
                    </span>
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

      <!-- 5. 用户中心 -->
      <section v-if="activeTab === 'profile' && isLoggedIn" class="glass-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">用户中心</h2>
            <p class="section-sub">查看账号信息并修改你的显示用户名</p>
          </div>
          <span class="vis-badge" :class="isAdmin ? 'public' : 'private'">
            {{ isAdmin ? "🛡️ 管理员" : "普通用户" }}
          </span>
        </div>

        <form class="composer-form" @submit.prevent="handleUpdateUsername">
          <div class="card-meta">当前用户名：{{ displayCurrentUser }}</div>
          <div class="card-meta">当前绑定邮箱：{{ userEmail || "未填写" }}</div>

          <template v-if="userId === 'root-admin'">
            <div class="notice-bar">
              <span>默认管理员 admin 用户名受系统保护，不可修改。</span>
            </div>
          </template>
          <template v-else>
            <input
              v-model="profileNameInput"
              type="text"
              maxlength="20"
              class="field-input"
              placeholder="输入新的用户名（2~20 字，不可重复）"
            />
            <div class="flex-end">
              <button
                type="submit"
                class="btn-primary"
                :disabled="savingProfile || !profileNameInput.trim()"
              >
                {{ savingProfile ? "保存中..." : "保存用户名" }}
              </button>
            </div>
          </template>
        </form>
      </section>
    </main>

    <footer class="site-footer">
      <p>© 2026 欢迎您，{{ displayCurrentUser }} · Vue 3 + Cloudflare Pages &amp; D1 驱动</p>
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

    <!-- 前台登录 / 注册弹窗 -->
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
            v-if="authMode === 'login'"
            v-model="accountInput"
            type="text"
            class="field-input"
            placeholder="用户名或邮箱"
          />
          <template v-else>
            <input
              v-model="usernameInput"
              type="text"
              maxlength="20"
              class="field-input"
              placeholder="用户名（2~20 字，不可重复）"
            />
            <input
              v-model="emailInput"
              type="email"
              class="field-input"
              placeholder="邮箱地址（选填，可作为备用登录方式）"
            />
          </template>

          <input
            v-model="passwordInput"
            type="password"
            class="field-input"
            :placeholder="
              authMode === 'login'
                ? '请输入密码'
                : '设置密码（至少 8 位，含大写字母和数字）'
            "
          />

          <template v-if="authMode === 'register'">
            <input
              v-model="confirmPasswordInput"
              type="password"
              class="field-input"
              placeholder="请再次确认密码"
            />
            <div class="pwd-rules">
              <span :class="{ ok: regPwdChecks.len }">
                {{ regPwdChecks.len ? "✓" : "○" }} 至少 8 位字符
              </span>
              <span :class="{ ok: regPwdChecks.upper }">
                {{ regPwdChecks.upper ? "✓" : "○" }} 至少 1 个大写字母 (A-Z)
              </span>
              <span :class="{ ok: regPwdChecks.digit }">
                {{ regPwdChecks.digit ? "✓" : "○" }} 至少 1 个数字 (0-9)
              </span>
            </div>
          </template>

          <p v-if="authMsg" class="auth-msg">{{ authMsg }}</p>
          <button type="submit" class="btn-primary" :disabled="authBusy">
            {{
              authBusy ? "处理中..." : authMode === "login" ? "立即登录" : "创建并登录"
            }}
          </button>
        </form>
      </div>
    </div>
  </div>

  <!-- 公共阅读全文弹窗（前台与 /admin 后台共用） -->
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
          <span>
            作者：{{ readingPost.author_name || getDisplayName(readingPost.author_email) }}
          </span>
        </div>
        <span>发布于 {{ formatTime(readingPost.created_at) }}</span>
      </div>
      <div class="card-text read-body">{{ readingPost.content }}</div>
    </div>
  </div>
</template>