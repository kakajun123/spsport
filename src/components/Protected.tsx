import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-8 text-center">…</div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return <>{children}</>;
}

export function RequireStaff({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-8 text-center">…</div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (profile?.role !== "admin" && profile?.role !== "front_desk")
    return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-8 text-center">…</div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (profile?.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}
