/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL: string;
  readonly VITE_RUNTIME_CONTRACT_E2E_BYPASS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
