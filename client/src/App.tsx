import { useState, ReactNode } from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Link2,
  Send,
  History,
  MessageSquare,
  LogOut,
  Menu,
  X,
  Settings,
} from "lucide-react";
import Dashboard from "./pages/Dashboard";
import Conectar from "./pages/Conectar";
import NovaCampanha from "./pages/NovaCampanha";
import Historico from "./pages/Historico";
import ExtratorGoogle from "./pages/ExtratorGoogle";
import Configuracoes from "./pages/Configuracoes";
import Login from "./pages/Login";
import { TOKEN_STORAGE_KEY } from "./api";

const ICON_NOVA_CAMPANHA =
  "https://png.pngtree.com/element_our/sm/20180626/sm_5b321c98efaa6.jpg";
const ICON_GOOGLE_MAPS =
  "https://png.pngtree.com/png-clipart/20230916/original/pngtree-google-map-icon-vector-png-image_12256715.png";

type NavItemProps = {
  to: string;
  label: string;
  icon?: ReactNode;
  img?: string;
  onClick?: () => void;
};

function NavItem({ to, label, icon, img, onClick }: NavItemProps) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
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

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" /> },
  { to: "/conectar", label: "Conectar", icon: <Link2 className="w-4 h-4" /> },
  { to: "/nova-campanha", label: "Nova Campanha", img: ICON_NOVA_CAMPANHA },
  { to: "/historico", label: "Histórico", icon: <History className="w-4 h-4" /> },
  { to: "/extrator-maps", label: "Extrator Maps", img: ICON_GOOGLE_MAPS },
  { to: "/configuracoes", label: "Configurações", icon: <Settings className="w-4 h-4" /> },
];

function SidebarContent({
  onLogout,
  onNavigate,
}: {
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
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
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.to}
            to={item.to}
            label={item.label}
            icon={item.icon}
            img={item.img}
            onClick={onNavigate}
          />
        ))}
      </div>

      <button
        onClick={onLogout}
        className="mt-auto flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-bg-card hover:text-white transition-all"
      >
        <LogOut className="w-4 h-4" />
        Sair
      </button>
    </>
  );
}

function App() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_STORAGE_KEY)
  );
  const [menuOpen, setMenuOpen] = useState(false);

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

      {/* Sidebar (desktop) */}
      <nav className="relative z-10 w-64 bg-bg-secondary border-r border-gray-800 flex-col p-4 hidden md:flex">
        <SidebarContent onLogout={logout} />
      </nav>

      {/* Topbar (mobile) */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-bg-secondary border-b border-gray-800 h-14 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="logo-pulse w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-accent-light" />
          </div>
          <span className="text-white font-bold">Zapizapi</span>
        </div>
        <button onClick={() => setMenuOpen(true)} className="text-gray-300 p-1" aria-label="Abrir menu">
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Drawer (mobile) */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMenuOpen(false)} />
          <nav className="absolute left-0 top-0 bottom-0 w-64 bg-bg-secondary border-r border-gray-800 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-6 px-2">
              <span className="text-white font-semibold">Menu</span>
              <button onClick={() => setMenuOpen(false)} className="text-gray-400 p-1" aria-label="Fechar menu">
                <X className="w-5 h-5" />
              </button>
            </div>
            <SidebarContent
              onLogout={() => {
                setMenuOpen(false);
                logout();
              }}
              onNavigate={() => setMenuOpen(false)}
            />
          </nav>
        </div>
      )}

      {/* Conteúdo principal */}
      <main className="relative z-10 flex-1 p-4 md:p-8 pt-20 md:pt-8 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/conectar" element={<Conectar />} />
          <Route path="/nova-campanha" element={<NovaCampanha />} />
          <Route path="/historico" element={<Historico />} />
          <Route path="/extrator-maps" element={<ExtratorGoogle />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
