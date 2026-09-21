import { useState } from 'react';
import { X, Mail, Lock, User, Loader2 } from 'lucide-react';
import { signUpUser, signInUser } from '../lib/authService';

export default function AuthModal({ isOpen, onClose, onSuccess }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      if (isSignUp) {
        await signUpUser(email, password, fullName);
      } else {
        await signInUser(email, password);
      }
      onSuccess();
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'დაფიქსირდა შეცდომა');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl">
        <button onClick={onClose} className="absolute right-4 top-4 text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-xl font-bold text-slate-900 mb-2">
          {isSignUp ? 'ანგარიშის შექმნა' : 'სისტემაში შესვლა'}
        </h3>
        <p className="text-xs text-slate-500 mb-6">
          {isSignUp ? 'შეიყვანეთ მონაცემები დარეგისტრირებისთვის' : 'გაიარეთ ავტორიზაცია განცხადებების სამართავად'}
        </p>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-200">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">სრული სახელი</label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input 
                  type="text" 
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="ლუკა გოგოტიშვილი"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-orange-500 text-slate-900"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">ელ.ფოსტა</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@mail.com"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-orange-500 text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">პაროლი</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-orange-500 text-slate-900"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-orange-600 hover:bg-orange-500 text-white font-semibold py-2.5 rounded-xl text-sm transition flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (isSignUp ? 'რეგისტრაცია' : 'შესვლა')}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button 
            onClick={() => { setIsSignUp(!isSignUp); setErrorMsg(''); }}
            className="text-xs text-orange-600 font-semibold hover:underline"
          >
            {isSignUp ? 'უკვე გაქვთ ანგარიში? შესვლა' : 'არ გაქვთ ანგარიში? დარეგისტრირდით'}
          </button>
        </div>
      </div>
    </div>
  );
}
