import { LoginForm } from "@/features/auth/components/login-form";

export default function LoginPage() {
  return (
    <main className="relative isolate min-h-[calc(100vh-74px)] overflow-hidden px-5 py-12">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute right-[-6rem] top-1/3 h-80 w-80 rounded-full bg-secondary/20 blur-3xl" />
        <div className="absolute bottom-[-4rem] left-1/3 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
      </div>
      <section className="relative mx-auto grid w-full max-w-6xl place-items-center">
        <LoginForm />
      </section>
    </main>
  );
}
