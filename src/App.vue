<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";

type ThemeMode = "dark" | "light";
type PaletteKey = "ocean" | "violet" | "emerald" | "sunset" | "rose";
type FrontendTab =
  | "home"
  | "community"
  | "moments"
  | "friends"
  | "messages"
  | "profile";
type MessageSubTab = "dm" | "notifications";
type ProfileContentTab = "posts" | "notes";
type AdminSubTab = "users" | "posts" | "announcements";
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
  personal_id_updated_at?: string | null;
  can_change_personal_id?: boolean;
  next_personal_id_change_at?: string | null;
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

interface AnnouncementItem {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  author_id: string;
  author_name: string;
  created_at: string;
}

interface NotificationItem {
  id: string;
  user_id: string;
  actor_id: string;
  actor_name: string;
  actor_uid: number | null;
  type: "like_post" | "like_comment" | "comment_post" | "reply_comment" | "dm";
  target_id: string | null;
  preview: string;
  is_read: boolean;
  created_at: string;
}

interface ConversationItem {
  peer_id: string;
  peer_uid: number;
  peer_personal_id: string;
  peer_name: string;
  last_content: string | null;
  last_time: string | null;
  unread_count: number;
}

interface DirectMessageItem {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  is_mine: boolean;
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
  replyToUserId: string;
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
const messageSubTab = ref<MessageSubTab>("dm");
const myContentTab = ref<ProfileContentTab>("posts");
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
const canChangePersonalId = ref<boolean>(true);
const nextPersonalIdChangeAt = ref<string | null>(null);
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

// 站点公告
const announcements = ref<AnnouncementItem[]>([]);
const announceTitle = ref<string>("");
const announceContent = ref<string>("");
const announcePinned = ref<boolean>(true);
const publishingAnnounce = ref<boolean>(false);
const activeAnnouncement = ref<AnnouncementItem | null>(null);

// 站内消息提醒（合并在消息/私聊中心）
const notifications = ref<NotificationItem[]>([]);
const unreadNotifCount = ref<number>(0);
const unreadDmCount = ref<number>(0);
const loadingNotifications = ref<boolean>(false);

// 私聊系统
const conversations = ref<ConversationItem[]>([]);
const activeChatPeer = ref<{ id: string; uid: number; name: string } | null>(null);
const chatMessages = ref<DirectMessageItem[]>([]);
const loadingChat = ref<boolean>(false);
const dmInput = ref<string>("");
const sendingDm = ref<boolean>(false);
const chatBoxRef = ref<HTMLElement | null>(null);

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

// 互动提醒（点赞与评论，排除私聊以免与私聊列表重复）
const interactionNotifications = computed<NotificationItem[]>(() =>
  notifications.value.filter((n) => n.type !== "dm")
);
const unreadInteractionCount = computed<number>(
  () => interactionNotifications.value.filter((n) => !n.is_read).length
);
const totalMessageBadgeCount = computed<number>(
  () => unreadDmCount.value + unreadInteractionCount.value
);

const pinnedAnnouncements = computed<AnnouncementItem[]>(() =>
  announcements.value.filter((a) => a.is_pinned)
);
const latestBannerAnnouncement = computed<AnnouncementItem | null>(
  () => pinnedAnnouncements.value[0] || announcements.value[0] || null
);

const publicPosts = computed<PostItem[]>(() => posts.value.filter((p) => p.is_public));
const myAllPosts = computed<PostItem[]>(() => posts.value.filter((p) => p.is_mine));
const publicNotes = computed<NoteItem[]>(() => notes.value.filter((n) => n.is_public));
const myAllNotes = computed<NoteItem[]>(() => notes.value.filter((n) => n.is_mine));

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

function getNotifTypeLabel(type: NotificationItem["type"]): string {
  if (type === "like_post" || type === "like_comment") return "❤️ 收到点赞";
  if (type === "comment_post" || type === "reply_comment") return "💬 收到评论";
  return "✉️ 新私聊";
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
  canChangePersonalId.value = res.can_change_personal_id ?? true;
  nextPersonalIdChangeAt.value = res.next_personal_id_change_at || null;
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
  canChangePersonalId.value = true;
  nextPersonalIdChangeAt.value = null;
  userName.value = "";
  userEmail.value = null;
  userRole.value = "user";
  userStatus.value = "active";
  profileNameInput.value = "";
  profileIdInput.value = "";
  friendsList.value = [];
  incomingRequests.value = [];
  outgoingRequests.value = [];
  notifications.value = [];
  unreadNotifCount.value = 0;
  unreadDmCount.value = 0;
  conversations.value = [];
  activeChatPeer.value = null;
  chatMessages.value = [];
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

async function fetchAnnouncements(): Promise<void> {
  try {
    announcements.value = await apiFetch<AnnouncementItem[]>("/api/announcements");
  } catch {
    // 忽略公告加载异常
  }
}

async function fetchNotifications(): Promise<void> {
  if (!isLoggedIn.value) return;
  try {
    const res = await apiFetch<{
      unread_count: number;
      unread_dm_count: number;
      items: NotificationItem[];
    }>("/api/notifications");
    notifications.value = res.items || [];
    unreadNotifCount.value = res.unread_count || 0;
    unreadDmCount.value = res.unread_dm_count || 0;
  } catch {
    // 轮询失败静默忽略
  }
}

async function handleMarkAllNotificationsRead(): Promise<void> {
  try {
    await apiFetch<{ ok: boolean }>("/api/notifications/read-all", { method: "POST" });
    notifications.value.forEach((n) => {
      n.is_read = true;
    });
    unreadNotifCount.value = 0;
    showNotice("已全部标记为已读");
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "操作失败"));
  }
}

