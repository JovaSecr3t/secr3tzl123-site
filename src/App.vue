<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

type ThemeMode = "dark" | "light";
type PaletteKey = "ocean" | "violet" | "emerald" | "sunset" | "rose";
type FrontendTab = "home" | "community" | "moments" | "friends" | "private_space" | "profile";
type AdminSubTab = "users" | "posts";
type AuthMode = "login" | "register";
type UserRole = "admin" | "user";
type UserStatus = "active" | "disabled" | "banned";
type FriendRelation =
  | "none"
  | "self"
  | "friends"
  | "outgoing_pending"
  | "incoming_pending";

interface PaletteOption {
  key: PaletteKey;
  label: string;
  color: string;
}

interface AuthSessionResponse {
  id: string | null;
  uid: number | null;
  personal_id?: string | null;
  personal_id_changed?: boolean;
  username: string | null;
  email: string | null;
  role: UserRole;
  status: UserStatus;
  token?: string;
}

interface AdminUserItem {
  id: string;
  uid: number;
  personal_id: string;
  username: string;
  email: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: string;
}

interface PostItem {
  id: string;
  title: string;
  content: string;
  is_public: boolean;
  author_id: string;
  author_uid: number | null;
  author_name: string;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  is_mine: boolean;
  created_at: string;
}

interface CommentItem {
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
  liked_by_me: boolean;
  is_mine: boolean;
}

interface CommentNode extends CommentItem {
  replies: CommentItem[];
}

interface NoteItem {
  id: string;
  content: string;
  mood: string;
  is_public: boolean;
  author_id: string;
  author_uid: number | null;
  author_name: string;
  is_mine: boolean;
  created_at: string;
}

interface FriendUserItem {
  friendship_id: string;
  id: string;
  uid: number;
  personal_id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
}

interface UserSearchResult {
  id: string;
  uid: number;
  personal_id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  relation: FriendRelation;
  friendship_id: string | null;
}

interface PublicProfileData {
  user: {
    id: string;
    uid: number;
    personal_id: string;
    username: string;
    role: UserRole;
    status: UserStatus;
    created_at: string;
    friend_count: number;
  };
  relation: FriendRelation;
  friendship_id: string | null;
  posts: PostItem[];
  notes: NoteItem[];
}

interface RegSuccessInfo {
  uid: number | null;
  id: string;
  username: string;
}

interface ReplyTarget {
  parentId: string;
  replyToName: string;
}

interface PwdChecks {
  len: boolean;
  upper: boolean;
  digit: boolean;
}

interface ApiErrorPayload {
  error?: string;
  banned?: boolean;
}

const MOODS = ["日常", "记录", "碎碎念", "推荐"] as const;
const TOKEN_KEY = "secr3tzl_d1_token";
const PALETTES: PaletteOption[] = [
  { key: "ocean", label: "深海蓝", color: "#3b82f6" },
  { key: "violet", label: "星云紫", color: "#8b5cf6" },
  { key: "emerald", label: "森语绿", color: "#10b981" },
  { key: "sunset", label: "暖阳橙", color: "#f97316" },
  { key: "rose", label: "绯樱粉", color: "#ec4899" },
];

const activeTab = ref<FrontendTab>("home");
const isAdminRoute = ref<boolean>(window.location.pathname.replace(/\/+$/, "") === "/admin");
const theme = ref<ThemeMode>("dark");
const palette = ref<PaletteKey>("ocean");
const clockText = ref<string>("--:--:--");
const toastMsg = ref<string>("");

const pwdVisible = ref({
  front: false,
  frontConfirm: false,
  adminLogin: false,
  adminReg: false,
  adminRegConfirm: false,
});

// 当前用户状态
const userId = ref<string | null>(null);
const userUid = ref<number | null>(null);
const userPersonalId = ref<string>("");
const personalIdChanged = ref<boolean>(false);
const userEmail = ref<string | null>(null);
const userName = ref<string>("");
const userRole = ref<UserRole>("user");
const userStatus = ref<UserStatus>("active");

// 前台认证弹窗
const showAuthModal = ref<boolean>(false);
const authMode = ref<AuthMode>("login");
const accountInput = ref<string>("");
const usernameInput = ref<string>("");
const emailInput = ref<string>("");
const passwordInput = ref<string>("");
const confirmPasswordInput = ref<string>("");
const authMsg = ref<string>("");
const authBusy = ref<boolean>(false);
const regSuccessInfo = ref<RegSuccessInfo | null>(null);

// 后台 /admin 状态
const hasAdminAccount = ref<boolean>(true);
const checkingAdminStatus = ref<boolean>(false);
const adminSubTab = ref<AdminSubTab>("users");
const adminUserQuery = ref<string>("");
const adminLoginAccount = ref<string>("");
const adminLoginPassword = ref<string>("");
const adminRegEmail = ref<string>("");
const adminRegPassword = ref<string>("");
const adminRegConfirm = ref<string>("");
const adminUsers = ref<AdminUserItem[]>([]);
const adminTotalUsers = ref<number>(0);
const loadingAdmin = ref<boolean>(false);

// 用户中心与社区数据
const profileNameInput = ref<string>("");
const savingProfile = ref<boolean>(false);
const profileIdInput = ref<string>("");
const savingPersonalId = ref<boolean>(false);
const posts = ref<PostItem[]>([]);
const notes = ref<NoteItem[]>([]);
const loadingData = ref<boolean>(true);

// 好友系统与他人主页
const friendsList = ref<FriendUserItem[]>([]);
const incomingRequests = ref<FriendUserItem[]>([]);
const outgoingRequests = ref<FriendUserItem[]>([]);
const loadingFriends = ref<boolean>(false);
const friendSearchQuery = ref<string>("");
const friendSearchResults = ref<UserSearchResult[]>([]);
const searchingUsers = ref<boolean>(false);
const hasSearchedUsers = ref<boolean>(false);

const viewingProfile = ref<PublicProfileData | null>(null);
const loadingUserProfile = ref<boolean>(false);
const profileSubTab = ref<"posts" | "notes">("posts");
const friendActionBusy = ref<boolean>(false);

// 评论与楼中楼
const openCommentPostId = ref<string | null>(null);
const postComments = ref<CommentItem[]>([]);
const loadingComments = ref<boolean>(false);
const commentInput = ref<string>("");
const replyTarget = ref<ReplyTarget | null>(null);
const submittingComment = ref<boolean>(false);

// 发帖与发日常
const noteContent = ref<string>("");
const mood = ref<string>("日常");
const noteIsPublic = ref<boolean>(true);
const publishingNote = ref<boolean>(false);
const showPostModal = ref<boolean>(false);
const postTitle = ref<string>("");
const postContent = ref<string>("");
const postIsPublic = ref<boolean>(true);
const publishingPost = ref<boolean>(false);
const readingPost = ref<PostItem | null>(null);

const isLoggedIn = computed<boolean>(() => Boolean(userId.value));
const isAdmin = computed<boolean>(
  () => userRole.value === "admin" && userStatus.value === "active"
);
const isDisabledUser = computed<boolean>(
  () => isLoggedIn.value && userStatus.value === "disabled"
);
const displayCurrentUser = computed<string>(() =>
  isLoggedIn.value ? userName.value || "用户" : "访客"
);

const publicPosts = computed<PostItem[]>(() => posts.value.filter((p) => p.is_public));
const privatePosts = computed<PostItem[]>(() =>
  posts.value.filter((p) => !p.is_public && p.is_mine)
);
const publicNotes = computed<NoteItem[]>(() => notes.value.filter((n) => n.is_public));
const privateNotes = computed<NoteItem[]>(() =>
  notes.value.filter((n) => !n.is_public && n.is_mine)
);

const filteredAdminUsers = computed<AdminUserItem[]>(() => {
  const q = adminUserQuery.value.trim().toLowerCase();
  if (!q) return adminUsers.value;
  return adminUsers.value.filter(
    (u) =>
      String(u.uid || "").includes(q) ||
      u.username.toLowerCase().includes(q) ||
      (u.personal_id || u.id).toLowerCase().includes(q)
  );
});

const restrictedUsersCount = computed<number>(
  () => adminUsers.value.filter((u) => u.status === "disabled" || u.status === "banned").length
);

const commentTree = computed<CommentNode[]>(() => {
  const roots: CommentNode[] = [];
  const replyMap = new Map<string, CommentItem[]>();
  for (const c of postComments.value) {
    if (!c.parent_id) {
      roots.push({ ...c, replies: [] });
    } else {
      const list = replyMap.get(c.parent_id) ?? [];
      list.push(c);
      replyMap.set(c.parent_id, list);
    }
  }
  for (const root of roots) {
    root.replies = replyMap.get(root.id) ?? [];
  }
  return roots;
});

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function getPwdChecks(pwd: string): PwdChecks {
  return { len: pwd.length >= 8, upper: /[A-Z]/.test(pwd), digit: /\d/.test(pwd) };
}

function checkPwdError(pwd: string, confirm: string): string {
  const c = getPwdChecks(pwd);
  if (!c.len) return "密码长度至少需要 8 位";
  if (!c.upper) return "密码必须包含至少 1 个大写字母";
  if (!c.digit) return "密码必须包含至少 1 个数字";
  if (pwd !== confirm) return "两次输入的密码不一致";
  return "";
}

const regPwdChecks = computed<PwdChecks>(() => getPwdChecks(passwordInput.value));
const adminPwdChecks = computed<PwdChecks>(() => getPwdChecks(adminRegPassword.value));

function showNotice(msg: string): void {
  toastMsg.value = msg;
  window.setTimeout(() => {
    if (toastMsg.value === msg) toastMsg.value = "";
  }, 3500);
}

