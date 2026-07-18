/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @zoi555/geospatial-map ships raw TypeScript (from the independent geospatial-platform repo);
  // Next must transpile it from node_modules.
  transpilePackages: ["@zoi555/geospatial-map"],
};
export default nextConfig;