async function handleClickNotification(item: NotificationItem): Promise<void> {
  if (!item.is_read) {
    item.is_read = true;
    unreadNotifCount.value = Math.max(0, unreadNotifCount.value - 1);
    void apiFetch(`/api/notifications/${item.id}/read`, { method: "POST" }).catch(() => {});
  }

  if (item.type === "dm") {
    const peerId = item.target_id || item.actor_id;
    await openDirectChat(peerId, item.actor_name, item.actor_uid ?? 0);
    return;
  }

  if (item.target_id) {
    const targetPost = posts.value.find((p) => p.id === item.target_id);
    if (targetPost) {
      activeTab.value = "community";
      readingPost.value = targetPost;
      await toggleCommentsPanel(targetPost.id);
    } else {
      activeTab.value = "community";
    }
  }
}

async function fetchConversations(): Promise<void> {
  if (!isLoggedIn.value) return;
  try {
    conversations.value = await apiFetch<ConversationItem[]>("/api/messages/conversations");
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "获取会话列表失败"));
  }
}

function scrollChatToBottom(): void {
  void nextTick(() => {
    if (chatBoxRef.value) {
      chatBoxRef.value.scrollTop = chatBoxRef.value.scrollHeight;
    }
  });
}

async function openDirectChat(peerId: string, peerName: string, peerUid: number): Promise<void> {
  if (!isLoggedIn.value) {
    openAuthModal("login");
    authMsg.value = "请先登录后再发送私聊";
    return;
  }
  viewingProfile.value = null;
  activeTab.value = "messages";
  messageSubTab.value = "dm";
  activeChatPeer.value = { id: peerId, uid: peerUid, name: peerName };
  loadingChat.value = true;
  try {
    chatMessages.value = await apiFetch<DirectMessageItem[]>(
      `/api/messages/${encodeURIComponent(peerId)}`
    );
    await Promise.all([fetchConversations(), fetchNotifications()]);
    scrollChatToBottom();
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "打开私聊失败"));
  } finally {
    loadingChat.value = false;
  }
}

async function handleSendDirectMessage(): Promise<void> {
  if (!activeChatPeer.value) return;
  const content = dmInput.value.trim();
  if (!content) return;
  sendingDm.value = true;
  try {
    const msg = await apiFetch<DirectMessageItem>(
      `/api/messages/${encodeURIComponent(activeChatPeer.value.id)}`,
      {
        method: "POST",
        body: JSON.stringify({ content }),
      }
    );
    chatMessages.value.push(msg);
    dmInput.value = "";
    scrollChatToBottom();
    await fetchConversations();
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "发送失败"));
  } finally {
    sendingDm.value = false;
  }
}

