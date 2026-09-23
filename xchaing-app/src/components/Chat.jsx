import { useEffect, useRef, useState } from "react";
import { ArrowLeft, LoaderCircle, MessageSquare, Send } from "lucide-react";
import { supabase, supabaseConfigurationError } from "../lib/supabase";

export default function Chat({ swapId, currentUserId, otherUser, onBack, isDarkMode }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [participant, setParticipant] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!supabase || !otherUser?.userId) return undefined;

    let cancelled = false;
    supabase
      .from("profiles")
      .select("full_name, username, email, avatar_url")
      .eq("id", otherUser.userId)
      .maybeSingle()
      .then(({ data, error: profileError }) => {
        if (cancelled) return;
        if (profileError) {
          console.error("Failed to load chat participant profile:", profileError);
          return;
        }
        setParticipant(data || null);
      });

    return () => {
      cancelled = true;
    };
  }, [otherUser?.userId]);

  useEffect(() => {
    if (!supabase || !swapId || !currentUserId) return undefined;

    let cancelled = false;
    const channel = supabase
      .channel(`swap-chat:${swapId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `swap_id=eq.${swapId}`,
        },
        (payload) => {
          if (!cancelled) {
            setMessages((currentMessages) => (
              currentMessages.some((message) => message.id === payload.new.id)
                ? currentMessages
                : [...currentMessages, payload.new]
            ));
          }
        },
      )
      .subscribe();

    supabase
      .from("messages")
      .select("*")
      .eq("swap_id", swapId)
      .order("created_at", { ascending: true })
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) setError(fetchError.message);
        else setMessages(data || []);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [currentUserId, swapId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    if (!supabase || !currentUserId || !swapId) {
      setError(supabaseConfigurationError || "ჩატის გასაგზავნად ავტორიზაციაა საჭირო.");
      return;
    }

    setSending(true);
    setError("");
    const { data, error: sendError } = await supabase
      .from("messages")
      .insert({ swap_id: swapId, sender_id: currentUserId, content })
      .select()
      .single();

    if (sendError) {
      setError(sendError.message);
    } else if (data) {
      setDraft("");
    }
    setSending(false);
  };

  return (
    <div className={`flex min-h-[calc(100vh-12rem)] flex-col ${isDarkMode ? "bg-slate-950/40" : "bg-slate-50"}`}>
      <header className={`flex items-center gap-3 border-b px-4 py-3 ${isDarkMode ? "border-slate-800" : "border-slate-200"}`}>
        <button type="button" onClick={onBack} className="inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-400 hover:text-white md:hidden" aria-label="ჩატების სიაში დაბრუნება">
          <ArrowLeft className="h-5 w-5" />
        </button>
        {participant?.avatar_url || otherUser?.avatar ? (
          <img
            src={participant?.avatar_url || otherUser.avatar}
            alt={participant?.full_name || participant?.username || otherUser?.name || "მომხმარებელი"}
            className="h-10 w-10 rounded-full border-2 border-[#FF5500]/40 object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#FF5500]/40 bg-[#FF5500]/10 text-[#FF5500]">
            <MessageSquare className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-black">
            {participant?.full_name || participant?.username || participant?.email || otherUser?.name || "მომხმარებელი"}
          </h2>
          <p className="truncate text-[10px] text-slate-400">გაცვლა: {otherUser?.itemTitle || "მიღებული მოთხოვნა"}</p>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {loading ? (
          <div className="flex min-h-48 items-center justify-center text-[#FF5500]"><LoaderCircle className="h-5 w-5 animate-spin" /></div>
        ) : messages.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center text-center text-xs text-slate-400">
            <MessageSquare className="mb-2 h-8 w-8 text-[#FF5500]" />
            დაიწყე საუბარი გაცვლის დეტალებზე.
          </div>
        ) : messages.map((message) => (
          <div key={message.id} className={`flex items-end gap-2 ${message.sender_id === currentUserId ? "justify-end" : "justify-start"}`}>
            {message.sender_id !== currentUserId && (
              participant?.avatar_url || otherUser?.avatar ? (
                <img
                  src={participant?.avatar_url || otherUser.avatar}
                  alt={participant?.full_name || participant?.username || "მომხმარებელი"}
                  className="h-7 w-7 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FF5500]/10 text-[#FF5500]">
                  <MessageSquare className="h-3.5 w-3.5" />
                </div>
              )
            )}
            <div className={`max-w-[80%] rounded-xl px-3 py-2 text-xs ${message.sender_id === currentUserId ? "rounded-br-none bg-[#FF5500] text-white" : "rounded-bl-none border border-slate-200 bg-white text-slate-800"}`}>
              {message.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {error && <p className="px-4 pb-2 text-xs text-red-400">{error}</p>}
      <form onSubmit={handleSubmit} className={`flex gap-2 border-t p-3 ${isDarkMode ? "border-slate-800" : "border-slate-200"}`}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="დაწერე შეტყობინება..."
          className={`min-h-11 flex-1 rounded-md border px-3 py-2 text-xs outline-none focus:border-[#FF5500] ${isDarkMode ? "border-slate-800 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-900"}`}
        />
        <button type="submit" disabled={sending || !draft.trim()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#FF5500] px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-60" aria-label="გაგზავნა">
          {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          გაგზავნა
        </button>
      </form>
    </div>
  );
}
