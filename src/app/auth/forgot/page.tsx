import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto grid min-h-[calc(100vh-74px)] w-full max-w-6xl place-items-center px-5 py-12">
      <ForgotPasswordForm />
    </main>
  );
}