async function fetchAllData(): Promise<void> {
  loadingData.value = true;
  try {
    const [postsData, notesData] = await Promise.all([
      apiFetch<PostItem[]>("/api/posts"),
      apiFetch<NoteItem[]>("/api/notes"),
      fetchAnnouncements(),
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
    showNotice("已同意好友申请，现在可以私聊了");
    await Promise.all([fetchFriendsData(), fetchConversations()]);
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
    if (targetUserId && activeChatPeer.value?.id === targetUserId) {
      activeChatPeer.value = null;
      chatMessages.value = [];
    }
    const found = friendSearchResults.value.find((u) => u.friendship_id === friendshipId);
    if (found) {
      found.relation = "none";
      found.friendship_id = null;
    }
    showNotice("已更新好友关系");
    await Promise.all([fetchFriendsData(), fetchConversations()]);
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
      await Promise.all([fetchFriendsData(), fetchNotifications(), fetchConversations()]);
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
    void fetchAnnouncements();
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
    await Promise.all([
      fetchAllData(),
      fetchFriendsData(),
      fetchNotifications(),
      fetchConversations(),
    ]);

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

async function handlePublishAnnouncement(): Promise<void> {
  if (!announceTitle.value.trim() || !announceContent.value.trim()) return;
  publishingAnnounce.value = true;
  try {
    const created = await apiFetch<AnnouncementItem>("/api/announcements", {
      method: "POST",
      body: JSON.stringify({
        title: announceTitle.value.trim(),
        content: announceContent.value.trim(),
        is_pinned: announcePinned.value,
      }),
    });
    announcements.value.unshift(created);
    announceTitle.value = "";
    announceContent.value = "";
    showNotice("站点公告已发布");
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "发布公告失败"));
  } finally {
    publishingAnnounce.value = false;
  }
}

async function handleToggleAnnouncementPin(item: AnnouncementItem): Promise<void> {
  const nextPinned = !item.is_pinned;
  try {
    await apiFetch<{ ok: boolean; is_pinned: boolean }>(`/api/announcements/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_pinned: nextPinned }),
    });
    item.is_pinned = nextPinned;
    showNotice(nextPinned ? "已置顶该公告" : "已取消置顶");
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "操作失败"));
  }
}

async function handleDeleteAnnouncement(id: string): Promise<void> {
  try {
    await apiFetch<{ ok: boolean }>(`/api/announcements/${id}`, { method: "DELETE" });
    announcements.value = announcements.value.filter((a) => a.id !== id);
    if (activeAnnouncement.value?.id === id) activeAnnouncement.value = null;
    showNotice("已删除公告");
  } catch (err: unknown) {
    showNotice(getErrorMessage(err, "删除失败"));
  }
}

async function handleLogout(): Promise<void> {
  clearUserSession();
  openCommentPostId.value = null;
  postComments.value = [];
  replyTarget.value = null;
  viewingProfile.value = null;
  if (
    activeTab.value === "profile" ||
    activeTab.value === "friends" ||
    activeTab.value === "messages"
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
    activeTab.value = created.is_public ? "community" : "profile";
    if (!created.is_public) myContentTab.value = "posts";
    showNotice(created.is_public ? "已发布到社区" : "已保存到个人私密帖子（可在用户中心查看）");
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

function startReply(rootId: string, targetName: string, targetUserId: string): void {
  if (!isLoggedIn.value) {
    openAuthModal("login");
    authMsg.value = "请先登录后再回复评论";
    return;
  }
  if (isDisabledUser.value) {
    showNotice("您的账号已被禁用，暂无法回复评论");
    return;
  }
  replyTarget.value = { parentId: rootId, replyToName: targetName, replyToUserId: targetUserId };
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
    const payload: {
      content: string;
      parent_id?: string;
      reply_to_name?: string;
      reply_to_user_id?: string;
    } = { content };
    if (replyTarget.value) {
      payload.parent_id = replyTarget.value.parentId;
      payload.reply_to_name = replyTarget.value.replyToName;
      payload.reply_to_user_id = replyTarget.value.replyToUserId;
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
    showNotice(created.is_public ? "已发布公开日常" : "已保存私密日常（可在用户中心查看）");
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
  if (!window.confirm(`确认将个人 ID 修改为「${nextId}」吗？修改后需等待 7 天才可再次修改。`)) {
    return;
  }
  savingPersonalId.value = true;
  try {
    const res = await apiFetch<{
      ok: boolean;
      personal_id: string;
      can_change_personal_id: boolean;
      next_personal_id_change_at: string | null;
    }>("/api/user/personal-id", {
      method: "PATCH",
      body: JSON.stringify({ personal_id: nextId }),
    });
    userPersonalId.value = res.personal_id;
    canChangePersonalId.value = res.can_change_personal_id;
    nextPersonalIdChangeAt.value = res.next_personal_id_change_at;
    profileIdInput.value = res.personal_id;
    showNotice("个人 ID 修改成功（7 天后可再次修改）");
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
let pollTimer: number | null = null;

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

  pollTimer = window.setInterval(async () => {
    if (!isLoggedIn.value) return;
    await fetchNotifications();
    if (activeTab.value === "messages" && messageSubTab.value === "dm" && activeChatPeer.value) {
      const latest = await apiFetch<DirectMessageItem[]>(
        `/api/messages/${encodeURIComponent(activeChatPeer.value.id)}`
      ).catch(() => null);
      if (latest && latest.length !== chatMessages.value.length) {
        chatMessages.value = latest;
        scrollChatToBottom();
      }
    }
  }, 12000);

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
  if (pollTimer !== null) window.clearInterval(pollTimer);
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
          :class="{ active: adminSubTab === 'announcements' }"
          @click="adminSubTab = 'announcements'; fetchAnnouncements()"
        >
          📢 站点公告管理
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
                : adminSubTab === "announcements"
                ? "全站公告发布与置顶管理"
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
            <span class="stat-label">全站公告数</span>
            <strong class="stat-num">{{ announcements.length }}</strong>
          </div>
        </div>

        <!-- 3.1 用户管理 -->
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

        <!-- 3.2 站点公告管理 -->
        <div v-if="adminSubTab === 'announcements'" class="console-panel">
          <div class="section-header">
            <div>
              <h3 class="section-title">📢 发布站点公告</h3>
              <p class="section-sub">置顶公告将展示在社区前台首页最上方横幅，所有访客可见</p>
            </div>
          </div>

          <form class="composer-form" @submit.prevent="handlePublishAnnouncement">
            <input
              v-model="announceTitle"
              type="text"
              class="field-input"
              placeholder="输入公告标题..."
            />
            <textarea
              v-model="announceContent"
              class="field-textarea"
              placeholder="输入公告正文内容..."
            />
            <div class="mood-bar">
              <button
                type="button"
                class="btn-mini"
                @click="announcePinned = !announcePinned"
              >
                {{ announcePinned ? "📌 默认置顶首页" : "📄 普通公告" }}
              </button>
              <button
                type="submit"
                class="btn-primary"
                :disabled="publishingAnnounce || !announceTitle.trim() || !announceContent.trim()"
              >
                {{ publishingAnnounce ? "发布中..." : "发布公告" }}
              </button>
            </div>
          </form>

          <div v-if="announcements.length === 0" class="empty-state">暂无站点公告</div>
          <div v-else class="feed-list">
            <div v-for="a in announcements" :key="a.id" class="moment-card">
              <div class="card-meta">
                <div class="row-gap">
                  <span class="vis-badge" :class="a.is_pinned ? 'public' : 'private'">
                    {{ a.is_pinned ? "📌 置顶中" : "普通公告" }}
                  </span>
                  <strong style="color: var(--text-main); font-size: 15px">{{ a.title }}</strong>
                </div>
                <div class="row-gap">
                  <span>{{ formatTime(a.created_at) }}</span>
                  <button type="button" class="btn-mini" @click="handleToggleAnnouncementPin(a)">
                    {{ a.is_pinned ? "取消置顶" : "设为置顶" }}
                  </button>
                  <button type="button" class="btn-danger-sm" @click="handleDeleteAnnouncement(a.id)">
                    删除
                  </button>
                </div>
              </div>
              <p class="card-text">{{ a.content }}</p>
            </div>
          </div>
        </div>

        <!-- 3.3 社区帖子审核 -->
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
            日常
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
          <button
            v-if="isLoggedIn"
            type="button"
            class="nav-pill"
            :class="{ active: activeTab === 'messages' }"
            @click="activeTab = 'messages'; fetchConversations(); fetchNotifications()"
          >
            💬 消息
            <span v-if="totalMessageBadgeCount > 0" class="badge-dot">{{ totalMessageBadgeCount }}</span>
          </button>
          <button
            v-if="isLoggedIn"
            type="button"
            class="nav-pill"
            :class="{ active: activeTab === 'profile' }"
            @click="profileNameInput = displayCurrentUser; profileIdInput = userPersonalId; activeTab = 'profile'"
          >
            👤 用户中心
          </button>
          <button v-if="isAdmin" type="button" class="nav-pill" @click="goToPath('/admin')">
            🛡️ 后台
          </button>
        </nav>

        <div class="nav-actions">
          <button type="button" class="upload-blog-btn" @click="openPostModal(true)">
            ＋ 发帖
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
            退出
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

      <!-- 置顶公告横幅 -->
      <div
        v-if="latestBannerAnnouncement"
        class="announce-banner"
        @click="activeAnnouncement = latestBannerAnnouncement"
      >
        <div class="row-gap" style="min-width: 0">
          <span class="vis-badge public">📢 站点公告</span>
          <strong class="announce-banner-title">{{ latestBannerAnnouncement.title }}</strong>
          <span class="announce-banner-preview">{{ latestBannerAnnouncement.content }}</span>
        </div>
        <span class="link-btn" style="white-space: nowrap">查看详情 →</span>
      </div>

      <!-- 1. 首页 -->
      <template v-if="activeTab === 'home'">
        <section class="hero-grid">
          <div class="glass-card hero-main">
            <div class="hero-profile">
              <div class="hero-avatar">{{ getInitials(displayCurrentUser) }}</div>
              <div>
                <h1 class="hero-title">欢迎您，{{ displayCurrentUser }}</h1>
                <p class="hero-subtitle">社区交流、日常动态、好友私聊与个人主页</p>
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
              <p class="section-sub">点击用户昵称可查看对方个人主页、添加好友或发起私聊</p>
            </div>
            <button type="button" class="link-btn" @click="activeTab = 'community'">进入社区 →</button>
          </div>

          <div v-if="loadingData" class="empty-state">加载中...</div>
          <div v-else-if="publicPosts.length === 0" class="empty-state">
            社区还没有帖子，点击右上角「＋ 发帖」发第一条吧~
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
                        <button type="button" class="btn-mini" @click="startReply(c.id, c.author_name, c.user_id)">
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
                            <button type="button" class="btn-mini" @click="startReply(c.id, r.author_name, r.user_id)">
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
            <p class="section-sub">分享短动态，发布时可自由选择公开或仅自己可见（私密内容可在用户中心管理）</p>
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
            <p class="section-sub">通过 UID、个人 ID 或用户名查找用户，互为好友后可直接发起私聊</p>
          </div>
          <button v-if="isLoggedIn" type="button" class="btn-mini" @click="fetchFriendsData">刷新</button>
        </div>

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
                <button
                  v-else-if="u.relation === 'friends'"
                  type="button"
                  class="btn-primary"
                  style="padding: 5px 12px; font-size: 12px"
                  @click="openDirectChat(u.id, u.username, u.uid)"
                >
                  💬 私聊
                </button>
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
          <span>登录后即可添加好友、处理好友申请并开启好友私聊</span>
          <button type="button" class="btn-primary" @click="openAuthModal('login')">立即登录</button>
        </div>

        <div v-else class="col-gap" style="gap: 22px">
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
                  <button
                    type="button"
                    class="btn-primary"
                    style="padding: 5px 12px; font-size: 12px"
                    @click="openDirectChat(f.id, f.username, f.uid)"
                  >
                    💬 私聊
                  </button>
                  <button type="button" class="btn-mini" @click="openUserProfile(f.id)">主页</button>
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

      <!-- 5. 消息中心（好友私聊 + 点赞/评论互动提醒合并） -->
      <section v-if="activeTab === 'messages' && isLoggedIn" class="glass-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">💬 消息与私聊</h2>
            <p class="section-sub">好友一对一私聊与收到的评论、回复、点赞提醒</p>
          </div>
          <div class="row-gap">
            <button
              v-if="messageSubTab === 'notifications' && unreadNotifCount > 0"
              type="button"
              class="btn-mini"
              @click="handleMarkAllNotificationsRead"
            >
              全部标为已读
            </button>
            <button
              type="button"
              class="btn-mini"
              @click="fetchConversations(); fetchNotifications()"
            >
              刷新
            </button>
          </div>
        </div>

        <!-- 私聊 / 互动提醒 子切换 -->
        <div class="modal-tabs" style="margin-bottom: 16px">
          <button
            type="button"
            class="modal-tab"
            :class="{ active: messageSubTab === 'dm' }"
            @click="messageSubTab = 'dm'; fetchConversations()"
          >
            💬 好友私聊
            <span v-if="unreadDmCount > 0" class="badge-dot">{{ unreadDmCount }}</span>
          </button>
          <button
            type="button"
            class="modal-tab"
            :class="{ active: messageSubTab === 'notifications' }"
            @click="messageSubTab = 'notifications'; fetchNotifications()"
          >
            🔔 评论与点赞提醒
            <span v-if="unreadInteractionCount > 0" class="badge-dot">{{ unreadInteractionCount }}</span>
          </button>
        </div>

        <!-- 5.1 好友私聊面板 -->
        <div v-if="messageSubTab === 'dm'" class="dm-layout">
          <div class="dm-sidebar">
            <div v-if="conversations.length === 0" class="empty-state" style="padding: 20px 10px">
              暂无可私聊的好友，先去「👥 好友」添加好友吧~
            </div>
            <button
              v-for="conv in conversations"
              :key="conv.peer_id"
              type="button"
              class="dm-peer-item"
              :class="{ active: activeChatPeer?.id === conv.peer_id }"
              @click="openDirectChat(conv.peer_id, conv.peer_name, conv.peer_uid)"
            >
              <div class="pyq-avatar" style="width: 38px; height: 38px; font-size: 13px">
                {{ getInitials(conv.peer_name) }}
              </div>
              <div style="flex: 1; min-width: 0; text-align: left">
                <div class="card-meta" style="margin-bottom: 2px">
                  <strong style="color: var(--text-main); font-size: 14px">{{ conv.peer_name }}</strong>
                  <span v-if="conv.unread_count > 0" class="badge-dot">{{ conv.unread_count }}</span>
                </div>
                <div class="dm-preview">
                  {{ conv.last_content || "点击开始发消息..." }}
                </div>
              </div>
            </button>
          </div>

          <div class="dm-window">
            <div v-if="!activeChatPeer" class="empty-state" style="margin: auto">
              从左侧选择一位好友开始私聊
            </div>
            <template v-else>
              <div class="dm-window-header">
                <div class="row-gap">
                  <button
                    type="button"
                    class="user-link-btn"
                    style="font-weight: 700; font-size: 15px"
                    @click="openUserProfile(activeChatPeer.id)"
                  >
                    {{ activeChatPeer.name }}
                  </button>
                  <span class="uid-tag">#{{ activeChatPeer.uid }}</span>
                </div>
                <button type="button" class="btn-mini" @click="openUserProfile(activeChatPeer.id)">
                  查看主页
                </button>
              </div>

              <div ref="chatBoxRef" class="dm-messages">
                <div v-if="loadingChat" class="empty-state">加载聊天记录中...</div>
                <div v-else-if="chatMessages.length === 0" class="empty-state">
                  还没有聊天记录，发条消息打个招呼吧~
                </div>
                <div
                  v-for="m in chatMessages"
                  :key="m.id"
                  class="dm-bubble-row"
                  :class="{ mine: m.is_mine }"
                >
                  <div class="dm-bubble" :class="{ mine: m.is_mine }">
                    <div class="dm-bubble-text">{{ m.content }}</div>
                    <div class="dm-bubble-time">{{ formatTime(m.created_at) }}</div>
                  </div>
                </div>
              </div>

              <form class="comment-form" style="padding-top: 10px" @submit.prevent="handleSendDirectMessage">
                <input
                  v-model="dmInput"
                  type="text"
                  maxlength="1000"
                  class="field-input"
                  :disabled="isDisabledUser"
                  :placeholder="isDisabledUser ? '账号已被禁用，暂无法发送私聊' : `发消息给 ${activeChatPeer.name}...`"
                />
                <button
                  type="submit"
                  class="btn-primary"
                  style="white-space: nowrap; padding: 8px 16px"
                  :disabled="sendingDm || !dmInput.trim() || isDisabledUser"
                >
                  {{ sendingDm ? "发送中" : "发送" }}
                </button>
              </form>
            </template>
          </div>
        </div>

        <!-- 5.2 点赞与评论提醒列表 -->
        <div v-else>
          <div v-if="loadingNotifications" class="empty-state">加载提醒中...</div>
          <div v-else-if="interactionNotifications.length === 0" class="empty-state">
            暂时还没有收到任何评论或点赞提醒~
          </div>
          <div v-else class="feed-list">
            <div
              v-for="item in interactionNotifications"
              :key="item.id"
              class="moment-card notif-item"
              :class="{ unread: !item.is_read }"
              @click="handleClickNotification(item)"
            >
              <div class="card-meta">
                <div class="row-gap">
                  <span v-if="!item.is_read" class="unread-dot" />
                  <span class="mood-badge">{{ getNotifTypeLabel(item.type) }}</span>
                  <strong>{{ item.actor_name }}</strong>
                  <span v-if="item.actor_uid" class="uid-tag">#{{ item.actor_uid }}</span>
                </div>
                <span>{{ formatTime(item.created_at) }}</span>
              </div>
              <p class="card-text" style="font-size: 14px">{{ item.preview }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- 6. 用户中心（账号资料 + 我的全部帖子与私密内容管理） -->
      <template v-if="activeTab === 'profile' && isLoggedIn">
        <section class="glass-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">👤 用户中心</h2>
              <p class="section-sub">管理你的专属 UID、个人 ID（每 7 天可修改 1 次）与显示用户名</p>
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

            <div v-if="!canChangePersonalId && nextPersonalIdChangeAt" class="card-meta">
              ⏳ 个人 ID 每 7 天可修改一次，下次可修改时间：{{ formatTime(nextPersonalIdChangeAt) }}
            </div>
            <form v-else class="row-gap" style="margin-top: 2px" @submit.prevent="handleUpdatePersonalId">
              <input
                v-model="profileIdInput"
                type="text"
                maxlength="24"
                class="field-input"
                style="flex: 1"
                :disabled="isDisabledUser"
                placeholder="自定义个人 ID（3~24 位字母/数字/_/-，每 7 天可改一次）"
              />
              <button
                type="submit"
                class="btn-primary"
                style="white-space: nowrap"
                :disabled="savingPersonalId || isDisabledUser || !profileIdInput.trim() || profileIdInput.trim() === userPersonalId"
              >
                {{ savingPersonalId ? "保存中..." : "修改个人 ID（7天1次）" }}
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

        <!-- 我的全部帖子 & 日常（含私密管理） -->
        <section class="glass-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">📚 我的创作与私密空间</h2>
              <p class="section-sub">查看你发布过的全部帖子与日常，私密内容仅你自己登录后可见</p>
            </div>
            <button type="button" class="btn-primary" @click="openPostModal(false)">
              ＋ 写一篇私密帖子
            </button>
          </div>

          <div class="modal-tabs" style="margin-bottom: 16px">
            <button
              type="button"
              class="modal-tab"
              :class="{ active: myContentTab === 'posts' }"
              @click="myContentTab = 'posts'"
            >
              我发过的帖子 ({{ myAllPosts.length }})
            </button>
            <button
              type="button"
              class="modal-tab"
              :class="{ active: myContentTab === 'notes' }"
              @click="myContentTab = 'notes'"
            >
              我发过的日常 ({{ myAllNotes.length }})
            </button>
          </div>

          <!-- 我发过的帖子 -->
          <div v-if="myContentTab === 'posts'">
            <div v-if="myAllPosts.length === 0" class="empty-state">
              你还没有发布过帖子，点击右上角「＋ 发帖」开始创作吧~
            </div>
            <div v-else class="pyq-feed">
              <article v-for="post in myAllPosts" :key="post.id" class="pyq-item">
                <div class="pyq-avatar" :class="{ 'private-av': !post.is_public }">
                  {{ post.is_public ? getInitials(post.author_name) : "🔒" }}
                </div>
                <div class="pyq-body">
                  <div class="pyq-top">
                    <div class="row-gap">
                      <span class="pyq-author">{{ post.author_name }}</span>
                      <span class="card-meta">❤️ {{ post.like_count }} · 💬 {{ post.comment_count }}</span>
                    </div>
                    <span class="vis-badge" :class="post.is_public ? 'public' : 'private'">
                      {{ post.is_public ? "🌐 社区公开" : "🔒 仅自己可见" }}
                    </span>
                  </div>
                  <h3 class="pyq-title" @click="readingPost = post">{{ post.title }}</h3>
                  <p class="pyq-content clamped">{{ post.content }}</p>
                  <div class="pyq-footer">
                    <span>{{ formatTime(post.created_at) }}</span>
                    <div class="pyq-actions">
                      <button type="button" class="btn-mini" @click="readingPost = post">展开全文</button>
                      <button type="button" class="btn-mini" @click="handleTogglePostVisibility(post)">
                        {{ post.is_public ? "设为私密" : "转为社区公开" }}
                      </button>
                      <button type="button" class="btn-danger-sm" @click="handleDeletePost(post.id)">
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </div>

          <!-- 我发过的日常 -->
          <div v-else>
            <div v-if="myAllNotes.length === 0" class="empty-state">
              你还没有发布过日常动态~
            </div>
            <div v-else class="feed-list">
              <div v-for="note in myAllNotes" :key="note.id" class="moment-card">
                <div class="card-meta">
                  <div class="row-gap">
                    <span class="vis-badge" :class="note.is_public ? 'public' : 'private'">
                      {{ note.is_public ? "🌐 公开" : "🔒 私密" }}
                    </span>
                    <span class="mood-badge">{{ note.mood || "日常" }}</span>
                  </div>
                  <div class="row-gap">
                    <span>{{ formatTime(note.created_at) }}</span>
                    <button type="button" class="btn-mini" @click="handleToggleNoteVisibility(note)">
                      {{ note.is_public ? "设为私密" : "转为公开" }}
                    </button>
                    <button type="button" class="btn-danger-sm" @click="handleDeleteNote(note.id)">
                      删除
                    </button>
                  </div>
                </div>
                <p class="card-text">{{ note.content }}</p>
              </div>
            </div>
          </div>
        </section>
      </template>
    </main>

    <footer class="site-footer">
      <p>© 2026 Secr3tZL Based on Cloudflare+Typescript</p>
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
                <span class="vis-option-desc">仅存入「用户中心」，其他人不可见</span>
              </button>
            </div>
          </div>

          <div class="flex-end">
            <button type="button" class="btn-ghost" @click="showPostModal = false">取消</button>
            <button type="submit" class="btn-primary" :disabled="publishingPost || !postTitle.trim() || !postContent.trim()">
              {{ publishingPost ? "发布中..." : postIsPublic ? "发布到社区" : "保存私密帖子" }}
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

  <!-- 公告详情弹窗 -->
  <div v-if="activeAnnouncement" class="modal-backdrop" @click="activeAnnouncement = null">
    <div class="modal-box modal-wide" @click.stop>
      <div class="section-header" style="margin-bottom: 0">
        <div class="row-gap">
          <span class="vis-badge public">📢 站点公告</span>
          <h2 class="section-title" style="font-size: 20px">{{ activeAnnouncement.title }}</h2>
        </div>
        <button type="button" class="btn-ghost" @click="activeAnnouncement = null">关闭</button>
      </div>
      <div class="card-meta">
        <span>发布人：{{ activeAnnouncement.author_name }}</span>
        <span>发布时间：{{ formatTime(activeAnnouncement.created_at) }}</span>
      </div>
      <div class="card-text read-body">{{ activeAnnouncement.content }}</div>

      <div v-if="announcements.length > 1" style="margin-top: 8px">
        <div class="sub-heading">全部历史公告（{{ announcements.length }} 条）</div>
        <div class="feed-list">
          <div
            v-for="a in announcements"
            :key="a.id"
            class="moment-card"
            style="cursor: pointer; padding: 12px 14px"
            @click="activeAnnouncement = a"
          >
            <div class="card-meta">
              <strong style="color: var(--text-main)">{{ a.title }}</strong>
              <span>{{ formatTime(a.created_at) }}</span>
            </div>
          </div>
        </div>
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
              <button
                type="button"
                class="btn-primary"
                style="padding: 7px 14px; font-size: 13px"
                @click="
                  openDirectChat(
                    viewingProfile.user.id,
                    viewingProfile.user.username,
                    viewingProfile.user.uid
                  )
                "
              >
                💬 发私聊
              </button>
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
