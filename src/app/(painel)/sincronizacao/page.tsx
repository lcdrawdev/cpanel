import type { Metadata } from "next";
import Link from "next/link";
import { Info, ListChecks, RefreshCw } from "lucide-react";
import { Card, CardHead, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Sincronização" };

export default function SyncGuidePage() {
  return (
    <>
      <PageHeader icon={RefreshCw} overline="Sincronização" title="Como funciona a sincronização" integration="info"
        description="Dispositivos participantes compartilham playlists, configurações e favoritos da conta."
        actions={<Link href="/sincronizacao/configuracao" className="btn btn-primary">Configurar</Link>} />
      <div className="grid grid-2">
        <Card>
          <CardHead icon={ListChecks} overline="O que é compartilhado" title="Dados sincronizados" />
          <div className="card-body">
            <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
              <li><strong>Playlists:</strong> as playlists do pool são somadas às playlists de cada participante.</li>
              <li><strong>Configurações:</strong> um perfil escolhido substitui o perfil de cada participante.</li>
              <li><strong>Favoritos:</strong> canais favoritos da TV ao vivo, editáveis aqui ou por qualquer app participante.</li>
            </ul>
          </div>
        </Card>
        <Card>
          <CardHead icon={Info} overline="Como ativar" title="Passo a passo" />
          <div className="card-body">
            <ol className="steps">
              <li><div><strong>Ligue a sincronização</strong><span className="muted">Em Configuração, ative a chave geral e escolha os tipos de dado.</span></div></li>
              <li><div><strong>Escolha os participantes</strong><span className="muted">Marque os dispositivos que entram no compartilhamento.</span></div></li>
              <li><div><strong>Monte o conteúdo</strong><span className="muted">Em Dados sincronizados, escolha as playlists e os favoritos.</span></div></li>
            </ol>
            <p className="muted" style={{ marginBottom: 0 }}>Dispositivos fora da sincronização continuam só com o próprio perfil, playlists e grupo.</p>
          </div>
        </Card>
      </div>
    </>
  );
}
