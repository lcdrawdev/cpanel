import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidade — SFL Player",
  description: "Política de privacidade do aplicativo SFL Player (reprodutor de mídia para TV e celular).",
};

/** Página pública exigida pelas lojas (Google Play/Amazon). Acessível sem login, indexável. */
export default function PrivacidadePage() {
  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "48px 24px 80px", lineHeight: 1.6 }}>
      <h1 style={{ marginBottom: 4 }}>Política de Privacidade</h1>
      <p className="muted" style={{ marginTop: 0 }}>Aplicativo <strong>SFL Player</strong> · Última atualização: 31 de outubro de 2026</p>

      <section>
        <h2>1. Sobre o aplicativo</h2>
        <p>
          O SFL Player é um <strong>reprodutor de mídia</strong> (player) para Android TV, Fire TV e
          dispositivos móveis. O aplicativo <strong>não fornece, não hospeda e não vende</strong> canais,
          listas, IPTV ou arquivos M3U. O conteúdo reproduzido é adicionado e é de total responsabilidade
          do usuário.
        </p>
      </section>

      <section>
        <h2>2. Dados que coletamos</h2>
        <ul>
          <li><strong>Identificador do aparelho</strong> (por exemplo, endereço MAC / Device ID): usado para ativar e identificar o dispositivo.</li>
          <li><strong>Informações técnicas</strong> do app e do aparelho: versão do aplicativo, modelo e status de conexão, usadas para suporte e funcionamento.</li>
          <li><strong>Listas e credenciais de acesso</strong> que você ou o seu revendedor cadastra: armazenadas de forma criptografada e usadas apenas para reproduzir o conteúdo que você adicionou.</li>
          <li><strong>Preferências e histórico de reprodução</strong>: guardados no próprio aparelho e, caso você ative a sincronização, no servidor do seu revendedor, para recursos como “continuar assistindo” e favoritos.</li>
        </ul>
      </section>

      <section>
        <h2>3. Como usamos os dados</h2>
        <p>
          Utilizamos os dados para ativar e manter o aparelho funcionando, oferecer os recursos do
          aplicativo, prestar suporte e avisar sobre atualizações do app e o vencimento do plano.
          <strong> Não usamos seus dados para anúncios.</strong>
        </p>
      </section>

      <section>
        <h2>4. Compartilhamento</h2>
        <p>
          <strong>Não vendemos seus dados.</strong> Utilizamos serviços de terceiros apenas para
          informações complementares de catálogo (por exemplo, o TMDB para capas e sinopses, e provedores
          de dados esportivos para escudos e tabelas). O aplicativo <strong>não utiliza redes de anúncios
          nem rastreadores</strong> de terceiros.
        </p>
      </section>

      <section>
        <h2>5. Segurança</h2>
        <p>
          As credenciais de listas são armazenadas de forma criptografada e a comunicação com o painel é
          feita por conexão segura (HTTPS).
        </p>
      </section>

      <section>
        <h2>6. Retenção e exclusão</h2>
        <p>
          Mantemos os dados do aparelho enquanto ele estiver ativo. Você pode solicitar a remoção dos seus
          dados entrando em contato com o seu revendedor/suporte ou desativando o aparelho no aplicativo.
        </p>
      </section>

      <section>
        <h2>7. Crianças</h2>
        <p>
          O aplicativo não é direcionado a crianças. Há um recurso de <strong>controle dos pais</strong>
          {" "}para proteger pastas de conteúdo adulto.
        </p>
      </section>

      <section>
        <h2>8. Seus direitos (LGPD)</h2>
        <p>
          Nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você pode solicitar acesso,
          correção ou exclusão dos seus dados pelo contato abaixo.
        </p>
      </section>

      <section>
        <h2>9. Alterações nesta política</h2>
        <p>
          Esta política pode ser atualizada periodicamente. A data no topo indica a versão mais recente.
        </p>
      </section>

      <section>
        <h2>10. Contato</h2>
        <p>
          Dúvidas sobre esta política ou sobre seus dados: <strong>contato@sflgrupo.store</strong>.
        </p>
      </section>
    </main>
  );
}
