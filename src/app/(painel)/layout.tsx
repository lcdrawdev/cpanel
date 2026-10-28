import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { AppNav } from "@/components/nav";
import { PRODUCT_NAME } from "@/config";
import { requireAdmin } from "@/server/session";
import { logoutAction } from "../(auth)/actions";

export default function PainelLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="shell">
      {/* The nav reads the current path, which dynamic routes only know at request time. */}
      <Suspense fallback={<nav className="sidebar" aria-label="Menu principal" aria-busy="true" />}>
        <AppNav
          productName={PRODUCT_NAME}
          footer={
            <Suspense fallback={<span className="brand-sub">Carregando…</span>}>
              <SignedInAs />
            </Suspense>
          }
        />
      </Suspense>
      <main className="content" id="conteudo">{children}</main>
    </div>
  );
}

async function SignedInAs() {
  const admin = await requireAdmin();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ minWidth: 0 }}>
        <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>{admin.name}</strong>
        <span className="brand-sub" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{admin.email}</span>
      </div>
      <form action={logoutAction} style={{ marginLeft: "auto" }}>
        <button className="btn btn-on-dark btn-icon" aria-label="Sair" title="Sair">
          <LogOut size={18} />
        </button>
      </form>
    </div>
  );
}
