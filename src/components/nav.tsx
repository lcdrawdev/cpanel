"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Bell, ChevronRight, Cloud, Flag, Palette, LayoutDashboard, Menu, MonitorSmartphone, RefreshCw, Server, UserCog, X, type LucideIcon,
} from "lucide-react";

type Item = { href: string; label: string; demo?: boolean };
type Group = { label: string; icon: LucideIcon; href?: string; items?: Item[] };

// Information architecture of the reference panel (MAPA_DE_TELAS, "Estrutura de navegação").
// `demo` marks sections that exist only as interface for now.
export const NAV: Group[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "Conta", icon: UserCog, items: [{ href: "/conta", label: "Configurações" }, { href: "/conta/assinatura", label: "Assinatura", demo: true }] },
  {
    label: "Sincronização",
    icon: RefreshCw,
    items: [
      { href: "/sincronizacao", label: "Como funciona" },
      { href: "/sincronizacao/configuracao", label: "Configuração" },
      { href: "/sincronizacao/dados", label: "Dados sincronizados" },
    ],
  },
  {
    label: "Gestão na nuvem",
    icon: Cloud,
    items: [
      { href: "/gestao", label: "Como funciona" },
      { href: "/dispositivos", label: "Dispositivos" },
      { href: "/snapshots", label: "Snapshots" },
      { href: "/grupos", label: "Grupos" },
      { href: "/codigos", label: "Códigos de ativação" },
      { href: "/perfis", label: "Perfis de configuração" },
      { href: "/portais", label: "Portais e playlists" },
      { href: "/esportes", label: "Esportes" },
      { href: "/gestao/configuracoes", label: "Políticas da conta" },
      { href: "/manutencao", label: "Modo manutenção" },
    ],
  },
  {
    label: "App da TV",
    icon: Palette,
    items: [
      { href: "/aparencia", label: "Aparência e início" },
      { href: "/capas", label: "Capas e logos" },
      { href: "/avisos", label: "Avisos" },
      { href: "/atualizacoes", label: "Atualizações" },
    ],
  },
  { label: "Portal pré-definido", icon: Server, items: [{ href: "/portal-predefinido", label: "Configuração" }] },
  { label: "Reportes de canais", icon: Flag, href: "/reportes" },
];

function matches(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

const ALL_HREFS = NAV.flatMap((g) => (g.href ? [g.href] : g.items!.map((i) => i.href)));

/** Only the most specific match is active, so "/gestao" is not lit on "/gestao/configuracoes". */
function activeHref(pathname: string) {
  return ALL_HREFS.filter((h) => matches(pathname, h)).sort((a, b) => b.length - a.length)[0];
}

export function AppNav({ productName, footer }: { productName: string; footer: ReactNode }) {
  const pathname = usePathname();
  const current = activeHref(pathname);
  const isActive = (_: string, href: string) => href === current;
  const [open, setOpen] = useState(false);
  // The groups containing the current page start expanded.
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NAV.map((g) => [g.label, Boolean(g.items?.some((i) => isActive(pathname, i.href)))])),
  );

  // Close the drawer after navigating (state adjusted during render, no effect needed).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="topbar">
        <Link href="/" className="brand" style={{ padding: 0 }}>
          <span className="brand-mark" aria-hidden="true"><MonitorSmartphone size={20} /></span>
          <span className="brand-name">{productName}</span>
        </Link>
        <button className="btn btn-on-dark btn-icon" aria-label="Abrir menu" aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen(true)}>
          <Menu size={20} />
        </button>
      </div>
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <nav id="sidebar" className={`sidebar${open ? " open" : ""}`} aria-label="Menu principal">
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden="true"><MonitorSmartphone size={20} /></span>
            <span className="brand-name">{productName}<span className="brand-sub">Painel administrativo</span></span>
          </Link>
          {open && (
            <button className="btn btn-on-dark btn-icon" style={{ marginLeft: "auto" }} aria-label="Fechar menu" onClick={() => setOpen(false)}>
              <X size={20} />
            </button>
          )}
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {NAV.map((g) => {
            const Icon = g.icon;
            if (g.href) {
              return (
                <li key={g.label} className="nav-group">
                  <Link href={g.href} className="nav-link" aria-current={isActive(pathname, g.href) ? "page" : undefined}>
                    <Icon size={18} aria-hidden="true" />
                    {g.label}
                  </Link>
                </li>
              );
            }
            const id = `nav-${g.label}`;
            return (
              <li key={g.label} className="nav-group">
                <button className="nav-toggle" aria-expanded={expanded[g.label]} aria-controls={id} onClick={() => setExpanded((s) => ({ ...s, [g.label]: !s[g.label] }))}>
                  <Icon size={18} aria-hidden="true" />
                  {g.label}
                  <ChevronRight size={16} className="chev" aria-hidden="true" />
                </button>
                <ul id={id} className="nav-sub" hidden={!expanded[g.label]}>
                  {g.items!.map((i) => (
                    <li key={i.href}>
                      <Link href={i.href} className="nav-link" aria-current={isActive(pathname, i.href) ? "page" : undefined}>
                        {i.label}
                        {i.demo && <span className="nav-tag" title="Tela demonstrativa">demo</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
        <div className="sidebar-foot">{footer}</div>
      </nav>
    </>
  );
}