function formatTime(iso: string): string {
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

function getInitials(text: string | null | undefined): string {
  return String(text || "U").slice(0, 2).toUpperCase();
}

function getStatusLabel(status: UserStatus): string {
  if (status === "banned") return "已封号";
  if (status === "disabled") return "已禁用";
  return "正常";
}

async function copyText(val: string | number | null, label: string): Promise<void> {
  const str = String(val ?? "");
  try {
    await navigator.clipboard.writeText(str);
    showNotice(`已复制${label}：${str}`);
  } catch {
    showNotice(`${label}：${str}`);
  }
}

function applyUserSession(res: AuthSessionResponse): void {
  if (res.token) localStorage.setItem(TOKEN_KEY, res.token);
  userId.value = res.id || null;
  userUid.value = res.uid ?? null;
  userPersonalId.value = res.personal_id || res.id || "";
  personalIdChanged.value = Boolean(res.personal_id_changed);
  userName.value = res.username || "";
  userEmail.value = res.email || null;
  userRole.value = res.role || "user";
  userStatus.value = res.status || "active";
  profileNameInput.value = userName.value;
  profileIdInput.value = userPersonalId.value;
}

function clearUserSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  userId.value = null;
  userUid.value = null;
  userPersonalId.value = "";
  personalIdChanged.value = false;
  userName.value = "";
  userEmail.value = null;
  userRole.value = "user";
  userStatus.value = "active";
  profileNameInput.value = "";
  profileIdInput.value = "";
  friendsList.value = [];
  incomingRequests.value = [];
  outgoingRequests.value = [];
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(path, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as T & ApiErrorPayload;
  if (!res.ok) {
    if (data.banned) clearUserSession();
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data;
}

async function fetchAllData(): Promise<void> {
  loadingData.value = true;
  try {
    const [postsData, notesData] = await Promise.all([
      apiFetch<PostItem[]>("/api/posts"),
      apiFetch<NoteItem[]>("/api/notes"),
    ]);
    posts.value = postsData;
    notes.value = notesData;
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "加载数据失败"));
  } finally {
    loadingData.value = false;
  }
}

async function fetchFriendsData(): Promise<void> {
  if (!isLoggedIn.value) return;
  loadingFriends.value = true;
  try {
    const res = await apiFetch<{
      friends: FriendUserItem[];
      incoming: FriendUserItem[];
      outgoing: FriendUserItem[];
    }>("/api/friends");
    friendsList.value = res.friends || [];
    incomingRequests.value = res.incoming || [];
    outgoingRequests.value = res.outgoing || [];
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "获取好友列表失败"));
  } finally {
    loadingFriends.value = false;
  }
}

async function openUserProfile(targetUserId: string | null | undefined): Promise<void> {
  if (!targetUserId) return;
  loadingUserProfile.value = true;
  profileSubTab.value = "posts";
  try {
    viewingProfile.value = await apiFetch<PublicProfileData>(
      `/api/users/${encodeURIComponent(targetUserId)}`
    );
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "打开个人主页失败"));
  } finally {
    loadingUserProfile.value = false;
  }
}

async function handleSearchUsers(): Promise<void> {
  const q = friendSearchQuery.value.trim();
  if (!q) {
    friendSearchResults.value = [];
    hasSearchedUsers.value = false;
    return;
  }
  searchingUsers.value = true;
  hasSearchedUsers.value = true;
  try {
    friendSearchResults.value = await apiFetch<UserSearchResult[]>(
      `/api/users/search?q=${encodeURIComponent(q)}`
    );
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "搜索用户失败"));
  } finally {
    searchingUsers.value = false;
  }
}

async function handleSendFriendRequest(targetUserId: string): Promise<void> {
  if (!isLoggedIn.value) {
    openAuthModal("login");
    authMsg.value = "请先登录后再添加好友";
    return;
  }
  friendActionBusy.value = true;
  try {
    const res = await apiFetch<{
      ok: boolean;
      relation: FriendRelation;
      friendship_id: string;
      message?: string;
    }>("/api/friends/request", {
      method: "POST",
      body: JSON.stringify({ target_user_id: targetUserId }),
    });

    if (viewingProfile.value?.user.id === targetUserId) {
      viewingProfile.value.relation = res.relation;
      viewingProfile.value.friendship_id = res.friendship_id;
      if (res.relation === "friends") {
        viewingProfile.value.user.friend_count += 1;
      }
    }
    const found = friendSearchResults.value.find((u) => u.id === targetUserId);
    if (found) {
      found.relation = res.relation;
      found.friendship_id = res.friendship_id;
    }

    showNotice(res.message || "好友申请已发送");
    await fetchFriendsData();
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "发送好友申请失败"));
  } finally {
    friendActionBusy.value = false;
  }
}

async function handleAcceptFriend(friendshipId: string, targetUserId?: string): Promise<void> {
  friendActionBusy.value = true;
  try {
    await apiFetch<{ ok: boolean; relation: FriendRelation }>(
      `/api/friends/${friendshipId}/accept`,
      { method: "POST" }
    );
    if (targetUserId && viewingProfile.value?.user.id === targetUserId) {
      viewingProfile.value.relation = "friends";
      viewingProfile.value.user.friend_count += 1;
    }
    const found = friendSearchResults.value.find((u) => u.friendship_id === friendshipId);
    if (found) found.relation = "friends";
    showNotice("已同意好友申请");
    await fetchFriendsData();
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "操作失败"));
  } finally {
    friendActionBusy.value = false;
  }
}

async function handleRemoveFriendship(
  friendshipId: string | null,
  targetUserId?: string,
  confirmText?: string
): Promise<void> {
  if (!friendshipId) return;
  if (confirmText && !window.confirm(confirmText)) return;
  friendActionBusy.value = true;
  try {
    await apiFetch<{ ok: boolean; relation: FriendRelation }>(`/api/friends/${friendshipId}`, {
      method: "DELETE",
    });
    if (targetUserId && viewingProfile.value?.user.id === targetUserId) {
      if (viewingProfile.value.relation === "friends") {
        viewingProfile.value.user.friend_count = Math.max(
          0,
          viewingProfile.value.user.friend_count - 1
        );
      }
      viewingProfile.value.relation = "none";
      viewingProfile.value.friendship_id = null;
    }
    const found = friendSearchResults.value.find((u) => u.friendship_id === friendshipId);
    if (found) {
      found.relation = "none";
      found.friendship_id = null;
    }
    showNotice("已更新好友关系");
    await fetchFriendsData();
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "操作失败"));
  } finally {
    friendActionBusy.value = false;
  }
}

async function checkSession(): Promise<void> {
  if (!localStorage.getItem(TOKEN_KEY)) {
    clearUserSession();
    return;
  }
  try {
    const res = await apiFetch<AuthSessionResponse>("/api/auth/me");
    if (res.id) {
      applyUserSession(res);
      await fetchFriendsData();
    } else {
      clearUserSession();
    }
  } catch (err: unknown) {
    clearUserSession();
    if (err instanceof Error && err.message) showNotice(err.message);
  }
}

async function fetchAdminStatus(): Promise<void> {
  checkingAdminStatus.value = true;
  try {
    const res = await apiFetch<{ hasAdmin: boolean }>("/api/admin/status");
    hasAdminAccount.value = Boolean(res.hasAdmin);
  } catch {
    hasAdminAccount.value = true;
  } finally {
    checkingAdminStatus.value = false;
  }
}

async function fetchAdminUsers(): Promise<void> {
  if (!isAdmin.value) return;
  loadingAdmin.value = true;
  try {
    const res = await apiFetch<{ total: number; users: AdminUserItem[] }>("/api/admin/users");
    adminTotalUsers.value = res.total || 0;
    adminUsers.value = res.users || [];
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "获取用户列表失败"));
  } finally {
    loadingAdmin.value = false;
  }
}

function syncRoute(): void {
  isAdminRoute.value = window.location.pathname.replace(/\/+$/, "") === "/admin";
  authMsg.value = "";
  if (isAdminRoute.value) {
    void fetchAdminStatus();
    if (isAdmin.value) void fetchAdminUsers();
  }
}

function goToPath(path: string): void {
  if (window.location.pathname !== path) window.history.pushState({}, "", path);
  syncRoute();
}

function toggleTheme(): void {
  theme.value = theme.value === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", theme.value);
  localStorage.setItem("secr3tzl_theme", theme.value);
}

function setPalette(key: PaletteKey): void {
  palette.value = key;
  document.documentElement.setAttribute("data-palette", key);
  localStorage.setItem("secr3tzl_palette", key);
}

function openAuthModal(mode: AuthMode = "login"): void {
  authMode.value = mode;
  authMsg.value = "";
  regSuccessInfo.value = null;
  passwordInput.value = "";
  confirmPasswordInput.value = "";
  pwdVisible.value.front = false;
  pwdVisible.value.frontConfirm = false;
  showAuthModal.value = true;
}

function switchAuthMode(mode: AuthMode): void {
  authMode.value = mode;
  authMsg.value = "";
  passwordInput.value = "";
  confirmPasswordInput.value = "";
  pwdVisible.value.front = false;
  pwdVisible.value.frontConfirm = false;
}

function openPostModal(defaultPublic = true): void {
  if (!isLoggedIn.value) {
    openAuthModal("login");
    authMsg.value = "请先登录后再发布帖子";
    return;
  }
  if (isDisabledUser.value) {
    showNotice("您的账号已被管理员禁用，暂无法发布帖子");
    return;
  }
  postIsPublic.value = defaultPublic;
  showPostModal.value = true;
}

async function handleFrontendAuth(): Promise<void> {
  authMsg.value = "";
  const isLogin = authMode.value === "login";

  if (isLogin) {
    if (!accountInput.value.trim() || !passwordInput.value) {
      authMsg.value = "请输入 UID、个人 ID、用户名或邮箱，以及密码";
      return;
    }
  } else {
    const name = usernameInput.value.trim();
    if (!name || name.length < 2 || name.length > 20 || /\s/.test(name)) {
      authMsg.value = "用户名需为 2~20 位非空格字符";
      return;
    }
    const pwdErr = checkPwdError(passwordInput.value, confirmPasswordInput.value);
    if (pwdErr) {
      authMsg.value = pwdErr;
      return;
    }
  }

  authBusy.value = true;
  try {
    const endpoint = isLogin ? "/api/auth/login" : "/api/auth/register";
    const payload = isLogin
      ? { account: accountInput.value.trim(), password: passwordInput.value }
      : {
          username: usernameInput.value.trim(),
          email: emailInput.value.trim() || undefined,
          password: passwordInput.value,
        };

    const res = await apiFetch<AuthSessionResponse>(endpoint, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    applyUserSession(res);
    passwordInput.value = "";
    confirmPasswordInput.value = "";
    await Promise.all([fetchAllData(), fetchFriendsData()]);

    if (isLogin) {
      showAuthModal.value = false;
      showNotice(
        res.status === "disabled"
          ? "登录成功，但您的账号当前已被禁用，暂无法发帖或互动"
          : `登录成功，欢迎回来 ${res.username}（UID: #${res.uid}）`
      );
    } else {
      regSuccessInfo.value = {
        uid: res.uid,
        id: res.personal_id || res.id || "",
        username: res.username || "",
      };
    }
  } catch (err: unknown) {
    authMsg.value = getErrorMessage(err, "操作失败，请检查输入信息");
  } finally {
    authBusy.value = false;
  }
}

async function handleAdminLogin(): Promise<void> {
  authMsg.value = "";
  if (!adminLoginAccount.value.trim() || !adminLoginPassword.value) {
    authMsg.value = "请输入管理员 UID、个人 ID、用户名或邮箱，以及密码";
    return;
  }
  authBusy.value = true;
  try {
    const res = await apiFetch<AuthSessionResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        account: adminLoginAccount.value.trim(),
        password: adminLoginPassword.value,
      }),
    });
    applyUserSession(res);
    adminLoginPassword.value = "";
    await fetchAllData();
    if (res.role === "admin" && res.status === "active") {
      showNotice(`欢迎进入控制台，${res.username}（UID: #${res.uid}）`);
      await fetchAdminUsers();
    } else if (res.status === "disabled") {
      authMsg.value = "该账号已被禁用，无法进入管理控制台";
    } else {
      authMsg.value = "登录成功，但该账号暂未获得管理员权限";
    }
  } catch (err: unknown) {
    authMsg.value = getErrorMessage(err, "登录失败");
  } finally {
    authBusy.value = false;
  }
}

