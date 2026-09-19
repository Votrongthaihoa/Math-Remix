"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type SidebarContextValue = {
  isSidebarCollapsed: boolean;
  isMobile: boolean;
  isMobileSidebarOpen: boolean;
  setSidebarCollapsed: (value: boolean | ((current: boolean) => boolean)) => void;
  setMobileSidebarOpen: (value: boolean) => void;
  toggleSidebar: () => void;
  getSidebarWidth: () => number;
  getMainMargin: () => number;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const sync = () => setIsMobile(window.innerWidth < 768);
    sync();
    window.addEventListener("resize", sync, { passive: true });
    return () => window.removeEventListener("resize", sync);
  }, []);
  const value = useMemo<SidebarContextValue>(() => ({
    isSidebarCollapsed, isMobile, isMobileSidebarOpen, setSidebarCollapsed, setMobileSidebarOpen,
    toggleSidebar: () => setSidebarCollapsed(value => !value),
    getSidebarWidth: () => isMobile ? 0 : isSidebarCollapsed ? 72 : 248,
    getMainMargin: () => isMobile ? 0 : isSidebarCollapsed ? 72 : 248,
  }), [isMobile, isMobileSidebarOpen, isSidebarCollapsed]);
  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const value = useContext(SidebarContext);
  if (!value) throw new Error("useSidebar must be used within SidebarProvider");
  return value;
}
