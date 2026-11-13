import { build } from 'esbuild-wasm';
import { copyFile, mkdir } from 'node:fs/promises';
await mkdir('app/vendor', { recursive: true });
for (const [entry, file] of [['index', 'busabase-sdk'], ['airapp', 'busabase-airapp'], ['airapp-gate', 'busabase-airapp-gate']]) {
  await build({ entryPoints: [`node_modules/busabase-sdk/dist/${entry}.js`], outfile: `app/vendor/${file}.js`, bundle: true, format: 'esm', platform: 'browser', banner: { js: '// @ts-nocheck' } });
}
await copyFile('node_modules/busabase-sdk/dist/airapp-gate.css', 'app/vendor/busabase-airapp-gate.css');
await build({ entryPoints: ['app/js/icons.js'], outfile: 'app/vendor/icons.js', bundle: true, format: 'esm', platform: 'browser' });
