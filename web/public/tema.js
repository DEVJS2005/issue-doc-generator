// Aplica o tema salvo antes da primeira pintura (evita piscar claro antes do escuro).
// Fica num arquivo, e não embutido no HTML, para a política de conteúdo (CSP) não precisar de
// 'unsafe-inline'.
try {
  var t = localStorage.getItem("idg:tema");
  if (t === "claro") document.documentElement.dataset.theme = "light";
  if (t === "escuro") document.documentElement.dataset.theme = "dark";
} catch {
  // sem armazenamento: segue o tema do sistema
}
