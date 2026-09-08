const input = document.getElementById("server-url");
const message = document.getElementById("message");
const button = document.getElementById("connect-button");
window.ppcmConnection.onInfo((info) => {
  input.value = info.url || "";
  message.textContent = info.message;
  message.hidden = !info.message;
  document.getElementById("version").textContent = `v${info.version}`;
});
document
  .getElementById("connection-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    button.disabled = true;
    button.textContent = "Conectando…";
    message.hidden = true;
    try {
      const result = await window.ppcmConnection.connect(input.value);
      if (result.error) {
        message.textContent = result.error;
        message.hidden = false;
      }
    } catch {
      message.textContent = "No se pudo conectar. Inténtalo de nuevo.";
      message.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = "Conectar con mi dashboard";
    }
  });
