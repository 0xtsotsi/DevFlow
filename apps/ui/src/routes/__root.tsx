import { createRootRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { FileBrowserProvider, useFileBrowser, setGlobalFileBrowser } from "@/contexts/file-browser-context";
import { useAppStore } from "@/store/app-store";
import { getElectronAPI } from "@/lib/electron";
import { Toaster } from "sonner";
import { ThemeOption, themeOptions } from "@/config/theme-options";

function RootLayoutContent() {
  const location = useLocation();
  const {
    setIpcConnected,
    theme,
    currentProject,
    previewTheme,
    getEffectiveTheme,
  } = useAppStore();
  const navigate = useNavigate();
  const [isMounted, setIsMounted] = useState(false);
  const [streamerPanelOpen, setStreamerPanelOpen] = useState(false);
  const { openFileBrowser } = useFileBrowser();

  // Hidden streamer panel - opens with "\" key
  const handleStreamerPanelShortcut = useCallback((event: KeyboardEvent) => {
    const activeElement = document.activeElement;
    if (activeElement) {
      const tagName = activeElement.tagName.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select") {
        return;
      }
      if (activeElement.getAttribute("contenteditable") === "true") {
        return;
      }
      const role = activeElement.getAttribute("role");
      if (role === "textbox" || role === "searchbox" || role === "combobox") {
        return;
      }
    }

    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    if (event.key === "\\") {
      event.preventDefault();
      setStreamerPanelOpen((prev) => !prev);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleStreamerPanelShortcut);
    return () => {
      window.removeEventListener("keydown", handleStreamerPanelShortcut);
    };
  }, [handleStreamerPanelShortcut]);

  const effectiveTheme = getEffectiveTheme();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setGlobalFileBrowser(openFileBrowser);
  }, [openFileBrowser]);

  // Test IPC connection on mount
  useEffect(() => {
    const testConnection = async () => {
      try {
        const api = getElectronAPI();
        const result = await api.ping();
        setIpcConnected(result === "pong");
      } catch (error) {
        console.error("IPC connection failed:", error);
        setIpcConnected(false);
      }
    };

    testConnection();
  }, [setIpcConnected]);

  // Restore to board view if a project was previously open
  useEffect(() => {
    if (isMounted && currentProject && location.pathname === "/") {
      navigate({ to: "/board" });
    }
  }, [isMounted, currentProject, location.pathname, navigate]);

  // Apply theme class to document
  useEffect(() => {
    const root = document.documentElement;
    // Remove all theme classes dynamically from themeOptions
    const themeClasses = themeOptions
      .map((option) => option.value)
      .filter((theme) => theme !== "system" as ThemeOption['value']);
    root.classList.remove(...themeClasses);

    if (effectiveTheme === "dark") {
      root.classList.add("dark");
    } else if (effectiveTheme === "system") {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.add(isDark ? "dark" : "light");
    } else if (effectiveTheme && effectiveTheme !== "light") {
      root.classList.add(effectiveTheme);
    } else {
      root.classList.add("light");
    }
  }, [effectiveTheme, previewTheme, currentProject, theme]);

  // Setup view is full-screen without sidebar
  const isSetupRoute = location.pathname === "/setup";

  if (isSetupRoute) {
    return (
      <main className="h-screen overflow-hidden" data-testid="app-container">
        <Outlet />
      </main>
    );
  }

  return (
    <main className="flex h-screen overflow-hidden" data-testid="app-container">
      <Sidebar />
      <div
        className="flex-1 flex flex-col overflow-hidden transition-all duration-300"
        style={{ marginRight: streamerPanelOpen ? "250px" : "0" }}
      >
        <Outlet />
      </div>

      {/* Hidden streamer panel - opens with "\" key, pushes content */}
      <div
        className={`fixed top-0 right-0 h-full w-[250px] bg-background border-l border-border transition-transform duration-300 ${
          streamerPanelOpen ? "translate-x-0" : "translate-x-full"
        }`}
      />
      <Toaster richColors position="bottom-right" />
    </main>
  );
}

function RootLayout() {
  return (
    <FileBrowserProvider>
      <RootLayoutContent />
    </FileBrowserProvider>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
});
