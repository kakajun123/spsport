import { lazy, Suspense } from "react";
import { useLocale } from "./context/LocaleContext";
import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { RequireAdmin, RequireAuth, RequireStaff } from "./components/Protected";
import Home from "./pages/Home";
const Auth = lazy(() => import("./pages/Auth"));
const Account = lazy(() => import("./pages/Account"));
const MyBookings = lazy(() => import("./pages/MyBookings"));
const Courses = lazy(() => import("./pages/Courses"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const Dashboard = lazy(() => import("./pages/admin/Dashboard"));
const Bookings = lazy(() => import("./pages/admin/Bookings"));
const Members = lazy(() => import("./pages/admin/Members"));
const Resources = lazy(() => import("./pages/admin/Resources"));
const Settings = lazy(() => import("./pages/admin/Settings"));
const AdminCourses = lazy(() => import("./pages/admin/Courses"));

export default function App() {
  const { locale } = useLocale();
  return (
    <Layout>
      <Suspense fallback={<p role="status">{locale === "zh" ? "正在加载页面…" : "Loading page…"}</p>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/courses" element={<Courses />} />
          <Route path="/login" element={<Auth />} />
          <Route
            path="/my-bookings"
            element={
              <RequireAuth>
                <MyBookings />
              </RequireAuth>
            }
          />
          <Route
            path="/account"
            element={
              <RequireAuth>
                <Account />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireStaff>
                <AdminLayout />
              </RequireStaff>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="bookings" element={<Bookings />} />
            <Route
              path="courses"
              element={
                <RequireAdmin>
                  <AdminCourses />
                </RequireAdmin>
              }
            />
            <Route
              path="members"
              element={
                <RequireAdmin>
                  <Members />
                </RequireAdmin>
              }
            />
            <Route
              path="resources"
              element={
                <RequireAdmin>
                  <Resources />
                </RequireAdmin>
              }
            />
            <Route
              path="settings"
              element={
                <RequireAdmin>
                  <Settings />
                </RequireAdmin>
              }
            />
          </Route>
        </Routes>
      </Suspense>
    </Layout>
  );
}
