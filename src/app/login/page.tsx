import React from "react";
import { LoginForm } from "./LoginForm";
import { APP_NAME } from "@/lib/app-config";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F7FA] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-4 text-center">
          <div className="text-[20px] font-bold text-ink">{APP_NAME}</div>
          <p className="mt-1 text-[13px] text-muted">Sign in with your email to continue.</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
