import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { DataProvider } from "./lib/store";
import { Analysis } from "./pages/Analysis";
import { Catalog } from "./pages/Catalog";
import { Compare } from "./pages/Compare";
import { Dashboard } from "./pages/Dashboard";
import { Family } from "./pages/Family";
import { Layout } from "./pages/Layout";
import { MyBalls } from "./pages/MyBalls";
import { Scores } from "./pages/Scores";
import { Settings } from "./pages/Settings";
import { Strategy } from "./pages/Strategy";

const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || undefined;

export default function App() {
  return (
    <DataProvider>
      <BrowserRouter basename={basename}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="family" element={<Family />} />
            <Route path="balls" element={<MyBalls />} />
            <Route path="catalog" element={<Catalog />} />
            <Route path="compare" element={<Compare />} />
            <Route path="scores" element={<Scores />} />
            <Route path="analysis" element={<Analysis />} />
            <Route path="strategy" element={<Strategy />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </DataProvider>
  );
}
