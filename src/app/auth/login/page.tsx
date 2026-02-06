import { LoginForm } from "@/features/auth/components/login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto grid min-h-[calc(100vh-74px)] w-full max-w-6xl place-items-center px-5 py-12">
      <LoginForm />
    </main>
  );
}

