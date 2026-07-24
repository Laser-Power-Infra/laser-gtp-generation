"use client";

import React from "react";
import { Provider } from "react-redux";
import { store } from "@/store";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      {children}
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{
          style: { fontSize: "13px" },
        }}
      />
    </Provider>
  );
}