async function handleAdminRegister(): Promise<void> {
  authMsg.value = "";
  const pwdErr = checkPwdError(adminRegPassword.value, adminRegConfirm.value);
  if (pwdErr) {
    authMsg.value = pwdErr;
    return;
  }
  authBusy.value = true;
  try {
    const res = await apiFetch<AuthSessionResponse>("/api/admin/register", {
      method: "POST",
      body: JSON.stringify({
        email: adminRegEmail.value.trim() || undefined,
        password: adminRegPassword.value,
      }),
    });
    applyUserSession(res);
    hasAdminAccount.value = true;
    adminRegPassword.value = "";
    adminRegConfirm.value = "";
    showNotice("🎉 默认管理员 admin（UID: #10000）创建成功！");
    await Promise.all([fetchAllData(), fetchAdminUsers()]);
  } catch (err: unknown) {
    authMsg.value = getErrorMessage(err, "注册失败");
  } finally {
    authBusy.value = false;
  }
}

async function handleLogout(): Promise<void> {
  clearUserSession();
  openCommentPostId.value = null;
  postComments.value = [];
  replyTarget.value = null;
  viewingProfile.value = null;
  if (
    activeTab.value === "private_space" ||
    activeTab.value === "profile" ||
    activeTab.value === "friends"
  ) {
    activeTab.value = "home";
  }
  showNotice("已退出登录");
  await fetchAllData();
}

async function handlePublishPost(): Promise<void> {
  if (!postTitle.value.trim() || !postContent.value.trim()) return;
  publishingPost.value = true;
  try {
    const created = await apiFetch<PostItem>("/api/posts", {
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
    showPostModal.value = false;
    activeTab.value = created.is_public ? "community" : "private_space";
    showNotice(created.is_public ? "已发布到社区" : "已保存到私密空间");
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "发布失败"));
  } finally {
    publishingPost.value = false;
  }
}

async function handleTogglePostVisibility(post: PostItem): Promise<void> {
  const nextPublic = !post.is_public;
  try {
    await apiFetch<{ ok: boolean; is_public: boolean }>(`/api/posts/${post.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_public: nextPublic }),
    });
    post.is_public = nextPublic;
    if (readingPost.value?.id === post.id) {
      readingPost.value = { ...post, is_public: nextPublic };
    }
    showNotice(nextPublic ? "帖子已转为社区公开" : "帖子已转为仅自己可见");
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "切换失败"));
  }
}

async function handleDeletePost(id: string): Promise<void> {
  try {
    await apiFetch<{ ok: boolean }>(`/api/posts/${id}`, { method: "DELETE" });
    posts.value = posts.value.filter((p) => p.id !== id);
    if (viewingProfile.value) {
      viewingProfile.value.posts = viewingProfile.value.posts.filter((p) => p.id !== id);
    }
    if (readingPost.value?.id === id) readingPost.value = null;
    if (openCommentPostId.value === id) {
      openCommentPostId.value = null;
      postComments.value = [];
      replyTarget.value = null;
    }
    showNotice("已删除帖子");
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "删除失败"));
  }
}

async function handleToggleLike(post: PostItem): Promise<void> {
  if (!isLoggedIn.value) {
    openAuthModal("login");
    authMsg.value = "请先登录后再点赞";
    return;
  }
  try {
    const res = await apiFetch<{ liked: boolean; like_count: number }>(
      `/api/posts/${post.id}/like`,
      { method: "POST" }
    );
    post.liked_by_me = res.liked;
    post.like_count = res.like_count;
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "点赞操作失败"));
  }
}

async function toggleCommentsPanel(postId: string): Promise<void> {
  if (openCommentPostId.value === postId) {
    openCommentPostId.value = null;
    postComments.value = [];
    replyTarget.value = null;
    return;
  }
  openCommentPostId.value = postId;
  commentInput.value = "";
  replyTarget.value = null;
  loadingComments.value = true;
  try {
    postComments.value = await apiFetch<CommentItem[]>(`/api/posts/${postId}/comments`);
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "加载评论失败"));
  } finally {
    loadingComments.value = false;
  }
}

function startReply(rootId: string, targetName: string): void {
  if (!isLoggedIn.value) {
    openAuthModal("login");
    authMsg.value = "请先登录后再回复评论";
    return;
  }
  if (isDisabledUser.value) {
    showNotice("您的账号已被禁用，暂无法回复评论");
    return;
  }
  replyTarget.value = { parentId: rootId, replyToName: targetName };
}

async function handleSubmitComment(post: PostItem): Promise<void> {
  if (!isLoggedIn.value) {
    openAuthModal("login");
    authMsg.value = "请先登录后再发表评论";
    return;
  }
  const content = commentInput.value.trim();
  if (!content) return;
  submittingComment.value = true;
  try {
    const payload: { content: string; parent_id?: string; reply_to_name?: string } = { content };
    if (replyTarget.value) {
      payload.parent_id = replyTarget.value.parentId;
      payload.reply_to_name = replyTarget.value.replyToName;
    }
    const created = await apiFetch<CommentItem>(`/api/posts/${post.id}/comments`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    postComments.value.push(created);
    post.comment_count = (post.comment_count || 0) + 1;
    commentInput.value = "";
    replyTarget.value = null;
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "评论失败"));
  } finally {
    submittingComment.value = false;
  }
}

async function handleToggleCommentLike(post: PostItem, commentId: string): Promise<void> {
  if (!isLoggedIn.value) {
    openAuthModal("login");
    authMsg.value = "请先登录后再给评论点赞";
    return;
  }
  try {
    const res = await apiFetch<{ liked: boolean; like_count: number }>(
      `/api/posts/${post.id}/comments/${commentId}/like`,
      { method: "POST" }
    );
    const target = postComments.value.find((c) => c.id === commentId);
    if (target) {
      target.liked_by_me = res.liked;
      target.like_count = res.like_count;
    }
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "点赞失败"));
  }
}

async function handleDeleteComment(post: PostItem, commentId: string): Promise<void> {
  try {
    const res = await apiFetch<{ ok: boolean; comment_count: number }>(
      `/api/posts/${post.id}/comments/${commentId}`,
      { method: "DELETE" }
    );
    postComments.value = postComments.value.filter(
      (c) => c.id !== commentId && c.parent_id !== commentId
    );
    post.comment_count =
      typeof res.comment_count === "number"
        ? res.comment_count
        : Math.max(0, (post.comment_count || 1) - 1);
    if (replyTarget.value?.parentId === commentId) replyTarget.value = null;
    showNotice("已删除评论");
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "删除评论失败"));
  }
}

async function handlePublishNote(): Promise<void> {
  if (!noteContent.value.trim()) return;
  publishingNote.value = true;
  try {
    const created = await apiFetch<NoteItem>("/api/notes", {
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
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "发布失败"));
  } finally {
    publishingNote.value = false;
  }
}

async function handleToggleNoteVisibility(note: NoteItem): Promise<void> {
  const nextPublic = !note.is_public;
  try {
    await apiFetch<{ ok: boolean; is_public: boolean }>(`/api/notes/${note.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_public: nextPublic }),
    });
    note.is_public = nextPublic;
    showNotice(nextPublic ? "日常已转为公开" : "日常已设为仅自己可见");
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "切换失败"));
  }
}

async function handleDeleteNote(id: string): Promise<void> {
  try {
    await apiFetch<{ ok: boolean }>(`/api/notes/${id}`, { method: "DELETE" });
    notes.value = notes.value.filter((n) => n.id !== id);
    if (viewingProfile.value) {
      viewingProfile.value.notes = viewingProfile.value.notes.filter((n) => n.id !== id);
    }
    showNotice("已删除日常");
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "删除失败"));
  }
}

async function handleUpdateUsername(): Promise<void> {
  const nextName = profileNameInput.value.trim();
  if (!nextName || nextName.length < 2 || nextName.length > 20 || /\s/.test(nextName)) {
    showNotice("用户名需为 2~20 位非空格字符");
    return;
  }
  savingProfile.value = true;
  try {
    const res = await apiFetch<{ ok: boolean; username: string }>("/api/user/profile", {
      method: "PATCH",
      body: JSON.stringify({ username: nextName }),
    });
    userName.value = res.username;
    showNotice("用户名已更新");
    await fetchAllData();
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "更新失败"));
  } finally {
    savingProfile.value = false;
  }
}

async function handleUpdatePersonalId(): Promise<void> {
  const nextId = profileIdInput.value.trim();
  if (!/^[a-zA-Z0-9_-]{3,24}$/.test(nextId)) {
    showNotice("个人 ID 需为 3~24 位字母、数字、下划线或短横线");
    return;
  }
  if (!window.confirm(`确认将个人 ID 修改为「${nextId}」吗？修改后将无法再次更改。`)) {
    return;
  }
  savingPersonalId.value = true;
  try {
    const res = await apiFetch<{ ok: boolean; personal_id: string; personal_id_changed: boolean }>(
      "/api/user/personal-id",
      {
        method: "PATCH",
        body: JSON.stringify({ personal_id: nextId }),
      }
    );
    userPersonalId.value = res.personal_id;
    personalIdChanged.value = true;
    profileIdInput.value = res.personal_id;
    showNotice("个人 ID 修改成功（唯一修改机会已使用）");
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "修改个人 ID 失败"));
  } finally {
    savingPersonalId.value = false;
  }
}

async function handleToggleUserRole(targetUser: AdminUserItem): Promise<void> {
  const nextRole: UserRole = targetUser.role === "admin" ? "user" : "admin";
  try {
    await apiFetch<{ ok: boolean; role: UserRole }>(`/api/admin/users/${targetUser.id}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role: nextRole }),
    });
    targetUser.role = nextRole;
    showNotice(
      nextRole === "admin"
        ? `已授予 ${targetUser.username} (#${targetUser.uid}) 管理员权限`
        : `已取消 ${targetUser.username} (#${targetUser.uid}) 的管理员权限`
    );
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "权限修改失败"));
  }
}

