"use client";

import React from "react";
import DashboardHeader from "../components/dashboard/dashboard-header";
import { DataTableContainer } from "../components/data-table/data-table-container";

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans antialiased">
      <DashboardHeader />

      <main className="flex-1 w-full flex flex-col">
        <div className="max-w-7xl mx-auto px-6 w-full py-4">
          <p className="text-muted-foreground text-sm font-medium tracking-normal">
            Generate DOCX files from Smartsheet data and uploaded Excel files.
          </p>
        </div>

        <div className="flex-1 flex flex-col mx-4 mb-4 border border-border rounded-lg overflow-hidden bg-card shadow-xs">
          <DataTableContainer />
        </div>
      </main>
    </div>
  );
}
