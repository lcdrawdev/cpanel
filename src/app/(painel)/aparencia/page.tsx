import type { Metadata } from "next";
import { Suspense } from "react";
import { Clapperboard, Image as ImageIcon, LayoutTemplate, Palette, Trophy } from "lucide-react";
import { Alert, Card, CardHead, Kpi, PageHeader, SkeletonCard } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/session";
import { getAccountSettings } from "@/server/services/account-settings";
import { brandingConfig } from "@/server/services/app-appearance";
import { saveAppearanceAction } from "../actions";

export const metadata: Metadata = { title: "Aparência e início do app" };

export default function AppearancePage() {
  return (
    <>
      <PageHeader
        icon={Palette}
        overline="App da TV"
        title="Aparência e início"
        description="Logo, nome e o que aparece no menu e na tela inicial do app. Os aparelhos atualizam sozinhos ao salvar."
        integration="connected"
      />
      <Suspense fallback={<SkeletonCard rows={8} />}>
        <Appearance />
      </Suspense>
    </>
  );
}

async function Appearance() {
  await requireAdmin();
  const s = await getAccountSettings(await getDb());
  const b = brandingConfig(s);
  return (
    <ActionForm action={saveAppearanceAction}>
      <div className="grid grid-kpi">
        <Kpi label="Logo" value={b.logoPath ? "Enviado" : "Padrão"} hint="topo do app" />
        <Kpi label="Programação em alta" value={b.home.trending ? "Ativa" : s.tmdbKey ? "Desligada" : "Sem chave"} hint="TMDB" color={b.home.trending ? "var(--color-green-500)" : undefined} />
        <Kpi label="Palavras de esporte" value={s.sportsGroupKeywords.length} hint="seção Sport" />
      </div>

      <Card>
        <CardHead icon={ImageIcon} overline="Marca" title="Logo e nome" description="Aparecem no canto superior esquerdo do app." />
        <div className="card-body">
          <div className="form-row">
            <div className="field">
              <label htmlFor="appName">Nome do app</label>
              <input id="appName" name="appName" className="input" maxLength={40} defaultValue={s.appName} placeholder="Ex.: SFL miTV" />
              <p className="hint">Em branco, o app usa o apelido da conta.</p>
            </div>
            <div className="field">
              <label htmlFor="logo">Logo (PNG, JPG ou WebP, até 512 KB)</label>
              <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="input" />
              <p className="hint">Prefira PNG com fundo transparente. Em branco mantém o atual.</p>
            </div>
          </div>
          {b.logoPath && (
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.logoPath} alt="Logo atual" style={{ height: 64, background: "var(--color-navy-900, #15192A)", borderRadius: 8, padding: 8 }} />
              <label className="setting" style={{ cursor: "pointer", flex: 1 }}>
                <span className="s-text"><strong>Remover logo</strong><span>Volta para o ícone padrão.</span></span>
                <input type="checkbox" className="switch" name="removeLogo" />
              </label>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHead icon={LayoutTemplate} overline="Início" title="Menu e tela inicial" description="Início, TV ao vivo, Filmes e Séries aparecem sempre (Filmes e Séries quando a lista oferece)." />
        <div className="card-body">
          <label className="setting" style={{ cursor: "pointer" }}>
            <span className="s-text"><strong>Favoritos</strong><span>Item no menu e fileira na tela inicial (precisa da sincronização de favoritos ativa).</span></span>
            <input type="checkbox" className="switch" name="homeShowFavorites" defaultChecked={s.homeShowFavorites} />
          </label>
          <label className="setting" style={{ cursor: "pointer" }}>
            <span className="s-text"><strong>Sport</strong><span>Item no menu com os canais de esporte e jogos do dia.</span></span>
            <input type="checkbox" className="switch" name="homeShowSport" defaultChecked={s.homeShowSport} />
          </label>
          <label className="setting" style={{ cursor: "pointer" }}>
            <span className="s-text"><strong>Programação em alta</strong><span>Fileira com o que está em alta no TMDB; ao abrir, o app procura o título na lista do usuário.</span></span>
            <input type="checkbox" className="switch" name="homeShowTrending" defaultChecked={s.homeShowTrending} />
          </label>
        </div>
      </Card>

      <Card>
        <CardHead icon={Clapperboard} overline="TMDB" title="Programação em alta" description="Filmes, séries e animes em alta na semana, com capa, sinopse e nota." />
        <div className="card-body">
          {!s.tmdbKey && <Alert tone="info">Crie uma conta grátis em themoviedb.org, vá em Configurações › API e cole aqui a chave de API (v3) ou o token de leitura (v4).</Alert>}
          <div className="form-row">
            <div className="field">
              <label htmlFor="tmdbKey">Chave do TMDB</label>
              <input id="tmdbKey" name="tmdbKey" type="password" className="input" autoComplete="off" placeholder={s.tmdbKey ? "Configurada (em branco mantém)" : "Cole a chave aqui"} />
              <p className="hint">Fica guardada criptografada e nunca vai para os aparelhos. Ao salvar, o painel testa a chave.</p>
            </div>
            <div className="field">
              <label htmlFor="tmdbLanguage">Idioma dos títulos e sinopses</label>
              <select id="tmdbLanguage" name="tmdbLanguage" className="input" defaultValue={s.tmdbLanguage}>
                <option value="pt-BR">Português (Brasil)</option>
                <option value="pt-PT">Português (Portugal)</option>
                <option value="es-ES">Espanhol</option>
                <option value="en-US">Inglês</option>
              </select>
            </div>
          </div>
          {s.tmdbKey && (
            <label className="setting" style={{ cursor: "pointer" }}>
              <span className="s-text"><strong>Remover chave</strong><span>A fileira Programação em alta some do app.</span></span>
              <input type="checkbox" className="switch" name="removeTmdbKey" />
            </label>
          )}
        </div>
      </Card>

      <Card>
        <CardHead icon={Trophy} overline="Sport" title="Grupos de esporte" description="Canais cujo grupo contém uma destas palavras aparecem na seção Sport do app." />
        <div className="card-body">
          <div className="field">
            <label htmlFor="sportsGroupKeywords">Palavras (separadas por vírgula)</label>
            <textarea id="sportsGroupKeywords" name="sportsGroupKeywords" className="input" rows={3} defaultValue={s.sportsGroupKeywords.join(", ")} />
            <p className="hint">Maiúsculas e minúsculas tanto faz. Ex.: ESPORTE, JOGOS DO DIA, PREMIERE.</p>
          </div>
        </div>
      </Card>

      <div className="form-actions"><SubmitButton>Salvar aparência</SubmitButton></div>
    </ActionForm>
  );
}
