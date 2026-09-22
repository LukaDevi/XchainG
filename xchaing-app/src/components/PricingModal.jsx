import { Check, Crown, Sparkles, X, Zap } from "lucide-react";

const plans = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    description: "ბაზისური ფუნქციები და ნივთების ლიმიტირებული დამატება.",
    icon: Zap,
    features: ["ლიმიტირებული განცხადებები", "ძირითადი გაცვლის ფუნქციები", "საზოგადოების ჩატი"],
  },
  {
    id: "basic",
    name: "Basic",
    price: "$5",
    period: "/თვე",
    description: "მეტი შესაძლებლობა აქტიური გაცვლებისთვის.",
    icon: Sparkles,
    featured: true,
    features: ["მეტი განცხადების დამატება", "პრიორიტეტული ჩატი", "გაფართოებული ძიება"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$15",
    period: "/თვე",
    description: "სრული წვდომა პროფესიონალი ტრეიდერებისთვის.",
    icon: Crown,
    features: ["ულიმიტო განცხადებები", "AI ასისტენტი", "VIP სტატუსი"],
  },
];

export default function PricingModal({ isOpen = true, onClose, onSelectPlan }) {
  if (!isOpen) return null;

  const handleSelectPlan = (plan) => {
    onSelectPlan?.(plan.id);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pricing-modal-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="relative my-8 w-full max-w-5xl rounded-xl border border-slate-800 bg-slate-950 p-5 shadow-2xl shadow-black/40 sm:p-7">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-800 text-slate-400 transition hover:border-[#FF5500]/50 hover:text-[#FF5500]"
          aria-label="დახურვა"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mx-auto max-w-xl pr-10 text-left sm:text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#FF5500]">XchainG plans</p>
          <h2 id="pricing-modal-title" className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
            აირჩიე შენი ტარიფი
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-400 sm:text-sm">
            აირჩიე გეგმა, რომელიც შენს გაცვლის სტილს შეესაბამება.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {plans.map((plan) => {
            const PlanIcon = plan.icon;
            return (
              <article
                key={plan.id}
                className={`relative flex flex-col rounded-lg border p-5 transition ${
                  plan.featured
                    ? "border-[#FF5500] bg-[#FF5500]/10 shadow-lg shadow-[#FF5500]/10"
                    : "border-slate-800 bg-slate-900/70 hover:border-[#FF5500]/50"
                }`}
              >
                {plan.featured && (
                  <span className="absolute right-4 top-4 rounded-full bg-[#FF5500] px-2.5 py-1 text-[10px] font-bold text-white">
                    პოპულარული
                  </span>
                )}

                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#FF5500]/10 text-[#FF5500]">
                  <PlanIcon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-lg font-black text-white">{plan.name}</h3>
                <p className="mt-2 min-h-10 text-xs leading-relaxed text-slate-400">{plan.description}</p>

                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-3xl font-black text-white">{plan.price}</span>
                  {plan.period && <span className="text-xs text-slate-400">{plan.period}</span>}
                </div>

                <ul className="mt-5 flex-1 space-y-3 border-t border-slate-800 pt-5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-xs text-slate-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#FF5500]" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => handleSelectPlan(plan)}
                  className={`mt-6 inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-xs font-bold transition ${
                    plan.featured
                      ? "bg-[#FF5500] text-white shadow-lg shadow-[#FF5500]/20 hover:bg-[#e04b00]"
                      : "border border-[#FF5500]/50 bg-[#FF5500]/5 text-[#FF5500] hover:bg-[#FF5500] hover:text-white"
                  }`}
                >
                  არჩევა
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
