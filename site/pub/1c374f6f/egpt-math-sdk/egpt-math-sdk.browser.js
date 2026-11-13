import { createEgptMathSdk } from "./index.js";

if (typeof window !== "undefined") {
  window.EgptMathSdk = { createEgptMathSdk };
}
