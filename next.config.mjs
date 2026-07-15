/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @geospatial/map ships raw TypeScript (from the independent geospatial-platform repo);
  // Next must transpile it from node_modules.
  transpilePackages: ["@geospatial/map"],
};
export default nextConfig;
