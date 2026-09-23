import { useEffect, useState } from "react";
import { CreditCard, LoaderCircle, LockKeyhole, X } from "lucide-react";

export default function MockPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  amount = 1,
  title = "გადახდა",
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [cardForm, setCardForm] = useState({
    number: "4242 •••• •••• 4242",
    expiry: "12/28",
    cvv: "123",
    name: "TEST CARDHOLDER",
  });

  useEffect(() => {
    if (!isOpen) setIsProcessing(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const formattedAmount = Number(amount).toLocaleString("ka-GE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  const handleChange = (field) => (event) => {
    setCardForm((currentForm) => ({ ...currentForm, [field]: event.target.value }));
  };

  const handlePayment = () => {
    if (isProcessing) return;

    setIsProcessing(true);
    window.setTimeout(() => {
      setIsProcessing(false);
      onSuccess?.();
    }, 1500);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mock-payment-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isProcessing) onClose?.();
      }}
    >
      <div className="relative my-6 w-full max-w-md overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl shadow-black/50">
        <div className="border-b border-slate-800 bg-gradient-to-r from-[#FF5500]/15 via-slate-950 to-slate-950 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/5 hover:text-[#FF5500] disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="დახურვა"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3 pr-10">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#FF5500]/10 text-[#FF5500]">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF5500]">Mock payment</p>
              <h2 id="mock-payment-title" className="mt-1 text-lg font-black">{title}</h2>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="flex items-center justify-between rounded-lg border border-[#FF5500]/25 bg-[#FF5500]/10 px-4 py-3">
            <span className="text-xs font-medium text-slate-300">სულ გადასახდელი</span>
            <span className="text-2xl font-black text-[#FF5500]">{formattedAmount} ₾</span>
          </div>

          <div className="mt-5 space-y-4">
            <label className="block text-xs font-bold text-slate-300">
              ბარათის ნომერი
              <input
                value={cardForm.number}
                onChange={handleChange("number")}
                placeholder="4242 •••• •••• 4242"
                disabled={isProcessing}
                className="mt-1.5 min-h-11 w-full rounded-md border border-slate-800 bg-slate-900 px-3 text-sm font-medium tracking-wide text-white outline-none transition placeholder:text-slate-500 focus:border-[#FF5500] focus:ring-2 focus:ring-[#FF5500]/20 disabled:opacity-60"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-bold text-slate-300">
                ვადა
                <input
                  value={cardForm.expiry}
                  onChange={handleChange("expiry")}
                  placeholder="MM/YY"
                  disabled={isProcessing}
                  className="mt-1.5 min-h-11 w-full rounded-md border border-slate-800 bg-slate-900 px-3 text-sm font-medium text-white outline-none transition placeholder:text-slate-500 focus:border-[#FF5500] focus:ring-2 focus:ring-[#FF5500]/20 disabled:opacity-60"
                />
              </label>
              <label className="block text-xs font-bold text-slate-300">
                CVV
                <input
                  value={cardForm.cvv}
                  onChange={handleChange("cvv")}
                  placeholder="123"
                  inputMode="numeric"
                  maxLength={4}
                  disabled={isProcessing}
                  className="mt-1.5 min-h-11 w-full rounded-md border border-slate-800 bg-slate-900 px-3 text-sm font-medium text-white outline-none transition placeholder:text-slate-500 focus:border-[#FF5500] focus:ring-2 focus:ring-[#FF5500]/20 disabled:opacity-60"
                />
              </label>
            </div>

            <label className="block text-xs font-bold text-slate-300">
              ბარათის მფლობელი
              <input
                value={cardForm.name}
                onChange={handleChange("name")}
                placeholder="TEST CARDHOLDER"
                disabled={isProcessing}
                className="mt-1.5 min-h-11 w-full rounded-md border border-slate-800 bg-slate-900 px-3 text-sm font-medium uppercase text-white outline-none transition placeholder:text-slate-500 focus:border-[#FF5500] focus:ring-2 focus:ring-[#FF5500]/20 disabled:opacity-60"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={handlePayment}
            disabled={isProcessing}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#FF5500] px-4 py-3 text-sm font-black text-white shadow-lg shadow-[#FF5500]/25 transition hover:bg-[#e04b00] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isProcessing ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                მუშავდება ტრანზაქცია...
              </>
            ) : (
              <>
                <LockKeyhole className="h-4 w-4" />
                გადახდა ({formattedAmount} ₾)
              </>
            )}
          </button>
          <p className="mt-3 text-center text-[10px] text-slate-500">ეს არის სატესტო გადახდა. თანხა რეალურად არ ჩამოიჭრება.</p>
        </div>
      </div>
    </div>
  );
}
