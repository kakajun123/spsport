import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// 演示模式：未配置 Supabase 或显式 VITE_DEMO_MODE=true 时，走本地演示数据
export const isDemo = () => !url || import.meta.env.VITE_DEMO_MODE === "true";

if (!url) {
  console.info("[spsport] 未配置 VITE_SUPABASE_URL，运行在演示模式（demo data）");
}

export const supabase = createClient(
  url || "https://demo-placeholder.supabase.co",
  anon || "demo-anon-key"
);
