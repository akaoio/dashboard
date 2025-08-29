/**
 * @akaoio/builder configuration for dashboard
 * Using all core technologies: TUI, Builder, Battle, Composer
 */

export default {
  entry: [
    'src/Dashboard.ts', 
    'src/cli.ts', 
    'src/constants.ts',
    'src/server.ts',
    'src/cli/workrooms-cli.ts',
    'src/services/WorkroomsService.ts'
  ],
  target: 'library',
  formats: ['cjs', 'esm'],
  dts: false,
  sourcemap: true,
  clean: true,
  external: [
    'node:*',
    'readline',
    'commander',
    'blessed',
    'chalk', 
    'ws',
    'uuid',
    '@akaoio/air', 
    '@akaoio/gun'
  ],
  minify: false,
  treeshake: false
};