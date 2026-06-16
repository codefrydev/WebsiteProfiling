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
      {
        source: '/overview',
        destination: '/dashboard',
        permanent: true,
      },
      {
        source: '/charts',
        destination: '/dashboard?tab=charts',
        permanent: false,
      },
      {
        source: '/content-studio',
        destination: '/write',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
