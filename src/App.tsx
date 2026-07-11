import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { DataProvider } from "./lib/store";
import { Analysis } from "./pages/Analysis";
import { Catalog } from "./pages/Catalog";
import { Dashboard } from "./pages/Dashboard";
import { Layout } from "./pages/Layout";
import { MyBalls } from "./pages/MyBalls";
import { Scores } from "./pages/Scores";
import { Settings } from "./pages/Settings";
import { Strategy } from "./pages/Strategy";

export default function App() {
  return (
    <DataProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="balls" element={<MyBalls />} />
            <Route path="catalog" element={<Catalog />} />
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
