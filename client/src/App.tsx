import { useState } from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import { LayoutDashboard, Link2, Send, History, MessageSquare, KeyRound, LogOut } from "lucide-react";
import Dashboard from "./pages/Dashboard";
import Conectar from "./pages/Conectar";
import NovaCampanha from "./pages/NovaCampanha";
import Historico from "./pages/Historico";
import ExtratorGoogle from "./pages/ExtratorGoogle";
import ApiGoogle from "./pages/ApiGoogle";
import Login from "./pages/Login";
import { TOKEN_STORAGE_KEY } from "./api";

const ICON_NOVA_CAMPANHA =
  "https://png.pngtree.com/element_our/sm/20180626/sm_5b321c98efaa6.jpg";
const ICON_GOOGLE_MAPS =
  "https://png.pngtree.com/png-clipart/20230916/original/pngtree-google-map-icon-vector-png-image_12256715.png";

type NavItemProps = {
  to: string;
  label: string;
  icon?: React.ReactNode;
  img?: string;
};

function NavItem({ to, label, icon, img }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
          isActive
            ? "bg-accent/15 text-accent-light"
            : "text-gray-400 hover:bg-bg-card hover:text-white"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="nav-active-bar absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-full bg-accent" />
          )}
          {img ? (
            <img src={img} alt="" className="w-4 h-4 rounded object-contain" />
          ) : (
            <span className="w-4 h-4 flex items-center justify-center">{icon}</span>
          )}
          <span className="relative z-10">{label}</span>
        </>
      )}
    </NavLink>
  );
}

function App() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_STORAGE_KEY)
  );

  if (!token) {
    return (
      <Login
        onAuthed={(t) => {
          localStorage.setItem(TOKEN_STORAGE_KEY, t);
          setToken(t);
        }}
      />
    );
  }

  function logout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
  }

  return (
    <div className="min-h-screen bg-bg-primary flex">
      <div className="noise-overlay" aria-hidden />

      {/* Sidebar */}
      <nav className="relative z-10 w-64 bg-bg-secondary border-r border-gray-800 flex flex-col p-4">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="logo-pulse w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-accent-light" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Zapizapi</h1>
            <p className="text-xs text-gray-500">Meus Envios</p>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <NavItem to="/" label="Dashboard" icon={<LayoutDashboard className="w-4 h-4" />} />
          <NavItem to="/conectar" label="Conectar" icon={<Link2 className="w-4 h-4" />} />
          <NavItem
            to="/nova-campanha"
            label="Nova Campanha"
            img={ICON_NOVA_CAMPANHA}
          />
          <NavItem to="/historico" label="Histórico" icon={<History className="w-4 h-4" />} />
          <NavItem
            to="/extrator-maps"
            label="Extrator Maps"
            img={ICON_GOOGLE_MAPS}
          />
          <NavItem to="/api-google" label="API Google" icon={<KeyRound className="w-4 h-4" />} />
        </div>

        <button
          onClick={logout}
          className="mt-auto flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-bg-card hover:text-white transition-all"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </nav>

      {/* Conteúdo principal */}
      <main className="relative z-10 flex-1 p-8 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/conectar" element={<Conectar />} />
          <Route path="/nova-campanha" element={<NovaCampanha />} />
          <Route path="/historico" element={<Historico />} />
          <Route path="/extrator-maps" element={<ExtratorGoogle />} />
          <Route path="/api-google" element={<ApiGoogle />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
