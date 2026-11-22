"use client";

import React, { useEffect, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const isConfigured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseAnonKey) &&
  !supabaseUrl.includes("placeholder");

const supabase: SupabaseClient | null = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

interface Post {
  id: string;
  title: string;
  content: string;
  author_email: string | null;
  created_at: string;
}

interface DailyNote {
  id: string;
  content: string;
  mood: string | null;
  author_email: string | null;
  created_at: string;
}

type TabKey = "home" | "moments" | "blog";
type ThemeMode = "dark" | "light";

const MOODS = ["日常", "记录", "碎碎念", "推荐"];

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", {
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

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [clockText, setClockText] = useState<string>("--:--:--");

  // 账号状态
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [emailInput, setEmailInput] = useState<string>("");
  const [passwordInput, setPasswordInput] = useState<string>("");
  const [authMsg, setAuthMsg] = useState<string>("");
  const [authBusy, setAuthBusy] = useState<boolean>(false);

  // 数据状态
  const [notes, setNotes] = useState<DailyNote[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);

  // 发布动态状态
  const [noteContent, setNoteContent] = useState<string>("");
  const [mood, setMood] = useState<string>("日常");
  const [publishingNote, setPublishingNote] = useState<boolean>(false);

  // 发布博客状态
  const [showPostEditor, setShowPostEditor] = useState<boolean>(false);
  const [postTitle, setPostTitle] = useState<string>("");
  const [postContent, setPostContent] = useState<string>("");
  const [publishingPost, setPublishingPost] = useState<boolean>(false);
  const [readingPost, setReadingPost] = useState<Post | null>(null);

  // 主题初始化
  useEffect(() => {
    const saved = localStorage.getItem("secr3tzl_theme");
    const initial: ThemeMode = saved === "light" ? "light" : "dark";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  function toggleTheme() {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("secr3tzl_theme", next);
  }

  // 实时时钟
  useEffect(() => {
    const updateClock = () => {
      setClockText(
        new Date().toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // 读取登录状态与数据
  async function fetchAllData() {
    if (!supabase) {
      setLoadingData(false);
      return;
    }
    setLoadingData(true);
    const [notesRes, postsRes] = await Promise.all([
      supabase
        .from("daily_notes")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("posts")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    if (!notesRes.error && notesRes.data) {
      setNotes(notesRes.data as DailyNote[]);
    }
    if (!postsRes.error && postsRes.data) {
      setPosts(postsRes.data as Post[]);
    }
    setLoadingData(false);
  }

  useEffect(() => {
    fetchAllData();
    if (!supabase) return;

    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUserEmail(session?.user?.email ?? null);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // 登录 / 注册
  async function handleAuthSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) {
      setAuthMsg("Supabase 环境变量未配置");
      return;
    }
    if (!emailInput.trim() || !passwordInput.trim()) {
      setAuthMsg("请输入邮箱和密码");
      return;
    }
    setAuthBusy(true);
    setAuthMsg("");

    if (authMode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email: emailInput.trim(),
        password: passwordInput,
      });
      if (error) {
        setAuthMsg(`登录失败：${error.message}`);
      } else {
        setShowAuthModal(false);
        setPasswordInput("");
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email: emailInput.trim(),
        password: passwordInput,
      });
      if (error) {
        setAuthMsg(`注册失败：${error.message}`);
      } else {
        setAuthMsg("注册成功！如已关闭邮箱验证，现在可直接登录。");
        setAuthMode("login");
      }
    }
    setAuthBusy(false);
  }

  async function handleLogout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUserEmail(null);
  }

  // 发布日常
  async function handlePublishNote(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase || !noteContent.trim()) return;
    setPublishingNote(true);
    const { error } = await supabase.from("daily_notes").insert({
      content: noteContent.trim(),
      mood,
      author_email: userEmail ?? "访客",
    });
    setPublishingNote(false);
    if (!error) {
      setNoteContent("");
      fetchAllData();
    }
  }

  async function handleDeleteNote(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from("daily_notes").delete().eq("id", id);
    if (!error) {
      setNotes((prev) => prev.filter((item) => item.id !== id));
    }
  }

  // 发布博客
  async function handlePublishPost(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase || !postTitle.trim() || !postContent.trim()) return;
    setPublishingPost(true);
    const { error } = await supabase.from("posts").insert({
      title: postTitle.trim(),
      content: postContent.trim(),
      author_email: userEmail ?? "访客",
    });
    setPublishingPost(false);
    if (!error) {
      setPostTitle("");
      setPostContent("");
      setShowPostEditor(false);
      fetchAllData();
    }
  }

  async function handleDeletePost(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from("posts").delete().eq("id", id);
    if (!error) {
      setPosts((prev) => prev.filter((item) => item.id !== id));
      if (readingPost?.id === id) setReadingPost(null);
    }
  }

  return (
    <div className="site-wrapper">
      {/* 顶部悬浮毛玻璃导航 */}
      <div className="nav-wrap">
        <header className="glass-nav">
          <button
            type="button"
            className="brand-btn"
            onClick={() => setActiveTab("home")}
          >
            <span className="brand-avatar">ZL</span>
            <span>Secr3tZL&apos;s base</span>
          </button>

          <nav className="nav-links" aria-label="主导航">
            <button
              type="button"
              className={`nav-pill ${activeTab === "home" ? "active" : ""}`}
              onClick={() => setActiveTab("home")}
            >
              首页
            </button>
            <button
              type="button"
              className={`nav-pill ${activeTab === "moments" ? "active" : ""}`}
              onClick={() => setActiveTab("moments")}
            >
              动态 Moments
            </button>
            <button
              type="button"
              className={`nav-pill ${activeTab === "blog" ? "active" : ""}`}
              onClick={() => setActiveTab("blog")}
            >
              博客 Blog
            </button>
          </nav>

          <div className="nav-actions">
            <button
              type="button"
              className="icon-btn"
              onClick={toggleTheme}
              title="切换深色/浅色主题"
            >
              {theme === "dark" ? "☀️ 浅色" : "🌙 深色"}
            </button>

            {userEmail ? (
              <button
                type="button"
                className="icon-btn"
                onClick={handleLogout}
                title={`当前登录：${userEmail}，点击退出`}
              >
                退出 ({userEmail.split("@")[0]})
              </button>
            ) : (
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  setAuthMsg("");
                  setShowAuthModal(true);
                }}
              >
                登录 / 注册
              </button>
            )}
          </div>
        </header>
      </div>

      {/* 主体内容 */}
      <main className="main-container">
        {activeTab === "home" && (
          <>
            {/* 个人基地 Hero + 状态卡片 */}
            <section className="hero-grid">
              <div className="glass-card hero-main">
                <div className="hero-profile">
                  <div className="hero-avatar">ZL</div>
                  <div>
                    <h1 className="hero-title">Secr3tZL&apos;s base</h1>
                    <p className="hero-subtitle">
                      记录日常碎碎念、折腾技术与博客文章的个人小站
                    </p>
                  </div>
                </div>

                <div className="tag-row">
                  <span className="tag-chip">
                    <span className="status-dot" />
                    站点运行中
                  </span>
                  <span className="tag-chip">secr3tzl123.top</span>
                  <span className="tag-chip">Next.js · Supabase</span>
                </div>
              </div>

              <div className="glass-card bento-side">
                <div className="clock-box">
                  <div className="clock-label">当前本地时间</div>
                  <div className="clock-time">{clockText}</div>
                </div>

                <div className="stats-row">
                  <div className="stat-card">
                    <div className="stat-num">{notes.length}</div>
                    <div className="stat-label">日常动态</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-num">{posts.length}</div>
                    <div className="stat-label">博客文章</div>
                  </div>
                </div>
              </div>
            </section>

            {/* 最新动态预览 */}
            <section className="glass-card">
              <div className="section-header">
                <h2 className="section-title">最新动态 · Moments</h2>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setActiveTab("moments")}
                >
                  查看全部 / 发布 →
                </button>
              </div>

              {loadingData ? (
                <div className="empty-state">加载中...</div>
              ) : notes.length === 0 ? (
                <div className="empty-state">还没有动态，去发布第一条吧~</div>
              ) : (
                <div className="feed-list">
                  {notes.slice(0, 3).map((note) => (
                    <div key={note.id} className="moment-card">
                      <div className="card-meta">
                        <span className="mood-badge">
                          {note.mood || "日常"}
                        </span>
                        <span>{formatTime(note.created_at)}</span>
                      </div>
                      <p className="card-text">{note.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 最新博客预览 */}
            <section className="glass-card">
              <div className="section-header">
                <h2 className="section-title">精选博客 · Blog</h2>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setActiveTab("blog")}
                >
                  全部文章 / 写文章 →
                </button>
              </div>

              {loadingData ? (
                <div className="empty-state">加载中...</div>
              ) : posts.length === 0 ? (
                <div className="empty-state">还没有博客文章，去写第一篇吧~</div>
              ) : (
                <div className="blog-grid">
                  {posts.slice(0, 4).map((post) => (
                    <article
                      key={post.id}
                      className="blog-card"
                      onClick={() => setReadingPost(post)}
                    >
                      <div>
                        <h3 className="blog-title">{post.title}</h3>
                        <p className="blog-excerpt" style={{ marginTop: 8 }}>
                          {post.content}
                        </p>
                      </div>
                      <div className="card-meta">
                        <span>{post.author_email || "站长"}</span>
                        <span>{formatTime(post.created_at)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {activeTab === "moments" && (
          <section className="glass-card">
            <div className="section-header">
              <h2 className="section-title">分享日常 · Moments</h2>
              <span style={{ fontSize: 13, color: "var(--text-subtle)" }}>
                共 {notes.length} 条记录
              </span>
            </div>

            {userEmail ? (
              <form onSubmit={handlePublishNote} className="composer-form">
                <textarea
                  className="field-textarea"
                  style={{ minHeight: 84 }}
                  placeholder="此刻在想什么？记录一条今天的日常..."
                  value={noteContent}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setNoteContent(e.target.value)
                  }
                />
                <div className="mood-bar">
                  <div className="mood-pills">
                    {MOODS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`mood-pill ${mood === m ? "active" : ""}`}
                        onClick={() => setMood(m)}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={publishingNote || !noteContent.trim()}
                  >
                    {publishingNote ? "发布中..." : "发布动态"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="notice-bar" style={{ marginBottom: 20 }}>
                <span>登录后即可发布新的日常动态</span>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setShowAuthModal(true)}
                >
                  立即登录
                </button>
              </div>
            )}

            <div className="feed-list">
              {notes.length === 0 ? (
                <div className="empty-state">暂无动态</div>
              ) : (
                notes.map((note) => (
                  <div key={note.id} className="moment-card">
                    <div className="card-meta">
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span className="mood-badge">{note.mood || "日常"}</span>
                        <span>{note.author_email || "站长"}</span>
                      </div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span>{formatTime(note.created_at)}</span>
                        {userEmail && userEmail === note.author_email && (
                          <button
                            type="button"
                            className="btn-danger-sm"
                            onClick={() => handleDeleteNote(note.id)}
                          >
                            删除
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="card-text">{note.content}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {activeTab === "blog" && (
          <section className="glass-card">
            <div className="section-header">
              <h2 className="section-title">博客文章 · Blog</h2>
              {userEmail ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setShowPostEditor((v) => !v)}
                >
                  {showPostEditor ? "收起编辑器" : "+ 写新文章"}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setShowAuthModal(true)}
                >
                  登录后写文章
                </button>
              )}
            </div>

            {userEmail && showPostEditor && (
              <form onSubmit={handlePublishPost} className="composer-form">
                <input
                  type="text"
                  className="field-input"
                  placeholder="输入文章标题..."
                  value={postTitle}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setPostTitle(e.target.value)
                  }
                />
                <textarea
                  className="field-textarea"
                  style={{ minHeight: 180 }}
                  placeholder="写下你的博客正文..."
                  value={postContent}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setPostContent(e.target.value)
                  }
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setShowPostEditor(false)}
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={
                      publishingPost || !postTitle.trim() || !postContent.trim()
                    }
                  >
                    {publishingPost ? "发布中..." : "发布文章"}
                  </button>
                </div>
              </form>
            )}

            {posts.length === 0 ? (
              <div className="empty-state">暂无博客文章</div>
            ) : (
              <div className="blog-grid">
                {posts.map((post) => (
                  <article
                    key={post.id}
                    className="blog-card"
                    onClick={() => setReadingPost(post)}
                  >
                    <div>
                      <h3 className="blog-title">{post.title}</h3>
                      <p className="blog-excerpt" style={{ marginTop: 8 }}>
                        {post.content}
                      </p>
                    </div>
                    <div className="card-meta">
                      <span>{formatTime(post.created_at)}</span>
                      {userEmail && userEmail === post.author_email && (
                        <button
                          type="button"
                          className="btn-danger-sm"
                          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation();
                            handleDeletePost(post.id);
                          }}
                        >
                          删除
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {/* 页脚 */}
      <footer className="site-footer">
        <p>
          © 2026 Secr3tZL&apos;s base · Cloudflare Pages 提供静态部署服务 ·
          Supabase 驱动数据与账号
        </p>
      </footer>

      {/* 登录 / 注册弹窗 */}
      {showAuthModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowAuthModal(false)}
        >
          <div
            className="modal-box"
            onClick={(e: React.MouseEvent<HTMLDivElement>) =>
              e.stopPropagation()
            }
          >
            <div className="section-header" style={{ marginBottom: 0 }}>
              <h3 className="section-title">账号中心</h3>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowAuthModal(false)}
              >
                关闭
              </button>
            </div>

            <div className="modal-tabs">
              <button
                type="button"
                className={`modal-tab ${authMode === "login" ? "active" : ""}`}
                onClick={() => {
                  setAuthMode("login");
                  setAuthMsg("");
                }}
              >
                立即登录
              </button>
              <button
                type="button"
                className={`modal-tab ${authMode === "register" ? "active" : ""}`}
                onClick={() => {
                  setAuthMode("register");
                  setAuthMsg("");
                }}
              >
                注册账号
              </button>
            </div>

            <form
              onSubmit={handleAuthSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <input
                type="email"
                className="field-input"
                placeholder="邮箱地址"
                value={emailInput}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEmailInput(e.target.value)
                }
              />
              <input
                type="password"
                className="field-input"
                placeholder="密码（至少 6 位）"
                value={passwordInput}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setPasswordInput(e.target.value)
                }
              />
              {authMsg && <p className="auth-msg">{authMsg}</p>}
              <button
                type="submit"
                className="btn-primary"
                disabled={authBusy}
              >
                {authBusy
                  ? "处理中..."
                  : authMode === "login"
                  ? "立即登录"
                  : "创建账号"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 文章全文阅读弹窗 */}
      {readingPost && (
        <div
          className="modal-backdrop"
          onClick={() => setReadingPost(null)}
        >
          <div
            className="modal-box modal-wide"
            onClick={(e: React.MouseEvent<HTMLDivElement>) =>
              e.stopPropagation()
            }
          >
            <div className="section-header" style={{ marginBottom: 0 }}>
              <h2 className="section-title" style={{ fontSize: 22 }}>
                {readingPost.title}
              </h2>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setReadingPost(null)}
              >
                关闭
              </button>
            </div>
            <div className="card-meta">
              <span>作者：{readingPost.author_email || "站长"}</span>
              <span>发布于 {formatTime(readingPost.created_at)}</span>
            </div>
            <div
              className="card-text"
              style={{
                paddingTop: 12,
                borderTop: "1px solid var(--border)",
                lineHeight: 1.85,
              }}
            >
              {readingPost.content}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}