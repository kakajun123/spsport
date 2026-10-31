import { createContext, useContext, useState, type ReactNode } from "react";
import { getDemoVenue, setDemoVenue } from "../lib/demo";

interface DemoVenueCtx {
  venue: string;
  setVenue: (v: string) => void;
}

const Ctx = createContext<DemoVenueCtx | null>(null);

export function DemoVenueProvider({ children }: { children: ReactNode }) {
  const [venue, setVenueState] = useState<string>(getDemoVenue());

  const changeVenue = (next: string) => {
    setDemoVenue(next);
    localStorage.setItem("demo-venue", next);
    setVenueState(next);
  };

  return <Ctx.Provider value={{ venue, setVenue: changeVenue }}>{children}</Ctx.Provider>;
}

export function useDemoVenue() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDemoVenue must be used within DemoVenueProvider");
  return ctx;
}
