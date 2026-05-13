/// Fixed system taxonomy. Order matters for stable seeding.
export const CATEGORY_SEED = [
  { slug: "salary", name: "Salary", color: "#22c55e", icon: "💼" },
  { slug: "other-income", name: "Other Income", color: "#10b981", icon: "💰" },
  { slug: "food", name: "Food & Groceries", color: "#f97316", icon: "🛒" },
  { slug: "transport", name: "Transport", color: "#3b82f6", icon: "🚌" },
  { slug: "rent", name: "Rent & Housing", color: "#8b5cf6", icon: "🏠" },
  { slug: "utilities", name: "Utilities", color: "#06b6d4", icon: "💡" },
  { slug: "airtime", name: "Airtime & Data", color: "#14b8a6", icon: "📶" },
  { slug: "shopping", name: "Shopping", color: "#ec4899", icon: "🛍️" },
  { slug: "entertainment", name: "Entertainment", color: "#a855f7", icon: "🎬" },
  { slug: "health", name: "Health", color: "#ef4444", icon: "⚕️" },
  { slug: "education", name: "Education", color: "#6366f1", icon: "📚" },
  { slug: "family", name: "Family & Send Money", color: "#0ea5e9", icon: "👨‍👩‍👧" },
  { slug: "business", name: "Business", color: "#84cc16", icon: "🏢" },
  { slug: "betting", name: "Betting & Gambling", color: "#f43f5e", icon: "🎰" },
  { slug: "savings", name: "Savings & Investments", color: "#34d399", icon: "🐷" },
  { slug: "loans", name: "Loans & Repayments", color: "#fb7185", icon: "🏦" },
  { slug: "fees", name: "Fees & Charges", color: "#94a3b8", icon: "💸" },
  { slug: "other", name: "Other", color: "#64748b", icon: "❓" },
] as const;

export type CategorySlug = (typeof CATEGORY_SEED)[number]["slug"];

export const CATEGORY_SLUGS = CATEGORY_SEED.map((c) => c.slug);
