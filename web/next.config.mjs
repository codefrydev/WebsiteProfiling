/** @type {import('next').NextConfig} */

const nextConfig = {
  /** Deploy at site root (`/`). Set `basePath` here if you host under a subpath. */
  env: {
    NEXT_PUBLIC_BASE_PATH: '',
  },
  /** sql.js loads native wasm from its package on the server */
  serverExternalPackages: ['sql.js'],
};

export default nextConfig;
