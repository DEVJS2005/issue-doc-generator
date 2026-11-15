// Esqueleto da etapa 1: a tela completa (entrada, saída, copiar, baixar) vem na etapa 4.
export function App() {
  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1>Issue Doc Generator</h1>
      <p>Transforma uma descrição curta numa issue completa e testável, seguindo o ISTQB CTFL v4.0.1.</p>
      <p role="note">
        <strong>
          Não cole dados pessoais reais (usuários, clientes, CPFs). O texto é enviado para processamento por IA.
        </strong>
      </p>
    </main>
  );
}
