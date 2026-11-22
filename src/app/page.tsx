"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

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

export default function HomePage() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authMsg, setAuthMsg] = useState("");

  const [posts, setPosts] = useState<Post[]>([]);
  const [title, setTitle] = useState("");
  const [postContent, setPostContent] = useState("");

  const [notes, setNotes] = useState<DailyNote[]>([]);
  const [noteContent, setNoteContent] = useState("");
  const [mood, setMood] = useState("日常");

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    if (!url || url.includes("placeholder")) return;

    supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user?.email ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    fetchPosts();
    fetchNotes();
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSignUp() {
    setAuthMsg("");
    const { error } = await supabase.auth.signUp({
      email: emailInput,
      password: passwordInput,
    });
    setAuthMsg(error ? error.message : "注册成功！请查收验证邮件或直接登录。");
  }

  async function handleSignIn() {
    setAuthMsg("");
    const { error } = await supabase.auth.signInWithPassword({
      email: emailInput,
      password: passwordInput,
    });
    setAuthMsg(error ? error.message : "登录成功！");
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  async function fetchPosts() {
    const { data } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setPosts(data);
  }

  async function handlePublishPost(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !postContent.trim()) return;
    await supabase.from("posts").insert({
      title,
      content: postContent,
      author_email: userEmail ?? "访客",
    });
    setTitle("");
    setPostContent("");
    fetchPosts();
  }

  async function fetchNotes() {
    const { data } = await supabase
      .from("daily_notes")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setNotes(data);
  }

  async function handlePublishNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteContent.trim()) return;
    await supabase.from("daily_notes").insert({
      content: noteContent,
      mood,
      author_email: userEmail ?? "访客",
    });
    setNoteContent("");
    fetchNotes();
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 max-w-4xl mx-auto space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold">secr3tzl123.top</h1>
          <p className="text-sm text-slate-400">个人博客 · 日常分享 · 登录系统</p>
        </div>
        <div className="text-sm">
          {userEmail ? (
            <div className="flex items-center gap-3">
              <span className="text-emerald-400">{userEmail}</span>
              <button
                onClick={handleSignOut}
                className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700"
              >
                退出
              </button>
            </div>
          ) : (
            <span className="text-slate-400">未登录</span>
          )}
        </div>
      </header>

      {!userEmail && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <h2 className="text-lg font-semibold">用户登录 / 注册</h2>
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              placeholder="邮箱"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm"
            />
            <input
              type="password"
              placeholder="密码（至少6位）"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm"
            />
            <button
              onClick={handleSignIn}
              className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm font-medium"
            >
              登录
            </button>
            <button
              onClick={handleSignUp}
              className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 text-sm font-medium"
            >
              注册
            </button>
          </div>
          {authMsg && <p className="text-sm text-amber-300">{authMsg}</p>}
        </section>
      )}

      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">分享日常</h2>
        <form onSubmit={handlePublishNote} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <select
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm"
            >
              <option value="日常">日常</option>
              <option value="记录">记录</option>
              <option value="碎碎念">碎碎念</option>
              <option value="推荐">推荐</option>
            </select>
            <input
              type="text"
              placeholder="发一条今天的日常..."
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              className="flex-1 min-w-[220px] px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-sm font-medium"
            >
              发日常
            </button>
          </div>
        </form>

        <div className="space-y-2 pt-1">
          {notes.map((note) => (
            <div
              key={note.id}
              className="border border-slate-800 rounded-lg px-4 py-3 bg-slate-950/60 flex flex-col gap-1"
            >
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200">
                  {note.mood ?? "日常"}
                </span>
                <span>{note.author_email ?? "访客"}</span>
              </div>
              <p className="text-sm text-slate-200 whitespace-pre-wrap">{note.content}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">博客文章</h2>
        <form onSubmit={handlePublishPost} className="space-y-3">
          <input
            type="text"
            placeholder="文章标题"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm"
          />
          <textarea
            rows={4}
            placeholder="写一篇博客..."
            value={postContent}
            onChange={(e) => setPostContent(e.target.value)}
            className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-sm"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-sm font-medium"
          >
            发布文章
          </button>
        </form>

        <div className="space-y-3 pt-2">
          {posts.map((post) => (
            <article
              key={post.id}
              className="border border-slate-800 rounded-lg p-4 bg-slate-950/60 space-y-1"
            >
              <h3 className="font-semibold text-base">{post.title}</h3>
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{post.content}</p>
              <p className="text-xs text-slate-500">
                作者：{post.author_email ?? "访客"}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}