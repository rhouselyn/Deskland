import {build} from '../../third_party/KuroCat/node_modules/esbuild/lib/main.js';
import {fileURLToPath} from 'node:url';
await build({entryPoints:[fileURLToPath(new URL('preview.ts',import.meta.url))],outfile:fileURLToPath(new URL('../../prototype/pet-preview.js',import.meta.url)),bundle:true,minify:true,format:'iife',loader:{'.png':'dataurl','.webp':'dataurl'},legalComments:'inline'});
