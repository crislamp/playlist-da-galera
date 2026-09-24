// Service worker mínimo — habilita "adicionar à tela de início" (PWA).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {}); // pass-through (só a presença já habilita o install)
