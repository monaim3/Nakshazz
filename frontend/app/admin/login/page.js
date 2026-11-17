import LoginForm from "./LoginForm";

export const instant = false;
export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream-100 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-4xl tracking-wide text-ink-900">Nakshazz</p>
          <p className="mt-1 text-xs tracking-[0.25em] text-gold-600 uppercase">Store admin</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-ink-100 sm:p-8">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
