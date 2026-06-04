/** @type {import('next').NextConfig} */

const nextConfig = {
  /** Deploy at site root (`/`). Set `basePath` here if you host under a subpath. */
  env: {
    NEXT_PUBLIC_BASE_PATH: '',
  },
  async redirects() {
    return [
      {
        source: '/keywords-explorer',
        destination: '/keywords',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