async function handleSetUserStatus(
  targetUser: AdminUserItem,
  nextStatus: UserStatus
): Promise<void> {
  const actionMap: Record<UserStatus, string> = {
    banned: `封号（将禁止 ${targetUser.username} 登录并强制下线）`,
    disabled: `禁用（将禁止 ${targetUser.username} 发帖、评论与点赞）`,
    active: `解禁（恢复 ${targetUser.username} 为正常状态）`,
  };
  if (nextStatus === "banned") {
    if (!window.confirm(`确认对用户「${targetUser.username} (#${targetUser.uid})」执行封号吗？`)) {
      return;
    }
  }
  try {
    await apiFetch<{ ok: boolean; status: UserStatus }>(
      `/api/admin/users/${targetUser.id}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      }
    );
    targetUser.status = nextStatus;
    showNotice(`已执行：${actionMap[nextStatus]}`);
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "状态更新失败"));
  }
}

let timer: number | null = null;
onMounted(async () => {
  const savedTheme = localStorage.getItem("secr3tzl_theme");
  theme.value = savedTheme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", theme.value);

  const savedPalette = localStorage.getItem("secr3tzl_palette");
  const matched = PALETTES.find((p) => p.key === savedPalette);
  palette.value = matched ? matched.key : "ocean";
  document.documentElement.setAttribute("data-palette", palette.value);

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
  if (timer !== null) window.clearInterval(timer);
  window.removeEventListener("popstate", syncRoute);
});
</script>

<template>
  <!-- 独立 /admin 管理控制台 -->
  <div v-if="isAdminRoute" class="console-shell">
    <aside class="console-sidebar">
      <div class="console-brand">
        <span class="console-logo">ADM</span>
        <div>
          <div class="console-brand-title">后台管理控制台</div>
          <div class="console-brand-sub">独立路由 · /admin</div>
        </div>
      </div>

      <nav v-if="isLoggedIn && isAdmin" class="console-nav">
        <button
          type="button"
          class="console-nav-item"
          :class="{ active: adminSubTab === 'users' }"
          @click="adminSubTab = 'users'; fetchAdminUsers()"
        >
          👥 用户与风控管理
        </button>
        <button
          type="button"
          class="console-nav-item"
          :class="{ active: adminSubTab === 'posts' }"
          @click="adminSubTab = 'posts'; fetchAllData()"
        >
          🛡️ 社区公开内容审核
        </button>
      </nav>

      <div class="console-sidebar-footer">
        <div class="palette-picker" style="justify-content: center" title="切换整页背景色系">
          <button
            v-for="p in PALETTES"
            :key="p.key"
            type="button"
            class="palette-dot"
            :class="{ active: palette === p.key }"
            :style="{ background: p.color }"
            :title="p.label"
            @click="setPalette(p.key)"
          />
        </div>
        <button type="button" class="console-side-btn" @click="toggleTheme">
          {{ theme === "dark" ? "☀️ 切换浅色主题" : "🌙 切换深色主题" }}
        </button>
        <button type="button" class="console-side-btn" @click="goToPath('/')">
          ← 返回社区前台
        </button>
        <button
          v-if="isLoggedIn"
          type="button"
          class="console-side-btn danger"
          @click="handleLogout"
        >
          退出登录 ({{ displayCurrentUser }})
        </button>
      </div>
    </aside>

    <section class="console-main">
      <header class="console-header">
        <div>
          <h1 style="font-size: 19px; font-weight: 700">
            {{
              !isLoggedIn
                ? "管理员身份验证"
                : !isAdmin
                ? "权限不足"
                : adminSubTab === "users"
                ? "全部用户、UID 与封禁管理"
                : "社区公开内容审核"
            }}
          </h1>
          <p class="card-meta">
            {{
              isLoggedIn
                ? `当前登录：${displayCurrentUser} · UID #${userUid ?? "-"} · 个人 ID ${userPersonalId}`
                : "仅限管理员账号访问 /admin"
            }}
          </p>
        </div>
      </header>

      <div v-if="toastMsg" class="notice-bar">
        <span>{{ toastMsg }}</span>
      </div>

      <!-- 1. 未登录 -->
      <div v-if="!isLoggedIn" class="console-auth-box">
        <div v-if="checkingAdminStatus" class="empty-state">检查后台初始化状态...</div>

        <template v-else-if="!hasAdminAccount">
          <h2 class="section-title">初始化注册系统管理员</h2>
          <p class="section-sub" style="margin: 4px 0 16px">
            首次进入后台，请创建默认管理员 <strong>admin</strong>（专属 UID #10000）
          </p>
          <form class="col-gap" @submit.prevent="handleAdminRegister">
            <input type="text" class="field-input" value="admin（系统默认管理员）" disabled />
            <input
              v-model="adminRegEmail"
              type="email"
              class="field-input"
              placeholder="绑定邮箱（选填）"
            />
            <div class="pwd-field">
              <input
                v-model="adminRegPassword"
                :type="pwdVisible.adminReg ? 'text' : 'password'"
                class="field-input"
                placeholder="设置管理员密码（≥8 位，含大写字母和数字）"
              />
              <button
                type="button"
                class="pwd-toggle"
                @click="pwdVisible.adminReg = !pwdVisible.adminReg"
              >
                {{ pwdVisible.adminReg ? "🙈" : "👁️" }}
              </button>
            </div>
            <div class="pwd-field">
              <input
                v-model="adminRegConfirm"
                :type="pwdVisible.adminRegConfirm ? 'text' : 'password'"
                class="field-input"
                placeholder="再次确认密码"
              />
              <button
                type="button"
                class="pwd-toggle"
                @click="pwdVisible.adminRegConfirm = !pwdVisible.adminRegConfirm"
              >
                {{ pwdVisible.adminRegConfirm ? "🙈" : "👁️" }}
              </button>
            </div>
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
              {{ authBusy ? "创建中..." : "创建 admin 并进入后台" }}
            </button>
          </form>
        </template>

        <template v-else>
          <h2 class="section-title">管理员登录</h2>
          <p class="section-sub" style="margin: 4px 0 16px">
            支持使用管理员 UID（如 10000）、个人 ID、用户名（admin）或邮箱登录
          </p>
          <form class="col-gap" @submit.prevent="handleAdminLogin">
            <input
              v-model="adminLoginAccount"
              type="text"
              class="field-input"
              placeholder="UID / 个人 ID / 用户名 / 邮箱"
            />
            <div class="pwd-field">
              <input
                v-model="adminLoginPassword"
                :type="pwdVisible.adminLogin ? 'text' : 'password'"
                class="field-input"
                placeholder="登录密码"
              />
              <button
                type="button"
                class="pwd-toggle"
                @click="pwdVisible.adminLogin = !pwdVisible.adminLogin"
              >
                {{ pwdVisible.adminLogin ? "🙈" : "👁️" }}
              </button>
            </div>
            <p v-if="authMsg" class="auth-msg">{{ authMsg }}</p>
            <button type="submit" class="btn-primary" :disabled="authBusy">
              {{ authBusy ? "登录中..." : "登录控制台" }}
            </button>
          </form>
        </template>
      </div>

      <!-- 2. 已登录但非管理员 -->
      <div v-else-if="!isAdmin" class="console-auth-box">
        <h2 class="section-title">无权访问管理控制台</h2>
        <p class="section-sub" style="margin: 8px 0 18px">
          账号 {{ displayCurrentUser }}（UID #{{ userUid }}）目前无有效管理员权限。
        </p>
        <div class="row-gap">
          <button type="button" class="btn-primary" @click="handleLogout">切换管理员账号</button>
          <button type="button" class="btn-ghost" @click="goToPath('/')">返回社区前台</button>
        </div>
      </div>

      <!-- 3. 管理员已登录 -->
      <template v-else>
        <div class="console-metrics console-metrics-4">
          <div class="console-metric-card">
            <span class="stat-label">注册用户总数</span>
            <strong class="stat-num">{{ adminTotalUsers }}</strong>
          </div>
          <div class="console-metric-card">
            <span class="stat-label">管理员人数</span>
            <strong class="stat-num">{{ adminUsers.filter((u) => u.role === "admin").length }}</strong>
          </div>
          <div class="console-metric-card">
            <span class="stat-label">禁用 / 封号数</span>
            <strong class="stat-num" style="color: var(--danger)">{{ restrictedUsersCount }}</strong>
          </div>
          <div class="console-metric-card">
            <span class="stat-label">社区公开帖子</span>
            <strong class="stat-num">{{ publicPosts.length }}</strong>
          </div>
        </div>

        <div v-if="adminSubTab === 'users'" class="console-panel">
          <div class="section-header">
            <div>
              <h3 class="section-title">用户、权限与账号风控</h3>
              <p class="section-sub">
                禁用：限制发帖/评论/点赞 · 封号：强制下线并禁止登录 · 解禁：恢复正常
              </p>
            </div>
            <div class="row-gap">
              <input
                v-model="adminUserQuery"
                type="text"
                class="field-input"
                style="width: 220px; padding: 6px 12px"
                placeholder="搜索 UID / 用户名 / 个人 ID..."
              />
              <button type="button" class="btn-mini" @click="fetchAdminUsers">刷新</button>
            </div>
          </div>

          <div v-if="loadingAdmin" class="empty-state">加载用户数据中...</div>
          <div v-else class="console-table-wrap">
            <table class="console-table">
              <thead>
                <tr>
                  <th>专属 UID</th>
                  <th>用户名</th>
                  <th>个人 ID</th>
                  <th>角色</th>
                  <th>账号状态</th>
                  <th>注册时间</th>
                  <th>管理操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="u in filteredAdminUsers" :key="u.id">
                  <td><span class="uid-tag">#{{ u.uid }}</span></td>
                  <td>
                    <strong>{{ u.username }}</strong>
                    <div v-if="u.email" class="card-meta">{{ u.email }}</div>
                  </td>
                  <td><code class="id-code">{{ u.personal_id || u.id }}</code></td>
                  <td>
                    <span class="vis-badge" :class="u.role === 'admin' ? 'public' : 'private'">
                      {{ u.role === "admin" ? "管理员" : "普通用户" }}
                    </span>
                  </td>
                  <td>
                    <span class="status-badge" :class="u.status">
                      {{ getStatusLabel(u.status) }}
                    </span>
                  </td>
                  <td>{{ formatTime(u.created_at) }}</td>
                  <td>
                    <div v-if="u.id !== userId && u.id !== 'admin_root'" class="row-gap">
                      <button type="button" class="btn-mini" @click="handleToggleUserRole(u)">
                        {{ u.role === "admin" ? "取消管理" : "设为管理" }}
                      </button>
                      <button
                        v-if="u.status === 'active'"
                        type="button"
                        class="btn-warn-sm"
                        @click="handleSetUserStatus(u, 'disabled')"
                      >
                        禁用
                      </button>
                      <button
                        v-if="u.status !== 'banned'"
                        type="button"
                        class="btn-danger-sm"
                        @click="handleSetUserStatus(u, 'banned')"
                      >
                        封号
                      </button>
                      <button
                        v-if="u.status === 'disabled' || u.status === 'banned'"
                        type="button"
                        class="btn-ok-sm"
                        @click="handleSetUserStatus(u, 'active')"
                      >
                        解禁
                      </button>
                    </div>
                    <span v-else class="card-meta">
                      {{ u.id === "admin_root" ? "系统默认管理员" : "当前账号" }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-if="adminSubTab === 'posts'" class="console-panel">
          <div class="section-header">
            <div>
              <h3 class="section-title">社区公开帖子审核</h3>
              <p class="section-sub">管理员可直接删除社区中的违规公开帖子（他人私密内容不可见）</p>
            </div>
            <button type="button" class="btn-mini" @click="fetchAllData">刷新列表</button>
          </div>

          <div v-if="publicPosts.length === 0" class="empty-state">暂无社区公开帖子</div>
          <div v-else class="console-table-wrap">
            <table class="console-table">
              <thead>
                <tr>
                  <th>标题</th>
                  <th>作者 / UID</th>
                  <th>互动</th>
                  <th>发布时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="post in publicPosts" :key="post.id">
                  <td><strong>{{ post.title }}</strong></td>
                  <td>
                    {{ post.author_name }}
                    <span v-if="post.author_uid" class="uid-tag" style="margin-left: 6px">#{{ post.author_uid }}</span>
                  </td>
                  <td>❤️ {{ post.like_count }} · 💬 {{ post.comment_count }}</td>
                  <td>{{ formatTime(post.created_at) }}</td>
                  <td>
                    <div class="row-gap">
                      <button type="button" class="btn-mini" @click="readingPost = post">查看</button>
                      <button type="button" class="btn-danger-sm" @click="handleDeletePost(post.id)">删除违规</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </section>
  </div>

  <!-- 前台社区主界面 -->
  <div v-else class="site-wrapper">
    <div class="nav-wrap">
      <header class="glass-nav">
        <button type="button" class="brand-btn" @click="activeTab = 'home'">
          <span class="brand-avatar">{{ getInitials(displayCurrentUser) }}</span>
          <span>欢迎您，{{ displayCurrentUser }}</span>
          <span v-if="isLoggedIn && userUid" class="uid-tag">#{{ userUid }}</span>
        </button>

        <nav class="nav-links" aria-label="主导航">
          <button type="button" class="nav-pill" :class="{ active: activeTab === 'home' }" @click="activeTab = 'home'">
            首页
          </button>
          <button type="button" class="nav-pill" :class="{ active: activeTab === 'community' }" @click="activeTab = 'community'">
            社区
          </button>
          <button type="button" class="nav-pill" :class="{ active: activeTab === 'moments' }" @click="activeTab = 'moments'">
            日常动态
          </button>
          <button
            type="button"
            class="nav-pill"
            :class="{ active: activeTab === 'friends' }"
            @click="activeTab = 'friends'; if (isLoggedIn) fetchFriendsData()"
          >
            👥 好友
            <span v-if="incomingRequests.length > 0" class="badge-dot">{{ incomingRequests.length }}</span>
          </button>
          <button type="button" class="nav-pill" :class="{ active: activeTab === 'private_space' }" @click="activeTab = 'private_space'">
            🔒 私密空间
          </button>
          <button
            v-if="isLoggedIn"
            type="button"
            class="nav-pill"
            :class="{ active: activeTab === 'profile' }"
            @click="profileNameInput = displayCurrentUser; profileIdInput = userPersonalId; activeTab = 'profile'"
          >
            用户中心
          </button>
          <button v-if="isAdmin" type="button" class="nav-pill" @click="goToPath('/admin')">
            🛡️ 管理后台
          </button>
        </nav>

        <div class="nav-actions">
          <button type="button" class="upload-blog-btn" @click="openPostModal(true)">
            ＋ 发布帖子
          </button>
          <div class="palette-picker" title="切换整页背景色系">
            <button
              v-for="p in PALETTES"
              :key="p.key"
              type="button"
              class="palette-dot"
              :class="{ active: palette === p.key }"
              :style="{ background: p.color }"
              :title="p.label"
              @click="setPalette(p.key)"
            />
          </div>
          <button type="button" class="icon-btn" title="切换深浅色主题" @click="toggleTheme">
            {{ theme === "dark" ? "☀️" : "🌙" }}
          </button>
          <button v-if="isLoggedIn" type="button" class="icon-btn" @click="handleLogout">
            退出 ({{ displayCurrentUser }})
          </button>
          <button v-else type="button" class="icon-btn" @click="openAuthModal('login')">
            登录 / 注册
          </button>
        </div>
      </header>
    </div>

    <main class="main-container">
      <div v-if="isDisabledUser" class="warn-bar">
        <span>⚠️ 您的账号当前已被管理员禁用，暂无法发布帖子、日常、评论、点赞或修改资料。</span>
      </div>

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
                <p class="hero-subtitle">社区交流、日常动态、好友互动与私密空间</p>
              </div>
            </div>
            <div class="tag-row">
              <span class="tag-chip"><span class="status-dot" />社区运行中</span>
              <span v-if="isLoggedIn && userUid" class="tag-chip">专属 UID：#{{ userUid }}</span>
              <span v-if="isLoggedIn && userPersonalId" class="tag-chip">个人 ID：{{ userPersonalId }}</span>
              <span v-if="isLoggedIn" class="tag-chip">好友：{{ friendsList.length }} 人</span>
              <span v-else class="tag-chip">点击右上角登录获取专属 UID</span>
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
                <div class="stat-label">社区帖子</div>
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
              <h2 class="section-title">社区 · 最新帖子</h2>
              <p class="section-sub">点击用户昵称可查看对方个人主页并添加好友</p>
            </div>
            <button type="button" class="link-btn" @click="activeTab = 'community'">进入社区 →</button>
          </div>

          <div v-if="loadingData" class="empty-state">加载中...</div>
          <div v-else-if="publicPosts.length === 0" class="empty-state">
            社区还没有帖子，点击右上角「＋ 发布帖子」发第一条吧~
          </div>
          <div v-else class="blog-grid">
            <article v-for="post in publicPosts.slice(0, 4)" :key="post.id" class="blog-card" @click="readingPost = post">
              <div>
                <div class="card-meta" style="margin-bottom: 8px">
                  <span class="vis-badge public">🌐 社区公开</span>
                  <button
                    type="button"
                    class="user-link-btn"
                    @click.stop="openUserProfile(post.author_id)"
                  >
                    {{ post.author_name }}
                    <span v-if="post.author_uid" class="uid-tag">#{{ post.author_uid }}</span>
                  </button>
                </div>
                <h3 class="blog-title">{{ post.title }}</h3>
                <p class="blog-excerpt">{{ post.content }}</p>
              </div>
              <div class="card-meta">
                <span>{{ formatTime(post.created_at) }}</span>
                <span>❤️ {{ post.like_count }} · 💬 {{ post.comment_count }}</span>
              </div>
            </article>
          </div>
        </section>

        <section class="glass-card">
          <div class="section-header">
            <h2 class="section-title">最新日常 · Moments</h2>
            <button type="button" class="link-btn" @click="activeTab = 'moments'">查看全部 / 发布 →</button>
          </div>

          <div v-if="loadingData" class="empty-state">加载中...</div>
          <div v-else-if="publicNotes.length === 0" class="empty-state">还没有公开日常~</div>
          <div v-else class="feed-list">
            <div v-for="note in publicNotes.slice(0, 3)" :key="note.id" class="moment-card">
              <div class="card-meta">
                <div class="row-gap">
                  <span class="mood-badge">{{ note.mood || "日常" }}</span>
                  <button
                    type="button"
                    class="user-link-btn"
                    @click="openUserProfile(note.author_id)"
                  >
                    {{ note.author_name }}
                    <span v-if="note.author_uid" class="uid-tag">#{{ note.author_uid }}</span>
                  </button>
                </div>
                <span>{{ formatTime(note.created_at) }}</span>
              </div>
              <p class="card-text">{{ note.content }}</p>
            </div>
          </div>
        </section>
      </template>

      <!-- 2. 社区广场 -->
      <section v-if="activeTab === 'community'" class="glass-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">社区广场</h2>
            <p class="section-sub">点击任意用户头像或昵称可打开主页，共 {{ publicPosts.length }} 篇帖子</p>
          </div>
          <button type="button" class="btn-primary" @click="openPostModal(true)">＋ 发布帖子</button>
        </div>

        <div v-if="loadingData" class="empty-state">加载中...</div>
        <div v-else-if="publicPosts.length === 0" class="empty-state">
          社区暂时空空的，点击上方「＋ 发布帖子」发第一篇吧~
        </div>
        <div v-else class="pyq-feed">
          <article v-for="post in publicPosts" :key="post.id" class="pyq-item">
            <button
              type="button"
              class="pyq-avatar clickable-avatar"
              title="查看个人主页"
              @click="openUserProfile(post.author_id)"
            >
              {{ getInitials(post.author_name) }}
            </button>
            <div class="pyq-body">
              <div class="pyq-top">
                <div class="row-gap">
                  <button
                    type="button"
                    class="pyq-author user-link-btn"
                    @click="openUserProfile(post.author_id)"
                  >
                    {{ post.author_name }}
                  </button>
                  <span v-if="post.author_uid" class="uid-tag">#{{ post.author_uid }}</span>
                </div>
                <span class="vis-badge public">🌐 公开</span>
              </div>

              <h3 class="pyq-title" @click="readingPost = post">{{ post.title }}</h3>
              <p class="pyq-content clamped">{{ post.content }}</p>

              <div class="pyq-footer">
                <span>{{ formatTime(post.created_at) }}</span>
                <div class="pyq-actions">
                  <button
                    type="button"
                    class="btn-mini like-btn"
                    :class="{ liked: post.liked_by_me }"
                    @click="handleToggleLike(post)"
                  >
                    {{ post.liked_by_me ? "❤️" : "🤍" }} {{ post.like_count }}
                  </button>
                  <button type="button" class="btn-mini" @click="toggleCommentsPanel(post.id)">
                    💬 {{ post.comment_count }}
                  </button>
                  <button type="button" class="btn-mini" @click="readingPost = post">展开全文</button>
                  <button v-if="post.is_mine" type="button" class="btn-mini" @click="handleTogglePostVisibility(post)">
                    设为私密
                  </button>
                  <button v-if="post.is_mine || isAdmin" type="button" class="btn-danger-sm" @click="handleDeletePost(post.id)">
                    {{ post.is_mine ? "删除" : "管理员删除" }}
                  </button>
                </div>
              </div>

              <!-- 评论区（含楼中楼与评论点赞） -->
              <div v-if="openCommentPostId === post.id" class="comment-box">
                <div v-if="loadingComments" class="card-meta">加载评论中...</div>
                <div v-else-if="commentTree.length === 0" class="card-meta">
                  暂无评论，来抢个沙发吧~
                </div>
                <div v-else class="comment-list">
                  <div v-for="c in commentTree" :key="c.id" class="comment-item">
                    <div class="card-meta">
                      <div class="row-gap">
                        <button
                          type="button"
                          class="user-link-btn"
                          style="font-weight: 700; color: var(--text-main)"
                          @click="openUserProfile(c.user_id)"
                        >
                          {{ c.author_name }}
                        </button>
                        <span v-if="c.author_uid" class="uid-tag">#{{ c.author_uid }}</span>
                        <span>{{ formatTime(c.created_at) }}</span>
                      </div>
                      <div class="row-gap">
                        <button
                          type="button"
                          class="btn-mini like-btn"
                          :class="{ liked: c.liked_by_me }"
                          @click="handleToggleCommentLike(post, c.id)"
                        >
                          {{ c.liked_by_me ? "❤️" : "🤍" }} {{ c.like_count }}
                        </button>
                        <button type="button" class="btn-mini" @click="startReply(c.id, c.author_name)">
                          回复
                        </button>
                        <button
                          v-if="c.is_mine || isAdmin"
                          type="button"
                          class="btn-danger-sm"
                          @click="handleDeleteComment(post, c.id)"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                    <p class="comment-text">{{ c.content }}</p>

                    <div v-if="c.replies.length > 0" class="reply-list">
                      <div v-for="r in c.replies" :key="r.id" class="reply-item">
                        <div class="card-meta">
                          <div class="row-gap">
                            <button
                              type="button"
                              class="user-link-btn"
                              style="font-weight: 700; color: var(--text-main)"
                              @click="openUserProfile(r.user_id)"
                            >
                              {{ r.author_name }}
                            </button>
                            <span v-if="r.author_uid" class="uid-tag">#{{ r.author_uid }}</span>
                            <span v-if="r.reply_to_name" class="reply-at">回复 @{{ r.reply_to_name }}</span>
                            <span>{{ formatTime(r.created_at) }}</span>
                          </div>
                          <div class="row-gap">
                            <button
                              type="button"
                              class="btn-mini like-btn"
                              :class="{ liked: r.liked_by_me }"
                              @click="handleToggleCommentLike(post, r.id)"
                            >
                              {{ r.liked_by_me ? "❤️" : "🤍" }} {{ r.like_count }}
                            </button>
                            <button type="button" class="btn-mini" @click="startReply(c.id, r.author_name)">
                              回复
                            </button>
                            <button
                              v-if="r.is_mine || isAdmin"
                              type="button"
                              class="btn-danger-sm"
                              @click="handleDeleteComment(post, r.id)"
                            >
                              删除
                            </button>
                          </div>
                        </div>
                        <p class="comment-text">{{ r.content }}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div v-if="replyTarget" class="replying-bar">
                  <span>正在回复 <strong>@{{ replyTarget.replyToName }}</strong></span>
                  <button type="button" class="btn-mini" @click="replyTarget = null">取消回复</button>
                </div>

                <form class="comment-form" @submit.prevent="handleSubmitComment(post)">
                  <input
                    v-model="commentInput"
                    type="text"
                    maxlength="500"
                    class="field-input"
                    :disabled="isDisabledUser"
                    :placeholder="
                      !isLoggedIn
                        ? '登录后即可发表评论'
                        : isDisabledUser
                        ? '账号已被禁用，暂无法评论'
                        : replyTarget
                        ? `回复 @${replyTarget.replyToName}...`
                        : '写下你的评论...'
                    "
                  />
                  <button
                    type="submit"
                    class="btn-primary"
                    style="white-space: nowrap; padding: 8px 14px"
                    :disabled="submittingComment || !commentInput.trim() || isDisabledUser"
                  >
                    {{ submittingComment ? "发送中" : replyTarget ? "回复" : "评论" }}
                  </button>
                </form>
              </div>
            </div>
          </article>
        </div>
      </section>

      <!-- 3. 日常动态 -->
      <section v-if="activeTab === 'moments'" class="glass-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">日常动态 · Moments</h2>
            <p class="section-sub">分享短动态，发布时可自由选择公开或仅自己可见</p>
          </div>
          <span class="card-meta">共 {{ publicNotes.length }} 条公开动态</span>
        </div>

        <form v-if="isLoggedIn" class="composer-form" @submit.prevent="handlePublishNote">
          <textarea
            v-model="noteContent"
            class="field-textarea"
            :disabled="isDisabledUser"
            :placeholder="isDisabledUser ? '账号已被禁用，暂无法发布日常' : '此刻在想什么？记录一条日常...'"
          />
          <div class="mood-bar">
            <div class="mood-pills">
              <button v-for="m in MOODS" :key="m" type="button" class="mood-pill" :class="{ active: mood === m }" @click="mood = m">
                {{ m }}
              </button>
            </div>
            <div class="row-gap">
              <button type="button" class="btn-mini" @click="noteIsPublic = !noteIsPublic">
                {{ noteIsPublic ? "🌐 公开可见" : "🔒 仅自己可见" }}
              </button>
              <button
                type="submit"
                class="btn-primary"
                :disabled="publishingNote || !noteContent.trim() || isDisabledUser"
              >
                {{ publishingNote ? "发布中..." : "发布动态" }}
              </button>
            </div>
          </div>
        </form>

        <div v-else class="notice-bar" style="margin-bottom: 20px">
          <span>登录后即可发布日常动态</span>
          <button type="button" class="btn-primary" @click="openAuthModal('login')">立即登录</button>
        </div>

        <div v-if="publicNotes.length === 0" class="empty-state">暂无公开动态</div>
        <div v-else class="feed-list">
          <div v-for="note in publicNotes" :key="note.id" class="moment-card">
            <div class="card-meta">
              <div class="row-gap">
                <span class="mood-badge">{{ note.mood || "日常" }}</span>
                <button
                  type="button"
                  class="user-link-btn"
                  @click="openUserProfile(note.author_id)"
                >
                  {{ note.author_name }}
                </button>
                <span v-if="note.author_uid" class="uid-tag">#{{ note.author_uid }}</span>
              </div>
              <div class="row-gap">
                <span>{{ formatTime(note.created_at) }}</span>
                <button v-if="note.is_mine" type="button" class="btn-mini" @click="handleToggleNoteVisibility(note)">
                  设为私密
                </button>
                <button v-if="note.is_mine || isAdmin" type="button" class="btn-danger-sm" @click="handleDeleteNote(note.id)">
                  {{ note.is_mine ? "删除" : "管理员删除" }}
                </button>
              </div>
            </div>
            <p class="card-text">{{ note.content }}</p>
          </div>
        </div>
      </section>

      <!-- 4. 好友中心 -->
      <section v-if="activeTab === 'friends'" class="glass-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">👥 好友与找人</h2>
            <p class="section-sub">通过 UID、个人 ID 或用户名查找用户，查看对方主页并管理好友关系</p>
          </div>
          <button v-if="isLoggedIn" type="button" class="btn-mini" @click="fetchFriendsData">刷新</button>
        </div>

        <!-- 搜索用户框（访客也可搜索并查看他人主页） -->
        <form class="row-gap" style="margin-bottom: 18px" @submit.prevent="handleSearchUsers">
          <input
            v-model="friendSearchQuery"
            type="text"
            class="field-input"
            style="flex: 1"
            placeholder="输入 UID（如 10001）、个人 ID 或用户名搜索..."
          />
          <button type="submit" class="btn-primary" style="white-space: nowrap" :disabled="searchingUsers">
            {{ searchingUsers ? "搜索中..." : "搜索用户" }}
          </button>
        </form>

        <div v-if="hasSearchedUsers" style="margin-bottom: 24px">
          <h3 class="sub-heading">搜索结果（{{ friendSearchResults.length }} 人）</h3>
          <div v-if="friendSearchResults.length === 0" class="empty-state">
            没有找到匹配的用户，试试输入完整的 UID 或个人 ID
          </div>
          <div v-else class="friend-grid">
            <div v-for="u in friendSearchResults" :key="u.id" class="friend-card">
              <div class="row-gap" style="min-width: 0">
                <button type="button" class="pyq-avatar clickable-avatar" @click="openUserProfile(u.id)">
                  {{ getInitials(u.username) }}
                </button>
                <div style="min-width: 0">
                  <div class="row-gap">
                    <button type="button" class="user-link-btn" style="font-weight: 700; font-size: 15px" @click="openUserProfile(u.id)">
                      {{ u.username }}
                    </button>
                    <span class="uid-tag">#{{ u.uid }}</span>
                  </div>
                  <div class="card-meta">个人 ID：{{ u.personal_id }}</div>
                </div>
              </div>

              <div class="row-gap">
                <button type="button" class="btn-mini" @click="openUserProfile(u.id)">主页</button>
                <span v-if="u.relation === 'self'" class="card-meta">我自己</span>
                <span v-else-if="u.relation === 'friends'" class="vis-badge public">✓ 已是好友</span>
                <span v-else-if="u.relation === 'outgoing_pending'" class="vis-badge private">已申请</span>
                <button
                  v-else-if="u.relation === 'incoming_pending' && u.friendship_id"
                  type="button"
                  class="btn-ok-sm"
                  :disabled="friendActionBusy"
                  @click="handleAcceptFriend(u.friendship_id, u.id)"
                >
                  同意申请
                </button>
                <button
                  v-else
                  type="button"
                  class="btn-primary"
                  style="padding: 5px 12px; font-size: 12px"
                  :disabled="friendActionBusy"
                  @click="handleSendFriendRequest(u.id)"
                >
                  ＋ 加好友
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!isLoggedIn" class="notice-bar">
          <span>登录后即可添加好友、处理好友申请并管理你的好友列表</span>
          <button type="button" class="btn-primary" @click="openAuthModal('login')">立即登录</button>
        </div>

        <div v-else class="col-gap" style="gap: 22px">
          <!-- 收到的好友申请 -->
          <div v-if="incomingRequests.length > 0">
            <h3 class="sub-heading">📩 新的好友申请（{{ incomingRequests.length }}）</h3>
            <div class="friend-grid">
              <div v-for="req in incomingRequests" :key="req.friendship_id" class="friend-card">
                <div class="row-gap">
                  <button type="button" class="pyq-avatar clickable-avatar" @click="openUserProfile(req.id)">
                    {{ getInitials(req.username) }}
                  </button>
                  <div>
                    <div class="row-gap">
                      <button type="button" class="user-link-btn" style="font-weight: 700" @click="openUserProfile(req.id)">
                        {{ req.username }}
                      </button>
                      <span class="uid-tag">#{{ req.uid }}</span>
                    </div>
                    <div class="card-meta">申请于 {{ formatTime(req.created_at) }}</div>
                  </div>
                </div>
                <div class="row-gap">
                  <button
                    type="button"
                    class="btn-ok-sm"
                    :disabled="friendActionBusy"
                    @click="handleAcceptFriend(req.friendship_id, req.id)"
                  >
                    同意
                  </button>
                  <button
                    type="button"
                    class="btn-danger-sm"
                    :disabled="friendActionBusy"
                    @click="handleRemoveFriendship(req.friendship_id, req.id)"
                  >
                    拒绝
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 我发出的待确认申请 -->
          <div v-if="outgoingRequests.length > 0">
            <h3 class="sub-heading">⏳ 我发出的申请（{{ outgoingRequests.length }}）</h3>
            <div class="friend-grid">
              <div v-for="out in outgoingRequests" :key="out.friendship_id" class="friend-card">
                <div class="row-gap">
                  <button type="button" class="pyq-avatar clickable-avatar" @click="openUserProfile(out.id)">
                    {{ getInitials(out.username) }}
                  </button>
                  <div>
                    <div class="row-gap">
                      <button type="button" class="user-link-btn" style="font-weight: 700" @click="openUserProfile(out.id)">
                        {{ out.username }}
                      </button>
                      <span class="uid-tag">#{{ out.uid }}</span>
                    </div>
                    <div class="card-meta">等待对方确认</div>
                  </div>
                </div>
                <button
                  type="button"
                  class="btn-mini"
                  :disabled="friendActionBusy"
                  @click="handleRemoveFriendship(out.friendship_id, out.id)"
                >
                  取消申请
                </button>
              </div>
            </div>
          </div>

          <!-- 我的好友列表 -->
          <div>
            <h3 class="sub-heading">我的好友（{{ friendsList.length }} 人）</h3>
            <div v-if="loadingFriends" class="empty-state">加载好友列表中...</div>
            <div v-else-if="friendsList.length === 0" class="empty-state">
              还没有好友，可以在上方搜索 UID/用户名，或在社区里点击他人昵称进入主页添加~
            </div>
            <div v-else class="friend-grid">
              <div v-for="f in friendsList" :key="f.friendship_id" class="friend-card">
                <div class="row-gap">
                  <button type="button" class="pyq-avatar clickable-avatar" @click="openUserProfile(f.id)">
                    {{ getInitials(f.username) }}
                  </button>
                  <div>
                    <div class="row-gap">
                      <button type="button" class="user-link-btn" style="font-weight: 700" @click="openUserProfile(f.id)">
                        {{ f.username }}
                      </button>
                      <span class="uid-tag">#{{ f.uid }}</span>
                    </div>
                    <div class="card-meta">个人 ID：{{ f.personal_id }}</div>
                  </div>
                </div>
                <div class="row-gap">
                  <button type="button" class="btn-mini" @click="openUserProfile(f.id)">查看主页</button>
                  <button
                    type="button"
                    class="btn-danger-sm"
                    :disabled="friendActionBusy"
                    @click="handleRemoveFriendship(f.friendship_id, f.id, `确认删除好友「${f.username}」吗？`)"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 5. 私密空间 -->
      <section v-if="activeTab === 'private_space'" class="glass-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">🔒 我的私密空间</h2>
            <p class="section-sub">仅你自己登录后可见（包括管理员在内的其他人都看不到），随时可删除或转为公开</p>
          </div>
          <button v-if="isLoggedIn" type="button" class="btn-primary" @click="openPostModal(false)">
            ＋ 写一篇私密帖子
          </button>
        </div>

        <div v-if="!isLoggedIn" class="notice-bar">
          <span>请先登录以查看和管理你的私密内容</span>
          <button type="button" class="btn-primary" @click="openAuthModal('login')">立即登录</button>
        </div>

        <div v-else class="col-gap" style="gap: 24px">
          <div>
            <h3 class="sub-heading">私密帖子（{{ privatePosts.length }} 篇）</h3>
            <div v-if="privatePosts.length === 0" class="empty-state">暂无私密帖子</div>
            <div v-else class="pyq-feed">
              <article v-for="post in privatePosts" :key="post.id" class="pyq-item">
                <div class="pyq-avatar private-av">🔒</div>
                <div class="pyq-body">
                  <div class="pyq-top">
                    <span class="pyq-author">{{ post.author_name }}</span>
                    <span class="vis-badge private">🔒 仅自己可见</span>
                  </div>
                  <h3 class="pyq-title" @click="readingPost = post">{{ post.title }}</h3>
                  <p class="pyq-content clamped">{{ post.content }}</p>
                  <div class="pyq-footer">
                    <span>{{ formatTime(post.created_at) }}</span>
                    <div class="pyq-actions">
                      <button type="button" class="btn-mini" @click="readingPost = post">展开全文</button>
                      <button type="button" class="btn-mini" @click="handleTogglePostVisibility(post)">转为社区公开</button>
                      <button type="button" class="btn-danger-sm" @click="handleDeletePost(post.id)">删除</button>
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
                    <button type="button" class="btn-mini" @click="handleToggleNoteVisibility(note)">转为公开</button>
                    <button type="button" class="btn-danger-sm" @click="handleDeleteNote(note.id)">删除</button>
                  </div>
                </div>
                <p class="card-text">{{ note.content }}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 6. 用户中心 -->
      <section v-if="activeTab === 'profile' && isLoggedIn" class="glass-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">用户中心</h2>
            <p class="section-sub">管理你的专属 UID、个人 ID（限改 1 次）与显示用户名</p>
          </div>
          <div class="row-gap">
            <button v-if="userId" type="button" class="btn-mini" @click="openUserProfile(userId)">
              预览我的公开主页
            </button>
            <span class="status-badge" :class="userStatus">{{ getStatusLabel(userStatus) }}</span>
            <span class="vis-badge" :class="isAdmin ? 'public' : 'private'">
              {{ isAdmin ? "🛡️ 管理员" : "普通用户" }}
            </span>
          </div>
        </div>

        <div class="composer-form">
          <div class="copy-row">
            <span>专属 UID：<span class="uid-tag">#{{ userUid }}</span></span>
            <button type="button" class="btn-mini" @click="copyText(userUid, '专属 UID')">复制 UID</button>
          </div>

          <div class="copy-row">
            <span>个人 ID：<code class="id-code">{{ userPersonalId }}</code></span>
            <button type="button" class="btn-mini" @click="copyText(userPersonalId, '个人 ID')">复制 ID</button>
          </div>

          <div v-if="personalIdChanged" class="card-meta">
            🔒 个人 ID 已修改过 1 次，无法再次更改
          </div>
          <form v-else class="row-gap" style="margin-top: 2px" @submit.prevent="handleUpdatePersonalId">
            <input
              v-model="profileIdInput"
              type="text"
              maxlength="24"
              class="field-input"
              style="flex: 1"
              :disabled="isDisabledUser"
              placeholder="自定义个人 ID（3~24 位字母/数字/_/-，仅可修改一次）"
            />
            <button
              type="submit"
              class="btn-primary"
              style="white-space: nowrap"
              :disabled="savingPersonalId || isDisabledUser || !profileIdInput.trim() || profileIdInput.trim() === userPersonalId"
            >
              {{ savingPersonalId ? "保存中..." : "修改个人 ID（限1次）" }}
            </button>
          </form>

          <div class="card-meta" style="margin-top: 4px">绑定邮箱：{{ userEmail || "未填写" }}</div>

          <div v-if="userId === 'admin_root'" class="notice-bar">
            <span>默认管理员 admin 用户名受系统保护，不可修改。</span>
          </div>
          <form v-else class="col-gap" style="margin-top: 8px" @submit.prevent="handleUpdateUsername">
            <input
              v-model="profileNameInput"
              type="text"
              maxlength="20"
              class="field-input"
              :disabled="isDisabledUser"
              placeholder="输入新的用户名（2~20 字，不可重复）"
            />
            <div class="flex-end">
              <button type="submit" class="btn-primary" :disabled="savingProfile || isDisabledUser || !profileNameInput.trim()">
                {{ savingProfile ? "保存中..." : "保存用户名" }}
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>

    <footer class="site-footer">
      <p>© 2026 Vue 3 + TypeScript + Cloudflare D1 社区</p>
    </footer>

    <!-- 发布帖子弹窗 -->
    <div v-if="showPostModal" class="modal-backdrop" @click="showPostModal = false">
      <div class="modal-box modal-wide" @click.stop>
        <div class="section-header" style="margin-bottom: 0">
          <h3 class="section-title">发布新帖子</h3>
          <button type="button" class="btn-ghost" @click="showPostModal = false">关闭</button>
        </div>

        <form class="col-gap" @submit.prevent="handlePublishPost">
          <input v-model="postTitle" type="text" class="field-input" placeholder="输入帖子标题..." />
          <textarea v-model="postContent" class="field-textarea" style="min-height: 200px" placeholder="写下你想分享的内容..." />

          <div>
            <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px">可见范围</div>
            <div class="vis-selector">
              <button type="button" class="vis-option" :class="{ 'active-public': postIsPublic }" @click="postIsPublic = true">
                <span class="vis-option-title">🌐 社区公开</span>
                <span class="vis-option-desc">发布到「社区」，所有访客可见</span>
              </button>
              <button type="button" class="vis-option" :class="{ 'active-private': !postIsPublic }" @click="postIsPublic = false">
                <span class="vis-option-title">🔒 仅自己可见</span>
                <span class="vis-option-desc">仅存入「私密空间」，其他人不可见</span>
              </button>
            </div>
          </div>

          <div class="flex-end">
            <button type="button" class="btn-ghost" @click="showPostModal = false">取消</button>
            <button type="submit" class="btn-primary" :disabled="publishingPost || !postTitle.trim() || !postContent.trim()">
              {{ publishingPost ? "发布中..." : postIsPublic ? "发布到社区" : "保存到私密空间" }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- 登录 / 注册弹窗 -->
    <div v-if="showAuthModal" class="modal-backdrop" @click="showAuthModal = false">
      <div class="modal-box" @click.stop>
        <template v-if="regSuccessInfo">
          <div class="auth-success-box">
            <h3 class="section-title" style="color: var(--public)">🎉 注册成功！</h3>
            <p class="section-sub">欢迎加入社区，系统已为你自动登录并分配专属身份编号：</p>
            <div class="copy-row">
              <span>用户名：<strong>{{ regSuccessInfo.username }}</strong></span>
            </div>
            <div class="copy-row">
              <span>专属 UID：<span class="uid-tag">#{{ regSuccessInfo.uid }}</span></span>
              <button type="button" class="btn-mini" @click="copyText(regSuccessInfo.uid, '专属 UID')">复制</button>
            </div>
            <div class="copy-row">
              <span>个人 ID：<code class="id-code">{{ regSuccessInfo.id }}</code></span>
              <button type="button" class="btn-mini" @click="copyText(regSuccessInfo.id, '个人 ID')">复制</button>
            </div>
            <button
              type="button"
              class="btn-primary"
              style="width: 100%; margin-top: 8px"
              @click="showAuthModal = false; regSuccessInfo = null"
            >
              立即进入社区
            </button>
          </div>
        </template>

        <template v-else>
          <div class="section-header" style="margin-bottom: 0">
            <h3 class="section-title">账号中心</h3>
            <button type="button" class="btn-ghost" @click="showAuthModal = false">关闭</button>
          </div>

          <div class="modal-tabs">
            <button type="button" class="modal-tab" :class="{ active: authMode === 'login' }" @click="switchAuthMode('login')">
              立即登录
            </button>
            <button type="button" class="modal-tab" :class="{ active: authMode === 'register' }" @click="switchAuthMode('register')">
              注册账号
            </button>
          </div>

          <form class="col-gap" @submit.prevent="handleFrontendAuth">
            <input
              v-if="authMode === 'login'"
              v-model="accountInput"
              type="text"
              class="field-input"
              placeholder="输入 UID / 个人 ID / 用户名 / 邮箱"
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

            <div class="pwd-field">
              <input
                v-model="passwordInput"
                :type="pwdVisible.front ? 'text' : 'password'"
                class="field-input"
                :placeholder="authMode === 'login' ? '请输入密码' : '设置密码（≥8 位，含大写字母和数字）'"
              />
              <button type="button" class="pwd-toggle" @click="pwdVisible.front = !pwdVisible.front">
                {{ pwdVisible.front ? "🙈" : "👁️" }}
              </button>
            </div>

            <template v-if="authMode === 'register'">
              <div class="pwd-field">
                <input
                  v-model="confirmPasswordInput"
                  :type="pwdVisible.frontConfirm ? 'text' : 'password'"
                  class="field-input"
                  placeholder="再次确认密码"
                />
                <button type="button" class="pwd-toggle" @click="pwdVisible.frontConfirm = !pwdVisible.frontConfirm">
                  {{ pwdVisible.frontConfirm ? "🙈" : "👁️" }}
                </button>
              </div>
              <div class="pwd-rules">
                <span :class="{ ok: regPwdChecks.len }">{{ regPwdChecks.len ? "✓" : "○" }} 至少 8 位字符</span>
                <span :class="{ ok: regPwdChecks.upper }">{{ regPwdChecks.upper ? "✓" : "○" }} 至少 1 个大写字母 (A-Z)</span>
                <span :class="{ ok: regPwdChecks.digit }">{{ regPwdChecks.digit ? "✓" : "○" }} 至少 1 个数字 (0-9)</span>
              </div>
            </template>

            <p v-if="authMsg" class="auth-msg">{{ authMsg }}</p>
            <button type="submit" class="btn-primary" :disabled="authBusy">
              {{ authBusy ? "处理中..." : authMode === "login" ? "立即登录" : "注册并获取专属 UID" }}
            </button>
          </form>
        </template>
      </div>
    </div>
  </div>

  <!-- 他人个人主页弹窗 -->
  <div v-if="loadingUserProfile || viewingProfile" class="modal-backdrop" @click="viewingProfile = null">
    <div class="modal-box modal-wide" @click.stop>
      <div v-if="loadingUserProfile" class="empty-state">加载用户主页中...</div>

      <template v-else-if="viewingProfile">
        <div class="section-header" style="margin-bottom: 0">
          <div class="row-gap" style="gap: 14px">
            <div class="hero-avatar" style="width: 56px; height: 56px; font-size: 20px; border-radius: 16px">
              {{ getInitials(viewingProfile.user.username) }}
            </div>
            <div>
              <div class="row-gap">
                <h2 class="section-title" style="font-size: 20px">{{ viewingProfile.user.username }}</h2>
                <span class="uid-tag">#{{ viewingProfile.user.uid }}</span>
                <span v-if="viewingProfile.user.role === 'admin'" class="vis-badge public">🛡️ 管理员</span>
              </div>
              <div class="card-meta" style="margin-top: 4px">
                <span>个人 ID：{{ viewingProfile.user.personal_id }}</span>
                <span>· 加入于 {{ formatTime(viewingProfile.user.created_at) }}</span>
              </div>
            </div>
          </div>
          <button type="button" class="btn-ghost" @click="viewingProfile = null">关闭</button>
        </div>

        <!-- 个人数据统计 + 好友操作栏 -->
        <div class="profile-banner">
          <div class="row-gap" style="gap: 16px">
            <div class="mini-stat">
              <strong>{{ viewingProfile.posts.length }}</strong>
              <span>公开帖子</span>
            </div>
            <div class="mini-stat">
              <strong>{{ viewingProfile.notes.length }}</strong>
              <span>公开日常</span>
            </div>
            <div class="mini-stat">
              <strong>{{ viewingProfile.user.friend_count }}</strong>
              <span>好友数</span>
            </div>
          </div>

          <div class="row-gap">
            <span v-if="viewingProfile.relation === 'self'" class="tag-chip">这是你自己的主页</span>
            <template v-else-if="viewingProfile.relation === 'friends'">
              <span class="vis-badge public">✓ 已是好友</span>
              <button
                type="button"
                class="btn-danger-sm"
                :disabled="friendActionBusy"
                @click="
                  handleRemoveFriendship(
                    viewingProfile.friendship_id,
                    viewingProfile.user.id,
                    `确认解除与「${viewingProfile.user.username}」的好友关系吗？`
                  )
                "
              >
                删除好友
              </button>
            </template>
            <template v-else-if="viewingProfile.relation === 'outgoing_pending'">
              <span class="vis-badge private">⏳ 申请已发送</span>
              <button
                type="button"
                class="btn-mini"
                :disabled="friendActionBusy"
                @click="handleRemoveFriendship(viewingProfile.friendship_id, viewingProfile.user.id)"
              >
                取消申请
              </button>
            </template>
            <template v-else-if="viewingProfile.relation === 'incoming_pending'">
              <button
                type="button"
                class="btn-ok-sm"
                :disabled="friendActionBusy"
                @click="
                  viewingProfile.friendship_id &&
                    handleAcceptFriend(viewingProfile.friendship_id, viewingProfile.user.id)
                "
              >
                ✓ 同意好友申请
              </button>
              <button
                type="button"
                class="btn-danger-sm"
                :disabled="friendActionBusy"
                @click="handleRemoveFriendship(viewingProfile.friendship_id, viewingProfile.user.id)"
              >
                拒绝
              </button>
            </template>
            <button
              v-else
              type="button"
              class="btn-primary"
              style="padding: 7px 14px; font-size: 13px"
              :disabled="friendActionBusy"
              @click="handleSendFriendRequest(viewingProfile.user.id)"
            >
              ＋ 添加好友
            </button>
          </div>
        </div>

        <!-- TA 的公开内容切换 -->
        <div class="modal-tabs">
          <button
            type="button"
            class="modal-tab"
            :class="{ active: profileSubTab === 'posts' }"
            @click="profileSubTab = 'posts'"
          >
            公开帖子 ({{ viewingProfile.posts.length }})
          </button>
          <button
            type="button"
            class="modal-tab"
            :class="{ active: profileSubTab === 'notes' }"
            @click="profileSubTab = 'notes'"
          >
            公开日常 ({{ viewingProfile.notes.length }})
          </button>
        </div>

        <div v-if="profileSubTab === 'posts'">
          <div v-if="viewingProfile.posts.length === 0" class="empty-state">
            TA 还没有发布公开帖子
          </div>
          <div v-else class="feed-list">
            <article
              v-for="p in viewingProfile.posts"
              :key="p.id"
              class="moment-card"
              style="cursor: pointer"
              @click="readingPost = p"
            >
              <div class="card-meta">
                <strong style="font-size: 15px; color: var(--text-main)">{{ p.title }}</strong>
                <span>{{ formatTime(p.created_at) }}</span>
              </div>
              <p class="pyq-content clamped" style="font-size: 14px">{{ p.content }}</p>
              <div class="card-meta">
                <span>❤️ {{ p.like_count }} · 💬 {{ p.comment_count }}</span>
                <span style="color: var(--accent)">点击阅读全文 →</span>
              </div>
            </article>
          </div>
        </div>

        <div v-else>
          <div v-if="viewingProfile.notes.length === 0" class="empty-state">
            TA 还没有发布公开日常
          </div>
          <div v-else class="feed-list">
            <div v-for="n in viewingProfile.notes" :key="n.id" class="moment-card">
              <div class="card-meta">
                <span class="mood-badge">{{ n.mood || "日常" }}</span>
                <span>{{ formatTime(n.created_at) }}</span>
              </div>
              <p class="card-text">{{ n.content }}</p>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>

  <!-- 帖子全文弹窗 -->
  <div v-if="readingPost" class="modal-backdrop" @click="readingPost = null">
    <div class="modal-box modal-wide" @click.stop>
      <div class="section-header" style="margin-bottom: 0">
        <h2 class="section-title" style="font-size: 22px">{{ readingPost.title }}</h2>
        <button type="button" class="btn-ghost" @click="readingPost = null">关闭</button>
      </div>
      <div class="card-meta">
        <div class="row-gap">
          <span class="vis-badge" :class="readingPost.is_public ? 'public' : 'private'">
            {{ readingPost.is_public ? "🌐 社区公开" : "🔒 仅自己可见" }}
          </span>
          <button
            type="button"
            class="user-link-btn"
            @click="openUserProfile(readingPost.author_id)"
          >
            作者：{{ readingPost.author_name }}
          </button>
          <span v-if="readingPost.author_uid" class="uid-tag">#{{ readingPost.author_uid }}</span>
        </div>
        <span>发布于 {{ formatTime(readingPost.created_at) }}</span>
      </div>
      <div class="card-text read-body">{{ readingPost.content }}</div>
    </div>
  </div>
</template>