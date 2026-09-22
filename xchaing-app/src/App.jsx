import { useEffect, useRef, useState } from "react";
import { supabase, supabaseConfigurationError } from "./lib/supabase";
import {
  Menu,
  Sparkles,
  Search,
  SlidersHorizontal,
  Globe,
  X,
  Smartphone,
  Shirt,
  GraduationCap,
  Car,
  Home as HomeIcon,
  Dumbbell,
  Package,
  Plus,
  ArrowRight,
  Sun,
  Moon,
  User,
  ArrowLeftRight,
  ArrowLeft,
  Send,
  Clock,
  XCircle,
  Edit3,
  MapPin,
  Phone,
  Settings,
  Heart,
  PackageCheck,
  Star,
  MessageSquare,
  LogOut,
  Check,
  Flame,
  ShieldCheck,
  Trash2,
  Apple,
} from "lucide-react";

export default function App() {
  // Navigation & Theme State
  const [activeTab, setActiveTab] = useState("home"); // 'home' | 'matches' | 'chat' | 'profile'
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [lang, setLang] = useState("GE");

  // Modals & Sidebar State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [pendingAuthAction, setPendingAuthAction] = useState(null);

  // Auth State
  const [currentUser, setCurrentUser] = useState(null);
  const [profileAvatar, setProfileAvatar] = useState("");
  const [profileUsername, setProfileUsername] = useState("");
  const [profileSaveStatus, setProfileSaveStatus] = useState("");
  const [avatarUploadStatus, setAvatarUploadStatus] = useState("");
  const avatarInputRef = useRef(null);
  const [authMode, setAuthMode] = useState("signin"); // 'signin' | 'signup'
  const [authForm, setAuthForm] = useState({
    fullName: "",
    email: "",
    password: "",
  });

  // Listing Form State
  const [formData, setFormData] = useState({
    title: "",
    category: "Electronics",
    condition: "used",
    desiredTrade: "",
    image: null,
    comment: "",
  });
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [cameraError, setCameraError] = useState("");
  const [isCameraReady, setIsCameraReady] = useState(false);

  // Matches Page State & Filter
  const [matchesFilter, setMatchesFilter] = useState("incoming");
  const [selectedChatUser, setSelectedChatUser] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const messagesEndRef = useRef(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState(null);
  const [messageDraft, setMessageDraft] = useState("");
  const reactionOptions = ["❤️", "👍", "😂", "😮", "🔥"];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);
  const [chatConversations, setChatConversations] = useState([]);
  const [profileTab, setProfileTab] = useState("listings");
  const [profileForm, setProfileForm] = useState({ name: "", phone: "", location: "", bio: "" });
  const [profileListings, setProfileListings] = useState([]);
  const [profileHistory] = useState([]);
  const [savedListings] = useState([]);
  const [matches, setMatches] = useState([]);
  const [sentMatches, setSentMatches] = useState([]);

  useEffect(() => {
    if (!supabase) return undefined;

    const applySession = (user) => {
      if (user) {
        setCurrentUser({
          id: user.id,
          email: user.email,
          name: user.user_metadata?.full_name || user.email?.split("@")[0],
        });
        supabase.from("profiles").upsert({
          id: user.id,
          full_name: user.user_metadata?.full_name || user.email?.split("@")[0],
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" });
      } else {
        setCurrentUser(null);
        setIsModalOpen(false);
        setActiveTab((tab) => (tab === "home" ? tab : "home"));
      }
    };

    supabase.auth.getSession().then(({ data }) => applySession(data.session?.user));
    const { data: authSubscription } = supabase.auth.onAuthStateChange(
      (_event, session) => applySession(session?.user),
    );

    return () => authSubscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !currentUser?.id) return undefined;

    let channel;
    const loadDatabaseState = async () => {
      const [{ data: profile }, { data: allItems }, { data: messages }] = await Promise.all([
        supabase.from("profiles").select("full_name, username, bio, location, phone, avatar_url").eq("id", currentUser.id).maybeSingle(),
        supabase.from("items").select("*").order("created_at", { ascending: false }),
        supabase.from("messages").select("*").or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`).order("created_at", { ascending: false }),
      ]);

      if (profile) {
        setProfileForm({ name: profile.full_name || currentUser.name || "", phone: profile.phone || "", location: profile.location || "", bio: profile.bio || "" });
        setProfileUsername(profile.username || "");
        setProfileAvatar(profile.avatar_url || "");
      }

      const normalizedItems = allItems || [];
      setProfileListings(normalizedItems.filter((item) => (item.user_id || item.owner_id) === currentUser.id).map((item) => ({
        ...item,
        title: item.title || item.name,
        value: item.value || item.price || "",
        category: item.category || "",
        image: item.image_url || item.image || "",
      })));

      const otherUserIds = [...new Set((messages || []).map((message) => message.sender_id === currentUser.id ? message.receiver_id : message.sender_id).filter(Boolean))];
      if (otherUserIds.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", otherUserIds);
        const profileById = Object.fromEntries((profiles || []).map((item) => [item.id, item]));
        const latestByUser = new Map();
        (messages || []).forEach((message) => {
          const otherId = message.sender_id === currentUser.id ? message.receiver_id : message.sender_id;
          if (!latestByUser.has(otherId)) latestByUser.set(otherId, message);
        });
        setChatConversations([...latestByUser.entries()].map(([userId, message]) => ({
          id: userId,
          userId,
          name: profileById[userId]?.full_name || "მომხმარებელი",
          avatar: profileById[userId]?.avatar_url || "",
          itemTitle: "",
          itemImage: "",
          lastMessageText: message.content,
          timeAgo: new Date(message.created_at).toLocaleDateString("ka-GE"),
          unreadCount: 0,
        })));
      } else {
        setChatConversations([]);
      }

      const ownItems = normalizedItems.filter((item) => (item.user_id || item.owner_id) === currentUser.id);
      const otherItems = normalizedItems.filter((item) => (item.user_id || item.owner_id) && (item.user_id || item.owner_id) !== currentUser.id);
      const suggestions = ownItems.flatMap((ownItem) => otherItems.filter((otherItem) => {
        const wanted = String(otherItem.desired_trade || otherItem.desiredTrade || "").toLowerCase();
        return wanted && wanted.includes(String(ownItem.title || ownItem.name || "").toLowerCase());
      }).map((otherItem) => ({
        id: `${ownItem.id}-${otherItem.id}`,
        type: "incoming",
        myProduct: { title: ownItem.title || ownItem.name, image: ownItem.image_url || ownItem.image || "", estValue: ownItem.value || ownItem.price || "" },
        offeredProduct: { userId: otherItem.user_id || otherItem.owner_id, title: otherItem.title || otherItem.name, user: "მომხმარებელი", rating: 0, image: otherItem.image_url || otherItem.image || "", estValue: otherItem.value || otherItem.price || "" },
        matchScore: 80,
        status: "pending",
        aiComment: "ეს შეთავაზება დაფუძნებულია რეალურ ნივთებსა და გაცვლის სურვილზე.",
      })));
      setMatches(suggestions);
      setSentMatches([]);
    };

    loadDatabaseState();
    if (selectedChatUser?.userId) {
      channel = supabase.channel(`messages:${currentUser.id}:${selectedChatUser.userId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const message = payload.new;
        if ((message.sender_id === selectedChatUser.userId && message.receiver_id === currentUser.id) || (message.sender_id === currentUser.id && message.receiver_id === selectedChatUser.userId)) setChatMessages((currentMessages) => [...currentMessages, message]);
      }).subscribe();
    }
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [currentUser?.id, currentUser?.name, selectedChatUser?.userId]);

  useEffect(() => {
    if (!supabase || !currentUser?.id || !selectedChatUser?.userId) return;
    supabase.from("messages").select("*").or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedChatUser.userId}),and(sender_id.eq.${selectedChatUser.userId},receiver_id.eq.${currentUser.id})`).order("created_at", { ascending: true }).then(({ data }) => setChatMessages(data || []));
  }, [currentUser?.id, selectedChatUser?.userId]);

  useEffect(() => {
    if (!isModalOpen) return undefined;

    let cancelled = false;
    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("ამ მოწყობილობაზე კამერა მიუწვდომელია");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsCameraReady(true);
        }
      } catch (error) {
        setCameraError(
          error.name === "NotAllowedError"
            ? "კამერის გამოყენებისთვის ნებართვა ჩართე"
            : "კამერის ჩართვა ვერ მოხერხდა",
        );
      }
    };

    startCamera();
    return () => {
      cancelled = true;
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      setIsCameraReady(false);
    };
  }, [isModalOpen]);
  const categories = [
    { name: lang === "GE" ? "ტექნიკა" : "Electronics", icon: Smartphone },
    { name: lang === "GE" ? "ტანსაცმელი" : "Clothing", icon: Shirt },
    { name: lang === "GE" ? "მომსახურება" : "Services", icon: GraduationCap },
    { name: lang === "GE" ? "ავტო" : "Vehicles", icon: Car },
    { name: lang === "GE" ? "სახლი & ბაღი" : "Home & Garden", icon: HomeIcon },
    { name: lang === "GE" ? "სპორტი" : "Sports", icon: Dumbbell },
    { name: lang === "GE" ? "სხვა" : "Other", icon: Package },
  ];

  // Handlers
  const handleProtectedNavigation = (target) => {
    if (currentUser) {
      if (target === "listing") setIsModalOpen(true);
      else setActiveTab(target);
      return;
    }

    setPendingAuthAction(target);
    setIsAuthModalOpen(true);
  };

  const completePendingAuthAction = () => {
    if (pendingAuthAction === "listing") setIsModalOpen(true);
    else if (pendingAuthAction) setActiveTab(pendingAuthAction);
    setPendingAuthAction(null);
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    if (!supabase) {
      alert(supabaseConfigurationError || "Supabase არ არის კონფიგურირებული.");
      return;
    }

    try {
      const authResult =
        authMode === "signup"
          ? await supabase.auth.signUp({
              email: authForm.email,
              password: authForm.password,
              options: {
                data: { full_name: authForm.fullName },
              },
            })
          : await supabase.auth.signInWithPassword({
              email: authForm.email,
              password: authForm.password,
            });

      if (authResult.error) throw authResult.error;
      if (authResult.data.session) completePendingAuthAction();
      else if (authMode === "signup") alert("რეგისტრაცია დასრულდა. ანგარიშის გასააქტიურებლად შეამოწმე ელ. ფოსტა.");
    } catch (error) {
      alert(error.message);
      return;
    }
    setIsAuthModalOpen(false);
    setAuthForm({ fullName: "", email: "", password: "" });
  };

  const handleSocialAuth = async (provider) => {
    if (supabase) {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider.toLowerCase(),
        options: { redirectTo: window.location.origin },
      });
      if (error) alert(error.message);
      return;
    }

    alert(supabaseConfigurationError || "Supabase არ არის კონფიგურირებული.");
  };

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setCurrentUser(null);
    setActiveTab("home");
  };

  const handleMatchAction = (id, newStatus) => {
    setMatches(
      matches.map((m) => (m.id === id ? { ...m, status: newStatus } : m)),
    );
  };

  const handleCancelSentOffer = (id) => {
    setSentMatches(sentMatches.filter((match) => match.id !== id));
  };

  const handleOpenChat = ({ userId, name, avatar, itemTitle, itemImage }) => {
    if (!userId) return;
    setSelectedChatUser({ userId, name, avatar, itemTitle, itemImage });
    setActiveTab("chat");
  };

  const handleSelectConversation = (conversation) => {
    setSelectedChatUser(conversation);
  };

  const handleAvatarUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!supabase || !currentUser?.id) {
      setAvatarUploadStatus("დააკავშირე Supabase ავატარის ასატვირთად");
      return;
    }

    setAvatarUploadStatus("იტვირთება...");
    const filePath = `${currentUser.id}/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      setAvatarUploadStatus(uploadError.message);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(filePath);
    const avatarUrl = publicUrlData.publicUrl;
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({ id: currentUser.id, avatar_url: avatarUrl }, { onConflict: "id" });

    if (profileError) {
      setAvatarUploadStatus(profileError.message);
      return;
    }

    setProfileAvatar(avatarUrl);
    setAvatarUploadStatus("ავატარი განახლდა");
  };

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    setProfileSaveStatus("ინახება...");

    const savedProfile = {
      name: profileForm.name.trim(),
      phone: profileForm.phone.trim(),
      location: profileForm.location.trim(),
      bio: profileForm.bio.trim(),
    };
    const savedUsername = profileUsername.trim();

    if (supabase && currentUser?.id) {
      const { error } = await supabase.from("profiles").upsert(
        {
          id: currentUser.id,
          full_name: savedProfile.name,
          username: savedUsername,
          phone: savedProfile.phone,
          location: savedProfile.location,
          bio: savedProfile.bio,
          avatar_url: profileAvatar,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

      if (error) {
        setProfileSaveStatus(error.message);
        return;
      }
    }

    setProfileForm(savedProfile);
    setProfileUsername(savedUsername);
    setProfileSaveStatus("პროფილი შენახულია");
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();
    const content = messageDraft.trim();
    if (!content || !selectedChatUser) return;

    if (!supabase || !currentUser?.id || !selectedChatUser.userId) {
      alert(supabaseConfigurationError || "ჩატის გასაგზავნად ავტორიზაციაა საჭირო.");
      setMessageDraft("");
      return;
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({
        sender_id: currentUser.id,
        receiver_id: selectedChatUser.userId,
        content,
      })
      .select()
      .single();

    if (error) {
      alert(error.message);
    } else if (data) {
      setChatMessages((currentMessages) => [...currentMessages, data]);
      setMessageDraft("");
    }
  };

  const handleMessageReaction = (messageId, reaction) => {
    setChatMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === messageId ? { ...message, reaction } : message,
      ),
    );
    setReactionPickerMessageId(null);
  };

  const isOwnMessage = (message) =>
    message.isMe === true ||
    message.sender_id === currentUser?.id ||
    message.user_id === currentUser?.id;

  const handleMarkListingTraded = (id) => {
    setProfileListings((listings) =>
      listings.filter((listing) => listing.id !== id),
    );
  };

  const handleDeleteNotification = (id) => {
    setMatches((currentMatches) =>
      currentMatches.filter((match) => match.id !== id),
    );
    setSentMatches((currentSentMatches) =>
      currentSentMatches.filter((match) => match.id !== id),
    );
  };

  const handleClearResolvedNotifications = () => {
    setMatches((currentMatches) =>
      currentMatches.filter((match) => match.status === "pending"),
    );
    setSentMatches((currentSentMatches) =>
      currentSentMatches.filter((match) => match.status === "pending"),
    );
  };

  const handleCapturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !isCameraReady) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const previewUrl = URL.createObjectURL(blob);
      setCapturedPhoto((previousPhoto) => {
        if (previousPhoto?.previewUrl) URL.revokeObjectURL(previousPhoto.previewUrl);
        return { blob, previewUrl };
      });
      setFormData((currentForm) => ({ ...currentForm, image: previewUrl }));
    }, "image/jpeg", 0.9);
  };

  const handleRetakePhoto = () => {
    setCapturedPhoto((previousPhoto) => {
      if (previousPhoto?.previewUrl) URL.revokeObjectURL(previousPhoto.previewUrl);
      return null;
    });
    setFormData((currentForm) => ({ ...currentForm, image: null }));
  };

  const handleUsePhoto = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setIsCameraReady(false);
  };

  const handleCloseListingModal = () => {
    setIsModalOpen(false);
    setCapturedPhoto((previousPhoto) => {
      if (previousPhoto?.previewUrl) URL.revokeObjectURL(previousPhoto.previewUrl);
      return null;
    });
    setFormData({
      title: "",
      category: "Electronics",
      condition: "used",
      desiredTrade: "",
      image: null,
      comment: "",
    });
  };

  const handleAddListing = async (e) => {
    e.preventDefault();

    if (!capturedPhoto?.blob) {
      alert("განცხადების დასამატებლად გადაიღე ნივთის ფოტო კამერით.");
      return;
    }

    if (!supabase || !currentUser?.id) {
      alert(supabaseConfigurationError || "განცხადების დასამატებლად ავტორიზაციაა საჭირო.");
      return;
    }

    const filePath = `${currentUser.id}/${crypto.randomUUID()}.jpg`;
    const { error: uploadError } = await supabase.storage.from("listings").upload(filePath, capturedPhoto.blob, { contentType: "image/jpeg", upsert: false });
    if (uploadError) {
      alert(uploadError.message);
      return;
    }
    const { data: publicUrlData } = supabase.storage.from("listings").getPublicUrl(filePath);
    const { error: itemError } = await supabase.from("items").insert({
      user_id: currentUser.id,
      title: formData.title,
      category: formData.category,
      condition: formData.condition,
      desired_trade: formData.desiredTrade,
      description: formData.comment,
      image_url: publicUrlData.publicUrl,
      status: "active",
    });
    if (itemError) {
      alert(itemError.message);
      return;
    }

    alert("განცხადება წარმატებით დაემატა AI ანალიზისთვის! (საფასური: 1.00 ₾)");
    handleCloseListingModal();
  };

  const filteredMatches = matches.filter((m) => {
    if (matchesFilter === "incoming")
      return m.type === "incoming" && m.status === "pending";
    if (matchesFilter === "completed") return m.status !== "pending";
    if (matchesFilter === "sent") return false;
    return true;
  });

  return (
    <div
      className={`min-h-screen font-sans relative overflow-x-hidden pb-[calc(5rem+env(safe-area-inset-bottom))] transition-colors duration-300 ${
        isDarkMode
          ? "bg-slate-950 text-slate-100"
          : "bg-slate-50 text-slate-900"
      }`}
    >
      {/* 1. FIXED & TRANSPARENT HEADER */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 px-2.5 min-[360px]:px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-1 min-[360px]:gap-2 transition-all duration-300 bg-slate-950/40 backdrop-blur-xl border-b shadow-lg ${
          isDarkMode
            ? "border-white/10 shadow-black/20"
            : "bg-white/40 border-black/5 shadow-slate-200/50"
        }`}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className={`min-h-10 min-w-10 shrink-0 p-2 rounded-md transition flex items-center justify-center ${
              isDarkMode
                ? "hover:bg-white/10 text-slate-200"
                : "hover:bg-slate-200/60 text-slate-700"
            } hover:text-[#FF5500]`}
          >
            <Menu className="w-5 h-5" />
          </button>

          <div
            onClick={() => setActiveTab("home")}
            className="text-lg sm:text-xl font-black tracking-tight flex items-center cursor-pointer shrink-0"
          >
            <span className="text-[#FF5500] font-extrabold text-2xl">X</span>
            <span
              className={`font-medium text-sm ${isDarkMode ? "text-slate-300" : "text-slate-600"}`}
            >
              chain
            </span>
            <span className="text-[#FF5500] font-extrabold text-2xl">G</span>
          </div>
        </div>

        <div className="flex items-center gap-1 min-[360px]:gap-2 shrink-0">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`min-h-10 min-w-10 shrink-0 p-2 rounded-md transition flex items-center justify-center ${
              isDarkMode
                ? "bg-slate-900/80 text-amber-400 hover:bg-slate-800 border border-slate-800"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 shadow-sm"
            }`}
          >
            {isDarkMode ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>

          {currentUser ? (
            <div className="flex items-center gap-2">
              <div
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs font-bold max-w-[120px] sm:max-w-none ${
                  isDarkMode
                    ? "bg-slate-900 border-slate-800 text-slate-200"
                    : "bg-white border-slate-200 text-slate-800"
                }`}
              >
                <div className="w-5 h-5 rounded-full bg-[#FF5500]/20 text-[#FF5500] flex items-center justify-center">
                  <User className="w-3.5 h-3.5" />
                </div>
                <span className="truncate max-w-[72px] sm:max-w-[90px] max-[359px]:hidden">
                  {currentUser.name}
                </span>
              </div>

              <button
                onClick={handleLogout}
                title="გამოსვლა"
                className={`min-h-10 min-w-10 p-1.5 rounded-md transition text-slate-400 hover:text-red-500 border flex items-center justify-center ${
                  isDarkMode
                    ? "bg-slate-900 border-slate-800 hover:bg-slate-800"
                    : "bg-white border-slate-200 hover:bg-slate-100"
                }`}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className={`min-h-10 min-w-10 px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-bold transition flex items-center justify-center gap-1.5 border whitespace-nowrap ${
                isDarkMode
                  ? "bg-slate-900/80 text-slate-200 hover:bg-slate-800 border-slate-800 hover:text-[#FF5500]"
                  : "bg-white text-slate-700 hover:bg-slate-100 border-slate-200 shadow-sm hover:text-[#FF5500]"
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span className="max-[359px]:hidden">{lang === "GE" ? "შესვლა" : "Sign In"}</span>
            </button>
          )}
        </div>
      </header>

      {/* 2. SIDEBAR */}
      <div
        className={`fixed inset-0 z-50 transition-all duration-300 ${
          isSidebarOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        <div
          onClick={() => setIsSidebarOpen(false)}
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ease-in-out ${
            isSidebarOpen ? "opacity-100" : "opacity-0"
          }`}
        />

        <div
          className={`relative border-r w-64 max-w-[80%] h-full p-5 flex flex-col justify-between z-10 transform transition-transform duration-300 ease-out backdrop-blur-xl ${
            isSidebarOpen ? "translate-x-0" : "-translate-x-full"
          } ${
            isDarkMode
              ? "bg-slate-900/60 border-slate-800 text-slate-100"
              : "bg-white/60 border-slate-200 text-slate-900"
          }`}
        >
          <div>
            <div
              className={`flex justify-between items-center mb-6 border-b pb-3 ${
                isDarkMode ? "border-slate-800" : "border-slate-100"
              }`}
            >
              <div className="text-lg font-black">
                <span className="text-[#FF5500]">X</span>
                <span
                  className={`font-normal text-xs ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}
                >
                  chain
                </span>
                <span className="text-[#FF5500]">G</span>
              </div>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="p-1 text-slate-400 hover:text-[#FF5500] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] font-bold text-[#FF5500] uppercase tracking-wider mb-2 px-2">
                {lang === "GE" ? "კატეგორიები" : "Categories"}
              </p>
              {categories.map((cat, i) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={i}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition ${
                      isDarkMode
                        ? "text-slate-300 hover:bg-white/5 hover:text-[#FF5500]"
                        : "text-slate-700 hover:bg-orange-50 hover:text-[#FF5500]"
                    }`}
                  >
                    <Icon className="w-4 h-4 text-slate-400" />
                    <span>{cat.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className={`border-t pt-3 space-y-2 ${isDarkMode ? "border-slate-800" : "border-slate-100"}`}
          >
            <button
              onClick={() => setLang(lang === "GE" ? "EN" : "GE")}
              className={`flex items-center justify-between w-full p-2 rounded-md text-xs font-bold transition ${
                isDarkMode
                  ? "bg-slate-800/60 text-slate-300 hover:bg-slate-800 border border-slate-700/50"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#FF5500]" />
                <span>{lang === "GE" ? "ენა" : "Language"}</span>
              </div>
              <span className="bg-[#FF5500] text-white px-2 py-0.5 rounded text-[10px] font-bold">
                {lang}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. MAIN CONTENT */}
      <main className="relative pt-16">
        {/* HOME PAGE */}
        {activeTab === "home" && (
          <div>
            {supabaseConfigurationError && (
              <div className="relative z-20 mx-auto max-w-xl px-3 pt-4">
                <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {supabaseConfigurationError}
                </div>
              </div>
            )}
            <div className="absolute inset-0 z-0 h-[480px]">
              <img
                src="https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?q=80&w=2070&auto=format&fit=crop"
                alt="Hero Background"
                className="w-full h-full object-cover object-center"
              />
              <div
                className={`absolute inset-0 transition-colors duration-300 ${
                  isDarkMode
                    ? "bg-gradient-to-b from-slate-950/80 via-slate-950/85 to-slate-950"
                    : "bg-gradient-to-b from-slate-900/60 via-slate-900/40 to-slate-50"
                }`}
              ></div>
            </div>

            <div className="relative z-10 max-w-xl mx-auto px-2.5 min-[360px]:px-3 sm:px-4 pt-10 sm:pt-12 pb-16 text-center space-y-6">
              <div className="inline-flex items-center gap-1.5 bg-black/40 border border-[#FF5500]/40 backdrop-blur-md px-3 py-1 rounded-md text-[11px] font-bold text-[#FF5500]">
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI P2P Barter Platform</span>
              </div>

              <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
                გაეცვალე ნივთები <br />
                <span className="text-[#FF5500]">AI შეფასებით</span>
              </h1>

              <p className="text-xs sm:text-sm text-slate-200 max-w-md mx-auto font-medium leading-relaxed">
                უსაფრთხო და პირდაპირი ბარტერი. ხელოვნური ინტელექტი ავტომატურად
                განსაზღვრავს რეალურ საბაზრო ღირებულებას.
              </p>

              <div className="pt-2 max-w-md mx-auto">
                <div className="flex gap-2">
                  <div
                    className={`flex-1 backdrop-blur-md border rounded-md flex items-center px-3.5 py-2.5 text-xs transition shadow-lg ${
                      isDarkMode
                        ? "bg-slate-900/80 border-slate-700/80 focus-within:border-[#FF5500]"
                        : "bg-white/90 border-slate-300 focus-within:border-[#FF5500]"
                    }`}
                  >
                    <Search className="w-4 h-4 text-[#FF5500] mr-2 shrink-0" />
                    <input
                      type="text"
                      placeholder={
                        lang === "GE"
                          ? "რა ნივთის გაცვლა გსურს?"
                          : "Search items or services..."
                      }
                      className={`min-h-10 bg-transparent border-none focus:outline-none w-full font-medium ${
                        isDarkMode
                          ? "text-white placeholder-slate-400"
                          : "text-slate-900 placeholder-slate-500"
                      }`}
                    />
                  </div>
                  <button
                    className={`min-h-11 min-w-11 backdrop-blur-md border p-2.5 rounded-md transition flex items-center justify-center ${
                      isDarkMode
                        ? "bg-slate-900/80 border-slate-700/80 text-slate-300 hover:text-[#FF5500]"
                        : "bg-white/90 border-slate-300 text-slate-700 hover:text-[#FF5500]"
                    }`}
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => handleProtectedNavigation("listing")}
                  className="w-full min-h-11 sm:w-auto bg-[#FF5500] hover:bg-[#e04b00] active:scale-95 text-white font-bold px-6 py-3 rounded-md text-xs transition shadow-lg shadow-[#FF5500]/30 inline-flex items-center justify-center gap-2"
                >
                  <span>დაამატე განცხადება (1.00 ₾)</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MATCHES PAGE */}
        {activeTab === "matches" && currentUser && (
          <div className="max-w-xl mx-auto px-2.5 min-[360px]:px-3 sm:px-4 py-5 sm:py-6 space-y-5 pb-24">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-black tracking-tight flex items-center gap-2">
                  <span className="truncate">ბარტერის Matches</span>
                  <span className="bg-[#FF5500]/10 text-[#FF5500] text-xs px-2 py-0.5 rounded-full font-bold">
                    {matchesFilter === "sent"
                      ? sentMatches.length
                      : filteredMatches.length}
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  შენი შეთავაზებები და AI შეფასებები
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 bg-black/20 p-1 rounded-md border border-white/5">
                <Sparkles className="w-4 h-4 text-[#FF5500]" />
                <span className="text-[10px] font-bold text-slate-300">
                  Smart AI Match
                </span>
                </div>
              {(matches.some((match) => match.status !== "pending") ||
                sentMatches.some((match) => match.status !== "pending")) && (
                <button
                  onClick={handleClearResolvedNotifications}
                  title="ყველა დასრულებული შეტყობინების წაშლა"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[10px] font-bold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:text-red-500 hover:bg-red-500/10 ${
                    isDarkMode
                      ? "border-slate-800 text-slate-400"
                      : "border-slate-200 text-slate-600"
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  ყველას წაშლა
                </button>
                )}
              </div>
            </div>

            <div
                className={`grid grid-cols-3 border rounded-lg p-1 text-[11px] sm:text-xs font-bold transition ${
                isDarkMode
                  ? "bg-slate-900 border-slate-800"
                  : "bg-slate-100 border-slate-200"
              }`}
            >
              <button
                onClick={() => setMatchesFilter("incoming")}
                  className={`min-h-10 px-1 py-1.5 rounded-md transition-all duration-200 hover:scale-[1.01] active:scale-[0.98] ${
                  matchesFilter === "incoming"
                    ? "bg-[#FF5500] text-white shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                მიღებული
              </button>
              <button
                onClick={() => setMatchesFilter("sent")}
                  className={`min-h-10 px-1 py-1.5 rounded-md transition-all duration-200 hover:scale-[1.01] active:scale-[0.98] flex items-center justify-center gap-1.5 ${
                  matchesFilter === "sent"
                    ? "bg-[#FF5500] text-white shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                გაგზავნილი
              </button>
              <button
                onClick={() => setMatchesFilter("completed")}
                  className={`min-h-10 px-1 py-1.5 rounded-md transition-all duration-200 hover:scale-[1.01] active:scale-[0.98] ${
                  matchesFilter === "completed"
                    ? "bg-[#FF5500] text-white shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                დადასტურებული
              </button>
            </div>

            <div className="space-y-4">
              {matchesFilter === "sent" ? (
                sentMatches.length === 0 ? (
                  <div
                    className={`text-center py-12 rounded-xl border border-dashed p-6 ${
                      isDarkMode
                        ? "border-slate-800 text-slate-500"
                        : "border-slate-300 text-slate-400"
                    }`}
                  >
                    <Send className="w-10 h-10 mx-auto mb-2 opacity-40 text-[#FF5500]" />
                    <p className="text-xs font-bold">
                      მატჩები არ არის
                    </p>
                  </div>
                ) : (
                  sentMatches.map((item) => (
                    <div
                      key={item.id}
                      className={`border rounded-xl p-3 sm:p-4 space-y-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg relative overflow-hidden ${
                        isDarkMode
                          ? "bg-slate-900/90 border-slate-800"
                          : "bg-white border-slate-200"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 border-slate-800/50">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="p-2 rounded-md bg-[#FF5500]/10 text-[#FF5500] shrink-0">
                            <Send className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                              შეთავაზება გაეგზავნა
                            </p>
                            <p className="text-xs font-bold truncate">
                              {item.recipient}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-black ${
                            item.status === "pending"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              : item.status === "accepted"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : "bg-red-500/10 text-red-400 border-red-500/20"
                          }`}
                        >
                          {item.status === "pending" ? (
                            <Clock className="w-3 h-3" />
                          ) : (
                            <XCircle className="w-3 h-3" />
                          )}
                          {item.status === "pending"
                            ? "მოლოდინში"
                            : item.status === "accepted"
                              ? "მიღებული"
                              : "უარყოფილი"}
                        </span>
                        {item.status !== "pending" && (
                          <button
                            onClick={() => handleDeleteNotification(item.id)}
                            title="შეტყობინების წაშლა"
                            className={`p-1.5 rounded-md transition-all duration-200 hover:scale-[1.05] hover:text-red-500 hover:bg-red-500/10 ${
                              isDarkMode ? "text-slate-500" : "text-slate-400"
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-stretch relative">
                        <div
                          className={`p-2.5 rounded-lg border space-y-2 min-w-0 ${
                            isDarkMode
                              ? "bg-slate-950/60 border-slate-800"
                              : "bg-slate-50 border-slate-200"
                          }`}
                        >
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                            ჩემი შეთავაზება
                          </span>
                          <img
                            src={item.offeredProduct.image}
                            alt={item.offeredProduct.title}
                            className="w-full h-24 sm:h-28 object-cover rounded-md"
                          />
                          <div>
                            <h4 className="text-xs font-bold line-clamp-1">
                              {item.offeredProduct.title}
                            </h4>
                            <p className="text-[10px] text-[#FF5500] font-bold">
                              {item.offeredProduct.estValue}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-center sm:px-0.5">
                          <div className="bg-[#FF5500] text-white p-1.5 rounded-full shadow-lg border-2 border-slate-900 rotate-90 sm:rotate-0">
                            <ArrowLeftRight className="w-3.5 h-3.5" />
                          </div>
                        </div>

                        <div
                          className={`p-2.5 rounded-lg border space-y-2 min-w-0 ${
                            isDarkMode
                              ? "bg-slate-950/60 border-slate-800"
                              : "bg-slate-50 border-slate-200"
                          }`}
                        >
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                            სასურველი ნივთი
                          </span>
                          <img
                            src={item.targetProduct.image}
                            alt={item.targetProduct.title}
                            className="w-full h-24 sm:h-28 object-cover rounded-md"
                          />
                          <div>
                            <h4 className="text-xs font-bold line-clamp-1">
                              {item.targetProduct.title}
                            </h4>
                            <p className="text-[10px] text-[#FF5500] font-bold">
                              {item.targetProduct.estValue}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 pt-1">
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {item.timestamp}
                        </span>
                        {item.status === "pending" && (
                          <button
                            onClick={() => handleCancelSentOffer(item.id)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[10px] font-bold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                              isDarkMode
                                ? "border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-red-400"
                                : "border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-red-500"
                            }`}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            შეთავაზების გაუქმება
                          </button>
                        )}
                        {item.status === "accepted" && (
                          <button
                            onClick={() =>
                              handleOpenChat({
                                name: item.recipient,
                                avatar: item.targetProduct.image,
                                itemTitle: item.targetProduct.title,
                                itemImage: item.targetProduct.image,
                              })
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#FF5500] hover:bg-[#e04b00] text-white text-[10px] font-bold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-md shadow-[#FF5500]/20"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            ჩატის გახსნა
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )
              ) : filteredMatches.length === 0 ? (
                <div
                  className={`text-center py-12 rounded-xl border border-dashed p-6 ${
                    isDarkMode
                      ? "border-slate-800 text-slate-500"
                      : "border-slate-300 text-slate-400"
                  }`}
                >
                  <ArrowLeftRight className="w-10 h-10 mx-auto mb-2 opacity-40 text-[#FF5500]" />
                  <p className="text-xs font-bold">მატჩები არ არის</p>
                </div>
              ) : (
                filteredMatches.map((item) => (
                  <div
                    key={item.id}
                      className={`border rounded-xl p-3 sm:p-4 space-y-4 transition-all shadow-md relative overflow-hidden ${
                      isDarkMode
                        ? "bg-slate-900/90 border-slate-800"
                        : "bg-white border-slate-200"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 border-slate-800/50">
                      <div className="flex items-center gap-1.5 text-xs font-bold">
                        <span className="text-slate-400">შემოთავაზება:</span>
                        <span className="text-[#FF5500]">
                          {item.offeredProduct.user}
                        </span>
                        <span className="text-[10px] text-amber-400 flex items-center gap-0.5">
                          ★ {item.offeredProduct.rating}
                        </span>
                      </div>

                      <div
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black ${
                          item.matchScore >= 90
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        }`}
                      >
                        <Flame className="w-3.5 h-3.5" />
                        <span>{item.matchScore}% Match</span>
                      </div>
                      {item.status !== "pending" && (
                        <button
                          onClick={() => handleDeleteNotification(item.id)}
                          title="შეტყობინების წაშლა"
                          className={`p-1.5 rounded-md transition-all duration-200 hover:scale-[1.05] hover:text-red-500 hover:bg-red-500/10 ${
                            isDarkMode ? "text-slate-500" : "text-slate-400"
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative">
                      <div
                        className={`p-2.5 rounded-lg border space-y-2 ${
                          isDarkMode
                            ? "bg-slate-950/60 border-slate-800"
                            : "bg-slate-50 border-slate-200"
                        }`}
                      >
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                          შენი ნივთი
                        </span>
                        <img
                          src={item.myProduct.image}
                          alt={item.myProduct.title}
                            className="w-full h-20 sm:h-24 object-cover rounded-md"
                        />
                        <div>
                          <h4 className="text-xs font-bold line-clamp-1">
                            {item.myProduct.title}
                          </h4>
                          <p className="text-[10px] text-[#FF5500] font-bold">
                            {item.myProduct.estValue}
                          </p>
                        </div>
                      </div>

                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-[#FF5500] text-white p-1.5 rounded-full shadow-lg border-2 border-slate-900">
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                      </div>

                      <div
                        className={`p-2.5 rounded-lg border space-y-2 ${
                          isDarkMode
                            ? "bg-slate-950/60 border-slate-800"
                            : "bg-slate-50 border-slate-200"
                        }`}
                      >
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                          შემოთავაზებული
                        </span>
                        <img
                          src={item.offeredProduct.image}
                          alt={item.offeredProduct.title}
                          className="w-full h-20 sm:h-24 object-cover rounded-md"
                        />
                        <div>
                          <h4 className="text-xs font-bold line-clamp-1">
                            {item.offeredProduct.title}
                          </h4>
                          <p className="text-[10px] text-[#FF5500] font-bold">
                            {item.offeredProduct.estValue}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div
                      className={`p-2.5 rounded-md text-[11px] flex gap-2 items-start border ${
                        isDarkMode
                          ? "bg-slate-950 border-slate-800/80 text-slate-300"
                          : "bg-orange-50/50 border-orange-100 text-slate-700"
                      }`}
                    >
                      <Sparkles className="w-4 h-4 text-[#FF5500] shrink-0 mt-0.5" />
                      <p className="leading-relaxed">
                        <strong className="text-[#FF5500]">AI ანალიზი:</strong>{" "}
                        {item.aiComment}
                      </p>
                    </div>

                    {item.status === "pending" ? (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleMatchAction(item.id, "rejected")}
                          className={`flex-1 min-h-11 py-2 rounded-md text-xs font-bold border transition flex items-center justify-center gap-1 ${
                            isDarkMode
                              ? "border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-red-400"
                              : "border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-red-500"
                          }`}
                        >
                          <X className="w-4 h-4" />
                          <span>უარყოფა</span>
                        </button>

                        <button
                          onClick={() => handleMatchAction(item.id, "accepted")}
                          className="flex-1 min-h-11 bg-[#FF5500] hover:bg-[#e04b00] text-white py-2 rounded-md text-xs font-bold transition flex items-center justify-center gap-1 shadow-md shadow-[#FF5500]/20"
                        >
                          <Check className="w-4 h-4" />
                          <span>დათანხმება</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between pt-1 border-t border-slate-800/40">
                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                          <ShieldCheck className="w-4 h-4" /> გაცვლა
                          დადასტურებულია
                        </span>
                        <button
                          onClick={() =>
                            handleOpenChat({
                              userId: item.offeredProduct.userId,
                              name: item.offeredProduct.user,
                              avatar: item.offeredProduct.image,
                              itemTitle: item.offeredProduct.title,
                              itemImage: item.offeredProduct.image,
                            })
                          }
                          className="bg-[#FF5500] hover:bg-[#e04b00] text-white text-xs px-3 py-1.5 rounded-md font-bold flex items-center gap-1.5 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-md shadow-[#FF5500]/20"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>ჩატის გახსნა</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "profile" && currentUser && (
          <div className="max-w-3xl mx-auto px-2.5 min-[360px]:px-3 sm:px-4 py-5 sm:py-6 pb-24 space-y-4">
            <section
              className={`rounded-xl border p-4 sm:p-6 ${
                isDarkMode
                  ? "bg-slate-900/90 border-slate-800"
                  : "bg-white border-slate-200"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="relative shrink-0 self-center sm:self-auto">
                  <img
                    src={profileAvatar}
                    alt="ლუკა გოგოტიშვილი"
                    className="w-24 h-24 rounded-full object-cover border-4 border-[#FF5500]/30"
                  />
                  <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    title="პროფილის ფოტოს შეცვლა"
                    className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-[#FF5500] text-white flex items-center justify-center border-4 border-slate-900 transition hover:scale-105"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <div className="flex flex-wrap justify-center sm:justify-start items-center gap-2">
                    <h1 className="text-xl sm:text-2xl font-black truncate">
                      {profileForm.name}
                    </h1>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-[10px] font-bold text-amber-400">
                      <Star className="w-3 h-3 fill-current" /> 5.0 (12 გაცვლა)
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-1">@{profileUsername}</p>
                  {avatarUploadStatus && <p className="text-[10px] text-[#FF5500] mt-1">{avatarUploadStatus}</p>}
                  <p className="text-xs text-slate-400 mt-2 max-w-lg mx-auto sm:mx-0 line-clamp-2">
                    {profileForm.bio}
                  </p>
                  <div className="flex flex-wrap justify-center sm:justify-start gap-3 mt-3 text-[10px] text-slate-400">
                    <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-[#FF5500]" /> {profileForm.location}</span>
                    <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-[#FF5500]" /> {profileForm.phone || "ტელეფონი მითითებული არ არის"}</span>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <div className={`rounded-lg border p-3 text-center max-w-xs ${isDarkMode ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
                  <PackageCheck className="w-4 h-4 mx-auto mb-1 text-[#FF5500]" />
                  <p className="text-base sm:text-lg font-black">{profileListings.length}</p>
                  <p className="text-[9px] sm:text-[10px] text-slate-400 leading-tight">აქტიური განცხადებები</p>
                </div>
              </div>
            </section>

            <div className={`grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 rounded-lg border text-[10px] sm:text-xs font-bold ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-slate-100 border-slate-200"}`}>
              {[
                ["listings", "ჩემი განცხადებები"],
                ["history", "ისტორია"],
                ["saved", "შენახულები"],
                ["settings", "ინფო"],
              ].map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => setProfileTab(tab)}
                  className={`min-h-10 rounded-md px-1 py-2 transition-all ${profileTab === tab ? "bg-[#FF5500] text-white shadow-md" : "text-slate-400 hover:text-slate-200"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {profileTab === "listings" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {profileListings.length === 0 ? (
                  <div className={`sm:col-span-2 md:col-span-3 rounded-xl border border-dashed p-8 text-center ${isDarkMode ? "border-slate-800 text-slate-400" : "border-slate-300 text-slate-500"}`}>
                    <Package className="mx-auto mb-3 h-8 w-8 text-[#FF5500] opacity-70" />
                    <p className="text-sm font-bold">არ გაქვთ ატვირთული ნივთები</p>
                    <button type="button" onClick={() => setIsModalOpen(true)} className="mt-4 min-h-10 rounded-md bg-[#FF5500] px-4 text-xs font-bold text-white">დაამატე ნივთი</button>
                  </div>
                ) : profileListings.map((listing) => (
                  <article key={listing.id} className={`rounded-xl border overflow-hidden ${isDarkMode ? "bg-slate-900/90 border-slate-800" : "bg-white border-slate-200"}`}>
                    <img src={listing.image} alt={listing.title} className="w-full h-36 sm:h-40 object-cover" />
                    <div className="p-3 space-y-2">
                      <p className="text-[10px] text-[#FF5500] font-bold">{listing.category}</p>
                      <h2 className="text-sm font-bold line-clamp-2 min-h-10">{listing.title}</h2>
                      <p className="text-xs font-black">{listing.value}</p>
                      <div className="flex gap-2 pt-1">
                        <button className="min-h-10 flex-1 rounded-md border border-slate-700 text-[10px] font-bold text-slate-400 hover:text-[#FF5500] transition">რედაქტირება</button>
                        <button onClick={() => handleMarkListingTraded(listing.id)} className="min-h-10 flex-1 rounded-md bg-[#FF5500] text-white text-[10px] font-bold hover:bg-[#e04b00] transition">გაცვლილია</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {profileTab === "history" && (
              <div className="space-y-2">
                {profileHistory.map((trade) => (
                  <div key={trade.title} className={`flex items-center gap-3 p-3 rounded-xl border ${isDarkMode ? "bg-slate-900/90 border-slate-800" : "bg-white border-slate-200"}`}>
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0"><PackageCheck className="w-5 h-5" /></div>
                    <div className="min-w-0 flex-1"><p className="text-sm font-bold truncate">{trade.title}</p><p className="text-[10px] text-slate-400 truncate">{trade.person} · {trade.date}</p></div>
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-bold"><Star className="w-3 h-3 fill-current" /> {trade.rating}</span>
                  </div>
                ))}
              </div>
            )}

            {profileTab === "saved" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {savedListings.map((listing) => (
                  <div key={listing.title} className={`flex gap-3 p-3 rounded-xl border ${isDarkMode ? "bg-slate-900/90 border-slate-800" : "bg-white border-slate-200"}`}>
                    <img src={listing.image} alt={listing.title} className="w-20 h-20 rounded-lg object-cover shrink-0" />
                    <div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><h2 className="text-sm font-bold truncate">{listing.title}</h2><Heart className="w-4 h-4 text-[#FF5500] fill-current shrink-0" /></div><p className="text-[10px] text-slate-400 mt-1">{listing.person}</p><p className="text-xs text-[#FF5500] font-bold mt-2">{listing.value}</p></div>
                  </div>
                ))}
              </div>
            )}

            {profileTab === "settings" && (
              <form className={`rounded-xl border p-4 sm:p-5 space-y-4 ${isDarkMode ? "bg-slate-900/90 border-slate-800" : "bg-white border-slate-200"}`} onSubmit={(event) => event.preventDefault()}>
                <div className="flex items-center gap-2"><Settings className="w-4 h-4 text-[#FF5500]" /><h2 className="text-sm font-bold">პროფილის ინფო</h2></div>
                {[["name", "სახელი და გვარი"], ["phone", "ტელეფონის ნომერი"], ["location", "მდებარეობა"]].map(([key, label]) => (
                  <label key={key} className="block text-[11px] font-bold text-slate-400">{label}<input value={profileForm[key]} onChange={(event) => setProfileForm({ ...profileForm, [key]: event.target.value })} className={`mt-1 w-full min-h-11 rounded-md border p-2.5 text-xs focus:outline-none focus:border-[#FF5500] focus:ring-2 focus:ring-[#FF5500]/30 ${isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`} /></label>
                ))}
                <label className="block text-[11px] font-bold text-slate-400">მომხმარებლის სახელი<input value={profileUsername} onChange={(event) => setProfileUsername(event.target.value.replace(/^@/, ""))} className={`mt-1 w-full min-h-11 rounded-md border p-2.5 text-xs focus:outline-none focus:border-[#FF5500] focus:ring-2 focus:ring-[#FF5500]/30 ${isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`} /></label>
                <label className="block text-[11px] font-bold text-slate-400">ბიო<textarea rows={3} value={profileForm.bio} onChange={(event) => setProfileForm({ ...profileForm, bio: event.target.value })} className={`mt-1 w-full rounded-md border p-2.5 text-xs resize-none focus:outline-none focus:border-[#FF5500] ${isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`} /></label>
                {profileSaveStatus && <p className="text-[10px] text-[#FF5500]">{profileSaveStatus}</p>}
                <div className="flex flex-col sm:flex-row gap-2"><button type="submit" onClick={handleSaveProfile} className="min-h-11 flex-1 rounded-md bg-[#FF5500] text-white text-xs font-bold hover:bg-[#e04b00] transition">ცვლილებების შენახვა</button><button type="button" onClick={handleLogout} className="min-h-11 rounded-md border border-red-500/30 px-4 text-xs font-bold text-red-400 hover:bg-red-500/10 transition">გამოსვლა</button></div>
              </form>
            )}
          </div>
        )}

        {activeTab === "chat" && currentUser && (
          <div className="max-w-5xl mx-auto px-2.5 min-[360px]:px-3 sm:px-4 py-5 sm:py-6 pb-24">
            <div
              className={`grid md:grid-cols-12 rounded-xl border overflow-hidden shadow-md min-h-[calc(100vh-12rem)] ${
                isDarkMode
                  ? "bg-slate-900/90 border-slate-800"
                  : "bg-white border-slate-200"
              }`}
            >
              <section
                className={`md:col-span-4 md:border-r ${
                  selectedChatUser ? "hidden md:block" : "block"
                } ${isDarkMode ? "border-slate-800" : "border-slate-200"}`}
              >
                <div
                  className={`p-3 sm:p-4 border-b ${
                  isDarkMode ? "border-slate-800" : "border-slate-200"
                  }`}
                >
                <div className="flex items-center justify-between mb-2">
                  <h1 className="text-base sm:text-lg font-black">ჩატები</h1>
                  <span className="text-[10px] text-slate-400">
                    {chatConversations.length} საუბარი
                  </span>
                </div>
                <div className="space-y-1">
                  {chatConversations.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-800 p-6 text-center text-xs text-slate-400">ჩატები ცარიელია</div>
                  ) : chatConversations.map((conversation) => {
                    const isSelected =
                      selectedChatUser?.name === conversation.name;
                    const preview =
                      conversation.previewType === "typing"
                        ? `${conversation.name} წერს...`
                        : conversation.previewType === "reaction"
                          ? `რეაქცია 🤍 შენს შეტყობინებაზე · ${conversation.timeAgo}`
                          : conversation.previewType === "missed"
                            ? `გამოტოვებული აუდიო ზარი · ${conversation.timeAgo}`
                            : `${conversation.lastMessageText} · ${conversation.timeAgo}`;

                    return (
                      <button
                        key={conversation.id}
                        onClick={() => handleSelectConversation(conversation)}
                        className={`w-full min-h-[68px] flex items-center gap-3 rounded-lg px-2 py-2 text-left transition-all duration-200 ${
                          isSelected
                            ? isDarkMode
                              ? "bg-slate-800"
                              : "bg-orange-50"
                            : isDarkMode
                              ? "hover:bg-slate-800/70"
                              : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="relative shrink-0">
                          <img
                            src={conversation.avatar}
                            alt={conversation.name}
                            className="w-12 h-12 rounded-full object-cover"
                          />
                          <img
                            src={conversation.itemImage}
                            alt=""
                            className="absolute -right-1 -bottom-1 w-5 h-5 rounded-full object-cover border-2 border-slate-900"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p
                              className={`truncate text-sm ${
                                conversation.unreadCount
                                  ? "font-bold"
                                  : "font-semibold"
                              }`}
                            >
                              {conversation.name}
                            </p>
                            <span className="truncate text-[10px] text-slate-400">
                              {conversation.itemTitle}
                            </span>
                          </div>
                          <p
                            className={`truncate text-xs mt-0.5 ${
                              conversation.previewType === "typing"
                                ? "text-[#FF5500] font-semibold"
                                : conversation.unreadCount
                                  ? "font-bold text-slate-200"
                                  : "text-slate-400"
                            }`}
                          >
                            {conversation.unreadCount
                              ? `${conversation.unreadCount} ახალი შეტყობინება · ${conversation.timeAgo}`
                              : preview}
                          </p>
                        </div>
                        <div className="w-5 shrink-0 flex justify-center">
                          {conversation.unreadCount > 0 && (
                            <span
                              className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50"
                              title={`${conversation.unreadCount} unread messages`}
                            />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                </div>
              </section>
              <section
                className={`md:col-span-8 min-w-0 ${
                  selectedChatUser ? "block" : "hidden md:block"
                }`}
              >
                {selectedChatUser ? (
                <>
                  <div
                    className={`flex items-center gap-3 px-4 py-3 border-b ${
                      isDarkMode ? "border-slate-800" : "border-slate-200"
                    }`}
                  >
                    <button
                      onClick={() => setSelectedChatUser(null)}
                      className="md:hidden min-h-10 min-w-10 -ml-2 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white"
                      title="ჩატების სიაში დაბრუნება"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <img
                      src={selectedChatUser.avatar}
                      alt={selectedChatUser.name}
                      className="w-10 h-10 rounded-full object-cover border-2 border-[#FF5500]/40"
                    />
                    <div className="min-w-0">
                      <h2 className="text-sm font-black truncate">
                        {selectedChatUser.name}
                      </h2>
                      <p className="text-[10px] text-slate-400 truncate">
                        გაცვლა: {selectedChatUser.itemTitle}
                      </p>
                    </div>
                    <MessageSquare className="w-5 h-5 text-[#FF5500] ml-auto" />
                  </div>

                  <div
                    className={`flex-1 min-h-[280px] max-h-[calc(100vh-20rem)] overflow-y-auto p-4 flex flex-col gap-3 ${
                      isDarkMode ? "bg-slate-950/40" : "bg-slate-50"
                    }`}
                  >
                    {chatMessages.map((message) => {
                      const isSent = isOwnMessage(message);
                      const isPickerOpen = reactionPickerMessageId === message.id;

                      return (
                        <div
                          key={message.id}
                          className={`flex items-end gap-2 ${isSent ? "justify-end" : "justify-start"}`}
                        >
                          {!isSent && (
                            <img
                              src={message.avatar || selectedChatUser.avatar || "https://via.placeholder.com/40"}
                              alt="Avatar"
                              className="h-8 w-8 rounded-full object-cover"
                            />
                          )}
                          <div
                            className={`relative max-w-[80%] ${isSent ? "text-right" : "text-left"}`}
                            onMouseEnter={() => setReactionPickerMessageId(message.id)}
                            onMouseLeave={() => setReactionPickerMessageId(null)}
                            onClick={(event) => {
                              if (!event.target.closest("button")) {
                                setReactionPickerMessageId((currentId) =>
                                  currentId === message.id ? null : message.id,
                                );
                              }
                            }}
                          >
                            {isPickerOpen && (
                              <div
                                className={`absolute bottom-full z-10 mb-1 flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-lg ${isSent ? "right-0" : "left-0"}`}
                                role="group"
                                aria-label="Choose a reaction"
                              >
                                {reactionOptions.map((reaction) => (
                                  <button
                                    key={reaction}
                                    type="button"
                                    onClick={() => handleMessageReaction(message.id, reaction)}
                                    className="flex h-8 w-8 items-center justify-center rounded-md text-base transition hover:bg-slate-800"
                                    aria-label={`React ${reaction}`}
                                  >
                                    {reaction}
                                  </button>
                                ))}
                              </div>
                            )}
                            <div
                              className={`inline-block rounded-xl px-3 py-2 text-xs ${isSent ? "bg-[#FF5500] text-white rounded-br-none" : "bg-white text-slate-800 border border-slate-200 rounded-bl-none shadow-sm"}`}
                            >
                              {message.content}
                            </div>
                            {message.reaction && (
                              <span className="absolute -bottom-2 right-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-slate-900 bg-slate-700 px-1 text-xs shadow-sm">
                                {message.reaction}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div className="text-[10px] text-slate-500 text-center">
                      ჩატი გახსნილია {selectedChatUser.name}-თან
                    </div>
                    <div ref={messagesEndRef} />
                  </div>

                  <form
                    onSubmit={handleSendMessage}
                    className={`flex gap-2 p-3 border-t ${
                      isDarkMode ? "border-slate-800" : "border-slate-200"
                    }`}
                  >
                    <input
                      type="text"
                      placeholder="დაწერე შეტყობინება..."
                      value={messageDraft}
                      onChange={(event) => setMessageDraft(event.target.value)}
                      className={`flex-1 rounded-md border px-3 py-2 text-xs outline-none focus:border-[#FF5500] focus:ring-2 focus:ring-[#FF5500]/30 ${
                        isDarkMode
                          ? "bg-slate-950 border-slate-800 text-white"
                          : "bg-slate-50 border-slate-200 text-slate-900"
                      }`}
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center rounded-md bg-[#FF5500] px-3 text-white transition-all duration-200 hover:bg-[#e04b00] hover:scale-[1.02] active:scale-[0.98]"
                      title="შეტყობინების გაგზავნა"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </>
              ) : (
                <div className="h-full min-h-[360px] text-center py-16 px-6 flex flex-col items-center justify-center">
                  <MessageSquare className="w-10 h-10 mx-auto mb-3 text-[#FF5500] opacity-60" />
                  <h2 className="text-sm font-bold">აირჩიეთ ჩატი საუბრის დასაწყებად</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    აირჩიეთ საუბარი მარცხენა სიიდან.
                  </p>
                </div>
              )}
              </section>
            </div>
          </div>
        )}
      </main>

      {/* 4. ADD LISTING MODAL (ნივთის აღწერის ფორმა) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 min-[360px]:p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className={`w-[94%] max-w-md max-h-[88vh] rounded-xl border shadow-2xl overflow-y-auto relative custom-scrollbar transition-colors ${
              isDarkMode
                ? "bg-slate-900 text-slate-100 border-slate-800"
                : "bg-white text-slate-900 border-slate-200"
            }`}
          >
            <div
              className={`sticky top-0 z-20 backdrop-blur-md px-4 sm:px-5 py-3.5 border-b flex justify-between items-center transition-colors ${
                isDarkMode
                  ? "bg-slate-900/95 border-slate-800/80 text-white"
                  : "bg-white/95 border-slate-200 text-slate-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#FF5500]" />
                <h3 className="font-bold text-sm tracking-tight">
                  განცხადების დამატება
                </h3>
              </div>
              <button
                onClick={handleCloseListingModal}
                className="min-h-10 min-w-10 p-1 text-slate-400 hover:text-[#FF5500] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleAddListing}
              className="p-4 sm:p-5 space-y-4 text-left"
            >
              {/* Live Camera Capture */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
                  ნივთის ცოცხალი ფოტო
                </label>
                <div
                  className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition relative ${
                    isDarkMode
                      ? "border-slate-800 hover:border-[#FF5500]/50 bg-slate-950/50"
                      : "border-slate-300 hover:border-[#FF5500]/50 bg-slate-50"
                  }`}
                >
                  <canvas ref={canvasRef} className="hidden" />
                  {capturedPhoto ? (
                    <div className="relative h-40 w-full">
                      <img
                        src={capturedPhoto.previewUrl}
                        alt="გადაღებული ნივთის ფოტო"
                        className="h-full w-full object-cover rounded-md"
                      />
                      <button
                        type="button"
                        onClick={handleRetakePhoto}
                        className="absolute bottom-2 right-2 min-h-10 px-3 rounded-md bg-black/70 text-white text-[10px] font-bold backdrop-blur-sm hover:bg-black/85"
                      >
                        ხელახლა გადაღება
                      </button>
                      <button
                        type="button"
                        onClick={handleUsePhoto}
                        className="absolute bottom-2 left-2 min-h-10 px-3 rounded-md bg-[#FF5500] text-white text-[10px] font-bold hover:bg-[#e04b00]"
                      >
                        ფოტოს გამოყენება
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3 flex flex-col items-center">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-48 sm:h-56 object-cover rounded-md bg-black"
                      />
                      <button
                        type="button"
                        onClick={handleCapturePhoto}
                        disabled={!isCameraReady}
                        className="min-h-11 w-full sm:w-auto px-5 rounded-md bg-[#FF5500] text-white text-xs font-bold transition hover:bg-[#e04b00] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        ფოტოს გადაღება
                      </button>
                      <p className="text-[10px] text-slate-500">
                        გამოიყენე კამერა რეალური ნივთის დასაფიქსირებლად
                      </p>
                    </div>
                  )}
                </div>
                {cameraError && <p className="mt-2 text-[10px] text-red-400">{cameraError}</p>}
              </div>

              {/* Title */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                  ნივთის დასახელება *
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="მაგ: iPhone 13 Pro 128GB"
                  className={`w-full min-h-11 border rounded-md p-2.5 text-xs font-medium focus:border-[#FF5500] focus:outline-none ${
                    isDarkMode
                      ? "bg-slate-950 border-slate-800 text-white"
                      : "bg-slate-50 border-slate-300 text-slate-900"
                  }`}
                />
              </div>

              {/* Category & Condition */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                    კატეგორია
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                    className={`w-full min-h-11 border rounded-md p-2.5 text-xs font-medium focus:border-[#FF5500] focus:outline-none ${
                      isDarkMode
                        ? "bg-slate-950 border-slate-800 text-white"
                        : "bg-slate-50 border-slate-300 text-slate-900"
                    }`}
                  >
                    <option value="Electronics">ტექნიკა</option>
                    <option value="Clothing">ტანსაცმელი</option>
                    <option value="Vehicles">ავტო</option>
                    <option value="Services">მომსახურება</option>
                    <option value="Sports">სპორტი</option>
                    <option value="Other">სხვა</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                    მდგომარეობა
                  </label>
                  <select
                    value={formData.condition}
                    onChange={(e) =>
                      setFormData({ ...formData, condition: e.target.value })
                    }
                    className={`w-full min-h-11 border rounded-md p-2.5 text-xs font-medium focus:border-[#FF5500] focus:outline-none ${
                      isDarkMode
                        ? "bg-slate-950 border-slate-800 text-white"
                        : "bg-slate-50 border-slate-300 text-slate-900"
                    }`}
                  >
                    <option value="used">მეორადი</option>
                    <option value="new">ახალი</option>
                    <option value="refurbished">აღდგენილი</option>
                  </select>
                </div>
              </div>

              {/* Desired Trade */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                  რაში გსურს გაცვლა? *
                </label>
                <input
                  type="text"
                  required
                  value={formData.desiredTrade}
                  onChange={(e) =>
                    setFormData({ ...formData, desiredTrade: e.target.value })
                  }
                  placeholder="მაგ: Gaming ლეპტოპში ან PS5-ში"
                  className={`w-full min-h-11 border rounded-md p-2.5 text-xs font-medium focus:border-[#FF5500] focus:outline-none ${
                    isDarkMode
                      ? "bg-slate-950 border-slate-800 text-white"
                      : "bg-slate-50 border-slate-300 text-slate-900"
                  }`}
                />
              </div>

              {/* Description / Comment */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                  აღწერა / დეტალები
                </label>
                <textarea
                  rows={3}
                  value={formData.comment}
                  onChange={(e) =>
                    setFormData({ ...formData, comment: e.target.value })
                  }
                  placeholder="აღწერე ნივთის მდგომარეობა, ელემენტის პროცენტი, დეფექტები ასეთის არსებობისას..."
                  className={`w-full min-h-11 border rounded-md p-2.5 text-xs font-medium focus:border-[#FF5500] focus:outline-none resize-none ${
                    isDarkMode
                      ? "bg-slate-950 border-slate-800 text-white"
                      : "bg-slate-50 border-slate-300 text-slate-900"
                  }`}
                />
              </div>

              {/* Listing Fee Badge */}
              <div
                className={`flex items-center justify-between text-xs p-3 rounded-lg border ${
                  isDarkMode
                    ? "bg-slate-950 border-slate-800 text-slate-400"
                    : "bg-slate-50 border-slate-200 text-slate-600"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#FF5500]" />
                  <span className="font-medium">
                    გამოქვეყნება + AI შეფასება:
                  </span>
                </div>
                <span className="font-black text-[#FF5500] text-sm">
                  1.00 ₾
                </span>
              </div>

              <button
                type="submit"
                className="w-full min-h-11 bg-[#FF5500] hover:bg-[#e04b00] active:scale-98 text-white font-bold py-3 rounded-lg text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-[#FF5500]/25"
              >
                <Sparkles className="w-4 h-4" />
                <span>გამოქვეყნება (1.00 ₾)</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 5. AUTH MODAL WITH GOOGLE & APPLE LOGINS */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 min-[360px]:p-3 sm:p-4 bg-black/75 backdrop-blur-xl animate-in fade-in duration-200">
          <div
            className={`w-[94%] max-w-sm max-h-[88vh] rounded-lg border shadow-2xl overflow-y-auto relative backdrop-blur-xl ${
              isDarkMode
                ? "bg-slate-900 text-slate-100 border-slate-800"
                : "bg-white text-slate-900 border-slate-200"
            }`}
          >
            <div
              className={`backdrop-blur-md px-4 sm:px-5 py-3.5 border-b flex justify-between items-center bg-gradient-to-r ${
                isDarkMode
                  ? "from-[#FF5500]/15 via-slate-900 to-slate-900 border-slate-800"
                  : "from-orange-50 via-white to-white border-slate-200"
              }`}
            >
              <div className="flex gap-4">
                <button
                  onClick={() => setAuthMode("signin")}
                  className={`text-sm font-bold pb-0.5 border-b-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                    authMode === "signin"
                      ? "border-[#FF5500] text-[#FF5500]"
                      : "text-slate-400"
                  }`}
                >
                  შესვლა
                </button>
                <button
                  onClick={() => setAuthMode("signup")}
                  className={`text-sm font-bold pb-0.5 border-b-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                    authMode === "signup"
                      ? "border-[#FF5500] text-[#FF5500]"
                      : "text-slate-400"
                  }`}
                >
                  რეგისტრაცია
                </button>
              </div>

              <button
                onClick={() => setIsAuthModalOpen(false)}
                className="min-h-10 min-w-10 p-1 text-slate-400 hover:text-[#FF5500] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              {/* GOOGLE & APPLE LOGINS */}
              <div className="space-y-2">
                <button
                  onClick={() => handleSocialAuth("Google")}
                    className={`w-full min-h-11 flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-md border text-xs font-bold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                    isDarkMode
                      ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                      : "bg-slate-50 border-slate-300 text-slate-700 hover:bg-white"
                  }`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>
                    {authMode === "signin"
                      ? "Google-ით შესვლა"
                      : "Google-ით რეგისტრაცია"}
                  </span>
                </button>

                <button
                  onClick={() => handleSocialAuth("Apple")}
                    className={`w-full min-h-11 flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-md border text-xs font-bold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                    isDarkMode
                      ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                      : "bg-slate-50 border-slate-300 text-slate-700 hover:bg-white"
                  }`}
                >
                  <Apple className="w-4 h-4" />
                  <span>
                    {authMode === "signin"
                      ? "Apple-ით შესვლა"
                      : "Apple-ით რეგისტრაცია"}
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-2 my-2">
                <div
                  className={`flex-1 h-px ${
                    isDarkMode ? "bg-slate-800" : "bg-slate-200"
                  }`}
                />
                <span className="text-[10px] text-slate-400 uppercase font-semibold">
                  ან
                </span>
                <div
                  className={`flex-1 h-px ${
                    isDarkMode ? "bg-slate-800" : "bg-slate-200"
                  }`}
                />
              </div>

              <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === "signup" && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                    სახელი და გვარი
                  </label>
                  <input
                    type="text"
                    required
                    value={authForm.fullName}
                    onChange={(e) =>
                      setAuthForm({ ...authForm, fullName: e.target.value })
                    }
                    className={`w-full min-h-11 border rounded-md p-2.5 text-xs transition-all duration-200 focus:scale-[1.01] focus:ring-2 focus:ring-[#FF5500]/50 focus:border-[#FF5500] focus:outline-none ${isDarkMode ? "bg-slate-800/50 border-slate-700 text-white" : "bg-slate-50 border-slate-300 text-slate-900"}`}
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                  ელ. ფოსტა
                </label>
                <input
                  type="email"
                  required
                  value={authForm.email}
                  onChange={(e) =>
                    setAuthForm({ ...authForm, email: e.target.value })
                  }
                  className={`w-full min-h-11 border rounded-md p-2.5 text-xs transition-all duration-200 focus:scale-[1.01] focus:ring-2 focus:ring-[#FF5500]/50 focus:border-[#FF5500] focus:outline-none ${isDarkMode ? "bg-slate-800/50 border-slate-700 text-white" : "bg-slate-50 border-slate-300 text-slate-900"}`}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                  პაროლი
                </label>
                <input
                  type="password"
                  required
                  value={authForm.password}
                  onChange={(e) =>
                    setAuthForm({ ...authForm, password: e.target.value })
                  }
                  className={`w-full min-h-11 border rounded-md p-2.5 text-xs transition-all duration-200 focus:scale-[1.01] focus:ring-2 focus:ring-[#FF5500]/50 focus:border-[#FF5500] focus:outline-none ${isDarkMode ? "bg-slate-800/50 border-slate-700 text-white" : "bg-slate-50 border-slate-300 text-slate-900"}`}
                />
              </div>

              <button
                type="submit"
                className="w-full min-h-11 bg-gradient-to-r from-[#FF5500] to-[#ff7a33] hover:from-[#e04b00] hover:to-[#ff5500] text-white font-bold py-2.5 rounded-md text-xs transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-[#FF5500]/25"
              >
                {authMode === "signin"
                  ? "სისტემაში შესვლა"
                  : "ანგარიშის შექმნა"}
              </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 6. BOTTOM NAVIGATION BAR */}
      <nav
        className={`fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-xl px-1.5 min-[360px]:px-3 sm:px-6 pt-1.5 sm:pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] transition-colors ${
          isDarkMode
            ? "bg-slate-950/40 border-slate-800/80 text-slate-400"
            : "bg-white/40 border-slate-200 text-slate-500"
        }`}
      >
        <div className="max-w-md mx-auto flex items-center justify-between gap-0.5 min-[360px]:gap-1 sm:gap-3 relative">
          <button
            onClick={() => setActiveTab("home")}
            className={`min-h-10 min-w-0 flex-1 px-0.5 sm:min-h-11 sm:min-w-12 sm:flex-none flex flex-col items-center justify-center gap-0.5 sm:gap-1 transition ${
              activeTab === "home"
                ? "text-[#FF5500] font-bold"
                : "hover:text-slate-300"
            }`}
          >
            <HomeIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-[9px] sm:text-[10px]">Home</span>
          </button>

          <button
            onClick={() => handleProtectedNavigation("matches")}
            className={`min-h-10 min-w-0 flex-1 px-0.5 sm:min-h-11 sm:min-w-12 sm:flex-none flex flex-col items-center justify-center gap-0.5 sm:gap-1 transition ${
              activeTab === "matches"
                ? "text-[#FF5500] font-bold"
                : "hover:text-slate-300"
            }`}
          >
            <ArrowLeftRight className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-[9px] sm:text-[10px]">Matches</span>
          </button>

          {/* ცენტრალური + ღილაკი: პირდაპირ ხსნის ნივთის ფორმის მოდალს */}
          <div className="relative -top-4 sm:-top-5 flex-1 sm:flex-none flex justify-center items-center">
            <button
              onClick={() => handleProtectedNavigation("listing")}
              className="w-11 h-11 sm:w-13 sm:h-13 bg-[#FF5500] hover:bg-[#e04b00] text-white rounded-full flex items-center justify-center p-2.5 sm:p-3 shadow-lg shadow-[#FF5500]/40 transition active:scale-90 border-4"
              style={{ borderColor: isDarkMode ? "#020617" : "#ffffff" }}
            >
              <Plus className="w-6 h-6 stroke-[3]" />
            </button>
          </div>

          <button
            onClick={() => handleProtectedNavigation("chat")}
            className={`min-h-10 min-w-0 flex-1 px-0.5 sm:min-h-11 sm:min-w-12 sm:flex-none flex flex-col items-center justify-center gap-0.5 sm:gap-1 transition ${
              activeTab === "chat"
                ? "text-[#FF5500] font-bold"
                : "hover:text-slate-300"
            }`}
          >
            <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-[9px] sm:text-[10px]">Chat</span>
          </button>

          <button
            onClick={() => {
              if (!currentUser) setIsAuthModalOpen(true);
              else setActiveTab("profile");
            }}
            className={`min-h-10 min-w-0 flex-1 px-0.5 sm:min-h-11 sm:min-w-12 sm:flex-none flex flex-col items-center justify-center gap-0.5 sm:gap-1 transition ${
              activeTab === "profile"
                ? "text-[#FF5500] font-bold"
                : "hover:text-slate-300"
            }`}
          >
            <User className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-[9px] sm:text-[10px] truncate max-w-full">
              {currentUser ? "Profile" : "Sign In"}
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
}
