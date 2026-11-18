import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

// O jsdom não implementa URL.createObjectURL (prévia dos anexos): uma versão mínima.
if (!URL.createObjectURL) {
  let n = 0;
  URL.createObjectURL = () => `blob:teste/${++n}`;
  URL.revokeObjectURL = () => {};
}

// O jsdom não implementa showModal/close do <dialog>: o mínimo para os testes.
const proto = HTMLDialogElement.prototype;
if (!proto.showModal) {
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}
