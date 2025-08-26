/**
 * @akaoio/builder configuration for dashboard
 * Using all core technologies: TUI, Builder, Battle, Composer
 */

export default {
  entry: ['src/Dashboard.ts', 'src/cli.ts', 'src/constants.ts'],
  target: 'library',
  formats: ['cjs', 'esm'],
  dts: false,
  sourcemap: true,
  clean: true,
  external: [
    'node:*',
    'readline',
    'commander',
    '@akaoio/tui',
    '@akaoio/air', 
    '@akaoio/gun'
  ],
  minify: false,
  treeshake: false
};