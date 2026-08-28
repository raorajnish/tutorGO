"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch, clearToken, setToken } from "./api";
import type { LoginResponse, MeResponse } from "./types";

interface AuthContextValue {
  user: MeResponse | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<MeResponse>;
  loginWithToken: (token: string) => Promise<MeResponse>;
  logout: () => void;
  refresh: () => Promise<void>;
  enterInstitute: (instituteId: string) => Promise<void>;
  exitInstitute: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await apiFetch<MeResponse>("/auth/me");
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(res.token);
    const me = await apiFetch<MeResponse>("/auth/me");
    setUser(me);
    return me;
  }, []);

  const loginWithToken = useCallback(async (token: string) => {
    setToken(token);
    const me = await apiFetch<MeResponse>("/auth/me");
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const enterInstitute = useCallback(async (instituteId: string) => {
    const res = await apiFetch<{ token: string }>("/auth/enter-institute", {
      method: "POST",
      body: JSON.stringify({ instituteId }),
    });
    setToken(res.token);
    const me = await apiFetch<MeResponse>("/auth/me");
    setUser(me);
  }, []);

  const exitInstitute = useCallback(async () => {
    const res = await apiFetch<{ token: string }>("/auth/exit-institute", { method: "POST" });
    setToken(res.token);
    const me = await apiFetch<MeResponse>("/auth/me");
    setUser(me);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithToken, logout, refresh, enterInstitute, exitInstitute }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
