import { Menu, Moon, Sun, User, LogOut } from "lucide-react";

export default function LandingHeader({
  isDarkMode,
  onToggleTheme,
  currentUser,
  onOpenAuth,
  onLogout,
  onOpenSidebar,
  onNavigateHome,
  navItems,
}) {
  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-slate-950/55 backdrop-blur-xl supports-[backdrop-filter]:bg-slate-950/40`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2.5 sm:px-4 lg:px-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-slate-200 transition hover:border-[#FF5500]/50 hover:text-[#FF5500] md:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={onNavigateHome}
            className="flex items-center gap-1.5 text-left"
            aria-label="Go to home"
          >
            <span className="text-2xl font-black text-[#FF5500]">X</span>
            <span className="text-sm font-medium tracking-wide text-slate-200">chain</span>
            <span className="text-2xl font-black text-[#FF5500]">G</span>
          </button>
        </div>

        <nav className="hidden items-center gap-6 md:flex">
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className="text-sm font-medium text-slate-300 transition hover:text-[#FF5500]"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleTheme}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-md border transition ${
              isDarkMode
                ? "border-slate-800 bg-slate-900/80 text-amber-400 hover:border-[#FF5500]/40 hover:text-[#FF5500]"
                : "border-slate-200 bg-white text-slate-700 hover:border-[#FF5500]/40 hover:text-[#FF5500]"
            }`}
            aria-label="Toggle theme"
          >
            {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {currentUser ? (
            <div className="hidden items-center gap-2 sm:flex">
              <div
                className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-semibold ${
                  isDarkMode
                    ? "border-slate-800 bg-slate-900/80 text-slate-200"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#FF5500]/15 text-[#FF5500]">
                  <User className="h-3.5 w-3.5" />
                </span>
                <span className="max-w-[90px] truncate">{currentUser.name}</span>
              </div>

              <button
                type="button"
                onClick={onLogout}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-md border transition ${
                  isDarkMode
                    ? "border-slate-800 bg-slate-900/80 text-slate-300 hover:border-red-500/40 hover:text-red-400"
                    : "border-slate-200 bg-white text-slate-700 hover:border-red-500/40 hover:text-red-500"
                }`}
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="inline-flex items-center justify-center rounded-md border border-[#FF5500]/40 bg-[#FF5500] px-3 py-2 text-xs font-bold text-white shadow-lg shadow-[#FF5500]/20 transition hover:bg-[#e04b00]"
            >
              Get Started
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
