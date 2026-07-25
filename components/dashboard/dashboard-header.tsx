"use client";

import React from "react";
import { FileText } from "lucide-react";
import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";

export default function DashboardHeader() {
  return (
    <header className="w-full bg-card border-b border-border px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="text-[#0f62fe]">
          <FileText className="w-8 h-8 stroke-[1.8]" />
        </div>
        <h1 className="text-xl font-bold text-foreground tracking-tight">
          Laser GTP Generation Dashboard
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <Show when="signed-out">
          <SignInButton />
          <SignUpButton />
        </Show>
        <Show when="signed-in">
          <UserButton />
        </Show>
      </div>
    </header>
  );
}
